/** Production environment — the app authenticates against Keycloak and calls the live API. */
export const environment = {
  production: true,
  useMock: false,
  apiUrl: '/api',
  mapTiles: {
    allowExternal: false,
    voyagerUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    lightUrl: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attribution: '© OpenStreetMap, © CARTO',
  },
  keycloak: {
    url: 'https://sso.maafa.pmo.go.tz',
    realm: 'dmis',
    clientId: 'dmis-web',
  },
};
