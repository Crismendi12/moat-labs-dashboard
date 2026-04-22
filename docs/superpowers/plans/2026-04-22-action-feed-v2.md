# MOAT Command — Action Feed v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `moat-labs-dashboard` from a 4-tab grid-of-panels into a single-page **priority feed + side drawer + URL-routed sub-views**, without touching the data layer or any Make.com webhook contract.

**Architecture:** Vanilla JS, static deploy on Vercel. HTML shell rewritten, CSS additive, `app.js` gains a thin render/routing layer that hooks into the existing `render(...)` at `app.js:774` and bypasses the tab-switching path in `renderTab(...)` at `app.js:697`. All existing render functions (`renderKPIs`, `renderFunnel`, `renderOutbound`, `renderContabilidad`, `renderCascada`, `renderForecast`, `renderWebAnalytics`, `renderContent`, `renderLinkedInPerformance`, `renderSSI`, `renderAudience`, `renderSalesVelocity`, `renderChart`) are left intact and invoked inside the new sub-view containers so their IDs keep working.

**Tech Stack:** HTML5, CSS3, vanilla ES5 JS, `el()` DOM builder helper (`app.js:251`), `field()` column accessor (`app.js:891`), `STAGES` constants (`app.js:22`), `cachedOutbound` module-level state (`app.js:1492`). No tests framework — verification is manual via `python3 -m http.server` + browser.

**Pre-conditions:** git clean on `main`, branch `v2-action-feed` does not exist yet.

---

## File structure

| File | Change type | Responsibility |
|---|---|---|
| `index.html` | Rewrite body (keep head) | New shell: topbar + revenue-strip + feed + drawer + subview containers wrapping existing sections |
| `styles.css` | Append block at end | New blocks: `.topbar-v2`, `.revenue-strip`, `.feed-*`, `.drawer-*`, `.subview-*` |
| `app.js` | Edit (surgical) | Add `routeTo`, `buildFeedItems`, `renderFeed`, `openDrawer`, `closeDrawer`; modify `renderTab` to skip old tab dispatch; modify `render` entry point to call `renderFeed` first |
| `vercel.json` | No change | CSP already permits same-origin JS and inline styles |
| `middleware.js` | No change | Auth untouched |

No new files. No new dependencies.

---

## Task 0: Baseline safety net

**Files:**
- Modify: repo state (git branch + commit)

- [ ] **Step 1: Confirm clean working tree except for `docs/superpowers/`**

```bash
cd /Users/cristianjaviermendivelsohincapie/Claude/projects/moat-labs/moat-labs-dashboard
git status
```

Expected: `On branch main`, `docs/superpowers/` listed as untracked, nothing else.

- [ ] **Step 2: Create and switch to `v2-action-feed` branch**

```bash
git checkout -b v2-action-feed
```

Expected: `Switched to a new branch 'v2-action-feed'`.

- [ ] **Step 3: Commit the spec + plan docs as baseline**

```bash
git add docs/superpowers/
git commit -m "docs(v2): action feed spec + plan"
```

Expected: commit created, working tree clean.

- [ ] **Step 4: Tag the pre-refactor commit for rollback**

```bash
git tag v1-pre-action-feed
```

Rationale: if v2 breaks in prod, `git revert <merge-sha>` or `git reset --hard v1-pre-action-feed` returns to the working dashboard in one command.

---

## Task 1: Verify local dev loop + inspect Pipeline columns

**Files:**
- Read: Google Sheet `1VcCoM6Un9G5XLddgvPCqc5dj4UCDpI_y76PIUM8fGIo` → Pipeline tab

- [ ] **Step 1: Start local static server**

```bash
cd /Users/cristianjaviermendivelsohincapie/Claude/projects/moat-labs/moat-labs-dashboard
python3 -m http.server 8000
```

Expected: `Serving HTTP on :: port 8000`.

- [ ] **Step 2: Load `http://localhost:8000` in the preview browser**

Use `preview_start` pointing at `http://localhost:8000`. Then `preview_snapshot` to confirm the current dashboard renders (4 tabs visible).

- [ ] **Step 3: Open the Pipeline sheet and list its column headers**

Open `https://docs.google.com/spreadsheets/d/1VcCoM6Un9G5XLddgvPCqc5dj4UCDpI_y76PIUM8fGIo/edit#gid=0` (Pipeline tab). Write the exact column names into a scratch note.

- [ ] **Step 4: Decide the "reunion without next-step" filter per spec pre-impl check**

Per spec section "Pre-implementation check":
- If a column like `NextStep`/`NextAction`/`FollowupDate` exists → filter = rows where that column is empty or date-past.
- If a column like `StageDate`/`LastUpdate` exists → filter = rows where `Etapa='1st Meeting'` AND that date is more than 7 days old.
- If neither exists → v2 fallback: include **all** `Etapa='1st Meeting'` deals in 🔴 Urgente. Add a TODO comment in `app.js` near `buildFeedItems` describing the column to add in a follow-up.

Record the chosen filter rule in a one-line comment to paste into `buildFeedItems` in Task 5.

- [ ] **Step 5: Kill the local server**

Press `Ctrl+C` in the terminal running `python3 -m http.server`.

No commit for this task — it's reconnaissance only.

---

## Task 2: Add new CSS blocks

**Files:**
- Modify: `styles.css` (append to end, do not touch existing blocks)

- [ ] **Step 1: Append the v2 CSS block to `styles.css`**

