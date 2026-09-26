# Grain Conference Intelligence Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the conference intelligence tool described in the spec: scored event list and 13-month plan, offline one-handed lead capture with cross-conference matching, rules + AI relationship signals, HubSpot push, and AI-assisted "Add conference". It must work end-to-end after every task.

**Architecture:** One `index.html` with bottom tabs; plain ES modules, no build step. Pure logic lives in `js/scoring.js`, `js/matching.js`, `js/signals.js`, `js/validate.js` (tested by `tests.html` and `node tests/run.mjs`). `js/store.js` is the only file touching localStorage: seed data from `data/*.json` is read fresh on every load, and the team's changes are an overlay. Two Netlify Functions (CommonJS, Node built-in `fetch`) proxy Gemini and HubSpot. A network-first service worker lets the app reopen offline.

**Tech Stack:** HTML, CSS, JavaScript ES modules (no libraries), Netlify static hosting + Functions (Node 18+), Google Gemini API (free tier), HubSpot CRM v3 API. Tests: a tiny home-made runner, run in the browser and in Node 24 (already installed; nothing to `npm install`).

**Spec:** `docs/superpowers/specs/2026-09-26-conference-tool-design.md` (read it with this plan). Also `CLAUDE.md`, `Decisions.md`, `data/*.json`.

**Note on the code in this plan:** every file below was prototyped and run before the plan was written: 89/89 logic tests, 19/19 function tests (fake network), every tab rendered in headless Chrome, and the capture / add-conference flows scripted end to end. Copy the code as written; if a test fails, the difference is in the copy.

## Global Constraints

- No build step, no `package.json`, no `npm install`, no libraries. Plain HTML/CSS/JS with `<script type="module">`.
- No secrets in code, ever. Gemini key: Netlify env var `GEMINI_API_KEY` (already set) or the rep's key from Settings. HubSpot token: Settings only, sent per request.
- Models: `process.env.GEMINI_MODEL || "gemini-3.8-flash"`, one fallback to `gemini-3.5-flash-lite`. Do not use older model names.
- `js/store.js` is the ONLY file that touches localStorage. Scores, tiers, clusters, gaps and signals are computed, never stored.
- Never rename an `id` in `data/*.json`.
- Every piece of user-typed, AI-written or fetched text goes through `esc()` before it is put into HTML.
- UI copy in English; nudges use no gendered pronouns.
- Offline: capture, matching and browsing work with no network. AI and HubSpot buttons carry `data-needs-net` (disabled offline with "Needs connection"). No sync queues, no background sync.
- Planning window: `{ start: '2026-09', months: 13 }` (Sep 2026 – Sep 2027).
- Work directly on `main`. Commit after every task with a message ending in:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push to `origin main` at the end of each task (Netlify deploys `main`).
- After meaningful work, add a row to `AI_LOG.md` (what AI helped with / where it got in the way).

## Conventions used in every task

- **Local preview server** (started in Task 1, keep it running): `python3 -m http.server 8000` from the repo root. App: `http://localhost:8000/`. Tests: `http://localhost:8000/tests.html`. Netlify functions do not exist locally; AI/HubSpot buttons show "AI and HubSpot only work on the live site (not in local preview)".
- **Logic tests:** `node tests/run.mjs` (prints `N/N passed`, exit code 1 on failure).
- **Expected texts assume today is 2026-09-26.** Relative values ("last met 4 months ago", the preselected event, "past" tags, the start tab) shift with the real date; judge those by the rule, not the literal text.
- **Headless render check** (prints the visible text of the page's `<main>`; paste the function and the call in the same shell command):

```bash
render() { perl -e 'alarm 25; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-extensions --user-data-dir="$(mktemp -d)" --virtual-time-budget=3000 --dump-dom "$1" 2>/dev/null | python3 -c "import sys,re,html;d=sys.stdin.read();m=re.search(r'<main id=\"view\">(.*?)</main>',d,re.S) or re.search(r'<body>(.*?)</body>',d,re.S);print(html.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',re.sub(r'<script.*?</script>',' ',m.group(1),flags=re.S))))[:${2:-600}])"; }
```

## Review Focus

The inputs and conditions below are implied by the spec but easy to miss. Each has a test in the owning task.

1. **Flaky show-floor Wi-Fi or a tab switch while typing a lead** must not lose the half-typed lead. Online/offline changes only toggle buttons (no re-render), and the capture form is saved as a draft on every keystroke. Tests: Task 3 "Capture draft survives a reload"; Task 8 step "switch tabs mid-typing".
2. **Text with HTML characters** (a note like `<50k volumes`, a company like `AT&T`, AI output, fetched pages, a hostile event name) must show literally, never as HTML, and never print "undefined" for missing optional fields (16 seed events have no website). Tests: Task 4 `tests/ui.test.js`.
3. **Saved data from an older version, or corrupted JSON in localStorage** (private mode, a half-written save) must not crash the app. Tests: Task 3 "Corrupted saved data…", "An old overlay missing newer fields…".
4. **Overlay entries pointing at ids that no longer exist** (someone renamed an id despite the rule) are ignored, not fatal. Test: Task 3 "Overlay entries pointing at ids that no longer exist…".
5. **The offline file list drifting from the real files**: a missing file makes the service worker fail to install; an unlisted file breaks the offline reopen. Test: Task 10, the `sw.js SHELL matches the files on disk` check in `tests/run.mjs`, re-run in Tasks 11 and 13 when files are added.

---

### Task 1: Docs and data corrections, README, local preview

**Files:**
- Modify: `CLAUDE.md` (storage, offline, time window, nudge copy, labels/asks, working rules)
- Modify: `Decisions.md` (time window, gaps, North America note, storage overlay, offline exception, nudge copy)
- Modify: `AI_LOG.md` (rows 14–17)
- Modify: `data/contacts.json` (David Cohen / Tranzio expected signal)
- Modify: `README.md` (replace the one-line file)

**Interfaces:**
- Consumes: nothing.
- Produces: `data/contacts.json` with `p-david-t._expectedSignal === "New"` (Task 7's tests read it). A local server on port 8000 used by every later task.

- [ ] **Step 1: Update CLAUDE.md, storage paragraph**

Replace:
```
  so it can be swapped for Supabase later. Seed demo data loads on first visit.
  "Reset demo data" button in Settings. Works offline.
```
with:
```
  so it can be swapped for Supabase later. Seed data (`data/*.json`) is read fresh on
  every load; only the team's changes are stored in localStorage, as an overlay.
  "Reset demo data" in Settings clears the overlay. **Never rename an `id` in the data
  files** (overlay entries point at ids). Works offline.
```

- [ ] **Step 2: Update CLAUDE.md, offline line**

Replace:
```
  **No queues, no background sync, no service-worker magic.**
```
with:
```
  **No queues, no background sync.** One exception: a tiny **network-first** service
  worker (`sw.js`) so the app reopens with no signal. Online, every request goes to the
  network first, so new deploys show up immediately; the saved copy is used only offline.
```

- [ ] **Step 3: Update CLAUDE.md, time window**

Replace:
```
- Time window: rolling 12 months, Oct 2026 - Sep 2027. Dates not yet announced are
```
with:
```
- Time window: 13 months, Sep 2026 - Sep 2027 (so Sibos, the next event, is in the plan). Dates not yet announced are
```

- [ ] **Step 4: Update CLAUDE.md, nudge copy (no pronouns)**

Replace:
```
     "Same Jonathan Cohen? Last time he was at Payoneer." [Yes] [No]
```
with:
```
     "Same Jonathan Cohen? Last seen at Payoneer." [Yes] [No]
```
and replace:
```
- Fuzzy matches are never silent merges.
```
with:
```
- Fuzzy matches are never silent merges.
- Nudge copy uses no gendered pronouns: the data has no gender, and guessing from a name misgenders.
```

- [ ] **Step 5: Update CLAUDE.md, asks and labels**

Replace:
```
    concrete asks (volumes, pricing, demo, intro to finance/treasury), seniority change.
    Labels like: New / Warming - act now / Steady - nurture / Stalled - possible tire-kicker.
```
with:
```
    concrete asks (volumes/amounts, pricing, demo, proposal, intro to CFO/finance/treasury,
    shortlist, references, budget, contract, RFP, questionnaire, security review, trial,
    pilot), seniority change. Six labels: New / Cooling - lost for now /
    Warming - new role, re-engage / Warming - act now / Stalled - possible tire-kicker /
    Steady - nurture.
```

- [ ] **Step 6: Update CLAUDE.md, working rules**

Replace:
```
- Commit small, working increments.
```
with:
```
- Commit small, working increments.
- Local preview: `python3 -m http.server 8000` → `http://localhost:8000/`. Tests: `tests.html`
  in the browser, or `node tests/run.mjs` / `node tests/functions.mjs`. Netlify functions are
  tested on the live site.
```

- [ ] **Step 7: Update Decisions.md, time window**

Replace:
```
- Rolling 12 months (Oct 2026 - Sep 2027), because that's how a team actually plans.
```
with:
```
- 13 months (Sep 2026 - Sep 2027): a year ahead from today, which is how a team actually
  plans, and it includes Sibos (end of Sep 2026), the next event on the calendar.
```

- [ ] **Step 8: Update Decisions.md, gaps + North America note**

Replace:
```
- **Gaps:** no A/B events in December, July or August; no A events in Asia.
```
with:
```
- **Gaps (computed from the data and checked in tests.html):** no A/B event in Sep 2026,
  December, January (only CES, a D), July or August; no A-tier event in North America,
  the Middle East or Asia-Pacific.
- **No A-tier event in North America (best ~73):** travel cost from Tel Aviv pulls US
  events down. A deliberate call for the team: accept it, or raise the weight for the US.
```

- [ ] **Step 9: Update Decisions.md, nudge copy**

Replace:
```
   "Same Jonathan Cohen? Last time he was at Payoneer." [Yes] [No]
```
with:
```
   "Same Jonathan Cohen? Last seen at Payoneer." [Yes] [No]
   (No "he/she": the data has no gender, and guessing from a name misgenders.)
```

- [ ] **Step 10: Update Decisions.md, storage overlay**

Replace:
```
- All data access goes through one file, so moving to Supabase is a focused change.
```
with:
```
- All data access goes through one file, so moving to Supabase is a focused change.
- **Seed data is read fresh on every load; the team's changes are an overlay on top.**
  Fixes to the event list reach everyone automatically, and "Reset demo data" just clears
  the overlay. Rule: never rename an `id` in the data files.
```

- [ ] **Step 11: Update Decisions.md, offline exception**

Replace:
```
- **Deliberately no sync queues or background sync:** complexity that isn't worth it
  for this scope.
```
with:
```
- **Deliberately no sync queues or background sync:** complexity that isn't worth it
  for this scope.
- **One exception to "no offline magic": a tiny network-first cache** (service worker).
  Without it the app wouldn't reopen with no signal on the show floor. Network-first:
  with a connection every deploy shows up immediately; the saved copy is used only offline.
```

- [ ] **Step 12: Add AI_LOG.md rows 14–17**

Insert these four rows directly after the row starting `| 13 | Scoring |` (before the blank line and `## Notes for the video`):
```
| 14 | Design | Claude Code (Superpowers brainstorm) | Caught a real offline gap: "no service-worker magic" meant the app wouldn't reopen without signal. Asked me instead of silently changing the decision; I chose a network-first cache. | Helped |
| 15 | Design | Claude Code | Confident but wrong: said the planning gaps "match Decisions.md", but had checked against the doc, not the data, and the doc was wrong (missing January and two regions). Fixed by computing expected results from the real data. Lesson: when AI says "verified", ask "against what?" | Got in the way |
| 16 | Design | Claude Code | Ran the relationship rules by hand on all 11 demo contacts and found a data error (David Cohen/Tranzio expected "Steady" with one meeting). | Helped |
| 17 | Design | Second Claude chat as reviewer | Reviewed the spec and caught that seed data copied into localStorage would never update for existing users, and that Sibos fell outside the planning window. | Helped: one AI reviewing another |
```

- [ ] **Step 13: Fix the data error in data/contacts.json**

Replace (lines 68–69):
```
      "_demoCase": "Same name, different person #1 (travel wholesaler, London). Never merge with David Cohen of Corvane Payments.",
      "_expectedSignal": "Steady - nurture"
```
with:
```
      "_demoCase": "Same name, different person #1 (travel wholesaler, London). Never merge with David Cohen of Corvane Payments.",
      "_expectedSignal": "New"
```
Verify: `python3 -c "import json;d=json.load(open('data/contacts.json'));print([p['_expectedSignal'] for p in d['people'] if p['id']=='p-david-t'])"` prints `['New']`.

- [ ] **Step 14: Replace README.md**

```markdown
# Grain Conference Intelligence Tool

A tool for Grain's sales team: which conferences to attend and why, quick lead capture on
the show floor (works offline), repeat-contact recognition across conferences, AI
relationship summaries, and HubSpot push.

Plain HTML/CSS/JavaScript. No build step, nothing to install. Hosted free on Netlify.

## Host and update it yourself

You don't need to be a developer for any of this.

### 1. Put it online (once)
1. Log in to [Netlify](https://app.netlify.com) (the free plan is enough).
2. **Add new site → Import an existing project → GitHub**, and pick this repository.
3. Leave every build setting empty (there is no build step) and click **Deploy**.
4. From now on, every change on the `main` branch goes live by itself in about a minute.

### 2. Turn on the AI (once)
1. Get a free Gemini API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. In Netlify: **Site configuration → Environment variables → Add a variable**.
   - Key: `GEMINI_API_KEY`, value: your key. Mark it as a secret.
   - Optional: `GEMINI_MODEL` (default `gemini-3.8-flash`).
3. **Deploys → Trigger deploy → Deploy site**, so the new setting is picked up.
4. Open the site → **Settings**. It should say "AI: ready (server key)".

Anyone can also paste their own Gemini key in the app's Settings page; it overrides the
site's key and stays in their browser only.

### 3. Add or fix a conference
All events live in one file: `data/conferences.json`.
1. On GitHub, open `data/conferences.json` and click the pencil icon (Edit).
2. To add an event, copy an existing entry (from `{` to `},`), paste it, and change the
   details. Each of the five ratings is a whole number from 1 to 5 with a one-line `why`.
   Give it a new, unique `id` (e.g. `"mpe-2028"`).
3. To fix an event, change its details. **Never rename an existing `id`**: the team's
   statuses and notes are linked to it.
4. Click **Commit changes**. Netlify updates the site in about a minute.
   Scores and tiers are calculated by the app, so don't type them in.
5. Open `<your-site>/tests.html` to check everything still passes.

Reps can also add an event from inside the app: **Events → + Add conference** (AI drafts
the ratings from the event's website; the rep confirms). Those live in that rep's browser.

### 4. HubSpot (optional)
1. In HubSpot: **Settings → Integrations → Private apps → Create a private app**.
2. Scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`,
   `crm.schemas.contacts.write`.
3. Create the app, copy the token, and paste it in the tool's **Settings** page.
4. Without a token, "Push to HubSpot" runs in demo mode and shows what would be sent.
   The tool creates two contact properties the first time: "Grain lead source" and
   "Grain conference summary".

### 5. Reset the demo data
In the app: **Settings → Reset demo data**. This clears leads, statuses and added events
in that browser. Keys are kept.

### 6. Run the tests
Open `<your-site>/tests.html`. Everything should be green.

## For developers
- Local preview: `python3 -m http.server 8000` in this folder, then open
  `http://localhost:8000/` (app) and `http://localhost:8000/tests.html` (tests).
  AI and HubSpot only work on the live site.
- Command-line tests: `node tests/run.mjs` (logic) and `node tests/functions.mjs`
  (Netlify functions with a fake network).
- Design: `docs/superpowers/specs/2026-09-26-conference-tool-design.md`.
  Decisions and trade-offs: `Decisions.md`.
```

- [ ] **Step 15: Start the local preview server (keep it running for all tasks)**

Run in the background from the repo root: `python3 -m http.server 8000`
Then: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/index.html` prints `200`.
Tell the user: app at `http://localhost:8000/`, tests at `http://localhost:8000/tests.html` (from Task 2).

- [ ] **Step 16: Commit and push**

```bash
git add CLAUDE.md Decisions.md AI_LOG.md data/contacts.json README.md
git commit -m "Docs: overlay storage, network-first cache, Sep 2026 window, 6 labels; fix data; README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: Test harness + scoring logic

**Files:**
- Create: `tests/runner.js`, `tests/all.js`, `tests/run.mjs`, `tests.html`, `tests/scoring.test.js`
- Create: `js/scoring.js`

**Interfaces:**
- Consumes: `data/conferences.json`.
- Produces (from `js/scoring.js`): `WEIGHTS`, `FACTORS`, `FACTOR_LABELS`, `REGIONS`, `CORE_VERTICALS`, `WINDOW`, `TIERS`, `sizeRating(n)→1..5`, `sizeRatingWhy(n)→string`, `factorPoints(ratings)`, `baseScore(conf)`, `roundScore(x)`, `tierFor(score)→{tier,min,action}`, `borderline(score)→string|null`, `explain(conf)→{points,pros,cons,drag}`, `dayNumber(iso)`, `gapDays(a,b)`, `scoreAll(confs)→[{id,conf,base,bonus,cluster:{id,name,gap}|null,score,tier,action,borderline,points,pros,cons,drag:{factor,label,lost,text}|null}]`, `windowMonths()→['2026-09',…]`, `monthLabel('2026-09')→'Sep 2026'`, `inWindow(conf)`, `findGaps(scored)→{months,regions,verticals}`, `runningToday(confs,today)`, `defaultCaptureConference(confs,today)`, `filterEvents(scored,{sort,q,vertical,region,tier,month})`.
- Produces (tests): `createRunner()→{t,results}` with `t.group(name)`, `t.test(name,fn)`, `t.eq(actual,expected,label?)`, `t.ok(cond,label?)`; each suite file default-exports `(t, data) => void` where `data = { conferences, contacts }` (the raw JSON files).

- [ ] **Step 1: Create the runner**

`tests/runner.js`:
```js
// Tiny test runner shared by tests.html (browser) and tests/run.mjs (command line).
export function createRunner() {
  const results = [];
  let group = '';
  const t = {
    group(name) { group = name; },
    test(name, fn) {
      try {
        fn();
        results.push({ group, name, ok: true });
      } catch (e) {
        results.push({ group, name, ok: false, error: e && e.message ? e.message : String(e) });
      }
    },
    eq(actual, expected, label = '') {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`${label ? label + ': ' : ''}expected ${b}, got ${a}`);
    },
    ok(cond, label = 'expected true') {
      if (!cond) throw new Error(label);
    },
  };
  return { t, results };
}
```

`tests/run.mjs` (command line; also checks the offline file list once `sw.js` exists):
```js
// Command-line test run: node tests/run.mjs  (same tests as tests.html)
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRunner } from './runner.js';
import { runAll } from './all.js';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const data = { conferences: read('data/conferences.json'), contacts: read('data/contacts.json') };

const { t, results } = createRunner();
runAll(t, data);

// Node-only check: the offline cache (sw.js) must list every app file, and only files that exist.
if (existsSync(new URL('sw.js', root))) {
  t.group('Offline cache');
  t.test('sw.js SHELL matches the files on disk', () => {
    const src = readFileSync(new URL('sw.js', root), 'utf8');
    const shell = JSON.parse(src.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
    const missing = shell.filter((f) => f !== './' && !existsSync(new URL(f, root)));
    t.eq(missing, [], 'listed in SHELL but missing on disk');
    const jsFiles = [
      ...readdirSync(new URL('js/', root)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
      ...readdirSync(new URL('js/views/', root)).filter((f) => f.endsWith('.js')).map((f) => `js/views/${f}`),
    ];
    t.eq(jsFiles.filter((f) => !shell.includes(f)), [], 'app files not in SHELL');
  });
}

let failed = 0;
let group = null;
for (const r of results) {
  if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
  if (r.ok) console.log(`  ok   ${r.name}`);
  else { failed++; console.log(`  FAIL ${r.name}\n       ${r.error}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
```

`tests.html` (browser):
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Grain Conference Tool: tests</title>
  <style>
    body { font: 15px/1.45 system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 16px; }
    h2 { font-size: 1rem; margin: 1.2rem 0 .3rem; }
    ul { margin: 0; padding-left: 18px; }
    .ok { color: #137333; }
    .fail { color: #b3261e; font-weight: 600; }
    .err { color: #b3261e; font-size: .85rem; font-weight: 400; display: block; }
    #summary { font-size: 1.2rem; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Tests</h1>
  <p id="summary">Running…</p>
  <div id="out"></div>
  <script type="module">
    import { createRunner } from './tests/runner.js';
    import { runAll } from './tests/all.js';

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const summary = document.getElementById('summary');
    try {
      const get = (p) => fetch(p, { cache: 'no-store' }).then((r) => r.json());
      const [conferences, contacts] = await Promise.all([get('data/conferences.json'), get('data/contacts.json')]);
      const { t, results } = createRunner();
      runAll(t, { conferences, contacts });
      const failed = results.filter((r) => !r.ok).length;
      summary.textContent = `${results.length - failed}/${results.length} passed`;
      summary.className = failed ? 'fail' : 'ok';
      const groups = [...new Set(results.map((r) => r.group))];
      document.getElementById('out').innerHTML = groups.map((g) => `<h2>${esc(g)}</h2><ul>${results.filter((r) => r.group === g).map((r) =>
        `<li class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓' : '✗'} ${esc(r.name)}${r.ok ? '' : `<span class="err">${esc(r.error)}</span>`}</li>`).join('')}</ul>`).join('');
    } catch (e) {
      summary.textContent = `Tests could not run: ${e.message}`;
      summary.className = 'fail';
    }
  </script>
</body>
</html>
```

`tests/all.js` (this task: scoring only):
```js
// Every test suite, in order. Each suite is a function (t, data) => void.
import scoring from './scoring.test.js';

export const suites = [scoring];

export function runAll(t, data) {
  for (const suite of suites) suite(t, data);
}
```

- [ ] **Step 2: Write the failing scoring tests**

`tests/scoring.test.js`:
```js
import {
  scoreAll, roundScore, tierFor, sizeRating, borderline, findGaps, filterEvents,
  defaultCaptureConference, runningToday, gapDays, windowMonths, monthLabel,
} from '../js/scoring.js';

export default function scoringTests(t, data) {
  const confs = data.conferences.conferences;
  const scored = scoreAll(confs);
  const byId = (id) => scored.find((s) => s.id === id);

  t.group('Scoring');

  t.test('Money20/20 Europe = 98, A+ (sanity check from Decisions.md)', () => {
    t.eq([byId('money2020-europe-2027').score, byId('money2020-europe-2027').tier], [98, 'A+']);
  });
  t.test('EuroFinance = 95, A+', () => {
    t.eq([byId('eurofinance-2027').score, byId('eurofinance-2027').tier], [95, 'A+']);
  });
  t.test('PAY360 = 90, A+ only thanks to the cluster bonus (base 85)', () => {
    const s = byId('pay360-2027');
    t.eq([s.base, s.bonus, s.score, s.tier], [85, 5, 90, 'A+']);
  });
  t.test('MPE = 88, A; nearest cluster partner is DACT Treasury Fair (overlapping dates)', () => {
    const s = byId('mpe-2027');
    t.eq([s.score, s.tier, s.bonus], [88, 'A', 5]);
    t.eq([s.cluster.id, s.cluster.gap], ['dact-treasury-fair-2027', 0]);
  });
  t.test('IAMTN = 76, A (300 of the right people)', () => {
    t.eq([byId('iamtn-summit-2026').score, byId('iamtn-summit-2026').tier], [76, 'A']);
  });
  t.test('Money20/20 USA = 73, B, borderline, biggest drag = Travel (−10 pts)', () => {
    const s = byId('money2020-usa-2026');
    t.eq([s.score, s.tier, s.borderline, s.drag.text], [73, 'B', 'Borderline: 2 pts below A', 'Travel (−10 pts)']);
  });
  t.test('Web Summit = 39, D', () => {
    t.eq([byId('web-summit-2026').score, byId('web-summit-2026').tier], [39, 'D']);
  });
  t.test('CES = 8, D (140,000 irrelevant people are worth nothing)', () => {
    const s = byId('ces-2027');
    t.eq([s.score, s.tier, s.points.audienceSize], [8, 'D', 0]);
  });
  t.test('Rounding happens before the tier: 54.9999999 -> 55 -> B', () => {
    t.eq(tierFor(roundScore(54.9999999)).tier, 'B');
  });
  t.test('Float noise is cleaned before rounding: 72.49999999999 -> 73', () => {
    t.eq(roundScore(72.49999999999), 73);
  });
  t.test('Every seed size rating matches the attendee thresholds', () => {
    const wrong = confs.filter((c) => sizeRating(c.audienceSize) !== c.ratings.audienceSize.score).map((c) => c.id);
    t.eq(wrong, []);
  });
  t.test('IAMTN pros/cons/drag come from the ratings', () => {
    const s = byId('iamtn-summit-2026');
    t.eq(s.pros.map((p) => p.factor), ['icpFit', 'buyerAccess', 'audienceMarket', 'travelEffort']);
    t.eq(s.cons.map((p) => p.factor), ['audienceSize']);
    t.eq(s.drag.text, 'Audience size (−10 pts)');
  });
  t.test('Borderline labels', () => {
    t.eq([borderline(76), borderline(75), borderline(58), borderline(65)],
      ['Borderline: 1 pt above the A line', 'Borderline: right on the A line', 'Borderline: 3 pts above the B line', null]);
  });
  t.test('Cluster gap: overlapping events count as 0 days', () => {
    t.eq(gapDays({ startDate: '2027-01-01', endDate: '2027-01-05' }, { startDate: '2027-01-03', endDate: '2027-01-04' }), 0);
    t.eq(gapDays({ startDate: '2027-01-01', endDate: '2027-01-05' }, { startDate: '2027-01-12', endDate: '2027-01-13' }), 7);
  });
  t.test('Every score is a whole number between 0 and 100', () => {
    t.eq(scored.filter((s) => !Number.isInteger(s.score) || s.score < 0 || s.score > 100).map((s) => s.id), []);
  });

  t.group('Planning gaps (expected values computed from the real data, not the docs)');

  t.test('Window is Sep 2026 - Sep 2027 (13 months)', () => {
    const m = windowMonths();
    t.eq([m.length, monthLabel(m[0]), monthLabel(m[12])], [13, 'Sep 2026', 'Sep 2027']);
  });
  t.test('Months with no A+/A/B event', () => {
    t.eq(findGaps(scored).months, ['2026-09', '2026-12', '2027-01', '2027-07', '2027-08']);
  });
  t.test('Regions with no A+/A event', () => {
    t.eq(findGaps(scored).regions, ['North America', 'Middle East', 'Asia-Pacific']);
  });
  t.test('Every core vertical has an A+/A/B event', () => {
    t.eq(findGaps(scored).verticals, []);
  });

  t.group('Event list');

  t.test('Default sort is by score, highest first', () => {
    t.eq(filterEvents(scored, {}).slice(0, 3).map((s) => s.id), ['money2020-europe-2027', 'eurofinance-2027', 'pay360-2027']);
  });
  t.test('Date sort starts with Sibos', () => {
    t.eq(filterEvents(scored, { sort: 'date' })[0].id, 'sibos-2026');
  });
  t.test('Filters combine: Europe + A+ gives the three must-attends', () => {
    t.eq(filterEvents(scored, { region: 'Europe', tier: 'A+' }).length, 3);
  });
  t.test('Search ignores case and accents', () => {
    t.ok(filterEvents(scored, { q: 'BERLÍN' }).some((s) => s.id === 'itb-berlin-2027'), 'finds ITB Berlin');
  });

  t.group('Capture preselect');

  t.test('Nothing running on 2026-09-26, so the next event (Sibos) is preselected', () => {
    t.eq([runningToday(confs, '2026-09-26'), defaultCaptureConference(confs, '2026-09-26').id], [null, 'sibos-2026']);
  });
  t.test('During Money20/20 Europe, it is the one running today', () => {
    const c = byId('money2020-europe-2027').conf;
    t.eq(defaultCaptureConference(confs, c.startDate).id, 'money2020-europe-2027');
  });
}
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `node tests/run.mjs`
Expected: crash with `ERR_MODULE_NOT_FOUND` for `js/scoring.js`.

- [ ] **Step 4: Implement js/scoring.js**

```js
// Pure scoring logic: no DOM, no storage, no network.
// Scores, tiers and clusters are always computed here, never stored.

export const WEIGHTS = { icpFit: 35, buyerAccess: 30, audienceMarket: 15, audienceSize: 10, travelEffort: 10 };
export const FACTORS = Object.keys(WEIGHTS); // heaviest first: ties in "biggest drag" go to the heavier factor
export const FACTOR_LABELS = {
  icpFit: 'ICP fit', buyerAccess: 'Buyer access', audienceMarket: 'Audience market',
  audienceSize: 'Audience size', travelEffort: 'Travel',
};
export const REGIONS = ['Europe', 'North America', 'Middle East', 'Asia-Pacific'];
export const CORE_VERTICALS = ['payments', 'cross-border', 'travel', 'treasury', 'fx'];
export const WINDOW = { start: '2026-09', months: 13 };
export const TIERS = [
  { tier: 'A+', min: 90, action: 'Must attend' },
  { tier: 'A', min: 75, action: 'Top priority' },
  { tier: 'B', min: 55, action: 'Attend if it clusters or budget allows' },
  { tier: 'C', min: 40, action: 'Monitor' },
  { tier: 'D', min: 0, action: 'Skip' },
];
const THRESHOLDS = [90, 75, 55, 40];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const share = (rating) => (rating - 1) / 4;
const clean = (x) => Math.round(x * 1e6) / 1e6; // removes float noise like 72.49999999

export function sizeRating(attendees) {
  const n = Number(attendees) || 0;
  if (n >= 30000) return 5;
  if (n >= 10000) return 4;
  if (n >= 4000) return 3;
  if (n >= 1500) return 2;
  return 1;
}

export function sizeRatingWhy(attendees) {
  const bands = { 1: 'under 1,500', 2: '1,500-3,999', 3: '4,000-9,999', 4: '10,000-29,999', 5: '30,000+' };
  const n = Number(attendees) || 0;
  return `About ${n.toLocaleString('en-US')} attendees (${bands[sizeRating(n)]} band)`;
}

export function factorPoints(ratings) {
  const s = (k) => share(ratings[k].score);
  return {
    icpFit: WEIGHTS.icpFit * s('icpFit'),
    buyerAccess: WEIGHTS.buyerAccess * s('buyerAccess'),
    audienceMarket: WEIGHTS.audienceMarket * s('audienceMarket'),
    audienceSize: WEIGHTS.audienceSize * s('audienceSize') * s('icpFit'), // size only counts as much as the room is relevant
    travelEffort: WEIGHTS.travelEffort * s('travelEffort'),
  };
}

export function baseScore(conf) {
  return clean(Object.values(factorPoints(conf.ratings)).reduce((a, b) => a + b, 0));
}

export function roundScore(x) {
  return Math.round(clean(x));
}

export function tierFor(score) {
  return TIERS.find((t) => score >= t.min);
}

export function borderline(score) {
  for (const t of THRESHOLDS) {
    const d = score - t;
    if (Math.abs(d) > 3) continue;
    const name = tierFor(t).tier;
    const pts = (n) => `${n} ${n === 1 ? 'pt' : 'pts'}`;
    if (d < 0) return `Borderline: ${pts(-d)} below ${name}`;
    if (d === 0) return `Borderline: right on the ${name} line`;
    return `Borderline: ${pts(d)} above the ${name} line`;
  }
  return null;
}

// Pros = rated 4-5, Cons = rated 1-2, Biggest drag = most points lost vs. the factor's maximum.
export function explain(conf) {
  const pts = factorPoints(conf.ratings);
  const pros = [];
  const cons = [];
  let drag = null;
  for (const k of FACTORS) {
    const r = conf.ratings[k];
    const item = { factor: k, label: FACTOR_LABELS[k], score: r.score, why: r.why || '' };
    if (r.score >= 4) pros.push(item);
    if (r.score <= 2) cons.push(item);
    const lost = clean(WEIGHTS[k] - pts[k]);
    if (!drag || lost > drag.lost) drag = { factor: k, label: FACTOR_LABELS[k], lost };
  }
  if (drag && drag.lost === 0) drag = null;
  if (drag) drag.text = `${drag.label} (−${Math.round(drag.lost)} pts)`;
  return { points: pts, pros, cons, drag };
}

// Dates are 'YYYY-MM-DD'; convert to whole days so time zones never matter.
export function dayNumber(iso) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
}

export function gapDays(a, b) {
  return Math.max(dayNumber(b.startDate) - dayNumber(a.endDate), dayNumber(a.startDate) - dayNumber(b.endDate), 0);
}

export function scoreAll(conferences) {
  const bases = new Map(conferences.map((c) => [c.id, baseScore(c)]));
  return conferences.map((c) => {
    const base = bases.get(c.id);
    let cluster = null;
    for (const o of conferences) {
      if (o.id === c.id || o.region !== c.region || bases.get(o.id) < 55) continue;
      const gap = gapDays(c, o);
      if (gap <= 7 && (!cluster || gap < cluster.gap)) cluster = { id: o.id, name: o.name, gap };
    }
    const bonus = cluster ? 5 : 0;
    const score = roundScore(Math.min(100, base + bonus));
    const t = tierFor(score);
    return { id: c.id, conf: c, base, bonus, cluster, score, tier: t.tier, action: t.action, borderline: borderline(score), ...explain(c) };
  });
}

export function windowMonths(win = WINDOW) {
  const [y, m] = win.start.split('-').map(Number);
  return Array.from({ length: win.months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function monthLabel(ym) {
  return `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
}

export function inWindow(conf, win = WINDOW) {
  return windowMonths(win).includes(conf.startDate.slice(0, 7));
}

const isAB = (s) => ['A+', 'A', 'B'].includes(s.tier);
const isA = (s) => ['A+', 'A'].includes(s.tier);

export function findGaps(scored, win = WINDOW) {
  const inWin = scored.filter((s) => inWindow(s.conf, win));
  return {
    months: windowMonths(win).filter((ym) => !inWin.some((s) => s.conf.startDate.slice(0, 7) === ym && isAB(s))),
    regions: REGIONS.filter((r) => !inWin.some((s) => s.conf.region === r && isA(s))),
    verticals: CORE_VERTICALS.filter((v) => !inWin.some((s) => (s.conf.verticals || []).includes(v) && isAB(s))),
  };
}

export function runningToday(conferences, today) {
  return conferences.find((c) => c.startDate <= today && today <= c.endDate) || null;
}

// Capture preselect: running today, else next upcoming, else the most recent.
export function defaultCaptureConference(conferences, today) {
  const byDate = [...conferences].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return runningToday(byDate, today)
    || byDate.find((c) => c.startDate >= today)
    || byDate[byDate.length - 1]
    || null;
}

const normText = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterEvents(scored, f = {}) {
  const q = normText(f.q).trim();
  const list = scored.filter((s) => {
    const c = s.conf;
    if (f.vertical && !(c.verticals || []).includes(f.vertical)) return false;
    if (f.region && c.region !== f.region) return false;
    if (f.tier && s.tier !== f.tier) return false;
    if (f.month && c.startDate.slice(0, 7) !== f.month) return false;
    if (q && !normText(`${c.name} ${c.city} ${c.country} ${c.description}`).includes(q)) return false;
    return true;
  });
  const byDate = (a, b) => a.conf.startDate.localeCompare(b.conf.startDate);
  return list.sort(f.sort === 'date' ? byDate : (a, b) => b.score - a.score || byDate(a, b));
}
```

- [ ] **Step 5: Run the tests**

Run: `node tests/run.mjs`
Expected: `25/25 passed`. Also open `http://localhost:8000/tests.html` (or run `render http://localhost:8000/tests.html 80`), which shows `25/25 passed`.

- [ ] **Step 6: Commit and push**

```bash
git add tests.html tests/ js/scoring.js
git commit -m "Scoring logic with tests (tiers, clusters, borderline, gaps, filters)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: Data layer (seed + overlay)

**Files:**
- Create: `js/store.js`, `tests/store.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: seed JSON shapes from `data/*.json`.
- Produces (from `js/store.js`): `emptyOverlay()`, `safeStorage(localStorage)`, `memoryStorage()`, `createStore({ seed, storage, prefix='grain.' })` returning:
  `onChange(fn)`, `conferences()`, `conference(id)`, `conferencePlan(id)→{status,rep}`, `setConferencePlan(id, patch)`, `addConference(conf)→saved`,
  `people()`, `person(id)`, `encounters()`, `encountersFor(personId)` (sorted by date), `notSamePairs()`, `addNotSamePair(a,b)`, `patchPerson(id, fields)`,
  `saveCapture(capture, { link:{personId,via}|null, rejectedIds, unresolvedIds })→{personId, encounter, isNew}`,
  `unresolvedFor(personId)`, `resolveDifferent(personId, candidateId)`, `mergeInto(fromId, toId)`,
  `aiSummary(personId)`, `setAiSummary(personId, s)`, `exportAiSummaries()`, `hubspotPushed(personId)`, `markPushed(personId, date)`,
  `settings()→{me,team,geminiKey,hubspotToken}`, `updateSettings(patch)`, `team()`, `draft()`, `setDraft(d)`, `clearDraft()`, `resetOverlay()`.
  `seed` = `{ conferences: <conferences.json>, contacts: <contacts.json> }`.

- [ ] **Step 1: Write the failing store tests**

`tests/store.test.js`:
```js
import { createStore, memoryStorage } from '../js/store.js';

export default function storeTests(t, data) {
  const seed = { conferences: data.conferences, contacts: data.contacts };
  const fresh = (storage = memoryStorage()) => ({ storage, store: createStore({ seed, storage, prefix: 'grain.test.' }) });
  const capture = (over = {}) => ({
    conferenceId: 'iamtn-summit-2026', event: 'IAMTN Annual Summit 2026', date: '2026-10-14',
    name: 'Priya Raman', company: 'Skyloop OTA', title: '', email: '', linkedin: '',
    temperature: 'hot', note: 'Follow-up on the call.', rep: 'Maya', ...over,
  });

  t.group('Store (seed + overlay)');

  t.test('Seed data is visible without any overlay', () => {
    const { store } = fresh();
    t.eq([store.conferences().length, store.people().length, store.encounters().length],
      [data.conferences.conferences.length, data.contacts.people.length, data.contacts.encounters.length]);
  });
  t.test('Adding an encounter to a known person shows up in merged data and survives a reload', () => {
    const { storage, store } = fresh();
    store.saveCapture(capture({ title: 'VP Payments' }), { link: { personId: 'p-priya', via: 'confirmed' } });
    const again = createStore({ seed, storage, prefix: 'grain.test.' });
    t.eq([again.encountersFor('p-priya').length, again.person('p-priya').title], [2, 'VP Payments']);
  });
  t.test('A new person is created, with "not the same" pairs and unresolved suggestions recorded', () => {
    const { store } = fresh();
    const r = store.saveCapture(capture({ name: 'David Cohen', company: '' }), { rejectedIds: ['p-david-t'], unresolvedIds: ['p-david-c'] });
    t.eq([r.isNew, store.person(r.personId).name, store.unresolvedFor(r.personId)], [true, 'David Cohen', ['p-david-c']]);
    t.ok(store.notSamePairs().some(([a, b]) => a === r.personId && b === 'p-david-t'), 'pair saved');
  });
  t.test('"Other event…" encounter saves with conferenceId null and shows on the timeline', () => {
    const { store } = fresh();
    store.saveCapture(capture({ conferenceId: null, event: 'Payments dinner, London' }), { link: { personId: 'p-priya' } });
    const last = store.encountersFor('p-priya').at(-1);
    t.eq([last.conferenceId, last.event], [null, 'Payments dinner, London']);
  });
  t.test('Merging a new person into an existing one moves the encounters', () => {
    const { store } = fresh();
    const r = store.saveCapture(capture({ name: 'Dana Levy', company: 'Vantelo Pay' }), { unresolvedIds: ['p-dana'] });
    store.mergeInto(r.personId, 'p-dana');
    t.eq([store.person(r.personId), store.encountersFor('p-dana').length, store.unresolvedFor(r.personId)], [null, 4, []]);
  });
  t.test('Reset clears the overlay but keeps settings', () => {
    const { store } = fresh();
    store.updateSettings({ me: 'Maya', geminiKey: 'k' });
    store.setConferencePlan('iamtn-summit-2026', { status: 'going', rep: 'Maya' });
    store.saveCapture(capture(), { link: { personId: 'p-priya' } });
    store.resetOverlay();
    t.eq([store.encountersFor('p-priya').length, store.conferencePlan('iamtn-summit-2026').status, store.settings().me, store.settings().geminiKey],
      [1, null, 'Maya', 'k']);
  });
  t.test('Corrupted saved data does not crash the app', () => {
    const storage = memoryStorage();
    storage.setItem('grain.test.overlay.v1', '{not json');
    storage.setItem('grain.test.settings.v1', 'null');
    const { store } = fresh(storage);
    t.eq([store.people().length, store.settings().me], [data.contacts.people.length, '']);
  });
  t.test('An old overlay missing newer fields still works', () => {
    const storage = memoryStorage();
    storage.setItem('grain.test.overlay.v1', JSON.stringify({ conferencePlans: { 'ces-2027': { status: 'skip' } } }));
    const { store } = fresh(storage);
    t.eq(store.conferencePlan('ces-2027').status, 'skip');
    store.saveCapture(capture(), { link: { personId: 'p-priya' } });
    t.eq(store.encountersFor('p-priya').length, 2);
  });
  t.test('Overlay entries pointing at ids that no longer exist are ignored, not fatal', () => {
    const storage = memoryStorage();
    storage.setItem('grain.test.overlay.v1', JSON.stringify({
      personPatches: { 'p-gone': { title: 'CFO' } },
      addedEncounters: [{ id: 'e-x', personId: 'p-gone', date: '2026-01-01', event: 'Old', nameAsEntered: 'Gone', temperature: 'warm', note: '' }],
    }));
    const { store } = fresh(storage);
    t.eq([store.people().length, store.person('p-gone')], [data.contacts.people.length, null]);
  });
  t.test('Capture draft survives a reload and is cleared on demand', () => {
    const { storage, store } = fresh();
    store.setDraft({ name: 'Half typed' });
    const again = createStore({ seed, storage, prefix: 'grain.test.' });
    t.eq(again.draft().name, 'Half typed');
    again.clearDraft();
    t.eq(again.draft(), {});
  });
  t.test('Team names default to contacts.json until set in Settings', () => {
    const { store } = fresh();
    t.eq(store.team(), data.contacts.team);
    store.updateSettings({ team: ['Noa', 'Amit'] });
    t.eq(store.team(), ['Noa', 'Amit']);
  });
}
```

Update `tests/all.js`:
```js
// Every test suite, in order. Each suite is a function (t, data) => void.
import scoring from './scoring.test.js';
import store from './store.test.js';

export const suites = [scoring, store];

export function runAll(t, data) {
  for (const suite of suites) suite(t, data);
}
```

- [ ] **Step 2: Run to see it fail**

Run: `node tests/run.mjs`
Expected: `ERR_MODULE_NOT_FOUND` for `js/store.js`.

- [ ] **Step 3: Implement js/store.js**

```js
// The ONLY file that touches localStorage.
// Seed data (data/*.json) is read fresh on every load; the team's changes live in an overlay.
// Rule: never rename an `id` in data/*.json — overlay entries point at ids.

export function emptyOverlay() {
  return {
    conferencePlans: {},   // { [conferenceId]: { status: 'going'|'considering'|'skip'|null, rep: string|null } }
    addedConferences: [],
    addedPeople: [],
    personPatches: {},     // { [personId]: { company?, title?, email?, linkedin? } } latest known
    addedEncounters: [],
    notSamePairs: [],      // [[idA, idB]] added to the seed pairs
    unresolvedMatches: {}, // { [newPersonId]: [candidateId, ...] }
    aiSummaries: {},       // { [personId]: summary } overrides seed aiSummaries
    hubspotPushed: {},     // { [personId]: 'YYYY-MM-DD' }
  };
}

const DEFAULT_SETTINGS = { me: '', team: [], geminiKey: '', hubspotToken: '' };

// localStorage can throw (private mode, full, blocked). Fall back to memory so the app still works.
export function safeStorage(storage) {
  const mem = new Map();
  const ok = (() => {
    try { storage.setItem('grain.__probe', '1'); storage.removeItem('grain.__probe'); return true; } catch { return false; }
  })();
  return {
    getItem: (k) => { try { return ok ? storage.getItem(k) : mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } },
    setItem: (k, v) => { try { if (ok) storage.setItem(k, v); else mem.set(k, v); } catch { mem.set(k, v); } },
    removeItem: (k) => { try { if (ok) storage.removeItem(k); } catch { /* ignore */ } mem.delete(k); },
  };
}

