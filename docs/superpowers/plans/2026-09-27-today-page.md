# Today Page + Follow-up Draft + Contact/Sort Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (Native, inline — same session, per user instruction to keep this short and implement immediately after planning).

**Goal:** Give the rep a "what to do now" landing page (Today), let them draft a follow-up email with AI from Today or a contact page, surface the AI relationship verdict prominently on the contact page, sort/filter Contacts by urgency, and fix the truncated Pro line on event cards.

**Architecture:** Follow the existing split: pure logic in `js/*.js` (no DOM), rendering in `js/views/*.js`. New pure module `js/today.js` computes Act-now and Coming-up row selection (testable without DOM). A new shared `js/views/followup.js` renders the "Draft follow-up" button + result panel, used by both Today and the contact page, so the AI-call/guardrail code exists once. `netlify/functions/ai.js` gets a third task (`followup`) alongside existing `arc`/`intake`, same key/model/timeout machinery. No changes to `matching.js`, or to the label/matching logic in `signals.js`'s `relationshipSignal` — only new, additive pure helpers there.

**Tech Stack:** Plain HTML/CSS/JS (no build step), existing localStorage store, existing Netlify Function (`ai.js`).

**Spec:** User's message in this conversation (5 items: Today page, AI follow-up, AI summary prominence, Contacts sort/filter, Pro-line wrap fix). No separate spec file — the spec is the request itself, reproduced in task notes below.

## Global Constraints
- Commit and push to `dev` only. No merge to `main`, no deploy, until the user says "deploy".
- No headless-browser screenshots or launching browsers. Verify with `node tests/run.mjs` and `node tests/functions.mjs`.
- Do not change matching logic (`js/matching.js`) or the capture-time nudge (`js/views/capture.js`) — read-only reference, no edits.
- No new external services; reuse the existing Netlify Function + Gemini setup.
- Keep the data layer singular: any new persisted state (guide-dismissed flag) goes through `js/store.js`'s overlay, so "Reset demo data" clears it for free.
- Every new `js/*.js` or `js/views/*.js` file must be added to `sw.js`'s `SHELL` array (a test asserts this) and `CACHE` bumped.
- `AI: <label>` and "AI disagrees" language must reuse the same six labels in `signals.js`'s `LABELS` — never invent new labels.

## Review Focus
- **Contact with 0 or 1 encounters on Today/Contacts sort:** must not crash `urgencyRank`/`isActNow` (a lone "New" contact has no AI summary and a rules label of "New" — must land in the New bucket, never in "act now").
- **AI summary exists but is stale** (`basedOnEncounters < encounters.length`): the contact page must still show the last verdict (not blank) while offering "Regenerate", and Today's Act-now selection should still honor a stale AI "act now" verdict (it's still the last judgment the team has).
- **Follow-up draft with no email on file:** "Open in email" must not render a broken `mailto:` link — show a hint instead, exactly like the existing HubSpot-push-without-email case.
- **Evaluator guide links to demo data that could be edited/removed:** look up "Ahmed Hassan" and the first A+ event by query, not hardcoded ids; if not found, skip that guide line instead of a dead link.
- **Coming-up fallback with zero A/A+ events with no status** (rep has staffed everything, or none exist in this seed): section must show a neutral empty state, not an empty gap.

## File Structure

New:
- `js/today.js` — pure: `actNowRows(store, today)`, `comingUpRows(store, today, windowDays=60)`.
- `js/views/today.js` — DOM: renders the 4 sections (guide strip, Act now, Coming up, Plan gaps).
- `js/views/followup.js` — DOM: `renderFollowup(container, ctx, { person, encounters, signal, ai })`, shared by Today and the contact page.
- `tests/today.test.js` — pure-logic tests for the two selectors above.