```bash
cat >> /Users/cristianjaviermendivelsohincapie/Claude/projects/moat-labs/moat-labs-dashboard/styles.css << 'CSS_EOF'

/* === v2 ACTION FEED ========================================= */
/* Topbar v2 (icon nav replaces tab strip) */
.topbar-v2 { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.topbar-v2__nav { display: flex; gap: 6px; align-items: center; }
.topbar-v2__icon { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; background: rgba(255,255,255,0.04); color: #cfd3dc; cursor: pointer; border: 0; transition: background 120ms ease; }
.topbar-v2__icon:hover { background: rgba(255,255,255,0.09); }
.topbar-v2__icon--active { background: rgba(99,102,241,0.18); color: #a5b4fc; }

/* Revenue strip (single compact line under topbar) */
.revenue-strip { display: flex; align-items: center; gap: 14px; padding: 12px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px; }
.revenue-strip__label { color: #9aa0aa; font-weight: 500; }
.revenue-strip__value { color: #f5f6f8; font-weight: 700; letter-spacing: -0.01em; }
.revenue-strip__bar { flex: 1; height: 6px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; max-width: 320px; }
.revenue-strip__fill { height: 100%; background: linear-gradient(90deg, #22c55e, #84cc16); transition: width 400ms ease; }
.revenue-strip__pct { color: #9aa0aa; font-variant-numeric: tabular-nums; }

/* Feed layout */
.feed-main { padding: 24px 20px 96px; max-width: 820px; margin: 0 auto; }
.feed-section { margin-bottom: 28px; }
.feed-section__header { display: flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa0aa; margin-bottom: 10px; font-weight: 600; cursor: pointer; user-select: none; }
.feed-section__dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }
.feed-section--urgente .feed-section__dot { background: #ef4444; }
.feed-section--week .feed-section__dot { background: #eab308; }
.feed-section--active .feed-section__dot { background: #6b7280; }
.feed-section__count { color: #f5f6f8; font-weight: 700; margin-left: 4px; }
.feed-section__chev { margin-left: auto; opacity: 0.5; transition: transform 160ms; }
.feed-section--collapsed .feed-section__chev { transform: rotate(-90deg); }
.feed-section--collapsed .feed-list { display: none; }

.feed-list { display: flex; flex-direction: column; gap: 6px; }
.feed-item { display: grid; grid-template-columns: 14px 1fr auto; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 120ms, border-color 120ms; }
.feed-item:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.1); }
.feed-item__dot { width: 8px; height: 8px; border-radius: 999px; }
.feed-item--urgente .feed-item__dot { background: #ef4444; }
.feed-item--week .feed-item__dot { background: #eab308; }
.feed-item--active .feed-item__dot { background: #6b7280; }
.feed-item__main { min-width: 0; }
.feed-item__title { color: #f5f6f8; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.feed-item__meta { color: #9aa0aa; font-size: 12px; margin-top: 2px; }
.feed-item__action { padding: 6px 12px; border-radius: 6px; background: rgba(99,102,241,0.18); color: #c7d2fe; border: 0; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.feed-item__action:hover { background: rgba(99,102,241,0.28); }
.feed-empty { padding: 32px 20px; text-align: center; color: #9aa0aa; font-size: 14px; border: 1px dashed rgba(255,255,255,0.08); border-radius: 10px; }

/* Drawer (right slide-in) */
.drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); opacity: 0; pointer-events: none; transition: opacity 160ms; z-index: 50; }
.drawer-overlay--open { opacity: 1; pointer-events: auto; }
.drawer { position: fixed; top: 0; right: 0; width: 400px; max-width: 100vw; height: 100vh; background: #12131a; border-left: 1px solid rgba(255,255,255,0.08); transform: translateX(100%); transition: transform 200ms ease; z-index: 51; overflow-y: auto; display: flex; flex-direction: column; }
.drawer--open { transform: translateX(0); }
.drawer__header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); position: sticky; top: 0; background: #12131a; z-index: 1; }
.drawer__title { font-size: 15px; font-weight: 700; color: #f5f6f8; }
.drawer__close { background: transparent; border: 0; color: #9aa0aa; font-size: 22px; cursor: pointer; width: 28px; height: 28px; }
.drawer__body { padding: 16px 20px; flex: 1; }
.drawer__row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.drawer__row-label { color: #9aa0aa; }
.drawer__row-value { color: #f5f6f8; font-weight: 500; }
.drawer__section-title { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa0aa; margin: 20px 0 8px; font-weight: 600; }
.drawer__message { background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; font-size: 13px; color: #cfd3dc; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
.drawer__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.drawer__action { padding: 8px 14px; border-radius: 6px; background: rgba(99,102,241,0.18); color: #c7d2fe; border: 0; font-size: 13px; font-weight: 600; cursor: pointer; }
.drawer__action--secondary { background: rgba(255,255,255,0.05); color: #cfd3dc; }
.drawer__action:hover { filter: brightness(1.15); }

@media (max-width: 640px) {
  .drawer { width: 100vw; }
  .feed-main { padding: 16px 12px 96px; }
}

/* Sub-view containers (wrap existing sections) */
.subview { padding: 24px 20px 96px; max-width: 1200px; margin: 0 auto; }
.subview[hidden] { display: none !important; }
.feed-main[hidden] { display: none !important; }
/* === END v2 ================================================ */
CSS_EOF
```

