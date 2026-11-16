// Public routing configuration only. No credentials belong in this file.
export const PUBLIC_RELAY_ORIGIN = 'https://life-cfo-investment-lab.sapphirevale1.chatgpt.site';
export const PROVIDERS = Object.freeze([
  { id: 'efund', name: '易方达', endpoint: 'https://aigc.efunds.com.cn/v1/chat/completions' },
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions' },
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions' },
  { id: 'deepseek-v1', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1/chat/completions' },
  { id: 'dashscope', name: '通义千问（中国）', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
  { id: 'dashscope-intl', name: '通义千问（国际）', endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions' },
  { id: 'zhipu', name: '智谱', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
  { id: 'moonshot', name: 'Moonshot', endpoint: 'https://api.moonshot.cn/v1/chat/completions' },
]);
export function providerForEndpoint(endpoint) {
  return PROVIDERS.find(provider => provider.endpoint === endpoint)?.id ?? null;
}
export function relayURLForLocation(location = globalThis.location) {
  if (!location || !['https:', 'http:'].includes(location.protocol)) return null;
  const local = ['http://127.0.0.1:4173', 'http://localhost:4173'].includes(location.origin);
  return `${local ? location.origin : PUBLIC_RELAY_ORIGIN}/api/ai`;
}
