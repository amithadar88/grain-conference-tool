# Grain Conference Intelligence Tool: Design Spec

Date: 2026-09-26 · Status: approved in brainstorming, pending written review
Source of truth for decisions not repeated here: `CLAUDE.md`, `Decisions.md`, `data/*.json`.
This spec records how those decisions are built, plus the changes agreed during brainstorming.

## 1. Goal and success criteria

A tool Grain's sales reps actually use to (1) decide which events to attend and why,
(2) capture leads one-handed on a show floor, including offline, (3) recognise repeat contacts across
conferences at capture time, (4) read the relationship pattern (rules + AI), and (5) get
leads into HubSpot.

Success means:
- Works end-to-end after each build-order item (CLAUDE.md "Scope").
- Every score and every signal shows *why*.
- Saving a lead takes under 10 seconds and works with no signal, including reopening the
  site with no signal.
- All tests in `tests.html` pass against the real data files.
- Fits the 4-6 hour build budget: cut depth, not items.

## 2. Changes to earlier decisions (agreed in brainstorming)

| Change | Why |
|---|---|
| Tiny **network-first service worker** (`sw.js`), the one exception to "no service-worker magic" | Without it the app won't reopen with no signal. Network-first so every deploy shows up immediately when online. |
| **Seed data read fresh** from `data/*.json` on every load; only team changes stored in localStorage as an **overlay** | Fixes to seed data reach existing users; "Reset demo data" = clear the overlay. Rule: **never rename an `id`** in data files. |
| Planning window **Sep 2026 – Sep 2027 (13 months)** | Sibos (Sep 28, preselected by Capture) appears in the Plan. |
| **6 relationship labels**, not 4: adds "Cooling - lost for now" and "Warming - new role, re-engage" | They're used in `contacts.json`. |
| Extended **concrete-ask keywords** (see §6.3) | Better buying-intent detection by rules. |
| `contacts.json`: David Cohen (Tranzio) `_expectedSignal` → **"New"** | Data error: 1 meeting = New, like Priya. |
| Nudges use **no pronouns** ("Last seen at Atlasbeds…") | The data has no gender; guessing from a name misgenders. |
| HubSpot: **search-then-create/update**; stage set only on create | Upsert without downgrading an existing stage (HubSpot rejects backwards moves). |
| HubSpot: two custom properties, **Grain lead source** and **Grain conference summary** | The cross-conference insight must reach the CRM. |
| **Pre-generated AI summaries** for Ahmed, Mark, Dana stored in `contacts.json` | Protects the demo from free-tier limits. |
| App **opens on Capture** if an event is running today, otherwise on **Events** | Show-floor-first. |

## 3. Architecture

Single page (`index.html`) with a bottom tab bar: **Events · Plan · Capture · Contacts · Settings**.
Plain HTML/CSS/JS using ES modules (`<script type="module">`), no libraries, no build step.

```
index.html            app shell, tab bar, <main> for the active view
styles.css            one stylesheet, mobile-first
sw.js                 offline cache (network-first, 3s timeout)
tests.html            browser test page (tiny built-in runner)
js/app.js             tab switching, start-tab logic, online/offline state
js/store.js           ONLY file that touches localStorage; merges seed + overlay
js/scoring.js         pure: score, tier, borderline, cluster, pros/cons/drag, gaps, window
js/matching.js        pure: normalisation, nicknames, match levels, conference duplicates
js/signals.js         pure: relationship rules, seniority, HubSpot summary line, CSV rows
js/validate.js        pure: validates AI outputs (intake draft, arc summary)
js/api.js             calls the Netlify functions; maps errors to friendly messages
js/views/eventCard.js shared event card + "Why?" detail (list, plan, add-review)
js/views/events.js    Events tab
js/views/plan.js      Plan tab
js/views/capture.js   Capture tab
js/views/contacts.js  Contacts list + contact page
js/views/addConference.js  Add-conference form + review screen
js/views/settings.js  Settings tab
netlify/functions/ai.js       Gemini proxy: tasks "status", "arc", "intake"
netlify/functions/hubspot.js  HubSpot proxy
```

- "Pure" modules take data in and return answers: no DOM, no storage, no network.
  This is what `tests.html` tests.
