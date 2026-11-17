// Public routing configuration only. No credentials belong in this file.
export const PUBLIC_RELAY_ORIGIN = 'https://life-cfo-investment-lab.sapphirevale1.chatgpt.site';
export const EFUND_DEFAULTS = Object.freeze({ endpoint: 'https://aigc.efunds.com.cn/v1/chat/completions', model: 'gpt-4o' });
export const PROVIDERS = Object.freeze([
  { id: 'efund', name: '易方达 EFUND', endpoint: EFUND_DEFAULTS.endpoint },
]);
export function providerForEndpoint(endpoint) {
  return PROVIDERS.find(provider => provider.endpoint === endpoint)?.id ?? null;
}
export function relayURLForLocation(location = globalThis.location) {
  if (!location || !['https:', 'http:'].includes(location.protocol)) return null;
  const local = ['http://127.0.0.1:4173', 'http://localhost:4173'].includes(location.origin);
  return `${local ? location.origin : PUBLIC_RELAY_ORIGIN}/api/ai`;
}
