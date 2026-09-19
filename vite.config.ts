import { readFile } from 'node:fs/promises';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Only this site's scripts plus Google's sign-in and Picker libraries may run,
// and only Google's APIs may be contacted. No inline scripts, no eval.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://apis.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: https://*.googleusercontent.com https://*.gstatic.com https://*.google.com",
  "connect-src 'self' https://sheets.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com",
  'frame-src https://accounts.google.com https://docs.google.com https://drive.google.com',
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Production only: the dev server needs inline scripts for hot reload.
// GitHub Pages can't send headers, so the policy ships as a meta tag.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  };
}

// The demo fixture holds real data, so it is served by the dev server only.
// It must never live in public/, which Vite copies into the published build.
function demoFixture(): Plugin {
  return {
    name: 'demo-fixture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__demo/fixture.json', async (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
          const body = await readFile(new URL('./demo/fixture.json', import.meta.url));
          res.setHeader('Content-Type', 'application/json');
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end('No demo fixture. Run: npm run fixture -- <your.xlsx>');
        }
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves a project site under /<repo>/; the workflow sets this.
  base: process.env.BASE_PATH || '/',
  plugins: [tailwindcss(), react(), contentSecurityPolicy(), demoFixture()],
  server: {
    // localhost only, and a fixed port: the OAuth origin is http://localhost:8080
    host: 'localhost',
    port: 8080,
    strictPort: true,
  },
  preview: { host: 'localhost', port: 8080, strictPort: true },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
