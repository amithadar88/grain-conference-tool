# Grain Conference Intelligence Tool

Home assignment for Grain (grainfinance.com). Deliverables: live URL, GitHub repo,
5-10 min video. Budget: ~4-6 hours of build. Evaluated on: sales empathy, AI judgment,
cross-conference intelligence, shipping instinct, clear communication of trade-offs.
**A scrappy tool a salesperson would actually use beats a beautiful one that misses the point.**

## Who it's for
Grain's sales team (~25-person company, HQ Tel Aviv, sells in Europe + US).
Grain helps businesses manage FX/currency risk.
ICP: PSPs (payment service providers), travel wholesalers, cross-border payment companies,
businesses with FX exposure. Concentrated in fintech, payments, treasury.
Users are non-technical salespeople. The field-capture screen is used one-handed on a
phone, on a noisy show floor, often with bad Wi-Fi.

## Hard constraints
- **No build step.** Plain HTML/CSS/JS. Libraries only via CDN. A non-developer must be
  able to host and update it.
- **No secrets in code, ever.** Keys come from Netlify environment variables or the
  in-app Settings page (stored in the browser).
- **Everything must be free** (Netlify free plan, Gemini free tier, HubSpot free CRM).
- Hosting: Netlify, auto-deploy from GitHub `main`.

## Architecture decisions
- **Storage: localStorage**, all access through ONE data-layer module (e.g. `js/store.js`)
  so it can be swapped for Supabase later. Seed demo data loads on first visit.
  "Reset demo data" button in Settings. Works offline.
  Trade-off (acknowledged): no sync between team members. Top "next week" item.
- **Online vs offline - keep it simple.** Lead capture and all browsing work offline
  (localStorage). AI summaries and HubSpot push run only when there is a connection:
  when offline, those buttons are disabled with a short "needs connection" hint.
  **No queues, no background sync, no service-worker magic.**
