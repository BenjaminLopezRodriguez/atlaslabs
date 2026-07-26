# UX Bug Ledger — Atlas Labs

Living history. Rows are never deleted — fixed rows are marked with a date.

## 2026-07-26 — Fix session (hero + signed-in shell)

Scope: align signed-out hero with the manycat composer pattern
(`/Users/benji/projects/manycat` → `src/app/_fragments/chat/chat.tsx`), and give
the signed-in app a persistent chat shell.

### Bugs fixed

| ID | Slug | File | Fix |
|----|------|------|-----|
| X7 | heading-hierarchy-broken | components/atlas/hero.tsx:12 | Display-size `<p>Atlas</p>` visually outranked the `<h1>`; removed (nav already carries the wordmark), h1 promoted to the display element |
| B2 | radius-inconsistent | components/atlas/prompt-box.tsx:41 | Composer was `rounded-lg` while the reference/system uses a pill composer; now `rounded-3xl` with `focus-within` ring |
| — | design-drift-vs-reference | components/atlas/prompt-box.tsx | Suggestions were pill chips; now full-width `divide-y` rows matching the reference |
| N2 | navigation-dead-end (prevented) | app/app/w/…/workspace-view.tsx:24, …/chat-thread.tsx:170 | Sidebar is `md:flex`; back links kept but scoped `md:hidden` so <md still has an escape hatch |
| — | duplicate-shell-wrappers | app/app/w/… | Pages carried their own `min-h-svh` + background; now provided once by `app/app/layout.tsx` |

### Open — deferred, out of scope for this pass

| ID | Slug | File | Severity | Status |
|----|------|------|----------|--------|
| P4 | sidebar-no-mobile-affordance | components/atlas/app-sidebar.tsx:26 | P1 | open — sidebar is `hidden md:flex`; no drawer/hamburger below `md` |
| — | no-theme-toggle | — | P2 | open — reference sidebar has Theme; `globals.css` defines `.dark` tokens but no toggle exists |
| — | no-settings-or-signout | — | P2 | open — reference sidebar has Settings; no sign-out route exists in the app |
| — | no-usage-meter | — | P2 | open — reference sidebar shows a usage bar; Atlas has no billing/usage surface |
| E2 | thread-list-loading | components/atlas/app-sidebar.tsx:74 | — | addressed with a pulse skeleton; revisit if it causes CLS |

### Verification

- `tsc --noEmit` → 0 errors
- `next lint` → 0 warnings/errors
- `next build` → success, 26/26 static pages
- Desktop 1440×900 screenshot of `/` → matches reference layout; console clean
- **Not visually verified:** the signed-in shell (`/app`, sidebar) — the route
  redirects to WorkOS auth and no session was available during this pass.
  Mobile viewport also not visually confirmed.

### Recurring patterns

None yet — first session.
