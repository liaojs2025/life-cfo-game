// Public routing configuration only. No credentials belong in this file.
export const PUBLIC_RELAY_ORIGIN = 'https://life-cfo-investment-lab.sapphirevale1.chatgpt.site';
export const EFUND_DEFAULTS = Object.freeze({ endpoint: 'https://aigc.efunds.com.cn/v1/chat/completions', model: 'deepseek-v4-flash' });
export const DEFAULT_API_CONFIG = Object.freeze({ endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash' });
export const OUTPUT_TOKEN_LIMITS = Object.freeze({ decision: 2500, persona: 3500 });
export const EFUND_OUTPUT_TOKEN_LIMITS = Object.freeze({ decision: 4000, persona: 6000 });
export function outputTokenLimits(providerId) {
  return providerId === 'efund' ? EFUND_OUTPUT_TOKEN_LIMITS : OUTPUT_TOKEN_LIMITS;
}
export const PROVIDERS = Object.freeze([
  Object.freeze({ id: 'deepseek', name: 'DeepSeek', endpoint: DEFAULT_API_CONFIG.endpoint, defaultModel: DEFAULT_API_CONFIG.model }),
  Object.freeze({ id: 'efund', name: '易方达 EFUND', endpoint: EFUND_DEFAULTS.endpoint, defaultModel: EFUND_DEFAULTS.model }),
  Object.freeze({ id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4.1-mini' }),
  Object.freeze({ id: 'glm', name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', defaultModel: 'glm-4.7-flash' }),
  Object.freeze({ id: 'kimi', name: 'Kimi', endpoint: 'https://api.moonshot.cn/v1/chat/completions', defaultModel: 'kimi-k3.1-pro' }),
]);
// Shared client/relay contract. Kimi K3 always reasons and rejects thinking/temperature.
export function inferenceParameters(providerId, model = '') {
  // EFUND's V4 Flash defaults to reasoning, which can exhaust the answer budget.
  // Keep this model-specific: other EFUND backends retain their own parameters.
  if (providerId === 'efund' && model === 'deepseek-v4-flash') return { temperature: 0, thinking: { type: 'disabled' } };
  if (providerId === 'kimi') return { reasoning_effort: 'low' };
  if (providerId === 'glm') return { temperature: 1, thinking: { type: 'disabled' } };
  if (providerId === 'deepseek') return { temperature: 0, thinking: { type: 'disabled' } };
  return { temperature: 0 };
}
export function outputTokenField(providerId, model) {
  return providerId === 'openai' || providerId === 'efund' && /^(?:gpt[-.]|o[134](?:-|$))/i.test(model)
    ? 'max_completion_tokens' : 'max_tokens';
}
export function providerForEndpoint(endpoint) {
  return PROVIDERS.find(provider => provider.endpoint === endpoint)?.id ?? null;
}
export function relayURLForLocation(location = globalThis.location) {
  if (!location || !['https:', 'http:'].includes(location.protocol)) return null;
  const local = ['http://127.0.0.1:4173', 'http://localhost:4173'].includes(location.origin);
  return `${local ? location.origin : PUBLIC_RELAY_ORIGIN}/api/ai`;
}
