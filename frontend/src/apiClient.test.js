import { createAuthenticatedFetch } from './apiClient';

describe('createAuthenticatedFetch', () => {
  it('adds auth headers and retries after a 401 refresh', async () => {
    const user = { token: 'abc', refreshToken: 'refresh' };
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ ok: true }) });

    const refreshTokenHandler = jest.fn().mockResolvedValue(true);
    const logoutHandler = jest.fn();

    const authenticatedFetch = createAuthenticatedFetch({ user, refreshTokenHandler, logoutHandler, fetchImpl });
    const response = await authenticatedFetch('/products', { method: 'GET' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
    expect(refreshTokenHandler).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(logoutHandler).not.toHaveBeenCalled();
  });

  it('logs out and returns the original response when refresh fails unexpectedly', async () => {
    const user = { token: 'abc', refreshToken: 'refresh' };
    const originalResponse = { status: 401 };
    const fetchImpl = jest.fn().mockResolvedValueOnce(originalResponse);

    const refreshTokenHandler = jest.fn().mockRejectedValue(new Error('refresh failed'));
    const logoutHandler = jest.fn();

    const authenticatedFetch = createAuthenticatedFetch({ user, refreshTokenHandler, logoutHandler, fetchImpl });
    const response = await authenticatedFetch('/products', { method: 'GET' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(refreshTokenHandler).toHaveBeenCalled();
    expect(logoutHandler).toHaveBeenCalled();
    expect(response).toBe(originalResponse);
  });
});
