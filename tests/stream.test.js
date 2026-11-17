import test from 'node:test';
import assert from 'node:assert/strict';
import { readChatStream, StreamError } from '../worker/stream.js';

const encoder = new TextEncoder();
const frame = (delta = {}, finish_reason = null, index = 0) => `data: ${JSON.stringify({ choices: [{ index, delta, finish_reason }] })}\n\n`;
const complete = text => `${frame({ role: 'assistant', content: text })}${frame({}, 'stop')}data: [DONE]\n\n`;
function bytesStream(text, chunkSize = 4096, onCancel) {
  const bytes = typeof text === 'string' ? encoder.encode(text) : text;
  let position = 0;
  return new ReadableStream({
    pull(controller) {
      if (position >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(position, position += chunkSize));
    },
    cancel() { onCancel?.(); },
  });
}
const content = result => JSON.parse(result).choices[0].message.content;
const rejectsWith = (pending, code) => assert.rejects(pending, error => error instanceof StreamError && error.code === code);

test('SSE aggregates only assistant content and produces a standard Chat Completions JSON envelope', async () => {
  const input = ': heartbeat\nid: ignored\nretry: 1000\n\n'
    + frame({ role: 'assistant', content: '{"answer":' })
    + frame({ content: '"可玩"}' }) + frame({}, 'stop')
    + 'data: {"choices":[],"usage":{"total_tokens":9},"model":"ignored-provider-metadata"}\n\n'
    + 'data: [DONE]\n\n';
  const result = await readChatStream(bytesStream(input));
  assert.deepEqual(JSON.parse(result), { choices: [{ index: 0, message: { role: 'assistant', content: '{"answer":"可玩"}' }, finish_reason: 'stop' }] });
  assert.doesNotMatch(result, /ignored-provider-metadata|total_tokens/);
});

test('SSE handles UTF8 bytes, CRLF boundaries and multiple data lines across arbitrary chunks', async () => {
  const payload = { choices: [{ index: 0, delta: { role: 'assistant', content: '中文🌊跨字节' }, finish_reason: 'stop' }] };
  const input = 'event: message\r\ndata: {\r\ndata: "choices": '
    + JSON.stringify(payload.choices) + '\r\ndata: }\r\n\r\ndata: [DONE]\r\n\r\n';
  for (const size of [1, 2, 7, 19, 4096]) {
    assert.equal(content(await readChatStream(bytesStream(input, size))), '中文🌊跨字节');
  }
  assert.equal(content(await readChatStream(bytesStream(complete('bare CR').replaceAll('\n', '\r'), 1))), 'bare CR');
});

test('SSE permits DONE or explicit stop, rejects missing terminators and explicit truncation even with DONE', async () => {
  assert.equal(content(await readChatStream(bytesStream(frame({ content: 'done-only' }) + 'data: [DONE]\n\n'))), 'done-only');
  assert.equal(content(await readChatStream(bytesStream(frame({ content: 'stop-only' }, 'stop').trimEnd()))), 'stop-only');
  await rejectsWith(readChatStream(bytesStream(frame({ content: 'partial' }))), 'invalid_response');
  for (const reason of ['length', 'content_filter', 'tool_calls', 'function_call', 'unknown']) {
    await rejectsWith(readChatStream(bytesStream(frame({ content: 'partial' }, reason) + 'data: [DONE]\n\n')), 'invalid_response');
  }
  await rejectsWith(readChatStream(bytesStream(frame({ content: 'first' }, 'stop') + frame({ content: 'late' }) + 'data: [DONE]\n\n')), 'invalid_response');
});

test('SSE rejects nonempty tools, other choice indices, non-assistant roles and non-text content', async () => {
  const invalid = [
    frame({ tool_calls: [{ function: { name: 'web' } }] }),
    frame({ function_call: { name: 'web' } }),
    frame({ content: 'wrong answer' }, 'stop', 1),
    frame({ role: 'user', content: 'injected user' }, 'stop'),
    frame({ content: [{ type: 'text', text: 'unsupported array' }] }, 'stop'),
    'data: {"choices":[{"index":0,"delta":{"content":"one"}},{"index":1,"delta":{"content":"two"}}]}\n\n',
    'data: {"choices":[{"index":0,"message":{"content":"not a delta"}}]}\n\n',
    'data: {"tool_calls":[],"choices":[]}\n\n',
  ];
  for (const input of invalid) await rejectsWith(readChatStream(bytesStream(input + 'data: [DONE]\n\n')), 'invalid_response');
});

