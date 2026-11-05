import { defineConfig } from 'vite';

// Content Security Policy for the published build. GitHub Pages can't set response
// headers, so it goes in a meta tag. Only added at build time so the dev server's
// hot reload keeps working.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const csp = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
};

// Relative base so the build works at any path (GitHub Pages serves it under /sunset-territory-/).
export default defineConfig({ base: './', plugins: [csp] });
