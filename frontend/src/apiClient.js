export const buildAuthHeaders = (user) => {
  if (!user?.token) {
    return {};
  }

  return { Authorization: `Bearer ${user.token}` };
};

export const createAuthenticatedFetch = ({ user, refreshTokenHandler, logoutHandler, fetchImpl = fetch }) => {
  return async (url, options = {}) => {
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...buildAuthHeaders(user),
      },
    });

    if (response.status === 401 && user?.refreshToken) {
      try {
        const refreshed = await refreshTokenHandler();
        if (!refreshed) {
          logoutHandler();
          return response;
        }

        return fetchImpl(url, {
          ...options,
          headers: {
            ...(options.headers || {}),
            ...buildAuthHeaders(user),
          },
        });
      } catch (error) {
        logoutHandler();
        return response;
      }
    }

    return response;
  };
};
