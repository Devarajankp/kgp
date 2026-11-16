# Security & Privacy Policy

## Privacy First (Zero Tracking)
- **No user tracking or analytics:** Kerala Gold Price (KGP) does not set tracking cookies, run analytics scripts, or send user telemetry to third-party servers.
- **Local-only storage:** Day/Night theme, English/Malayalam language selection, Target Price alert thresholds, and offline gold rate history remain strictly on your device (`localStorage` & `IndexedDB`), with automatic 14-day pruning of unused historical caches.
- **Opt-in permissions:** Browser notification permission is requested strictly when a user explicitly configures or tests a Target Price Alert.

## Anti-Spam & Upstream Respect
- All API routes under `/api/*` enforce per-IP sliding-window rate limiting (`120 req/min`) and short-lived server-side caching (`45s` for live spot/retail feeds, `2m` for source probes, `5m` for historical archives) to prevent hammering upstream public gold price publishers.
- Query and calculation inputs are validated, allowlisted, and bounded server-side to prevent injection or resource exhaustion.

## Market Data Disclaimer & Attribution
- Kerala gold rates, archives, and international `XAU/INR` spot feeds belong to their respective publishers and are aggregated strictly for personal informational reference.
- Jewellery billing calculations (making charges, GST, HUID hallmarking) are estimates; verify final invoices with your jeweller.

## Reporting a Security Issue
If you discover a vulnerability or parser issue, please open a private security advisory or repository issue without publishing exploit payloads publicly.
