# Grain Conference Intelligence Tool

A tool for Grain's sales team: which conferences to attend and why, quick lead capture on
the show floor (works offline), repeat-contact recognition across conferences, AI
relationship summaries, and HubSpot push.

Plain HTML/CSS/JavaScript. No build step, nothing to install. Hosted free on Netlify.

## What's in the app

- **Today** — lands here by default: who needs a follow-up right now, the team's next
  trips, and any gaps in the plan.
- **Contacts** — every lead met so far, with an AI read of the relationship (warming up,
  or just being polite?) and a one-click follow-up email draft.
- **Capture** — log a lead in under 10 seconds on the show floor, even offline.
  Recognizes people the team has met at previous events.
- **Events** — every conference scored for Grain's ICP, with the reasons behind each
  score, plus **+ Add conference** to bring in a new one.
- **Plan** — a 12-month view of what the team's attending, who's covering what (an event
  can have more than one rep), and where the team's under-invested.
- **Settings** — the small person icon in the header switches between "Team" (everyone)
  and one team member ("I am"); Settings itself holds API keys, team names and demo reset.

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

Reps can also add an event from inside the app: **Events → + Add conference**. A link (or
a pasted description, if the site can't be read) is enough — the AI drafts the name,
dates and ratings, and the rep checks everything before confirming. Those live in that
rep's browser.

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
in that browser, and goes back to "Team" view. Keys and team names are kept.

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
