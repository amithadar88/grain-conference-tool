# Decisions & Talking Points (for the video)

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
  A+ 90+ Must attend / A 75-89 Top priority / B 55-74 Attend if it clusters or budget
  allows / C 40-54 Monitor / D <40 Skip.
- **Why five tiers (a decision made while reviewing the results):** with a single A tier,
  12 of 33 events were "must attend", which is more than a ~25-person company can cover.
  Splitting it gives 3 real must-attends (Money20/20 Europe 98, EuroFinance 95,
  PAY360 90) and 9 "Top priority". Note: PAY360 reaches 90 thanks to the cluster bonus
  (base 85 + IFGS in London the week before): "must" can come from logistics, not only
  quality, and I think that's right: one flight, two events.
- **Pros / Cons / Biggest drag on every event (my idea during review):** a letter
  hides the reason. Money20/20 USA's card says right away: great audience, top meeting
  program, but 15 hours away (Travel -10 pts). A manager planning a US push can still go:
  a conscious decision, not blind obedience to a letter.
  Generated from the existing ratings by a simple rule, **not by AI**: transparent,
  consistent, free. Same principle as everywhere: AI only where rules can't do the job.
- **"Borderline" label** within 3 points of a threshold: 73 and 75 are practically the
  same score, and the tool says so.
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
  partnership (NL), Madrid travel pitch day, and Grain's Commercial Director Airlines &
  Travel spoke at the Airline & Travel Payments B2B Summit (London, Feb 2026).

### The formula, step by step
1. Each event gets five ratings, 1-5, each with a one-line reason.
   Audience size is rated automatically by thresholds that grow ~2-3x per step
   (<1,500 = 1 / 1,500-4,000 = 2 / 4,000-10,000 = 3 / 10,000-30,000 = 4 / 30,000+ = 5),
   which is what "diminishing returns" means in practice.
2. Each rating becomes a share of its weight: points = weight x (rating - 1) / 4.
   **Audience size is the exception:** its points are multiplied by the ICP share, so
   size only counts as much as the room is relevant.
   Why (rating - 1) / 4 and not rating / 5: so a 1 is worth zero and a 5 the full weight.
   Otherwise an event rated 1 on everything would still get 20 points.
3. Base score = sum of the five. **65% of it comes from who is in the room**
   (ICP 35 + Buyer access 30); size adds at most 10, and only for relevant rooms.
4. +5 cluster bonus, capped at 100. Round to a whole number, then assign the tier.

### Worked examples (the video's best 30 seconds)
| Event | ICP | Buyer | Market | Size | Travel | Score |
|---|---|---|---|---|---|---|
| IAMTN Summit (300 people) | 5 -> 35 | 4 -> 22.5 | 4 -> 11.25 | 1 -> 0 | 4 -> 7.5 | **76, A** |
| CES (140,000 people) | 1 -> 0 | 1 -> 0 | 3 -> 7.5 | 5 -> 10 x 0 = 0 | 1 -> 0 | **8, D** |
- **300 of the right people beat 140,000 of the wrong ones.**
- MPE: base 82.5, +5 because ITB Berlin is 5 days later in the same city -> 88.

### Sanity checks (all pass with the real data)
- Money20/20 Europe -> Tier A (98, the top of the list)
- Web Summit, a huge general tech conference -> D (39): size doesn't make up for low
  ICP density
- CES, the biggest event in the list -> D (8)

### Time window
- 13 months (Sep 2026 - Sep 2027): a year ahead from today, which is how a team actually
  plans, and it includes Sibos (end of Sep 2026), the next event on the calendar.
- 2027 events without announced dates get an estimated date from prior years, clearly
  marked "estimated" in the UI.

### Why size is multiplied by ICP (a decision made while reviewing the results)
- The question I asked myself: is a bigger conference automatically better?
- In the first version, size always added points: CES got the full 10 size points for
  140,000 people who are almost all irrelevant to Grain. That's not how a salesperson
  thinks. The real question is "how many relevant people can I meet", not "how many
  people are there".
- Fix: size points x ICP share. Big relevant rooms (ITB Berlin, WTM) barely move; small
  focused rooms don't move at all; only big unfocused events drop
  (Web Summit C -> D, Sibos B -> C, ITB Asia B -> C).
