# MOAT Labs Sales Command Center

Dashboard deployed to https://moat-labs-dashboard.vercel.app

## Key URLs
- **Dashboard**: https://moat-labs-dashboard.vercel.app
- **Website**: https://www.moatlabs-ventures.com
- **Discovery call**: https://calendar.app.google/QLhJS3bpbAJfreNXA
- **Figma site**: https://berry-spiny-33866100.figma.site/

## Architecture
- Static HTML/CSS/JS dashboard, no build tools
- Google Sheets as backend via GViz API (read-only, public sheets)
- Make.com scenarios for writes (webhooks + Google Sheets modules)
- Vercel for hosting

## Sheet
- **ID**: `1adMI9FgiVyTK2CJd18Bc0AMou7_lN-6mVF56VqUKkF4`
- **Tabs**: Pipeline, Contenido, Metricas, Contabilidad, Gastos, Outbound, Prospecting
- **Outbound columns**: Company, Contact, Email, Industry, Score, LinkedIn, Country, Source, Subject(E), Message(F), Status(G), SeqStep(L), LastSent(M)
- **Prospecting columns**: Fecha, Resultados (AI-generated lead summaries from news)

## Make Scenarios (Team 512246, Org 3055410)
| ID | Name | Trigger | Purpose |
|---|---|---|---|
| 4481443 | MOAT: Image Upload | Webhook | Upload images to Google Drive, return public URL |
| 4481444 | MOAT: Image Cleanup | Daily schedule | Delete moat-img-* files > 5 days from Drive |
| 4481549 | MOAT: Intel Brief | Webhook | Competitive intelligence per deal (OpenAI) |
| 4481670 | MOAT: Outbound Generate | Webhook | AI cold email generation with segment playbooks (returns [SUBJECT][BODY]) |
| 4481672 | MOAT: Outbound Send | Webhook | Gmail send + Sheet status update + SeqStep/LastSent tracking (cols L:M) |
| 4482358 | MOAT: Outbound Bulk Insert | Webhook (2045122) | Insert leads into Outbound tab |
| 4482536 | MOAT: Auto Prospecting Weekly | RSS + OpenAI | Weekly lead discovery from news (writes to Prospecting tab) |
| 4485921 | MOAT: GA4 Weekly Sync | Weekly (Sun 7AM UTC) | GA4 Data API -> JSON -> Analytics tab (sources + pages) |
| 4486756 | MOAT: Quality Review Agent | Webhook (2047096) | AI quality gate for emails + posts -- scores 0-100, checks spam risk, personalization, tone |
| 4498104 | MOAT: Auto Follow-up Generator | Daily 8AM COT (13:00 UTC) | 3-touch sequence: reads SeqStep+LastSent, generates Follow-up (3d) or Break-up (5d) emails per timing rules |
| 4486974 | MOAT: Gmail Response Scanner | Daily 9AM COT (14:00 UTC) | Scans inbox for replies to outbound leads, cross-references with Outbound sheet, updates status to "respondio" |
| 4487158 | MOAT: Weekly Performance Report | Weekly Mon 7AM COT (12:00 UTC) | Reads Outbound+Pipeline+Contabilidad, generates HTML report via OpenAI, emails to Cristian |
| 4487489 | MOAT: Lead to Pipeline | Webhook (2046153) | Auto-creates Pipeline deal when outbound lead advances to "reunion" (company, contact, deal value) |
| 4487522 | MOAT: CEO Morning Brief | Daily 7AM COT (12:00 UTC) | Reads Pipeline+Outbound+Contabilidad via Sheets API, OpenAI generates daily brief, emails to Cristian |
| 4489887 | MOAT: Weekly Intel Report | Weekly (Sun, 604800s interval) | Reads Pipeline+Outbound, OpenAI generates competitive intel per active deal/hot lead, emails consolidated report to Cristian |

## Webhook URLs
| Purpose | URL |
|---|---|
| Content save | `https://hook.us2.make.com/c3shqln8sci3mpjah3yc7ee0jon6g7vy` |
| Image upload | `https://hook.us2.make.com/s1l7tm8ks682okpff9mwre6q6ns8nluw` |
| Intel brief | `https://hook.us2.make.com/rdwqhyu520zv8a8m1iw7vapd2mtooce5` |
| Outbound generate | `https://hook.us2.make.com/1usijuqofbwhidx4no9m66tbt7p25ccc` |
| Outbound send | `https://hook.us2.make.com/s8iaspjhtclvfi199jbtilzzmav3m66o` |
| Bulk insert | `https://hook.us2.make.com/aogm20aq0jwjwpjeg0nfmtyuwww2i9gs` |
| Quality review | `https://hook.us2.make.com/e8xxytekksirbfjoh9xohh6wjk2ernq6` |
| Lead to pipeline | `https://hook.us2.make.com/nzihpm5wjqulmh4kpk4u6g71s5fmqiuj` |

