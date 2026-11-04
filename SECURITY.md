# Security

Sunset Territory is a static browser game. It has no backend, accounts, or server
side storage. Saves live in your own browser's localStorage and never leave it.

## Reporting a problem

Report a vulnerability privately through GitHub: open the repository's **Security**
tab and choose **Report a vulnerability**. Please don't open a public issue for it.

You'll get a reply within 7 days. Fixes ship as a normal build to the live site.

## What's in scope

- The published game at https://drewc611.github.io/sunset-territory-/
- The build and deploy workflow in `.github/workflows/`
- Dependencies in `package.json`

## How the project stays safe

- The built page ships a Content Security Policy: scripts load only from the site
  itself, fonts only from Google Fonts, and nothing else is fetched.
- The deploy workflow runs with read-only repository access plus the Pages
  permissions it needs, and only on changes to `main` or by hand.
- Dependabot checks npm packages and workflow actions once a month.
- `npm audit` must report 0 vulnerabilities before a dependency change merges.
- Every asset is CC0, MIT, or made for this project, recorded in
  `public/assets/LICENSES.md` before it lands.