- Options I rejected: keeping it (logically wrong), or dropping size entirely (misses
  that ITB's 97,000 travel people really do mean more relevant meetings).
- Trade-off I accept: **Money20/20 USA drops from exactly 75 (A) to 73 (B).** Defensible:
  15 hours from Tel Aviv, with the room diluted by banks and retail. B means "go if it
  clusters or budget allows", not "irrelevant". Its European twin scores 98.
- What it taught me: 73 and 75 are practically the same score, but the tier letter makes
  them look different. The tool flags events within 3 points of a threshold as
  "Borderline", so the rep knows where judgment is needed.

### Clusters the model surfaced on its own
- **Berlin in March:** MPE (payments) + DACT Treasury Fair (Amsterdam) + ITB Berlin
  (travel), all within ~10 days.
- **Dubai in May:** three B events in two weeks. None justifies a flight alone;
  together they do. That's exactly what "B = attend if it clusters" means.
- **Florida in November:** Phocuswright and CrossTech World run on the same dates,
  ~40 min apart: split the team instead of choosing.
- **Gaps (computed from the data and checked in tests.html):** no A/B event in Sep 2026,
  December, January (only CES, a D), July or August; no A-tier event in North America,
  the Middle East or Asia-Pacific.
- **No A-tier event in North America (best ~73):** travel cost from Tel Aviv pulls US
  events down. A deliberate call for the team: accept it, or raise the weight for the US.

## 1b. How the conference list was built (and what it taught me)
- **First pass:** Claude researched ~27 real events with web search in about 30 minutes,
  each with dates, size and a reason for every rating.
- **The miss:** I found the IAMTN Summit myself: ~300 people, almost all cross-border
  payment companies, scored Tier A. The AI search had missed it.
- **Why it was missed:** broad searches ("fintech conferences 2027") surface big,
  heavily covered events. Small niche events, which are often the most relevant for a
  focused ICP, barely show up.
- **The fix:** a second, targeted pass by niche (cross-border/remittance, FX, travel
  payments, European treasury). It found 5 more relevant events, including one where
  Grain itself was on stage in 2026.
- **Two identity traps along the way:**
  - "IMTC" turned out to be two different things: an academic marketing conference with
    the same acronym, and the cross-border payments conference I was actually looking for.
  - The real one had **rebranded** from IMTC to CrossTech in 2022, which is why it was
    invisible under its old name.
  - Same name, different entity; different name, same entity. That's exactly the
    problem the contact matching has to solve (two people named Dana Levi; one person
    who changed companies). It's why the tool never merges on name alone.
- **Takeaway for the product:** completeness isn't the goal of a sample list, but a
  missed Tier A event is costly, and salespeople hear about new events all the time.
  So the tool has **"Add conference with AI"** (section 3b): the rep pastes a link, the AI
  drafts the ratings, the rep decides. Suggest, not decide.

## 2. Cross-conference tracking: edge cases

### Matching levels
1. Same email or LinkedIn URL -> linked automatically (same person).
2. Similar name + same company -> high-confidence suggestion, rep confirms.
3. Similar name + different company -> low-confidence suggestion, rep confirms:
   "Same Jonathan Cohen? Last seen at Payoneer." [Yes] [No]
   (No "he/she": the data has no gender, and guessing from a name misgenders.)
   - Yes -> link the records and log a **job change** on the timeline.
     Moving up in seniority = positive signal.
   - No -> keep separate, and **don't ask again** for this pair.

### Demo data: one person per edge case (all fictional)
- Warming (Dana Levi): general interest -> volumes -> demo + pricing; promoted to VP.
- Tire-kicker (Mark Thompson): 4 friendly meetings in 12 months, never shares volumes,
  never books a call.
- Job change linked by LinkedIn (Jonathan -> "Jon" Cohen): new company, new email,
  now owns the FX budget.
- Job change with no shared identifier (Sarah Mizrahi): the tool asks carefully.
- Same name, different people (two David Cohens): the rep said "not the same", so the
  tool never asks again.
- Accents + suffix (José García / Jose Garcia, "S.L."): high-confidence suggestion.
- Email beats name (Katarzyna / "Kasia" Nowak): auto-linked.
- Cooling (Tom Becker): hot -> warm -> cold, lost to the bank's FX desk; renewal in
  Jan 2027 = when to come back.
- **Rules vs. AI (Ahmed Hassan):** rep logged "warm" in a rush, so rules say "Steady",
  but the note asks for a proposal before end of Q3. The AI flags "act now" and explains
  why. This is the clearest demo of why the AI is there.
- Single meeting (Priya Raman): hot, but no nudge. Nudges start from the 2nd meeting.
- Companies are invented on purpose: fictional people at real companies would look
  like real Grain deals.

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

## 3. Main AI feature: relationship-arc summary (why this one, and why AI)

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

## 3b. Second AI feature: add a conference from a link
- **Flow:** the rep enters name, dates and link. The AI reads the event's website and
  drafts location, size, verticals and all 5 ratings, each with a reason. The rep sees
  the score, tier and Pros / Cons / Biggest drag, edits anything, and confirms.
  Nothing is saved without a human confirming it.
- **Why AI is the right tool:** judging who attends an event from its website
  (speaker list, agenda, "who should attend") is reading and interpreting messy text.
  No rule can do that; a language model can.
- **Why a human still confirms:** the AI can't know the niche the way the team does
  (see 1b: the AI search missed the most relevant events). The AI saves the typing and
  the research; the rep owns the judgment.
- **Consistency:** the prompt includes Grain's ICP, the rating rubric and three events
  I already rated (IAMTN, CES, Money20/20 Europe) as calibration examples, so a new event
  is rated on the same scale as the rest.
- **Guardrails:** output is validated (ratings 1-5, known regions); if the site can't be
  read, the rep pastes a description or rates manually; duplicate warning if the event
  looks like one already in the list (same entity-matching idea as contacts).
- **Trade-off:** added entries live in the rep's browser only (no team sync yet).

## 4. Tech trade-offs
- **No build step, free tools only,** so a non-developer can host and update it.
- **Keys never in code:** Netlify environment variables or the in-app Settings page.

### Storage: localStorage, not Supabase
- Every evaluator gets a clean, rich demo. With shared data they'd see what the previous
  evaluator typed.
- Works offline. Conference Wi-Fi is famously bad, so capture must not depend on it.
- Simpler to set up and host.
- All data access goes through one file, so moving to Supabase is a focused change.
- **Seed data is read fresh on every load; the team's changes are an overlay on top.**
  Fixes to the event list reach everyone automatically, and "Reset demo data" just clears
  the overlay. Rule: never rename an `id` in the data files.
- **Downside (said openly):** no sync between team members. #1 next-week item.

### Online vs. offline
- Lead capture and matching work offline.
- AI summaries and HubSpot push need a connection; offline, the buttons are disabled
  with a short hint.
- **Deliberately no sync queues or background sync:** complexity that isn't worth it
  for this scope.
- **One exception to "no offline magic": a tiny network-first cache** (service worker).
  Without it the app wouldn't reopen with no signal on the show floor. Network-first:
  with a connection every deploy shows up immediately; the saved copy is used only offline.

### HubSpot
- Via a Netlify function because HubSpot blocks direct browser calls (CORS).
- Token entered in Settings, sent per request, never stored on the server.
- **Upsert by email:** updates an existing contact instead of creating a duplicate,
  the same "don't duplicate people" idea as the cross-conference matching.
- **Demo mode** when there's no token (evaluators won't have one): shows exactly what
  would be sent, plus CSV export as backup. Real push shown in the video with a free
  HubSpot test account.
