# Contributing to Kerala Gold Price (KGP)

Thank you for contributing to **Kerala Gold Price (KGP)**!

## Development Setup

1. Install **Node.js 22.14+** (`fnm install --use 24` or Node 22+ LTS).
2. Fork and clone the repository, then install dependencies:
   ```bash
   npm install
   ```
3. Start the full-stack development server (Express API + Vite PWA):
   ```bash
   npm run dev
   ```
4. Optionally refresh the static PWA & Apple Shortcut JSON snapshots:
   ```bash
   npx tsx scripts/sync-static-api.ts
   ```
5. Verify TypeScript types and production bundle before submitting a pull request:
   ```bash
   npm run lint
   npm run build
   ```

## Contribution Guidelines

- **Parser Resilience**: Keep `server/goldService.ts` resilient to minor upstream HTML table adjustments and never remove multi-source fallback behavior.
- **Respect Upstream Rate Limits**: Preserve the short-TTL caching in `server/goldService.ts` and the per-IP limiter in `server/apiUtils.ts`.
- **Day & Night Accessibility**: Maintain WCAG AA contrast across both Day (light) and Night (dark) Liquid Glass themes, including bilingual **English / മലയാളം** UI strings and the theme-matched Share Rate Card.
- **API Compatibility**: Keep existing fields in `/api/gold/shortcut`, `/api/gold/latest`, `/api/gold/calculate`, and `/api/gold/alert-check` backward-compatible for Apple Shortcuts and external apps.
- **PWA Compliance**: Preserve `192x192`, `512x512`, `maskable`, and iOS `apple-touch-icon.png` assets.
- By contributing, you agree that your code contributions are licensed under the [MIT License](./LICENSE).
