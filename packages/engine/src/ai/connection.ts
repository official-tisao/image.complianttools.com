/**
 * P5-13 — per-provider connection configuration (README §15.4).
 *
 * Holds `Connection: Direct (recommended) | Via my relay` per provider, plus the relay URL and token
 * when the user chooses a relay.
 *
 * **Storage.** Nothing here is written to `localStorage`, `sessionStorage`, or IndexedDB. The relay
 * URL and token live in a module-level `Map` for the lifetime of the page and are gone on reload.
 * That is deliberate: the relay token authorises spending the user's provider quota, so it is held
 * to the same in-memory-only rule as the API key (README §16.2, §16.6). A session-storage mode for
 * this is not approved by the spec, so it is not offered.
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

/**
 * Record a provider's relay settings. Passing `undefined` returns the provider to direct.
 *
 * Returns a function that restores the previous settings, so a UI can revert an abandoned edit.
 */
export function setProviderRelay(
  providerId: string,
  settings: ProviderRelaySettings | undefined,
): () => void {
  const previous = settingsByProvider.get(providerId);
  if (settings === undefined) settingsByProvider.delete(providerId);
  else settingsByProvider.set(providerId, settings);
  return () => {
    if (previous === undefined) settingsByProvider.delete(providerId);
    else settingsByProvider.set(providerId, previous);
  };
}

/** The relay settings for a provider, or `undefined` when it is connected directly. */
export function getProviderRelay(providerId: string): ProviderRelaySettings | undefined {
  return settingsByProvider.get(providerId);
}

/** The connection path a provider is currently configured for. */
export function getConnectionPath(providerId: string): ConnectionPath {
  const settings = settingsByProvider.get(providerId);
  return settings !== undefined && settings.relayUrl.trim() !== '' ? 'relay' : 'direct';
}

/** The `RelayConfig` for a provider, or `undefined` for a direct connection. */
export function getRelayConfig(providerId: string): RelayConfig | undefined {
  const settings = settingsByProvider.get(providerId);
  if (settings === undefined || settings.relayUrl.trim() === '') return undefined;
  return { relayUrl: settings.relayUrl, ...(settings.token ? { token: settings.token } : {}) };
}

/**
 * Forget every configured relay. Used on lock and on tab teardown so a shared machine does not keep
 * a relay token alive after the session that entered it.
 */
export function clearAllProviderRelays(): void {
  settingsByProvider.clear();
}