export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function newId(prefix) {
  const rand = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] != null && obj[k] !== '').map((k) => [k, obj[k]]));

/**
 * seed: { conferences: <data/conferences.json>, contacts: <data/contacts.json> }
 * storage: localStorage-like object. prefix: key prefix ('grain.' in the app, 'grain.test.' in tests).
 */
export function createStore({ seed, storage, prefix = 'grain.' }) {
  const OVERLAY = `${prefix}overlay.v1`;
  const SETTINGS = `${prefix}settings.v1`;
  const DRAFT = `${prefix}captureDraft.v1`;

  const read = (key, fallback) => {
    try {
      const raw = storage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback;
    } catch {
      return fallback; // corrupted JSON: start clean rather than crash
    }
  };

  let overlay = read(OVERLAY, emptyOverlay());
  let settings = read(SETTINGS, { ...DEFAULT_SETTINGS });
  const listeners = new Set();
  const persist = () => {
    storage.setItem(OVERLAY, JSON.stringify(overlay));
    listeners.forEach((fn) => fn());
  };

  const seedConfs = seed.conferences.conferences || [];
  const seedPeople = seed.contacts.people || [];
  const seedEncounters = seed.contacts.encounters || [];

  const api = {
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // ---- Conferences ----
    conferences() { return [...seedConfs, ...overlay.addedConferences]; },
    conference(id) { return api.conferences().find((c) => c.id === id) || null; },
    conferencePlan(id) { return { status: null, rep: null, ...(overlay.conferencePlans[id] || {}) }; },
    setConferencePlan(id, patch) {
      overlay.conferencePlans[id] = { ...api.conferencePlan(id), ...patch };
      persist();
    },
    addConference(conf) {
      const saved = { ...conf, id: conf.id || newId('conf') };
      overlay.addedConferences.push(saved);
      persist();
      return saved;
    },

    // ---- People and encounters ----
    people() {
      return [...seedPeople, ...overlay.addedPeople].map((p) => ({ ...p, ...(overlay.personPatches[p.id] || {}) }));
    },
    person(id) { return api.people().find((p) => p.id === id) || null; },
    encounters() { return [...seedEncounters, ...overlay.addedEncounters]; },
    encountersFor(personId) {
      return api.encounters().filter((e) => e.personId === personId).sort((a, b) => a.date.localeCompare(b.date));
    },
    notSamePairs() { return [...(seed.contacts.notSamePairs || []), ...overlay.notSamePairs]; },
    addNotSamePair(a, b) { overlay.notSamePairs.push([a, b]); persist(); },
    patchPerson(personId, fields) {
      overlay.personPatches[personId] = { ...(overlay.personPatches[personId] || {}), ...pick(fields, ['company', 'title', 'email', 'linkedin']) };
      persist();
    },

    /**
     * capture: { conferenceId|null, event, date, name, company, title, email, linkedin, temperature, note, rep }
     * link: { personId, via: 'email'|'linkedin'|'confirmed' } to add to a known person, or null for a new person.
     * rejectedIds: people the rep said "No" to. unresolvedIds: suggestions the rep ignored.
     * Returns { personId, encounter, isNew }.
     */
    saveCapture(capture, { link = null, rejectedIds = [], unresolvedIds = [] } = {}) {
      let personId = link && link.personId;
      const isNew = !personId;
      if (isNew) {
        personId = newId('p');
        overlay.addedPeople.push({ id: personId, name: capture.name.trim(), ...pick(capture, ['company', 'title', 'email', 'linkedin']) });
        for (const id of rejectedIds) overlay.notSamePairs.push([personId, id]);
        if (unresolvedIds.length) overlay.unresolvedMatches[personId] = [...unresolvedIds];
      } else {
        overlay.personPatches[personId] = { ...(overlay.personPatches[personId] || {}), ...pick(capture, ['company', 'title', 'email', 'linkedin']) };
      }
      const encounter = {
        id: newId('e'),
        personId,
        conferenceId: capture.conferenceId || null,
        event: capture.event,
        date: capture.date,
        nameAsEntered: capture.name.trim(),
        company: capture.company || '',
        title: capture.title || null,
        email: capture.email || null,
        linkedin: capture.linkedin || null,
        temperature: capture.temperature,
        note: capture.note || '',
        rep: capture.rep || '',
        capturedAt: new Date().toISOString(),
        linkedBy: isNew ? 'new' : (link.via || 'confirmed'),
      };
      overlay.addedEncounters.push(encounter);
      persist();
      return { personId, encounter, isNew };
    },

    // ---- Unresolved suggestions (rep saved without answering) ----
    unresolvedFor(personId) { return overlay.unresolvedMatches[personId] || []; },
    resolveDifferent(personId, candidateId) {
      overlay.notSamePairs.push([personId, candidateId]);
      const rest = api.unresolvedFor(personId).filter((id) => id !== candidateId);
      if (rest.length) overlay.unresolvedMatches[personId] = rest; else delete overlay.unresolvedMatches[personId];
      persist();
    },
    // Merge a person created in this browser into an existing person (rep said "Same person" later).
    mergeInto(fromId, toId) {
      const from = overlay.addedPeople.find((p) => p.id === fromId);
      if (!from) return false;
      for (const e of overlay.addedEncounters) if (e.personId === fromId) { e.personId = toId; e.linkedBy = 'confirmed'; }
      overlay.personPatches[toId] = { ...(overlay.personPatches[toId] || {}), ...pick(from, ['company', 'title', 'email', 'linkedin']) };
      overlay.addedPeople = overlay.addedPeople.filter((p) => p.id !== fromId);
      delete overlay.unresolvedMatches[fromId];
      delete overlay.aiSummaries[fromId];
      delete overlay.hubspotPushed[fromId];
      persist();
      return true;
    },

    // ---- AI summaries (overlay first, then the pre-generated ones in contacts.json) ----
    aiSummary(personId) { return overlay.aiSummaries[personId] || (seed.contacts.aiSummaries || {})[personId] || null; },
    setAiSummary(personId, summary) { overlay.aiSummaries[personId] = summary; persist(); },
    exportAiSummaries() { return { ...(seed.contacts.aiSummaries || {}), ...overlay.aiSummaries }; },

    // ---- HubSpot ----
    hubspotPushed(personId) { return overlay.hubspotPushed[personId] || null; },
    markPushed(personId, date) { overlay.hubspotPushed[personId] = date; persist(); },

    // ---- Settings (survive "Reset demo data") ----
    settings() { return { ...settings }; },
    updateSettings(patch) {
      settings = { ...settings, ...patch };
      storage.setItem(SETTINGS, JSON.stringify(settings));
      listeners.forEach((fn) => fn());
    },
    team() { return settings.team && settings.team.length ? settings.team : (seed.contacts.team || []); },

    // ---- Capture draft (survives tab switches, reloads and a phone killing the tab) ----
    draft() { return read(DRAFT, {}); },
    setDraft(d) { storage.setItem(DRAFT, JSON.stringify(d || {})); },
    clearDraft() { storage.removeItem(DRAFT); },

    // ---- Reset ----
    resetOverlay() {
      overlay = emptyOverlay();
      storage.removeItem(OVERLAY);
      listeners.forEach((fn) => fn());
    },
  };
  return api;
}
```

- [ ] **Step 4: Run the tests**

Run: `node tests/run.mjs`
Expected: `36/36 passed`.

- [ ] **Step 5: Commit and push**

```bash
git add js/store.js tests/store.test.js tests/all.js
git commit -m "Data layer: seed read fresh, team changes as an overlay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4: App shell, Events tab (MVP 1), Settings

**Files:**
- Modify: `index.html` (replace the placeholder)
- Create: `styles.css`, `js/app.js`, `js/api.js`, `js/views/ui.js`, `js/views/eventCard.js`, `js/views/events.js`, `js/views/settings.js`, `tests/ui.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: Task 2 scoring exports; Task 3 `createStore`, `safeStorage`.
- Produces:
  - `js/views/ui.js`: `esc(v)`, `safeUrl(u)`, `fmtDate(iso)→'28 Sep 2026'`, `fmtShort(iso)→'28 Sep'`, `fmtRange(start,end)`, `tierClass(tier)`, `signalClass(label)→'sig-warming'`, `localToday()→'YYYY-MM-DD'`.
  - `js/views/eventCard.js`: `eventCardHTML(scoredItem, { plan, team, today, controls=true, open=false })→string`, `bindEventCardControls(root, store, onChange)`.
  - `js/api.js`: `MESSAGES`, `aiStatus(key)`, `aiArc(key, payload)`, `aiIntake(key, payload)`, `hubspotPush(token, contacts)`; each resolves to `{ok:true,…}` or `{ok:false,error,message}` and never throws.
  - View contract (every file in `js/views/` except `ui.js` and `eventCard.js`): `export function render(el, ctx, param?)` where `ctx = { store, today, applyNet(), go(hash) }`. Buttons needing a network carry `data-needs-net` (and `data-blocked="true"` to stay disabled online); hints carry class `needs-net-hint`.
  - Routes: `#events`, `#events/<conferenceId>` (scrolls to and opens that card), `#settings`. Unknown routes show Events.

- [ ] **Step 1: Write the failing display-safety tests**

`tests/ui.test.js`:
```js
import { esc, safeUrl, fmtRange } from '../js/views/ui.js';
import { eventCardHTML } from '../js/views/eventCard.js';
import { scoreAll } from '../js/scoring.js';

export default function uiTests(t, data) {
  t.group('Display safety');

  t.test('Typed text is shown literally, never as HTML', () => {
    t.eq(esc('<b>AT&T</b> "quote" \'x\''), '&lt;b&gt;AT&amp;T&lt;/b&gt; &quot;quote&quot; &#39;x&#39;');
  });
  t.test('Only http(s) links are allowed', () => {
    t.eq([safeUrl('javascript:alert(1)'), safeUrl('https://x.com')], ['', 'https://x.com']);
  });
  t.test('Date ranges read naturally', () => {
    t.eq([fmtRange('2026-09-28', '2026-10-01'), fmtRange('2027-06-08', '2027-06-10'), fmtRange('2026-12-30', '2027-01-02')],
      ['28 Sep – 1 Oct 2026', '8–10 Jun 2027', '30 Dec 2026 – 2 Jan 2027']);
  });
  t.test('Event card escapes a hostile name and handles missing website/notes', () => {
    const conf = { ...data.conferences.conferences.find((c) => c.id === 'ces-2027'), name: '<img src=x onerror=alert(1)>', website: undefined, notes: undefined };
    const html = eventCardHTML(scoreAll([conf])[0], { today: '2026-09-26' });
    t.ok(!html.includes('<img'), 'no raw <img>');
    t.ok(!html.includes('undefined'), 'no "undefined" text');
  });
  t.test('Every seed event renders a card without "undefined"', () => {
    const bad = scoreAll(data.conferences.conferences).filter((s) => eventCardHTML(s, { today: '2026-09-26' }).includes('undefined')).map((s) => s.id);
    t.eq(bad, []);
  });
}
```

