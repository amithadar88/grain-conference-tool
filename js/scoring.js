// Pure scoring logic: no DOM, no storage, no network.
// Scores, tiers and clusters are always computed here, never stored.

export const WEIGHTS = { icpFit: 35, buyerAccess: 30, audienceMarket: 15, audienceSize: 10, travelEffort: 10 };
export const FACTORS = Object.keys(WEIGHTS); // heaviest first: ties in "biggest drag" go to the heavier factor
export const FACTOR_LABELS = {
  icpFit: 'ICP fit', buyerAccess: 'Buyer access', audienceMarket: 'Audience market',
  audienceSize: 'Audience size', travelEffort: 'Travel',
};
export const REGIONS = ['Europe', 'North America', 'Middle East', 'Asia-Pacific'];
export const CORE_VERTICALS = ['payments', 'cross-border', 'travel', 'treasury', 'fx'];
export const WINDOW = { start: '2026-09', months: 13 };
export const TIERS = [
  { tier: 'A+', min: 90, action: 'Must attend' },
  { tier: 'A', min: 75, action: 'Top priority' },
  { tier: 'B', min: 55, action: 'Attend if it clusters or budget allows' },
  { tier: 'C', min: 40, action: 'Monitor' },
  { tier: 'D', min: 0, action: 'Skip' },
];
const THRESHOLDS = [90, 75, 55, 40];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const share = (rating) => (rating - 1) / 4;
const clean = (x) => Math.round(x * 1e6) / 1e6; // removes float noise like 72.49999999

export function sizeRating(attendees) {
  const n = Number(attendees) || 0;
  if (n >= 30000) return 5;
  if (n >= 10000) return 4;
  if (n >= 4000) return 3;
  if (n >= 1500) return 2;
  return 1;
}

export function sizeRatingWhy(attendees) {
  const bands = { 1: 'under 1,500', 2: '1,500-3,999', 3: '4,000-9,999', 4: '10,000-29,999', 5: '30,000+' };
  const n = Number(attendees) || 0;
  return `About ${n.toLocaleString('en-US')} attendees (${bands[sizeRating(n)]} band)`;
}

export function factorPoints(ratings) {
  const s = (k) => share(ratings[k].score);
  return {
    icpFit: WEIGHTS.icpFit * s('icpFit'),
    buyerAccess: WEIGHTS.buyerAccess * s('buyerAccess'),
    audienceMarket: WEIGHTS.audienceMarket * s('audienceMarket'),
    audienceSize: WEIGHTS.audienceSize * s('audienceSize') * s('icpFit'), // size only counts as much as the room is relevant
    travelEffort: WEIGHTS.travelEffort * s('travelEffort'),
  };
}

export function baseScore(conf) {
  return clean(Object.values(factorPoints(conf.ratings)).reduce((a, b) => a + b, 0));
}

export function roundScore(x) {
  return Math.round(clean(x));
}

export function tierFor(score) {
  return TIERS.find((t) => score >= t.min);
}

export function borderline(score) {
  for (const t of THRESHOLDS) {
    const d = score - t;
    if (Math.abs(d) > 3) continue;
    const name = tierFor(t).tier;
    const pts = (n) => `${n} ${n === 1 ? 'pt' : 'pts'}`;
    if (d < 0) return `Borderline: ${pts(-d)} below ${name}`;
    if (d === 0) return `Borderline: right on the ${name} line`;
    return `Borderline: ${pts(d)} above the ${name} line`;
  }
  return null;
}

// Pros = rated 4-5, Cons = rated 1-2, Biggest drag = most points lost vs. the factor's maximum.
export function explain(conf) {
  const pts = factorPoints(conf.ratings);
  const pros = [];
  const cons = [];
  let drag = null;
  for (const k of FACTORS) {
    const r = conf.ratings[k];
    const item = { factor: k, label: FACTOR_LABELS[k], score: r.score, why: r.why || '' };
    if (r.score >= 4) pros.push(item);
    if (r.score <= 2) cons.push(item);
    const lost = clean(WEIGHTS[k] - pts[k]);
    if (!drag || lost > drag.lost) drag = { factor: k, label: FACTOR_LABELS[k], lost };
  }
  if (drag && drag.lost === 0) drag = null;
  if (drag) drag.text = `${drag.label} (−${Math.round(drag.lost)} pts)`;
  return { points: pts, pros, cons, drag };
}

