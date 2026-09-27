const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createApiClient({
  fetchImpl = fetch,
  getAccessToken,
  getRefreshToken,
  setTokens,
  onRefreshFailure,
}) {
  let refreshInFlight = null;

  function send(path, options, accessToken) {
    const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    const body = options.body && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body;
    return fetchImpl(`/api/v1${path}`, { ...options, headers, body });
  }

  async function refresh() {
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        const response = await fetchImpl('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refresh_token: getRefreshToken() }),
        });
        if (!response.ok) throw new Error('Refresh failed');
        const token = await response.json();
        setTokens(token);
        return token.access_token;
      })().catch(error => {
        onRefreshFailure();
        throw new Error('Your session expired. Please sign in again.', { cause: error });
      }).finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  return async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const sentAccessToken = getAccessToken();
    let response = await send(path, options, sentAccessToken);

    if (response.status === 401 && path !== '/auth/refresh' && RETRYABLE_METHODS.has(method) && getRefreshToken()) {
      // A concurrent request may have completed rotation while this 401 was in flight.
      const accessToken = sentAccessToken !== getAccessToken()
        ? getAccessToken()
        : await refresh();
      response = await send(path, options, accessToken);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    return data;
  };
}
