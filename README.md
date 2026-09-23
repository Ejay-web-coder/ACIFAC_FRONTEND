# ACIFAC Frontend

React 19 + Vite + TypeScript UI for the ACIFAC Monitoring and Data Management System.
It talks only to the ACIFAC Express API (never directly to the database); the API uses Supabase
PostgreSQL.

## Local development

```bash
npm install
npm run dev          # http://localhost:5173, /api is proxied to http://localhost:4000
npm run typecheck    # TypeScript (strict)
npm run build
```

## Structure

* `src/lib/api.ts` — the single HTTP client (session cookie + `X-Requested-With` CSRF header).
* `src/lib/liveUpdates.ts` — `useLiveRefresh(tables, callback)`: re-fetches when the server reports a
  change (Server-Sent Events from `/api/events`), replacing polling.
* `src/app/services/authApi.ts`, `src/admin/services/*` — typed API functions.
* `src/utils/dateTime.ts` — every date is shown in Asia/Manila; date-only values (`YYYY-MM-DD`)
  are never shifted by time zones.

## Deployment (Vercel — the `acifac_system` Vercel project)

1. Vercel → project **acifac_system** → Settings → Git: connect this repository
   (`Ejay-web-coder/ACIFAC_FRONTEND`). It is currently linked to a different starter repository.
2. Settings → Environment Variables: `VITE_API_URL=https://<your-backend-host>` (no trailing slash).
3. Deploy. `vercel.json` provides the SPA rewrite (so `/reset-password?token=…` links work) and
   caching headers.
4. On the backend set `CORS_ORIGIN` and `FRONTEND_URL` to the Vercel URL (e.g.
   `https://acifacsystem.vercel.app`) and `COOKIE_SAMESITE=none` when the API is on another site.

`netlify.toml` / `public/_redirects` are kept for a possible Netlify deployment but are not used by
Vercel.
