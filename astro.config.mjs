// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import csp from './integrations/csp.mjs';

export default defineConfig({
  site: 'https://lasorti.ro',
  integrations: [sitemap(), csp()],
  build: { format: 'directory' },
});
