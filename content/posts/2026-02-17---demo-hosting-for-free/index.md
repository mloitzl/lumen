---
title: "Free Demo Hosting Approach"
date: "2026-02-17T19:08:00.000Z"
template: "post"
draft: true
slug: "/posts/demo-hosting-for-free"
category: "programming"
tags:
  - infrastructure
  - cloud
  - mongodb
description: ""
---


# Hosting a Full-Stack BFF App for Free: Vercel + Koyeb + MongoDB Atlas

> How I deployed a multi-service Node.js monorepo as a free demo — and solved the cross-origin cookie problem along the way.

## The App

**VinylVault** is a multi-tenant vinyl record collection manager. The architecture follows a classic **BFF (Backend-for-Frontend)** pattern:

```
React SPA → BFF (session mgmt, OAuth, GraphQL gateway) → Domain Backend (business logic, MongoDB)
```

- **Frontend:** React 18, Relay, Vite, Tailwind CSS
- **BFF:** Express + Apollo Server, GitHub OAuth, session cookies (connect-mongo)
- **Backend:** Apollo Server (standalone), MongoDB driver, Discogs/MusicBrainz integrations
- **Database:** MongoDB with a database-per-tenant isolation model

In production this runs on a Raspberry Pi 5 behind Caddy, with Kubernetes staging and full CI/CD. But I wanted a **free, public demo** that anyone can try — without touching my Pi.

## The Free-Tier Stack

| Service         | Provider           | Tier     | Cost   |
|-----------------|--------------------|----------|--------|
| Frontend (SPA)  | Vercel             | Hobby    | $0     |
| API (BFF + Backend) | Koyeb         | Free     | $0     |
| Database        | MongoDB Atlas      | M0       | $0     |
| DNS             | Own domain         | —        | ≈ existing |
| **Total**       |                    |          | **$0/mo** |

## The Demo Server — Collapsing 3 Services into 1 Container

Koyeb's free tier gives you one service. VinylVault has two backend services (BFF + domain backend). The solution: a thin **orchestrator** that runs both as child processes behind a single Express gateway.

```
┌──────────────────────────────────────────┐
│  Demo Server (port 8080)                 │
│  ┌────────────────┐  ┌────────────────┐  │
│  │  BFF (:3001)   │  │ Backend (:4001)│  │
│  │  /graphql      │  │ /graphql       │  │
│  │  /auth/*       │  │ (internal)     │  │
│  └────────────────┘  └────────────────┘  │
│                                          │
│  Gateway: proxies /graphql & /auth → BFF │
│  /health aggregates both services        │
└──────────────────────────────────────────┘
```

The demo server (`packages/demo-server`) is ~80 lines of code. It uses `child_process.fork()` to launch the BFF and backend, then proxies routes with `http-proxy-middleware`. The Dockerfile is a multi-stage build that compiles all three packages and ships only the `dist/` artifacts, keeping the image small and fast.

Memory is capped at 200 MB (`--max-old-space-size=200`) to stay within Koyeb's free-tier limits.

## The Problem: Cross-Origin Cookies

The BFF pattern relies on the frontend and API being **same-origin**. Session cookies are `HttpOnly`, `SameSite=Lax`, and sent automatically with every request — no tokens in localStorage, no CORS headers needed.

This works perfectly when everything runs on one domain. But with the demo:

- Frontend: `vinyl-vault-demo.vercel.app` (Vercel)
- API: `vinyl-vault-demo-xyz.koyeb.app` (Koyeb)

**Different origins.** The session cookie set by the BFF won't be sent to a different domain. OAuth redirects break. The entire auth flow falls apart.

### Options I Considered

1. **Vercel Rewrites** — proxy `/graphql` and `/auth` from Vercel to Koyeb. Zero code changes, but adds latency and is subject to Vercel's serverless function timeout.
2. **`SameSite=None`** — make cookies work cross-origin. Weakens CSRF protection, and Safari blocks third-party cookies entirely. Breaks the security model.
3. **Shared parent domain** — put both services on subdomains of the same domain. Cookies scoped to the parent domain flow to all subdomains. ✅

### The Solution: Shared Parent Domain

I own `loitzl.com`, so I set up:

| Subdomain | Points To | Purpose |
|-----------|-----------|---------|
| `vinyl-vault-demo.loitzl.com` | Vercel | Frontend |
| `api.vinyl-vault-demo.loitzl.com` | Koyeb | API (demo server) |

The session cookie is scoped to `.vinyl-vault-demo.loitzl.com` (note the leading dot). Both subdomains share it. `SameSite=Lax` works because the browser considers them **same-site** — they share the same registrable domain.

No third-party cookie issues. No CORS hacks. The BFF security model stays intact.

## Step-by-Step Setup