- **AI: Google Gemini API (free tier)** via a Netlify Function (`netlify/functions/ai.js`).
  Key in env var `GEMINI_API_KEY`; model name in env var `GEMINI_MODEL`
  (default: `gemini-3.8-flash`, fallback: `gemini-3.5-flash-lite`; both on the free tier,
  verified in Google's pricing docs Sep 2026). Do not use older model names. A user-supplied key in Settings overrides the env key.
  If no key is available, the UI shows a clear message, never a crash.
  Cache AI results per contact; regenerate only when a new encounter is added
  (free-tier rate limits + stable output).
  Privacy note: free tier data may be used by Google; fine for synthetic demo data,
  production would use a paid tier. Model swap = one file.
- **HubSpot: Netlify Function proxy** (`netlify/functions/hubspot.js`) because of CORS.
  Private-app token entered in Settings, sent per request, never stored server-side.
  Upsert by email (no duplicates). Contact only; company name stored as a text
  property on the contact (Company association = bonus).
  Lead source = conference name, lifecycle stage = Lead.
  **Demo mode** when no token: show exactly what would be sent. CSV export as backup.
- Time window: rolling 12 months, Oct 2026 - Sep 2027. Dates not yet announced are
  estimated from prior years and marked "estimated" in the UI.

## Scoring model (0-100)
Each factor rated 1-5 per conference, **each with a one-line rationale** shown in the UI
("why is this tier A?"). Factor score = (rating - 1) / 4.

| Factor | Weight | Meaning |
|---|---|---|
| ICP vertical fit | 35% | How much of the audience is PSPs / cross-border payments / travel / treasury |
| Buyer access | 30% | Seniority of attendees + structured meeting formats (hosted buyer programs, meeting apps) |
| Audience market fit | 15% | Where attendees come from (Europe/US/Israel-relevant), not where the venue is |
| Audience size | 10% | Diminishing returns (log scale) |
| Travel effort from Tel Aviv | 10% | 5 = easy/short, 1 = long-haul/expensive |

- Modifier: **+5 cluster bonus** if another event with base score >= 55 is in the same
  region within 7 days (check on base score to avoid circularity).
- Tiers with actions: **A 75+** must attend / **B 55-74** attend if it clusters or budget
  allows / **C 40-54** monitor / **D <40** skip.
- Principle: audience matters most; location mainly drives logistics and clustering.

## Cross-conference contact tracking
- Matching levels:
  1. Exact email or normalized LinkedIn URL -> **auto-link** (same person).
  2. Similar name + same company -> **high-confidence suggestion** the rep confirms.
  3. Similar name + **different company** -> **low-confidence suggestion** the rep confirms,
     shown carefully (two different people can share a name):
     "Same Jonathan Cohen? Last time he was at Payoneer." [Yes] [No]
     If Yes: link the records and log a **job change** on the contact's timeline.
     If No: keep them separate and don't ask again for this pair.
- Fuzzy matches are never silent merges.
- Handle: nicknames (Jon/Jonathan, Mike/Michael), accents/casing, company suffixes
  (Ltd, Inc, GmbH), **job changes** (same person, new company = a signal, not a new
  contact; a move up in seniority is a positive signal).
- **The nudge appears at capture time**, while the rep is still talking to the person
  (matching runs locally, so it works offline).
- Relationship signal = hybrid:
  - Rules (transparent): number of encounters, time span, recency, temperature trend,
    concrete asks (volumes, pricing, demo, intro to finance/treasury), seniority change.
    Labels like: New / Warming - act now / Steady - nurture / Stalled - possible tire-kicker.
  - AI (Gemini) reads the free-text notes across all encounters (what rules can't do,
    e.g. "asked about hedging Q3 volumes" = buying intent) and writes a short
    relationship-arc summary + recommended next step. It may disagree with the rules
    label, and must say why.
- Nudges only for 2+ encounters; keep them short. Too loud = noise, too quiet = invisible.

## Scope - build in this order (tool must work end-to-end after each item)
MVP:
1. Conference list + filters + score/tier with "why" breakdown
2. Planning view: 12-month timeline by tier, clusters highlighted, gaps flagged
   (months/regions/verticals with no A/B event), status (Going/Considering/Skip) + assigned rep
3. Mobile-first field capture: current conference preselected; name, company, quick note,
   temperature (hot/warm/cold); everything else optional; offline
4. Repeat-contact matching + nudge at capture + contact view with the pattern
5. AI relationship-arc summary
6. HubSpot push (+ demo mode + CSV export)
7. Settings: keys, team member names, reset demo data

Bonus (in order, only if time allows):
1. Weight sliders for scoring (auto-normalize + reset)
2. Business-card photo / voice note -> AI fills lead fields (Gemini reads images)
3. AI-drafted follow-up email
4. AI conference discovery

Out of scope: login/auth, team sync, calendar integration, budget tracking.

## Minimum depth per MVP item (timebox)
All 7 MVP items are explicit requirements in the brief, so **cut depth, not items**.
Rule: if an item runs past ~45 minutes, ship the thin version below and move on.
1. List: one table/card list; filters for vertical, region, tier, month + text search;
   score breakdown in an expandable row.
2. Planning: 12 month columns with event cards colored by tier; cluster badge;
   a short "gaps" list above the grid (simple rules). No maps.
3. Capture: one screen, 4 fields + "more" toggle for optional ones. Saving a lead
   should take under 10 seconds.
4. Matching: small hardcoded nickname map (~20 common names) + simple string similarity;
   contact view = a timeline list of encounters.
5. AI: one prompt, one button, cached result.
6. HubSpot: upsert contact only; demo mode; CSV export.
7. Settings: one plain form.

## Data
- `data/conferences.json`: ~30-40 real fintech/payments/travel/treasury/SaaS events
  (researched separately), with the 5 factor ratings + rationales.
- `data/contacts.json`: synthetic demo contacts with deliberate edge cases
  (name variations, job changes, warming vs tire-kicker patterns).

## Open questions sent to Grain (assumptions until answered)
- Conference presence: assume attendees with pre-booked meetings, not booths
- Buying signals: assume volumes, pricing, intro to finance/treasury
- Lead capture today: assume quick phone notes
Update this section if Noa replies.

## Working rules
- Keep it simple. Prefer fewer files and no dependencies.
- UI in English. Mobile-first for the capture screen.
- After meaningful work, add a line to `AI_LOG.md` (what AI helped with / where it got
  in the way). This feeds the video.
- Commit small, working increments.
