// Pure checks on AI output. The AI is a helper: a bad answer is rejected, never half-used.
import { REGIONS } from './scoring.js';
import { LABELS } from './signals.js';

const AI_FACTORS = ['icpFit', 'buyerAccess', 'audienceMarket', 'travelEffort'];
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
const isRating = (n) => Number.isInteger(n) && n >= 1 && n <= 5;

// Returns { ok, errors: [string] }
export function validateDraft(d) {
  const errors = [];
  if (!d || typeof d !== 'object') return { ok: false, errors: ['not an object'] };
  for (const k of ['city', 'country', 'description']) if (!nonEmpty(d[k])) errors.push(`${k} missing`);
  if (!REGIONS.includes(d.region)) errors.push(`region must be one of ${REGIONS.join(', ')}`);
  if (!Number.isInteger(d.audienceSize) || d.audienceSize <= 0) errors.push('audienceSize must be a positive whole number');
  if (!Array.isArray(d.verticals) || !d.verticals.length || !d.verticals.every(nonEmpty)) errors.push('verticals must be a non-empty list');
  for (const k of AI_FACTORS) {
    const r = d.ratings && d.ratings[k];
    if (!r || !isRating(r.score)) errors.push(`${k} score must be a whole number 1-5`);
    else if (!nonEmpty(r.why)) errors.push(`${k} needs a reason`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateArc(a) {
  const errors = [];
  if (!a || typeof a !== 'object') return { ok: false, errors: ['not an object'] };
  if (!LABELS.includes(a.label)) errors.push('unknown label');
  if (!nonEmpty(a.arc)) errors.push('arc missing');
  if (!nonEmpty(a.nextStep)) errors.push('nextStep missing');
  if (typeof a.agreesWithRules !== 'boolean') errors.push('agreesWithRules must be true/false');
  if (a.agreesWithRules === false && !nonEmpty(a.disagreementReason)) errors.push('disagreementReason missing');
  return { ok: errors.length === 0, errors };
}

export function validateFollowup(f) {
  const errors = [];
  if (!f || typeof f !== 'object') return { ok: false, errors: ['not an object'] };
  if (!nonEmpty(f.subject)) errors.push('subject missing');
  if (!nonEmpty(f.body)) errors.push('body missing');
  return { ok: errors.length === 0, errors };
}

// Checks a conference before it is saved (AI-drafted or manual).
export function validateConference(c) {
  const errors = [];
  if (!nonEmpty(c.name)) errors.push('Name is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(c.endDate || '')) errors.push('Start and end dates are required');
  else if (c.endDate < c.startDate) errors.push('End date is before the start date');
  if (!REGIONS.includes(c.region)) errors.push('Pick a region');
  if (!Number.isInteger(c.audienceSize) || c.audienceSize <= 0) errors.push('Audience size must be a positive number');
  for (const k of AI_FACTORS) if (!c.ratings || !c.ratings[k] || !isRating(c.ratings[k].score)) errors.push('Set all four ratings (1-5)');
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
