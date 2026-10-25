# Smarts Pro Solutions

Static website and interactive cleaning-price estimator for Shreveport, Bossier
City, and Northwest Louisiana. Built with HTML, CSS and vanilla JavaScript.

**Developers and coding agents: start with the [security handoff](docs/SECURITY-HANDOFF.md)**
for current implementation status, verification results, file locations and next
steps. Repository instructions are in [AGENTS.md](AGENTS.md).

The calculator supports room counts, square footage, service types, recurring
frequency and add-ons. Estimates can be reviewed, printed and copied. Prices and
availability require confirmation by the business.

## Current security status

**Online customer intake and payments are not enabled.** The former demo forms,
local lead database, unauthenticated lead viewer, CSV export and simulated success
messages have been removed. Customers can call the business to book. No contact
details, address, access instructions or card details are collected by this
preview. Old demo records are removed from the same browser/origin on page load.

The site uses local assets, strict browser security policies and an explicit
public-file build. These source changes must be deployed and the host verified
before they protect an existing live site. See:

- [Security baseline, findings, tests and hosting checklist](docs/SECURITY-BASELINE.md)
- [Roadmap for customer data, staff access and payments](docs/SECURITY-ROADMAP.md)
- [Security reporting policy](SECURITY.md)

## Local development

Install Node.js 24. There are no npm dependencies.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run dev
```

Open `http://127.0.0.1:3000`. This builds the site and serves only approved public
files with local security headers. After changing source files, rebuild and
refresh. Do not use a generic server to publish the repository root.

```sh
npm run build          # Security regression tests and public dist/ output
npm run test:browser   # Installed Chrome/Chromium/Edge; optional CHROME_PATH
npm run preview        # Serve the existing dist/ build locally
```

Browser checks save screenshots in ignored `.security-preview/`. They use
synthetic data and a separate headless browser profile. The GitHub Actions
workflow runs these checks on pushes, pull requests and a weekly schedule after
the workflow is pushed. Configure required branch checks in GitHub separately.

## Deployment

The repository is locally linked to a Vercel project. `vercel.json` defines the
build, `dist` output directory and HTTP security headers. Review any dashboard
overrides before deploying. `netlify.toml` and generated `dist/_headers` provide
an alternative Netlify setup. No deployment is performed by the local build.

Only files listed in `security/public-files.json` are copied into `dist`. Add new
public files intentionally and review them for secrets and personal data. Docs,
tests, local settings and environment files are not part of the public site.

After deployment, check the final canonical origin:

```sh
npm run security:verify -- https://YOUR-DEPLOYED-HOST
```

Complete the hosting/account checklist before treating the site as production
ready. Do not re-enable customer collection with a frontend configuration switch;
implement the corresponding server protections in the security roadmap first.

## Files

Business groundwork is documented in [Project scope and owner decisions](docs/PROJECT-SCOPE.md),
[Future implementation framework](docs/IMPLEMENTATION-FRAMEWORK.md), and
[Acceptance and handover checklist](docs/ACCEPTANCE-HANDOVER.md).
These are drafts for approval; backend services and customer intake remain unavailable.
Residential pricing is provisional. Commercial and Airbnb scopes require assessment.

| Path | Purpose |
| --- | --- |
| `index.html` | Public page, calculator, contact options and estimate recap |
| `assets/js/estimate-model.js` | Provisional pricing, service-specific scope, common summaries and future request selection shape |
| `assets/js/calculator.js` | Bounded controls and service-specific estimate rendering; memory only |
| `assets/js/api.js` | Legacy storage cleanup and explicit unavailable-intake response |
| `assets/js/booking-modal.js` | Estimate recap and keyboard interaction |
| `assets/js/main.js` | Navigation and service filtering |
| `assets/css/` | External styles and local font definitions |
| `assets/fonts/` | Licensed Latin fonts, licenses and recorded source hashes |
| `scripts/` | Allowlisted build, local preview, browser and deployment checks |
| `tests/` | Automated security and estimator regression checks |
| `docs/` | Security status, operations and future implementation requirements |

Fonts retain their SIL Open Font License notices. Provenance is recorded in
`assets/fonts/provenance.json`; builds do not download external assets.
