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