## Lead Source Differentiation
- **Source column** in Outbound sheet controls automation behavior
- `manual` / `personal` / `referido` = **Manual lead** -- Cristian leads the conversation, zero automation
  - Purple badge + left border in dashboard
  - "Compose" button (empty form, you write)
  - No sequence tracker (you manage your own timing)
  - Auto Follow-up Generator SKIPS these leads entirely
- Everything else (`auto`, `bulk`, `prospecting`, empty) = **Auto lead** -- full automation pipeline
  - Blue "Auto" badge
  - "Generate" button (AI writes + quality review)
  - 3-step sequence tracker (Touch 1 -> Follow-up -> Break-up)
  - Auto Follow-up Generator processes these leads
- **Toggle button** on each card: "Switch to Manual" / "Switch to Auto" -- updates Source column via webhook

## Domain Safety
- **Daily send limit**: 15 emails/day from dashboard (warm outreach only)
- **Cold outreach**: Handled by Catalina via Instantly (separate domain)
- **Quality gate**: Every email and post passes through Quality Review Agent (score 0-100) before send is enabled
- **Send button blocked**: If review score < 70 ("reject"), Send button disabled with "Revise first"
- **Volume tracking**: localStorage tracks daily sends, resets at midnight, shows progress bar in outbound section

## Segment Playbooks
- **5 segments** detected client-side via `detectSegment(source, industry, country, contact)`:
  - `vcs_latam`: VC partners in LATAM -- pitch portfolio value-add
  - `founders_latam`: Startup founders/CEOs in LATAM -- direct $5K-$10K client pitch
  - `warm_latam`: Connected operators in LATAM -- relationship nurture, no hard sell
  - `vcs_global`: International VCs -- LATAM bridge angle
  - `founders_global`: Non-LATAM founders -- global MOAT framework pitch
  - `default`: Fallback generic pitch
- Detection logic: Source column direct match > Country (LATAM keywords) + Industry/Contact (VC vs Founder keywords)
- Playbook instructions sent with Generate webhook as `{{1.playbook}}` -- OpenAI uses them as strategy layer
- Visual: gray segment badge on each auto lead card shows which playbook will be used

## 3-Touch Outbound Sequence
- **Columns**: SeqStep (L) and LastSent (M) in Outbound sheet -- added by Send scenario on first send
- **Touch 1** (Day 0): Initial outreach via Generate button -- sets SeqStep=1, LastSent=today
- **Touch 2** (Day 3+): Follow-up -- different angle, shorter, "Re:" subject threading -- sets SeqStep=2
- **Touch 3** (Day 8+): Break-up email -- closing the loop, gentle scarcity -- sets SeqStep=3 (done)
- **Auto Follow-up Generator** (4498104) runs daily, checks timing: SeqStep=1 + 3d elapsed -> generate Touch 2; SeqStep=2 + 5d elapsed -> generate Touch 3
- **Dashboard UI**: Sequence tracker shows Touch 1 / Follow-up / Break-up with done/current states + "Next touch in Xd" or "Ready for next touch" timing indicator
- **Human-in-the-loop**: Auto Follow-up writes to Subject/Message columns but does NOT send -- human reviews in dashboard and clicks Send

## Outbound Performance Metrics
- Dashboard panel between funnel and filters showing: Sent count, Response Rate, Meeting Rate, Conversion Rate
- **Segment breakdown table**: per-segment stats (sent, resp%, mtg%, conv%) with green highlight for above-average segments
- **Touch effectiveness**: which touch (1/2/3) generates the most responses -- informs sequence optimization
- All calculated on-the-fly from `cachedOutbound`, no new scenarios needed

## Content-Outbound Bridge
- Generate button sends 3 most recent published content titles to the webhook as `recentContent`
- OpenAI prompt instructs: reference content naturally as social proof IF relevant to lead's industry, skip if not
- Connects LinkedIn publishing strategy with outbound personalization

## Post-Response Context Panel
- Appears on "respondio" and "reunion" leads as a blue-tinted panel
- Shows: which touch triggered the response, playbook used, days since last touch
- **Suggested next actions**: specific steps for responded leads (reply within 24h, propose call) and meeting prep (pitch deck, research, scope definition)

