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
  so it can be swapped for Supabase later. Seed data (`data/*.json`) is read fresh on
  every load; only the team's changes are stored in localStorage, as an overlay.
  "Reset demo data" in Settings clears the overlay. **Never rename an `id` in the data
  files** (overlay entries point at ids). Works offline.
  Trade-off (acknowledged): no sync between team members. Top "next week" item.
- **Online vs offline - keep it simple.** Lead capture and all browsing work offline
  (localStorage). AI summaries and HubSpot push run only when there is a connection:
  when offline, those buttons are disabled with a short "needs connection" hint.
  **No queues, no background sync.** One exception: a tiny **network-first** service
  worker (`sw.js`) so the app reopens with no signal. Online, every request goes to the
  network first, so new deploys show up immediately; the saved copy is used only offline.
- **AI: Google Gemini API (free tier)** via a Netlify Function (`netlify/functions/ai.js`).
  Key in env var `GEMINI_API_KEY`; model name in env var `GEMINI_MODEL`
  (default: `gemini-3.8-flash`, fallback: `gemini-3.5-flash-lite`; both on the free tier,
  verified in Google's pricing docs Sep 2026). Do not use older model names. A user-supplied key in Settings overrides the env key.
  If no key is available, the UI shows a clear message, never a crash.
  Cache AI results per contact; regenerate only when a new encounter is added
  (free-tier rate limits + stable output).
  Privacy note: free tier data may be used by Google; fine for synthetic demo data,
  production would use a paid tier. Model swap = one file.
- **Second AI use: conference intake.** Same `ai.js` function (or a sibling). The
  function fetches the event URL **server-side** (no CORS issue), strips it to plain text
  (cap ~15k chars), and asks Gemini for a JSON draft: city, country, region
  (Europe / North America / Middle East / Asia-Pacific), verticals, estimated audience size,
  one-line description, and the 5 ratings (1-5) each with a one-line "why".
  - The prompt includes Grain's ICP, the rating rubric below, and 3 already-rated events
    from `data/conferences.json` as calibration examples (e.g. IAMTN, CES, Money20/20 Europe),
    so AI ratings are consistent with the seed data.
  - Validate the JSON (integers 1-5, region from the list); reject and show a clear error
    otherwise.
  - If the page can't be fetched or read: let the rep paste a description instead, or fill
    the ratings manually. The AI is a helper, never a blocker.
- **HubSpot: Netlify Function proxy** (`netlify/functions/hubspot.js`) because of CORS.
  Private-app token entered in Settings, sent per request, never stored server-side.
  Upsert by email (no duplicates). Contact only; company name stored as a text
  property on the contact (Company association = bonus).
  Lead source = conference name, lifecycle stage = Lead.
  **Demo mode** when no token: show exactly what would be sent. CSV export as backup.
- Time window: 13 months, Sep 2026 - Sep 2027 (so Sibos, the next event, is in the plan). Dates not yet announced are
  estimated from prior years and marked "estimated" in the UI.

## Scoring model (0-100)
Each factor rated 1-5 per conference, **each with a one-line rationale** shown in the UI
("why is this tier A?"). Factor score = (rating - 1) / 4.

| Factor | Weight | Meaning |
|---|---|---|
| ICP vertical fit | 35% | How much of the audience is PSPs / cross-border payments / travel / treasury |
| Buyer access | 30% | Seniority of attendees + structured meeting formats (hosted buyer programs, meeting apps) |
| Audience market fit | 15% | Where attendees come from (Europe/US/Israel-relevant), not where the venue is |
| Audience size | 10% | Diminishing returns (log scale), **multiplied by the ICP factor** |
| Travel effort from Tel Aviv | 10% | 5 = easy/short, 1 = long-haul/expensive |

- **Size only counts as much as the room is relevant:**
  `sizePoints = weight_size * sizeFactor * icpFactor` (where factor = (rating - 1) / 4).
  140,000 irrelevant people are worth nothing; a big relevant room keeps its size points.
- Modifier: **+5 cluster bonus** if another event with base score >= 55 is in the same
  region within 7 days (check on base score to avoid circularity).
- Tiers with actions: **A+ 90+** Must attend / **A 75-89** Top priority /
  **B 55-74** Attend if it clusters or budget allows / **C 40-54** Monitor / **D <40** Skip.
- **Borderline** label when the final score is within 3 points of any tier threshold.
- Principle: audience matters most; location mainly drives logistics and clustering.
- **Round the final score to a whole number before assigning the tier** (floating point
  otherwise turns 55.0 into 54.999 -> wrong tier).
- Scores, tiers and cluster bonuses are **computed in the app** from the ratings in
  `data/conferences.json`, never stored in the data file (so weight changes just work).
- Regions for clustering: Europe (incl. UK), North America, Middle East, Asia-Pacific.

## Cross-conference contact tracking
- Matching levels:
  1. Exact email or normalized LinkedIn URL -> **auto-link** (same person).
  2. Similar name + same company -> **high-confidence suggestion** the rep confirms.
  3. Similar name + **different company** -> **low-confidence suggestion** the rep confirms,
     shown carefully (two different people can share a name):
     "Same Jonathan Cohen? Last seen at Payoneer." [Yes] [No]
     If Yes: link the records and log a **job change** on the contact's timeline.
     If No: keep them separate and don't ask again for this pair.
- Fuzzy matches are never silent merges.
- Nudge copy uses no gendered pronouns: the data has no gender, and guessing from a name misgenders.
- Handle: nicknames (Jon/Jonathan, Mike/Michael), accents/casing, company suffixes
  (Ltd, Inc, GmbH), **job changes** (same person, new company = a signal, not a new
  contact; a move up in seniority is a positive signal).
- **The nudge appears at capture time**, while the rep is still talking to the person
  (matching runs locally, so it works offline).
- Relationship signal = hybrid:
  - Rules (transparent): number of encounters, time span, recency, temperature trend,
    concrete asks (volumes/amounts, pricing, demo, proposal, intro to CFO/finance/treasury,
    shortlist, references, budget, contract, RFP, questionnaire, security review, trial,
    pilot), seniority change. Six labels: New / Cooling - lost for now /
    Warming - new role, re-engage / Warming - act now / Stalled - possible tire-kicker /
    Steady - nurture.
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
7. Add conference with AI: rep enters name, dates and link -> AI drafts location, size,
   verticals and all 5 ratings with reasons -> rep sees the score, tier and
   Pros / Cons / Biggest drag, edits anything, then confirms. Nothing is saved without
   confirmation. Warn if the event looks like one already in the list (similar name or
   same URL): same entity-matching idea as contacts. Mark it "AI-drafted, confirmed by <rep>".
8. Settings: keys, team member names, reset demo data

Bonus (in order, only if time allows):
1. Weight sliders for scoring (auto-normalize + reset)
2. Business-card photo / voice note -> AI fills lead fields (Gemini reads images)
3. AI-drafted follow-up email
4. AI conference discovery by niche (AI suggests events we don't know about)

Out of scope: login/auth, team sync, calendar integration, budget tracking.

## Minimum depth per MVP item (timebox)
All MVP items except #7 are explicit requirements; #7 is our second AI feature in the brief, so **cut depth, not items**.
Rule: if an item runs past ~45 minutes, ship the thin version below and move on.
1. List: one table/card list; filters for vertical, region, tier, month + text search.
   Each event shows **Pros / Cons / Biggest drag**, derived from the ratings (no AI, no
   manual writing): Pros = factors rated 4-5 with their "why"; Cons = factors rated 1-2
   with their "why"; Biggest drag = the factor that lost the most points vs. its maximum
   (e.g. "Travel (-10 pts)"). Plus a **"Borderline"** label when the score is within
   3 points of a tier threshold. Goal: the rep sees *why*, and decides in context.
2. Planning: 12 month columns with event cards colored by tier; cluster badge;
   a short "gaps" list above the grid (simple rules). No maps.
3. Capture: one screen, 4 fields + "more" toggle for optional ones. Saving a lead
   should take under 10 seconds.
4. Matching: small hardcoded nickname map (~20 common names) + simple string similarity;
   contact view = a timeline list of encounters.
5. AI: one prompt, one button, cached result.
6. HubSpot: upsert contact only; demo mode; CSV export.
7. Add conference: one form (name, dates, link) -> one AI call -> review screen reusing
   the event card from item 1. Manual fallback = the same review screen with empty ratings.
8. Settings: one plain form.

## Data
- `data/conferences.json`: ~30-40 real fintech/payments/travel/treasury/SaaS events
  (researched separately), with the 5 factor ratings + rationales.
- `data/contacts.json`: synthetic demo data (fictional people and companies, encounters
  at past 2025-2026 editions of real conferences):
  - `people`: one record per real person (fields = latest known; `_demoCase` and
    `_expectedSignal` describe what each person demonstrates, use them to test).
  - `encounters`: one row per meeting, exactly as the rep typed it (`nameAsEntered`,
    company, title, note, temperature, rep). Job changes and name variants are visible
    here; history is derived from encounters, never overwritten.
  - `notSamePairs`: pairs the rep already said are different people (never ask again).
  - `liveDemoScript`: names to type on the capture screen to trigger each nudge type.
  - `team`: default rep names for Settings.
- Capture screen preselects the conference happening today; if none, the next upcoming
  one (demo-friendly). Always changeable in one tap.

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
- Local preview: `python3 -m http.server 8000` → `http://localhost:8000/`. Tests: `tests.html`
  in the browser, or `node tests/run.mjs` / `node tests/functions.mjs`. Netlify functions are
  tested on the live site.
