---
title: "The Greenfield Sandbox: Implementing Hard Tenant Isolation and Deterministic Data at Scale"
date: "2026-02-14T19:08:00.000Z"
template: "post"
draft: false
slug: "/posts/implementing-hard-tenant-isolation-and-deterministic-data-at-scale"
category: "programming"
tags:
  - typescript
  - relay
  - react
  - mongodb
description: "In over a decade of enterprise software development, I’ve noticed a recurring frustration: the more senior you become, the rarer it is to work on a truly \"greenfield\" project."
---

In over a decade of enterprise software development, I’ve noticed a recurring frustration: the more senior you become, the rarer it is to work on a truly "greenfield" project. Most of our day-to-day work involves navigating existing tech debt, respecting legacy migrations, or making incremental improvements to architectures decided years before we joined.

It is notoriously difficult to test large-scale architectural ideas—like physical tenant isolation or the Backend-for-Frontend (BFF) pattern—within a established corporate codebase. The risk to production is too high, and the friction of legacy systems is too great.

[**VinylVault**](https://github.com/mloitzl/vinyl-vault/) is my response to that constraint. It started as a personal record collection manager, but quickly evolved into a laboratory where I could implement a high-scale SaaS architecture from the ground up, focusing on three enterprise-level pillars: **Hard Data Isolation**, **Security by Design**, and **Deterministic Metadata Aggregation**.

---

## 1. Physical Isolation: Why `tenant_id` Isn't Enough

In the enterprise world, "Multi-Tenancy" is often handled logically via a column in a shared table. While this works, it creates a massive "leaky abstraction" risk and makes heavy users (the "noisy neighbor" problem) hard to manage.

For VinylVault, I implemented **Physical Tenant Isolation**. 

### Dynamic Database Routing
Every user or organization gets their own dedicated MongoDB database (e.g., `vinylvault_user_123`). My Domain Backend acts as a dynamic router. When a request hits the API, the `getTenantDb` connection manager performs a just-in-time lookup:

1.  It verifies the `tenantId` from a claims-based JWT.
2.  It checks an internal connection pool (a `Map<string, Db>`).
3.  If a connection is stale or missing, it dynamically connects to the tenant's specific sandbox.

This ensures that a coding error in a resolver can **never** result in data leakage between users—the database connection itself simply doesn't have access to other tenants' data.

### The Indexing Challenge
Managing hundreds of databases means you can’t manually manage indexes. I built an **Asynchronous Reconciliation Layer**. The first time a tenant accesses the system, the backend automatically verifies and creates the necessary text indexes and atomic counter documents before resolving the first GraphQL query.

---

## 2. The Blended Scoring Engine: Achieving Determinism

One of the hardest problems in music data is the inconsistency of community-driven APIs like Discogs and MusicBrainz. If you scan a barcode and get three results for "Nirvana - Nevermind," how do you programmatically select the "correct" one?

I built a **Normalization and Weighted Scoring Pipeline** that treats these external APIs as raw, untrusted data.

*   **Heuristic Grouping:** I use configurable affixes to strip non-semantic noise like `(2022 Remaster)` or `[Bonus Tracks]`, allowing me to group disparate results into a single deterministic `groupingKey`.
*   **Weighted Scoring:** Every release is scored based on metadata completeness (tracklists, label info, high-res cover art). Vinyl formats receive a specific weight boost.
*   **Double Dagger Delimiters:** To manage composite IDs across different sources, I used the `‡` (double dagger) character (e.g., `SOURCE‡ID`). This avoids the collision issues common with colons or dashes found in external IDs.

This ensures **Traceability**. My API doesn't just return a result; it returns the "why" behind the choice, exposing the score breakdown for every candidate.

---

## 3. The BFF Pattern: Security by Design

Security in modern web apps is often compromised by storing sensitive JWTs in `localStorage`. To solve this, I implemented a **Backend-for-Frontend (BFF)** layer.

### JWT Hiding
The BFF handles the "dirty work" of identity. The frontend only ever deals with a **secure, HTTP-only session cookie**. 
1.  The BFF validates the session.
2.  It identifies the user's active tenant.
3.  It generates a **short-lived, internally-scoped JWT** to talk to the Domain Backend.

This pattern, known as **"Token Exchange,"** means the frontend never sees the primary auth tokens, significantly reducing the surface area for XSS attacks.

---

## 4. Scaling the Frontend: Strict Relay & Atomic Design

After a decade of watching Redux stores grow into unmaintainable monsters, I refactored the VinylVault frontend to use **Relay** and a custom **Atomic Design System**.

### Fragment Colocation
Relay is my choice for enterprise scale because it forces **Strict Fragment Colocation**. Every component (like `RecordCard`) defines exactly what data it needs via a GraphQL fragment. This creates a "Contract-First" UI where over-fetching is physically impossible.

### "Render-as-you-Fetch"
I implemented the `useQueryLoader` pattern. In the collection view, the data fetch begins the millisecond a user initiates a navigation event. By the time the component finishes its first render, the data is already arriving from the BFF.

### The "Silent" Tenant-Switch Bug
In a multi-database architecture, the frontend cache is a liability. If you switch from your Personal collection to an Org collection, Relay’s normalized store might still hold IDs from the previous tenant. 

To fix this, I implemented a **Manual Store Purge** during the tenant switch mutation:
```typescript
const switchTenant = useCallback(async (tenantId: string) => {
  // 1. BFF updaes the session and returns new context
  const data = await executeGraphQLMutation(query, { tenantId });
  
  // 2. CRITICAL: Wipe the Relay cache to prevent ID overlap between DBs
  RelayEnvironment.getStore().getSource().clear();

  // 3. Update React context and navigate
  setActiveTenant(data.activeTenant);
  navigate('/'); 
}, []);
```

---

## The Lessons Learned

Building VinylVault on my own terms allowed me to prove that "Enterprise Grade" doesn't have to mean "Slow and Heavy." By using a **Monorepo (pnpm workspaces)**, **Stateless Backend Routing**, and **Strict GraphQL Contracts**, I’ve built a system that is arguably more robust than many of the production environments I've inherited in the past.

It turns out that when you remove the constraints of legacy systems, you can build software that is not only scalable and secure but a joy to maintain.

---

Star it on GitHub: [Vinyl Vault](https://github.com/mloitzl/vinyl-vault/)

Live in the near future @ [vinylvault.loitzl.com](https://vinylvault.loitzl.com)

---

### The Stack Summary:
*   **Architecture:** 3-Tier (Frontend -> BFF -> Domain Backend)
*   **Isolation:** Database-per-tenant (MongoDB)
*   **Fetching:** Relay (Strict Fragment Colocation)
*   **Language:** TypeScript (Strict Mode)
*   **Branding:** Tailwind CSS with a custom Atomic UI Library

***
