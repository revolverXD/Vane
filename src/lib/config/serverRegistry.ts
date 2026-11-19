import configManager from './index';
import { ConfigModelProvider } from './types';

export const getConfiguredModelProviders = (): ConfigModelProvider[] => {
  return configManager.getConfig('modelProviders', []);
};

export const getConfiguredModelProviderById = (
  id: string,
): ConfigModelProvider | undefined => {
  return getConfiguredModelProviders().find((p) => p.id === id) ?? undefined;
};

export const getSearxngURL = () =>
  configManager.getConfig('search.searxngURL', '');

export const getFirecrawlConfig = (): { url: string; fcKey: string } => ({
  url: configManager.getConfig('search.firecrawlURL', ''),
  fcKey: configManager.getConfig('search.firecrawlapiKey', ''),
});

export const getMemoryURL = () =>
  configManager.getConfig('search.memoryURL', '');

// Council: optional second-model cross-check. Returns null when unset/malformed.
export const getCouncilConfig = (): {
  providerId: string;
  modelKey: string;
  enabled: boolean;
} | null => {
  const enabled = configManager.getConfig('search.councilEnabled', false) === true;
  const ref: string = configManager.getConfig('search.councilModel', '');
  if (!enabled || !ref.includes(':')) return null;
  const [providerId, modelKey] = ref.split(':', 2);
  if (!providerId || !modelKey) return null;
  return { providerId, modelKey, enabled };
};
