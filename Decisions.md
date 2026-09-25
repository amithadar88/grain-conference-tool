# Decisions & Talking Points

## 1. Scoring: why this model

**Core idea:** conferences are ranked mainly by WHO is in the room (right industries +
decision-makers), then adjusted for size, logistics, and how easy it is to get meetings.

### The model (0-100)
| Factor | Weight | What it measures |
|---|---|---|
| ICP vertical fit | 35% | Share of PSPs, cross-border payments, travel, treasury in the audience |
| Buyer access | 30% | Seniority of attendees + structured meeting formats (hosted buyer programs, meeting apps) |
| Audience market fit | 15% | Where attendees come from, not where the venue is |
| Audience size | 10% | Diminishing returns |
| Travel effort from Tel Aviv | 10% | Cost and time of getting there |

- **Why I merged "seniority" and "meeting opportunity" into Buyer access:** they measure
  the same thing from two angles (can we get in front of decision-makers?). Keeping both
  would double-count it, and I want every factor to be one I can defend on its own.
- **Every rating comes with a one-line reason.** The tool shows *why* an event is Tier A,
  not just a number. A salesperson trusts a score they can argue with.
- **Size has diminishing returns:** 50k attendees isn't 10x better than 5k.
- **Cluster bonus (+5):** another strong event (base score 55+) in the same region within
  7 days. Checked on the base score so events don't boost each other in a loop.
- **Tiers come with actions, not just rankings:**
  A 75+ must attend / B 55-74 attend if it clusters or budget allows /
  C 40-54 monitor / D <40 skip.
- [if built] **Weights are adjustable (sliders):** there's no single right answer, so the
  tool ships a smart default the team can tune.

### Location vs. audience
- Big global events (Money20/20 Europe, ITB Berlin) draw people from everywhere, so the
  city says little about who attends. Small regional events draw locals.
- So I split it: **audience market fit** (who attends) vs. **travel effort** (what it costs).
- Location's real value is logistics + clustering: a weaker event next to a strong one
  becomes worth it (one trip, two events).

### Region reasoning (my assumptions, adjustable)
- High: UK + Western Europe (payments & travel hubs, multi-currency pain, short flight
  from Tel Aviv); US (huge market, but costly, so best when clustered)
- Medium: Dubai, Singapore (growing hubs, worth testing)
- Explore: LatAm / emerging markets (high FX pain, harder to serve)
- **Evidence Grain is active in Europe + US:** ITB Berlin, Fintech Meetup, treasuryXL
  partnership (NL), Madrid travel pitch day.

