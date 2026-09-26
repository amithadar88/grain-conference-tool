# AI Usage Log

Where AI tools helped vs. got in the way. Feeds the "how I used AI" part of the video.

| # | Step | Tool | What happened | Helped / Got in the way |
|---|---|---|---|---|
| 1 | Planning | Claude (claude.ai) | Stress-tested my first plan. Caught that evaluators clicking the live URL would have no API key, so the AI feature would be invisible to them. Fix: server-side key in a Netlify env var, user key as override. | Helped |
| 2 | Planning | Claude (claude.ai) | Pushed back on Supabase: shared demo data gets polluted between evaluators, and localStorage also works offline on bad conference Wi-Fi. Kept one data-layer file so it can be swapped later. | Helped |
| 3 | Planning | Claude (claude.ai) | Suggested merging "buyer seniority" and "meeting opportunity" into one "buyer access" factor, so every factor is defensible. | Helped |
| 4 | Planning | Me | Constraint: zero budget. Claude Pro doesn't include API access, so switched the in-app AI to Gemini's free tier. Model provider is isolated in one file. | Decision |
| 5 | Planning | Claude (claude.ai) | Drafted a questions email to Grain where each question comes with the assumption I'll proceed with, so I don't block on replies. | Helped |
| 6 | Setup | Claude Code in VS Code | Extension icon disappeared after opening the cloned repo (VS Code Restricted Mode disables extensions). ~10 min lost. | Got in the way |
| 7 | Setup | Claude Code + Superpowers | Installed the Superpowers plugin to force a brainstorm -> spec -> plan workflow before any code. | - |
| 8 | Setup | Second Claude chat as reviewer | Cross-checked CLAUDE.md in a separate chat. Caught 4 gaps: job-change matching contradicted "name + company", unclear offline scope (risk of over-engineered sync), vague model name, missing open-questions section. Also flagged MVP as ambitious -> added per-item depth limits instead of cutting required features. | Helped |
| 9 | Data | Claude (claude.ai) + me | Claude researched 27 real events with web search, dates and rationales in ~30 min. But it missed IAMTN, a 300-person cross-border payments summit that is pure ICP; I found it manually. Also a false lead: another "IMTC" turned out to be an academic marketing conference (same acronym, different entity, the same problem as matching contacts by name alone). | Helped + limits |
| 10 | Data | Claude (claude.ai) | After my find, a targeted pass by niche (remittance, FX, travel payments, EU treasury) found 5 more relevant events, incl. ATPS B2B, where Grain's own Commercial Director spoke in 2026, and CrossTech World, which is the "missing" IMTC: it had rebranded in 2022. Lesson: broad AI search favors big events; niche queries need domain knowledge from a human. | Helped |
| 11 | Data | Claude (claude.ai) | Caught its own bug: the data file had been regenerated into the wrong folder, so the version I downloaded was missing IAMTN. Fixed and re-verified the event count. | Got in the way, then fixed |
| 12 | Scoring | Claude (claude.ai) + me | I questioned whether a bigger event should always score higher. Claude modeled 3 alternatives on all 33 real events and showed exactly which tiers would change; I chose "size x ICP". AI made the trade-off visible, the decision was mine. | Helped |
| 13 | Scoring | Me + Claude (claude.ai) | My idea: show pros/cons per event so reps judge in context instead of obeying a letter. Claude pointed out it can be derived from ratings we already have, by a rule, with no AI and no manual writing. | Helped |
| 14 | Design | Claude Code (Superpowers brainstorm) | Caught a real offline gap: "no service-worker magic" meant the app wouldn't reopen without signal. Asked me instead of silently changing the decision; I chose a network-first cache. | Helped |
| 15 | Design | Claude Code | Confident but wrong: said the planning gaps "match Decisions.md", but had checked against the doc, not the data, and the doc was wrong (missing January and two regions). Fixed by computing expected results from the real data. Lesson: when AI says "verified", ask "against what?" | Got in the way |
| 16 | Design | Claude Code | Ran the relationship rules by hand on all 11 demo contacts and found a data error (David Cohen/Tranzio expected "Steady" with one meeting). | Helped |
| 17 | Design | Second Claude chat as reviewer | Reviewed the spec and caught that seed data copied into localStorage would never update for existing users, and that Sibos fell outside the planning window. | Helped: one AI reviewing another |
| 18 | Planning | Claude Code | Before writing the plan, prototyped the whole app and ran it (89 logic tests, 19 function tests with a fake network, scripted capture flows). This caught two of its own wrong assumptions: MPE's nearest cluster partner is DACT (overlapping dates), not ITB Berlin; and the page title was being read twice when turning a web page into text. | Helped |
| 19 | Planning | Claude Code | Its headless-Chrome checks, launched from VS Code, triggered a macOS "App Management" permission prompt it hadn't warned me about. I denied it; nothing was installed. New rule: ask before launching or installing anything. | Got in the way |

## Notes for the video
-
