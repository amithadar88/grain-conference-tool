# Design polish (one task, after Task 13, before the final checks)

Requested by Amit after Task 4. Same constraints as everything else: no libraries, no build
step, no new downloads. Icons are inline SVG or emoji. Keep `node tests/run.mjs` green, and
add tests for anything that is pure logic (e.g. the one-line summary). If a new JS file is
added, list it in `sw.js` SHELL and bump `CACHE`.

## 1. Navigation
- **Phones:** a bigger bottom tab bar with an icon + label per tab (Events, Plan, Capture,
  Contacts, Settings). Tap targets at least 48px high; respects the iPhone safe area.
- **Wide screens (desktop, ~900px+):** a left sidebar with the same items instead of the
  bottom bar. Content shifts right; no bottom bar.

## 2. Capture button
- A big round button, raised in the centre of the bottom bar (like Instagram's "+").
- It is part of the bar and never floats over content: the page's bottom padding leaves room
  for it, so no field or "Save lead" button is ever hidden behind it.
- On the desktop sidebar, Capture is a normal (highlighted) sidebar item.

## 3. Pros / Cons / Biggest drag, more scannable
- ✅ Pros on a light green background.
- ⚠️ Cons on a light amber background.
- 🔻 Biggest drag, clearly marked.
- Colours must work in both light and dark text contexts (sufficient contrast).

## 4. One-line summary on every event card (no tap needed)
- Example: `✅ Densest PSP room · 🔻 Drag: Audience size`.
- Built by a rule from the ratings (no AI, no manual writing): the strongest pro (the factor
  earning the most points among those rated 4-5, shown as a short version of its "why") and
  the biggest drag's factor label. If there are no pros, show only the drag; if there is no
  drag (all 5s), show only the pro.
- Pure function in `js/scoring.js` (or `eventCard.js`), with tests in `tests/`.
- "Why A+?" stays as the button that opens the full breakdown.

## 5. Ratings table on narrow screens
- Below ~600px, the ratings table becomes a stacked list: one block per factor with
  "Factor · score/5 · points" on one line and the reason under it. Wide screens keep the table.
