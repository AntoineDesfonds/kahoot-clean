import { defineConfig } from 'cypress';

export default defineConfig({
  viewportHeight: 760,
  viewportWidth: 360,
  includeShadowDom: true,
  e2e: {
    baseUrl: 'http://localhost:8100',
  },
});