// A reason, shortened for the card: no brackets, first clause only, at most 45 characters.
export function shortWhy(why, max = 45) {
  const text = String(why || '').replace(/\s*\([^)]*\)/g, '').trim();
  const clause = text.split(/[;:,] | [-–—] /)[0].trim();
  if (clause.length <= max) return clause;
  const cut = clause.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:]+$/, '')}…`;
}

// "✅ Densest PSP room · 🔻 Drag: Audience size": the strongest pro (most points among the 4-5s)
// and the biggest drag, from one scoreAll() item. No AI, no manual writing.
export function oneLineSummary(s) {
  const best = s.pros.reduce((a, p) => (!a || s.points[p.factor] > s.points[a.factor] ? p : a), null);
  return [best && `✅ ${shortWhy(best.why)}`, s.drag && `🔻 Drag: ${s.drag.label}`].filter(Boolean).join(' · ');
}

// Dates are 'YYYY-MM-DD'; convert to whole days so time zones never matter.
export function dayNumber(iso) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
}

export function gapDays(a, b) {
  return Math.max(dayNumber(b.startDate) - dayNumber(a.endDate), dayNumber(a.startDate) - dayNumber(b.endDate), 0);
}

export function scoreAll(conferences) {
  const bases = new Map(conferences.map((c) => [c.id, baseScore(c)]));
  return conferences.map((c) => {
    const base = bases.get(c.id);
    let cluster = null;
    for (const o of conferences) {
      if (o.id === c.id || o.region !== c.region || bases.get(o.id) < 55) continue;
      const gap = gapDays(c, o);
      if (gap <= 7 && (!cluster || gap < cluster.gap)) cluster = { id: o.id, name: o.name, gap };
    }
    const bonus = cluster ? 5 : 0;
    const score = roundScore(Math.min(100, base + bonus));
    const t = tierFor(score);
    return { id: c.id, conf: c, base, bonus, cluster, score, tier: t.tier, action: t.action, borderline: borderline(score), ...explain(c) };
  });
}

export function windowMonths(win = WINDOW) {
  const [y, m] = win.start.split('-').map(Number);
  return Array.from({ length: win.months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function monthLabel(ym) {
  return `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
}

export function inWindow(conf, win = WINDOW) {
  return windowMonths(win).includes(conf.startDate.slice(0, 7));
}

const isAB = (s) => ['A+', 'A', 'B'].includes(s.tier);
const isA = (s) => ['A+', 'A'].includes(s.tier);

export function findGaps(scored, win = WINDOW) {
  const inWin = scored.filter((s) => inWindow(s.conf, win));
  return {
    months: windowMonths(win).filter((ym) => !inWin.some((s) => s.conf.startDate.slice(0, 7) === ym && isAB(s))),
    regions: REGIONS.filter((r) => !inWin.some((s) => s.conf.region === r && isA(s))),
    verticals: CORE_VERTICALS.filter((v) => !inWin.some((s) => (s.conf.verticals || []).includes(v) && isAB(s))),
  };
}

export function runningToday(conferences, today) {
  return conferences.find((c) => c.startDate <= today && today <= c.endDate) || null;
}

// Capture preselect: running today, else next upcoming, else the most recent.
export function defaultCaptureConference(conferences, today) {
  const byDate = [...conferences].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return runningToday(byDate, today)
    || byDate.find((c) => c.startDate >= today)
    || byDate[byDate.length - 1]
    || null;
}

const normText = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterEvents(scored, f = {}) {
  const q = normText(f.q).trim();
  const list = scored.filter((s) => {
    const c = s.conf;
    if (f.vertical && !(c.verticals || []).includes(f.vertical)) return false;
    if (f.region && c.region !== f.region) return false;
    if (f.tier && s.tier !== f.tier) return false;
    if (f.month && c.startDate.slice(0, 7) !== f.month) return false;
    if (q && !normText(`${c.name} ${c.city} ${c.country} ${c.description}`).includes(q)) return false;
    return true;
  });
  const byDate = (a, b) => a.conf.startDate.localeCompare(b.conf.startDate);
  return list.sort(f.sort === 'date' ? byDate : (a, b) => b.score - a.score || byDate(a, b));
}
