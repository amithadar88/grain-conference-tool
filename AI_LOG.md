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

## Notes for the video
-