### Sanity checks (verify with the real numbers once data is in)
- Money20/20 Europe -> Tier A
- Huge general tech conference -> borderline B/C (size doesn't make up for low ICP density)

### Time window
- Rolling 12 months (Oct 2026 - Sep 2027), because that's how a team actually plans.
- 2027 events without announced dates get an estimated date from prior years, clearly
  marked "estimated" in the UI.

## 2. Cross-conference tracking: edge cases

### Matching levels
1. Same email or LinkedIn URL -> linked automatically (same person).
2. Similar name + same company -> high-confidence suggestion, rep confirms.
3. Similar name + different company -> low-confidence suggestion, rep confirms:
   "Same Jonathan Cohen? Last time he was at Payoneer." [Yes] [No]
   - Yes -> link the records and log a **job change** on the timeline.
     Moving up in seniority = positive signal.
   - No -> keep separate, and **don't ask again** for this pair.

### Normalization
- Name variations: Jon/Jonathan, Mike/Michael, accents, casing
- Company suffixes: Ltd, Inc, GmbH

### Principles
- **Never merge silently.** Two different people can share a name.
- **The nudge appears at capture time,** while the rep is still talking to the person.
  Matching runs locally, so it works offline on the show floor.
- **Nudge calibration:** only from the 2nd encounter, kept short. The brief's own tension:
  too aggressive = noise, too subtle = invisible.
- **Signal = rules + AI:** transparent rules (encounters, time span, recency, temperature
  trend, concrete asks, seniority change) give a baseline label; AI reads the notes
  (see section 3).

## 3. The AI feature: why this one, and why AI

**Feature:** a relationship-arc summary for repeat contacts: warming relationship worth
closing, or polite tire-kicker?

- **Why AI is the right tool here:** the difference between warming and tire-kicking
  hides in free-text notes. A rule can count meetings, but it can't read
  "asked about hedging for Q3 volumes" and recognize buying intent. That's exactly what
  language models are good at.
- **Why not AI for everything:** counting, dates and matching are done by rules, because
  they must be transparent and predictable. AI does only the part rules can't.
- **AI and rules work together:** the AI can disagree with the rules label, but must
  say why.
- **Guardrails:**
  - Summary is saved and regenerated only when a new encounter is added
    (faster, stable output, respects free-tier limits).
  - No key -> a clear message, never a crash.

### How evaluators see it working
- Key stored as a Netlify environment variable (server side), so anyone clicking the
  live URL sees AI working immediately, without setup.
- Not hardcoded: whoever hosts it changes the key in the Netlify UI, no code.
- A user can enter their own key in Settings, which overrides the default.
- The key never reaches the browser, so it can't be copied from the page.

### Why Gemini (free tier)
- Zero budget. My Claude Pro subscription covers building with Claude, but doesn't
  include API access for the app itself.
- Gemini's free tier covers current Flash models (default: `gemini-3.8-flash`).
- **Privacy trade-off:** on the free tier Google may use the data to improve its
  products. Fine for synthetic demo data; for real Grain customer data I'd switch to the
  paid tier. The model provider lives in one file, so the swap is small.
- Built with Claude, runs on Gemini: picking the right tool per job.

## 4. Tech trade-offs
- **No build step, free tools only,** so a non-developer can host and update it.
- **Keys never in code:** Netlify environment variables or the in-app Settings page.

### Storage: localStorage, not Supabase
- Every evaluator gets a clean, rich demo. With shared data they'd see what the previous
  evaluator typed.
- Works offline. Conference Wi-Fi is famously bad, so capture must not depend on it.
- Simpler to set up and host.
- All data access goes through one file, so moving to Supabase is a focused change.
- **Downside (said openly):** no sync between team members. #1 next-week item.

### Online vs. offline
- Lead capture and matching work offline.
- AI summaries and HubSpot push need a connection; offline, the buttons are disabled
  with a short hint.
- **Deliberately no sync queues or background sync:** complexity that isn't worth it
  for this scope.

### HubSpot
- Via a Netlify function because HubSpot blocks direct browser calls (CORS).
- Token entered in Settings, sent per request, never stored on the server.
- **Upsert by email:** updates an existing contact instead of creating a duplicate,
  the same "don't duplicate people" idea as the cross-conference matching.
- **Demo mode** when there's no token (evaluators won't have one): shows exactly what
  would be sent, plus CSV export as backup. Real push shown in the video with a free
  HubSpot test account.

## 5. Scope: how I cut
- All 7 required features are explicit requirements, so I **cut depth, not features.**
  A missing feature looks worse than a simple one.
- Each feature has a defined minimum version; if one runs past ~45 minutes, I ship the
  thin version and move on.
- Build order keeps the tool working end-to-end after every step, so there's always
  something shippable.
- Deferred to bonus: weight sliders, business-card scan / voice note, AI follow-up email,
  AI conference discovery, HubSpot Company association.
- Out of scope: login, team sync, calendar integration, budget tracking.

## 6. Questions I sent Grain (and my assumptions)
- **How I asked:** each question came with the assumption I'd proceed with, so I didn't
  block waiting for replies.
- Booth vs. attendees -> assumed attendees with pre-booked meetings
- Buying signals -> assumed volumes, pricing, intro to finance/treasury
- How leads are saved today -> assumed quick phone notes
- **Why I asked these:** they're facts about their world I can't know from the outside.
  Design decisions I made myself.
- [update if Noa replies]

## 7. What I'd build next week
1. **Team sync** (Supabase): shared data, so the team sees each other's leads and plans.
2. **History bonus:** score events by the pipeline they actually produced for Grain.
3. **Cost factor:** ticket/booth cost in the scoring.
4. **HubSpot Company association** + pulling existing HubSpot contacts into matching.
5. **Paid AI tier** before using real customer data.
6. [bonus items I didn't get to: sliders / card scan / follow-up email / AI discovery]
7. Calendar integration, login.

## 8. How I used AI tools
- See AI_LOG.md
- Highlights: [pick 2-3 strongest entries when recording]