Update `tests/all.js`:
```js
// Every test suite, in order. Each suite is a function (t, data) => void.
import scoring from './scoring.test.js';
import store from './store.test.js';
import ui from './ui.test.js';

export const suites = [scoring, store, ui];

export function runAll(t, data) {
  for (const suite of suites) suite(t, data);
}
```

Run: `node tests/run.mjs`. Expected: `ERR_MODULE_NOT_FOUND` for `js/views/ui.js`.

- [ ] **Step 2: Create js/views/ui.js and js/views/eventCard.js**

`js/views/ui.js`:
```js
// Small display helpers shared by all views. Pure: returns strings, no DOM access.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ALWAYS pass user-typed, AI-written or fetched text through esc() before putting it in HTML.
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Only http(s) links are rendered as links (blocks javascript: URLs in data).
export function safeUrl(u) {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

export function fmtDate(iso) {
  if (!iso) return '';
  return `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}

export function fmtShort(iso) {
  return iso ? `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}` : '';
}

export function fmtRange(start, end) {
  if (!end || start === end) return fmtDate(start);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${+start.slice(8, 10)}–${fmtDate(end)}`;
  if (start.slice(0, 4) === end.slice(0, 4)) return `${fmtShort(start)} – ${fmtDate(end)}`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

export const tierClass = (tier) => (tier === 'A+' ? 'aplus' : tier.toLowerCase());

// CSS class for a relationship label: "Warming - act now" -> "sig-warming".
export const signalClass = (label) => `sig-${String(label).split(' ')[0].toLowerCase()}`;

// Local date (not UTC), 'YYYY-MM-DD'.
export function localToday(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

`js/views/eventCard.js`:
```js
// The event card, shared by Events, Plan detail and the Add-conference review screen.
import { FACTORS, FACTOR_LABELS } from '../scoring.js';
import { esc, safeUrl, fmtRange, fmtDate, tierClass } from './ui.js';

const STATUSES = [['going', 'Going'], ['considering', 'Considering'], ['skip', 'Skip']];

function listItems(items, empty) {
  if (!items.length) return `<li class="muted">${empty}</li>`;
  return items.map((i) => `<li><b>${esc(i.label)} (${i.score}/5)</b> ${esc(i.why)}</li>`).join('');
}

function provenance(c) {
  if (!c.addedBy) return '';
  const how = c.source === 'ai' ? 'AI-drafted, confirmed by' : 'Added manually by';
  return `<span class="badge">${how} ${esc(c.addedBy)}, ${esc(fmtDate(c.addedAt))}</span>`;
}

/**
 * s: one item from scoreAll(). opts: { plan, team, today, controls, open }
 * Returns an HTML string. Controls are wired by bindEventCardControls().
 */
export function eventCardHTML(s, { plan = { status: null, rep: null }, team = [], today = '', controls = true, open = false } = {}) {
  const c = s.conf;
  const past = today && c.endDate < today;
  const site = safeUrl(c.website);
  const clusterText = s.cluster ? `+5 cluster: ${s.cluster.name} (${s.cluster.gap === 0 ? 'same days' : `${s.cluster.gap} days`})` : '';
  const statusButtons = STATUSES.map(([v, label]) =>
    `<button type="button" class="chip" data-status="${v}" data-id="${esc(c.id)}" aria-pressed="${plan.status === v}">${label}</button>`).join('');
  const repOptions = ['<option value="">Assign rep…</option>', ...team.map((n) =>
    `<option value="${esc(n)}"${plan.rep === n ? ' selected' : ''}>${esc(n)}</option>`)].join('');

  return `<article class="card tier-${tierClass(s.tier)}${past ? ' past' : ''}" id="ev-${esc(c.id)}">
  <div class="card-head">
    <div>
      <h3>${esc(c.name)}</h3>
      <div class="meta">${esc(fmtRange(c.startDate, c.endDate))}${c.dateStatus === 'estimated' ? ' <span class="tag">estimated</span>' : ''}
        · ${esc(c.city)}${c.country && c.country !== c.city ? `, ${esc(c.country)}` : ''}${past ? ' <span class="tag">past</span>' : ''}</div>
    </div>
    <div class="score" title="Score out of 100"><span class="tier">${esc(s.tier)}</span><span class="num">${s.score}</span></div>
  </div>
  <div class="action">${esc(s.action)}</div>
  <div class="badges">${s.borderline ? `<span class="badge warn">${esc(s.borderline)}</span>` : ''}${clusterText ? `<span class="badge cluster">${esc(clusterText)}</span>` : ''}${provenance(c)}</div>
  ${controls ? `<div class="plan-row">${statusButtons}<select data-rep data-id="${esc(c.id)}" aria-label="Assigned rep">${repOptions}</select></div>` : ''}
  <details${open ? ' open' : ''}>
    <summary>Why ${esc(s.tier)}?</summary>
    <div class="why">
      <h4>Pros</h4><ul>${listItems(s.pros, 'No factor rated 4-5')}</ul>
      <h4>Cons</h4><ul>${listItems(s.cons, 'No factor rated 1-2')}</ul>
      <p><b>Biggest drag:</b> ${s.drag ? esc(s.drag.text) : 'none'}</p>
      <table class="ratings"><tbody>${FACTORS.map((k) => `<tr><td>${esc(FACTOR_LABELS[k])}</td><td>${c.ratings[k].score}/5</td><td>${Math.round(s.points[k] * 10) / 10} pts</td><td>${esc(c.ratings[k].why)}</td></tr>`).join('')}
        ${s.bonus ? `<tr><td>Cluster bonus</td><td></td><td>+5 pts</td><td>${esc(s.cluster.name)}</td></tr>` : ''}</tbody></table>
      ${c.description ? `<p>${esc(c.description)}</p>` : ''}
      ${c.audienceSize ? `<p class="muted">~${Number(c.audienceSize).toLocaleString('en-US')} attendees · ${esc((c.verticals || []).join(', '))}</p>` : ''}
      ${c.notes ? `<p class="muted">${esc(c.notes)}</p>` : ''}
      ${site ? `<p><a href="${esc(site)}" target="_blank" rel="noopener">Event website ↗</a></p>` : ''}
    </div>
  </details>
</article>`;
}

// Event delegation: one listener on the list container. onChange() re-draws the list.
export function bindEventCardControls(root, store, onChange) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    const id = btn.dataset.id;
    const current = store.conferencePlan(id).status;
    store.setConferencePlan(id, { status: current === btn.dataset.status ? null : btn.dataset.status });
    onChange();
  });
  root.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-rep]');
    if (!sel) return;
    store.setConferencePlan(sel.dataset.id, { rep: sel.value || null });
    onChange();
  });
}
```

Run: `node tests/run.mjs`. Expected: `41/41 passed`.

- [ ] **Step 3: Create the shell: index.html, styles.css**

`index.html` (replace the whole file):
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0b5d45">
  <title>Grain Conference Tool</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="topbar">
    <span class="brand">Grain · Conferences</span>
    <span id="net" class="net" hidden>Offline: capture still works</span>
  </header>
  <main id="view"><p class="muted pad">Loading…</p></main>
  <nav class="tabs" aria-label="Main">
    <a href="#events" data-tab="events">Events</a>
    <a href="#plan" data-tab="plan">Plan</a>
    <a href="#capture" data-tab="capture" class="tab-capture">Capture</a>
    <a href="#contacts" data-tab="contacts">Contacts</a>
    <a href="#settings" data-tab="settings">Settings</a>
  </nav>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

`styles.css`:
```css
/* One stylesheet, mobile-first. Colours live in :root so they're easy to change. */
:root {
  --bg: #f6f7f5; --card: #fff; --text: #1c2521; --muted: #64706a; --line: #dfe4e0;
  --brand: #0b5d45; --brand-2: #e3f1ec; --warn: #9a5b00; --warn-bg: #fff4de; --err: #b3261e;
  --t-aplus: #0b5d45; --t-a: #2e8b57; --t-b: #2f6fb3; --t-c: #8a8f8c; --t-d: #c9cdca;
  --radius: 10px; --tap: 48px;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
h2 { font-size: 1.25rem; margin: 0 0 .75rem; }
h3 { font-size: 1.05rem; margin: 0; }
h4 { font-size: .9rem; margin: .75rem 0 .25rem; }
a { color: var(--brand); }
.muted { color: var(--muted); }
.pad { padding: 16px; }
.error { color: var(--err); font-weight: 600; }
.hint { font-size: .85rem; color: var(--muted); }

/* Top bar and bottom tabs */
.topbar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: var(--brand); color: #fff; }
.brand { font-weight: 700; }
.net { font-size: .8rem; background: var(--warn-bg); color: var(--warn); padding: 2px 8px; border-radius: 99px; }
.tabs { position: fixed; bottom: 0; left: 0; right: 0; z-index: 5; display: flex; background: #fff; border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom); }
.tabs a { flex: 1; text-align: center; padding: 12px 2px; min-height: var(--tap); text-decoration: none; color: var(--muted); font-size: .85rem; font-weight: 600; }
.tabs a.active { color: var(--brand); box-shadow: inset 0 3px 0 var(--brand); }
.tabs a.tab-capture { color: #fff; background: var(--brand); }
.tabs a.tab-capture.active { box-shadow: inset 0 3px 0 #9fe0c9; }

/* Layout */
.view { max-width: 1100px; margin: 0 auto; padding: 16px; }
.view-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Buttons and inputs */
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 8px 14px; border-radius: var(--radius); border: 1px solid var(--line); background: #fff; color: var(--text); font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
.btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.btn.big { width: 100%; min-height: 56px; font-size: 1.1rem; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.link { background: none; border: none; color: var(--brand); font: inherit; text-decoration: underline; cursor: pointer; padding: 0; }
input, select, textarea { font: inherit; width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: #fff; color: var(--text); min-height: var(--tap); }
textarea { min-height: 110px; resize: vertical; }
label { display: block; font-weight: 600; font-size: .9rem; margin: 12px 0 4px; }
label > input, label > select, label > textarea { margin-top: 4px; font-weight: 400; }
.needs-net-hint { font-size: .8rem; color: var(--warn); }

/* Filters */
.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0 12px; }
.filters .wide { grid-column: 1 / -1; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.seg label { margin: 0; display: flex; align-items: center; padding: 0 12px; min-height: 40px; cursor: pointer; font-weight: 600; background: #fff; }
.seg input { position: absolute; opacity: 0; width: 1px; height: 1px; min-height: 0; }
.seg input:checked + span { color: var(--brand); text-decoration: underline; }
@media (min-width: 800px) { .filters { grid-template-columns: 2fr repeat(4, 1fr) auto; } .filters .wide { grid-column: auto; } }

/* Event card */
.card { background: var(--card); border: 1px solid var(--line); border-left: 6px solid var(--t-c); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 10px; }
.card.past { opacity: .55; }
.card-head { display: flex; justify-content: space-between; gap: 12px; }
.meta { color: var(--muted); font-size: .9rem; }
.score { text-align: center; min-width: 56px; }
.score .tier { display: block; font-weight: 800; font-size: 1.3rem; }
.score .num { font-size: .85rem; color: var(--muted); }
.action { font-weight: 600; margin-top: 4px; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.badge, .tag { font-size: .78rem; padding: 2px 8px; border-radius: 99px; background: var(--brand-2); color: var(--brand); }
.tag { background: #eef0ee; color: var(--muted); }
.badge.warn { background: var(--warn-bg); color: var(--warn); }
.badge.cluster { background: #e7effa; color: #2f6fb3; }
.plan-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0; }
.plan-row select { width: auto; min-height: 36px; padding: 4px 8px; }
.chip { min-height: 36px; padding: 4px 12px; border-radius: 99px; border: 1px solid var(--line); background: #fff; font: inherit; font-size: .9rem; cursor: pointer; }
.chip[aria-pressed="true"] { background: var(--brand); color: #fff; border-color: var(--brand); }
details summary { cursor: pointer; font-weight: 600; color: var(--brand); padding: 6px 0; min-height: 36px; }
.why ul { margin: 0; padding-left: 18px; }
.ratings { width: 100%; border-collapse: collapse; font-size: .85rem; margin: 8px 0; }
.ratings td { border-top: 1px solid var(--line); padding: 4px 6px; vertical-align: top; }
.tier-aplus { border-left-color: var(--t-aplus); } .tier-a { border-left-color: var(--t-a); } .tier-b { border-left-color: var(--t-b); }
.tier-c { border-left-color: var(--t-c); } .tier-d { border-left-color: var(--t-d); }

/* Plan */
.gaps { background: var(--warn-bg); border-radius: var(--radius); padding: 10px 14px; margin-bottom: 12px; }
.gaps ul { margin: 4px 0 0; padding-left: 18px; }
.timeline { display: grid; gap: 10px; }
.month h4 { margin: 0 0 6px; }
.month .empty { font-size: .85rem; color: var(--muted); }
.mini { display: block; background: #fff; border: 1px solid var(--line); border-left: 6px solid var(--t-c); border-radius: 8px; padding: 6px 8px; margin-bottom: 6px; text-decoration: none; color: var(--text); font-size: .88rem; }
.mini small { display: block; color: var(--muted); }
@media (min-width: 800px) { .timeline { grid-auto-flow: column; grid-auto-columns: minmax(170px, 1fr); overflow-x: auto; padding-bottom: 8px; } }

/* Capture */
.capture { max-width: 560px; }
.temps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; border: none; padding: 0; margin: 12px 0 0; }
.temps legend { font-weight: 600; font-size: .9rem; margin-bottom: 4px; }
.temps label { margin: 0; }
.temps input { position: absolute; opacity: 0; width: 1px; height: 1px; min-height: 0; }
.temps span { display: flex; align-items: center; justify-content: center; min-height: 56px; border: 2px solid var(--line); border-radius: var(--radius); font-weight: 700; background: #fff; cursor: pointer; }
.temps input:checked + span.hot { background: #c0392b; border-color: #c0392b; color: #fff; }
.temps input:checked + span.warm { background: #e67e22; border-color: #e67e22; color: #fff; }
.temps input:checked + span.cold { background: #2f6fb3; border-color: #2f6fb3; color: #fff; }
.temps input:focus-visible + span { outline: 3px solid #9fe0c9; }
.match { border-radius: var(--radius); padding: 10px 12px; margin-top: 10px; background: var(--brand-2); }
.match.low { background: var(--warn-bg); }
.match .row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.match .chosen { font-weight: 700; color: var(--brand); }
.done { margin-top: 12px; padding: 10px 12px; background: var(--brand-2); border-radius: var(--radius); }
.whoami { background: var(--warn-bg); padding: 10px 12px; border-radius: var(--radius); margin-bottom: 8px; }

/* Contacts */
.rows { list-style: none; padding: 0; margin: 0; }
.rows li a { display: block; background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; margin-bottom: 8px; text-decoration: none; color: var(--text); }
.sig { display: inline-block; font-size: .8rem; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: #eef0ee; }
.sig-warming { background: #fde2d4; color: #a3361a; } .sig-cooling { background: #e3ecf7; color: #2f5f93; }
.sig-stalled { background: #f1ece0; color: #7a6522; } .sig-steady { background: var(--brand-2); color: var(--brand); } .sig-new { background: #eef0ee; color: var(--muted); }
.box { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; margin: 10px 0; }
.box.ai { border-color: #b9d7cb; }
.box.stale { opacity: .6; }
.disagree { background: var(--warn-bg); color: var(--warn); padding: 6px 10px; border-radius: 8px; font-weight: 600; }
.timeline-list { list-style: none; padding: 0; margin: 0; border-left: 3px solid var(--line); }
.timeline-list li { position: relative; padding: 0 0 14px 14px; }
.timeline-list li::before { content: ""; position: absolute; left: -8px; top: 5px; width: 13px; height: 13px; border-radius: 50%; background: var(--brand); }
.mark { display: inline-block; font-size: .8rem; font-weight: 700; color: #7a4d00; background: var(--warn-bg); padding: 1px 8px; border-radius: 99px; margin: 2px 0; }
pre { white-space: pre-wrap; word-break: break-word; background: #f0f2f0; padding: 10px; border-radius: 8px; font-size: .8rem; }

/* Settings / forms */
.form { max-width: 560px; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rating-row { display: grid; grid-template-columns: 110px 80px 1fr; gap: 6px; align-items: center; margin-top: 6px; }
.rating-row select, .rating-row input { min-height: 40px; }
```

- [ ] **Step 4: Create js/api.js**

```js
// Calls to the two Netlify functions. Always resolves to { ok: true, ... } or
// { ok: false, error, message } with a plain-language message. Never throws.

export const MESSAGES = {
  offline: 'Needs connection',
  no_key: 'AI needs a key: add one in Settings',
  bad_key: 'The Gemini key was rejected: check it in Settings',
  busy: 'AI is busy, try again in a minute',
  timeout: 'Took too long, try again or fill in manually',
  fetch_failed: "Couldn't read that page: paste a description or fill in manually",
  bad_url: 'That link doesn\'t look like a public web page',
  bad_output: "The AI's answer didn't make sense: try again or fill in manually",
  no_function: 'AI and HubSpot only work on the live site (not in local preview)',
  no_token: 'Add a HubSpot token in Settings',
  hubspot_auth: 'HubSpot token invalid or missing permissions',
  unavailable: 'AI unavailable right now',
};

async function post(fn, body, timeoutMs) {
  if (!navigator.onLine) return { ok: false, error: 'offline', message: MESSAGES.offline };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/.netlify/functions/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!data) {
      const error = [404, 405, 501].includes(res.status) ? 'no_function' : 'unavailable';
      return { ok: false, error, message: MESSAGES[error] };
    }
    if (!data.ok) return { ...data, message: MESSAGES[data.error] || data.message || MESSAGES.unavailable };
    return data;
  } catch (e) {
    const error = e && e.name === 'AbortError' ? 'timeout' : 'unavailable';
    return { ok: false, error, message: MESSAGES[error] };
  } finally {
    clearTimeout(timer);
  }
}

export const aiStatus = (key) => post('ai', { task: 'status', key }, 8000);
export const aiArc = (key, payload) => post('ai', { task: 'arc', key, ...payload }, 15000);
export const aiIntake = (key, payload) => post('ai', { task: 'intake', key, ...payload }, 15000);
export const hubspotPush = (token, contacts) => post('hubspot', { token, contacts }, 15000);
```

- [ ] **Step 5: Create the Events and Settings views**

`js/views/events.js`:
```js
// Events tab: filterable list of scored events with the "Why?" breakdown.
import { scoreAll, filterEvents, REGIONS, TIERS, windowMonths, monthLabel } from '../scoring.js';
import { eventCardHTML, bindEventCardControls } from './eventCard.js';
import { esc } from './ui.js';

// Kept between tab switches (per browser session only).
const state = { sort: 'score', q: '', vertical: '', region: '', tier: '', month: '' };

const options = (values, current, all, label = (v) => v) =>
  [`<option value="">${all}</option>`, ...values.map((v) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(label(v))}</option>`)].join('');

export function render(el, ctx, focusId) {
  const { store } = ctx;
  if (focusId) Object.assign(state, { q: '', vertical: '', region: '', tier: '', month: '' });
  const scored = scoreAll(store.conferences());
  const verticals = [...new Set(scored.flatMap((s) => s.conf.verticals || []))].sort();

  el.innerHTML = `<section class="view">
  <div class="view-head"><h2>Events</h2><a class="btn" href="#add">+ Add conference</a></div>
  <form class="filters" onsubmit="return false">
    <input class="wide" type="search" name="q" placeholder="Search name, city…" value="${esc(state.q)}" aria-label="Search">
    <select name="vertical" aria-label="Vertical">${options(verticals, state.vertical, 'All verticals')}</select>
    <select name="region" aria-label="Region">${options(REGIONS, state.region, 'All regions')}</select>
    <select name="tier" aria-label="Tier">${options(TIERS.map((t) => t.tier), state.tier, 'All tiers')}</select>
    <select name="month" aria-label="Month">${options(windowMonths(), state.month, 'All months', monthLabel)}</select>
    <div class="seg" role="radiogroup" aria-label="Sort">
      <label><input type="radio" name="sort" value="score"${state.sort === 'score' ? ' checked' : ''}><span>Score</span></label>
      <label><input type="radio" name="sort" value="date"${state.sort === 'date' ? ' checked' : ''}><span>Date</span></label>
    </div>
  </form>
  <p class="muted" id="ev-count"></p>
  <div id="ev-list"></div>
</section>`;

  const list = el.querySelector('#ev-list');
  const draw = () => {
    const items = filterEvents(scoreAll(store.conferences()), state);
    el.querySelector('#ev-count').textContent = `${items.length} event${items.length === 1 ? '' : 's'}`;
    list.innerHTML = items.map((s) => eventCardHTML(s, {
      plan: store.conferencePlan(s.id), team: store.team(), today: ctx.today, open: s.id === focusId,
    })).join('') || '<p class="muted">No events match these filters.</p>';
  };
  el.querySelector('.filters').addEventListener('input', (e) => {
    if (e.target.name in state) { state[e.target.name] = e.target.value; draw(); }
  });
  bindEventCardControls(list, store, draw);
  draw();
  if (focusId) {
    const card = document.getElementById(`ev-${focusId}`);
    if (card) setTimeout(() => card.scrollIntoView({ block: 'start' }), 0);
  }
}
```

`js/views/settings.js`:
```js
// Settings: who am I, team, keys, AI status, reset demo data.
import { esc } from './ui.js';
import { aiStatus } from '../api.js';

export function render(el, ctx) {
  const { store } = ctx;
  const s = store.settings();
  const team = store.team();

  el.innerHTML = `<section class="view form">
  <h2>Settings</h2>
  <form id="settings-form" onsubmit="return false">
    <label>I am
      <select name="me">${['<option value="">Choose your name…</option>', ...team.map((n) => `<option${n === s.me ? ' selected' : ''}>${esc(n)}</option>`)].join('')}</select>
    </label>
    <label>Team names (comma-separated)
      <input name="team" value="${esc(team.join(', '))}">
    </label>
    <label>Gemini API key (optional: overrides the site's key)
      <input name="geminiKey" type="password" autocomplete="off" value="${esc(s.geminiKey)}">
    </label>
    <p class="hint" id="ai-status">AI status: checking…</p>
    <label>HubSpot private-app token (optional: without it, HubSpot runs in demo mode)
      <input name="hubspotToken" type="password" autocomplete="off" value="${esc(s.hubspotToken)}">
    </label>
    <p class="hint">Keys stay in this browser and are sent only with each request. They are never stored on the server.</p>
    <p id="saved" class="hint" role="status"></p>
  </form>
  <h3>Demo data</h3>
  <p class="hint">Reset clears everything the team added or changed in this browser (leads, statuses, added events, AI summaries). Keys and "I am" are kept.</p>
  <button class="btn" id="reset" type="button">Reset demo data</button>
  <h3 style="margin-top:20px">AI summaries</h3>
  <p class="hint">Copies all AI summaries as JSON, to paste into data/contacts.json under "aiSummaries".</p>
  <button class="btn" id="copy-ai" type="button">Copy AI summaries (JSON)</button>
  <pre id="ai-json" hidden></pre>
  <p class="hint" style="margin-top:20px"><a href="tests.html">Run the tests</a></p>
</section>`;

  const form = el.querySelector('#settings-form');
  const saved = el.querySelector('#saved');
  form.addEventListener('change', () => {
    const f = new FormData(form);
    const teamList = String(f.get('team')).split(',').map((x) => x.trim()).filter(Boolean);
    store.updateSettings({
      me: String(f.get('me') || ''),
      team: teamList,
      geminiKey: String(f.get('geminiKey') || '').trim(),
      hubspotToken: String(f.get('hubspotToken') || '').trim(),
    });
    saved.textContent = 'Saved ✓';
    if (teamList.join() !== team.join()) render(el, ctx); // refresh the "I am" list
    else checkAi();
  });

  el.querySelector('#reset').addEventListener('click', () => {
    if (!confirm('Reset demo data? Leads, statuses and added events from this browser will be deleted. Keys are kept.')) return;
    store.resetOverlay();
    saved.textContent = 'Demo data reset ✓';
  });

  el.querySelector('#copy-ai').addEventListener('click', async () => {
    const json = JSON.stringify(store.exportAiSummaries(), null, 2);
    const pre = el.querySelector('#ai-json');
    pre.textContent = json;
    pre.hidden = false;
    try { await navigator.clipboard.writeText(json); saved.textContent = 'Copied ✓'; } catch { saved.textContent = 'Select the text below and copy it.'; }
  });

  const statusEl = el.querySelector('#ai-status');
  async function checkAi() {
    const key = store.settings().geminiKey;
    const r = await aiStatus(key);
    if (!r.ok) { statusEl.textContent = `AI status: ${r.message}`; return; }
    statusEl.textContent = key ? 'AI: ready (your key)' : r.hasServerKey ? `AI: ready (server key, ${r.model})` : 'AI: needs a key';
  }
  checkAi();
}
```

- [ ] **Step 6: Create js/app.js (this task: Events + Settings only)**

```js
// App shell: loads the seed data, creates the store, switches tabs, tracks online/offline.
import { createStore, safeStorage } from './store.js';
import { runningToday } from './scoring.js';
import { localToday } from './views/ui.js';
import * as events from './views/events.js';
import * as settings from './views/settings.js';

const VIEWS = { events, settings };
const TAB_OF = { add: 'events' }; // sub-pages highlight their parent tab
const viewEl = document.getElementById('view');
const netEl = document.getElementById('net');

// Buttons that need a connection carry data-needs-net. Toggle them without re-rendering,
// so a flaky connection never wipes what the rep is typing.
function applyNet() {
  const online = navigator.onLine;
  netEl.hidden = online;
  document.querySelectorAll('[data-needs-net]').forEach((b) => {
    b.disabled = !online || b.dataset.blocked === 'true';
    b.title = online ? '' : 'Needs connection';
  });
  document.querySelectorAll('.needs-net-hint').forEach((h) => { h.hidden = online; });
}

async function loadSeed() {
  const get = async (p) => {
    const r = await fetch(p);
    if (!r.ok) throw new Error(`${p}: ${r.status}`);
    return r.json();
  };
  const [conferences, contactsData] = await Promise.all([get('data/conferences.json'), get('data/contacts.json')]);
  return { conferences, contacts: contactsData };
}

function render(ctx) {
  const [name, ...rest] = location.hash.slice(1).split('/');
  const param = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  const view = VIEWS[name] || VIEWS.events;
  const tab = TAB_OF[name] || (VIEWS[name] ? name : 'events');
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  ctx.today = localToday();
  view.render(viewEl, ctx, param);
  applyNet();
  window.scrollTo(0, 0);
}

async function boot() {
  let seed;
  try {
    seed = await loadSeed();
  } catch {
    viewEl.innerHTML = '<p class="error pad">Couldn\'t load the event data. Check your connection and reload.</p>';
    return;
  }
  const store = createStore({ seed, storage: safeStorage(window.localStorage) });
  const ctx = { store, today: localToday(), applyNet, go: (hash) => { location.hash = hash; } };
  if (!location.hash) {
    location.replace(`#${runningToday(store.conferences(), ctx.today) ? 'capture' : 'events'}`);
  }
  window.addEventListener('hashchange', () => render(ctx));
  window.addEventListener('online', applyNet);
  window.addEventListener('offline', applyNet);
  render(ctx);
}

boot();
```

- [ ] **Step 7: Check it in the browser**

Run: `render "http://localhost:8000/index.html#events" 400` (with the `render` function from Conventions).
Expected text starts with: `Events + Add conference All verticals …` and contains `33 events Money20/20 Europe 2027 8–10 Jun 2027 · Amsterdam, Netherlands A+ 98 Must attend`.
Run: `render "http://localhost:8000/index.html#settings" 300`.
Expected: contains `I am Choose your name… Maya Daniel Yoni Shira` and `AI status: AI and HubSpot only work on the live site (not in local preview)`.
Open `http://localhost:8000/` on a phone-width window (or tell the user to): the list, the "Why A+?" toggle, the Going/Considering/Skip chips and the rep dropdown work; status survives a reload. ("+ Add conference" does nothing until Task 13.)

- [ ] **Step 8: Commit and push**

```bash
git add index.html styles.css js/ tests/
git commit -m "Events tab: scored list, filters, sort, why/pros/cons/drag, status and rep; Settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 5: Plan tab (MVP 2)

**Files:**
- Create: `js/views/plan.js`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `scoreAll`, `findGaps`, `windowMonths`, `monthLabel`, `inWindow`; `esc`, `fmtRange`, `tierClass`; `store.conferencePlan`.
- Produces: route `#plan`. Mini-cards link to `#events/<id>`.

- [ ] **Step 1: Create js/views/plan.js**

```js
// Plan tab: 13-month timeline by tier, clusters, status/rep, and a short gaps list.
import { scoreAll, findGaps, windowMonths, monthLabel, inWindow } from '../scoring.js';
import { esc, fmtRange, tierClass } from './ui.js';

const STATUS_TEXT = { going: 'Going', considering: 'Considering', skip: 'Skip' };

function gapLines(gaps) {
  const lines = [];
  lines.push(gaps.months.length
    ? `No A/B event in: ${gaps.months.map(monthLabel).join(', ')}`
    : 'Every month has at least one A/B event');
  lines.push(gaps.regions.length
    ? `No A-tier event in: ${gaps.regions.join(', ')}`
    : 'Every region has an A-tier event');
  lines.push(gaps.verticals.length
    ? `No A/B event for: ${gaps.verticals.join(', ')}`
    : 'Every core vertical (payments, cross-border, travel, treasury, FX) has an A/B event');
  return lines;
}

export function render(el, ctx) {
  const { store } = ctx;
  const scored = scoreAll(store.conferences()).filter((s) => inWindow(s.conf));
  const months = windowMonths();
  const gaps = findGaps(scored);

  const mini = (s) => {
    const c = s.conf;
    const p = store.conferencePlan(s.id);
    const status = [p.status && STATUS_TEXT[p.status], p.rep].filter(Boolean).join(' · ');
    return `<a class="mini tier-${tierClass(s.tier)}" href="#events/${encodeURIComponent(s.id)}">
      <b>${esc(s.tier)} ${s.score}</b> ${esc(c.name)}
      <small>${esc(fmtRange(c.startDate, c.endDate))} · ${esc(c.city)}${c.dateStatus === 'estimated' ? ' · est.' : ''}</small>
      ${s.cluster ? `<span class="badge cluster">+5 cluster</span>` : ''}
      ${status ? `<small><b>${esc(status)}</b></small>` : ''}
    </a>`;
  };

  el.innerHTML = `<section class="view">
  <h2>Plan · ${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}</h2>
  <div class="gaps"><b>Gaps</b><ul>${gapLines(gaps).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>
  <div class="timeline">${months.map((m) => {
    const inMonth = scored.filter((s) => s.conf.startDate.slice(0, 7) === m).sort((a, b) => a.conf.startDate.localeCompare(b.conf.startDate));
    return `<div class="month"><h4>${monthLabel(m)}</h4>${inMonth.map(mini).join('') || '<div class="empty">No events</div>'}</div>`;
  }).join('')}</div>
</section>`;
}
```

- [ ] **Step 2: Register the view in js/app.js**

Replace:
```js
import * as events from './views/events.js';
import * as settings from './views/settings.js';
```
with:
```js
import * as events from './views/events.js';
import * as plan from './views/plan.js';
import * as settings from './views/settings.js';
```
and replace `const VIEWS = { events, settings };` with `const VIEWS = { events, plan, settings };`

- [ ] **Step 3: Check it**

Run: `render "http://localhost:8000/index.html#plan" 400`
Expected: starts with `Plan · Sep 2026 – Sep 2027 Gaps No A/B event in: Sep 2026, Dec 2026, Jan 2027, Jul 2027, Aug 2027 No A-tier event in: North America, Middle East, Asia-Pacific Every core vertical (payments, cross-border, travel, treasury, FX) has an A/B event Sep 2026 C 54 Sibos 2026`.
Also: `node tests/run.mjs` still `41/41 passed`.

- [ ] **Step 4: Commit and push**

```bash
git add js/views/plan.js js/app.js
git commit -m "Plan tab: 13-month timeline by tier, clusters, status/rep, gaps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 6: Matching logic

**Files:**
- Create: `js/matching.js`, `tests/matching.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: `data/contacts.json` (`people`, `encounters`, `notSamePairs`, `liveDemoScript`).
- Produces: `norm(s)`, `normCompany(s)`, `sameCompany(a,b)→true|false|null`, `normEmail`, `normLinkedin`, `levenshtein(a,b)`, `namesSimilar(a,b)`, `findMatches(capture, people, encounters, notSamePairs=[], selfId=null)→{ auto:{person,via:'email'|'linkedin'}|null, candidates:[{person, level:'high'|'low', meetings, last}] }`, `normEventName(s)`, `normUrl(u)`, `findConferenceDuplicates({name, website}, conferences)→[{conf, reason:'name'|'link'}]`.

- [ ] **Step 1: Write the failing matching tests**

`tests/matching.test.js`:
```js
import {
  norm, normCompany, sameCompany, namesSimilar, normLinkedin, findMatches,
  normUrl, findConferenceDuplicates,
} from '../js/matching.js';

export default function matchingTests(t, data) {
  const { people, encounters, notSamePairs, liveDemoScript } = data.contacts;
  const confs = data.conferences.conferences;
  const match = (capture, selfId = null) => findMatches(capture, people, encounters, notSamePairs, selfId);
  const demo = (type) => liveDemoScript.find((d) => d.type === type).capture;

  t.group('Matching: normalising');

  t.test('Accents, casing and punctuation', () => {
    t.eq(norm('  José  GARCÍA '), 'jose garcia');
  });
  t.test('Company suffixes are ignored', () => {
    t.eq([normCompany('Iberitrips S.L.'), normCompany('Vantelo Pay B.V.'), normCompany('Alpveldt Reisen GmbH'), normCompany('Brixa Payments Ltd')],
      ['iberitrips', 'vantelo pay', 'alpveldt reisen', 'brixa payments']);
  });
  t.test('Brixa = Brixa Payments; empty company is unknown, not different', () => {
    t.eq([sameCompany('Brixa', 'Brixa Payments Ltd'), sameCompany('Atlasbeds', 'Sunmerra Tours'), sameCompany('', 'Atlasbeds')], [true, false, null]);
  });
  t.test('Nicknames, typos and initials', () => {
    t.eq([
      namesSimilar('Jon Cohen', 'Jonathan Cohen'),
      namesSimilar('Kasia Nowak', 'Katarzyna Nowak'),
      namesSimilar('Tom Becker', 'Thomas Becker'),
      namesSimilar('Dana Levy', 'Dana Levi'),
      namesSimilar('Mark Thomson', 'Mark Thompson'),
      namesSimilar('K. Nowak', 'Katarzyna Nowak'),
      namesSimilar('Jose Garcia', 'José García'),
    ], [true, true, true, true, true, true, true]);
  });
  t.test('Different first names with the same last name are not similar', () => {
    t.eq([namesSimilar('David Cohen', 'Jonathan Cohen'), namesSimilar('Dana Levi', 'Mark Levi')], [false, false]);
  });
  t.test('LinkedIn URLs are compared by profile slug', () => {
    t.eq(normLinkedin('https://www.LinkedIn.com/in/jonathan-cohen-fx/'), 'linkedin.com/in/jonathan-cohen-fx');
  });

  t.group('Matching: live demo script');

  t.test('Sara Mizrahi @ Sunmerra Tours -> low-confidence suggestion: Sarah Mizrahi', () => {
    const r = match(demo('low-confidence job change'));
    t.eq([r.auto, r.candidates.map((c) => [c.person.id, c.level])], [null, [['p-sarah', 'low']]]);
  });
  t.test('Dana Levy @ Vantelo Pay -> high-confidence suggestion: Dana Levi, 3 meetings', () => {
    const r = match(demo('high-confidence variant'));
    t.eq(r.candidates.map((c) => [c.person.id, c.level, c.meetings]), [['p-dana', 'high', 3]]);
  });
  t.test('David Cohen, no company -> both David Cohens as candidates', () => {
    const r = match(demo('ambiguous same name'));
    t.eq(r.candidates.map((c) => c.person.id).sort(), ['p-david-c', 'p-david-t']);
  });
  t.test('K. Nowak + known email -> auto-linked to Katarzyna Nowak', () => {
    const r = match(demo('email auto-link'));
    t.eq([r.auto.person.id, r.auto.via], ['p-kasia', 'email']);
  });

  t.group('Matching: edge cases');

  t.test('The two David Cohens are never suggested as each other (notSamePairs)', () => {
    const r = match({ name: 'David Cohen', company: 'Tranzio Wholesale' }, 'p-david-t');
    t.eq(r.candidates.map((c) => c.person.id), []);
  });
  t.test('Same LinkedIn -> auto-link even with a new company and nickname', () => {
    const r = match({ name: 'Jon Cohen', company: 'Somewhere New', linkedin: 'https://linkedin.com/in/jonathan-cohen-fx/' });
    t.eq([r.auto.person.id, r.auto.via], ['p-jonathan', 'linkedin']);
  });
  t.test('José García typed without accents, suffix dropped -> high confidence', () => {
    const r = match({ name: 'Jose Garcia', company: 'Iberitrips' });
    t.eq(r.candidates.map((c) => [c.person.id, c.level]), [['p-jose', 'high']]);
  });
  t.test('Very short or single-word names do not crash and do not match everyone', () => {
    t.eq([match({ name: 'Da' }).candidates.length, match({ name: 'Priya' }).candidates.length], [0, 0]);
  });
  t.test('Empty capture returns nothing', () => {
    t.eq(match({}), { auto: null, candidates: [] });
  });

  t.group('Conference duplicates');

  t.test('URL keeps subdomain and path: Money20/20 Europe and USA differ', () => {
    t.ok(normUrl('https://europe.money2020.com') !== normUrl('https://us.money2020.com'), 'different editions');
    t.eq(normUrl('HTTPS://www.aiconnects.us/airline-travel-payments-b2b-summit-2027/?utm=x#top'), 'aiconnects.us/airline-travel-payments-b2b-summit-2027');
  });
  t.test('Same link warns', () => {
    const d = findConferenceDuplicates({ name: 'Some Summit', website: 'europe.money2020.com/' }, confs);
    t.eq(d.map((x) => [x.conf.id, x.reason]), [['money2020-europe-2027', 'link']]);
  });
  t.test('Same name, different year warns', () => {
    const d = findConferenceDuplicates({ name: 'Money20/20 Europe 2028', website: '' }, confs);
    t.eq(d.map((x) => [x.conf.id, x.reason]), [['money2020-europe-2027', 'name']]);
  });
  t.test('Another Money20/20 edition on another subdomain does not warn', () => {
    t.eq(findConferenceDuplicates({ name: 'Money20/20 Middle East', website: 'https://middleeast.money2020.com' }, confs).length, 0);
  });
}
```

Update `tests/all.js`:
```js
// Every test suite, in order. Each suite is a function (t, data) => void.
import scoring from './scoring.test.js';
import store from './store.test.js';
import ui from './ui.test.js';
import matching from './matching.test.js';

export const suites = [scoring, store, ui, matching];

export function runAll(t, data) {
  for (const suite of suites) suite(t, data);
}
```

- [ ] **Step 2: Run to see it fail**

Run: `node tests/run.mjs`. Expected: `ERR_MODULE_NOT_FOUND` for `js/matching.js`.

- [ ] **Step 3: Implement js/matching.js**

```js
// Pure matching logic: is this the same person / the same conference?
// Fuzzy matches are only ever suggestions; the rep decides.

const NICKNAMES = {
  jon: 'jonathan', jonny: 'jonathan', mike: 'michael', tom: 'thomas', tommy: 'thomas',
  kasia: 'katarzyna', sara: 'sarah', dave: 'david', dan: 'daniel', danny: 'daniel',
  bob: 'robert', rob: 'robert', bill: 'william', will: 'william', liz: 'elizabeth',
  beth: 'elizabeth', kate: 'katherine', katie: 'katherine', alex: 'alexander',
  chris: 'christopher', nick: 'nicholas', matt: 'matthew', jim: 'james', jimmy: 'james',
  joe: 'joseph', ben: 'benjamin', sam: 'samuel', pepe: 'jose',
};
const COMPANY_SUFFIXES = new Set(['ltd', 'limited', 'inc', 'llc', 'gmbh', 'sl', 'bv', 'sa', 'ag', 'plc', 'co', 'corp', 'srl', 'sas']);

// Lowercase, strip accents and punctuation, collapse spaces. "José García" -> "jose garcia".
export function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Vantelo Pay B.V." -> "vantelo pay"; "Iberitrips S.L." -> "iberitrips".
export function normCompany(s) {
  const tokens = norm(s).replace(/\b([a-z]) ([a-z])\b/g, '$1$2').split(' ').filter(Boolean);
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

// true = same, false = different, null = unknown (one side empty).
export function sameCompany(a, b) {
  const x = normCompany(a);
  const y = normCompany(b);
  if (!x || !y) return null;
  return x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ');
}

export function normEmail(s) {
  return String(s || '').trim().toLowerCase();
}

export function normLinkedin(s) {
  const v = String(s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  const m = v.match(/linkedin\.com\/in\/([^/?#]+)/);
  return m ? `linkedin.com/in/${m[1]}` : v;
}

export function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const canon = (first) => NICKNAMES[first] || first;

function nameParts(name) {
  const tokens = norm(name).split(' ').filter(Boolean);
  if (!tokens.length) return null;
  return { first: tokens[0], last: tokens[tokens.length - 1] };
}

export function namesSimilar(a, b) {
  const A = nameParts(a);
  const B = nameParts(b);
  if (!A || !B) return false;
  const lastOk = A.last === B.last || (A.last.length >= 4 && B.last.length >= 4 && levenshtein(A.last, B.last) <= 1);
  if (!lastOk) return false;
  if (A.first.length === 1 || B.first.length === 1) return A.first[0] === B.first[0];
  return canon(A.first) === canon(B.first) || levenshtein(A.first, B.first) <= 1 || levenshtein(canon(A.first), canon(B.first)) <= 1;
}

function groupByPerson(encounters) {
  const map = new Map();
  for (const e of [...encounters].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!map.has(e.personId)) map.set(e.personId, []);
    map.get(e.personId).push(e);
  }
  return map;
}

function isBlocked(notSamePairs, a, b) {
  return notSamePairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/**
 * capture: { name, company, email, linkedin }
 * selfId: the id of the record being matched, if it already exists (its notSamePairs apply).
 * Returns { auto: { person, via: 'email'|'linkedin' } | null,
 *           candidates: [{ person, level: 'high'|'low', meetings, last }] }
 */
export function findMatches(capture, people, encounters, notSamePairs = [], selfId = null) {
  const byPerson = groupByPerson(encounters);
  const pool = people.filter((p) => p.id !== selfId && !(selfId && isBlocked(notSamePairs, selfId, p.id)));
  const email = normEmail(capture.email);
  const li = normLinkedin(capture.linkedin);

  for (const p of pool) {
    const encs = byPerson.get(p.id) || [];
    if (email && [p.email, ...encs.map((e) => e.email)].map(normEmail).includes(email)) return { auto: { person: p, via: 'email' }, candidates: [] };
    if (li && [p.linkedin, ...encs.map((e) => e.linkedin)].filter(Boolean).map(normLinkedin).includes(li)) return { auto: { person: p, via: 'linkedin' }, candidates: [] };
  }

  if (norm(capture.name).length < 3) return { auto: null, candidates: [] };
  const candidates = [];
  for (const p of pool) {
    const encs = byPerson.get(p.id) || [];
    const names = [p.name, ...encs.map((e) => e.nameAsEntered)];
    if (!names.some((n) => namesSimilar(capture.name, n))) continue;
    const level = sameCompany(capture.company, p.company) === true ? 'high' : 'low';
    candidates.push({ person: p, level, meetings: encs.length, last: encs[encs.length - 1] || null });
  }
  candidates.sort((a, b) => (a.level === b.level ? b.meetings - a.meetings : a.level === 'high' ? -1 : 1));
  return { auto: null, candidates };
}

// ---- Conference duplicates (Add conference): a warning, never a block ----

export function normEventName(s) {
  return norm(s).replace(/\b(19|20)\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim();
}

// Full hostname (minus www.) + path (minus trailing slash, query, hash).
export function normUrl(u) {
  const raw = String(u || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    return (url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function jaccard(a, b) {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// Returns [{ conf, reason: 'name'|'link' }]
export function findConferenceDuplicates({ name, website }, conferences) {
  const n = normEventName(name);
  const u = normUrl(website);
  const out = [];
  for (const c of conferences) {
    if (u && normUrl(c.website) === u) out.push({ conf: c, reason: 'link' });
    else if (n && (normEventName(c.name) === n || jaccard(normEventName(c.name), n) >= 0.8)) out.push({ conf: c, reason: 'name' });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `node tests/run.mjs`. Expected: `60/60 passed`.

- [ ] **Step 5: Commit and push**

```bash
git add js/matching.js tests/matching.test.js tests/all.js
git commit -m "Matching: nicknames, accents, suffixes, auto/high/low levels, conference duplicates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 7: Relationship signals

**Files:**
- Create: `js/signals.js`, `tests/signals.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: `sameCompany`, `norm` (Task 6); `dayNumber` (Task 2).
- Produces: `LABELS` (6 labels), `findAsks(note)→[names]`, `seniority(title)→1..5`, `timelineMarkers(encounters)→[{encounter, marks:[{type:'job'|'seniority', text}]}]` (sorted by date), `relationshipSignal(encounters, today)→{label, reasons:[string], meetings, asks}`, `cutNote(note, max=80)`, `summaryLine(signal, encounters)`, `hubspotPayload(person, encounters, signal)→{email, firstname, lastname, company, jobtitle, grain_lead_source, grain_conference_summary}`, `contactsCsv(rows:[{person, encounters, signal}])→string` (no BOM).

- [ ] **Step 1: Write the failing signal tests**

`tests/signals.test.js`:
```js
import {
  relationshipSignal, findAsks, seniority, timelineMarkers, summaryLine, hubspotPayload, contactsCsv, cutNote,
} from '../js/signals.js';

const TODAY = '2026-09-26';

// "_expectedSignal" is either a label, or "Rules: <label> / AI: <label>" (Ahmed).
function expectedRulesLabel(expected) {
  const m = expected.match(/^Rules: (.*?) \/ AI:/);
  return m ? m[1] : expected;
}

export default function signalsTests(t, data) {
  const { people, encounters } = data.contacts;
  const encsOf = (id) => encounters.filter((e) => e.personId === id);

  t.group('Relationship signals: every demo person');

  for (const p of people) {
    const expected = expectedRulesLabel(p._expectedSignal);
    t.test(`${p.name} (${p.company}) -> ${expected}`, () => {
      t.eq(relationshipSignal(encsOf(p.id), TODAY).label, expected);
    });
  }

  t.group('Relationship signals: details');

  t.test('Concrete asks include the extended keywords, at word starts', () => {
    t.eq(findAsks('Shortlisted us vs. one competitor. Asked for a security questionnaire and references.'),
      ['shortlist', 'references', 'questionnaire']);
    t.eq(findAsks('~EUR 40M/month in merchant payouts'), ['amount']);
    t.eq(findAsks('Industrial client, great chat, will intro us internally'), []);
  });
  t.test('Ahmed: rules see the proposal ask, but stay Steady because the latest meeting is only warm', () => {
    const s = relationshipSignal(encsOf('p-ahmed'), TODAY);
    t.eq([s.label, s.asks], ['Steady - nurture', ['proposal']]);
  });
  t.test('Mark: reasons explain the tire-kicker label', () => {
    const s = relationshipSignal(encsOf('p-mark'), TODAY);
    t.eq(s.reasons.slice(0, 2), ['4 meetings', 'over 12 months']);
    t.ok(s.reasons.includes('no concrete asks'), 'says no concrete asks');
  });
  t.test('Seniority ranks', () => {
    t.eq(['CFO', 'VP Finance', 'Head of Treasury', 'Finance Director', 'Treasury Manager', 'Analyst', ''].map(seniority), [5, 4, 3, 3, 2, 1, 1]);
  });
  t.test('Jonathan: job change marker, more senior', () => {
    const marks = timelineMarkers(encsOf('p-jonathan')).flatMap((m) => m.marks.map((x) => x.text));
    t.eq(marks, ['Job change: Lumora Remit → Meridia FX ↑ more senior']);
  });
  t.test('Dana: promotions inside the same company are not job changes', () => {
    const marks = timelineMarkers(encsOf('p-dana')).flatMap((m) => m.marks.map((x) => x.type));
    t.eq(marks, ['seniority', 'seniority']);
  });
  t.test('Mark: "Brixa" vs "Brixa Payments Ltd" is not a job change', () => {
    t.eq(timelineMarkers(encsOf('p-mark')).flatMap((m) => m.marks), []);
  });
  t.test('A new job at the latest meeting -> Warming - new role (Sara Mizrahi live demo)', () => {
    const extra = { id: 'x', personId: 'p-sarah', date: '2026-10-15', event: 'IAMTN Annual Summit 2026', nameAsEntered: 'Sara Mizrahi', company: 'Sunmerra Tours', title: '', temperature: 'warm', note: 'Now at Sunmerra.' };
    t.eq(relationshipSignal([...encsOf('p-sarah'), extra], TODAY).label, 'Warming - new role, re-engage');
  });

  t.group('HubSpot payload and CSV');

  t.test('Dana: summary line for the "Grain conference summary" property', () => {
    const encs = encsOf('p-dana');
    t.eq(summaryLine(relationshipSignal(encs, TODAY), encs),
      'Warming - act now · 3 meetings · last met at Money20/20 Europe 2026 · "Now VP Finance. Wants a demo with their CFO before Q4 budget. Asked about…"');
  });
  t.test('Dana: payload fields, lead source = first conference', () => {
    const p = people.find((x) => x.id === 'p-dana');
    const encs = encsOf('p-dana');
    const payload = hubspotPayload(p, encs, relationshipSignal(encs, TODAY));
    t.eq([payload.email, payload.firstname, payload.lastname, payload.company, payload.jobtitle, payload.grain_lead_source],
      ['dana.levi@vantelopay.com', 'Dana', 'Levi', 'Vantelo Pay', 'VP Finance', 'Money20/20 Europe 2025']);
  });
  t.test('Short notes are not cut', () => {
    t.eq(cutNote('Short note.'), 'Short note.');
  });
  t.test('CSV quotes commas, quotes and line breaks; keeps accents', () => {
    const csv = contactsCsv([{ person: { name: 'José García', company: 'Iberitrips S.L.', title: 'CFO', email: '', linkedin: '' },
      encounters: [{ date: '2025-03-06', event: 'ITB Berlin 2025', note: 'Said "yes", then\nleft, fast' }], signal: { label: 'New' } }]);
    t.eq(csv.split('\r\n')[1], 'José García,Iberitrips S.L.,CFO,,,ITB Berlin 2025,ITB Berlin 2025,1,New,"Said ""yes"", then\nleft, fast"');
  });
}
```

Update `tests/all.js`:
```js
// Every test suite, in order. Each suite is a function (t, data) => void.
import scoring from './scoring.test.js';
import store from './store.test.js';
import ui from './ui.test.js';
import matching from './matching.test.js';
import signals from './signals.test.js';

export const suites = [scoring, store, ui, matching, signals];

export function runAll(t, data) {
  for (const suite of suites) suite(t, data);
}
```

- [ ] **Step 2: Run to see it fail**

Run: `node tests/run.mjs`. Expected: `ERR_MODULE_NOT_FOUND` for `js/signals.js`.

- [ ] **Step 3: Implement js/signals.js**

```js
// Pure relationship logic: rules label + reasons, timeline markers, HubSpot payload, CSV.
import { sameCompany, norm } from './matching.js';
import { dayNumber } from './scoring.js';

export const LABELS = [
  'New',
  'Cooling - lost for now',
  'Warming - new role, re-engage',
  'Warming - act now',
  'Stalled - possible tire-kicker',
  'Steady - nurture',
];
const TEMP = { cold: 1, warm: 2, hot: 3 };

// Concrete asks: matched at a word start, case-insensitive.
const ASKS = [
  ['volumes', /\bvolumes?\b/i],
  ['amount', /\b(eur|usd|gbp|ils|chf|pln)\s?\d[\d.,]*\s?(k|m|bn)?\b|[€$£]\s?\d[\d.,]*\s?(k|m|bn)?\b|\b\d[\d.,]*\s?(k|m|bn)\s?\/\s?(month|year|mo|yr)\b/i],
  ['pricing', /\bpric(e|es|ing)\b/i],
  ['demo', /\bdemos?\b/i],
  ['proposal', /\bproposals?\b/i],
  ['intro to finance', /\bintro(duction)? to (their |the )?(cfo|finance|treasury)\b/i],
  ['shortlist', /\bshortlist/i],
  ['references', /\breferences?\b/i],
  ['budget', /\bbudget/i],
  ['contract', /\bcontracts?\b/i],
  ['RFP', /\brfps?\b/i],
  ['questionnaire', /\bquestionnaires?\b/i],
  ['security review', /\bsecurity review/i],
  ['trial', /\btrials?\b/i],
  ['pilot', /\bpilots?\b/i],
];

export function findAsks(note) {
  return ASKS.filter(([, re]) => re.test(note || '')).map(([name]) => name);
}

export function seniority(title) {
  const t = norm(title);
  if (!t) return 1;
  if (/\b(vp|vice president|svp|evp)\b/.test(t)) return 4;
  if (/\b(chief|ceo|cfo|cto|coo|cro|cmo|founder|cofounder|owner|president)\b/.test(t)) return 5;
  if (/\b(head|director)\b/.test(t)) return 3;
  if (/\b(manager|lead)\b/.test(t)) return 2;
  return 1;
}

const byDate = (a, b) => a.date.localeCompare(b.date);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const monthsBetween = (a, b) => Math.round((dayNumber(b) - dayNumber(a)) / 30.44);

// Previous known company before index i (skips empty companies).
function prevCompany(encs, i) {
  for (let j = i - 1; j >= 0; j--) if (encs[j].company) return encs[j].company;
  return '';
}

// One marker list per encounter (same order as the sorted encounters).
export function timelineMarkers(encounters) {
  const encs = [...encounters].sort(byDate);
  return encs.map((e, i) => {
    const marks = [];
    if (i === 0) return { encounter: e, marks };
    const before = prevCompany(encs, i);
    const prevTitle = encs.slice(0, i).reverse().find((x) => x.title)?.title || '';
    const up = e.title && prevTitle ? Math.sign(seniority(e.title) - seniority(prevTitle)) : 0;
    if (e.company && before && sameCompany(e.company, before) === false) {
      marks.push({ type: 'job', text: `Job change: ${before} → ${e.company}${up > 0 ? ' ↑ more senior' : ''}` });
    } else if (up !== 0) {
      marks.push({ type: 'seniority', text: `${up > 0 ? 'Promoted' : 'New title'}: ${prevTitle} → ${e.title}` });
    }
    return { encounter: e, marks };
  });
}

/**
 * encounters: all encounters of one person (any order). today: 'YYYY-MM-DD'.
 * Returns { label, reasons: [string], meetings, asks: [string] }
 */
export function relationshipSignal(encounters, today) {
  const encs = [...encounters].sort(byDate);
  const n = encs.length;
  if (!n) return { label: 'New', reasons: [], meetings: 0, asks: [] };
  const latest = encs[n - 1];
  const prev = encs[n - 2];
  const temps = encs.map((e) => TEMP[e.temperature] || 0);
  const latestAsks = findAsks(latest.note);
  const allAsks = [...new Set(encs.flatMap((e) => findAsks(e.note)))];
  const spanDays = dayNumber(latest.date) - dayNumber(encs[0].date);
  const before = prevCompany(encs, n - 1);
  const companyChanged = !!(latest.company && before && sameCompany(latest.company, before) === false);

  const reasons = [plural(n, 'meeting')];
  if (n > 1) reasons.push(`over ${plural(Math.max(1, monthsBetween(encs[0].date, latest.date)), 'month')}`);
  if (today) {
    const ago = monthsBetween(latest.date, today);
    reasons.push(ago < 1 ? 'last met this month' : `last met ${plural(ago, 'month')} ago`);
  }
  if (n > 1) reasons.push(encs.map((e) => e.temperature).join(' → '));
  reasons.push(allAsks.length ? `asks: ${allAsks.join(', ')}` : 'no concrete asks');
  for (const m of timelineMarkers(encs)) for (const mark of m.marks) reasons.push(mark.text);

  let label;
  if (n === 1) label = 'New';
  else if (latest.temperature === 'cold' && temps.slice(0, -1).some((x) => x > TEMP.cold)) label = 'Cooling - lost for now';
  else if (companyChanged) label = 'Warming - new role, re-engage';
  else if (latest.temperature === 'hot' && ((TEMP[latest.temperature] > (TEMP[prev.temperature] || 0)) || latestAsks.length)) label = 'Warming - act now';
  else if (n >= 3 && spanDays >= 182 && !temps.includes(TEMP.hot) && !allAsks.length) label = 'Stalled - possible tire-kicker';
  else label = 'Steady - nurture';

  return { label, reasons, meetings: n, asks: allAsks };
}

export function cutNote(note, max = 80) {
  const s = String(note || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, '')}…`;
}

// "Warming - act now · 3 meetings · last met at Money20/20 Europe 2026 · "Now VP Finance. …""
export function summaryLine(signal, encounters) {
  const encs = [...encounters].sort(byDate);
  const latest = encs[encs.length - 1];
  if (!latest) return signal.label;
  const parts = [signal.label, plural(encs.length, 'meeting'), `last met at ${latest.event}`];
  if (latest.note) parts.push(`"${cutNote(latest.note)}"`);
  return parts.join(' · ');
}

export function hubspotPayload(person, encounters, signal) {
  const encs = [...encounters].sort(byDate);
  const [firstname, ...rest] = String(person.name || '').trim().split(/\s+/);
  return {
    email: String(person.email || '').trim().toLowerCase(),
    firstname: firstname || '',
    lastname: rest.join(' '),
    company: person.company || '',
    jobtitle: person.title || '',
    grain_lead_source: encs[0] ? encs[0].event : '',
    grain_conference_summary: summaryLine(signal, encs),
  };
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// rows: [{ person, encounters, signal }] -> CSV text (the caller adds the BOM when downloading).
export function contactsCsv(rows) {
  const header = ['name', 'company', 'title', 'email', 'linkedin', 'first event', 'last event', 'meetings', 'signal', 'last note'];
  const lines = rows.map(({ person, encounters, signal }) => {
    const encs = [...encounters].sort(byDate);
    const first = encs[0];
    const last = encs[encs.length - 1];
    return [person.name, person.company, person.title, person.email, person.linkedin,
      first ? first.event : '', last ? last.event : '', encs.length, signal.label, last ? last.note : ''];
  });
  return [header, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
```

- [ ] **Step 4: Run the tests**

Run: `node tests/run.mjs`. Expected: `83/83 passed` (including one test per demo person, all 11 matching `_expectedSignal`).

- [ ] **Step 5: Commit and push**

```bash
git add js/signals.js tests/signals.test.js tests/all.js
git commit -m "Relationship rules: 6 labels with reasons, job/seniority markers, HubSpot line, CSV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 8: Capture tab with the match nudge (MVP 3 + 4a)

**Files:**
- Create: `js/views/capture.js`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `defaultCaptureConference`; `findMatches`; `relationshipSignal`; `esc`, `fmtShort`, `signalClass`; store `draft/setDraft/clearDraft`, `saveCapture`, `people`, `encounters`, `notSamePairs`, `encountersFor`, `person`, `conference`, `team`, `settings`, `updateSettings`.
- Produces: route `#capture`. The "Open contact" link goes to `#contacts/<personId>` (shows Events until Task 9).

- [ ] **Step 1: Create js/views/capture.js**

```js
// Capture tab: one screen, one hand, works offline. Matching runs locally as the rep types.
import { defaultCaptureConference } from '../scoring.js';
import { findMatches } from '../matching.js';
import { relationshipSignal } from '../signals.js';
import { esc, fmtShort, signalClass } from './ui.js';

const OTHER = '__other';
const FIELDS = ['event', 'otherEvent', 'name', 'company', 'note', 'temperature', 'email', 'linkedin', 'title'];

// Match decision for the current form: null (not answered), { personId, via } or { newPerson: true }.
let decision = null;
let lastMatch = { auto: null, candidates: [] };
let lastSaved = null;
let stickyEvent = null; // last event used this session (a new day/reload goes back to today's event)
let stickyOther = '';

export function render(el, ctx) {
  const { store } = ctx;
  const confs = [...store.conferences()].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const def = defaultCaptureConference(confs, ctx.today);
  const draft = store.draft();
  const me = store.settings().me;
  const selected = draft.event || stickyEvent || (def ? def.id : OTHER);
  const otherName = draft.otherEvent || stickyOther;

  el.innerHTML = `<section class="view capture">
  ${me ? '' : `<div class="whoami"><b>Who are you?</b> (asked once)<div class="row">${store.team().map((n) => `<button type="button" class="chip" data-me="${esc(n)}">${esc(n)}</button>`).join(' ')}</div></div>`}
  <form id="cap" autocomplete="off" novalidate>
    <label>Event
      <select name="event">${confs.map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)} · ${esc(fmtShort(c.startDate))}</option>`).join('')}
        <option value="${OTHER}"${selected === OTHER ? ' selected' : ''}>Other event… (dinner, meetup, side event)</option>
      </select>
    </label>
    <input name="otherEvent" placeholder="Event name, e.g. Payments dinner London" aria-label="Other event name" value="${esc(otherName)}"${selected === OTHER ? '' : ' hidden'}>
    <label>Name <input name="name" autocapitalize="words" enterkeyhint="next" value="${esc(draft.name)}"></label>
    <label>Company <input name="company" autocapitalize="words" enterkeyhint="next" value="${esc(draft.company)}"></label>
    <div id="match" aria-live="polite"></div>
    <label>Note <textarea name="note" placeholder="What did they say? Volumes, pain, next step…">${esc(draft.note)}</textarea></label>
    <fieldset class="temps"><legend>Temperature</legend>
      ${['hot', 'warm', 'cold'].map((t) => `<label><input type="radio" name="temperature" value="${t}"${draft.temperature === t ? ' checked' : ''}><span class="${t}">${t[0].toUpperCase() + t.slice(1)}</span></label>`).join('')}
    </fieldset>
    <details${draft.email || draft.linkedin || draft.title ? ' open' : ''}><summary>More (email, LinkedIn, title)</summary>
      <label>Email <input name="email" type="email" inputmode="email" autocapitalize="off" value="${esc(draft.email)}"></label>
      <label>LinkedIn <input name="linkedin" inputmode="url" autocapitalize="off" placeholder="linkedin.com/in/…" value="${esc(draft.linkedin)}"></label>
      <label>Job title <input name="title" autocapitalize="words" value="${esc(draft.title)}"></label>
    </details>
    <p class="error" id="cap-err" hidden></p>
    <button class="btn primary big" type="submit" style="margin-top:14px">Save lead</button>
  </form>
  <div id="done" role="status">${lastSaved || ''}</div>
</section>`;

  const form = el.querySelector('#cap');
  const matchEl = el.querySelector('#match');
  const values = () => {
    const f = new FormData(form);
    return Object.fromEntries(FIELDS.map((k) => [k, String(f.get(k) || '').trim()]));
  };

  el.querySelectorAll('[data-me]').forEach((b) => b.addEventListener('click', () => {
    store.updateSettings({ me: b.dataset.me });
    render(el, ctx);
  }));

  // ---- Matching panel ----
  function patternText(person) {
    const encs = store.encountersFor(person.id);
    if (encs.length < 2) return encs.length ? `Seen once before at ${esc(encs[0].event)}` : '';
    const sig = relationshipSignal(encs, ctx.today);
    return `<span class="sig ${signalClass(sig.label)}">${esc(sig.label)}</span> · ${encs.length} meetings`;
  }
  function lastSeen(c) {
    const e = c.last;
    if (!e) return esc(c.person.company || '');
    return `${esc(e.company || c.person.company || 'unknown company')} (${[e.title, e.event].filter(Boolean).map(esc).join(', ')})`;
  }
  function drawMatch() {
    const m = lastMatch;
    if (m.auto) {
      const why = m.auto.via === 'email' ? 'same email' : 'same LinkedIn';
      matchEl.innerHTML = `<div class="match">✓ Linked to <b>${esc(m.auto.person.name)}</b> (${why}) · ${esc(m.auto.person.company || '')}<br>${patternText(m.auto.person)}</div>`;
      return;
    }
    const cands = m.candidates;
    if (!cands.length) { matchEl.innerHTML = ''; return; }
    const chosen = (id) => decision && decision.personId === id;
    if (cands.length === 1) {
      const c = cands[0];
      const q = c.level === 'high'
        ? `Looks like <b>${esc(c.person.name)}</b> (${esc(c.person.company || '')}) · ${patternText(c.person)}`
        : `Same <b>${esc(c.person.name)}</b>? Last seen at ${lastSeen(c)}.<br>${patternText(c.person)}`;
      const answered = decision ? `<div class="chosen">${decision.newPerson ? 'Saving as a new person' : 'Will add to their history'}</div>` : '';
      matchEl.innerHTML = `<div class="match ${c.level}">${q}
        <div class="row"><button type="button" class="chip" data-pick="${esc(c.person.id)}" aria-pressed="${chosen(c.person.id)}">${c.level === 'high' ? 'Same person' : 'Yes'}</button>
        <button type="button" class="chip" data-pick="new" aria-pressed="${!!(decision && decision.newPerson)}">No</button></div>${answered}</div>`;
      return;
    }
    matchEl.innerHTML = `<div class="match low">Which <b>${esc(cands[0].person.name)}</b>?
      ${cands.map((c) => `<div class="row"><button type="button" class="chip" data-pick="${esc(c.person.id)}" aria-pressed="${chosen(c.person.id)}">This one</button> ${lastSeen(c)} · ${patternText(c.person)}</div>`).join('')}
      <div class="row"><button type="button" class="chip" data-pick="new" aria-pressed="${!!(decision && decision.newPerson)}">New person</button></div></div>`;
  }
  function runMatch() {
    const v = values();
    const next = findMatches(v, store.people(), store.encounters(), store.notSamePairs());
    const key = (m) => (m.auto ? `a:${m.auto.person.id}` : m.candidates.map((c) => c.person.id).join(','));
    if (key(next) !== key(lastMatch)) decision = null; // new suggestions -> ask again
    lastMatch = next;
    if (next.auto) decision = { personId: next.auto.person.id, via: next.auto.via };
    drawMatch();
  }
  matchEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    decision = b.dataset.pick === 'new' ? { newPerson: true } : { personId: b.dataset.pick, via: 'confirmed' };
    drawMatch();
  });

  let timer = null;
  form.addEventListener('input', (e) => {
    const v = values();
    store.setDraft(v);
    if (e.target.name === 'event') form.otherEvent.hidden = v.event !== OTHER;
    if (['name', 'company', 'email', 'linkedin'].includes(e.target.name)) {
      clearTimeout(timer);
      timer = setTimeout(runMatch, 400);
    }
  });

  // ---- Save ----
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    runMatch();
    const v = values();
    const rep = store.settings().me;
    const missing = [];
    if (!v.name) missing.push('a name');
    if (!v.temperature) missing.push('a temperature (Hot / Warm / Cold)');
    if (v.event === OTHER && !v.otherEvent) missing.push('the event name');
    if (!rep) missing.push('your name (tap it at the top)');
    const err = el.querySelector('#cap-err');
    if (missing.length) { err.textContent = `Add ${missing.join(', ')}.`; err.hidden = false; return; }
    err.hidden = true;

    const conf = v.event === OTHER ? null : store.conference(v.event);
    const capture = {
      conferenceId: conf ? conf.id : null,
      event: conf ? conf.name : v.otherEvent,
      date: ctx.today,
      name: v.name, company: v.company, title: v.title, email: v.email, linkedin: v.linkedin,
      temperature: v.temperature, note: v.note, rep,
    };
    const ids = lastMatch.candidates.map((c) => c.person.id);
    let opts;
    if (decision && decision.personId) opts = { link: decision };
    else if (decision && decision.newPerson) opts = { rejectedIds: ids };
    else opts = { unresolvedIds: ids };
    const r = store.saveCapture(capture, opts);

    const person = store.person(r.personId);
    const n = store.encountersFor(r.personId).length;
    const outcome = r.isNew
      ? (opts.unresolvedIds && opts.unresolvedIds.length ? 'saved as a new contact; the possible match is waiting on their page' : 'new contact')
      : `added to ${esc(person.name)}'s history (${n} meetings)`;
    lastSaved = `<div class="done">Saved ✓ <b>${esc(v.name)}</b>, ${outcome}. <a href="#contacts/${encodeURIComponent(r.personId)}">Open contact</a></div>`;

    stickyEvent = v.event;
    stickyOther = v.otherEvent;
    store.clearDraft();
    decision = null;
    lastMatch = { auto: null, candidates: [] };
    render(el, ctx);
    el.querySelector('input[name="name"]').focus();
  });

  runMatch();
}
```

- [ ] **Step 2: Register the view in js/app.js**

Replace `import * as plan from './views/plan.js';` with:
```js
import * as plan from './views/plan.js';
import * as capture from './views/capture.js';
```
and replace `const VIEWS = { events, plan, settings };` with `const VIEWS = { events, plan, capture, settings };`

- [ ] **Step 3: Check the screen renders**

Run: `render "http://localhost:8000/index.html#capture" 300`
Expected: starts with `Who are you? (asked once) Maya Daniel Yoni Shira Event Sibos 2026 · 28 Sep` (Sibos preselected because nothing is running on 26 Sep 2026).

- [ ] **Step 4: Script the live demo flows in headless Chrome**

The page must be served by the local server, so create `flow-check.html` in the repo root, run it, then DELETE it (never commit it):
```html
<!DOCTYPE html><html><body><main id="view"></main><pre id="log"></pre>
<script type="module">
import { createStore, memoryStorage } from './js/store.js';
import * as capture from './js/views/capture.js';
const log = (s) => document.getElementById('log').textContent += s + '\n';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const get = (p) => fetch(p).then(r => r.json());
const [conferences, contactsData] = await Promise.all([get('data/conferences.json'), get('data/contacts.json')]);
const store = createStore({ seed: { conferences, contacts: contactsData }, storage: memoryStorage() });
const el = document.getElementById('view');
const ctx = { store, today: '2026-09-26', applyNet() {}, go(h) { log('go ' + h); } };
store.updateSettings({ me: 'Maya' });
const type = (name, value) => { const i = el.querySelector(`[name="${name}"]`); i.value = value; i.dispatchEvent(new Event('input', { bubbles: true })); };
const matchText = () => el.querySelector('#match').textContent.replace(/\s+/g, ' ').trim();
try {
  capture.render(el, ctx);
  type('name', 'Sara Mizrahi'); type('company', 'Sunmerra Tours'); await wait(600);
  log('SARA: ' + matchText());
  el.querySelector('[data-pick="p-sarah"]').click();
  el.querySelector('input[value=warm]').click();
  type('note', 'Moved to Sunmerra.');
  el.querySelector('#cap').dispatchEvent(new Event('submit', { cancelable: true }));
  log('DONE: ' + el.querySelector('#done').textContent.replace(/\s+/g, ' ').trim());
  type('name', 'Dana Levy'); type('company', 'Vantelo Pay'); await wait(600);
  log('DANA: ' + matchText());
  type('company', ''); type('name', 'David Cohen'); await wait(600);
  log('DAVID: ' + matchText());
  type('name', 'K. Nowak'); type('email', 'k.nowak@wistulapay.pl'); await wait(600);
  log('KASIA: ' + matchText());
  type('name', 'Half typed'); capture.render(el, ctx);
  log('DRAFT KEPT: ' + el.querySelector('[name=name]').value);
} catch (e) { log('ERROR ' + e.stack); }
</script></body></html>
```
Run:
```bash
perl -e 'alarm 25; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-extensions --user-data-dir="$(mktemp -d)" --virtual-time-budget=5000 --dump-dom http://localhost:8000/flow-check.html 2>/dev/null | python3 -c "import sys,re,html;d=sys.stdin.read();print(html.unescape(re.search(r'<pre id=\"log\">(.*?)</pre>',d,re.S).group(1)))"
rm flow-check.html
```
Expected lines:
```
SARA: Same Sarah Mizrahi? Last seen at Atlasbeds (Finance Director, WTM London 2025).Steady - nurture · 2 meetings Yes No
DONE: Saved ✓ Sara Mizrahi, added to Sarah Mizrahi's history (3 meetings). Open contact
DANA: Looks like Dana Levi (Vantelo Pay) · Warming - act now · 3 meetings Same person No
DAVID: Which David Cohen? This one Tranzio Wholesale (Head of Finance, ITB Berlin 2026) · Seen once before at ITB Berlin 2026This one Corvane Payments (CTO, Money20/20 USA 2025) · Seen once before at Money20/20 USA 2025 New person
KASIA: ✓ Linked to Katarzyna Nowak (same email) · Wistula PayWarming - act now · 2 meetings
DRAFT KEPT: Half typed
```
The last line is the Review Focus #1 check (switch tabs mid-typing = re-render; the typed name survives).

- [ ] **Step 5: Manual check on a phone-width window**

Open `http://localhost:8000/#capture`: pick your name once, type a name + tap Hot + Save in under 10 seconds; "Saved ✓" appears and the form clears with the event kept. Pick "Other event…" → a text box appears; saving without its name shows "Add … the event name."

- [ ] **Step 6: Commit and push**

```bash
git add js/views/capture.js js/app.js
git commit -m "Capture tab: 4-field one-handed form, offline save, match nudge at capture time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 9: Contacts tab and contact page (MVP 4b)

**Files:**
- Create: `js/views/contacts.js` (first version: list, timeline, rules label, unresolved match, edit details)
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `relationshipSignal`, `timelineMarkers`; `esc`, `fmtDate`, `signalClass`; store `people`, `encountersFor`, `person`, `unresolvedFor`, `mergeInto`, `resolveDifferent`, `patchPerson`.
- Produces: routes `#contacts` and `#contacts/<personId>`. Tasks 11 and 12 replace this file with extended versions.

- [ ] **Step 1: Create js/views/contacts.js**

```js
// Contacts tab: list and contact page (timeline + rules signal).
import { relationshipSignal, timelineMarkers } from '../signals.js';
import { esc, fmtDate, signalClass } from './ui.js';

let query = '';

function rowsFor(store, today) {
  return store.people().map((person) => {
    const encounters = store.encountersFor(person.id);
    return { person, encounters, signal: relationshipSignal(encounters, today) };
  }).filter((r) => r.encounters.length)
    .sort((a, b) => b.encounters[b.encounters.length - 1].date.localeCompare(a.encounters[a.encounters.length - 1].date));
}

export function render(el, ctx, personId) {
  if (personId) return renderPerson(el, ctx, personId);
  const { store } = ctx;
  const rows = rowsFor(store, ctx.today);

  el.innerHTML = `<section class="view">
  <div class="view-head"><h2>Contacts</h2></div>
  <input type="search" id="q" placeholder="Search name or company…" value="${esc(query)}" aria-label="Search contacts" style="margin:8px 0">
  <ul class="rows" id="list"></ul>
</section>`;

  const list = el.querySelector('#list');
  const draw = () => {
    const q = query.toLowerCase();
    list.innerHTML = rows.filter((r) => !q || `${r.person.name} ${r.person.company}`.toLowerCase().includes(q)).map((r) => {
      const last = r.encounters[r.encounters.length - 1];
      return `<li><a href="#contacts/${encodeURIComponent(r.person.id)}">
        <b>${esc(r.person.name)}</b> · ${esc(r.person.company || '')}
        <div><span class="sig ${signalClass(r.signal.label)}">${esc(r.signal.label)}</span>
        <span class="muted">${r.encounters.length} meeting${r.encounters.length === 1 ? '' : 's'} · last: ${esc(last.event)}, ${esc(fmtDate(last.date))}</span></div>
      </a></li>`;
    }).join('') || '<li class="muted">No contacts match.</li>';
  };
  el.querySelector('#q').addEventListener('input', (e) => { query = e.target.value; draw(); });
  draw();

}

function renderPerson(el, ctx, personId) {
  const { store } = ctx;
  const person = store.person(personId);
  if (!person) { el.innerHTML = '<section class="view"><p>Contact not found. <a href="#contacts">Back to contacts</a></p></section>'; return; }
  const encounters = store.encountersFor(personId);
  const signal = relationshipSignal(encounters, ctx.today);
  const unresolved = store.unresolvedFor(personId).map((id) => store.person(id)).filter(Boolean);

  el.innerHTML = `<section class="view">
  <p><a href="#contacts">← Contacts</a></p>
  <h2>${esc(person.name)}</h2>
  <p class="muted">${[person.title, person.company].filter(Boolean).map(esc).join(' · ')}
    ${person.email ? `<br>${esc(person.email)}` : ''}${person.linkedin ? `<br>${esc(person.linkedin)}` : ''}</p>

  ${unresolved.map((c) => {
    const encs = store.encountersFor(c.id);
    const last = encs[encs.length - 1];
    return `<div class="match low">Possible match: <b>${esc(c.name)}</b> (${esc(c.company || '')}${last ? `, last seen at ${esc(last.event)}` : ''}, ${encs.length} meeting${encs.length === 1 ? '' : 's'})
      <div class="row"><button class="chip" data-same="${esc(c.id)}">Same person</button><button class="chip" data-diff="${esc(c.id)}">Different</button></div></div>`;
  }).join('')}

  <div class="box"><b>Rules:</b> <span class="sig ${signalClass(signal.label)}">${esc(signal.label)}</span>
    <div class="hint">${signal.reasons.map(esc).join(' · ')}</div></div>


  <h3>Timeline</h3>
  <ol class="timeline-list">${timelineMarkers(encounters).map(({ encounter: e, marks }) => `<li>
    ${marks.map((m) => `<div class="mark">${esc(m.text)}</div>`).join('')}
    <b>${esc(e.event)}</b> · ${esc(fmtDate(e.date))} · <span class="sig">${esc(e.temperature)}</span>
    <div class="muted">${esc(e.nameAsEntered)}${e.title ? `, ${esc(e.title)}` : ''}${e.company ? ` @ ${esc(e.company)}` : ''} · met by ${esc(e.rep || '?')}</div>
    ${e.note ? `<div>${esc(e.note)}</div>` : ''}
  </li>`).join('')}</ol>

  <details class="box"><summary>Edit email / LinkedIn / title / company</summary>
    <form id="edit" onsubmit="return false">
      <label>Email <input name="email" type="email" value="${esc(person.email || '')}"></label>
      <label>LinkedIn <input name="linkedin" value="${esc(person.linkedin || '')}"></label>
      <label>Job title <input name="title" value="${esc(person.title || '')}"></label>
      <label>Company <input name="company" value="${esc(person.company || '')}"></label>
      <button class="btn" type="submit">Save details</button>
    </form>
  </details>
</section>`;

  el.querySelectorAll('[data-same]').forEach((b) => b.addEventListener('click', () => {
    store.mergeInto(personId, b.dataset.same);
    ctx.go(`#contacts/${encodeURIComponent(b.dataset.same)}`);
  }));
  el.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => {
    store.resolveDifferent(personId, b.dataset.diff);
    renderPerson(el, ctx, personId);
  }));
  el.querySelector('#edit').addEventListener('submit', (e) => {
    const f = new FormData(e.target);
    store.patchPerson(personId, Object.fromEntries(['email', 'linkedin', 'title', 'company'].map((k) => [k, String(f.get(k) || '').trim()])));
    renderPerson(el, ctx, personId);
    ctx.applyNet();
  });
}
```

- [ ] **Step 2: Register the view in js/app.js**

Replace `import * as capture from './views/capture.js';` with:
```js
import * as capture from './views/capture.js';
import * as contacts from './views/contacts.js';
```
and replace `const VIEWS = { events, plan, capture, settings };` with `const VIEWS = { events, plan, capture, contacts, settings };`

- [ ] **Step 3: Check it**

Run: `render "http://localhost:8000/index.html#contacts" 300`
Expected: starts with `Contacts Priya Raman · Skyloop OTA New 1 meeting · last: EuroFinance 2026, 17 Sep 2026 Mark Thompson · Brixa Payments Stalled - possible tire-kicker 4 meetings`.
Run: `render "http://localhost:8000/index.html#contacts/p-ahmed" 300`
Expected: contains `Rules: Steady - nurture 2 meetings · over 13 months · last met 4 months ago · cold → warm · asks: proposal` and the two timeline entries.
Run: `render "http://localhost:8000/index.html#contacts/p-jonathan" 400`
Expected: contains `Job change: Lumora Remit → Meridia FX ↑ more senior`.

- [ ] **Step 4: Manual check of an unresolved match**

At `http://localhost:8000/#capture`, type `Dana Levy` / `Vantelo Pay`, tap Warm, and Save WITHOUT answering the suggestion. Open the contact: "Possible match: Dana Levi … [Same person] [Different]". Tap Same person → you land on Dana Levi with 4 meetings.

- [ ] **Step 5: Commit and push**

```bash
git add js/views/contacts.js js/app.js
git commit -m "Contacts: list with signals, contact timeline with job changes, resolve suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 10: Offline reopen (network-first service worker)

**Files:**
- Create: `sw.js`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: the file list of the app.
- Produces: `sw.js` with `const CACHE = 'grain-v1'` and `const SHELL = [ … ]` (single-quoted strings, one per line; `tests/run.mjs` parses this exact format). **Rule for later tasks: every new file under `js/` must be added to `SHELL`, and `CACHE` bumped.**

- [ ] **Step 1: Run the tests (the offline-cache check is skipped until sw.js exists)**

Run: `node tests/run.mjs`. Expected: `83/83 passed`, no "Offline cache" group.

- [ ] **Step 2: Create sw.js**

```js
// Offline cache. Network-first: when online, every request goes to the network (so new deploys
// show up immediately) and refreshes the saved copy. Only when the network fails or takes more
// than 3 seconds do we answer from the saved copy. No sync, no queues.
// When you add a file to the app, add it to SHELL and bump CACHE.
const CACHE = 'grain-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'js/app.js',
  'js/store.js',
  'js/scoring.js',
  'js/matching.js',
  'js/signals.js',
  'js/api.js',
  'js/views/ui.js',
  'js/views/eventCard.js',
  'js/views/events.js',
  'js/views/plan.js',
  'js/views/capture.js',
  'js/views/contacts.js',
  'js/views/settings.js',
  'data/conferences.json',
  'data/contacts.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/.netlify/')) return;
  e.respondWith(networkFirst(req));
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (err) => { clearTimeout(t); reject(err); });
  });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), 3000);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    return new Response('Offline and not saved yet', { status: 503, headers: { 'content-type': 'text/plain' } });
  }
}
```

- [ ] **Step 3: Register it in js/app.js**

Replace:
```js
  render(ctx);
}

