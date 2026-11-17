const WIRE_LIMIT = 2000000;
const RESULT_LIMIT = 200000;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const STREAM_REASONS = new Set(['unknown', 'stream', 'read', 'aborted', 'upstream', 'frame_json',
  'choice', 'delta', 'delta_role', 'tool_call', 'refusal', 'content', 'content_after_stop',
  'finish_reason', 'truncated', 'empty', 'after_done', 'utf8', 'wire_limit', 'content_limit', 'result_limit']);
const hasToolCall = value => own(value, 'tool_calls') && value.tool_calls != null
  && !(Array.isArray(value.tool_calls) && value.tool_calls.length === 0)
  || own(value, 'function_call') && value.function_call != null;

export class StreamError extends Error {
  constructor(code, reason = 'unknown') {
    const messages = {
      invalid_response: 'Invalid completion stream.',
      response_too_large: 'Completion stream exceeds its size limit.',
      upstream_error: 'The upstream completion stream reported an error.',
      upstream_connection: 'The upstream completion stream was interrupted.',
      timeout: 'Completion stream was cancelled or timed out.',
    };
    const safeCode = own(messages, code) ? code : 'invalid_response';
    super(messages[safeCode]);
    this.name = 'StreamError';
    this.code = safeCode;
    this.reason = STREAM_REASONS.has(reason) ? reason : 'unknown';
  }
}

const reject = (code, reason) => { throw new StreamError(code, reason); };
const boundedLimit = (requested, maximum) => Number.isInteger(requested) && requested > 0
  ? Math.min(requested, maximum) : maximum;