Modify:
- `js/signals.js` — add `isActNow(signal, ai)`, `urgencyRank(signal, ai)`, `actNowReason(signal, ai, encounters)`. No change to `relationshipSignal` itself.
- `js/scoring.js` — (1) `oneLineSummary`: stop truncating the pro line via `shortWhy`; use the full `why` text. (2) move `gapLines(gaps)` here from `js/views/plan.js`, exported, pure formatting only (no DOM).
- `js/views/plan.js` — import `gapLines` from `../scoring.js` instead of defining it locally.
- `js/validate.js` — add `validateFollowup(f)` (subject + body non-empty).
- `js/api.js` — add `aiFollowup(key, payload)`.
- `netlify/functions/ai.js` — add `followupPrompt()` + `task === 'followup'` branch; export `followupPrompt` in `_test`.
- `js/store.js` — add `guideDismissed()` / `dismissGuide()` backed by a new `overlay.guideDismissed` field (so Reset demo data clears it).
- `js/views/contacts.js` — move AI card to the top of the contact page under the name (with "not generated yet" explainer + Generate button, and an explicit "AI disagrees with the rules (<rules label>)" line); add "Draft follow-up" button (via `followup.js`); list: default sort = urgency, sort menu (Urgency / Name A-Z / Last met), filter chips by label bucket with counts, "AI: <label>" tag when the AI verdict differs.
- `js/app.js` — register `today` view, land on `#today` by default (drop the `runningToday`-based landing choice), add `today` to `VIEWS`.
- `index.html` — add "Today" nav link (first), add a header gear icon (mobile-only) linking to `#settings`.
- `styles.css` — mobile nav reorder + hide Settings tab (gear replaces it), gear icon style, guide-strip / act-now-row / coming-up-row / filter-chip styles (reuse `.box`, `.chip`, `.rows`, `.mini`, `.sig` wherever possible).
- `sw.js` — add the 3 new JS files to `SHELL`; bump `CACHE` to `grain-v5`.
- `tests/all.js` — register `tests/today.test.js`.
- `tests/signals.test.js` — add tests for `isActNow` / `urgencyRank` / `actNowReason`.

## Task 1 — Pro-line fix + relocate `gapLines` (small, standalone)

**Files:** Modify `js/scoring.js:107-110` (fix) and add `gapLines` there; `js/views/plan.js` (import instead of define); `tests/scoring.test.js:134-146`.

- [ ] In `oneLineSummary`, replace `` `✅ ${shortWhy(best.why)}` `` with `` `✅ ${best.why}` `` (full sentence; the surrounding `<div class="oneliner">` already wraps — no CSS change needed, verified: no `nowrap`/`ellipsis` rule targets it).
- [ ] Update the two tests that assert truncated text:
  - `'✅ Hosted buyers and CFOs · 🔻 Drag: Audience market'` → `'✅ Hosted buyers and CFOs; very senior · 🔻 Drag: Audience market'`
  - The IAMTN test's `.startsWith('✅ Money transfer operators and cross-border… · …')` → assert the full seed text instead: `t.eq(oneLineSummary(byId('iamtn-summit-2026')).startsWith('✅ Money transfer operators and cross-border payment companies: the densest ICP room in the list · 🔻 Drag: '), true);`
