import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRelayServer, relayServerConfig } from '../scripts/relay-server.mjs';

const ORIGIN = 'https://liaojs2025.github.io';
const KEY = 'node-relay-only-test-key';
const envelope = () => ({ provider: 'efund', apiKey: KEY, request: { model: 'gpt-4o', stream: false,
  messages: [{ role: 'system', content: 'Test.' }, { role: 'user', content: '{}' }] } });
const reply = () => new Response('{"choices":[]}', { headers: { 'Content-Type': 'application/json' } });
const post = body => ({ method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const flush = () => new Promise(resolve => setImmediate(resolve));

async function start(t, options = {}) {
  const service = createRelayServer({ shutdownGraceMs: 25, ...options });
  await new Promise((resolve, reject) => {
    service.server.once('error', reject);
    service.server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => service.close());
  return { ...service, url: `http://127.0.0.1:${service.server.address().port}` };
}

test('Node relay exposes only health and the fixed API route without serving game source', async t => {
  const service = await start(t, { upstreamFetch: async () => { throw Error('unexpected upstream'); } });
  const health = await fetch(`${service.url}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal(health.headers.get('Cache-Control'), 'no-store');
  assert.equal((await fetch(`${service.url}/healthz`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${service.url}/healthz`, { method: 'POST' })).status, 405);
  for (const path of ['/', '/dist/providers.js', '/worker/handler.js', '/.env', '/api/ai?endpoint=https://private.test/']) {
    const result = await fetch(service.url + path);
    assert.equal(result.status, 404);
    assert.deepEqual(await result.json(), { error: { code: 'not_found' } });
  }
});

test('Node relay preserves exact Origin, fixed provider, per-request credentials and completed-upload behavior', async t => {
  const calls = [];
  const service = await start(t, { upstreamFetch: async (url, init) => {
    calls.push({ url, init });
    // A normally completed IncomingMessage must not cancel the model request.
    await flush();
    assert.equal(init.signal.aborted, false);
    assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(url, 'https://aigc.efunds.com.cn/v1/chat/completions');
    assert.equal(init.body.includes(KEY), false);
    assert.equal(JSON.parse(init.body).stream, true);
    return reply();
  } });
  const preflight = await fetch(`${service.url}/api/ai`, { method: 'OPTIONS', headers: { Origin: ORIGIN,
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const foreign = await fetch(`${service.url}/api/ai`, { ...post(envelope()), headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null);
  const invalid = await fetch(`${service.url}/api/ai`, post({ ...envelope(), provider: 'https://attacker.example' }));
  assert.equal(invalid.status, 400);
  const missingKey = envelope(); delete missingKey.apiKey;
  assert.equal((await fetch(`${service.url}/api/ai`, post(missingKey))).status, 401);
  assert.equal(calls.length, 0);
  const valid = await fetch(`${service.url}/api/ai`, post(envelope()));
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual(await valid.json(), { choices: [] });
  assert.equal(calls.length, 1);
});

test('Node relay keeps the existing request/response limits and never uses process credentials', async t => {
  let calls = 0;
  const service = await start(t, { upstreamFetch: async () => {
    calls++;
    return new Response('x'.repeat(200001), { headers: { 'Content-Length': '200001' } });
  } });
  const large = await fetch(`${service.url}/api/ai`, post({ ...envelope(), padding: 'x'.repeat(160001) }));
  assert.equal(large.status, 413);
  assert.equal(calls, 0);
  const result = await fetch(`${service.url}/api/ai`, post(envelope()));
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), { error: { code: 'response_too_large' } });
  const settings = relayServerConfig({ PORT: '8081', LIFE_CFO_PORT: '8082', EFUND_API_KEY: 'ignored-secret' });
  assert.equal(settings.port, 8081);
  assert.equal(JSON.stringify(settings).includes('ignored-secret'), false);
  assert.equal(relayServerConfig({ LIFE_CFO_PORT: '8082' }).port, 8082);
  assert.throws(() => relayServerConfig({ PORT: 'secret-invalid-port' }), error => !error.message.includes('secret-invalid-port'));
});

test('Node relay bounds concurrency while health and exact CORS remain available', async t => {
  let release, started;
  const begun = new Promise(resolve => { started = resolve; });
  const service = await start(t, { maxConcurrent: 1, upstreamFetch: async () => {
    started();
    return new Promise(resolve => { release = () => resolve(reply()); });
  } });
  const first = fetch(`${service.url}/api/ai`, post(envelope()));
  await begun;
  const second = await fetch(`${service.url}/api/ai`, post(envelope()));
  assert.equal(second.status, 503);
  assert.equal(second.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual(await second.json(), { error: { code: 'relay_busy' } });
  assert.equal((await fetch(`${service.url}/healthz`)).status, 200);
  release();
  assert.equal((await first).status, 200);
});

test('Node relay timeout cancels the same upstream request and sends only a safe error', async t => {
  let upstreamSignal;
  const service = await start(t, { requestTimeoutMs: 40, upstreamFetch: async (url, init) => {
    upstreamSignal = init.signal;
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error(KEY)), { once: true }));
  } });
  const result = await fetch(`${service.url}/api/ai`, post(envelope()));
  assert.equal(result.status, 504);
  assert.equal(upstreamSignal.aborted, true);
  assert.deepEqual(await result.json(), { error: { code: 'timeout' } });
});

test('Node relay cancels on client disconnection without waiting for the model deadline', async t => {
  let started, cancelled;
  const begun = new Promise(resolve => { started = resolve; });
  const aborted = new Promise(resolve => { cancelled = resolve; });
  const service = await start(t, { upstreamFetch: async (url, init) => {
    started();
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => { cancelled(); reject(new Error(KEY)); }, { once: true }));
  } });
  const request = http.request(`${service.url}/api/ai`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' } });
  request.on('error', () => {});
  request.end(JSON.stringify(envelope()));
  await begun;
  request.destroy();
  await aborted;
  await flush();
  assert.equal(service.activeRequests(), 0);
});

test('Node relay graceful shutdown lets active work finish and aborts work beyond its grace period', async t => {
  for (const finishNormally of [true, false]) {
    let started, release, wasAborted = false;
    const begun = new Promise(resolve => { started = resolve; });
    const service = await start(t, { shutdownGraceMs: 30, upstreamFetch: async (url, init) => {
      started();
      return new Promise((resolve, reject) => {
        release = () => resolve(reply());
        init.signal.addEventListener('abort', () => { wasAborted = true; reject(new Error(KEY)); }, { once: true });
      });
    } });
    const pending = fetch(`${service.url}/api/ai`, post(envelope())).catch(() => null);
    await begun;
    const closed = service.close();
    if (finishNormally) release();
    const result = await pending;
    await closed;
    assert.equal(wasAborted, !finishNormally);
    if (finishNormally) assert.equal(result.status, 200);
    await flush();
    assert.equal(service.activeRequests(), 0);
  }
});

test('Docker build copies only explicit relay runtime files and excludes credentials and development output', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const ignore = await readFile(new URL('../.dockerignore', import.meta.url), 'utf8');
  assert.match(dockerfile, /FROM node:22-alpine/);
  assert.match(dockerfile, /USER node/);
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s|EFUND_API_KEY|ENV.*(?:KEY|TOKEN)/);
  assert.equal(ignore.split('\n')[0], '**');
  assert.doesNotMatch(ignore, /!\.env|!output|!\.openai|!\.git/);
});
