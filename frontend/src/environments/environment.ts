/** Production environment — the app authenticates against Keycloak and calls the live API. */
export const environment = {
  production: true,
  useMock: false,
  apiUrl: '/api',
  keycloak: {
    url: 'https://sso.maafa.pmo.go.tz',
    realm: 'dmis',
    clientId: 'dmis-web',
  },
};