- [ ] **Step 2: Verify CSS file size grew ~3-5KB**

```bash
wc -l /Users/cristianjaviermendivelsohincapie/Claude/projects/moat-labs/moat-labs-dashboard/styles.css
```

Expected: line count increased by ~75-90 lines.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat(v2): add feed/drawer/subview CSS blocks"
```

---

## Task 3: Rewrite HTML shell (keep all existing section IDs)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace the `<nav class="app-tabs">` block with topbar-v2 icons**

Use `Edit` tool. Find the current nav block in `index.html` (starts at `<nav class="app-tabs" id="appTabs">`, ends at the closing `</nav>` before `<main class="dashboard">`) and replace it with:

```html
  <nav class="topbar-v2" id="topbarV2">
    <div class="topbar-v2__nav">
      <button class="topbar-v2__icon topbar-v2__icon--active" data-view="feed" aria-label="Feed" title="Hoy">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h12"/></svg>
      </button>
      <button class="topbar-v2__icon" data-view="finanzas" aria-label="Finanzas" title="Finanzas">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      </button>
      <button class="topbar-v2__icon" data-view="panel" aria-label="Panel" title="Analytics + contenido + ops">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      </button>
    </div>
  </nav>

  <div class="revenue-strip" id="revenueStrip">
    <span class="revenue-strip__label">Revenue YTD</span>
    <span class="revenue-strip__value" id="revenueStripVal">$0</span>
    <div class="revenue-strip__bar"><div class="revenue-strip__fill" id="revenueStripFill" style="width:0%"></div></div>
    <span class="revenue-strip__pct" id="revenueStripPct">0% of $100K</span>
  </div>

  <main class="feed-main" id="feedMain">
    <section class="feed-section feed-section--urgente" id="feedSectionUrgente">
      <div class="feed-section__header" data-section="urgente">
        <span class="feed-section__dot"></span>
        <span>Urgente — hoy</span>
        <span class="feed-section__count" id="feedCountUrgente">0</span>
        <span class="feed-section__chev">▾</span>
      </div>
      <div class="feed-list" id="feedListUrgente"></div>
    </section>
    <section class="feed-section feed-section--week" id="feedSectionWeek">
      <div class="feed-section__header" data-section="week">
        <span class="feed-section__dot"></span>
        <span>Esta semana</span>
        <span class="feed-section__count" id="feedCountWeek">0</span>
        <span class="feed-section__chev">▾</span>
      </div>
      <div class="feed-list" id="feedListWeek"></div>
    </section>
    <section class="feed-section feed-section--active feed-section--collapsed" id="feedSectionActive">
      <div class="feed-section__header" data-section="active">
        <span class="feed-section__dot"></span>
        <span>Activos</span>
        <span class="feed-section__count" id="feedCountActive">0</span>
        <span class="feed-section__chev">▾</span>
      </div>
      <div class="feed-list" id="feedListActive"></div>
    </section>
  </main>

  <div class="drawer-overlay" id="drawerOverlay" hidden></div>
  <aside class="drawer" id="drawer" aria-hidden="true">
    <div class="drawer__header">
      <span class="drawer__title" id="drawerTitle">—</span>
      <button class="drawer__close" id="drawerClose" aria-label="Close">×</button>
    </div>
    <div class="drawer__body" id="drawerBody"></div>
  </aside>
```

- [ ] **Step 2: Wrap the `finanzas` sections in a `.subview` container**

Find the current block of `<section class="card ..." data-tab="finanzas">` elements (3 sections: Contabilidad, Cascada, Forecast). Wrap them all inside:

```html
  <div class="subview" data-view="finanzas" id="subviewFinanzas" hidden>
    <!-- existing Contabilidad, Cascada, Forecast sections UNCHANGED -->
  </div>
```

Critical: do NOT change any `id=`, `class=`, or internal markup of the existing sections. Only wrap.

- [ ] **Step 3: Wrap the `contenido` + `operaciones` sections in a `.subview` container**

Same approach for sections tagged `data-tab="contenido"` (Web Analytics, Content Calendar, LinkedIn Performance, SSI, Audience) and `data-tab="operaciones"` (Sales Velocity, Weekly Metrics, Quick Actions). Combine them into a single subview:

```html
  <div class="subview" data-view="panel" id="subviewPanel" hidden>
    <!-- existing Contenido sections UNCHANGED -->
    <!-- existing Operaciones sections UNCHANGED -->
  </div>
```

- [ ] **Step 4: Remove the `<section class="kpi-grid" data-tab="ventas">` and the 7 other ventas sections**

These are replaced by the feed. Delete them from `index.html`.

The sections to delete (all with `data-tab="ventas"`): `.kpi-grid`, Pipeline Funnel, Intel Briefs, Intel Modal, Outbound Queue, Prospecting, Contact Segments, Follow-ups Pendientes.

Note: the Intel Modal HTML (`<div class="intel-modal-overlay">`) stays — it's invoked by `renderIntel` when a deal is clicked. Keep it outside the subviews, as a modal peer to the drawer.

- [ ] **Step 5: Keep the `<div class="quick-bar">` at the bottom**

The bottom quick-bar (Review / Responses / Pipeline) stays — it's the omnipresent action bar and it's wired to `updateQuickBar` at `app.js:718`. No change.

- [ ] **Step 6: Load `http://localhost:8000` and sanity check**

```bash
python3 -m http.server 8000
```