- [ ] Move `gapLines(gaps)` (pure formatting, no DOM) from `js/views/plan.js` into `js/scoring.js`, exported, right after `findGaps`. Update `js/views/plan.js` to `import { ..., gapLines } from '../scoring.js';` instead of defining it locally — this is needed by Task 6 (Today's gaps section reuses it).
- [ ] Run `node tests/run.mjs` — expect all green.
- [ ] Commit: `git commit -m "Event cards: show the full Pro-line sentence; move gapLines to scoring.js for reuse"`.

## Task 2 — Urgency helpers in signals.js

**Files:** Modify `js/signals.js` (add after `relationshipSignal`), `tests/signals.test.js`.

**Interfaces produced:** `isActNow(signal, ai) -> boolean`, `urgencyRank(signal, ai) -> 0..5`, `actNowReason(signal, ai, encounters) -> string`. Consumed by `js/today.js` (Task 3) and `js/views/contacts.js` (Task 7).

```js
const URGENCY_RANK = { 'Stalled - possible tire-kicker': 1, 'Steady - nurture': 2, New: 3, 'Cooling - lost for now': 4 };

export function isActNow(signal, ai) {
  return signal.label.startsWith('Warming') || (!!ai && ai.label === 'Warming - act now');
}

export function urgencyRank(signal, ai) {
  return isActNow(signal, ai) ? 0 : (URGENCY_RANK[signal.label] ?? 5);
}

// A short, concrete reason for an "act now" row: the AI's next step if it says act now,
// else a concrete ask, else the job-change line, else the latest note.
export function actNowReason(signal, ai, encounters) {
  if (ai && ai.label === 'Warming - act now' && ai.nextStep) return ai.nextStep;
  if (signal.asks.length) return `Asked about ${signal.asks.join(', ')}`;
  if (signal.label === 'Warming - new role, re-engage') {
    return signal.reasons.find((r) => r.startsWith('Job change:')) || 'New role - re-engage';
  }
  const latest = [...encounters].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return latest && latest.note ? cutNote(latest.note) : signal.label;
}
```

- [ ] Add the three functions to `js/signals.js`.
- [ ] Add tests to `tests/signals.test.js` (new group `'Urgency helpers'`):
  - `isActNow` true for both Warming rules labels, true when rules label is Steady but `ai.label === 'Warming - act now'`, false for New/Cooling/Stalled/Steady with no AI or a non-act-now AI label.
  - `urgencyRank` ordering: act-now (0) < Stalled (1) < Steady (2) < New (3) < Cooling (4).
  - `actNowReason`: Ahmed-shaped signal (asks: ['proposal']) → `'Asked about proposal'`; an AI act-now override with `nextStep` set → returns that `nextStep` verbatim; a `'Warming - new role, re-engage'` signal whose `reasons` includes a `'Job change: X → Y'` line → returns that line.
- [ ] Run `node tests/run.mjs` — new tests pass, all others unchanged (proves matching/signal labels untouched).
- [ ] Commit: `git commit -m "signals: add urgency ranking and act-now reason helpers"`.

## Task 3 — Pure Today selectors (`js/today.js`)

**Files:** Create `js/today.js`, `tests/today.test.js`.

**Interfaces:**
- Consumes: `store.people()`, `store.encountersFor(id)`, `store.aiSummary(id)`, `store.conferences()`, `store.conferencePlan(id)` (all existing `js/store.js` methods); `relationshipSignal`, `isActNow`, `actNowReason`, `withEncounterContact` from `js/signals.js`; `scoreAll`, `dayNumber` from `js/scoring.js`.
- Produces: `actNowRows(store, today) -> [{ person, encounters, signal, ai, reason }]` (sorted, most-recent-meeting first); `comingUpRows(store, today, windowDays=60) -> { mode: 'planned'|'decide', items: [{ ...scoredConf, plan, daysUntil }] }`.

```js
// js/today.js — pure selection logic for the Today page. No DOM.
import { relationshipSignal, isActNow, actNowReason, withEncounterContact } from './signals.js';
import { scoreAll, dayNumber } from './scoring.js';

export function actNowRows(store, today) {
  return store.people()
    .map((p) => {
      const encounters = store.encountersFor(p.id);
      if (!encounters.length) return null;
      const person = withEncounterContact(p, encounters);
      const signal = relationshipSignal(encounters, today);
      const ai = store.aiSummary(p.id);
      return { person, encounters, signal, ai, reason: actNowReason(signal, ai, encounters) };
    })
    .filter((r) => r && isActNow(r.signal, r.ai))
    .sort((a, b) => b.encounters.at(-1).date.localeCompare(a.encounters.at(-1).date));
}

export function comingUpRows(store, today, windowDays = 60) {
  const withStatus = (s) => ({ ...s, plan: store.conferencePlan(s.id), daysUntil: dayNumber(s.conf.startDate) - dayNumber(today) });
  const scored = scoreAll(store.conferences()).map(withStatus).filter((s) => s.daysUntil >= 0);

  const planned = scored.filter((s) => s.daysUntil <= windowDays && ['going', 'considering'].includes(s.plan.status))
    .sort((a, b) => a.daysUntil - b.daysUntil);
  if (planned.length) return { mode: 'planned', items: planned };

  const undecided = scored.filter((s) => ['A+', 'A'].includes(s.tier) && !s.plan.status)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  return { mode: 'decide', items: undecided };
}
```

- [ ] Create `js/today.js` with the code above.
- [ ] Create `tests/today.test.js`:
  ```js
  import { createStore, memoryStorage } from '../js/store.js';
  import { actNowRows, comingUpRows } from '../js/today.js';

  export default function todayTests(t, data) {
    const seed = { conferences: data.conferences, contacts: data.contacts };
    const fresh = () => createStore({ seed, storage: memoryStorage(), prefix: 'grain.test.' });
    const TODAY = '2026-09-26';

    t.group('Today: Act now selection');
    t.test('Dana (rules Warming - act now) and Ahmed-with-AI-override both appear; a Steady contact without AI does not', () => {
      const store = fresh();
      store.setAiSummary('p-ahmed', { label: 'Warming - act now', arc: 'x', nextStep: 'Send the proposal before Q3 ends', agreesWithRules: false, disagreementReason: 'notes show a deadline' });
      const ids = actNowRows(store, TODAY).map((r) => r.person.id);
      t.ok(ids.includes('p-dana'), 'Dana (rules act-now) included');
      t.ok(ids.includes('p-ahmed'), 'Ahmed (AI act-now override) included');
      t.ok(!ids.includes('p-mark'), 'Mark (Stalled, no AI) excluded');
    });
    t.test('Ahmed\'s reason is the AI next step when the AI overrides to act-now', () => {
      const store = fresh();
      store.setAiSummary('p-ahmed', { label: 'Warming - act now', arc: 'x', nextStep: 'Send the proposal before Q3 ends', agreesWithRules: false, disagreementReason: 'y' });
      const row = actNowRows(store, TODAY).find((r) => r.person.id === 'p-ahmed');
      t.eq(row.reason, 'Send the proposal before Q3 ends');
    });

    t.group('Today: Coming up selection');
    t.test('A conference marked Going within 60 days wins over the A/A+ fallback', () => {
      const store = fresh();
      const soon = store.conferences().find((c) => dayNumber(c.startDate) - dayNumber(TODAY) >= 0 && dayNumber(c.startDate) - dayNumber(TODAY) <= 60);
      if (soon) store.setConferencePlan(soon.id, { status: 'going' });
      const r = comingUpRows(store, TODAY);
      if (soon) t.eq([r.mode, r.items.some((i) => i.id === soon.id)], ['planned', true]);
    });
    t.test('With nothing staffed, falls back to undecided A/A+ events, nearest first', () => {
      const store = fresh();
      const r = comingUpRows(store, TODAY);
      t.eq(r.mode, 'decide');
      t.ok(r.items.every((i) => ['A+', 'A'].includes(i.tier) && !i.plan.status), 'only undecided A/A+');
      for (let i = 1; i < r.items.length; i++) t.ok(r.items[i].daysUntil >= r.items[i - 1].daysUntil, 'nearest first');
    });
  }
  ```
  (`dayNumber` import needed in the test file too, from `../js/scoring.js`.)
- [ ] Add `import today from './today.test.js';` to `tests/all.js` and include it in the `suites` array.
- [ ] Run `node tests/run.mjs` — new suite passes.
- [ ] Add `js/today.js` to `sw.js`'s `SHELL` array.
- [ ] Commit: `git commit -m "Add pure Today-page selectors: act-now rows, coming-up rows"`.

## Task 4 — Netlify function: follow-up draft task

**Files:** Modify `netlify/functions/ai.js`, `js/validate.js`, `js/api.js`, `tests/functions.mjs`.

**Interfaces:** `aiFollowup(key, { person, encounters, rules, ai, rep, today }) -> Promise<{ ok, result: { subject, body }, model } | { ok: false, error, message }>` (same shape/guardrails as `aiArc`). `validateFollowup(f) -> { ok, errors }`.

- [ ] In `netlify/functions/ai.js`, add after `arcPrompt`:
  ```js
  function followupPrompt({ person = {}, encounters = [], rules = {}, ai = null, rep = '', today }) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : new Date().toISOString().slice(0, 10);
    const lines = encounters.map((e, i) =>
      `${i + 1}. ${e.date} · ${e.event} · typed as "${e.name}"${e.title ? `, ${e.title}` : ''}${e.company ? ` at ${e.company}` : ''} · temperature: ${e.temperature} · note: "${e.note || ''}"`);
    return `${GRAIN}

  You draft a short follow-up email for a Grain salesperson to send after a conference. Only use facts from the meeting notes below: never invent numbers, prices, features or promises that are not there.

  Contact: ${person.name || ''}${person.title ? `, ${person.title}` : ''}${person.company ? ` at ${person.company}` : ''}
  Rules label: ${rules.label || ''}
  ${ai ? `AI relationship read: ${ai.label} — ${ai.arc || ''} Suggested next step: ${ai.nextStep || ''}` : ''}
  Meetings:
  ${lines.join('\n')}

  Today is ${day}. The email is from ${rep || 'the rep'} at Grain.
  Write a natural, short follow-up: a subject line, and a body under 120 words that references something specific from the notes and ends with one concrete next step (e.g. proposing a call, sending what they asked for, confirming a date). No gendered pronouns.
  Reply with JSON only, exactly these keys:
  {"subject": "one line", "body": "under 120 words"}`;
  }
  ```
- [ ] In `exports.handler`, add a branch (after the `arc` branch, before `intake`):
  ```js
  if (body.task === 'followup') {
    const r = await gemini(key, followupPrompt(body), started);
    return json(200, { ok: true, result: r.data, model: r.model });
  }
  ```
- [ ] Add `followupPrompt` to `exports._test`.
- [ ] In `js/validate.js`, add:
  ```js
  export function validateFollowup(f) {
    const errors = [];
    if (!f || typeof f !== 'object') return { ok: false, errors: ['not an object'] };
    if (!nonEmpty(f.subject)) errors.push('subject missing');
    if (!nonEmpty(f.body)) errors.push('body missing');
    return { ok: errors.length === 0, errors };
  }
  ```
- [ ] In `js/api.js`, add: `export const aiFollowup = (key, payload) => post('ai', { task: 'followup', key, ...payload }, 15000);`
- [ ] In `tests/functions.mjs`, add tests (near the `arc` tests):
  ```js
  test('followup: returns subject + body, sends the key in a header', async () => {
    process.env.GEMINI_API_KEY = 'server-key';
    const answer = { subject: 'Following up from IAMTN', body: 'Hi Ahmed, ...' };
    fakeFetch(() => geminiReply(answer));
    const r = parse(await ai.handler(post({ task: 'followup', person: { name: 'Ahmed' }, encounters: [], rules: { label: 'Steady - nurture' }, rep: 'Maya' })));
    t.eq([r.ok, r.result], [true, answer]);
  });
  test('followup prompt: never invents facts, includes the AI read when given', () => {
    const { followupPrompt } = ai._test;
    const p = followupPrompt({ today: '2026-09-26', person: { name: 'Ahmed' }, encounters: [], rules: { label: 'Steady - nurture' }, ai: { label: 'Warming - act now', arc: 'x', nextStep: 'Send proposal' }, rep: 'Maya' });
    t.ok(/never invent/i.test(p), 'guards against invented facts');
    t.ok(p.includes('Send proposal'), 'includes the AI next step when given');
  });
  ```
- [ ] Run `node tests/functions.mjs` — expect all green.
- [ ] Commit: `git commit -m "AI: add follow-up email draft task to the Netlify function"`.

## Task 5 — Shared follow-up panel (`js/views/followup.js`)

**Files:** Create `js/views/followup.js`.

**Interfaces:**
- Consumes: `aiFollowup` (`js/api.js`), `validateFollowup` (`js/validate.js`), `esc`, `flash` (`js/views/ui.js`).
- Produces: `renderFollowup(container, ctx, { person, encounters, signal, ai }) -> void`. `ctx` is the app-wide context (`{ store, today, applyNet, go }`). Consumed by `js/views/today.js` (Task 6) and `js/views/contacts.js` (Task 7).

```js
// Shared "Draft follow-up" button + result panel. Used on Today (Act-now rows) and the contact page.
import { aiFollowup } from '../api.js';
import { validateFollowup } from '../validate.js';
import { esc, flash } from './ui.js';

export function renderFollowup(container, ctx, { person, encounters, signal, ai }) {
  container.innerHTML = `<button class="btn" type="button" data-needs-net>Draft follow-up</button>
    <span class="needs-net-hint" hidden>Needs connection</span><div class="fu-out"></div>`;
  const btn = container.querySelector('button');
  const out = container.querySelector('.fu-out');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const wasRegenerate = btn.textContent === 'Draft again';
    btn.textContent = 'Drafting…';
    const rep = ctx.store.settings().me;
    const r = await aiFollowup(ctx.store.settings().geminiKey, {
      person: { name: person.name, company: person.company, title: person.title },
      encounters: encounters.map((e) => ({ date: e.date, event: e.event, name: e.nameAsEntered, company: e.company, title: e.title, temperature: e.temperature, note: e.note })),
      rules: { label: signal.label, reasons: signal.reasons },
      ai: ai ? { label: ai.label, arc: ai.arc, nextStep: ai.nextStep } : null,
      rep, today: ctx.today,
    });
    const check = r.ok ? validateFollowup(r.result) : null;
    btn.disabled = false;
    btn.textContent = wasRegenerate ? 'Draft again' : 'Draft follow-up';
    if (!r.ok || !check.ok) {
      out.innerHTML = `<p class="error">${esc(r.ok ? "The AI's answer didn't make sense: try again." : r.message)}</p>`;
      ctx.applyNet();
      return;
    }
    const { subject, body } = r.result;
    const mailto = person.email
      ? `mailto:${encodeURIComponent(person.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : '';
    out.innerHTML = `<div class="box"><b>${esc(subject)}</b><pre>${esc(body)}</pre>
      <div class="row">
        <button class="btn" type="button" class="fu-copy">Copy</button>
        ${mailto ? `<a class="btn" href="${esc(mailto)}">Open in email</a>` : '<span class="hint">No email on file</span>'}
      </div></div>`;
    btn.textContent = 'Draft again';
    out.querySelector('.fu-copy')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); flash('✓ Copied'); } catch { /* clipboard unavailable */ }
    });
    ctx.applyNet();
  });
}
```

- [ ] Create the file above (fix the duplicate `class` attribute typo on the Copy button: `<button class="btn fu-copy" type="button">Copy</button>`).
- [ ] No unit test file (it's DOM-only glue over already-tested `aiFollowup`/`validateFollowup`); covered by the Task 4 function tests plus the user's manual check.
- [ ] Add `js/views/followup.js` to `sw.js`'s `SHELL`.
- [ ] Commit: `git commit -m "Add shared follow-up-draft panel (button, Copy, Open in email)"`.

## Task 6 — Today view (`js/views/today.js`) + routing + nav

**Files:** Create `js/views/today.js`. Modify `js/app.js`, `index.html`, `styles.css`, `sw.js`.

**Interfaces consumed:** `actNowRows`, `comingUpRows` (`js/today.js`); `renderFollowup` (`js/views/followup.js`); `staffingChip` (`js/views/plan.js`, already exported); `gapLines`, `findGaps`, `scoreAll`, `monthLabel` (`js/scoring.js` — `gapLines` lives there after Task 1); `esc`, `fmtDate`, `fmtRange`, `signalClass`, `tierClass` (`js/views/ui.js`).

- [ ] Create `js/views/today.js`:
  ```js
  // Today tab: the default landing page. "What should I do right now?" — all rules-based
  // except the follow-up draft button. No new AI here.
  import { actNowRows, comingUpRows } from '../today.js';
  import { findGaps, gapLines, scoreAll, monthLabel } from '../scoring.js';
  import { staffingChip } from './plan.js';
  import { renderFollowup } from './followup.js';
  import { esc, fmtDate, fmtRange, signalClass, tierClass } from './ui.js';

  const GUIDE_STEPS = [
    { text: 'Open Ahmed Hassan and generate the AI summary: it disagrees with the rules', find: (store) => store.people().find((p) => p.name === 'Ahmed Hassan'), href: (p) => `#contacts/${encodeURIComponent(p.id)}` },
    { text: 'Go to Capture and type "dana levy"', find: () => true, href: () => '#capture' },
    { text: 'Open "Why A+?" on any event', find: (store) => scoreAll(store.conferences()).find((s) => s.tier === 'A+'), href: (s) => `#events/${encodeURIComponent(s.id)}` },
  ];

  function guideHTML(store) {
    if (store.guideDismissed()) return '';
    const items = GUIDE_STEPS.map((s) => {
      const found = s.find(store);
      return found ? `<li><a href="${s.href(found)}">${esc(s.text)}</a></li>` : '';
    }).filter(Boolean);
    if (!items.length) return '';
    return `<div class="box guide" id="guide"><b>New here? Try this</b><ol>${items.join('')}</ol>
      <button class="link" type="button" id="guide-dismiss">Dismiss</button></div>`;
  }

  function actNowHTML(ctx) {
    const rows = actNowRows(ctx.store, ctx.today);
    if (!rows.length) return '<div class="box"><b>Act now</b><p class="hint">Nothing urgent right now.</p></div>';
    return `<div class="box"><b>Act now</b><ul class="rows">${rows.map((r, i) => `<li>
        <b>${esc(r.person.name)}</b> · ${esc(r.person.company || '')}
        <div><span class="sig ${signalClass(r.signal.label)}">${esc(r.signal.label)}</span>
        ${r.ai && r.ai.label !== r.signal.label ? `<span class="sig ${signalClass(r.ai.label)}">AI: ${esc(r.ai.label)}</span>` : ''}</div>
        <p class="hint">${esc(r.reason)}</p>
        <div class="row">
          <a class="btn" href="#contacts/${encodeURIComponent(r.person.id)}">Open</a>
          <span class="fu" data-fu="${i}"></span>
        </div>
      </li>`).join('')}</ul></div>`;
  }

  function comingUpHTML(store, today) {
    const { mode, items } = comingUpRows(store, today);
    if (!items.length) return '<div class="box"><b>Coming up</b><p class="hint">Nothing planned in the next 60 days, and no A/A+ events waiting on a decision.</p></div>';
    const title = mode === 'planned' ? 'Coming up' : 'Coming up — nothing staffed yet, decide on these';
    return `<div class="box"><b>${title}</b><ul class="rows">${items.map((s) => {
      const chip = staffingChip(s.plan);
      return `<a class="mini tier-${tierClass(s.tier)}" href="#events/${encodeURIComponent(s.id)}">
        <b>${esc(s.conf.name)}</b> <span class="muted">in ${s.daysUntil} day${s.daysUntil === 1 ? '' : 's'}</span>
        <small>${esc(fmtRange(s.conf.startDate, s.conf.endDate))} · ${esc(s.conf.city)}</small>
        ${chip ? `<span class="staff staff-${chip.kind}">${esc(chip.text)}</span>` : ''}
      </a>`;
    }).join('')}</ul></div>`;
  }

  function gapsHTML(store) {
    const gaps = findGaps(scoreAll(store.conferences()));
    const lines = gapLines(gaps).filter((l) => !l.startsWith('Every'));
    return `<div class="box"><b>Plan gaps</b>
      ${lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="hint">No gaps in the plan right now.</p>'}
      <p><a href="#plan">See Plan →</a></p></div>`;
  }

  export function render(el, ctx) {
    const { store } = ctx;
    el.innerHTML = `<section class="view">
      <h2>Today</h2>
      ${guideHTML(store)}
      ${actNowHTML(ctx)}
      ${comingUpHTML(store, ctx.today)}
      ${gapsHTML(store)}
    </section>`;

    el.querySelector('#guide-dismiss')?.addEventListener('click', () => {
      store.dismissGuide();
      el.querySelector('#guide').remove();
    });

    actNowRows(store, ctx.today).forEach((r, i) => {
      const slot = el.querySelector(`[data-fu="${i}"]`);
      if (slot) renderFollowup(slot, ctx, r);
    });
  }
  ```
  (Note: `<a class="mini ...">` wraps a `<b>`/`<span>`/`<small>` block — no `class="rows"` wrapper needed around `<a>` mini items since `.mini` is already block-level; drop the stray `<ul class="rows">...</ul>` wrapper around the `comingUpHTML` items and use a plain `<div>` instead, matching how `plan.js` renders `.mini` items directly inside `.month` without a `<ul>`.)
- [ ] Fix that wrapper before committing: change `comingUpHTML`'s `<ul class="rows">...</ul>` to a plain `<div>...</div>`.
- [ ] In `js/app.js`:
  - `import * as today from './views/today.js';`
  - `const VIEWS = { today, events, plan, capture, contacts, settings, add };`
  - Replace the landing logic:
    ```js
    if (!location.hash) location.replace('#today');
    ```
    and drop the now-unused `runningToday` import.
- [ ] In `index.html`:
  - Add as the first `<nav class="tabs">` child:
    ```html
    <a href="#today" data-tab="today"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13 2 4 14h6l-1 8 10-12h-6l1-8z"/></svg><span>Today</span></a>
    ```
  - Add a header gear icon (mobile-only), right after the `#net` span:
    ```html
    <a href="#settings" class="gear-btn" aria-label="Settings"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg></a>
    ```
