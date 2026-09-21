/** Shared network boundary for opt-in engine asset requests. */
export function fetchAsset(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}