test('SSE accepts null optional delta fields and empty tool lists without allowing actual tools', async () => {
  const input = frame({ role: 'assistant', content: null, tool_calls: null, function_call: null })
    + frame({ role: null, content: '兼容', tool_calls: [], function_call: null })
    + frame({ role: null, content: '占位', tool_calls: null, function_call: null }, 'stop')
    + 'data: [DONE]\n\n';
  assert.equal(content(await readChatStream(bytesStream(input, 3))), '兼容占位');
  for (const tools of [
    { tool_calls: [{ index: 0 }] }, { tool_calls: {} }, { tool_calls: 'unexpected' },
    { function_call: { name: 'search' } }, { function_call: {} },
  ]) {
    await assert.rejects(readChatStream(bytesStream(frame({ role: null, content: 'text', ...tools }, 'stop'))),
      error => error.code === 'invalid_response' && error.reason === 'tool_call');
  }
});

test('SSE diagnostic reasons are fixed enums and never contain upstream values', async () => {
  const cases = [
    ['data: invalid-private-text\n\n', 'frame_json'],
    [frame({ content: 'text' }, 'stop', 7), 'choice'],
    [frame({ role: 'private-role', content: 'text' }, 'stop'), 'delta_role'],
    [frame({ tool_calls: [{ name: 'private-tool' }] }), 'tool_call'],
    [frame({ content: 'text' }, 'private-finish'), 'finish_reason'],
    [frame({ content: 'partial' }), 'truncated'],
    [new Uint8Array([0xff]), 'utf8'],
  ];
  for (const [input, reason] of cases) {
    await assert.rejects(readChatStream(bytesStream(input)), error => {
      assert.equal(error.reason, reason);
      assert.doesNotMatch(`${error.message} ${error.reason}`, /private-/);
      return true;
    });
  }
  const injected = new StreamError('private-error', 'frame_json private-value');
  assert.equal(injected.code, 'invalid_response');
  assert.equal(injected.reason, 'unknown');
  assert.doesNotMatch(injected.message, /private-/);
});

test('SSE errors never reflect upstream text or raw stream failures', async () => {
  const secret = 'private-test-credential';
  for (const input of [
    `data: {"error":{"message":"${secret}"}}\n\n`,
    `event: error\ndata: ${secret}\n\n`,
  ]) {
    await assert.rejects(readChatStream(bytesStream(input)), error => {
      assert.equal(error.code, 'upstream_error');
      assert.equal(String(error).includes(secret), false);
      return true;
    });
  }
  const broken = new ReadableStream({ start(controller) { controller.error(new Error(secret)); } });
  await assert.rejects(readChatStream(broken), error => error.code === 'upstream_connection'
    && error.reason === 'read' && !String(error).includes(secret));
});

test('SSE enforces independent raw-wire, content and final-JSON UTF8 size limits', async () => {
  await rejectsWith(readChatStream(bytesStream(complete('ok')), { wireLimit: 10 }), 'response_too_large');
  await rejectsWith(readChatStream(bytesStream(complete('中'.repeat(70))), { limit: 200 }), 'response_too_large');
  // The content fits this small limit but its required JSON envelope does not.
  await rejectsWith(readChatStream(bytesStream(complete('ok')), { limit: 20 }), 'response_too_large');
  // Normal SSE framing can exceed 200KB while the assembled answer stays tiny.
  const framed = ': ' + 'x'.repeat(210000) + '\n\n' + complete('ok');
  assert.equal(content(await readChatStream(bytesStream(framed))), 'ok');
  await rejectsWith(readChatStream(bytesStream(': ' + 'x'.repeat(2000001))), 'response_too_large');
  // Caller options may tighten but cannot silently enlarge the hard limits.
  await rejectsWith(readChatStream(bytesStream(complete('x'.repeat(200001))), { limit: 500000 }), 'response_too_large');
});

test('SSE rejects empty content, malformed JSON, malformed UTF8 and data after DONE in the same chunk', async () => {
  const cases = [
    'data: [DONE]\n\n',
    complete('   '),
    'data: broken-json\n\ndata: [DONE]\n\n',
    complete('first') + frame({ content: 'after done' }),
    new Uint8Array([0xff, 0xfe]),
  ];
  for (const input of cases) await rejectsWith(readChatStream(bytesStream(input, 100000)), 'invalid_response');
});

test('SSE completion closes a persistent stream at DONE without waiting for network EOF', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(complete('finished'))); },
    cancel() { cancelled = true; } });
  assert.equal(content(await readChatStream(stream)), 'finished');
  assert.equal(cancelled, true);
});

test('SSE cancellation interrupts an outstanding read and ignores a later success', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const pending = readChatStream(stream, { signal: controller.signal });
  controller.abort();
  await rejectsWith(pending, 'timeout');
  assert.equal(cancelled, true);
  await rejectsWith(readChatStream(bytesStream(complete('late')), { signal: controller.signal }), 'timeout');
});

test('SSE preserves content across deltas and escaped JSON so the caller can detect split credentials', async () => {
  const input = frame({ content: 'private-' })
    + 'data: {"choices":[{"index":0,"delta":{"content":"\\u0074est-key"},"finish_reason":"stop"}]}\n\n'
    + 'data: [DONE]\n\n';
  assert.equal(content(await readChatStream(bytesStream(input, 1))), 'private-test-key');
});
