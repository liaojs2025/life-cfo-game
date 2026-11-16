import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { relay } from '../worker/handler.js';

const BASE_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const safeResponse = (status, code, headers = {}) => new Response(JSON.stringify({ error: { code } }),
  { status, headers: { ...BASE_HEADERS, ...headers } });
const integer = (value, fallback, min, max, name) => {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Invalid ${name}.`);
  return number;
};

// Only deployment settings are read. No provider credential is read from env.
export function relayServerConfig(env = process.env) {
  return {
    port: integer(env.PORT || env.LIFE_CFO_PORT, 8080, 1, 65535, 'PORT'),
    maxConcurrent: integer(env.LIFE_CFO_MAX_CONCURRENT, 8, 1, 64, 'LIFE_CFO_MAX_CONCURRENT'),
    requestTimeoutMs: integer(env.LIFE_CFO_REQUEST_TIMEOUT_MS, 60000, 1000, 120000, 'LIFE_CFO_REQUEST_TIMEOUT_MS'),
    shutdownGraceMs: integer(env.LIFE_CFO_SHUTDOWN_GRACE_MS, 10000, 0, 60000, 'LIFE_CFO_SHUTDOWN_GRACE_MS'),
  };
}

async function waitForRelay(pending, signal) {
  let onAbort;
  const aborted = new Promise((resolve, reject) => {
    onAbort = () => reject(new Error('request_cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try { return await Promise.race([pending, aborted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}

async function send(outgoing, incoming, response) {
  if (outgoing.destroyed || outgoing.writableEnded) return;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (outgoing.destroyed || outgoing.writableEnded) return;
  const headers = Object.fromEntries(response.headers);
  // Do not keep accepting an unfinished upload after an early rejection.
  if (!incoming.complete) headers.Connection = 'close';
  outgoing.writeHead(response.status, headers);
  outgoing.end(incoming.method === 'HEAD' ? undefined : bytes, () => {
    if (!incoming.complete) incoming.destroy();
  });
}

/** Node 22 adapter for the audited, fixed-provider relay. No static file serving. */
export function createRelayServer({ upstreamFetch = globalThis.fetch, maxConcurrent = 8,
  requestTimeoutMs = 60000, shutdownGraceMs = 10000 } = {}) {
  maxConcurrent = integer(maxConcurrent, 8, 1, 64, 'maxConcurrent');
  requestTimeoutMs = integer(requestTimeoutMs, 60000, 10, 120000, 'requestTimeoutMs');
  shutdownGraceMs = integer(shutdownGraceMs, 10000, 0, 60000, 'shutdownGraceMs');
  const active = new Set();
  let draining = false, closing;
  const server = http.createServer({ maxHeaderSize: 16384, requestTimeout: requestTimeoutMs,
    headersTimeout: Math.min(10000, requestTimeoutMs), keepAliveTimeout: 5000 }, async (incoming, outgoing) => {
    let controller, timeout, onDisconnect;
    let corsHeaders = {};
    try {
      if (incoming.url === '/healthz') {
        const response = ['GET', 'HEAD'].includes(incoming.method)
          ? new Response(JSON.stringify({ status: draining ? 'draining' : 'ok' }), { status: draining ? 503 : 200, headers: BASE_HEADERS })
          : safeResponse(405, 'method_rejected');
        await send(outgoing, incoming, response);
        return;
      }
      if (incoming.url !== '/api/ai') { await send(outgoing, incoming, safeResponse(404, 'not_found')); return; }

      // Ask the existing handler for its Origin decision; do not maintain a
      // second origin allowlist or permit caller-selected upstream addresses.
      const preflight = await relay(new Request('http://life-cfo-relay.internal/api/ai', { method: 'OPTIONS', headers: {
        Origin: incoming.headers.origin || '', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      } }), upstreamFetch);
      if (preflight.status !== 204) { await send(outgoing, incoming, preflight); return; }
      corsHeaders = { 'Access-Control-Allow-Origin': preflight.headers.get('Access-Control-Allow-Origin'), Vary: 'Origin' };
      if (draining) { await send(outgoing, incoming, safeResponse(503, 'server_draining', corsHeaders)); return; }
      if (incoming.method !== 'OPTIONS' && active.size >= maxConcurrent) {
        await send(outgoing, incoming, safeResponse(503, 'relay_busy', { ...corsHeaders, 'Retry-After': '1' }));
        return;
      }

      controller = new AbortController();
      if (incoming.method !== 'OPTIONS') active.add(controller);
      const cancel = reason => { if (!controller.signal.aborted) controller.abort(reason); };
      onDisconnect = () => { if (!outgoing.writableEnded) cancel('client_disconnected'); };
      incoming.once('aborted', onDisconnect);
      outgoing.once('close', onDisconnect);
      timeout = setTimeout(() => cancel('timeout'), requestTimeoutMs);
      const request = new Request('http://life-cfo-relay.internal/api/ai', {
        method: incoming.method, headers: incoming.headers, signal: controller.signal,
        ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: incoming, duplex: 'half' }),
      });
      const result = await waitForRelay(relay(request, upstreamFetch), controller.signal);
      if (!controller.signal.aborted) await send(outgoing, incoming, result);
    } catch {
      const reason = controller?.signal.reason;
      if (reason !== 'client_disconnected') {
        await send(outgoing, incoming, safeResponse(reason === 'timeout' ? 504 : reason === 'shutdown' ? 503 : 502,
          reason === 'timeout' ? 'timeout' : reason === 'shutdown' ? 'server_draining' : 'request_failed', corsHeaders));
      }
    } finally {
      clearTimeout(timeout);
      if (controller) active.delete(controller);
      if (onDisconnect) { incoming.removeListener('aborted', onDisconnect); outgoing.removeListener('close', onDisconnect); }
    }
  });

  function close() {
    if (closing) return closing;
    draining = true;
    closing = new Promise(resolveClose => {
      const grace = setTimeout(() => {
        for (const controller of active) controller.abort('shutdown');
        server.closeAllConnections();
      }, shutdownGraceMs);
      grace.unref();
      server.close(() => { clearTimeout(grace); resolveClose(); });
      server.closeIdleConnections();
    });
    return closing;
  }
  return { server, close, activeRequests: () => active.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const settings = relayServerConfig();
    const service = createRelayServer(settings);
    service.server.on('error', () => { console.error('Relay could not start. Check the port and runtime configuration.'); process.exitCode = 1; });
    service.server.listen(settings.port, '0.0.0.0', () => console.log(`Life CFO relay listening on port ${settings.port}.`));
    const shutdown = () => service.close().then(() => process.exit(0));
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch { console.error('Invalid relay server configuration.'); process.exitCode = 1; }
}