### 1. MongoDB Atlas (M0 Free Cluster)

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a database user with read/write access
3. Under **Network Access**, add `0.0.0.0/0` (allow from anywhere — required for Koyeb's dynamic IPs)
4. Copy the connection string: `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net`
5. You'll need three database URIs:
   - `MONGODB_URI` → `...mongodb.net/vinylvault_bff` (BFF sessions)
   - `MONGODB_URI_BASE` → `...mongodb.net` (tenant databases)
   - `MONGODB_REGISTRY_URI` → `...mongodb.net/vinylvault_registry` (central registry)

### 2. Koyeb (API / Demo Server)

1. Push your code to GitHub
2. Create a new **Web Service** on [koyeb.com](https://app.koyeb.com)
3. Connect your GitHub repo
4. Set the build configuration:
   - **Dockerfile path:** `infra/Dockerfile.demoserver`
   - **Build context:** `.` (root of the repo)
5. Set the exposed port to `8080`
6. Add environment variables:

   ```
   MONGODB_URI=mongodb+srv://...mongodb.net/vinylvault_bff
   MONGODB_URI_BASE=mongodb+srv://...mongodb.net
   MONGODB_REGISTRY_URI=mongodb+srv://...mongodb.net/vinylvault_registry
   JWT_SECRET=<generate-a-secure-random-string>
   SESSION_SECRET=<generate-a-secure-random-string>
   GITHUB_CLIENT_ID=<your-oauth-app-client-id>
   GITHUB_CLIENT_SECRET=<your-oauth-app-client-secret>
   GITHUB_CALLBACK_URL=https://api.vinyl-vault-demo.loitzl.com/auth/github/callback
   FRONTEND_URL=https://vinyl-vault-demo.loitzl.com
   COOKIE_DOMAIN=.vinyl-vault-demo.loitzl.com
   GITHUB_APP_ID=<your-github-app-id>
   GITHUB_APP_PRIVATE_KEY_PATH=/path/to/private-key.pem
   GITHUB_APP_WEBHOOK_SECRET=<your-webhook-secret>
   ```

7. Under **Settings → Domains**, add `api.vinyl-vault-demo.loitzl.com` as a custom domain
8. Koyeb will show the CNAME target — add it to your DNS

### 3. Vercel (Frontend)

1. Import the repo on [vercel.com](https://vercel.com)
2. Set the framework to **Vite**
3. Set the root directory to `packages/frontend`
4. Add the environment variable:

   ```
   VITE_API_URL=https://api.vinyl-vault-demo.loitzl.com
   ```

5. Under **Settings → Domains**, add `vinyl-vault-demo.loitzl.com`
6. Vercel provides the CNAME target — add it to your DNS

### 4. DNS Records

At your domain registrar, add two CNAME records:

| Type  | Name                    | Target                          |
|-------|-------------------------|---------------------------------|
| CNAME | `vinyl-vault-demo`      | `cname.vercel-dns.com`          |
| CNAME | `api.vinyl-vault-demo`  | `<your-app>.koyeb.app`          |

Both Vercel and Koyeb provision TLS certificates automatically.

### 5. GitHub OAuth App

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Update (or create) your OAuth App
3. Set the **Authorization callback URL** to:
   ```
   https://api.vinyl-vault-demo.loitzl.com/auth/github/callback
   ```

### 6. GitHub App (Webhooks)

If your app uses GitHub App webhooks, update the webhook URL:

```
https://api.vinyl-vault-demo.loitzl.com/webhook/github
```

## CI/CD: Automatic Deploys on Push

Both Vercel and Koyeb watch the `main` branch. When code is pushed:

- **Vercel** rebuilds the frontend SPA automatically
- **Koyeb** rebuilds the Docker image and deploys the new container automatically

There is zero manual intervention. Push to `main`, wait ~2 minutes, and the demo is live. This makes iteration incredibly convenient and fast.

## The Code Changes

Only three small changes were needed to support the shared-domain setup:

**1. BFF config** — read an optional `COOKIE_DOMAIN` env var:

```typescript
// packages/bff/src/config/env.ts
session: {
  // ...
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
},
```

**2. BFF session middleware** — apply the domain to the cookie when set:

```typescript
// packages/bff/src/index.ts
cookie: {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax',
  maxAge: config.session.maxAge,
  ...(config.session.cookieDomain
    ? { domain: config.session.cookieDomain }
    : {}),
},
```

**3. Demo server** — forward the env var to the BFF child process:

```typescript
// packages/demo-server/src/index.ts
const bff = fork(BFF_PATH, {
  env: {
    ...process.env,
    BFF_PORT: '3001',
    BACKEND_URL: 'http://localhost:4001/graphql',
    NODE_ENV: 'production',
    ...(process.env.COOKIE_DOMAIN
      ? { COOKIE_DOMAIN: process.env.COOKIE_DOMAIN }
      : {}),
  },
});
```

When `COOKIE_DOMAIN` is **not** set (local dev), everything works exactly as before — cookies are scoped to `localhost`. Zero disruption.

## Gotcha: Frontend API Calls

One subtle issue: any `fetch()` call in the frontend that uses a hardcoded relative path (e.g., `fetch('/auth/logout')`) will hit the Vercel domain — not the API. In production, `VITE_API_URL` must be prepended to all API paths.

The `getEndpoint()` utility handles this:

```typescript
// In dev:  getEndpoint('/auth/logout') → '/auth/logout'
// In prod: getEndpoint('/auth/logout') → 'https://api.vinyl-vault-demo.loitzl.com/auth/logout'
```

Make sure **every** fetch call to the API uses `getEndpoint()` — it's easy to miss one and get a confusing 404 in production.

## Summary

A full BFF-pattern app running for free:

- **MongoDB Atlas M0** handles sessions and tenant data
- **Koyeb free tier** runs the entire API in one container (BFF + Backend, orchestrated by a thin gateway)
- **Vercel Hobby** serves the React SPA with instant deploys
- **Shared parent domain** solves the cross-origin cookie problem without weakening security
- **CI/CD is fully automated** — push to `main` and both platforms rebuild and deploy

The only cost is a domain you probably already own.