boot();
```
with:
```js
  render(ctx);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
```

- [ ] **Step 4: Run the tests (now including the offline file-list check)**

Run: `node tests/run.mjs`. Expected: `84/84 passed`, including `Offline cache › sw.js SHELL matches the files on disk`.

- [ ] **Step 5: Manual offline check (Chrome desktop)**

Open `http://localhost:8000/`, reload once. DevTools → Application → Service Workers shows `sw.js` activated. DevTools → Network → "Offline", then reload: the app still opens; Capture saves a lead; the top bar shows "Offline: capture still works"; AI/HubSpot buttons are disabled. Switch back online: buttons re-enable without losing typed text.

- [ ] **Step 6: Commit and push**

```bash
git add sw.js js/app.js
git commit -m "Offline reopen: tiny network-first service worker (3 s timeout, no sync)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 11: AI relationship summary (MVP 5)

**Files:**
- Create: `js/validate.js`, `tests/validate.test.js`, `netlify/functions/ai.js`, `tests/functions.mjs`
- Modify: `tests/all.js`, `sw.js`
- Replace: `js/views/contacts.js` (adds the AI box)

**Interfaces:**
- Consumes: `REGIONS` (scoring), `LABELS` (signals), `aiArc` (api), store `aiSummary`, `setAiSummary`, `settings().geminiKey`.
- Produces:
  - `js/validate.js`: `validateDraft(d)`, `validateArc(a)`, `validateConference(c)`; each returns `{ ok, errors:[string] }`.
  - `netlify/functions/ai.js`: `POST /.netlify/functions/ai` with `{ task:'status' }` → `{ok:true, hasServerKey, model}`; `{ task:'arc', key?, person, encounters:[{date,event,name,company,title,temperature,note}], rules:{label,reasons} }` → `{ok:true, result:{label,arc,nextStep,agreesWithRules,disagreementReason}, model}`; `{ task:'intake', key?, name, startDate, endDate, url?, pastedText?, calibration:[…] }` → `{ok:true, draft:{city,country,region,verticals,audienceSize,description,ratings:{icpFit,buyerAccess,audienceMarket,travelEffort:{score,why}}}, model}`. Errors → `{ok:false, error:'no_key'|'busy'|'timeout'|'bad_key'|'bad_output'|'fetch_failed'|'bad_url'|'unavailable'}` (HTTP 200). Also `exports._test = { checkUrl, htmlToText, parseJsonText, arcPrompt, intakePrompt }`.
  - AI summary object stored per person: `{ label, arc, nextStep, agreesWithRules, disagreementReason, generatedAt, basedOnEncounters, model }`.

- [ ] **Step 1: Write the failing validation tests**

`tests/validate.test.js`:
```js
import { validateDraft, validateArc, validateConference } from '../js/validate.js';

