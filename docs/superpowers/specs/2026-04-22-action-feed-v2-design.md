# MOAT Command — Action Feed v2

- **Status:** Approved (brainstorm 2026-04-22)
- **Author:** Cristian Mendivelso + Claude
- **Target repo:** `moat-labs-dashboard` (Vercel: `moat-labs-dashboard.vercel.app`)
- **Baseline commit:** to be recorded before implementation starts

## Why

The current dashboard is a grid of 17 panels across 4 tabs. When Cristian opens it each morning the jobs-to-be-done is: **"What are the 3 things I have to do today?"** — not "how is every metric trending?". Today the dashboard answers the second question but not the first.

Option 3 (feed + drawer) was chosen over:
- Option 1 (add a "Hoy" tab): leaves the cognitive clutter of 5 tabs.
- Option 2 (collapse to 2 tabs): half-measure — still tab-based navigation.

## Goals

- First-paint view is a **priority feed**, not a grid. No horizontal tabs.
- Every feed item is **actionable in ≤ 2 clicks** (one to open drawer, one to fire the action).
- Protect the **14 Make.com scenarios** already in production — zero changes to data contracts.
- Keep it **vanilla JS + static deploy on Vercel**. No build tools, no framework, no new runtime deps.
- Deep-linkable sub-views via URL params (back/forward browser history works).

## Non-goals (YAGNI)

- No migration to React/Next/Vite.
- No replacement of Google Sheets as backend (Supabase already lives on the landing site, but out of scope here).
- No auth/middleware changes.
- No new Make scenarios.
- No brand/visual redesign — fonts and palette unchanged.

## Architecture

### Layer boundaries

| Layer | File(s) | Change in v2 |
|---|---|---|
| HTML shell | `index.html` | **Rewritten.** Replace tab nav + 4 tab panes with topbar + feed container + drawer + subview container. |
| Styles | `styles.css` | **Additive.** New blocks: `.feed-*`, `.drawer-*`, `.subview-*`, `.revenue-strip`. Legacy `.app-tab*` and tab panels kept in file but not referenced — cleanup in v3. |
| Render layer | `app.js` | **Add** `renderFeed(pipeline, outbound, followups)`, `openDrawer(itemId)`, `closeDrawer()`, `routeTo(view)`, `buildFeedItems(pipeline, outbound)`. Hook into existing `render(pipeline, contenido, metricas, contabilidad, gastos, outbound, prospecting, linkedin, analytics)` at `app.js:774` — call `renderFeed(pipeline, outbound)` first, then existing sub-view renderers as before. **Remove** the tab-switching render path from `renderTab(tab, args)` at `app.js:697`. |
| Data layer | `app.js` | **Untouched.** `fetchSheets`, `fetchTab`, `loadLiveData`, the `cachedOutbound` module-level var (`app.js:1492`), every webhook POST helper, and the 9-arg `render()` signature → no edits. |
| Backend | Google Sheets + Make | **Zero changes.** Same sheet ID, same columns, same webhook URLs. |

### Why this boundary is safe