- [ ] In `styles.css`, add:
  ```css
  /* Mobile bottom nav: Today, Events, Capture, Contacts, Plan — Settings moves to the header gear */
  @media (max-width: 899px) {
    .tabs a[data-tab="today"] { order: 1; }
    .tabs a[data-tab="events"] { order: 2; }
    .tabs a.tab-capture { order: 3; }
    .tabs a[data-tab="contacts"] { order: 4; }
    .tabs a[data-tab="plan"] { order: 5; }
    .tabs a[data-tab="settings"] { display: none; }
  }
  .gear-btn { display: flex; align-items: center; color: #fff; padding: 4px; }
  .gear-btn svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  @media (min-width: 900px) { .gear-btn { display: none; } }
  .guide ol { margin: 6px 0; padding-left: 18px; }
  .fu { display: inline-block; }
  ```
- [ ] Add `js/views/today.js` to `sw.js`'s `SHELL`; bump `CACHE` to `'grain-v5'`.
- [ ] Run `node tests/run.mjs` (checks SHELL completeness) — expect green.
- [ ] Commit: `git commit -m "Add Today page: evaluator guide, Act now, Coming up, Plan gaps; land here by default"`.

## Task 7 — Contact page: AI card up top, follow-up button, sort/filter

**Files:** Modify `js/views/contacts.js`.