Use `preview_start` + `preview_snapshot`. Expected: topbar icons visible, revenue strip shows $0, three empty feed sections visible. Drawer hidden. Subviews hidden.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(v2): rewrite HTML shell with feed + drawer + subview containers"
```

---

## Task 4: JS routing layer

**Files:**
- Modify: `app.js` (add near the top of the IIFE, before the `STAGES` declaration at line 22)

- [ ] **Step 1: Add the routing block**

Use `Edit` to insert this block **immediately after the opening of the IIFE** (after the `(function () {` line). Search for the first line of the file or use the opening brace as anchor.

```javascript
  // === v2 ROUTING ==============================================
  function currentView() {
    var p = new URLSearchParams(window.location.search);
    var v = p.get('view') || 'feed';
    return (['feed', 'finanzas', 'panel', 'settings'].indexOf(v) !== -1) ? v : 'feed';
  }

  function applyView(view) {
    var feed = document.getElementById('feedMain');
    var finanzas = document.getElementById('subviewFinanzas');
    var panel = document.getElementById('subviewPanel');
    var revStrip = document.getElementById('revenueStrip');
    if (feed) feed.hidden = (view !== 'feed');
    if (revStrip) revStrip.hidden = (view !== 'feed');
    if (finanzas) finanzas.hidden = (view !== 'finanzas');
    if (panel) panel.hidden = (view !== 'panel');
    document.querySelectorAll('.topbar-v2__icon').forEach(function (btn) {
      var active = btn.getAttribute('data-view') === view;
      btn.classList.toggle('topbar-v2__icon--active', active);
    });
  }

  function routeTo(view) {
    var url = view === 'feed' ? window.location.pathname : (window.location.pathname + '?view=' + view);
    history.pushState({ view: view }, '', url);
    applyView(view);
  }

  function wireRouting() {
    document.querySelectorAll('.topbar-v2__icon').forEach(function (btn) {
      btn.addEventListener('click', function () { routeTo(btn.getAttribute('data-view')); });
    });
    window.addEventListener('popstate', function () { applyView(currentView()); });
    applyView(currentView());
  }
  // === END v2 ROUTING ==========================================
```

- [ ] **Step 2: Call `wireRouting()` on DOMContentLoaded**

Find the existing `DOMContentLoaded` listener in `app.js` (search for `DOMContentLoaded`). Add `wireRouting();` as the first line inside the handler.

If no such listener exists, append to the IIFE (before the closing `})();`):

```javascript
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireRouting);
  } else {
    wireRouting();
  }
```

- [ ] **Step 3: Verify in browser**

Reload `http://localhost:8000`. Click each topbar icon. Expected:
- Clicking Feed → URL stays clean, feed visible.
- Clicking Finanzas → URL becomes `?view=finanzas`, feed hidden, Finanzas subview visible.
- Clicking Panel → URL `?view=panel`, Panel subview visible.
- Browser back button returns to previous view.

