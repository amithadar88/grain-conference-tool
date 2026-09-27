// Add conference: name, dates, link -> AI draft (or manual) -> review with live score -> confirm.
// Nothing is saved without the rep confirming.
import { scoreAll, sizeRating, sizeRatingWhy, REGIONS, FACTOR_LABELS, dayNumber } from '../scoring.js';
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

// A long-running "conference" is often a whole series scraped as one page (e.g. a
// multi-week roadshow); flag it, but never block saving — the rep decides.
export function spanWarningHtml(startDate, endDate) {
  if (!startDate || !endDate) return '';
  const gapDays = dayNumber(endDate) - dayNumber(startDate);
  if (gapDays <= 7) return '';
  const days = gapDays + 1; // inclusive of both the start and end day
  return `<div class="match low">⚠ This spans ${days} days. Check the dates: the page may describe a series, not one event.</div>`;
}

export function render(el, ctx) {
  if (draft) return renderReview(el, ctx);
  const { store } = ctx;
  el.innerHTML = `<section class="view form">
  <p><a href="#events">← Events</a></p>
  <h2>Add conference</h2>
  <form id="basics" onsubmit="return false">
    <label>Name <span class="hint">(optional — AI can read it from the link)</span> <input name="name" value="${esc(basics.name)}" placeholder="e.g. Merchant Risk Council Europe 2027"></label>
    <div class="row2">
      <label>Start date <span class="hint">(optional)</span> <input name="startDate" type="date" value="${esc(basics.startDate)}"></label>
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
    read();
    if (!basics.website && !basics.pasted) { err.textContent = 'Add the event website or paste a description.'; err.hidden = false; return; }
    err.hidden = true;
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Reading the site…';
    const calibration = CALIBRATION_IDS.map((id) => store.conference(id)).filter(Boolean).map((c) => ({
      name: c.name, city: c.city, country: c.country, region: c.region, verticals: c.verticals, audienceSize: c.audienceSize,
      description: c.description, ratings: Object.fromEntries(AI_FACTORS.map((k) => [k, c.ratings[k]])),
    }));
    const r = await aiIntake(store.settings().geminiKey, {
      name: basics.name, startDate: basics.startDate, endDate: basics.endDate, url: basics.website, pastedText: basics.pasted, calibration,
    }, () => { btn.textContent = 'Taking longer than usual, retrying…'; });
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
    // Name/dates: whatever the rep typed wins; otherwise take the AI's reading of the
    // source — a link alone is enough to draft from. isoDate guards against the AI
    // returning something unparseable; the review screen still requires name + start
    // date before Confirm & save (validateConference), so nothing incomplete is saved.
    const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
    const name = basics.name || String(d.name || '').trim();
    const startDate = basics.startDate || isoDate(d.startDate);
    const endDate = basics.endDate || isoDate(d.endDate) || startDate;
    draft = {
      source: 'ai',
      // Honest source label (item 5): credit only what actually contributed, not always
      // "the event website" — the site may have failed to load and silently fallen back
      // to the pasted description, or the rep may not have given a website at all.
      sourceLabel: r.usedPage && r.usedPasted ? 'the event website and the description you pasted'
        : r.usedPage ? 'the event website' : 'the description you pasted',
      conf: {
        ...emptyConf(), name, startDate, endDate,
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
  <p class="hint">${draft.source === 'ai' ? `Drafted by AI from ${esc(draft.sourceLabel)}. Check every field; you decide.` : 'Fill in the ratings; the score updates as you go.'}</p>
  <div id="dups">${duplicatesHtml(store, c.name, c.website)}</div>
  <div id="preview"></div>
  <form id="review" onsubmit="return false">
    <label>Name <input name="name" value="${esc(c.name)}"></label>
    <div class="row2">
      <label>Start <input name="startDate" type="date" value="${esc(c.startDate)}"></label>
      <label>End <input name="endDate" type="date" value="${esc(c.endDate)}"></label>
    </div>
    <div id="span-warn"></div>
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
    el.querySelector('#span-warn').innerHTML = spanWarningHtml(conf.startDate, conf.endDate);
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