const good = () => ({
  city: 'Lisbon', country: 'Portugal', region: 'Europe', verticals: ['payments', 'fintech'],
  audienceSize: 2500, description: 'A payments conference.',
  ratings: {
    icpFit: { score: 4, why: 'Mostly PSPs' },
    buyerAccess: { score: 3, why: 'Mixed seniority' },
    audienceMarket: { score: 5, why: 'European crowd' },
    travelEffort: { score: 4, why: 'Short flight' },
  },
});

export default function validateTests(t) {
  t.group('AI output checks');

  t.test('A good intake draft passes', () => {
    t.eq(validateDraft(good()), { ok: true, errors: [] });
  });
  t.test('Scores 0 or 6, or not whole numbers, are rejected', () => {
    for (const bad of [0, 6, 3.5, '4']) {
      const d = good();
      d.ratings.icpFit.score = bad;
      t.ok(!validateDraft(d).ok, `score ${JSON.stringify(bad)} should fail`);
    }
  });
  t.test('Unknown region, missing reason, non-integer size are rejected', () => {
    const a = good(); a.region = 'Europe/Africa';
    const b = good(); b.ratings.travelEffort.why = ' ';
    const c = good(); c.audienceSize = 2500.5;
    t.eq([validateDraft(a).ok, validateDraft(b).ok, validateDraft(c).ok, validateDraft(null).ok], [false, false, false, false]);
  });
  t.test('Arc summary: unknown label rejected; disagreement needs a reason', () => {
    const arc = { label: 'Warming - act now', arc: 'Two meetings…', nextStep: 'Send the proposal this week.', agreesWithRules: false, disagreementReason: 'Explicit proposal request with a Q3 deadline.' };
    t.eq(validateArc(arc).ok, true);
    t.eq(validateArc({ ...arc, label: 'Hot lead' }).ok, false);
    t.eq(validateArc({ ...arc, disagreementReason: '' }).ok, false);
  });
  t.test('Conference save check: end before start, missing ratings', () => {
    const c = { name: 'X', startDate: '2027-03-10', endDate: '2027-03-09', region: 'Europe', audienceSize: 100, ratings: {} };
    t.eq(validateConference(c).errors, ['End date is before the start date', 'Set all four ratings (1-5)']);
  });
}
```

Update `tests/all.js`:
```js
// Every test suite, in order. Each suite is a function (t, data) => void.
import scoring from './scoring.test.js';
import store from './store.test.js';
import ui from './ui.test.js';
import matching from './matching.test.js';
import signals from './signals.test.js';
import validate from './validate.test.js';

