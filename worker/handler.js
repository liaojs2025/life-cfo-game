import { PROVIDERS, PUBLIC_RELAY_ORIGIN, OUTPUT_TOKEN_LIMITS, outputTokenField } from '../dist/providers.js';
import { readChatStream, StreamError } from './stream.js';

const MAX_REQUEST = 160000, MAX_RESPONSE = 200000;
const ALLOWED_ORIGINS = new Set([PUBLIC_RELAY_ORIGIN, 'https://liaojs2025.github.io', 'http://127.0.0.1:4173', 'http://localhost:4173']);
const responseHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
class BodySizeError extends Error {}

async function boundedText(stream, limit) {
  if (!stream) return '';
  const reader = stream.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new BodySizeError('size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(result);
}

// Only enum labels leave this diagnostic boundary; provider text is never returned.
function upstreamReason(parsed) {
  const detail = [parsed?.error?.code, parsed?.error?.type, parsed?.error?.message, parsed?.message]
    .filter(value => typeof value === 'string').join(' ').slice(0, 8000);
  if (/unsupported[_ ](?:parameter|value)|not support|不支持/i.test(detail)) return 'parameter';
  if (/insufficient[_ ]quota|quota.*exceed|余额不足|额度不足/i.test(detail)) return 'quota';
  if (/rate.?limit|too many requests|请求频繁/i.test(detail)) return 'rate_limit';
  if (/overload|capacity|no.*available.*channel|no available|无可用|渠道/i.test(detail)) return 'capacity';
  if (/invalid[_ ]api[_ ]key|authentication|unauthorized|密钥无效/i.test(detail)) return 'credential';
  if (/content[_ ]filter|content policy|内容审核/i.test(detail)) return 'policy';
  if (/timed? ?out|timeout|超时/i.test(detail)) return 'timeout';
  return 'unknown';
}

// Operational diagnostics contain no request body, credentials, cookies or provider text.
export function upstreamDiagnostic(upstream, text, key, elapsedMs) {
  const safeId = (name, pattern) => {
    const value = upstream.headers.get(name) || '';
    return pattern.test(value) && !value.includes(key) ? value : null;
  };
  const contentType = upstream.headers.get('Content-Type') || '';
  return {
    event: 'ai_upstream_failure', status: upstream.status, elapsedMs,
    contentType: /application\/json/i.test(contentType) ? 'json' : /text\/html/i.test(contentType) ? 'html' : /text\/plain/i.test(contentType) ? 'text' : 'other',
    cloudflareError: upstream.headers.has('cf-error-type') || upstream.headers.has('cf-error-origin'),
    errorType: safeId('cf-error-type', /^(?:1\d{3}|52[0-9x])$/),
    ray: safeId('cf-ray', /^[a-f0-9]{16}(?:-[A-Z]{3})?$/),
    providerRequestId: safeId('x-oneapi-request-id', /^\d{20,40}$/),
    bodyKind: !text.trim() ? 'empty' : /Request Rejected|requested URL was rejected/i.test(text) ? 'request_rejected'
      : /cloudflare|error code: 520/i.test(text) ? 'cloudflare' : 'other',
  };
}

// Runtime error messages may contain URLs or secrets; report fixed categories only.
export function transportReason(cause) {
  const codes = [cause?.code, cause?.cause?.code, ...(Array.isArray(cause?.cause?.errors) ? cause.cause.errors.map(error => error?.code) : [])];
  const groups = [
    ['dns', ['ENOTFOUND', 'EAI_AGAIN']],
    ['connect_timeout', ['UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT']],
    ['connection_reset', ['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET']],
    ['connection_refused', ['ECONNREFUSED']],
    ['tls', ['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT']],
  ];
  return groups.find(([, values]) => codes.some(code => values.includes(code)))?.[0] || 'unknown';
}

/** Stateless, fixed-provider relay. Credentials only live for this request. */
export async function relay(request, upstreamFetch = fetch) {
  const origin = request.headers.get('Origin');
  const trusted = ALLOWED_ORIGINS.has(origin);
  const headers = { ...responseHeaders, ...(trusted ? { 'Access-Control-Allow-Origin': origin } : {}) };
  const error = (status, code, extra = {}, diagnostics = {}) => new Response(JSON.stringify({ error: { code, ...extra } }), { status, headers: { ...headers, ...diagnostics } });
  if (!trusted) return error(403, 'origin_rejected');
  if (request.method === 'OPTIONS') {
    const requested = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
    if (request.headers.get('Access-Control-Request-Method') !== 'POST' || requested.some(x => x !== 'content-type')) return error(403, 'preflight_rejected');
    return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } });
  }
  if (request.method !== 'POST') return error(405, 'method_rejected');
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return error(415, 'json_required');
  if (Number(request.headers.get('Content-Length')) > MAX_REQUEST) return error(413, 'request_too_large');
  let envelope;
  try { envelope = JSON.parse(await boundedText(request.body, MAX_REQUEST)); }
  catch { return error(400, 'invalid_json'); }
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(envelope) || Object.keys(envelope).some(key => !['provider','apiKey','request'].includes(key))) return error(400, 'unsupported_request');
  const provider = PROVIDERS.find(item => item.id === envelope.provider);
  if (!provider) return error(400, 'unsupported_provider');
  const key = envelope.apiKey;
  if (typeof key !== 'string' || !/^[^\s\r\n]{1,4096}$/.test(key)) return error(401, 'missing_credential');
  const body = envelope.request;
  const allowed = new Set(['model','temperature','stream','response_format','messages','max_tokens','max_completion_tokens','thinking']);
  if (!isObject(body) || Object.keys(body).some(key => !allowed.has(key))
    || typeof body.model !== 'string' || body.model.length > 200 || !body.model.trim()
    || body.stream !== false || ('temperature' in body && body.temperature !== 0)
    || ('response_format' in body && (!isObject(body.response_format) || body.response_format.type !== 'json_object' || Object.keys(body.response_format).length !== 1))
    || !Array.isArray(body.messages) || body.messages.length !== 2
    || body.messages.some((message, index) => !isObject(message) || Object.keys(message).some(key => !['role','content'].includes(key)) || message.role !== (index ? 'user' : 'system')
      || typeof message.content !== 'string' || message.content.length > 80000)) return error(400, 'unsupported_request');
  const tokenField = outputTokenField(provider.id, body.model);
  const otherTokenField = tokenField === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
  if (Object.hasOwn(body, otherTokenField)
    || Object.hasOwn(body, tokenField) && (!Number.isInteger(body[tokenField]) || body[tokenField] < 1 || body[tokenField] > OUTPUT_TOKEN_LIMITS.persona)
    || Object.hasOwn(body, 'thinking') && (provider.id !== 'deepseek' || !isObject(body.thinking)
      || body.thinking.type !== 'disabled' || Object.keys(body.thinking).length !== 1)) return error(400, 'unsupported_request');
  // Old browser tabs receive a bounded default during a rolling deployment.
  // Neither optional-parameter compatibility nor transport recovery removes it.
  const boundedBody = { ...body, [tokenField]: body[tokenField] ?? OUTPUT_TOKEN_LIMITS.decision,
    ...(provider.id === 'deepseek' ? { thinking: { type: 'disabled' } } : {}) };
  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 55000);
  const startedAt = Date.now();
  let phase = 'headers';
  try {
    if (request.signal?.aborted) return error(499, 'cancelled');
    // Receive EFUND output incrementally, then validate one complete response.
    // This changes transport only; the browser still receives ordinary JSON.
    const useStream = provider.id === 'efund';
    const upstream = await upstreamFetch.call(globalThis, provider.endpoint, {
      method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: useStream ? 'text/event-stream, application/json' : 'application/json', 'Accept-Encoding': 'identity',
        Authorization: `Bearer ${key}`, 'Cache-Control': 'no-store' },
      body: JSON.stringify(useStream ? { ...boundedBody, stream: true } : boundedBody),
    });
    phase = 'body';
    if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); return error(502, 'redirect_rejected'); }
    const isStream = useStream && upstream.ok && /^text\/event-stream(?:;|$)/i.test(upstream.headers.get('Content-Type') || '');
    if (Number(upstream.headers.get('Content-Length')) > (isStream ? 2000000 : MAX_RESPONSE)) { await upstream.body?.cancel(); return error(502, 'response_too_large'); }
    const text = isStream ? await readChatStream(upstream.body, { limit: MAX_RESPONSE, wireLimit: 2000000, signal: controller.signal })
      : await boundedText(upstream.body, MAX_RESPONSE);
    if (controller.signal.aborted) return error(504, 'timeout');
    if (upstream.status >= 500) console.warn(JSON.stringify(upstreamDiagnostic(upstream, text, key, Date.now() - startedAt)));
    let parsed;
    try { parsed = JSON.parse(text); } catch { return error(!upstream.ok && [400,401,403,404,429].includes(upstream.status) ? upstream.status : 502, upstream.ok ? 'invalid_response' : [401,403].includes(upstream.status) ? 'upstream_auth' : upstream.status === 429 ? 'upstream_quota' : 'upstream_error', { upstreamStatus: upstream.status, upstreamReason: 'non_json' }); }
    if (text.includes(key) || JSON.stringify(parsed).includes(key)) return error(502, 'unsafe_response');
    if (!upstream.ok) {
      // Recognize only two compatibility errors; never reflect provider text.
      const detail = String(parsed?.error?.message || parsed?.message || '');
      const parameter = ['response_format','temperature'].find(name => (parsed?.error?.code === 'unsupported_parameter' && (parsed.error.param === name || parsed.error.parameter === name)) || (detail.includes(name) && /unsupported|not.support|not.allowed|only.*support|不支持/i.test(detail)));
      if (upstream.status === 400 && parameter) return error(400, 'unsupported_parameter', { parameter });
      return error([400,401,403,404,429].includes(upstream.status) ? upstream.status : 502,
        [401,403].includes(upstream.status) ? 'upstream_auth' : upstream.status === 429 ? 'upstream_quota' : upstream.status === 404 ? 'model_or_endpoint_missing' : 'upstream_error', { upstreamStatus: upstream.status, upstreamReason: upstreamReason(parsed) });
    }
    return new Response(text, { headers });
  } catch (cause) {
    if (!controller.signal.aborted && cause instanceof BodySizeError) return error(502, 'response_too_large');
    if (!controller.signal.aborted && cause instanceof StreamError) {
      console.warn(JSON.stringify({ event: 'ai_stream_failure', code: cause.code, reason: cause.reason, elapsedMs: Date.now() - startedAt }));
      return error(cause.code === 'timeout' ? 504 : 502, cause.code, {}, { 'X-AI-Stream-Reason': cause.reason });
    }
    const reason = controller.signal.aborted ? 'timeout' : transportReason(cause);
    console.warn(JSON.stringify({ event: 'ai_transport_failure', reason, phase, elapsedMs: Date.now() - startedAt }));
    return error(controller.signal.aborted ? 504 : 502, controller.signal.aborted ? 'timeout' : 'upstream_connection', { upstreamReason: reason, upstreamPhase: phase });
  } finally { clearTimeout(timeout); request.signal?.removeEventListener('abort', cancel); }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ai') return relay(request);
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const asset = Object.hasOwn(ASSET_MAP, pathname) ? ASSET_MAP[pathname] : null;
    if (!asset) return new Response('Not found', { status: 404 });
    const [mime, encoded] = asset;
    const bytes = request.method === 'HEAD' ? null : Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    return new Response(bytes, { headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
  },
};