## Discovery Link Integration
- All 6 playbook instructions include discovery booking link and moatlabs-ventures.com signature
- `warm_latam` playbook intentionally excludes booking link (relationship-first tone)
- Generate webhook sends `discoveryLink` and `website` in payload; OpenAI prompt references `{{1.discoveryLink}}` and `{{1.website}}`
- Every AI-generated email ends with P.S. booking link + professional signature

## Outbound-to-Pipeline Bridge
- Scenario `4487489`, webhook trigger
- When advancing a lead to "reunion", dashboard shows deal creation modal (pre-filled $5,000)
- On confirm: POSTs to webhook -> adds row to Pipeline sheet (contact, company, value, stage, date)
- "Skip, just advance" option for cases where Pipeline entry isn't needed yet

## CEO Morning Brief
- Scenario `4487522`, daily 7AM COT (12:00 UTC)
- Architecture: 3x `makeAPICall` GET (Pipeline, Outbound, Contabilidad) -> 3x `json:TransformToJSON` -> OpenAI editorial -> Gmail
- Brief format: Revenue tracker, action items today, pipeline health, outbound pulse, priority #1
- Minimal HTML, scannable in 30 seconds on phone, includes dashboard deep link
- Emails to cristian.mendivelso@mahway.com

## Quick Actions Bar
- Fixed bottom bar on all pages (mobile-optimized, 48px touch targets)
- 3 buttons with live counts: Review Queue (emails ready to send), Responses (leads who replied), Pipeline (total value)
- Counts update from cached sheet data on every render cycle
- Click navigates to relevant section (outbound, pipeline funnel)
- Red badge for urgent items (responses pending), orange for high queue

## Weekly Performance Report
- Scenario `4487158`, runs Monday 7AM COT
- Reads Outbound + Pipeline + Contabilidad sheets
- OpenAI generates HTML report: revenue vs $100K, pipeline summary, outbound stats, top 3 actionable recommendations
- Emails to cristian.mendivelso@mahway.com

## Connections
| Service | ID | Notes |
|---|---|---|
| Google Sheets | 7974818 | Active -- re-authorized 2026-03-22, used by Auto Prospecting + Bulk Insert |
| Google Sheets (legacy) | 7969638 | Re-authorized but prefer 7974818 |
| Google Sheets (legacy) | 2054388 | Re-authorized but prefer 7974818 |
| Gmail | 7969589 | For outbound sends |
| OpenAI | 7256127 | GPT-4o-mini for intel + outreach |
| Google Drive | 7969602 | Image upload/cleanup |
| LinkedIn | 7972049 | Unused for now |
| Google Analytics 4 | 7980892 | GA4 Data API -- property 510766684 ("Brand", account "MOATLABS Ventures") |

## GA4 Web Analytics
- **GA4 Property ID**: `510766684` (display name "Brand", account `373185421` "MOATLABS Ventures")
- **Measurement ID**: `G-KH5HDFZVTR` (installed on moatlabs-ventures.com + dashboard)
- **Scenario**: `4485921` uses `makeAnApiCall` POST to GA4 Data API `runReport` endpoint (NOT the `generateAnalyticsReports` module, which silently returns 0 rows)
- **Data flow**: 2x `makeAnApiCall` (sources + pages) -> 2x `json:TransformToJSON` -> `google-sheets:addRow` (mode "select", NOT "map")
- **Sheet tab**: Analytics (columns: Date, Sources JSON, Pages JSON)
- **Dashboard parser**: `parseAnalyticsFromSheet()` does `JSON.parse()` on the JSON strings, extracts `dimensionValues`/`metricValues`
- **Key Make lesson**: `google-sheets:addRow` with `mode: "map"` silently fails if column keys don't match headers. Always use `mode: "select"` with `values: {"0": ..., "1": ...}` and `useColumnHeaders: false`

## Lead Scoring
Calculated in dashboard JS, not stored. Score ranges:
- **85+ (Hot/Green)**: Perfect ICP fit - commoditized industry, LATAM, 10-50 employees, founder/CEO
- **70-84 (Warm/Orange)**: Good fit with 1-2 criteria gaps
- **<70 (Cold/Gray)**: Tangential fit, nurture needed

## Nurturing Pipeline
Dashboard tracks leads through 5 stages: `nuevo > contactado > respondio > reunion > convertido`. Visual funnel + filter buttons in Outbound tab. Stage stored in Status column of Outbound sheet.

## Known Issues
- Bulk Insert webhook 2045122 had 16 queued leads -- 3+ confirmed written, scenario processing every 15 min
- Other MOAT scenarios (Image Upload, Intel Brief, Outbound Generate/Send) may still reference old Sheets connections -- update to 7974818 when needed