- [ ] `renderPerson`: move `<div id="ai"></div>` to directly after the name/title/company paragraph, before the "Rules:" box.
- [ ] Rewrite `renderAi` to always render a card (once `encounters.length >= 2`), with the pre-generation explainer, and the exact "AI disagrees with the rules (<label>)" line:
  ```js
  function renderAi(box, ctx, person, encounters, signal) {
    const { store } = ctx;
    if (encounters.length < 2) { box.innerHTML = ''; return; }
    const s = store.aiSummary(person.id);
    const stale = s && s.basedOnEncounters < encounters.length;
    const showButton = !s || stale;
    const body = s
      ? `<span class="sig ${signalClass(s.label)}">${esc(s.label)}</span>
         ${s.agreesWithRules ? '' : `<p class="disagree">AI disagrees with the rules (${esc(signal.label)}): ${esc(s.disagreementReason)}</p>`}
         <p>${esc(s.arc)}</p>
         <p><b>Next step:</b> ${esc(s.nextStep)}</p>
         <p class="hint">AI · ${esc(fmtDate(s.generatedAt))} · based on ${s.basedOnEncounters} meetings${stale ? ' · new meeting since this summary' : ''}</p>`
      : '<p class="hint">AI reads the meeting notes and judges whether this is warming or a tire-kicker.</p>';
    box.innerHTML = `<div class="box ai${stale ? ' stale' : ''}"><b>AI summary</b>${body}
      ${showButton ? `<button class="btn" id="ai-btn" data-needs-net>${s ? 'Regenerate AI summary' : 'Generate'}</button>
      <span class="needs-net-hint" hidden>Needs connection</span>` : ''}<p class="error" id="ai-err" hidden></p></div>`;
    const btn = box.querySelector('#ai-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Thinking…';
      const r = await aiArc(store.settings().geminiKey, {
        person: { name: person.name, company: person.company, title: person.title },
        encounters: encounters.map((e) => ({ date: e.date, event: e.event, name: e.nameAsEntered, company: e.company, title: e.title, temperature: e.temperature, note: e.note })),
        rules: { label: signal.label, reasons: signal.reasons },
        today: ctx.today,
      });
      const err = box.querySelector('#ai-err');
      const check = r.ok ? validateArc(r.result) : null;
      if (!r.ok || !check.ok) {
        err.textContent = r.ok ? "The AI's answer didn't make sense: try again." : r.message;
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = s ? 'Regenerate AI summary' : 'Generate';
        return;
      }
      store.setAiSummary(person.id, { ...r.result, generatedAt: ctx.today, basedOnEncounters: encounters.length, model: r.model });
      renderAi(box, ctx, person, encounters, signal);
      ctx.applyNet();
    });
  }
  ```
  (Same behavior as before, just repositioned markup + the explainer + the fixed disagree line.)
