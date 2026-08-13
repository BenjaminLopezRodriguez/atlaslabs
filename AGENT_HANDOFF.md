# Agent handoff — 2026-08-13

## What happened

Local Cursor workspace started as a **design-led T3 marketing scaffold** (warm clay/sand/ink theme, specialist-models positioning, About/team/partners). The production product lived on GitHub at `BenjaminLopezRodriguez/atlaslabs` (WorkOS auth, `/app` spaces/chat, `/api/v1`, CLI, machines).

We **cloned the GH repo into `temp/atlaslabs`**, rsynced product functionality into this workspace, then **restored local marketing/design** on top.

## Keep (design SoT)

- `src/app/page.tsx` — models-first homepage (not remote “agentic coding” landing)
- `src/app/about/` — founders + partners carousel + overlay cards
- `src/styles/globals.css` — clay `#c96442`, sand, ink, Newsreader display, Baskerville logo
- `src/components/logo-product-name.tsx` (+ `AtlasHeroLogo`), `overlay-card.tsx`, `partners-carousel.tsx`, `product-primitive.tsx`, `prompt-box.tsx`
- `public/brand/`, `public/team/`, `public/partners/`
- `product.md` — company positioning source of truth

## Ported (product function)

- WorkOS AuthKit (`src/server/auth.ts`, middleware, `/sign-in`, `/app/**`, `/api/v1/**`)
- Full schema/migrations (`drizzle/`), CLI package, worker/docker/infra
- App UI under `src/components/atlas/**` (restyle later if needed; tokens mapped)

## Wiring done

- Marketing CTAs → `/sign-in` / `/app` + `UserMenu` (no NextAuth)
- `/about` is public in `src/middleware.ts`
- Layout: AuthKitProvider + Geist + Newsreader + Libre Baskerville (`--font-logo`)
- App `--signal` / `code-*` CSS tokens added onto warm palette (signal = clay)

## Env / Vercel

- Linked to Vercel project `atlaslabs` (https://www.atlaslabs.id)
- Pulled env into `.env.local` (gitignored). Sensitive vars `WORKOS_COOKIE_PASSWORD` and `ATLAS_ENCRYPTION_KEY` **cannot** be pulled via CLI (`[SENSITIVE]`); local random stand-ins were generated for boot. Paste real values from Vercel dashboard for prod parity.
- Localhost overrides: `NEXT_PUBLIC_APP_URL` + `NEXT_PUBLIC_WORKOS_REDIRECT_URI` → `http://localhost:3000…`
- Ensure WorkOS allowlists `http://localhost:3000/auth/callback`

## Do not commit

`.env*`, `.env.vercel*`, `temp/`, `.pnpm-store/`

## Next useful work

1. Restyle `/app` chrome to fully match marketing tokens (still partly remote UI language)
2. Confirm WorkOS redirect + sensitive keys for local auth flows
3. Align DB migrations with Neon URL from Vercel (`pnpm db:migrate`)
4. Remove unused remote landing components if dead (`components/atlas/hero` etc. unused by homepage)
