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

// Council: optional second-model cross-check. Each line of the config value is
// one "providerId:modelKey" (model keys may contain colons, so split on the
// first only). Returns [] when disabled or empty.
export const getCouncilModels = (): { providerId: string; modelKey: string }[] => {
  const enabled = configManager.getConfig('search.councilEnabled', false) === true;
  if (!enabled) return [];
  const ref: string = configManager.getConfig('search.councilModel', '');

  return ref
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.indexOf(':');
      if (sep === -1) return null;
      const providerId = line.slice(0, sep);
      const modelKey = line.slice(sep + 1);
      return providerId && modelKey ? { providerId, modelKey } : null;
    })
    .filter((m): m is { providerId: string; modelKey: string } => m !== null);
};