Run `preview_snapshot` after each click to confirm.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(v2): add routing layer (topbar + URL params + history)"
```

---

## Task 5: Feed builder + renderer

**Files:**
- Modify: `app.js` (add functions near the end of the IIFE, before the `DOMContentLoaded` block)

- [ ] **Step 1: Add `buildFeedItems()` — pure function, no DOM**

Insert this block before the closing `})();` of the IIFE:

```javascript
  // === v2 FEED =================================================
  function daysSinceDate(s) {
    if (!s) return Infinity;
    var d = new Date(s);
    if (isNaN(d.getTime())) return Infinity;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  /**
   * Compute prioritized feed items from pipeline + outbound rows.
   * Returns { urgente: [...], week: [...], active: [...] } where each item is:
   *   { id, kind, section, title, meta, actionLabel, actionKind, source }
   */
  function buildFeedItems(pipeline, outbound) {
    var urgente = [], week = [], active = [];
    var seen = {};

    (outbound || []).forEach(function (r, idx) {
      var id = 'ob-' + idx;
      var status = (field(r, 'Status') || 'nuevo').toLowerCase();
      var company = field(r, 'Company') || '';
      var contact = field(r, 'Contact') || '';
      var industry = field(r, 'Industry') || '';
      var country = field(r, 'Country') || '';
      var seqStep = parseInt(field(r, 'SeqStep')) || 0;
      var lastSent = field(r, 'LastSent') || '';
      var days = daysSinceDate(lastSent);

      var title = contact ? (contact + (company ? ' · ' + company : '')) : (company || 'Unknown');
      var meta = [industry, country].filter(Boolean).join(' · ');

      if (status === 'respondio') {
        urgente.push({ id: id, kind: 'outbound', section: 'urgente', title: title, meta: 'Respondió · revisar', actionLabel: 'Reply', actionKind: 'reply', source: r });
        seen[id] = true; return;
      }
      if (status === 'reunion' || status === 'convertido' || status === 'perdido') {
        if (status !== 'perdido') active.push({ id: id, kind: 'outbound', section: 'active', title: title, meta: meta + ' · ' + status, actionLabel: 'Open', actionKind: 'open', source: r });
        seen[id] = true; return;
      }

      // Auto sequence timing: Touch 2 at 3d, Touch 3 at 5d (matches Make scenario 4498104)
      if (seqStep === 1 && days >= 3) {
        urgente.push({ id: id, kind: 'outbound', section: 'urgente', title: title, meta: 'Touch 2 listo · ' + meta, actionLabel: 'Generate', actionKind: 'generate', source: r });
      } else if (seqStep === 2 && days >= 5) {
        urgente.push({ id: id, kind: 'outbound', section: 'urgente', title: title, meta: 'Touch 3 listo · ' + meta, actionLabel: 'Generate', actionKind: 'generate', source: r });
      } else if (seqStep === 1 && days >= 1 && days < 3) {
        week.push({ id: id, kind: 'outbound', section: 'week', title: title, meta: 'Touch 2 en ' + (3 - days) + 'd', actionLabel: 'Open', actionKind: 'open', source: r });
      } else if (seqStep === 2 && days >= 3 && days < 5) {
        week.push({ id: id, kind: 'outbound', section: 'week', title: title, meta: 'Touch 3 en ' + (5 - days) + 'd', actionLabel: 'Open', actionKind: 'open', source: r });
      } else {
        active.push({ id: id, kind: 'outbound', section: 'active', title: title, meta: meta + (seqStep ? ' · step ' + seqStep : ''), actionLabel: 'Open', actionKind: 'open', source: r });
      }
      seen[id] = true;
    });

    (pipeline || []).forEach(function (r, idx) {
      var id = 'pl-' + idx;
      var stage = field(r, 'Etapa') || '';
      if (stage === STAGES.LOST || stage === STAGES.NOWAY || stage === STAGES.WIN) return;

      var company = field(r, 'Empresa') || field(r, 'Company') || '';
      var contact = fullName(r);
      var val = parseFloat(String(field(r, 'Valor Deal') || '0').replace(/[$,]/g, '')) || 0;
      var valStr = val ? '$' + (val >= 1000 ? Math.round(val / 1000) + 'K' : val) : '';
      var title = (contact !== 'Unknown' ? contact : company) + (company && contact !== 'Unknown' ? ' · ' + company : '');
      var meta = [stage, valStr].filter(Boolean).join(' · ');

      // TODO(v3): When Pipeline sheet gains a NextStep/StageDate column,
      // refine this rule. Current v2 fallback: all Meeting-stage deals in Urgente.
      if (stage === STAGES.MEETING) {
        urgente.push({ id: id, kind: 'pipeline', section: 'urgente', title: title, meta: meta + ' · seguir paso', actionLabel: 'Advance', actionKind: 'advance', source: r });
      } else if (stage === STAGES.CLOSING) {
        week.push({ id: id, kind: 'pipeline', section: 'week', title: title, meta: meta + ' · cerrando', actionLabel: 'Advance', actionKind: 'advance', source: r });
      } else {
        active.push({ id: id, kind: 'pipeline', section: 'active', title: title, meta: meta, actionLabel: 'Open', actionKind: 'open', source: r });
      }
    });

    return { urgente: urgente, week: week, active: active };
  }
```

- [ ] **Step 2: Add `renderFeed()` — renders the three sections**

Append right after `buildFeedItems`:

```javascript
  var _currentFeed = { urgente: [], week: [], active: [] };

  function renderFeedList(items, containerId, sectionClass) {
    var list = document.getElementById(containerId);
    if (!list) return;
    clear(list);
    if (items.length === 0) {
      list.appendChild(el('div', { className: 'feed-empty', textContent: 'Nada pendiente 🎯' }));
      return;
    }
    items.forEach(function (it) {
      var item = el('div', {
        className: 'feed-item feed-item--' + sectionClass,
        'data-feed-id': it.id,
        onClick: function () { openDrawer(it.id); }
      }, [
        el('span', { className: 'feed-item__dot' }),
        el('div', { className: 'feed-item__main' }, [
          el('div', { className: 'feed-item__title', textContent: it.title }),
          el('div', { className: 'feed-item__meta', textContent: it.meta })
        ]),
        el('button', {
          className: 'feed-item__action',
          'data-action': it.actionKind,
          textContent: it.actionLabel,
          onClick: function (ev) {
            ev.stopPropagation();
            handleFeedAction(it);
          }
        })
      ]);
      list.appendChild(item);
    });
  }

  function renderFeed(pipeline, outbound) {
    _currentFeed = buildFeedItems(pipeline, outbound);
    renderFeedList(_currentFeed.urgente, 'feedListUrgente', 'urgente');
    renderFeedList(_currentFeed.week, 'feedListWeek', 'week');
    renderFeedList(_currentFeed.active, 'feedListActive', 'active');
    var cu = document.getElementById('feedCountUrgente'); if (cu) cu.textContent = _currentFeed.urgente.length;
    var cw = document.getElementById('feedCountWeek'); if (cw) cw.textContent = _currentFeed.week.length;
    var ca = document.getElementById('feedCountActive'); if (ca) ca.textContent = _currentFeed.active.length;
  }

  function wireFeedSectionToggles() {
    document.querySelectorAll('.feed-section__header').forEach(function (h) {
      h.addEventListener('click', function () {
        h.parentElement.classList.toggle('feed-section--collapsed');
      });
    });
  }
```

- [ ] **Step 3: Add `renderRevenueStrip(contabilidad)` — mirrors existing KPI logic**

Append after the feed functions:

```javascript
  function renderRevenueStrip(contabilidad) {
    var revenue = 0;
    (contabilidad || []).forEach(function (r) {
      revenue += parseFloat(String(field(r, 'Dinero')).replace(/[$,]/g, '')) || 0;
    });
    var pct = Math.min(Math.round((revenue / 100000) * 100), 100);
    var valEl = document.getElementById('revenueStripVal');
    var fillEl = document.getElementById('revenueStripFill');
    var pctEl = document.getElementById('revenueStripPct');
    if (valEl) valEl.textContent = '$' + revenue.toLocaleString('en-US');
    if (fillEl) fillEl.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '% of $100K';
  }

  // Placeholder — handleFeedAction + openDrawer defined in Task 6
  function handleFeedAction(item) { openDrawer(item.id); }
  function openDrawer(id) { /* stub, replaced in Task 6 */ console.log('openDrawer stub', id); }
  // === END v2 FEED =============================================
```

- [ ] **Step 4: Wire feed section toggles in `wireRouting`**

Edit `wireRouting()` to append one line at the end, before the `applyView(currentView());` call:

```javascript
    wireFeedSectionToggles();
```

- [ ] **Step 5: Verify**

Reload `http://localhost:8000`. Open browser console. The feed lists are still empty because `renderFeed` isn't called yet — that wiring happens in Task 7. For now, verify:
- No console errors.
- Clicking a section header collapses/expands it (even empty).

Run `preview_console_logs`; expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat(v2): add buildFeedItems + renderFeed (not yet wired)"
```

---

## Task 6: Drawer — open, close, action wiring

**Files:**
- Modify: `app.js` (replace the stubs from Task 5)

- [ ] **Step 1: Replace the `openDrawer` stub with real implementation**

Find the lines from Task 5:

```javascript
  // Placeholder — handleFeedAction + openDrawer defined in Task 6
  function handleFeedAction(item) { openDrawer(item.id); }
  function openDrawer(id) { /* stub, replaced in Task 6 */ console.log('openDrawer stub', id); }
```

Replace with:

```javascript
  // === v2 DRAWER ==============================================
  var _drawerItem = null;

  function findFeedItem(id) {
    var pools = [_currentFeed.urgente, _currentFeed.week, _currentFeed.active];
    for (var i = 0; i < pools.length; i++) {
      for (var j = 0; j < pools[i].length; j++) {
        if (pools[i][j].id === id) return pools[i][j];
      }
    }
    return null;
  }

  function renderDrawerBody(item) {
    var body = document.getElementById('drawerBody');
    if (!body) return;
    clear(body);
    var r = item.source;

    function row(label, value) {
      if (!value) return null;
      return el('div', { className: 'drawer__row' }, [
        el('span', { className: 'drawer__row-label', textContent: label }),
        el('span', { className: 'drawer__row-value', textContent: String(value) })
      ]);
    }

    if (item.kind === 'outbound') {
      var status = field(r, 'Status') || 'nuevo';
      var seqStep = parseInt(field(r, 'SeqStep')) || 0;
      var lastSent = field(r, 'LastSent') || '';
      var score = field(r, 'Score') || '';
      var subj = field(r, 'Subject') || '';
      var msg = field(r, 'Message') || '';
      [
        row('Status', status),
        row('Industry', field(r, 'Industry')),
        row('Country', field(r, 'Country')),
        row('Score', score),
        row('Sequence step', seqStep ? 'Touch ' + seqStep : '—'),
        row('Last sent', lastSent || '—')
      ].filter(Boolean).forEach(function (n) { body.appendChild(n); });

      if (subj || msg) {
        body.appendChild(el('div', { className: 'drawer__section-title', textContent: 'Último mensaje' }));
        if (subj) body.appendChild(el('div', { className: 'drawer__message', textContent: 'Asunto: ' + subj + '\n\n' + msg }));
        else body.appendChild(el('div', { className: 'drawer__message', textContent: msg }));
      }
    } else if (item.kind === 'pipeline') {
      [
        row('Etapa', field(r, 'Etapa')),
        row('Valor Deal', field(r, 'Valor Deal')),
        row('Empresa', field(r, 'Empresa') || field(r, 'Company')),
        row('Email', field(r, 'Email')),
        row('Notas', field(r, 'Notas') || field(r, 'Notes'))
      ].filter(Boolean).forEach(function (n) { body.appendChild(n); });
    }

    body.appendChild(el('div', { className: 'drawer__section-title', textContent: 'Acciones' }));
    var actions = el('div', { className: 'drawer__actions' });

    if (item.kind === 'outbound') {
      actions.appendChild(el('button', {
        className: 'drawer__action',
        textContent: item.actionLabel,
        onClick: function () { handleDrawerAction(item, item.actionKind); }
      }));
      actions.appendChild(el('button', {
        className: 'drawer__action drawer__action--secondary',
        textContent: 'Open row in sheet',
        onClick: function () { window.open('https://docs.google.com/spreadsheets/d/1VcCoM6Un9G5XLddgvPCqc5dj4UCDpI_y76PIUM8fGIo', '_blank'); }
      }));
    } else if (item.kind === 'pipeline') {
      actions.appendChild(el('button', {
        className: 'drawer__action',
        textContent: 'Advance stage',
        onClick: function () { handleDrawerAction(item, 'advance'); }
      }));
      actions.appendChild(el('button', {
        className: 'drawer__action drawer__action--secondary',
        textContent: 'Open row in sheet',
        onClick: function () { window.open('https://docs.google.com/spreadsheets/d/1VcCoM6Un9G5XLddgvPCqc5dj4UCDpI_y76PIUM8fGIo', '_blank'); }
      }));
    }

    body.appendChild(actions);
  }

  function openDrawer(id) {
    var item = findFeedItem(id);
    if (!item) return;
    _drawerItem = item;
    document.getElementById('drawerTitle').textContent = item.title;
    renderDrawerBody(item);
    document.getElementById('drawer').classList.add('drawer--open');
    var overlay = document.getElementById('drawerOverlay');
    overlay.hidden = false;
    requestAnimationFrame(function () { overlay.classList.add('drawer-overlay--open'); });
  }

  function closeDrawer() {
    document.getElementById('drawer').classList.remove('drawer--open');
    var overlay = document.getElementById('drawerOverlay');
    overlay.classList.remove('drawer-overlay--open');
    setTimeout(function () { overlay.hidden = true; }, 200);
    _drawerItem = null;
  }

  function handleDrawerAction(item, kind) {
    // Preserve existing webhook handlers by letting the user open the sheet row
    // or trigger existing UI via the old handlers below.
    // v2 keeps this minimal — deeper wiring (Generate/Reply/Advance) reuses
    // the existing buttons in the sub-views. In v2, the drawer is an overview
    // and the sheet is the source of truth for edits.
    if (kind === 'open') { /* no-op, drawer is already open */ return; }
    window.open('https://docs.google.com/spreadsheets/d/1VcCoM6Un9G5XLddgvPCqc5dj4UCDpI_y76PIUM8fGIo', '_blank');
  }

  function wireDrawer() {
    var close = document.getElementById('drawerClose');
    if (close) close.addEventListener('click', closeDrawer);
    var overlay = document.getElementById('drawerOverlay');
    if (overlay) overlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _drawerItem) closeDrawer();
    });
  }

  // Override the stub handleFeedAction: action button on feed items goes
  // straight to opening the drawer (v2 keeps one canonical path).
  function handleFeedAction(item) { openDrawer(item.id); }
  // === END v2 DRAWER ==========================================