export const suites = [scoring, store, ui, matching, signals, validate];

export function runAll(t, data) {
  for (const suite of suites) suite(t, data);
}
```
Run: `node tests/run.mjs`. Expected: `ERR_MODULE_NOT_FOUND` for `js/validate.js`.

- [ ] **Step 2: Implement js/validate.js and add it to the offline cache**

`js/validate.js`:
```js
// Pure checks on AI output. The AI is a helper: a bad answer is rejected, never half-used.
import { REGIONS } from './scoring.js';
import { LABELS } from './signals.js';

const AI_FACTORS = ['icpFit', 'buyerAccess', 'audienceMarket', 'travelEffort'];
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
const isRating = (n) => Number.isInteger(n) && n >= 1 && n <= 5;

// Returns { ok, errors: [string] }
export function validateDraft(d) {
  const errors = [];
  if (!d || typeof d !== 'object') return { ok: false, errors: ['not an object'] };
  for (const k of ['city', 'country', 'description']) if (!nonEmpty(d[k])) errors.push(`${k} missing`);
  if (!REGIONS.includes(d.region)) errors.push(`region must be one of ${REGIONS.join(', ')}`);
  if (!Number.isInteger(d.audienceSize) || d.audienceSize <= 0) errors.push('audienceSize must be a positive whole number');
  if (!Array.isArray(d.verticals) || !d.verticals.length || !d.verticals.every(nonEmpty)) errors.push('verticals must be a non-empty list');
  for (const k of AI_FACTORS) {
    const r = d.ratings && d.ratings[k];
    if (!r || !isRating(r.score)) errors.push(`${k} score must be a whole number 1-5`);
    else if (!nonEmpty(r.why)) errors.push(`${k} needs a reason`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateArc(a) {
  const errors = [];
  if (!a || typeof a !== 'object') return { ok: false, errors: ['not an object'] };
  if (!LABELS.includes(a.label)) errors.push('unknown label');
  if (!nonEmpty(a.arc)) errors.push('arc missing');
  if (!nonEmpty(a.nextStep)) errors.push('nextStep missing');
  if (typeof a.agreesWithRules !== 'boolean') errors.push('agreesWithRules must be true/false');
  if (a.agreesWithRules === false && !nonEmpty(a.disagreementReason)) errors.push('disagreementReason missing');
  return { ok: errors.length === 0, errors };
}

// Checks a conference before it is saved (AI-drafted or manual).
export function validateConference(c) {
  const errors = [];
  if (!nonEmpty(c.name)) errors.push('Name is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(c.endDate || '')) errors.push('Start and end dates are required');
  else if (c.endDate < c.startDate) errors.push('End date is before the start date');
  if (!REGIONS.includes(c.region)) errors.push('Pick a region');
  if (!Number.isInteger(c.audienceSize) || c.audienceSize <= 0) errors.push('Audience size must be a positive number');
  for (const k of AI_FACTORS) if (!c.ratings || !c.ratings[k] || !isRating(c.ratings[k].score)) errors.push('Set all four ratings (1-5)');
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
```

In `sw.js`, replace `const CACHE = 'grain-v1';` with `const CACHE = 'grain-v2';`, and replace:
```js
  'js/signals.js',
  'js/api.js',
```
with:
```js
  'js/signals.js',
  'js/validate.js',
  'js/api.js',
```
Run: `node tests/run.mjs`. Expected: `89/89 passed`.

- [ ] **Step 3: Write the failing function tests (fake network)**

`tests/functions.mjs`:
````js
// Command-line checks for the Netlify functions with a FAKE network (no keys, no real calls):
//   node tests/functions.mjs
// The real end-to-end check is the live-site checklist.
import { createRequire } from 'node:module';
import { createRunner } from './runner.js';

const require = createRequire(import.meta.url);
const ai = require('../netlify/functions/ai.js');

const post = (body) => ({ httpMethod: 'POST', body: JSON.stringify(body) });
const reply = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const geminiReply = (obj) => reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

let calls = [];
function fakeFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    return handler(String(url), opts, calls.length);
  };
}
const parse = (res) => JSON.parse(res.body);

const { t, results } = createRunner();
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const { checkUrl, htmlToText } = ai._test;

// ---- ai.js ----
test('status reports whether a server key exists, without calling Gemini', async () => {
  delete process.env.GEMINI_API_KEY;
  fakeFetch(() => { throw new Error('should not be called'); });
  const r = parse(await ai.handler(post({ task: 'status' })));
  t.eq([r.ok, r.hasServerKey, r.model], [true, false, 'gemini-3.8-flash']);
});
test('no key anywhere -> no_key', async () => {
  delete process.env.GEMINI_API_KEY;
  t.eq(parse(await ai.handler(post({ task: 'arc', encounters: [] }))), { ok: false, error: 'no_key' });
});
test('arc: returns the parsed JSON and sends the key in a header, not the URL', async () => {
  process.env.GEMINI_API_KEY = 'server-key';
  const answer = { label: 'Warming - act now', arc: 'x', nextStep: 'y', agreesWithRules: false, disagreementReason: 'z' };
  fakeFetch(() => geminiReply(answer));
  const r = parse(await ai.handler(post({ task: 'arc', person: { name: 'Ahmed' }, encounters: [], rules: { label: 'Steady - nurture', reasons: [] } })));
  t.eq([r.ok, r.result, r.model], [true, answer, 'gemini-3.8-flash']);
  t.ok(!calls[0].url.includes('server-key'), 'key not in URL');
});
test('the rep\'s own key overrides the server key', async () => {
  process.env.GEMINI_API_KEY = 'server-key';
  let used = '';
  globalThis.fetch = async (url, opts) => { used = opts.headers['x-goog-api-key']; return geminiReply({}); };
  await ai.handler(post({ task: 'arc', key: 'my-key', encounters: [] }));
  t.eq(used, 'my-key');
});
test('429 from both models -> busy ("AI is busy, try again in a minute")', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(429, { error: { message: 'quota' } }));
  const r = parse(await ai.handler(post({ task: 'arc', encounters: [] })));
  t.eq([r.error, calls.length], ['busy', 2]);
  t.ok(calls[1].url.includes('gemini-3.5-flash-lite'), 'fell back to flash-lite');
});
test('primary model 503, fallback works', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch((url) => (url.includes('3.8') ? reply(503, 'down') : geminiReply({ ok: 1 })));
  const r = parse(await ai.handler(post({ task: 'arc', encounters: [] })));
  t.eq([r.ok, r.model], [true, 'gemini-3.5-flash-lite']);
});
test('invalid key -> bad_key, no retry', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }));
  const r = parse(await ai.handler(post({ task: 'arc', encounters: [] })));
  t.eq([r.error, calls.length], ['bad_key', 1]);
});
test('non-JSON answer (even in ``` fences) is handled', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(200, { candidates: [{ content: { parts: [{ text: '```json\n{"a":1}\n```' }] } }] }));
  t.eq(parse(await ai.handler(post({ task: 'arc', encounters: [] }))).result, { a: 1 });
  fakeFetch(() => reply(200, { candidates: [{ content: { parts: [{ text: 'Sorry, I cannot help' }] } }] }));
  t.eq(parse(await ai.handler(post({ task: 'arc', encounters: [] }))).error, 'bad_output');
});
test('URL safety: only public http(s) pages', () => {
  const bad = ['http://localhost:8888', 'http://127.0.0.1', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'http://[::1]/', 'http://intranet', 'https://x.local', 'https://example.com:8443/'];
  const rejected = bad.filter((u) => { try { checkUrl(u); return false; } catch { return true; } });
  t.eq(rejected, bad);
  t.eq(checkUrl('https://www.iamtn.events/summit').hostname, 'www.iamtn.events');
});
test('HTML is reduced to readable text', () => {
  const txt = htmlToText('<html><head><title>IAMTN &amp; Friends</title><style>.x{}</style><script>var a=1</script></head><body><h1>Who attends</h1><p>PSPs&nbsp;and MTOs</p></body></html>');
  t.eq(txt, 'IAMTN & Friends\nWho attends\nPSPs and MTOs');
});
test('intake: unreadable page and no pasted text -> fetch_failed', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(403, 'blocked'));
  t.eq(parse(await ai.handler(post({ task: 'intake', name: 'X', url: 'https://example.com' }))).error, 'fetch_failed');
});
test('intake: unreadable page but pasted text -> still drafts', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch((url) => (url.includes('example.com') ? reply(403, 'blocked') : geminiReply({ city: 'Lisbon' })));
  const r = parse(await ai.handler(post({ task: 'intake', name: 'X', url: 'https://example.com', pastedText: 'A payments summit for PSPs.' })));
  t.eq([r.ok, r.draft.city], [true, 'Lisbon']);
});
test('intake: a redirect to an internal address is refused', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(302, '', { location: 'http://127.0.0.1/admin' }));
  t.eq(parse(await ai.handler(post({ task: 'intake', name: 'X', url: 'https://example.com' }))).error, 'bad_url');
});

// Run async tests one by one, then report like tests/run.mjs.
t.group('Netlify functions (fake network)');
for (const [name, fn] of tests) {
  try { await fn(); results.push({ group: 'Netlify functions (fake network)', name, ok: true }); }
  catch (e) { results.push({ group: 'Netlify functions (fake network)', name, ok: false, error: e.message }); }
}
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  ok   ${r.name}`);
  else { failed++; console.log(`  FAIL ${r.name}\n       ${r.error}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
````

Run: `node tests/functions.mjs`. Expected: crash, `Cannot find module '../netlify/functions/ai.js'`.

- [ ] **Step 4: Implement netlify/functions/ai.js**

````js
// Netlify Function: Gemini proxy. Tasks: "status", "arc" (relationship summary), "intake" (draft a conference).
// Key: the rep's key from Settings (sent per request) overrides the GEMINI_API_KEY env var.
// The model lives here only: swap providers by changing this one file.
// Never log keys or request bodies.

const DEFAULT_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const TIME_BUDGET_MS = 9000; // Netlify stops functions after ~10 s
const LABELS = [
  'New', 'Cooling - lost for now', 'Warming - new role, re-engage',
  'Warming - act now', 'Stalled - possible tire-kicker', 'Steady - nurture',
];

const GRAIN = `Grain (grainfinance.com) is a ~25-person fintech (HQ Tel Aviv, selling in Europe and the US) that helps businesses manage FX/currency risk, with hedging built into their payment flows.
Ideal customers: payment service providers (PSPs), cross-border payment and remittance companies, travel businesses (wholesalers, bedbanks, OTAs, tour operators, DMCs), and other companies with real FX exposure. Buyers are finance, treasury and payments leaders (CFO, VP Finance, Head of Treasury, Head of Payments).`;

function fail(code, retryable = false) {
  const e = new Error(code);
  e.code = code;
  e.retryable = retryable;
  return e;
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(1, ms));
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    throw fail(e && e.name === 'AbortError' ? 'timeout' : 'network', true);
  } finally {
    clearTimeout(t);
  }
}

function parseJsonText(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned);
}

async function callGemini(key, model, prompt, ms) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  }, ms);
  if (res.status === 429) throw fail('busy', true);
  if ([400, 401, 403].includes(res.status)) {
    const text = await res.text().catch(() => '');
    throw fail(/api key|API_KEY|permission/i.test(text) ? 'bad_key' : 'ai_error');
  }
  if (res.status === 404 || res.status >= 500) throw fail('ai_error', true);
  if (!res.ok) throw fail('ai_error');
  const data = await res.json();
  const text = (((data.candidates || [])[0] || {}).content || { parts: [] }).parts.map((p) => p.text || '').join('');
  try {
    return parseJsonText(text);
  } catch {
    throw fail('bad_output');
  }
}

// Try the configured model, then the fallback once, within the time budget.
async function gemini(key, prompt, started) {
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const models = primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL];
  let last = fail('timeout');
  for (const model of models) {
    const left = TIME_BUDGET_MS - (Date.now() - started);
    if (left < 2000) break;
    try {
      return { data: await callGemini(key, model, prompt, left - 200), model };
    } catch (e) {
      last = e;
      if (!e.retryable) throw e;
    }
  }
  throw last;
}

// ---- Relationship-arc summary ----
function arcPrompt({ person = {}, encounters = [], rules = {} }) {
  const lines = encounters.map((e, i) =>
    `${i + 1}. ${e.date} · ${e.event} · typed as "${e.name}"${e.title ? `, ${e.title}` : ''}${e.company ? ` at ${e.company}` : ''} · temperature: ${e.temperature} · note: "${e.note || ''}"`);
  return `${GRAIN}

You help Grain's sales team read a relationship across conferences. Below is everything the team logged about one contact, oldest first.
A rules engine already labelled the relationship, but it only sees counts, dates, the temperature the rep clicked (often in a rush) and keywords.
Read the notes like an experienced salesperson: buying intent, deadlines, objections, who owns the budget, competitors, and whether this is a warming relationship or a polite tire-kicker. You may disagree with the rules label, but then you must say what in the notes the rules missed.

Label meanings:
- New: only one meeting so far.
- Cooling - lost for now: interest dropped or they chose another option; say when to come back if the notes hint at it.
- Warming - new role, re-engage: they changed company or role; re-open the conversation in the new context.
- Warming - act now: clear buying intent or a deadline; follow up this week.
- Stalled - possible tire-kicker: friendly, repeated, but no concrete progress.
- Steady - nurture: genuine interest, no urgency yet.

Contact: ${person.name || ''}${person.title ? `, ${person.title}` : ''}${person.company ? ` at ${person.company}` : ''}
Rules label: ${rules.label || ''}
Rules reasons: ${(rules.reasons || []).join(' · ')}
Meetings:
${lines.join('\n')}

Only use facts from the notes. Refer to the contact by first name and do not use gendered pronouns.
Reply with JSON only, exactly these keys:
{"label": one of ${JSON.stringify(LABELS)}, "arc": "2-3 sentences on how the relationship developed", "nextStep": "one concrete next step, with timing if the notes give one", "agreesWithRules": true or false, "disagreementReason": "one sentence if agreesWithRules is false, otherwise empty string"}`;
}

// ---- Conference intake ----
function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw fail('bad_url'); }
  const host = u.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(u.protocol)) throw fail('bad_url');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw fail('bad_url');
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) throw fail('bad_url'); // raw IPv4/IPv6
  if (!host.includes('.')) throw fail('bad_url');
  if (u.port && !['80', '443'].includes(u.port)) throw fail('bad_url');
  return u;
}