- **Legacy private app, not Service Keys:** HubSpot now recommends "Service Keys" over
  private apps. I chose a legacy private app because it's the proven path for this
  integration (contact upsert by email). Switching to Service Keys is a small next-week item.

## 5. Scope: how I cut
- All required features are explicit requirements, so I **cut depth, not features.**
- One addition beyond the brief: "Add conference with AI" (3b). I placed it after the
  required items in the build order, so it can't endanger them.
  A missing feature looks worse than a simple one.
- Each feature has a defined minimum version; if one runs past ~45 minutes, I ship the
  thin version and move on.
- Build order keeps the tool working end-to-end after every step, so there's always
  something shippable.
- Deferred to bonus: weight sliders, business-card scan / voice note, AI follow-up email,
  AI conference discovery by niche, HubSpot Company association.
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
4. **HubSpot Company association** + pulling existing HubSpot contacts into matching;
   move from the legacy private app to HubSpot Service Keys.
5. **AI conference discovery by niche** (see section 1b): the AI proactively suggests
   events we don't know about; the "add from link" flow then rates them.
6. **Paid AI tier** before using real customer data.
7. [bonus items I didn't get to: sliders / card scan / follow-up email]
8. Calendar integration, login.

## 8. How I used AI tools
- See AI_LOG.md
- Highlights: [pick 2-3 strongest entries when recording]