```

- [ ] **Step 2: Call `wireDrawer()` inside `wireRouting`**

Add `wireDrawer();` on the line right after `wireFeedSectionToggles();` inside `wireRouting()`.

- [ ] **Step 3: Manual verify**

Reload `http://localhost:8000`. Still no real data (not wired yet). But:
- Open console, type `openDrawer('test')` — expected: no crash, nothing happens (findFeedItem returns null).
- Force an item: in console type `_currentFeed.urgente.push({id:'fake',kind:'outbound',title:'Test',meta:'test',source:{},actionLabel:'Generate',actionKind:'generate'})` then `openDrawer('fake')`. Drawer should slide in from right.
- Click overlay → drawer closes.
- Press Escape with drawer open → closes.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(v2): drawer open/close + Escape + overlay click"
```

---

## Task 7: Hook into main render() and neutralize the old tab path

**Files:**
- Modify: `app.js` — `render()` at line 774 and `renderTab()` at line 697

- [ ] **Step 1: Modify `render()` to call the new feed renderers first**

Find the body of `render(pipeline, contenido, metricas, contabilidad, gastos, outbound, prospecting, linkedin, analytics)` at line 774. Add three lines at the top of the body (after `lastRenderArgs = [...]`):

```javascript
    renderFeed(pipeline, outbound);
    renderRevenueStrip(contabilidad);