Every Make scenario interacts with the dashboard through **webhook URLs invoked from event handlers** and **Google Sheet columns read by parser functions**. As long as:
1. The webhook URLs remain the same (they're string constants in `app.js`).
2. The parser functions keep reading the same columns (unchanged).
3. New action buttons preserve the same `id` and `data-*` attributes used by existing handlers.

…nothing in Make-land notices the refactor.

## Layout

```
┌────────────────────────────────────────────────────────┐
│ M  MOAT LABS           [💰] [📊] [⚙] [→]  ← topbar     │
├────────────────────────────────────────────────────────┤
│ $23,400 / $100,000  ████░░░░░░  23%       ← revenue    │
├────────────────────────────────────────────────────────┤
│                                                        │
│ 🔴 URGENTE — HOY  (N)                                  │
│   ○ <name> · <context>  [primary-action]               │
│   ○ ...                                                │
│                                                        │
│ 🟡 ESTA SEMANA  (N)       [collapse/expand]            │
│   ○ ...                                                │
│                                                        │
│ ⚪ ACTIVOS  (N)            [collapse/expand]            │
│   ○ ...                                                │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Clicking any feed item slides in a **drawer from the right** (400px wide on desktop, fullscreen on <640px).

## Feed composition rules

| Section | Source(s) | Filter |
|---|---|---|
| 🔴 Urgente (hoy) | `outbound` (arg) + `pipeline` (arg) | `Status="respondio"` (lead replied, needs manual reply), OR **Touch 2 due**: `SeqStep=1 AND daysSince(LastSent) >= 3`, OR **Touch 3 due**: `SeqStep=2 AND daysSince(LastSent) >= 5`, OR Pipeline `stage="reunion"` without a logged next step |
| 🟡 Esta semana | `outbound` (arg) + `pipeline` (arg) | `SeqStep=1 AND daysSince(LastSent) between 1 and 2` (Touch 2 coming soon), OR `SeqStep=2 AND daysSince(LastSent) between 3 and 4` (Touch 3 coming soon), OR deal `closeDate` within 1–7 days |
| ⚪ Activos | `pipeline` (arg) + `outbound` (arg) | Pipeline rows where `stage != won && stage != lost`; outbound rows where `Status != convertido && Status != perdido` |

Timing constants match the existing Make scenario `MOAT: Auto Follow-up Generator` (ID 4498104) which uses the same 3d/5d thresholds — so the dashboard and the scenario can't disagree about which leads are "due".

### Pre-implementation check

Before writing the filter for `stage="reunion"`, inspect the Pipeline sheet columns (via GViz fetch, or open the sheet directly). Confirm one of:
- A `NextStep`, `NextAction`, or `FollowupDate` column exists → use "empty or past-dated" as the "stalled" signal.
- A `LastUpdate` or `StageDate` column exists → use "stage=reunion AND stageDate > 7 days ago" as the fallback.
- Neither exists → **v2 fallback:** show all `stage=reunion` deals in 🔴 Urgente, trust the user to triage manually. Log a TODO for a new column in v3.

This is the only filter in the spec whose exact column name isn't documented in the current `CLAUDE.md`, so it gets resolved during implementation, not now.

Each section header shows a count badge. Sections with zero items are hidden (not shown as "0"), so the feed never pads with empty rows.

## Feed item anatomy

```
┌─ feed-item ────────────────────────────────────────┐
│ ●  <Contact/Deal name>  [score/stage badge]  [⌄]   │
│    <1-line context: industry · country · touch #>  │
│    <time indicator: "hace 4h" / "vence en 2d">     │
│                                [Primary action ▸]  │
└────────────────────────────────────────────────────┘
```

- `●` = dot color matching section urgency (red/yellow/gray).
- Primary action button chosen by status:
  - `Status=respondio` → **Reply** (opens drawer with compose pre-filled from AI).
  - `SeqStep due` → **Generate** (fires existing outbound-generate webhook).
  - `stage=reunion` no next-step → **Schedule** (opens booking link).
  - Pipeline deal at closing date → **Advance** (stage advance modal, existing).

## Drawer contents

When an item is clicked:

```
┌────────────────────────────┐
│ <Name>                 [×] │
│ ──────────────────────────│
│ Industry / Country / Score │
│ Sequence: Touch 1→2→3      │
│ Last sent: <ago>           │
│ ──── Message history ────  │
│ Subject: <from sheet>      │
│ Body: <from sheet>         │
│ ──── Actions ────          │
│ [Reply] [Generate]         │
│ [Switch to Manual/Auto]    │
│ [→ Pipeline] [Advance →]   │
└────────────────────────────┘
```

Every action button is wired to an **existing** function in `app.js`. No new business logic.

## Sub-views (💰 Finanzas, 📊 Panel, ⚙ Settings)

Activated via URL param:
- `?view=feed` (default, no param)
- `?view=finanzas` → shows current Finanzas sections (Contabilidad, Cascada, Forecast)
- `?view=panel` → shows current Contenido + Operaciones sections (Web Analytics, LinkedIn, SSI, Audience, Sales Velocity, Weekly Metrics)
- `?view=settings` → existing config panel (sheet ID)

`routeTo(view)` reads the URL param on load and on `popstate`, toggles visibility via `hidden` attribute. No client-side router dep.

Back/forward browser history works because `routeTo` uses `history.pushState` on topbar-icon clicks.

## Error handling

- **Sheet fetch fails** → banner at top of feed: "No pude cargar datos. [Reintentar]". Cached data from `localStorage` shown if present.
- **Webhook POST fails** → toast (existing `.refresh-toast` style): "No se pudo enviar. Mirá los logs de Make." Action button re-enables for retry.
- **Empty state** (no urgent, no weekly, no active) → hero empty state: "Todo limpio 🎯 · Generá nuevos touches o revisá Panel." (Not silence.)

## Testing plan (manual, browser)

Run `python3 -m http.server 8000` in the dashboard folder, open `http://localhost:8000`, and check:

1. **Feed renders:** three sections visible with correct counts.
2. **Drawer opens/closes:** click item → drawer slides in; `×` and Escape close it.
3. **Primary actions fire:** Reply/Generate buttons trigger the existing webhook handlers (check Network tab → same URLs).
4. **Sub-view routing:** click 💰 → URL becomes `?view=finanzas`, feed hides, Finanzas sections visible. Back button returns to feed.
5. **Mobile drawer:** resize to 375px → drawer covers full screen, has back button.
6. **Empty state:** set a throwaway sheet with zero rows → "Todo limpio" shows.
7. **Error state:** kill network → banner appears, cached data shown if present.

Production verification after deploy: run the same checks on `moat-labs-dashboard.vercel.app`, then send one real outbound email via the new UI and confirm Make scenario log shows successful write to Google Sheet.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Breaking production while editing | Commit baseline on current branch before first edit; deploy v2 to a Vercel preview URL first. |
| A webhook breaks because a button `id` changed | Preserve all `id` and `data-*` attributes that existing handlers reference; keep handler attachments during DOM rebuild. |
| User misses features in the new layout | Every current section is reachable via sub-views; nothing is deleted in v2. |
| Mobile drawer unusable | Drawer becomes fullscreen below 640px breakpoint with explicit back button. |

## Rollback plan

If production is broken post-deploy, revert the commit and redeploy. Since baseline commit is tagged, `git revert <v2-merge-sha>` is a one-line rollback.

## Out of scope for v2, tracked for v3

- Remove legacy CSS (`.app-tab*`, old tab panels) after v2 stabilizes.
- Unify design system with the `moatlab-ventures` landing (same fonts / tokens).
- Consider Supabase migration (move off Google Sheets) — separate spec.
- Quick-add actions on sub-views (add expense, log call) — separate spec.
