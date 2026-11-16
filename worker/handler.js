import { PROVIDERS, PUBLIC_RELAY_ORIGIN } from '../dist/providers.js';

const MAX_REQUEST = 160000, MAX_RESPONSE = 200000;
const ALLOWED_ORIGINS = new Set([PUBLIC_RELAY_ORIGIN, 'https://liaojs2025.github.io', 'http://127.0.0.1:4173', 'http://localhost:4173']);
const responseHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };

async function boundedText(stream, limit) {
  if (!stream) return '';
  const reader = stream.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new Error('size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(result);
}

/** Stateless, fixed-provider relay. Credentials only live for this request. */
export async function relay(request, upstreamFetch = fetch) {
  const origin = request.headers.get('Origin');
  const trusted = ALLOWED_ORIGINS.has(origin);
  const headers = { ...responseHeaders, ...(trusted ? { 'Access-Control-Allow-Origin': origin } : {}) };
  const error = (status, code, extra = {}) => new Response(JSON.stringify({ error: { code, ...extra } }), { status, headers });
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
  const allowed = new Set(['model','temperature','stream','response_format','messages']);
  if (!isObject(body) || Object.keys(body).some(key => !allowed.has(key))
    || typeof body.model !== 'string' || body.model.length > 200 || !body.model.trim()
    || body.stream !== false || ('temperature' in body && body.temperature !== 0)
    || ('response_format' in body && (!isObject(body.response_format) || body.response_format.type !== 'json_object' || Object.keys(body.response_format).length !== 1))
    || !Array.isArray(body.messages) || body.messages.length !== 2
    || body.messages.some((message, index) => !isObject(message) || Object.keys(message).some(key => !['role','content'].includes(key)) || message.role !== (index ? 'user' : 'system')
      || typeof message.content !== 'string' || message.content.length > 80000)) return error(400, 'unsupported_request');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 55000);
  try {
    if (request.signal?.aborted) return error(499, 'cancelled');
    const upstream = await upstreamFetch.call(globalThis, provider.endpoint, {
      method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'Cache-Control': 'no-store' },
      body: JSON.stringify(body),
    });
    if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); return error(502, 'redirect_rejected'); }
    if (Number(upstream.headers.get('Content-Length')) > MAX_RESPONSE) { await upstream.body?.cancel(); return error(502, 'response_too_large'); }
    const text = await boundedText(upstream.body, MAX_RESPONSE);
    if (controller.signal.aborted) return error(504, 'timeout');
    let parsed;
    try { parsed = JSON.parse(text); } catch { return error(!upstream.ok && [400,401,403,404,429].includes(upstream.status) ? upstream.status : 502, upstream.ok ? 'invalid_response' : [401,403].includes(upstream.status) ? 'upstream_auth' : upstream.status === 429 ? 'upstream_quota' : 'upstream_error'); }
    if (text.includes(key) || JSON.stringify(parsed).includes(key)) return error(502, 'unsafe_response');
    if (!upstream.ok) {
      // Recognize only two compatibility errors; never reflect provider text.
      const detail = String(parsed?.error?.message || parsed?.message || '');
      const parameter = ['response_format','temperature'].find(name => (parsed?.error?.code === 'unsupported_parameter' && (parsed.error.param === name || parsed.error.parameter === name)) || (detail.includes(name) && /unsupported|not.support|not.allowed|only.*support|不支持/i.test(detail)));
      if (upstream.status === 400 && parameter) return error(400, 'unsupported_parameter', { parameter });
      return error([400,401,403,404,429].includes(upstream.status) ? upstream.status : 502,
        [401,403].includes(upstream.status) ? 'upstream_auth' : upstream.status === 429 ? 'upstream_quota' : upstream.status === 404 ? 'model_or_endpoint_missing' : 'upstream_error');
    }
    return new Response(text, { headers });
  } catch {
    return error(controller.signal.aborted ? 504 : 502, controller.signal.aborted ? 'timeout' : 'upstream_connection');
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