```

The rest of `render()` stays — it still triggers `renderTab` for whatever the current view expects, which keeps the sub-views populated.

- [ ] **Step 2: Modify `renderTab` to dispatch on view, not on tab**

The old logic assumes `tab ∈ {ventas, finanzas, contenido, operaciones}`. In v2 the sub-views are `finanzas` and `panel` (which combines `contenido + operaciones`). Rewrite the body of `renderTab(tab, args)` to the following (preserving signature so nothing else breaks):

```javascript
  function renderTab(tab, args) {
    var p = args[0], co = args[1], m = args[2], ct = args[3], g = args[4], ob = args[5], pr = args[6], li = args[7], an = args[8];
    var view = currentView();
    if (view === 'finanzas') {
      renderContabilidad(ct || [], g || []);
      renderCascada(ct || [], g || []);
      renderForecast(p, m);
    } else if (view === 'panel') {
      renderWebAnalytics(an || []);
      renderContent(co);
      renderLinkedInPerformance(co, m, li || []);
      renderSSI();
      renderAudience();
      renderSalesVelocity(p, g || [], co);
      renderChart(m);
    }
    // 'feed' view renders via renderFeed() called from render(), nothing to do here
    dirtyTabs[tab] = false;
    animateBars();
    updateQuickBar(args);
  }
```

- [ ] **Step 3: Make `applyView` trigger a re-render of the active sub-view**

After routing to a new view, the sub-view containers need their render to run once so they appear populated. Modify `applyView` — at the very end, add:

```javascript
    if (typeof lastRenderArgs !== 'undefined' && lastRenderArgs) {
      renderTab('feed', lastRenderArgs); // view-aware dispatch
    }
```

- [ ] **Step 4: Verify with live data**

Reload `http://localhost:8000`. Connect to the Google Sheet via the Settings panel (⚙ icon or manual param) if not already. Expected:
- Revenue strip shows real `$X` value.
- Feed populated: urgente/week/active counts match what you'd expect from the sheet.
- Click any feed item → drawer shows contact/company/meta.
- Click Finanzas icon → revenue/gastos/cascada/forecast visible.
- Click Panel icon → analytics, content, LinkedIn, SSI, audience, velocity, chart all visible.
- Browser back/forward restores the right view.

