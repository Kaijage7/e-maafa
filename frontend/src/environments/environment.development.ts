/** Development environment — calls the live backend (proxied to :8080) with the data layer wired.
 *  Set useMock back to true to render with sample data when no backend is running. */
export const environment = {
  production: false,
  useMock: false,
  apiUrl: '/api',
  keycloak: {
    url: 'http://localhost:8081',
    realm: 'dmis',
    clientId: 'dmis-web',
  },
};
