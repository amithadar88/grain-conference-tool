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
function arcPrompt({ person = {}, encounters = [], rules = {}, today }) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : new Date().toISOString().slice(0, 10);
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

Today is ${day}. Judge every deadline in the notes against today's date: if one is close or has passed, say so in the arc and let it drive the label and the timing of the next step.
Write every deadline as an explicit date plus the time from today, e.g. "Q3 ends 30 Sep 2026, 4 days from today". Never use only relative wording ("in 4 days", "next week"): this summary is saved and read again later.

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
