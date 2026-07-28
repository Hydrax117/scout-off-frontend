# Deployment Guide

## Vercel Analytics

This project now includes Vercel Analytics in the root layout.

- The `Analytics` component is rendered in `app/layout.tsx` so page views are tracked automatically.
- `WebVitalsReporter` (`components/WebVitalsReporter.tsx`) uses the `web-vitals` package to report real-user LCP, CLS, INP, and TTFB as custom Vercel Analytics events (`Web Vitals: <name>`), so field data can be compared against the synthetic Lighthouse CI scores.
- Each event is tagged with `route` — the page's route pattern (e.g. `/[locale]/player/[id]`) computed via `@vercel/analytics`'s `computeRoute`, not the literal URL — so regressions can be traced to a specific page without ever sending a dynamic segment (which can be a Stellar wallet address) to analytics.
- Analytics and Web Vitals reporting are disabled when `NODE_ENV=test` to avoid polluting test data.
- No wallet addresses or other PII are passed to Vercel Analytics because only pageview, performance, and route-pattern data are tracked.

## Environment variables

Add the following variable to `.env.local` or your deployment environment:

```env
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=<your-vercel-analytics-id>
```

If you are deploying to Vercel, also set `NEXT_PUBLIC_VERCEL_ANALYTICS_ID` in your project environment variables.

## Notes

- Do not include wallet addresses in any custom analytics events.
- The app only uses Vercel Analytics for standard pageviews and Web Vitals, not custom PII events.