- [ ] Add a "Draft follow-up" mount point in `renderPerson`'s template, near the AI box (e.g. right under it): `<div id="followup"></div>`, and after `renderAi(...)` call: `renderFollowup(el.querySelector('#followup'), ctx, { person, encounters, signal, ai: store.aiSummary(personId) });` — only when `encounters.length >= 1` (a follow-up can be drafted even after one meeting, unlike the AI arc summary).
- [ ] Import `renderFollowup` from `./followup.js`, and `urgencyRank` from `../signals.js`.
- [ ] List page: add module state `let sortMode = 'urgency';` and `let filterBucket = '';` next to `let query = '';`.
- [ ] `rowsFor` gains `ai: store.aiSummary(p.id)` per row.
- [ ] Add a `SORTERS` map and a `labelBucket` helper (top of file, near `rowsFor`):
  ```js
  const labelBucket = (label) => label.split(' ')[0]; // Warming / Cooling / Stalled / Steady / New
  const lastDate = (r) => r.encounters.at(-1).date;
  const SORTERS = {
    urgency: (a, b) => urgencyRank(a.signal, a.ai) - urgencyRank(b.signal, b.ai) || lastDate(b).localeCompare(lastDate(a)),
    name: (a, b) => a.person.name.localeCompare(b.person.name),
    recent: (a, b) => lastDate(b).localeCompare(lastDate(a)),
  };
  ```
