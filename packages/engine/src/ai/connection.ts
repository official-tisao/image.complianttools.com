/**
 * P5-13 — per-provider connection configuration (README §15.4).
 *
 * Holds `Connection: Direct (recommended) | Via my relay` per provider, plus the relay URL and token
 * when the user chooses a relay.
 *
 * **Storage.** The user-owned relay URL and its generated access token are saved in this browser's
 * local storage so a one-click setup survives reloads. Provider API keys and prompts remain
 * memory-only. Switching a connection back to Direct removes its relay settings.
 */

import type { ConnectionPath, RelayConfig } from './relay.js';

/** Per-provider relay settings. Absent means the provider is connected directly. */
export interface ProviderRelaySettings {
  /** The user's relay URL. */
  readonly relayUrl: string;
  /** Optional shared secret, sent as `X-Relay-Token`. */
  readonly token?: string;
}

const settingsByProvider = new Map<string, ProviderRelaySettings>();
const STORAGE_KEY = 'ctimg:provider-relays:v1';
let storageHydrated = false;

function browserLocalStorage(): Storage | undefined {
  try {
    return 'localStorage' in globalThis ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function readStoredSettings(): Record<string, ProviderRelaySettings> {
  const storage = browserLocalStorage();
  if (!storage) return {};
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([, settings]) => {
        if (typeof settings !== 'object' || settings === null || !('relayUrl' in settings))
          return false;
        const candidate = settings as Partial<ProviderRelaySettings>;
        return (
          typeof candidate.relayUrl === 'string' &&
          candidate.relayUrl.startsWith('https://') &&
          (candidate.token === undefined || typeof candidate.token === 'string')
        );
      }),
    ) as Record<string, ProviderRelaySettings>;
  } catch {
    return {};
  }
}

function writeStoredSettings(): void {
  const storage = browserLocalStorage();
  if (!storage) return;
  try {
    const serializable = Object.fromEntries(settingsByProvider);
    if (Object.keys(serializable).length === 0) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Private browsing or a storage policy can disable localStorage; this tab still works in memory.
  }
}

function hydrateStoredSettings(): void {
  if (storageHydrated || !browserLocalStorage()) return;
  for (const [providerId, settings] of Object.entries(readStoredSettings())) {
    if (!settingsByProvider.has(providerId)) settingsByProvider.set(providerId, settings);
  }
  storageHydrated = true;
}

/**
 * Record a provider's relay settings. Passing `undefined` returns the provider to direct.
 *
 * Returns a function that restores the previous settings, so a UI can revert an abandoned edit.
 */
export function setProviderRelay(
  providerId: string,
  settings: ProviderRelaySettings | undefined,
): () => void {
  hydrateStoredSettings();
  const previous = settingsByProvider.get(providerId);
  if (settings === undefined) settingsByProvider.delete(providerId);
  else settingsByProvider.set(providerId, settings);
  writeStoredSettings();
  return () => {
    if (previous === undefined) settingsByProvider.delete(providerId);
    else settingsByProvider.set(providerId, previous);
    writeStoredSettings();
  };
}

/** The relay settings for a provider, or `undefined` when it is connected directly. */
export function getProviderRelay(providerId: string): ProviderRelaySettings | undefined {
  hydrateStoredSettings();
  return settingsByProvider.get(providerId);
}

/** The connection path a provider is currently configured for. */
export function getConnectionPath(providerId: string): ConnectionPath {
  const settings = getProviderRelay(providerId);
  return settings !== undefined && settings.relayUrl.trim() !== '' ? 'relay' : 'direct';
}

/** The `RelayConfig` for a provider, or `undefined` for a direct connection. */
export function getRelayConfig(providerId: string): RelayConfig | undefined {
  const settings = getProviderRelay(providerId);
  if (settings === undefined || settings.relayUrl.trim() === '') return undefined;
  return { relayUrl: settings.relayUrl, ...(settings.token ? { token: settings.token } : {}) };
}

/** Remove every saved relay from memory and this browser's local storage. */
export function clearAllProviderRelays(): void {
  settingsByProvider.clear();
  storageHydrated = browserLocalStorage() !== undefined;
  writeStoredSettings();
}
