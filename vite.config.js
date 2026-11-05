import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

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

// Third-party notices. The minified bundle drops license comments, so the MIT
// notices for three.js and Vite's module preload helper ship as a text file next to
// the game, read from the installed packages at build time.
const notices = {
  name: 'third-party-notices',
  apply: 'build',
  generateBundle() {
    const three = readFileSync(new URL('./node_modules/three/LICENSE', import.meta.url), 'utf8');
    const vite = readFileSync(new URL('./node_modules/vite/LICENSE.md', import.meta.url), 'utf8').split('# Licenses of bundled dependencies')[0]
      .replace('# Vite core license\n', '');
    const source = 'Sunset Territory includes the following third-party software.\n\n'
      + '== three.js (3D rendering) ==\n\n' + three.trim() + '\n\n'
      + '== Vite (module preload helper in the built page) ==\n\n' + vite.trim() + '\n\n'
      + 'Fonts: Rye and Vollkorn, loaded from Google Fonts, under the SIL Open Font License 1.1.\n'
      + 'Art, sound and models: see assets/LICENSES.md.\n';
    this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-NOTICES.txt', source });
  },
};

// Relative base so the build works at any path (GitHub Pages serves it under /sunset-territory-/).
export default defineConfig({ base: './', plugins: [csp, notices] });