- [ ] In the list `render()`: sort `rows` with `SORTERS[sortMode]` before drawing; render a sort `.seg` (Urgency / Name A-Z / Last met) like Events' Score/Date toggle; render filter chips (`All` + each bucket present in `rows`, with counts), wire `input`/`click` to update `filterBucket`/`sortMode` state and redraw; in `draw()`, filter by `!filterBucket || labelBucket(r.signal.label) === filterBucket` in addition to the existing search filter; show the `AI: <label>` tag next to the rules `<span class="sig">` when `r.ai && r.ai.label !== r.signal.label`.
- [ ] Run `node tests/run.mjs` — the existing `signals.test.js`/`matching.test.js` groups must show identical results (proves the label logic itself is untouched); manually skim contacts-related output for any regressions (there's no `contacts.test.js` today — the app-level check is the user's own localStorage browser check, per the checklist at the end).
- [ ] Commit: `git commit -m "Contacts: AI summary card up top, follow-up draft button, urgency sort + label filter chips"`.

## Task 8 — Docs, final full test run, push

**Files:** `Decisions.md`, `AI_LOG.md`, `.superpowers/sdd/2026-09-26-conference-tool/progress.md` (gitignored, local ledger only).

- [ ] `Decisions.md`: add a short "Today page" section (why it's the default landing page, why the guide auto-hides via the overlay so Reset brings it back, why Act-now reuses the rules label plus an AI override rather than a new label set) and a short "Follow-up draft" section (why it shares guardrails with the AI summary, why it's not cached like the AI summary — it's disposable, regenerated each click).
- [ ] `AI_LOG.md`: one row noting what AI did/didn't help with in this batch (e.g., spotting the `oneLineSummary`/CSS-vs-JS-truncation distinction, or any dead end hit while wiring the shared follow-up panel).
- [ ] Run both suites once more from repo root: `node tests/run.mjs && node tests/functions.mjs` — record the final counts.
- [ ] `git push origin dev`.
- [ ] Reply to the user with: what changed, the two test-suite counts, and a short localhost checklist (Today lands by default and shows real Act-now/Coming-up/Gaps data; guide dismiss + Reset brings it back; Draft follow-up on Today and on a contact page, including the "no email" and offline/local-preview guardrail cases; contact page shows the AI card at the top with the disagree line on Ahmed; Contacts default-sorts to urgency and filter chips work; event card Pro line no longer cuts off mid-word; mobile bottom nav shows Today/Events/Capture/Contacts/Plan with a header gear for Settings, desktop sidebar shows all 6). Then stop.
