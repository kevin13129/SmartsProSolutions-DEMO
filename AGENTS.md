# Repository instructions for coding agents

## Start here

Read [docs/SECURITY-HANDOFF.md](docs/SECURITY-HANDOFF.md) before changing application
behavior, deployment settings, dependencies, or customer-data flows. It summarizes
the security work, relevant files, validation history, and unfinished work.
Check `git status --short` before editing; preserve existing work and do not assume
that an implementation described in documentation has been committed or deployed.

This is a static HTML/CSS/vanilla JavaScript website. Node 24 runs tooling; there
is currently no application backend, database, staff login, or payment service.
Security foundations take priority over customer-facing customization.

## Preserve these boundaries

- Keep customer intake unavailable until the corresponding server controls in
  [docs/SECURITY-ROADMAP.md](docs/SECURITY-ROADMAP.md) are implemented and verified.
  Do not restore fake confirmations, browser lead storage, public lead viewers,
  or browser-to-CRM/database submission shortcuts.
- Treat calculator values as display-only estimates. Prices, ownership, booking
  status, and payment status must be established by trusted server code when
  those features are introduced.
- Never put secrets or customer records in browser assets, logs, test fixtures,
  documentation, or source control. Use synthetic test data.
- Maintain strict CSP and safe DOM rendering. Use external scripts/styles and
  text rendering for untrusted content. Do not add broad CSP exceptions to make
  a feature work; implement the necessary narrow policy changes with its tests.
- Publish only the explicit `security/public-files.json` manifest through the
  `dist/` build. Do not publish or serve the repository root. Update source files,
  not generated output. `vercel.json` owns the response-header policy; HTML has
  a tested fallback and the build generates other hosts' `_headers`.

## Validate and hand off

For application or security changes, run the relevant checks: `npm run build`
and, when browser behavior or policy changes, `npm run test:browser`. See the
handoff for prerequisites and deployment verification. Do not weaken tests to
hide a failure; intentionally changed architecture needs equivalent protections
and updated tests. Documentation-only changes need link/content checks, not a
full browser run.

After security-relevant work, update the handoff's status and verification record.
Keep implemented, locally tested, deployed, and live-verified states distinct.
Record pending account/hosting work without claiming it has been configured.
