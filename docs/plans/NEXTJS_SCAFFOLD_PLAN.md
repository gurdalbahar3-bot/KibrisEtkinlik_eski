# Next.js + Supabase Scaffold Plan

**Status:** PLAN ONLY — execute after Phase 0 review  
**Stack:** Next.js (App Router) + Supabase + TypeScript + TR/EN i18n

---

## 1. Goals

- SEO-capable public pages
- Organizer OS with org context
- Server-side RPC/API calls (no service role in browser)
- Localization-ready (TR/EN)
- Path to checkout E2E without building full UI first

---

## 2. Recommended structure

```
src/
├── app/
│   ├── [locale]/
│   │   ├── (public)/
│   │   │   ├── page.tsx                 # Home / discovery
│   │   │   ├── events/[slug]/page.tsx
│   │   │   ├── venues/[slug]/page.tsx
│   │   │   └── ilce/[district]/page.tsx # SEO district pages (later)
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── callback/route.ts
│   │   ├── (organizer)/
│   │   │   ├── layout.tsx               # Org context guard
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── events/page.tsx
│   │   │   └── events/[id]/page.tsx
│   │   ├── (door)/
│   │   │   └── scan/page.tsx            # Later
│   │   └── layout.tsx
│   └── api/
│       └── v1/
│           ├── webhooks/payment/route.ts
│           └── health/route.ts
├── components/
├── lib/
│   ├── supabase/
│   │   ├── client.ts                    # Browser anon client
│   │   ├── server.ts                    # Server anon + cookie session
│   │   └── admin.ts                     # Service role — SERVER ONLY
│   ├── rpc/                             # Typed RPC wrappers
│   ├── organizations/                   # Org context helpers
│   └── i18n/
├── messages/
│   ├── tr.json
│   └── en.json
└── types/
    └── database.generated.ts            # supabase gen types
```

---

## 3. Dependencies (initial)

```json
{
  "dependencies": {
    "@supabase/ssr": "latest",
    "@supabase/supabase-js": "latest",
    "next": "latest",
    "next-intl": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "@types/react": "latest",
    "typescript": "latest",
    "vitest": "latest",
    "@playwright/test": "latest"
  }
}
```

---

## 4. Supabase client rules

| Client | Where | Key |
|--------|-------|-----|
| Browser | Client components | `SUPABASE_ANON_KEY` |
| Server | Server components, route handlers | `SUPABASE_ANON_KEY` + cookies |
| Admin | Webhooks, background jobs only | `SUPABASE_SERVICE_ROLE_KEY` |

**Never** import `admin.ts` from client components.

---

## 5. Build order (approved)

| Step | Deliverable | DB dependency |
|------|-------------|---------------|
| 1 | `create-next-app`, TS, ESLint | — |
| 2 | Supabase auth (login/logout/session) | — |
| 3 | Org context provider | 048 |
| 4 | Organizer layout + dashboard shell | 048 |
| 5 | Event list (RLS read) | — |
| 6 | Event CRUD via RPC wrappers | 047 |
| 7 | Commerce setup pages (045–046 RPCs) | — |
| 8 | Public event page (published only) | — |
| 9 | Checkout flow | 050 |
| 10 | Payment adapter integration | 052 |
| 11 | Ticket/reservation views | — |
| 12 | Door QR scan UI | — |
| 13 | Venue OS | — |
| 14 | District SEO pages | 049, 058 |
| 15+ | Discovery, social, analytics | 061+ |

**Rule:** Do not build steps 9–10 before core RPC path verified in integration tests.

---

## 6. RPC wrapper pattern

```typescript
// lib/rpc/events.ts
export async function upsertEventFormat(
  supabase: SupabaseClient,
  params: UpsertEventFormatParams
) {
  const { data, error } = await supabase.rpc('upsert_event_format_atomic', params);
  if (error) throw error;
  if (!data?.success) throw new RpcError(data.error_code);
  return data;
}
```

Centralize error codes; map to i18n messages in UI.

---

## 7. Organization context

After 048:

```typescript
// Active org from cookie or URL /organizer/[orgSlug]
// Membership verified server-side before rendering organizer routes
// RPC calls include org scope where required
```

---

## 8. i18n

- `next-intl` with `[locale]` segment
- Default locale: `tr`
- All user-facing strings in `messages/tr.json`, `messages/en.json`
- No Turkish hard-coded in RPC or payment logic

---

## 9. SEO (later phases)

- `generateMetadata` on event/venue/district pages
- Canonical URLs, Open Graph, JSON-LD
- Dynamic sitemap from Supabase read queries
- District pages for all 6 KKTC districts including İskele

---

## 10. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only
NEXT_PUBLIC_DEFAULT_LOCALE=tr
```

---

## 11. Scaffold commands (when approved)

```bash
npx create-next-app@latest . --typescript --app --src-dir --eslint
npm install @supabase/ssr @supabase/supabase-js next-intl
npx supabase gen types typescript --project-id <id> > src/types/database.generated.ts
```

Do not run until Phase 0 sign-off on frontend start.

---

## 12. PWA / door app

Later: door route as mobile-first PWA with minimal bundle.  
Reuse same Supabase auth + `can_scan_event` gate.