- Scores, tiers, clusters, gaps and signals are **computed on every render**, never stored.
- Functions are classic `exports.handler` CommonJS files using Node's built-in `fetch`.
  No `package.json`, no `npm install`.
- Tests run at `<site>/tests.html` (the browser won't read data files from disk).

## 4. Data layer (`store.js`)

### 4.1 Loading
On app start: `fetch('data/conferences.json')` and `fetch('data/contacts.json')` (served from the
service-worker cache when offline), then read the overlay and settings from localStorage and merge.
The store exposes read functions returning merged data, and write functions that only modify the overlay.

### 4.2 localStorage keys
- `grain.overlay.v1`: the team's changes (cleared by "Reset demo data"):
  ```
  {
    conferencePlans:  { [conferenceId]: { status: "going"|"considering"|"skip"|null, rep: string|null } },
    addedConferences: [ conference objects, same shape as seed + provenance fields ],
    addedPeople:      [ person objects ],
    personPatches:    { [personId]: { company?, title?, email?, linkedin? } },   // latest known
    addedEncounters:  [ encounter objects ],
    notSamePairs:     [ [personIdA, personIdB], ... ],   // added to seed notSamePairs
    unresolvedMatches:{ [newPersonId]: [candidatePersonId, ...] },
    aiSummaries:      { [personId]: summary object },    // overrides seed aiSummaries
    hubspotPushed:    { [personId]: ISO date }
  }
  ```
- `grain.settings.v1`: survives reset: `{ me, team: [names], geminiKey, hubspotToken }`.
  `team` defaults to `contacts.json` `team` when empty.
- The store takes a key prefix, so `tests.html` uses `grain.test.*` and never touches real data.

### 4.3 Record shapes
- **Conference (seed):** as in `data/conferences.json`. Added conferences also carry
  `addedBy`, `addedAt`, `source: "ai"|"manual"` (card shows "AI-drafted, confirmed by Maya, 26 Sep"
  or "Added manually by Maya, 26 Sep").
- **Encounter (new capture):** `{ id, personId, conferenceId, event, date, nameAsEntered, company,
  title, email, linkedin, temperature, note, rep, capturedAt, linkedBy }` where `event` = conference
  name, `date` = today, `linkedBy` = `"email"|"linkedin"|"confirmed"|"new"`. Seed encounters have
  `event` (past edition name) and no `conferenceId`: both are valid.
- **Person:** seed fields = latest known. Adding an encounter to a person patches their latest
  company/title/email/linkedin with the non-empty values typed. History is never overwritten:
  it is derived from encounters.
- **AI summary:** `{ label, arc, nextStep, agreesWithRules, disagreementReason, generatedAt,
  basedOnEncounters, model }`. Seed copies live in `contacts.json` under `aiSummaries`.

### 4.4 Rules
- Never rename an `id` in `data/*.json` (overlay entries point at ids).
- Reset demo data clears `grain.overlay.v1` only (asks for confirmation first).

## 5. Scoring, Events, Plan

### 5.1 Scoring (`scoring.js`)
As CLAUDE.md, plus these precise definitions:
- Factor share = (rating − 1) / 4. Points: ICP 35, Buyer access 30, Market 15, Travel 10,
  Size = 10 × sizeShare × icpShare.
- **Size rating** always from thresholds on `audienceSize`: <1,500 = 1; 1,500–3,999 = 2;
  4,000–9,999 = 3; 10,000–29,999 = 4; 30,000+ = 5.
- **Cluster (+5):** another event in the same region with base ≥ 55 whose date range is within
  7 days: `gap = max(startB − endA, startA − endB, 0)` in days, gap ≤ 7. The badge names the
  nearest partner: "+5 cluster: ITB Berlin (5 days)".
- **Final:** min(100, base + bonus), cleaned of float noise (round to 6 decimals), then
  `Math.round` (.5 goes up), then the tier.
- **Tiers:** A+ ≥ 90 Must attend / A 75–89 Top priority / B 55–74 Attend if it clusters or budget
  allows / C 40–54 Monitor / D < 40 Skip.
- **Borderline:** |final − t| ≤ 3 for any t in {40, 55, 75, 90}; the label says the direction:
  "Borderline: 2 pts below A" / "Borderline: 3 pts above B".
- **Pros** = factors rated 4–5 with their why; **Cons** = rated 1–2 with their why;
  **Biggest drag** = the factor with the largest (max points − points earned); for size, max = 10.
  Ties go to the heavier weight. Shown as "Travel (−10 pts)".
- **Window:** constant `WINDOW = { start: '2026-09', months: 13 }`.
- **Gaps:**
  - months in the window with no A+/A/B event starting in that month
  - regions (Europe, North America, Middle East, Asia-Pacific) with no A+/A event
  - core verticals (payments, cross-border, travel, treasury, fx) with no A+/A/B event

### 5.2 Events tab
- **Controls:** a sort toggle **Score** (default) / **Date**; filters for vertical, region, tier and
  month (window months); a text search on name, city and description; an "Add conference" button.
- **Card:**
  - name, dates (+ "estimated" tag when `dateStatus` is estimated), city/country
  - score, tier letter and action text, Borderline badge, cluster badge
  - status buttons Going / Considering / Skip, assigned rep (dropdown of team names)
  - a "Why?" toggle that opens Pros / Cons / Biggest drag, the 5 ratings with reasons,
    description, website link and notes
- Past events (end < today) are greyed with a "past" tag.

### 5.3 Plan tab
- **Gaps** list at the top, as short sentences ("No A/B event: Sep 2026, Dec, Jan, Jul, Aug").
- **Timeline:** 13 month columns; cards coloured by tier, showing score, cluster badge,
  status and rep. Tapping a card opens its detail.
- **Phone layout:** the columns stack vertically by month.

## 6. Capture, matching, signals

### 6.1 Capture tab
- **Conference:** preselected = the event running today (start ≤ today ≤ end), else the next
  upcoming, else the most recent. A large "Change" control lists all events.
- **Fields:**
  - Name, Company, Note (large textarea, works with phone dictation)
  - Temperature: three large Hot / Warm / Cold buttons, none preselected; a temperature is
    required, and Save shows a clear hint if it's missing
  - "More": email, LinkedIn, job title
- **Rep:** from Settings "I am". If not set, a one-time prompt picks from team names.
- **Save:**
  - writes to the overlay only (no network)
  - shows "Saved ✓ Dana Levi" plus the match outcome
  - clears the form and keeps the conference
- **Match panel:** appears under the fields while typing (debounced ~400 ms) as soon as a name
  (or email/LinkedIn) is entered.

### 6.2 Matching (`matching.js`)
**Normalisation**
- Lowercase, remove accents (NFD, strip diacritics) and punctuation, collapse spaces.
- **Company:** also strip suffixes such as ltd, limited, inc, llc, gmbh, sl, s l, bv, b v, sa, ag,
  plc, co, corp, srl, sas.
- **Email:** lowercase and trimmed.
- **LinkedIn:** strip protocol and `www.`, lowercase, strip the trailing `/`, compare the
  `linkedin.com/in/<slug>` part.
- **Nickname map (~20):** jon/jonny→jonathan, mike→michael, tom/tommy→thomas, kasia→katarzyna,
  sara→sarah, dave→david, dan/danny→daniel, bob/rob→robert, bill/will→william, liz/beth→elizabeth,
  kate/katie→katherine, alex→alexander, chris→christopher, nick→nicholas, matt→matthew,
  jim/jimmy→james, joe→joseph, ben→benjamin, sam→samuel, pepe→jose.

**Similarity**
- **Name similar:**
  - last tokens equal, or Levenshtein ≤ 1 when both have 4+ letters
  - AND first tokens canonically equal, or Levenshtein ≤ 1, or one is a single letter equal to
    the other's first letter
- A person is compared against their current `name` and every `nameAsEntered` in their encounters.
- **Company same:** the normalised strings are equal, or one starts with the other at a word
  boundary (brixa = brixa payments). An empty company is "unknown", never "different".

**Levels** (for a capture against every known person)

| Level | Condition | UI |
|---|---|---|
| auto | email equal, or LinkedIn equal | Linked automatically: "Linked to Katarzyna Nowak (same email)". No question. |
| high | name similar + company same | "Looks like Dana Levi (Vantelo Pay) · Warming - act now · 3 meetings" [Same person] [No] |
| low | name similar + company different or unknown | "Same Sara Mizrahi? Last seen at Atlasbeds (Finance Director, WTM London 2025)." [Yes] [No] |

- **Several candidates** (e.g. David Cohen with no company): all are shown, each with company +
  last event, plus a [New person] option.
- **notSamePairs** (seed + overlay): a candidate is never suggested for a person it is paired with.
- **Answers:**
  - **Yes / Same person:** the encounter joins that person (`linkedBy: "confirmed"`).
  - **No:** the capture becomes a new person, and the pair (new person, candidate) is added to
    `notSamePairs`.
  - **Ignored** (Save without answering): the capture becomes a new person, and the candidates go
    to `unresolvedMatches`. The contact page shows the question again. Nothing is merged silently.
- **Nudge volume:** the pattern (label, meeting count) is shown only when the matched person has
  2+ meetings. With 1 meeting, the panel shows only "Seen once before at <event>".
- **Conference duplicates** (Add conference) are a warning only:
  - Name: normalised, year numbers and punctuation removed; equal, or token-set overlap ≥ 0.8.
  - URL: full hostname (minus `www.`) + path (minus trailing `/`, query and hash) equal.
    `money2020.com/europe` ≠ `money2020.com/usa`.
  - UI: "Looks similar to Money20/20 Europe 2027", never a block.

### 6.3 Relationship signal (`signals.js`)
Encounters are sorted by date. Temperature ranks: cold 1 < warm 2 < hot 3.

**Concrete ask** = the note matches, at a word start and case-insensitive, any of:
- volume(s), an amount (e.g. `EUR 40M`, `~$5m`, `40M/month`)
- pricing / price, demo, proposal
- intro to (their) CFO / finance / treasury
- shortlist, references, budget, contract, RFP, questionnaire, security review, trial, pilot

**Seniority rank:** 5 = C-level/Chief/Founder/Owner; 4 = VP/Vice President;
3 = Head of / Director; 2 = Manager/Lead; 1 = other or unknown.

**Rules** (the first that applies wins):
1. **New**: 1 encounter.
2. **Cooling - lost for now**: the latest temperature is cold and some earlier one was warmer.
3. **Warming - new role, re-engage**: the latest company is not the same as the previous
   encounter's (empty = unchanged).
4. **Warming - act now**: the latest is hot AND (latest temp > previous temp, OR the latest note
   has a concrete ask).
5. **Stalled - possible tire-kicker**: 3+ encounters, span ≥ 182 days, never hot, no concrete ask
   in any note.
6. **Steady - nurture**: everything else.

**Reasons** (always shown with the label): meeting count · span in months · last met X months
ago · temperature trend (cold → warm → hot) · asks found (the matched words) · job change
"Atlasbeds → Sunmerra Tours" · seniority ↑/↓.

**Timeline markers:** a job change where the company differs from the previous encounter
(↑ if the seniority rank rose); a seniority change within the same company.

**Expected results with the seed data:**
- Dana: Warming - act now
- Mark: Stalled - possible tire-kicker
- Jonathan: Warming - new role, re-engage
- Sarah: Steady - nurture
- David T: New
- David C: New
- José: Steady - nurture
- Kasia: Warming - act now
- Tom: Cooling - lost for now
- Ahmed: Steady - nurture (rules; the AI is expected to disagree)
- Priya: New

**HubSpot summary line:** `<label> · <n> meetings · last met at <event> · "<last note, cut at
~80 chars with …>"`.

### 6.4 Contacts tab
- **List:** name, company, signal label, meeting count, last event; search box.
- **Buttons:** "Push all not yet pushed (N)", "Export CSV".
- **Contact page:**
  - name, company, title, email, LinkedIn
  - rules label + reasons
  - AI summary box (§7.2)
  - any unresolved match question
  - encounter timeline (event, date, name as typed, company, title, temperature, note, rep)
    with job-change and seniority markers
  - "Push to HubSpot" button

## 7. AI (Gemini via `netlify/functions/ai.js`)

### 7.1 Function
- `POST /.netlify/functions/ai` with a JSON body `{ task, key?, ... }`.
- **Key:** `key` from the request (Settings) overrides `process.env.GEMINI_API_KEY`.
  Neither → `{ ok:false, error:"no_key" }`.
- **Model:** `process.env.GEMINI_MODEL || "gemini-3.8-flash"`. On an error/overload, one retry on
  `gemini-3.5-flash-lite` if enough time remains.
- **Output format:** Gemini is called with JSON output requested (`responseMimeType:
  application/json`). The function only checks that the reply parses as JSON. Content
  validation happens in the browser (`validate.js`), so it's tested.
- **Time budget** (Netlify limit ~10 s): page fetch ≤ 4 s, Gemini call(s) share the rest.
  Target total < 9 s.
- **Errors** returned as `{ ok:false, error, message }`, shown in plain words by `api.js`:
  - `no_key` → "AI needs a key: add one in Settings"
  - `busy` (HTTP 429 from both models) → "AI is busy, try again in a minute"
  - `timeout` → "Took too long, try again or fill in manually"
  - `fetch_failed` → "Couldn't read that page: paste a description or fill in manually"
  - `bad_output` → "The AI's answer didn't make sense: try again or fill in manually"
  - anything else → "AI unavailable right now"
- **Tasks:**
  - `status` → `{ ok:true, hasServerKey, model }` (for Settings)
  - `arc` (§7.2)
  - `intake` (§7.3)
- The function never logs keys or request bodies.

### 7.2 Relationship-arc summary
- **Button:** "AI summary" on the contact page, only for 2+ encounters, disabled offline
  ("Needs connection").
- **Request:** Grain context (what Grain sells, ICP), the person, all encounters (date, event,
  title, company, temperature, note), the rules label + reasons, and the list of 6 labels.
- **Output:** `{ label (one of the 6), arc (2–3 sentences), nextStep (one sentence),
  agreesWithRules (bool), disagreementReason (required if false) }`.
- **Display:**
  - the AI label, arc and next step
  - if it disagrees with the rules, a highlighted line:
    "AI disagrees with rules: <reason>"
  - a footer: "AI · 26 Sep · based on 2 meetings"
- **Cache:** the overlay summary, else the seed summary.
  - If `basedOnEncounters` < the current count: shown dimmed, "New meeting since this summary",
    with a [Regenerate] button.
  - Otherwise no regenerate button (stable output, saves quota).
- **Seed summaries:** after deploy, generate for Ahmed, Mark and Dana on the live site.
  Settings → "Copy AI summaries (JSON)" copies them, and they're pasted into `contacts.json`
  under `aiSummaries`.

### 7.3 Add conference (intake)
- **Form:** name, start date, end date, "dates estimated" checkbox, link, optional
  "paste a description".
- **Buttons:** [Draft with AI] (disabled offline) and [Fill in manually].
- **Function (`intake`):**
  - validates the URL: http/https only; rejects `localhost`, `*.local`, IP-literal hosts and
    non-standard ports
  - fetches the page (4 s timeout, browser-like User-Agent)
  - strips `script`/`style`/tags, decodes basic entities, collapses whitespace, caps at 15,000 chars
  - if a pasted description is provided, uses that instead of / in addition to the page text
- **Prompt:**
  - Grain's ICP and the rating rubric (the 4 AI-rated factors with 1 and 5 anchors)
  - 3 calibration events (IAMTN, CES, Money20/20 Europe), sent by the browser from the seed data
  - the page text
- **Draft output:** `{ city, country, region, verticals[], audienceSize (int), description,
  ratings: { icpFit, buyerAccess, audienceMarket, travelEffort: { score, why } } }`.
  The size rating is computed from `audienceSize` by the thresholds.
- **Validation (`validate.js`):**
  - scores are integers 1–5
  - `why` is non-empty
  - region is one of the 4
  - `audienceSize` is a positive integer
  - verticals is a non-empty array of strings

  Failure → the `bad_output` message plus the manual route.
- **Review screen:** the event card from §5.2 in edit mode.
  - Every field is editable; score, tier, Pros/Cons/Drag update live.
  - The duplicate warning (§6.2) appears at the top.
  - Only [Confirm & save] saves; [Cancel] discards.
  - Manual fallback = the same screen with empty ratings (Confirm requires all ratings set).

## 8. HubSpot (`netlify/functions/hubspot.js`)
- `POST /.netlify/functions/hubspot` with `{ token, contacts: [ ≤10 payloads ] }`.
  The browser loops in batches of 10.
- **Payload** (built by `signals.js`, pure):
  - `email`, `firstname` (first token), `lastname` (rest), `company`, `jobtitle`
  - `grain_lead_source` = event name of the **first** encounter
  - `grain_conference_summary` = the summary line (§6.3)
- **Per call, the function:**
  1. ensures both custom properties exist: GET the property, and on 404 create it
     (`groupName: contactinformation`, type string; lead source = `text`, summary = `textarea`)
  2. per contact, searches by email:
     - found → PATCH the properties (no `lifecyclestage`)
     - not found → create with `lifecyclestage: "lead"`
- **Returns:** `[{ email, action: "created"|"updated"|"error", message }]`.
  - 401/403 → "HubSpot token invalid or missing permissions"
- **Token scopes** (in the README): `crm.objects.contacts.read`, `crm.objects.contacts.write`,
  `crm.schemas.contacts.write`.
- **No email** → the button reads "Add an email to push"; skipped in bulk and listed as skipped.
- **Demo mode** (no token in Settings): a panel shows the exact JSON per contact, labelled
  "Demo mode: nothing was sent. Add a HubSpot token in Settings to push for real."
- **After a push:** "Pushed ✓ <date>" stored in `hubspotPushed`; pushing again is allowed.
- **CSV export** (all contacts):
  - columns: name, company, title, email, linkedin, first event, last event, meetings,
    signal, last note
  - UTF-8 with BOM (so Excel shows é), RFC-4180 quoting
  - filename `grain-leads-YYYY-MM-DD.csv`

## 9. Settings
- **One form:**
  - "I am" (dropdown of team names)
  - team names (comma-separated; default from `contacts.json`)
  - Gemini key (optional; "overrides the site's key")
  - HubSpot token
  - AI status line (`status` task: "AI: ready (server key)" / "AI: ready (your key)" /
    "AI: needs a key")
- **Buttons:** "Copy AI summaries (JSON)", "Reset demo data" (confirm; clears the overlay only).
- **Key note:** "Keys stay in this browser and are sent only with each request."

## 10. Online/offline
- `app.js` tracks `navigator.onLine` plus `online`/`offline` events.
- **Offline:** AI and HubSpot buttons are disabled with "Needs connection". Capture, matching
  and browsing are unaffected. Any failed fetch still shows a friendly message.
- **`sw.js`:**
  - on install, pre-caches the app shell (all HTML/CSS/JS and `data/*.json`)
  - on every same-origin GET, tries the network with a 3 s timeout
  - on success, updates the cache and returns the fresh copy
  - on failure/timeout, returns the cached copy
  - never touches `/.netlify/functions/*` or non-GET requests
  - bumps a cache version string when the file list changes
  - no sync, no queues

## 11. Start behaviour
If any conference satisfies start ≤ today ≤ end → open the Capture tab; otherwise the Events tab.
The tabs are also reachable via hash (`#events`, `#plan`, `#capture`, `#contacts`, `#settings`)
so links and the video can deep-link.

## 12. Testing
### 12.1 `tests.html` (browser, pure logic + store)
A tiny runner (`test(name, fn)`, `eq(actual, expected)`) grouped by area, with green/red results
and a summary count. It loads the real `data/*.json`.

**Scoring**
- Money20/20 Europe 98 A+; EuroFinance 95 A+; PAY360 90 A+ (base 85, cluster +5);
  MPE 88 A (with cluster); IAMTN 76 A
- Money20/20 USA 73 B, Borderline, biggest drag = Travel (−10)
- Web Summit 39 D; CES 8 D
- rounding: a base that sums to 54.9999999 → 55 → B
- every seed event's size rating equals the threshold rating
- Pros/Cons for one known event

**Gaps** (verified independently from the real data, not from the docs)
- months = Sep 2026, Dec 2026, Jan 2027, Jul 2027, Aug 2027
- regions = North America, Middle East, Asia-Pacific
- core verticals = none

**Matching**
- the 4 `liveDemoScript` cases:
  - Sara Mizrahi @ Sunmerra → low, Sarah Mizrahi
  - Dana Levy @ Vantelo Pay → high, Dana
  - David Cohen, no company → 2 candidates
  - K. Nowak + email → auto, Kasia
- the two David Cohens never suggested as each other
- Jon→Jonathan; José/Jose + "S.L."; Brixa = Brixa Payments; Levi/Levy; Thompson/Thomson
- conference duplicates: Money20/20 Europe vs USA URLs differ; same URL warns; a similar name warns

**Signals**
- every person's `_expectedSignal` (Ahmed: the rules part "Steady - nurture")
- Dana's HubSpot summary line

**Validate**
- a good draft passes; score 0 or 6, an unknown region, a missing why, or a non-integer size
  → rejected
- an arc with an unknown label → rejected

**Store** (prefix `grain.test.`)
- adding an encounter shows up in merged data
- reset clears the overlay but keeps settings

### 12.2 Live-site checklist (manual, by Amit)
1. Settings shows "AI: ready (server key)".
2. Ahmed → AI summary disagrees with the rules and says why. The cached result survives a reload.
3. Add conference from a real event URL → sensible draft, card, confirm → appears in the list and Plan.
4. An unreadable URL → friendly message → paste description / manual route works.
5. A bad Gemini key in Settings → a clear message, no crash.
6. HubSpot, no token → demo panel shows the payload. With a free test-account token → contact
   created with both custom properties; push again → updated, not duplicated.
7. CSV opens in Excel with correct accents.
8. **Real phone:** open the site, then turn on airplane mode, close the browser, reopen the site,
   capture and save a lead; the AI/HubSpot buttons show "Needs connection".
9. Live demo script: type each `liveDemoScript` name on Capture and see the expected nudge.

## 13. Documentation deliverables
**First commit of the build (docs only):**
- **CLAUDE.md:** the service-worker exception (network-first), the Sep 2026 window, the overlay
  + never-rename-ids rule, the 6 labels, the extended ask keywords, pronoun-free nudges.
- **contacts.json:** David Cohen (Tranzio) `_expectedSignal` → "New".
- **Decisions.md:**
  - gaps line → months Sep 2026/Dec/Jan/Jul/Aug; no A-tier event in North America, Middle
    East or Asia-Pacific
  - scoring: *No A-tier event in North America (best ~73): travel cost from Tel Aviv pulls US
    events down. A deliberate call for the team: accept it, or raise the weight for the US.*
  - tech trade-offs: one exception to "no offline magic", a tiny network-first cache; seed data
    read fresh on every load, team changes as an overlay (rule: never rename an id)
- **AI_LOG.md**, four rows:
  1. Claude caught a real offline gap ("no service-worker magic" meant the app wouldn't reopen
     without signal) and asked instead of silently changing the decision; I chose network-first.
     (Helped)
  2. Confident but wrong: Claude said the planning gaps "match Decisions.md", but it had checked
     against the doc, not the data, and the doc was wrong (missing January and two regions).
     Fixed by computing expected results from the real data. Lesson: when AI says "verified",
     ask "against what?" (Got in the way)
  3. Claude ran the relationship rules by hand on all 11 demo contacts and found a data error
     (David Cohen/Tranzio). (Helped)
  4. A second AI (Claude in the chat) reviewed the spec and caught that seed data copied into
     localStorage would never update for existing users, and that Sibos fell outside the planning
     window. (Helped: one AI reviewing another)

**README: "Host and update it yourself"** (plain language, for a non-developer):
1. Connect the GitHub repo to Netlify (New site → Import from GitHub → pick the repo → Deploy;
   no build settings needed).
2. Add the Gemini key: Site configuration → Environment variables → `GEMINI_API_KEY`
   (optional `GEMINI_MODEL`) → redeploy.
3. Add or fix a conference: edit `data/conferences.json` on GitHub (copy an existing entry;
   ratings 1–5 each with a "why"; never rename an existing `id`) → commit → Netlify redeploys
   in ~1 minute.
4. HubSpot: create a private app with the three scopes, paste the token in Settings.
5. Reset demo data: Settings → Reset demo data.
6. Run the tests: open `<site>/tests.html`.

**Ongoing:** an `AI_LOG.md` row after each meaningful step; one or more commits per build-order item.

## 14. Build order
As CLAUDE.md (MVP 1–8, then bonus), with the docs commit (§13) first. The tool must work
end-to-end after each item. Timebox ~45 min per item; if over, ship the thin version described
in CLAUDE.md "Minimum depth".

## 15. Out of scope
Login/auth, team sync, calendar integration, budget tracking, sync queues/background sync,
HubSpot Company association and notes (bonus/next week), weight sliders / card scan / follow-up
email / discovery (bonus list, only if time allows).