async function readChunk(reader, signal) {
  if (signal?.aborted) reject('timeout', 'aborted');
  if (!signal) return reader.read();
  let cancel;
  const aborted = new Promise((resolve, fail) => {
    cancel = () => {
      fail(new StreamError('timeout', 'aborted'));
      Promise.resolve(reader.cancel()).catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
  try { return await Promise.race([reader.read(), aborted]); }
  finally { signal.removeEventListener('abort', cancel); }
}

/**
 * Aggregate one OpenAI-compatible Chat Completions SSE response into JSON text.
 * The caller owns the deadline and passes its AbortSignal for the whole read.
 * This function never includes upstream text in errors, logs, or metadata.
 * Non-SSE JSON responses should use the caller's existing bounded JSON reader.
 */
export async function readChatStream(stream, { limit = RESULT_LIMIT, wireLimit = WIRE_LIMIT, signal } = {}) {
  if (signal?.aborted) reject('timeout', 'aborted');
  if (!stream || typeof stream.getReader !== 'function') reject('invalid_response', 'stream');
  limit = boundedLimit(limit, RESULT_LIMIT);
  wireLimit = boundedLimit(wireLimit, WIRE_LIMIT);
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();
  let wireBytes = 0, contentBytes = 0, buffer = '', scanFrom = 0, data = [], event = '';
  let doneSeen = false, stopSeen = false;
  const pieces = [];

  function dispatch() {
    const payload = data.join('\n');
    const eventName = event;
    data = [];
    event = '';
    if (eventName === 'error') reject('upstream_error', 'upstream');
    if (!payload.trim()) return;
    if (doneSeen) reject('invalid_response', 'after_done');
    if (payload.trim() === '[DONE]') { doneSeen = true; return; }
    let chunk;
    try { chunk = JSON.parse(payload); } catch { reject('invalid_response', 'frame_json'); }
    if (!object(chunk)) reject('invalid_response', 'frame_json');
    if (own(chunk, 'error') && chunk.error !== null) reject('upstream_error', 'upstream');
    if (hasToolCall(chunk)) reject('invalid_response', 'tool_call');
    if (!Array.isArray(chunk.choices)) reject('invalid_response', 'choice');
    // An empty choices list is valid for an optional usage-only terminal chunk.
    if (chunk.choices.length === 0) return;
    if (chunk.choices.length !== 1) reject('invalid_response', 'choice');
    const choice = chunk.choices[0];
    if (!object(choice) || choice.index !== 0 || own(choice, 'message')) reject('invalid_response', 'choice');
    if (hasToolCall(choice)) reject('invalid_response', 'tool_call');
    const delta = choice.delta ?? {};
    if (!object(delta)) reject('invalid_response', 'delta');
    // Compatible gateways may serialize absent optional fields as null or an
    // empty tool list. These placeholders are not actual tool invocations.
    if (hasToolCall(delta)) reject('invalid_response', 'tool_call');
    if (delta.role != null && delta.role !== 'assistant') reject('invalid_response', 'delta_role');
    if (typeof delta.refusal === 'string' && delta.refusal.length > 0) reject('invalid_response', 'refusal');
    if (delta.content !== undefined && delta.content !== null) {
      if (typeof delta.content !== 'string') reject('invalid_response', 'content');
      if (stopSeen && delta.content.length > 0) reject('invalid_response', 'content_after_stop');
      contentBytes += encoder.encode(delta.content).byteLength;
      if (contentBytes > limit) reject('response_too_large', 'content_limit');
      pieces.push(delta.content);
    }
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      // A token limit or content filter is a failed/truncated answer, even if a
      // later [DONE] marker says the transport has finished successfully.
      if (choice.finish_reason !== 'stop') reject('invalid_response', 'finish_reason');
      stopSeen = true;
    }
  }

  function line(value) {
    if (value === '') { dispatch(); return; }
    if (value.startsWith(':')) return;
    const colon = value.indexOf(':');
    const field = colon < 0 ? value : value.slice(0, colon);
    let content = colon < 0 ? '' : value.slice(colon + 1);
    if (content.startsWith(' ')) content = content.slice(1);
    if (field === 'data') data.push(content);
    else if (field === 'event') event = content;
  }

  function consume(final = false) {
    while (buffer.length) {
      // Resume at newly received text rather than rescanning a long partial
      // SSE line on every chunk (which would be quadratic in its wire size).
      const cr = buffer.indexOf('\r', scanFrom), lf = buffer.indexOf('\n', scanFrom);
      const end = cr < 0 ? lf : lf < 0 ? cr : Math.min(cr, lf);
      if (end < 0) { scanFrom = buffer.length; break; }
      if (!final && buffer[end] === '\r' && end === buffer.length - 1) { scanFrom = end; break; }
      const width = buffer[end] === '\r' && buffer[end + 1] === '\n' ? 2 : 1;
      const value = buffer.slice(0, end);
      buffer = buffer.slice(end + width);
      scanFrom = 0;
      line(value);
    }
    if (final && buffer.length) { line(buffer); buffer = ''; }
  }

  function decode(value, options) {
    try { return decoder.decode(value, options); }
    catch { reject('invalid_response', 'utf8'); }
  }

  try {
    while (true) {
      const { value, done } = await readChunk(reader, signal);
      if (signal?.aborted) reject('timeout', 'aborted');
      if (done) break;
      if (!(value instanceof Uint8Array)) reject('invalid_response', 'stream');
      wireBytes += value.byteLength;
      if (wireBytes > wireLimit) reject('response_too_large', 'wire_limit');
      buffer += decode(value, { stream: true });
      consume();
      // [DONE] is the protocol terminator: do not wait for a server to close an
      // otherwise persistent SSE connection. Finally cancels the reader.
      if (doneSeen) break;
    }
    buffer += decode();
    consume(true);
    if (data.length || event) dispatch();
    if (signal?.aborted) reject('timeout', 'aborted');
    if (!doneSeen && !stopSeen) reject('invalid_response', 'truncated');
    const content = pieces.join('');
    if (!content.trim()) reject('invalid_response', 'empty');
    const result = JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content },
      finish_reason: stopSeen ? 'stop' : null }] });
    if (encoder.encode(result).byteLength > limit) reject('response_too_large', 'result_limit');
    return result;
  } catch (error) {
    if (signal?.aborted) reject('timeout', 'aborted');
    if (error instanceof StreamError) throw error;
    reject('upstream_connection', 'read');
  } finally {
    Promise.resolve(reader.cancel()).catch(() => {});
    reader.releaseLock();
  }
}
