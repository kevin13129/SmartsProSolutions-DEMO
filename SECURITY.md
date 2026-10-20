# Security policy

This project is currently a static estimate preview. It does not accept online
bookings, store customer records, authenticate staff, or process payments.

Report a suspected vulnerability privately using this repository's **Security →
Report a vulnerability** feature if the owner has enabled it. Otherwise contact
the repository owner privately. Do not put customer details, credentials, or
exploit payloads containing personal data in a public issue. The owner must
confirm a monitored reporting channel before production launch.

Include the affected URL/version, a minimal reproduction using synthetic data,
and the observed impact. Avoid accessing other people's data or disrupting the
service. This policy is not authorization to test third-party services.

Security work for this repository is documented in:

- [Quick handoff for future models and developers](docs/SECURITY-HANDOFF.md)
- [Implemented controls and deployment requirements](docs/SECURITY-BASELINE.md)
- [Requirements for customer intake, staff access, and payments](docs/SECURITY-ROADMAP.md)

Security changes must preserve the baseline tests. Adding customer collection,
authentication, database access, external scripts, or payments requires the
corresponding roadmap controls and tests in the same implementation. A browser
flag, hidden admin link, CSP change, or CAPTCHA widget alone is not authorization
or a complete security boundary.