function htmlToText(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const meta = (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '';
  const body = html
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const decoded = `${title}\n${meta}\n${body}`
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return decoded.replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

// Follows up to 3 redirects by hand, re-checking every hop (so a redirect can't reach an internal host).
async function readPage(raw) {
  let url = checkUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetchWithTimeout(url.href, {
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; GrainConferenceTool/1.0)', accept: 'text/html,*/*;q=0.8' },
    }, 4000).catch(() => { throw fail('fetch_failed'); });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = checkUrl(new URL(res.headers.get('location'), url).href);
      continue;
    }
    if (!res.ok) throw fail('fetch_failed');
    const text = htmlToText((await res.text()).slice(0, 600000)).slice(0, 15000);
    if (text.length < 200) throw fail('fetch_failed'); // JS-only sites give us almost nothing
    return text;
  }
  throw fail('fetch_failed');
}

function intakePrompt(body, sourceText) {
  return `${GRAIN}

You rate conferences for Grain's sales team. Rate from the ATTENDEES' point of view (who is in the room), not the venue.
Rubric, each rating is a whole number 1-5 with a one-line reason:
- icpFit (35% weight): share of the audience that is PSPs, cross-border payments/remittance, travel (wholesalers, bedbanks, OTAs, tour operators), treasury/FX. 5 = nearly all ICP; 3 = a meaningful ICP track inside a broader crowd; 1 = almost none.
- buyerAccess (30%): seniority of attendees plus structured meeting formats. 5 = senior finance/payments decision-makers AND hosted-buyer or meeting-app programme; 3 = mixed seniority, informal networking; 1 = mostly junior, consumer or technical crowd.
- audienceMarket (15%): where attendees come from. 5 = mainly Europe/UK; 4 = US, or global with a strong Europe/US presence; 3 = global mix or Middle East; 2 = mainly Asia-Pacific; 1 = markets Grain doesn't sell in.
- travelEffort (10%) from Tel Aviv: 5 = under ~3h; 4 = direct 3.5-5h (most of Europe, Dubai); 2 = long-haul 11-13h (US East Coast, Singapore); 1 = 15h+ with connections (US West Coast/Las Vegas).
Also estimate audienceSize (total attendees, whole number), city, country, region (exactly one of "Europe", "North America", "Middle East", "Asia-Pacific"; UK counts as Europe), verticals (short lowercase words such as payments, fintech, travel, treasury, fx, cross-border, banking, saas, general-tech) and a one-line description.

Calibration: these events were already rated by the team. Rate on the same scale.
${JSON.stringify(body.calibration || [], null, 1)}

Event to rate: ${body.name || ''}, ${body.startDate || ''} to ${body.endDate || ''}${body.url ? `, ${body.url}` : ''}
Source text:
"""
${sourceText}
"""

If the text doesn't say something, make your best estimate and say so in the reason. Reply with JSON only, exactly this shape:
{"city": "", "country": "", "region": "", "verticals": [""], "audienceSize": 0, "description": "",
 "ratings": {"icpFit": {"score": 0, "why": ""}, "buyerAccess": {"score": 0, "why": ""}, "audienceMarket": {"score": 0, "why": ""}, "travelEffort": {"score": 0, "why": ""}}}`;
}

exports.handler = async (event) => {
  const started = Date.now();
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'bad_request' }); }

  const key = String(body.key || '').trim() || process.env.GEMINI_API_KEY || '';
  if (body.task === 'status') {
    return json(200, { ok: true, hasServerKey: !!process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || DEFAULT_MODEL });
  }
  if (!key) return json(200, { ok: false, error: 'no_key' });

  try {
    if (body.task === 'arc') {
      const r = await gemini(key, arcPrompt(body), started);
      return json(200, { ok: true, result: r.data, model: r.model });
    }
    if (body.task === 'intake') {
      const pasted = String(body.pastedText || '').trim().slice(0, 5000);
      let pageText = '';
      if (body.url) {
        try { pageText = await readPage(body.url); } catch (e) { if (!pasted) throw e; }
      }
      const source = [pasted && `Description pasted by the rep:\n${pasted}`, pageText && `Text from the event website:\n${pageText}`].filter(Boolean).join('\n\n');
      if (!source) return json(200, { ok: false, error: 'fetch_failed' });
      const r = await gemini(key, intakePrompt(body, source), started);
      return json(200, { ok: true, draft: r.data, model: r.model, sourceChars: source.length });
    }
    return json(400, { ok: false, error: 'bad_request' });
  } catch (e) {
    const known = ['busy', 'timeout', 'bad_key', 'bad_output', 'fetch_failed', 'bad_url'];
    return json(200, { ok: false, error: known.includes(e.code) ? e.code : 'unavailable' });
  }
};

// Exported for tests/functions.mjs only.
exports._test = { checkUrl, htmlToText, parseJsonText, arcPrompt, intakePrompt };
````

Run: `node tests/functions.mjs`. Expected: `13/13 passed`.

- [ ] **Step 5: Replace js/views/contacts.js with the AI version**

```js
// Contacts tab: list, contact page (timeline + signal), AI summary.
import { relationshipSignal, timelineMarkers } from '../signals.js';
import { validateArc } from '../validate.js';
import { aiArc } from '../api.js';
import { esc, fmtDate, signalClass } from './ui.js';

let query = '';

function rowsFor(store, today) {
  return store.people().map((person) => {
    const encounters = store.encountersFor(person.id);
    return { person, encounters, signal: relationshipSignal(encounters, today) };
  }).filter((r) => r.encounters.length)
    .sort((a, b) => b.encounters[b.encounters.length - 1].date.localeCompare(a.encounters[a.encounters.length - 1].date));
}

export function render(el, ctx, personId) {
  if (personId) return renderPerson(el, ctx, personId);
  const { store } = ctx;
  const rows = rowsFor(store, ctx.today);

  el.innerHTML = `<section class="view">
  <div class="view-head"><h2>Contacts</h2></div>
  <input type="search" id="q" placeholder="Search name or company…" value="${esc(query)}" aria-label="Search contacts" style="margin:8px 0">
  <ul class="rows" id="list"></ul>
</section>`;

  const list = el.querySelector('#list');
  const draw = () => {
    const q = query.toLowerCase();
    list.innerHTML = rows.filter((r) => !q || `${r.person.name} ${r.person.company}`.toLowerCase().includes(q)).map((r) => {
      const last = r.encounters[r.encounters.length - 1];
      return `<li><a href="#contacts/${encodeURIComponent(r.person.id)}">
        <b>${esc(r.person.name)}</b> · ${esc(r.person.company || '')}
        <div><span class="sig ${signalClass(r.signal.label)}">${esc(r.signal.label)}</span>
        <span class="muted">${r.encounters.length} meeting${r.encounters.length === 1 ? '' : 's'} · last: ${esc(last.event)}, ${esc(fmtDate(last.date))}</span></div>
      </a></li>`;
    }).join('') || '<li class="muted">No contacts match.</li>';
  };
  el.querySelector('#q').addEventListener('input', (e) => { query = e.target.value; draw(); });
  draw();

}

function renderPerson(el, ctx, personId) {
  const { store } = ctx;
  const person = store.person(personId);
  if (!person) { el.innerHTML = '<section class="view"><p>Contact not found. <a href="#contacts">Back to contacts</a></p></section>'; return; }
  const encounters = store.encountersFor(personId);
  const signal = relationshipSignal(encounters, ctx.today);
  const unresolved = store.unresolvedFor(personId).map((id) => store.person(id)).filter(Boolean);

  el.innerHTML = `<section class="view">
  <p><a href="#contacts">← Contacts</a></p>
  <h2>${esc(person.name)}</h2>
  <p class="muted">${[person.title, person.company].filter(Boolean).map(esc).join(' · ')}
    ${person.email ? `<br>${esc(person.email)}` : ''}${person.linkedin ? `<br>${esc(person.linkedin)}` : ''}</p>

  ${unresolved.map((c) => {
    const encs = store.encountersFor(c.id);
    const last = encs[encs.length - 1];
    return `<div class="match low">Possible match: <b>${esc(c.name)}</b> (${esc(c.company || '')}${last ? `, last seen at ${esc(last.event)}` : ''}, ${encs.length} meeting${encs.length === 1 ? '' : 's'})
      <div class="row"><button class="chip" data-same="${esc(c.id)}">Same person</button><button class="chip" data-diff="${esc(c.id)}">Different</button></div></div>`;
  }).join('')}

  <div class="box"><b>Rules:</b> <span class="sig ${signalClass(signal.label)}">${esc(signal.label)}</span>
    <div class="hint">${signal.reasons.map(esc).join(' · ')}</div></div>

  <div id="ai"></div>

  <h3>Timeline</h3>
  <ol class="timeline-list">${timelineMarkers(encounters).map(({ encounter: e, marks }) => `<li>
    ${marks.map((m) => `<div class="mark">${esc(m.text)}</div>`).join('')}
    <b>${esc(e.event)}</b> · ${esc(fmtDate(e.date))} · <span class="sig">${esc(e.temperature)}</span>
    <div class="muted">${esc(e.nameAsEntered)}${e.title ? `, ${esc(e.title)}` : ''}${e.company ? ` @ ${esc(e.company)}` : ''} · met by ${esc(e.rep || '?')}</div>
    ${e.note ? `<div>${esc(e.note)}</div>` : ''}
  </li>`).join('')}</ol>

  <details class="box"><summary>Edit email / LinkedIn / title / company</summary>
    <form id="edit" onsubmit="return false">
      <label>Email <input name="email" type="email" value="${esc(person.email || '')}"></label>
      <label>LinkedIn <input name="linkedin" value="${esc(person.linkedin || '')}"></label>
      <label>Job title <input name="title" value="${esc(person.title || '')}"></label>
      <label>Company <input name="company" value="${esc(person.company || '')}"></label>
      <button class="btn" type="submit">Save details</button>
    </form>
  </details>
</section>`;

  el.querySelectorAll('[data-same]').forEach((b) => b.addEventListener('click', () => {
    store.mergeInto(personId, b.dataset.same);
    ctx.go(`#contacts/${encodeURIComponent(b.dataset.same)}`);
  }));
  el.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => {
    store.resolveDifferent(personId, b.dataset.diff);
    renderPerson(el, ctx, personId);
  }));
  el.querySelector('#edit').addEventListener('submit', (e) => {
    const f = new FormData(e.target);
    store.patchPerson(personId, Object.fromEntries(['email', 'linkedin', 'title', 'company'].map((k) => [k, String(f.get(k) || '').trim()])));
    renderPerson(el, ctx, personId);
    ctx.applyNet();
  });
  renderAi(el.querySelector('#ai'), ctx, person, encounters, signal);
}

// ---- AI relationship summary ----
function renderAi(box, ctx, person, encounters, signal) {
  const { store } = ctx;
  if (encounters.length < 2) { box.innerHTML = ''; return; }
  const s = store.aiSummary(person.id);
  const stale = s && s.basedOnEncounters < encounters.length;
  const summaryHtml = s ? `<div class="box ai${stale ? ' stale' : ''}">
      <b>AI:</b> <span class="sig ${signalClass(s.label)}">${esc(s.label)}</span>
      ${s.agreesWithRules ? '' : `<p class="disagree">AI disagrees with rules: ${esc(s.disagreementReason)}</p>`}
      <p>${esc(s.arc)}</p>
      <p><b>Next step:</b> ${esc(s.nextStep)}</p>
      <p class="hint">AI · ${esc(fmtDate(s.generatedAt))} · based on ${s.basedOnEncounters} meetings${stale ? ' · new meeting since this summary' : ''}</p>
    </div>` : '';
  const showButton = !s || stale;
  box.innerHTML = `${summaryHtml}${showButton ? `<button class="btn" id="ai-btn" data-needs-net>${s ? 'Regenerate AI summary' : 'AI summary'}</button>
    <span class="needs-net-hint" hidden>Needs connection</span>` : ''}<p class="error" id="ai-err" hidden></p>`;
  const btn = box.querySelector('#ai-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    const r = await aiArc(store.settings().geminiKey, {
      person: { name: person.name, company: person.company, title: person.title },
      encounters: encounters.map((e) => ({ date: e.date, event: e.event, name: e.nameAsEntered, company: e.company, title: e.title, temperature: e.temperature, note: e.note })),
      rules: { label: signal.label, reasons: signal.reasons },
    });
    const err = box.querySelector('#ai-err');
    const check = r.ok ? validateArc(r.result) : null;
    if (!r.ok || !check.ok) {
      err.textContent = r.ok ? "The AI's answer didn't make sense: try again." : r.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = s ? 'Regenerate AI summary' : 'AI summary';
      return;
    }
    store.setAiSummary(person.id, { ...r.result, generatedAt: ctx.today, basedOnEncounters: encounters.length, model: r.model });
    renderAi(box, ctx, person, encounters, signal);
    ctx.applyNet();
  });
}
```

Run: `render "http://localhost:8000/index.html#contacts/p-ahmed" 400`. Expected: contains `AI summary` (button) before `Timeline`. Locally, clicking it shows "AI and HubSpot only work on the live site (not in local preview)".
Run: `node tests/run.mjs`. Expected: `89/89 passed`.

- [ ] **Step 6: Commit, push, and check on the live site**

```bash
git add js/validate.js tests/validate.test.js tests/all.js tests/functions.mjs netlify/functions/ai.js js/views/contacts.js sw.js
git commit -m "AI relationship summary via Gemini (Netlify function), cached per contact

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```
Ask the user to check on the live site (~1 minute after the push): Settings shows "AI: ready (server key, gemini-3.8-flash)"; Ahmed Hassan → AI summary → an AI label with "AI disagrees with rules: …" mentioning the proposal/Q3 deadline; reload → the summary is still there with no button. If the model name is rejected, the fallback model answers (the footer shows which).
Add an `AI_LOG.md` row about how the Gemini integration went (e.g. prompt/JSON issues, model behaviour on Ahmed), and commit it with the next task.

---

### Task 12: HubSpot push, demo mode, CSV (MVP 6)

**Files:**
- Create: `netlify/functions/hubspot.js`
- Replace: `tests/functions.mjs` (adds HubSpot tests), `js/views/contacts.js` (adds push buttons, demo mode, CSV)

**Interfaces:**
- Consumes: `hubspotPayload`, `contactsCsv` (signals); `hubspotPush` (api); store `hubspotPushed`, `markPushed`, `settings().hubspotToken`.
- Produces: `POST /.netlify/functions/hubspot` with `{ token, contacts:[≤10 payloads] }` → `{ ok:true, results:[{email, action:'created'|'updated'|'error', id?, message?}] }` in the same order, or `{ok:false, error:'no_token'|'hubspot_auth'|'busy'|'unavailable'}`. Creates the custom properties `grain_lead_source` (text) and `grain_conference_summary` (textarea) if missing.

- [ ] **Step 1: Replace tests/functions.mjs with the full version (adds HubSpot tests)**

````js
// Command-line checks for the Netlify functions with a FAKE network (no keys, no real calls):
//   node tests/functions.mjs
// The real end-to-end check is the live-site checklist.
import { createRequire } from 'node:module';
import { createRunner } from './runner.js';

const require = createRequire(import.meta.url);
const ai = require('../netlify/functions/ai.js');
const hubspot = require('../netlify/functions/hubspot.js');

const post = (body) => ({ httpMethod: 'POST', body: JSON.stringify(body) });
const reply = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const geminiReply = (obj) => reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

let calls = [];
function fakeFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    return handler(String(url), opts, calls.length);
  };
}
const parse = (res) => JSON.parse(res.body);

const { t, results } = createRunner();
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const { checkUrl, htmlToText } = ai._test;

// ---- ai.js ----
test('status reports whether a server key exists, without calling Gemini', async () => {
  delete process.env.GEMINI_API_KEY;
  fakeFetch(() => { throw new Error('should not be called'); });
  const r = parse(await ai.handler(post({ task: 'status' })));
  t.eq([r.ok, r.hasServerKey, r.model], [true, false, 'gemini-3.8-flash']);
});
test('no key anywhere -> no_key', async () => {
  delete process.env.GEMINI_API_KEY;
  t.eq(parse(await ai.handler(post({ task: 'arc', encounters: [] }))), { ok: false, error: 'no_key' });
});
test('arc: returns the parsed JSON and sends the key in a header, not the URL', async () => {
  process.env.GEMINI_API_KEY = 'server-key';
  const answer = { label: 'Warming - act now', arc: 'x', nextStep: 'y', agreesWithRules: false, disagreementReason: 'z' };
  fakeFetch(() => geminiReply(answer));
  const r = parse(await ai.handler(post({ task: 'arc', person: { name: 'Ahmed' }, encounters: [], rules: { label: 'Steady - nurture', reasons: [] } })));
  t.eq([r.ok, r.result, r.model], [true, answer, 'gemini-3.8-flash']);
  t.ok(!calls[0].url.includes('server-key'), 'key not in URL');
});
test('the rep\'s own key overrides the server key', async () => {
  process.env.GEMINI_API_KEY = 'server-key';
  let used = '';
  globalThis.fetch = async (url, opts) => { used = opts.headers['x-goog-api-key']; return geminiReply({}); };
  await ai.handler(post({ task: 'arc', key: 'my-key', encounters: [] }));
  t.eq(used, 'my-key');
});
test('429 from both models -> busy ("AI is busy, try again in a minute")', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(429, { error: { message: 'quota' } }));
  const r = parse(await ai.handler(post({ task: 'arc', encounters: [] })));
  t.eq([r.error, calls.length], ['busy', 2]);
  t.ok(calls[1].url.includes('gemini-3.5-flash-lite'), 'fell back to flash-lite');
});
test('primary model 503, fallback works', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch((url) => (url.includes('3.8') ? reply(503, 'down') : geminiReply({ ok: 1 })));
  const r = parse(await ai.handler(post({ task: 'arc', encounters: [] })));
  t.eq([r.ok, r.model], [true, 'gemini-3.5-flash-lite']);
});
test('invalid key -> bad_key, no retry', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }));
  const r = parse(await ai.handler(post({ task: 'arc', encounters: [] })));
  t.eq([r.error, calls.length], ['bad_key', 1]);
});
test('non-JSON answer (even in ``` fences) is handled', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(200, { candidates: [{ content: { parts: [{ text: '```json\n{"a":1}\n```' }] } }] }));
  t.eq(parse(await ai.handler(post({ task: 'arc', encounters: [] }))).result, { a: 1 });
  fakeFetch(() => reply(200, { candidates: [{ content: { parts: [{ text: 'Sorry, I cannot help' }] } }] }));
  t.eq(parse(await ai.handler(post({ task: 'arc', encounters: [] }))).error, 'bad_output');
});
test('URL safety: only public http(s) pages', () => {
  const bad = ['http://localhost:8888', 'http://127.0.0.1', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'http://[::1]/', 'http://intranet', 'https://x.local', 'https://example.com:8443/'];
  const rejected = bad.filter((u) => { try { checkUrl(u); return false; } catch { return true; } });
  t.eq(rejected, bad);
  t.eq(checkUrl('https://www.iamtn.events/summit').hostname, 'www.iamtn.events');
});
test('HTML is reduced to readable text', () => {
  const txt = htmlToText('<html><head><title>IAMTN &amp; Friends</title><style>.x{}</style><script>var a=1</script></head><body><h1>Who attends</h1><p>PSPs&nbsp;and MTOs</p></body></html>');
  t.eq(txt, 'IAMTN & Friends\nWho attends\nPSPs and MTOs');
});
test('intake: unreadable page and no pasted text -> fetch_failed', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(403, 'blocked'));
  t.eq(parse(await ai.handler(post({ task: 'intake', name: 'X', url: 'https://example.com' }))).error, 'fetch_failed');
});
test('intake: unreadable page but pasted text -> still drafts', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch((url) => (url.includes('example.com') ? reply(403, 'blocked') : geminiReply({ city: 'Lisbon' })));
  const r = parse(await ai.handler(post({ task: 'intake', name: 'X', url: 'https://example.com', pastedText: 'A payments summit for PSPs.' })));
  t.eq([r.ok, r.draft.city], [true, 'Lisbon']);
});
test('intake: a redirect to an internal address is refused', async () => {
  process.env.GEMINI_API_KEY = 'k';
  fakeFetch(() => reply(302, '', { location: 'http://127.0.0.1/admin' }));
  t.eq(parse(await ai.handler(post({ task: 'intake', name: 'X', url: 'https://example.com' }))).error, 'bad_url');
});

// ---- hubspot.js ----
const dana = { email: 'Dana.Levi@vantelopay.com', firstname: 'Dana', lastname: 'Levi', company: 'Vantelo Pay', jobtitle: 'VP Finance', grain_lead_source: 'Money20/20 Europe 2025', grain_conference_summary: 'Warming - act now · 3 meetings' };

test('hubspot: no token -> no_token', async () => {
  t.eq(parse(await hubspot.handler(post({ contacts: [dana] }))), { ok: false, error: 'no_token' });
});
test('hubspot: new contact -> properties created once, contact created as Lead', async () => {
  fakeFetch((url, opts) => {
    if (url.includes('/properties/contacts/')) return reply(404, {});
    if (url.endsWith('/properties/contacts')) return reply(201, {});
    if (url.endsWith('/search')) return reply(200, { results: [] });
    if (url.endsWith('/objects/contacts') && opts.method === 'POST') return reply(201, { id: '101' });
    return reply(500, {});
  });
  const r = parse(await hubspot.handler(post({ token: 'tok', contacts: [dana] })));
  t.eq(r.results, [{ email: 'dana.levi@vantelopay.com', action: 'created', id: '101' }]);
  const create = calls.find((c) => c.url.endsWith('/objects/contacts'));
  t.eq([create.body.properties.lifecyclestage, create.body.properties.grain_conference_summary], ['lead', 'Warming - act now · 3 meetings']);
  t.eq(calls.filter((c) => c.url.endsWith('/properties/contacts')).length, 2);
});
test('hubspot: existing contact -> updated, lifecycle stage untouched', async () => {
  fakeFetch((url) => {
    if (url.includes('/properties/contacts/')) return reply(200, {});
    if (url.endsWith('/search')) return reply(200, { results: [{ id: '55' }] });
    if (url.endsWith('/objects/contacts/55')) return reply(200, { id: '55' });
    return reply(500, {});
  });
  const r = parse(await hubspot.handler(post({ token: 'tok', contacts: [dana] })));
  t.eq(r.results[0].action, 'updated');
  t.ok(!('lifecyclestage' in calls.find((c) => c.method === 'PATCH').body.properties), 'no stage on update');
});
test('hubspot: created a moment ago (409 on create) -> updates the existing id', async () => {
  fakeFetch((url, opts) => {
    if (url.includes('/properties/contacts/')) return reply(200, {});
    if (url.endsWith('/search')) return reply(200, { results: [] });
    if (url.endsWith('/objects/contacts') && opts.method === 'POST') return reply(409, { message: 'Contact already exists. Existing ID: 77' });
    if (url.endsWith('/objects/contacts/77')) return reply(200, { id: '77' });
    return reply(500, {});
  });
  const r = parse(await hubspot.handler(post({ token: 'tok', contacts: [dana] })));
  t.eq([r.results[0].action, r.results[0].id], ['updated', '77']);
});
test('hubspot: bad token -> hubspot_auth', async () => {
  fakeFetch(() => reply(401, {}));
  t.eq(parse(await hubspot.handler(post({ token: 'bad', contacts: [dana] }))).error, 'hubspot_auth');
});
test('hubspot: contact without email is reported, not sent', async () => {
  fakeFetch((url) => (url.includes('/properties/') ? reply(200, {}) : reply(500, {})));
  const r = parse(await hubspot.handler(post({ token: 'tok', contacts: [{ ...dana, email: '' }] })));
  t.eq(r.results[0], { email: '', action: 'error', message: 'No email' });
});

// Run async tests one by one, then report like tests/run.mjs.
t.group('Netlify functions (fake network)');
for (const [name, fn] of tests) {
  try { await fn(); results.push({ group: 'Netlify functions (fake network)', name, ok: true }); }
  catch (e) { results.push({ group: 'Netlify functions (fake network)', name, ok: false, error: e.message }); }
}
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  ok   ${r.name}`);
  else { failed++; console.log(`  FAIL ${r.name}\n       ${r.error}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
````

Run: `node tests/functions.mjs`. Expected: crash, `Cannot find module '../netlify/functions/hubspot.js'`.

- [ ] **Step 2: Implement netlify/functions/hubspot.js**

```js
// Netlify Function: HubSpot proxy (HubSpot blocks direct browser calls).
// The private-app token comes with each request from Settings and is never stored or logged here.
// Per contact: search by email -> update (stage untouched) or create (stage = lead). No duplicates.

const API = 'https://api.hubapi.com';
const PROPS = [
  { name: 'grain_lead_source', label: 'Grain lead source', type: 'string', fieldType: 'text', groupName: 'contactinformation',
    description: 'Conference where Grain first met this contact' },
  { name: 'grain_conference_summary', label: 'Grain conference summary', type: 'string', fieldType: 'textarea', groupName: 'contactinformation',
    description: 'Relationship signal across conferences, from the Grain conference tool' },
];
const FIELDS = ['email', 'firstname', 'lastname', 'company', 'jobtitle', 'grain_lead_source', 'grain_conference_summary'];

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

function client(token) {
  return async (path, opts = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(API + path, {
        ...opts,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        signal: ctrl.signal,
      });
      if (res.status === 401 || res.status === 403) throw fail('hubspot_auth');
      if (res.status === 429) throw fail('busy');
      return res;
    } catch (e) {
      if (e.code) throw e;
      throw fail(e && e.name === 'AbortError' ? 'timeout' : 'unavailable');
    } finally {
      clearTimeout(t);
    }
  };
}

async function ensureProperties(hs) {
  for (const p of PROPS) {
    const r = await hs(`/crm/v3/properties/contacts/${p.name}`);
    if (r.ok) continue;
    if (r.status !== 404) throw fail('unavailable');
    const c = await hs('/crm/v3/properties/contacts', { method: 'POST', body: JSON.stringify(p) });
    if (!c.ok && c.status !== 409) throw fail('unavailable');
  }
}

async function errorText(res) {
  const body = await res.json().catch(() => ({}));
  return body.message || `HubSpot error ${res.status}`;
}

async function upsert(hs, contact) {
  const email = String(contact.email || '').trim().toLowerCase();
  if (!email) return { email: '', action: 'error', message: 'No email' };
  const properties = Object.fromEntries(FIELDS.filter((k) => contact[k] != null).map((k) => [k, String(contact[k])]));
  properties.email = email;
  try {
    const s = await hs('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }], properties: ['email'], limit: 1 }),
    });
    if (!s.ok) return { email, action: 'error', message: await errorText(s) };
    let id = (((await s.json()).results || [])[0] || {}).id;
    if (!id) {
      const c = await hs('/crm/v3/objects/contacts', { method: 'POST', body: JSON.stringify({ properties: { ...properties, lifecyclestage: 'lead' } }) });
      if (c.ok) return { email, action: 'created', id: (await c.json()).id };
      if (c.status !== 409) return { email, action: 'error', message: await errorText(c) };
      // Created moments ago and not in search yet: HubSpot tells us the existing id.
      id = ((await errorText(c)).match(/Existing ID:\s*(\d+)/) || [])[1];
      if (!id) return { email, action: 'error', message: 'Contact already exists' };
    }
    const u = await hs(`/crm/v3/objects/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    if (!u.ok) return { email, action: 'error', message: await errorText(u) };
    return { email, action: 'updated', id };
  } catch (e) {
    return { email, action: 'error', message: e.code === 'hubspot_auth' ? 'HubSpot token invalid or missing permissions' : 'HubSpot unavailable' };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'bad_request' }); }
  const token = String(body.token || '').trim();
  if (!token) return json(200, { ok: false, error: 'no_token' });
  const contacts = Array.isArray(body.contacts) ? body.contacts : [];
  if (!contacts.length || contacts.length > 10) return json(400, { ok: false, error: 'bad_request' });

  const hs = client(token);
  try {
    await ensureProperties(hs);
  } catch (e) {
    return json(200, { ok: false, error: e.code === 'hubspot_auth' ? 'hubspot_auth' : e.code === 'busy' ? 'busy' : 'unavailable' });
  }
  const results = await Promise.all(contacts.map((c) => upsert(hs, c)));
  return json(200, { ok: true, results });
};
```

Run: `node tests/functions.mjs`. Expected: `19/19 passed`.

- [ ] **Step 3: Replace js/views/contacts.js with the final version**

```js
// Contacts tab: list, contact page (timeline + signal), AI summary, HubSpot push, CSV.
import { relationshipSignal, timelineMarkers, hubspotPayload, contactsCsv } from '../signals.js';
import { validateArc } from '../validate.js';
import { aiArc, hubspotPush } from '../api.js';
import { esc, fmtDate, signalClass } from './ui.js';

let query = '';

function rowsFor(store, today) {
  return store.people().map((person) => {
    const encounters = store.encountersFor(person.id);
    return { person, encounters, signal: relationshipSignal(encounters, today) };
  }).filter((r) => r.encounters.length)
    .sort((a, b) => b.encounters[b.encounters.length - 1].date.localeCompare(a.encounters[a.encounters.length - 1].date));
}

export function render(el, ctx, personId) {
  if (personId) return renderPerson(el, ctx, personId);
  const { store } = ctx;
  const rows = rowsFor(store, ctx.today);
  const unpushed = rows.filter((r) => r.person.email && !store.hubspotPushed(r.person.id));

  el.innerHTML = `<section class="view">
  <div class="view-head"><h2>Contacts</h2>
    <div class="row">
      <button class="btn" id="push-all" data-needs-net ${unpushed.length ? '' : 'data-blocked="true"'}>Push all not yet pushed (${unpushed.length})</button>
      <button class="btn" id="csv">Export CSV</button>
    </div></div>
  <p class="needs-net-hint" hidden>HubSpot push needs a connection.</p>
  <input type="search" id="q" placeholder="Search name or company…" value="${esc(query)}" aria-label="Search contacts" style="margin:8px 0">
  <div id="push-result"></div>
  <ul class="rows" id="list"></ul>
</section>`;

  const list = el.querySelector('#list');
  const draw = () => {
    const q = query.toLowerCase();
    list.innerHTML = rows.filter((r) => !q || `${r.person.name} ${r.person.company}`.toLowerCase().includes(q)).map((r) => {
      const last = r.encounters[r.encounters.length - 1];
      return `<li><a href="#contacts/${encodeURIComponent(r.person.id)}">
        <b>${esc(r.person.name)}</b> · ${esc(r.person.company || '')}
        <div><span class="sig ${signalClass(r.signal.label)}">${esc(r.signal.label)}</span>
        <span class="muted">${r.encounters.length} meeting${r.encounters.length === 1 ? '' : 's'} · last: ${esc(last.event)}, ${esc(fmtDate(last.date))}</span></div>
      </a></li>`;
    }).join('') || '<li class="muted">No contacts match.</li>';
  };
  el.querySelector('#q').addEventListener('input', (e) => { query = e.target.value; draw(); });
  draw();

  el.querySelector('#csv').addEventListener('click', () => downloadCsv(rows, ctx.today));
  el.querySelector('#push-all').addEventListener('click', () => pushRows(ctx, unpushed, el.querySelector('#push-result'), () => render(el, ctx)));
}

function downloadCsv(rows, today) {
  const blob = new Blob(['﻿' + contactsCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `grain-leads-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Push in batches of 10 (the function has ~10 seconds). Demo mode without a token.
async function pushRows(ctx, rows, out, done) {
  const { store } = ctx;
  const token = store.settings().hubspotToken;
  const payloads = rows.filter((r) => r.person.email).map((r) => ({ id: r.person.id, payload: hubspotPayload(r.person, r.encounters, r.signal) }));
  const skipped = rows.filter((r) => !r.person.email).map((r) => r.person.name);
  if (!token) {
    out.innerHTML = `<div class="box"><b>Demo mode: nothing was sent.</b> Add a HubSpot token in Settings to push for real. This is exactly what would be sent:
      <pre>${esc(JSON.stringify(payloads.map((p) => p.payload), null, 2))}</pre>
      ${skipped.length ? `<p class="hint">Skipped (no email): ${esc(skipped.join(', '))}</p>` : ''}</div>`;
    return;
  }
  out.innerHTML = '<p class="muted">Pushing to HubSpot…</p>';
  const lines = [];
  for (let i = 0; i < payloads.length; i += 10) {
    const batch = payloads.slice(i, i + 10);
    const r = await hubspotPush(token, batch.map((b) => b.payload));
    if (!r.ok) { lines.push(`Error: ${r.message}`); break; }
    r.results.forEach((res, j) => {
      if (res.action === 'error') lines.push(`${res.email}: ${res.message || 'error'}`);
      else { store.markPushed(batch[j].id, ctx.today); lines.push(`${res.email}: ${res.action}`); }
    });
  }
  if (skipped.length) lines.push(`Skipped (no email): ${skipped.join(', ')}`);
  out.innerHTML = `<div class="box"><b>HubSpot</b><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  if (done && lines.every((l) => !l.startsWith('Error'))) setTimeout(done, 1500);
}

function renderPerson(el, ctx, personId) {
  const { store } = ctx;
  const person = store.person(personId);
  if (!person) { el.innerHTML = '<section class="view"><p>Contact not found. <a href="#contacts">Back to contacts</a></p></section>'; return; }
  const encounters = store.encountersFor(personId);
  const signal = relationshipSignal(encounters, ctx.today);
  const unresolved = store.unresolvedFor(personId).map((id) => store.person(id)).filter(Boolean);
  const pushed = store.hubspotPushed(personId);

  el.innerHTML = `<section class="view">
  <p><a href="#contacts">← Contacts</a></p>
  <h2>${esc(person.name)}</h2>
  <p class="muted">${[person.title, person.company].filter(Boolean).map(esc).join(' · ')}
    ${person.email ? `<br>${esc(person.email)}` : ''}${person.linkedin ? `<br>${esc(person.linkedin)}` : ''}</p>

  ${unresolved.map((c) => {
    const encs = store.encountersFor(c.id);
    const last = encs[encs.length - 1];
    return `<div class="match low">Possible match: <b>${esc(c.name)}</b> (${esc(c.company || '')}${last ? `, last seen at ${esc(last.event)}` : ''}, ${encs.length} meeting${encs.length === 1 ? '' : 's'})
      <div class="row"><button class="chip" data-same="${esc(c.id)}">Same person</button><button class="chip" data-diff="${esc(c.id)}">Different</button></div></div>`;
  }).join('')}

  <div class="box"><b>Rules:</b> <span class="sig ${signalClass(signal.label)}">${esc(signal.label)}</span>
    <div class="hint">${signal.reasons.map(esc).join(' · ')}</div></div>

  <div id="ai"></div>

  <h3>Timeline</h3>
  <ol class="timeline-list">${timelineMarkers(encounters).map(({ encounter: e, marks }) => `<li>
    ${marks.map((m) => `<div class="mark">${esc(m.text)}</div>`).join('')}
    <b>${esc(e.event)}</b> · ${esc(fmtDate(e.date))} · <span class="sig">${esc(e.temperature)}</span>
    <div class="muted">${esc(e.nameAsEntered)}${e.title ? `, ${esc(e.title)}` : ''}${e.company ? ` @ ${esc(e.company)}` : ''} · met by ${esc(e.rep || '?')}</div>
    ${e.note ? `<div>${esc(e.note)}</div>` : ''}
  </li>`).join('')}</ol>

  <details class="box"><summary>Edit email / LinkedIn / title / company</summary>
    <form id="edit" onsubmit="return false">
      <label>Email <input name="email" type="email" value="${esc(person.email || '')}"></label>
      <label>LinkedIn <input name="linkedin" value="${esc(person.linkedin || '')}"></label>
      <label>Job title <input name="title" value="${esc(person.title || '')}"></label>
      <label>Company <input name="company" value="${esc(person.company || '')}"></label>
      <button class="btn" type="submit">Save details</button>
    </form>
  </details>

  <div class="box"><b>HubSpot</b> ${pushed ? `<span class="hint">Pushed ✓ ${esc(fmtDate(pushed))}</span>` : ''}
    <div class="row" style="margin-top:8px">
      ${person.email
    ? `<button class="btn" id="push" data-needs-net>${pushed ? 'Push again' : 'Push to HubSpot'}</button>`
    : '<button class="btn" disabled>Add an email to push</button>'}
    </div>
    <p class="needs-net-hint" hidden>Needs connection.</p>
    <div id="push-result"></div>
  </div>
</section>`;

  el.querySelectorAll('[data-same]').forEach((b) => b.addEventListener('click', () => {
    store.mergeInto(personId, b.dataset.same);
    ctx.go(`#contacts/${encodeURIComponent(b.dataset.same)}`);
  }));
  el.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => {
    store.resolveDifferent(personId, b.dataset.diff);
    renderPerson(el, ctx, personId);
  }));
  el.querySelector('#edit').addEventListener('submit', (e) => {
    const f = new FormData(e.target);
    store.patchPerson(personId, Object.fromEntries(['email', 'linkedin', 'title', 'company'].map((k) => [k, String(f.get(k) || '').trim()])));
    renderPerson(el, ctx, personId);
    ctx.applyNet();
  });
  const pushBtn = el.querySelector('#push');
  if (pushBtn) {
    pushBtn.addEventListener('click', () => pushRows(ctx, [{ person, encounters, signal }], el.querySelector('#push-result'), () => {
      renderPerson(el, ctx, personId);
      ctx.applyNet();
    }));
  }
  renderAi(el.querySelector('#ai'), ctx, person, encounters, signal);
}

// ---- AI relationship summary ----
function renderAi(box, ctx, person, encounters, signal) {
  const { store } = ctx;
  if (encounters.length < 2) { box.innerHTML = ''; return; }
  const s = store.aiSummary(person.id);
  const stale = s && s.basedOnEncounters < encounters.length;
  const summaryHtml = s ? `<div class="box ai${stale ? ' stale' : ''}">
      <b>AI:</b> <span class="sig ${signalClass(s.label)}">${esc(s.label)}</span>
      ${s.agreesWithRules ? '' : `<p class="disagree">AI disagrees with rules: ${esc(s.disagreementReason)}</p>`}
      <p>${esc(s.arc)}</p>
      <p><b>Next step:</b> ${esc(s.nextStep)}</p>
      <p class="hint">AI · ${esc(fmtDate(s.generatedAt))} · based on ${s.basedOnEncounters} meetings${stale ? ' · new meeting since this summary' : ''}</p>
    </div>` : '';
  const showButton = !s || stale;
  box.innerHTML = `${summaryHtml}${showButton ? `<button class="btn" id="ai-btn" data-needs-net>${s ? 'Regenerate AI summary' : 'AI summary'}</button>
    <span class="needs-net-hint" hidden>Needs connection</span>` : ''}<p class="error" id="ai-err" hidden></p>`;
  const btn = box.querySelector('#ai-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    const r = await aiArc(store.settings().geminiKey, {
      person: { name: person.name, company: person.company, title: person.title },
      encounters: encounters.map((e) => ({ date: e.date, event: e.event, name: e.nameAsEntered, company: e.company, title: e.title, temperature: e.temperature, note: e.note })),
      rules: { label: signal.label, reasons: signal.reasons },
    });
    const err = box.querySelector('#ai-err');
    const check = r.ok ? validateArc(r.result) : null;
    if (!r.ok || !check.ok) {
      err.textContent = r.ok ? "The AI's answer didn't make sense: try again." : r.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = s ? 'Regenerate AI summary' : 'AI summary';
      return;
    }
    store.setAiSummary(person.id, { ...r.result, generatedAt: ctx.today, basedOnEncounters: encounters.length, model: r.model });
    renderAi(box, ctx, person, encounters, signal);
    ctx.applyNet();
  });
}
```

- [ ] **Step 4: Check it**

Run: `render "http://localhost:8000/index.html#contacts" 200`. Expected: starts with `Contacts Push all not yet pushed (10) Export CSV`.
Manual (local): with no HubSpot token in Settings, open Dana Levi → click "Push to HubSpot" → it shows "Demo mode: nothing was sent…" and the JSON with `grain_conference_summary: "Warming - act now · 3 meetings · last met at Money20/20 Europe 2026 · \"Now VP Finance. …"`. Jonathan Cohen (no email) shows a disabled "Add an email to push". "Export CSV" downloads `grain-leads-2026-…csv`; open it in Excel/Numbers and check "José García" shows accents.
Run: `node tests/run.mjs` → `89/89 passed`.

- [ ] **Step 5: Commit and push**

```bash
git add netlify/functions/hubspot.js tests/functions.mjs js/views/contacts.js AI_LOG.md
git commit -m "HubSpot push (search-then-create/update, custom properties), demo mode, CSV export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```
Ask the user to check live with a free HubSpot test account token (Settings): push Dana → HubSpot shows the contact as a Lead with both Grain properties; push again → "updated", no duplicate.

---

### Task 13: Add conference with AI (MVP 7)

**Files:**
- Create: `js/views/addConference.js`
- Modify: `js/app.js`, `sw.js`

**Interfaces:**
- Consumes: `scoreAll`, `sizeRating`, `sizeRatingWhy`, `REGIONS`, `FACTOR_LABELS`; `findConferenceDuplicates`, `norm`; `validateDraft`, `validateConference`; `aiIntake`; `eventCardHTML`; store `conferences`, `conference`, `addConference`, `settings`.
- Produces: route `#add`. Saved conferences carry `source:'ai'|'manual'`, `addedBy`, `addedAt`, `audienceSizeSource:'approx'`, and an id `<slug>-<4 random chars>`; the app then opens `#events/<id>`.

- [ ] **Step 1: Create js/views/addConference.js**

```js
// Add conference: name, dates, link -> AI draft (or manual) -> review with live score -> confirm.
// Nothing is saved without the rep confirming.
import { scoreAll, sizeRating, sizeRatingWhy, REGIONS, FACTOR_LABELS } from '../scoring.js';
import { findConferenceDuplicates, norm } from '../matching.js';
import { validateDraft, validateConference } from '../validate.js';
import { aiIntake } from '../api.js';
import { eventCardHTML } from './eventCard.js';
import { esc } from './ui.js';

const AI_FACTORS = ['icpFit', 'buyerAccess', 'audienceMarket', 'travelEffort'];
const CALIBRATION_IDS = ['iamtn-summit-2026', 'ces-2027', 'money2020-europe-2027'];

// The form survives re-renders within the session.
let basics = { name: '', startDate: '', endDate: '', estimated: false, website: '', pasted: '' };
let draft = null; // { conf, source: 'ai'|'manual' } once we are on the review screen

function duplicatesHtml(store, name, website) {
  const d = findConferenceDuplicates({ name, website }, store.conferences());
  if (!d.length) return '';
  return `<div class="match low">⚠ Looks similar to ${d.map((x) => `<b>${esc(x.conf.name)}</b> (same ${x.reason})`).join(', ')}. You can still add it.</div>`;
}

export function render(el, ctx) {
  if (draft) return renderReview(el, ctx);
  const { store } = ctx;
  el.innerHTML = `<section class="view form">
  <p><a href="#events">← Events</a></p>
  <h2>Add conference</h2>
  <form id="basics" onsubmit="return false">
    <label>Name <input name="name" value="${esc(basics.name)}" placeholder="e.g. Merchant Risk Council Europe 2027"></label>
    <div class="row2">
      <label>Start date <input name="startDate" type="date" value="${esc(basics.startDate)}"></label>
      <label>End date <input name="endDate" type="date" value="${esc(basics.endDate)}"></label>
    </div>
    <label style="font-weight:400"><input type="checkbox" name="estimated" style="width:auto;min-height:0"${basics.estimated ? ' checked' : ''}> Dates are estimated (not announced yet)</label>
    <label>Event website <input name="website" type="url" inputmode="url" value="${esc(basics.website)}" placeholder="https://…"></label>
    <div id="dups"></div>
    <details${basics.pasted ? ' open' : ''}><summary>Or paste a description (if the site can't be read)</summary>
      <textarea name="pasted" placeholder="Paste the 'About' or 'Who attends' text here">${esc(basics.pasted)}</textarea>
    </details>
    <p class="error" id="err" hidden></p>
    <div class="row" style="margin-top:12px">
      <button class="btn primary" id="ai" type="button" data-needs-net>Draft with AI</button>
      <button class="btn" id="manual" type="button">Fill in manually</button>
    </div>
    <p class="needs-net-hint" hidden>AI drafting needs a connection. You can still fill it in manually.</p>
  </form>
</section>`;

  const form = el.querySelector('#basics');
  const err = el.querySelector('#err');
  const read = () => {
    const f = new FormData(form);
    basics = {
      name: String(f.get('name') || '').trim(), startDate: String(f.get('startDate') || ''), endDate: String(f.get('endDate') || ''),
      estimated: f.get('estimated') === 'on', website: String(f.get('website') || '').trim(), pasted: String(f.get('pasted') || '').trim(),
    };
    if (basics.startDate && !basics.endDate) basics.endDate = basics.startDate;
  };
  const showDups = () => { el.querySelector('#dups').innerHTML = duplicatesHtml(store, basics.name, basics.website); };
  form.addEventListener('input', () => { read(); showDups(); });
  showDups();

  const needBasics = () => {
    read();
    if (!basics.name || !basics.startDate) { err.textContent = 'Add at least a name and a start date.'; err.hidden = false; return false; }
    err.hidden = true;
    return true;
  };

  el.querySelector('#manual').addEventListener('click', () => {
    if (!needBasics()) return;
    draft = { conf: emptyConf(), source: 'manual' };
    render(el, ctx);
  });

  el.querySelector('#ai').addEventListener('click', async (e) => {
    if (!needBasics()) return;
    if (!basics.website && !basics.pasted) { err.textContent = 'Add the event website or paste a description.'; err.hidden = false; return; }
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Reading the site…';
    const calibration = CALIBRATION_IDS.map((id) => store.conference(id)).filter(Boolean).map((c) => ({
      name: c.name, city: c.city, country: c.country, region: c.region, verticals: c.verticals, audienceSize: c.audienceSize,
      description: c.description, ratings: Object.fromEntries(AI_FACTORS.map((k) => [k, c.ratings[k]])),
    }));
    const r = await aiIntake(store.settings().geminiKey, {
      name: basics.name, startDate: basics.startDate, endDate: basics.endDate, url: basics.website, pastedText: basics.pasted, calibration,
    });
    const check = r.ok ? validateDraft(r.draft) : null;
    if (!r.ok || !check.ok) {
      err.innerHTML = `${esc(r.ok ? "The AI's answer didn't make sense." : r.message)} <button type="button" class="link" id="go-manual">Fill in manually</button>`;
      err.hidden = false;
      el.querySelector('#go-manual').addEventListener('click', () => { draft = { conf: emptyConf(), source: 'manual' }; render(el, ctx); });
      if (r.error === 'fetch_failed') el.querySelector('details').open = true;
      btn.disabled = false;
      btn.textContent = 'Draft with AI';
      return;
    }
    const d = r.draft;
    draft = {
      source: 'ai',
      conf: {
        ...emptyConf(),
        city: d.city, country: d.country, region: d.region, verticals: d.verticals, audienceSize: d.audienceSize, description: d.description,
        ratings: { ...Object.fromEntries(AI_FACTORS.map((k) => [k, { score: d.ratings[k].score, why: d.ratings[k].why }])), audienceSize: { score: sizeRating(d.audienceSize), why: sizeRatingWhy(d.audienceSize) } },
      },
    };
    render(el, ctx);
  });
}

function emptyConf() {
  return {
    name: basics.name, startDate: basics.startDate, endDate: basics.endDate || basics.startDate,
    dateStatus: basics.estimated ? 'estimated' : 'confirmed', website: basics.website,
    city: '', country: '', region: '', verticals: [], audienceSize: 0, description: '',
    ratings: {},
  };
}

function renderReview(el, ctx) {
  const { store } = ctx;
  const c = draft.conf;
  const ratingRow = (k) => {
    const r = c.ratings[k] || { score: '', why: '' };
    return `<div class="rating-row"><span>${esc(FACTOR_LABELS[k])}</span>
      <select name="r_${k}" aria-label="${esc(FACTOR_LABELS[k])} rating"><option value="">–</option>${[1, 2, 3, 4, 5].map((n) => `<option${r.score === n ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <input name="w_${k}" value="${esc(r.why)}" placeholder="Why?" aria-label="${esc(FACTOR_LABELS[k])} reason"></div>`;
  };

  el.innerHTML = `<section class="view form">
  <p><button class="link" id="back" type="button">← Back</button></p>
  <h2>Review: ${esc(c.name)}</h2>
  <p class="hint">${draft.source === 'ai' ? 'Drafted by AI from the event website. Check every field; you decide.' : 'Fill in the ratings; the score updates as you go.'}</p>
  <div id="dups">${duplicatesHtml(store, c.name, c.website)}</div>
  <div id="preview"></div>
  <form id="review" onsubmit="return false">
    <label>Name <input name="name" value="${esc(c.name)}"></label>
    <div class="row2">
      <label>Start <input name="startDate" type="date" value="${esc(c.startDate)}"></label>
      <label>End <input name="endDate" type="date" value="${esc(c.endDate)}"></label>
    </div>
    <div class="row2">
      <label>City <input name="city" value="${esc(c.city)}"></label>
      <label>Country <input name="country" value="${esc(c.country)}"></label>
    </div>
    <label>Region <select name="region"><option value="">Choose…</option>${REGIONS.map((r) => `<option${c.region === r ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    <label>Verticals (comma-separated) <input name="verticals" value="${esc((c.verticals || []).join(', '))}"></label>
    <label>Audience size (attendees) <input name="audienceSize" type="number" min="1" inputmode="numeric" value="${c.audienceSize || ''}"></label>
    <p class="hint" id="size-hint"></p>
    <label>One-line description <input name="description" value="${esc(c.description)}"></label>
    <label>Website <input name="website" value="${esc(c.website)}"></label>
    <h4>Ratings (1-5, each with a reason)</h4>
    ${AI_FACTORS.map(ratingRow).join('')}
    <p class="error" id="err" hidden></p>
    <div class="row" style="margin-top:14px">
      <button class="btn primary" id="confirm" type="button">Confirm & save</button>
      <button class="btn" id="cancel" type="button">Cancel</button>
    </div>
  </form>
</section>`;

  const form = el.querySelector('#review');
  const read = () => {
    const f = new FormData(form);
    const g = (k) => String(f.get(k) || '').trim();
    const size = parseInt(g('audienceSize'), 10) || 0;
    draft.conf = {
      ...c,
      name: g('name'), startDate: g('startDate'), endDate: g('endDate') || g('startDate'),
      city: g('city'), country: g('country'), region: g('region'),
      verticals: g('verticals').split(',').map((v) => norm(v).replace(/ /g, '-')).filter(Boolean),
      audienceSize: size, description: g('description'), website: g('website'),
      ratings: {
        ...Object.fromEntries(AI_FACTORS.filter((k) => g(`r_${k}`)).map((k) => [k, { score: parseInt(g(`r_${k}`), 10), why: g(`w_${k}`) }])),
        ...(size ? { audienceSize: { score: sizeRating(size), why: sizeRatingWhy(size) } } : {}),
      },
    };
    return draft.conf;
  };
  const preview = () => {
    const conf = read();
    el.querySelector('#size-hint').textContent = conf.audienceSize ? `Size rating ${sizeRating(conf.audienceSize)}/5 (from the attendee thresholds)` : '';
    const complete = AI_FACTORS.every((k) => conf.ratings[k]) && conf.ratings.audienceSize && conf.region && conf.startDate;
    el.querySelector('#preview').innerHTML = complete
      ? eventCardHTML(scoreAll([...store.conferences(), { ...conf, id: '__draft' }]).find((s) => s.id === '__draft'), { controls: false, open: true, today: ctx.today })
      : '<p class="box muted">Set the region, audience size and all four ratings to see the score, tier and Pros / Cons / Biggest drag.</p>';
    el.querySelector('#dups').innerHTML = duplicatesHtml(store, conf.name, conf.website);
  };
  form.addEventListener('input', preview);
  preview();

  el.querySelector('#back').addEventListener('click', () => { read(); draft = null; render(el, ctx); });
  el.querySelector('#cancel').addEventListener('click', () => {
    draft = null;
    basics = { name: '', startDate: '', endDate: '', estimated: false, website: '', pasted: '' };
    ctx.go('#events');
  });
  el.querySelector('#confirm').addEventListener('click', () => {
    const conf = read();
    const check = validateConference(conf);
    const err = el.querySelector('#err');
    if (!check.ok) { err.textContent = check.errors.join('. '); err.hidden = false; return; }
    const me = store.settings().me || 'unknown rep';
    const slug = norm(conf.name).replace(/ /g, '-').slice(0, 40);
    const saved = store.addConference({
      ...conf,
      id: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      audienceSizeSource: 'approx',
      source: draft.source, addedBy: me, addedAt: ctx.today,
    });
    draft = null;
    basics = { name: '', startDate: '', endDate: '', estimated: false, website: '', pasted: '' };
    ctx.go(`#events/${encodeURIComponent(saved.id)}`);
  });
}
```

- [ ] **Step 2: Register the route and add the file to the offline cache**

In `js/app.js`, replace `import * as settings from './views/settings.js';` with:
```js
import * as settings from './views/settings.js';
import * as add from './views/addConference.js';
```
and replace `const VIEWS = { events, plan, capture, contacts, settings };` with `const VIEWS = { events, plan, capture, contacts, settings, add };`

In `sw.js`, replace `const CACHE = 'grain-v2';` with `const CACHE = 'grain-v3';` and replace:
```js
  'js/views/contacts.js',
  'js/views/settings.js',
```
with:
```js
  'js/views/contacts.js',
  'js/views/addConference.js',
  'js/views/settings.js',
```

- [ ] **Step 3: Run the tests**

Run: `node tests/run.mjs`. Expected: `89/89 passed` (the offline-cache check now includes `addConference.js`).

- [ ] **Step 4: Script the manual route in headless Chrome**

Create `flow-check.html` in the repo root (delete it afterwards, do not commit):
```html
<!DOCTYPE html><html><body><main id="view"></main><pre id="log"></pre>
<script type="module">
import { createStore, memoryStorage } from './js/store.js';
import * as add from './js/views/addConference.js';
const log = (s) => document.getElementById('log').textContent += s + '\n';
const get = (p) => fetch(p).then(r => r.json());
const [conferences, contactsData] = await Promise.all([get('data/conferences.json'), get('data/contacts.json')]);
const store = createStore({ seed: { conferences, contacts: contactsData }, storage: memoryStorage() });
const el = document.getElementById('view');
const ctx = { store, today: '2026-09-26', applyNet() {}, go(h) { log('go ' + h); } };
store.updateSettings({ me: 'Maya' });
const set = (name, value) => { const i = el.querySelector(`[name="${name}"]`); i.value = value; i.dispatchEvent(new Event('input', { bubbles: true })); };
try {
  add.render(el, ctx);
  set('name', 'Money20/20 Europe 2028'); set('startDate', '2027-10-05'); set('website', 'https://europe.money2020.com/');
  log('DUPS: ' + el.querySelector('#dups').textContent.trim());
  set('name', 'Cross-Border Payments Forum 2027'); set('website', 'https://cbpf.example.com');
  el.querySelector('#manual').click();
  set('city', 'London'); set('country', 'UK'); set('region', 'Europe'); set('verticals', 'payments, Cross Border'); set('audienceSize', '600');
  for (const [k, v] of [['icpFit', '5'], ['buyerAccess', '4'], ['audienceMarket', '5'], ['travelEffort', '4']]) { set('r_' + k, v); set('w_' + k, 'because ' + k); }
  log('PREVIEW: ' + el.querySelector('#preview').textContent.replace(/\s+/g, ' ').trim().slice(0, 90));
  el.querySelector('#confirm').click();
  const added = store.conferences().at(-1);
  log('SAVED: ' + JSON.stringify({ source: added.source, addedBy: added.addedBy, verticals: added.verticals, size: added.ratings.audienceSize.score }));
} catch (e) { log('ERROR ' + e.stack); }
</script></body></html>
```
Run the same `perl … --dump-dom http://localhost:8000/flow-check.html …` command as in Task 8 Step 4, then `rm flow-check.html`.
Expected lines:
```
DUPS: ⚠ Looks similar to Money20/20 Europe 2027 (same link). You can still add it.
PREVIEW: Cross-Border Payments Forum 2027 5 Oct 2027 · London, UK A80 Top priority Why A? ProsICP f
go #events/cross-border-payments-forum-2027-xxxx
SAVED: {"source":"manual","addedBy":"Maya","verticals":["payments","cross-border"],"size":1}
```
(`xxxx` is random.)

- [ ] **Step 5: Commit and push**

```bash
git add js/views/addConference.js js/app.js sw.js
git commit -m "Add conference: AI draft from the event site (or manual), live score review, confirm to save

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```
Ask the user to check live: Events → + Add conference → a real event link (e.g. a 2027 payments event not in the list) → Draft with AI → the review screen shows a sensible draft with reasons; Confirm → the card shows "AI-drafted, confirmed by <rep>"; a site that blocks bots → the friendly message and the paste box opens.

---

### Task 14: Final verification and hand-off

**Files:**
- Modify: `AI_LOG.md` (rows for what happened during the build)

**Interfaces:**
- Consumes: everything.
- Produces: a verified `main`, and the live-site checklist handed to the user.

- [ ] **Step 1: Run every automated check**

Run: `node tests/run.mjs && node tests/functions.mjs`. Expected: `89/89 passed` and `19/19 passed`.
Run `render` for each of `#events`, `#plan`, `#capture`, `#contacts`, `#contacts/p-dana`, `#settings`, `#add`, and `http://localhost:8000/tests.html`. Expected: every page shows its content (no blank `<main>`, no "Loading…"), and tests.html shows `88/88 passed` (the offline-cache check is command-line only).

- [ ] **Step 2: Add AI_LOG.md rows for the build**

Append rows 18+ (continue the numbering after the rows added in Tasks 1 and 11) describing concrete moments from this build where AI helped or got in the way. Only real events from the build, not generic statements.

- [ ] **Step 3: Commit and push**

```bash
git add AI_LOG.md
git commit -m "AI log: build notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 4: Hand the live-site checklist to the user**

Give the user this checklist (spec §12.2) for the deployed site:
1. Settings shows "AI: ready (server key)".
2. Ahmed → AI summary disagrees with the rules and says why; the cached result survives a reload.
3. Add conference from a real event URL → sensible draft, card, confirm → appears in the list and Plan.
4. Unreadable URL → friendly message → paste description / manual route works.
5. Bad Gemini key in Settings → clear message, no crash.
6. HubSpot: no token → demo panel shows the payload; with a free test-account token → contact created with both custom properties; push again → updated, not duplicated.
7. CSV opens in Excel with correct accents.
8. Real phone: open the site, then airplane mode, close the browser, reopen the site, capture and save a lead; AI/HubSpot buttons show "Needs connection".
9. Live demo script: type each `liveDemoScript` name on Capture and see the expected nudge.
Then ask the user to generate AI summaries for Ahmed, Mark and Dana on the live site and send the JSON from Settings → "Copy AI summaries (JSON)" (Task 15).

---

### Task 15: Pre-generated AI summaries in the seed data (needs the user's JSON)

**Files:**
- Modify: `data/contacts.json` (new top-level key `aiSummaries`)

**Interfaces:**
- Consumes: the JSON the user copies from Settings → "Copy AI summaries (JSON)" after generating summaries for `p-ahmed`, `p-mark`, `p-dana` on the live site. Shape: `{ "p-ahmed": { label, arc, nextStep, agreesWithRules, disagreementReason, generatedAt, basedOnEncounters, model }, … }`.
- Produces: `store.aiSummary(id)` returns these for every visitor until a new meeting is added (`basedOnEncounters` < meetings → dimmed + "Regenerate").

- [ ] **Step 1: Validate the pasted JSON**

Save the user's JSON to a scratch file and check it with Node (every entry must pass `validateArc`, and have `generatedAt` and an integer `basedOnEncounters`):
```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { validateArc } from './js/validate.js';
const s = JSON.parse(readFileSync(process.argv[1], 'utf8'));
for (const [id, v] of Object.entries(s)) console.log(id, validateArc(v).ok && /^\d{4}-\d{2}-\d{2}$/.test(v.generatedAt) && Number.isInteger(v.basedOnEncounters));
" /path/to/pasted.json
```
Expected: `p-ahmed true`, `p-mark true`, `p-dana true`.

- [ ] **Step 2: Add them to data/contacts.json**

Add a top-level key `"aiSummaries"` right after `"notSamePairs"` holding exactly the validated object (keep only `p-ahmed`, `p-mark`, `p-dana`). Keep 2-space indentation and non-ASCII characters as-is:
```bash
python3 - /path/to/pasted.json <<'EOF'
import json, sys
p = 'data/contacts.json'
d = json.load(open(p, encoding='utf-8'))
s = json.load(open(sys.argv[1], encoding='utf-8'))
out = {}
for k, v in d.items():
    out[k] = v
    if k == 'notSamePairs':
        out['aiSummaries'] = {i: s[i] for i in ['p-ahmed', 'p-mark', 'p-dana'] if i in s}
json.dump(out, open(p, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
open(p, 'a', encoding='utf-8').write('\n')
EOF
```

- [ ] **Step 3: Verify**

Run: `node tests/run.mjs` → `89/89 passed`. In a fresh browser profile, `render "http://localhost:8000/index.html#contacts/p-ahmed" 600` shows the AI box (`AI: … AI disagrees with rules: …`) without clicking anything.

- [ ] **Step 4: Commit and push**

```bash
git add data/contacts.json
git commit -m "Seed AI summaries for Ahmed, Mark and Dana (protects the demo from free-tier limits)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```
