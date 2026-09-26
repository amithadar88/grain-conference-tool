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

## 6. Status colours on the Events card
- Going = green, Considering = amber, Skip = grey (today every status looks green).

## 7. Plan: staffing at a glance
- A small chip on the card, not a full-card colour:
  - Going: green chip `✓ Going · Maya`
  - Considering: amber chip `Considering · Maya`
  - Skip: the whole card is dimmed.
- No rep assigned: the chip shows the status only.

## 8. Self-explanatory cluster badge
- `🔗 +5 · same week as CrossTech World` instead of `+5 cluster`.
- Names the neighbouring event that earned the bonus (if several, the nearest one).

## 9. Plan: event details in a window over the Plan
- Tapping a Plan card (or its badge) opens the event details over the Plan instead of
  jumping to the Events tab.
- Phones: a sheet that slides up from the bottom. Desktop: a centred window.
- An ✕ button closes it; tapping outside it closes it too.
- Closing it returns to the same spot in the Plan (same scroll position).

Note (not a change): status not syncing between a laptop and a phone is expected:
localStorage is per browser and there is no team sync (next-week item #1).

## 10. "Saved" confirmation, impossible to miss
- A big green banner at the top: `✓ Saved: Dana Levi`, visible for about 2 seconds.
- A short vibration on phones that support it (`navigator.vibrate`, silently skipped elsewhere).
- The existing line under the form ("added to … history · Open contact") stays.

## 11. Grouped event picker on Capture
- Instead of one long list, in this order:
  1. `Other event…` at the very top (quick to reach).
  2. **My events**: events assigned to me (Settings name).
  3. **Happening soon**: starting in the next 30 days.
  4. **All events**: every event.
- Don't hide anything: without team sync, a reassignment made on another device won't reach
  this phone, so every event stays in "All events" even when it also appears above.
- The preselected event (today's, or the next one) is still preselected.
