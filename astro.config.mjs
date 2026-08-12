import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'cloudflare-binding',
  }),
  session: false,
  vite: {
    optimizeDeps: {
      exclude: ['@astrojs/cloudflare', '@astrojs/cloudflare/entrypoints/server.js'],
    },
    ssr: {
      optimizeDeps: {
        exclude: ['@astrojs/cloudflare', '@astrojs/cloudflare/entrypoints/server.js'],
      },
    },
  },
});