Run `preview_console_logs`. Expected: no errors (warnings from GA4 or GViz are fine).

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(v2): hook render() into feed + route-aware sub-view dispatch"
```

---

## Task 8: Full verification + Vercel preview deploy

**Files:**
- No source changes. Deploy only.

- [ ] **Step 1: Hard-reload + inspect each feed section**

With `python3 -m http.server 8000` running:

- `preview_start` → `http://localhost:8000`
- `preview_snapshot` → confirm feed visible with counts
- `preview_click` on each section header → confirm collapse/expand
- `preview_click` on first urgente item → drawer opens
- `preview_inspect` on `.drawer` → confirm `transform: translateX(0px)` and `width: 400px`

- [ ] **Step 2: Mobile viewport check**

- `preview_resize` to 375 x 812
- Click a feed item → drawer should fill viewport (check `preview_inspect` → `width: 375px`)
- Press Escape or tap overlay (use `preview_click` on the overlay) → drawer closes

- [ ] **Step 3: Sub-view routing check**

- `preview_click` on 💰 icon → URL updated, Finanzas sections visible, feed hidden
- `preview_click` on 📊 icon → Panel sections visible
- `preview_eval` with `window.history.back()` → returns to previous view
- `preview_network` → no new requests triggered on route change (data is cached)

- [ ] **Step 4: Webhook integrity check (no writes)**

Open the deployed dashboard or the local server. Do NOT click Send on any outbound email (that would trigger a live webhook). Instead, open the Outbound section via 📊 icon → Panel (or reach via direct DOM query). Confirm the existing Generate/Send buttons are still present with same IDs (visual check + `document.querySelectorAll('[data-action="generate"]').length > 0` in console).

- [ ] **Step 5: Push the branch to deploy a Vercel preview**

```bash
git push -u origin v2-action-feed
```

Expected: Vercel auto-creates a preview URL. Wait for the Vercel bot to comment the preview URL on the eventual PR (or check `vercel ls` if linked).

- [ ] **Step 6: Smoke test on Vercel preview URL**

Repeat Step 1 + Step 3 on the preview URL (not localhost). Extra checks:
- Service worker / caching: hard reload to avoid stale bundle
- Real GA4 event fires on load (check Network tab for `collect?tid=G-KH5HDFZVTR`)

- [ ] **Step 7: Open PR into main (do NOT merge automatically)**

```bash
gh pr create --title "feat(v2): action feed dashboard" --body "$(cat <<'EOF'
## Summary
- Replaces 4-tab grid with priority feed + drawer + URL-routed sub-views
- Zero changes to data layer (Google Sheets + 14 Make scenarios unaffected)
- Design spec: docs/superpowers/specs/2026-04-22-action-feed-v2-design.md
- Implementation plan: docs/superpowers/plans/2026-04-22-action-feed-v2.md

## Test plan
- [ ] Feed renders with real data on Vercel preview URL
- [ ] Drawer opens on every feed item, closes on overlay/Escape/×
- [ ] Finanzas + Panel sub-views load via topbar icons; URL params update
- [ ] Back/forward browser history works
- [ ] Mobile (375px) drawer fills viewport
- [ ] No console errors
- [ ] No changed webhook URLs or sheet column names

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Do NOT merge until Cristian confirms the preview URL behaves as expected.

- [ ] **Step 8: Task list update**

Mark plan complete. Any follow-ups (e.g., new Pipeline `NextStep` column, removing legacy CSS) open as separate v3 items.

---

## Self-review notes

Spec coverage check (ran against `2026-04-22-action-feed-v2-design.md`):

| Spec requirement | Plan task | Status |
|---|---|---|
| Topbar + revenue strip + feed + drawer layout | Task 3 | ✅ |
| URL param routing with back/forward history | Task 4 | ✅ |
| Feed composition rules (urgente/week/active filters) | Task 5 | ✅ |
| Drawer with contact info + actions | Task 6 | ✅ |
| Hook into existing `render()` at line 774 | Task 7 | ✅ |
| Neutralize tab-switching path in `renderTab` at line 697 | Task 7 | ✅ |
| Protect data layer (no webhook changes) | All tasks | ✅ (only `render` and `renderTab` touched; webhooks untouched) |
| Manual verification in browser + mobile | Task 8 | ✅ |
| Pipeline `NextStep` column pre-impl check + fallback | Task 1 + Task 5 TODO comment | ✅ |
| Keep `cachedOutbound`, `fetchSheets`, `loadLiveData` unchanged | All tasks | ✅ (never touched) |
| Preserve section `id` attributes so existing renderers still find DOM nodes | Task 3 (wrap, don't replace) | ✅ |
| Rollback plan | Task 0 tag `v1-pre-action-feed` | ✅ |

No placeholders found. No undefined functions referenced. Types and signatures consistent across tasks (`field(r, name)`, `STAGES.*`, `el(tag, attrs, children)`, `_currentFeed` shape).

One known gap: Task 6 `handleDrawerAction` currently opens the Google Sheet in a new tab rather than firing the outbound-generate or pipeline-advance webhooks directly. That's intentional for v2 (YAGNI — prevents accidental live sends). v3 can wire the drawer's Generate/Advance buttons to the existing webhook helpers once the feed + routing are proven stable.
