'use strict';
// ---------- players ----------
let state = null; // global league state (set in league.js)

function P(id) { return state.players[id]; }
function T(tid) { return state.teams[tid]; }
// rosters are indexed in one pass and rebuilt lazily after any move (always change teams through setTid)
let ROSTERS = null;
function rostersDirty() { ROSTERS = null; }
function setTid(p, tid) { p.tid = tid; ROSTERS = null; }
function rosterOf(tid) {
  if (!ROSTERS || ROSTERS.st !== state) {
    ROSTERS = { st: state, m: {} };
    for (const id in state.players) { const p = state.players[id]; (ROSTERS.m[p.tid] || (ROSTERS.m[p.tid] = [])).push(p); }
  }
  return (ROSTERS.m[tid] || []).slice();
}
function onIR(p) { return !!p.ir; }
function activeCount(tid) { return rosterOf(tid).filter(p => !onIR(p)).length; }
function pname(p) { return p ? p.first + ' ' + p.last : '—'; }
function pshort(p) { return p ? p.first[0] + '. ' + p.last : '—'; }

function randomName() { return [pick(FIRST_NAMES), pick(LAST_NAMES)]; }

// ---------- money / value ----------
// the market pays for perception (consensus value incl. hype), not the hidden truth
function marketValue(p) {
  const max = SPOTS[p.spot].sal * capFactor(), ov = typeof perOvr === 'function' ? perOvr(p) : p.ovr;
  const gr = p.per ? p.per.g : Math.max(0, p.pot - p.ovr);
  const f = clamp((ov - 58) / 37, 0, 1); // the very best reset the market, they don't double it
  // mkt flattens the curve: when teams have room, the middle class gets paid; the top of each position stays anchored to its ceiling
  let v = MIN_SALARY + (max - MIN_SALARY) * Math.pow(f, POS_SAL_EXP[p.pos] / (state && state.mkt || 1)) * 1.12;
  const ageStart = p.pos === 'QB' || p.pos === 'K' || p.pos === 'P' ? 34 : p.pos === 'RB' ? 28 : 30; // QBs keep getting paid into their mid-30s
  if (p.age >= ageStart) v *= Math.max(0.35, 1 - (p.age - ageStart + 1) * 0.09);
  if (p.age <= 25 && gr > 0) v *= 1 + Math.min(0.25, gr * 0.01);
  return round2(Math.max(MIN_SALARY, v));
}
function contractYears(p) {
  if (p.age <= 25) return 4;
  if (p.age <= 28) return 3;
  if (p.age <= 31) return 2;
  return 1;
}
// abstract "asset value" used for trades and AI decisions
function playerValue(p, forTid) {
  let v = viewOvr(p, forTid) + (forTid != null && forTid >= 0 && typeof schemeFit === 'function' ? schemeFit(p, forTid) * 0.8 : 0);
  if (p.age < 26) v += viewGrowth(p, forTid) * 0.45 * Math.min(1, (26 - p.age) / 4);
  if (p.age > 28) v -= (p.age - 28) * (p.pos === 'RB' ? 2.2 : p.pos === 'QB' || p.pos === 'K' || p.pos === 'P' ? 0.8 : 1.4);
  let val = Math.pow(Math.max(0, v - 45) / 10, 2.4) * SPOTS[p.spot].val;
  // contract surplus
  const surplus = marketValue(p) - p.contract.amt;
  val += surplus * Math.min(p.contract.yrs, 3) * 0.12;
  if (p.injury && p.injury.weeks > 8) val *= 0.75;
  return Math.max(0.1, val);
}
// draft-slot value curve (roughly the classic trade chart): #1 ≈ 26, #32 ≈ 9.7, #64 ≈ 5, #128 ≈ 2.1, #224 ≈ 0.8
function slotValue(n) { return 18 * Math.exp(-n / 20) + 9 * Math.exp(-n / 90) + 0.3; }
function pickSlot(pk) {
  const d = state.draft;
  if (!d || pk.season !== d.year) return null;
  return d.order.find(o => o.pickId === pk.id) || null;
}
function pickValue(pk) {
  const slot = pickSlot(pk);
  if (slot) return slotValue(slot.pick); // the order is set: price the actual slot
  const base = [0, 14, 6.5, 3.5, 2.2, 1.4, 0.9, 0.6][pk.round];
  // earlier-projected picks (from bad teams) are worth more
  const rec = teamRecord(pk.orig);
  const gp = rec.w + rec.l + rec.t;
  const pct = gp ? (rec.w + rec.t * 0.5) / gp : 0.5;
  let mult = 1.45 - pct * 0.9; // 1.45 for winless, 0.55 for unbeaten
  if (pk.round === 1) mult = 1.9 - pct * 1.6;
  const futureDiscount = pk.season > state.season + 1 ? 0.85 : 1;
  return base * mult * futureDiscount;
}

// ---------- generation ----------
const TIER_Q = { starter: [0.8, 1.2], backup: [-1.2, 0.8], fringe: [-2.6, 0.8] };
function spotForGroup(group) {
  const opts = ROSTER_BUILD.filter(r => SPOTS[r[0]].g === group);
  return weightedPick(opts.map(r => r[0]), opts.map(r => r[1]));
}
// spotOrGroup: a spot key (e.g. 'EDGE') or a legacy group (e.g. 'DL', picks a spot within it)
function genVeteran(spotOrGroup, tier) {
  const spot = SPOTS[spotOrGroup] ? spotOrGroup : spotForGroup(spotOrGroup);
  const [qm, qs] = TIER_Q[tier] || TIER_Q.fringe;
  let q = gauss(qm, qs), age;
  if (tier === 'starter') age = clamp(Math.round(gauss(27.5, 3)), 22, 36);
  else if (tier === 'backup') age = clamp(Math.round(gauss(26, 3)), 22, 34);
  else age = clamp(Math.round(gauss(25, 3)), 21, 33);
  if (spot === 'QB' && tier === 'starter') { q = gauss(0.8, 1.6); age = clamp(Math.round(gauss(28.5, 4)), 22, 40); }
  if (spot === 'K' || spot === 'P') { q = gauss(1.6, 1.2); age = clamp(Math.round(gauss(29, 4)), 22, 40); }
  const p = genPlayer(spot, q, age);
  p.exp = Math.max(0, age - 22 + randInt(-1, 0));
  if (rand() < 0.85) {
    const round = clamp(Math.round(gauss((85 - p.ovr) / 5, 1.6)), 1, 7), pk = randInt(1, 32);
    p.draft = { year: START_SEASON - p.exp, round, pick: (round - 1) * 32 + pk, tid: randInt(0, 31) };
  }
  initPerception(p, 'vet');
  const yrs = randInt(1, 5), full = makeContract(p, marketValue(p) * (0.8 + rand() * 0.35), yrs);
  // a deal already in progress: the guarantees mostly front-loaded, some already paid out
  p.contract = Object.assign(full, { gtd: round2(full.gtd * rand()) });
  if (p.exp <= 3 && p.draft && p.draft.round === 1 && rand() < 0.6) Object.assign(p.contract, { rookie: true, yrs: Math.min(yrs, 4 - Math.min(3, p.exp)), opt5: 'pending' });
  return p;
}

// Prospect quality by position: positions with many prospects per starting job (QB, RB) would otherwise
// out-select the league's established talent level over a decade (measured in a 10-season drift test).
const DRAFT_Q_ADJ = { QB: -1.3, RB: -0.5, FB: -0.3, WRX: -0.6, WRZ: -0.6, SLOT: -0.6, TEY: -0.95, TEH: -0.95, LT: 0.05, LG: 0.05, C: 0.05, RG: 0.05, RT: 0.05,
  NT: -0.1, DT: -0.1, DE: -0.1, EDGE: -0.15, MLB: -0.55, WLB: -0.55, CB: -0.3, NCB: -0.3, FS: -0.3, SS: -0.3, K: 0, P: 0 };
function genProspect(draftYear) {
  const spot = weightedPick(Object.keys(DRAFT_SPOT_W), Object.values(DRAFT_SPOT_W));
  const p = genPlayer(spot, gauss(-0.45 + (DRAFT_Q_ADJ[spot] || 0), 1.4), randInt(21, 23));
  collegeReps(p);
  setTid(p, -2); // draft prospect
  p.exp = 0;
  initPerception(p, 'prospect'); // scouting fog: everyone (you and the AI) sees prospects through it
  p.draftYear = draftYear;
  return p;
}

// college usage: plenty of prospects lined up somewhere else too (a corner who played the slot, a guard who played tackle)
function collegeReps(p) {
  if (!p.cf) genComfort(p);
  const nb = (SPOT_NEIGHBORS[p.spot] || []).filter(s => !p.cf[s]);
  if (nb.length && rand() < 0.32) p.cf[pick(nb)] = Math.round(clamp(gauss(48, 18), 15, 88));
  if (rand() < 0.05) { // a true utility player: a second spot a step further away, on his side of the ball
    const side = SPOTS[p.spot].side, far = (SPOTS_BY_SIDE[side] || []).filter(s => !p.cf[s] && s !== 'K' && s !== 'P' && s !== 'QB');
    if (far.length) p.cf[pick(far)] = Math.round(clamp(gauss(38, 14), 12, 75));
  }
  if (typeof updateRatings === 'function') updateRatings(p);
}

// ---------- retirement ----------
function shouldRetire(p) {
  const shift = { RB: -2, QB: 3, K: 5, P: 5 }[p.pos] || 0;
  const a = p.age - shift;
  if (p.age >= 41) return true;
  let prob = 0;
  if (a >= 31) prob += (a - 30) * 0.1;
  if (p.ovr < 60 && p.age >= 29) prob += (60 - p.ovr) * 0.04;
  if (p.tid === -1 && p.age >= 29) prob += 0.25;
  if (p.ovr >= 85) prob *= 0.5;
  return rand() < prob;
}

// ---------- season stat helpers ----------
const STAT_KEYS = ['gp', 'gs', 'passA', 'passC', 'passY', 'passTD', 'passInt', 'sacked', 'passLng', 'rushA', 'rushY', 'rushTD', 'rushLng', 'fum',
  'tgt', 'rec', 'recY', 'recTD', 'recLng', 'tkl', 'sck', 'dint', 'pd', 'ff', 'fr', 'dtd', 'fgm', 'fga', 'fgLng', 'xpm', 'xpa', 'pnt', 'pntY'];
const MAX_KEYS = new Set(['passLng', 'rushLng', 'recLng', 'fgLng']);
function addStats(into, line) {
  for (const k in line) {
    if (k === 'tid') continue;
    if (MAX_KEYS.has(k)) into[k] = Math.max(into[k] || 0, line[k]);
    else into[k] = (into[k] || 0) + line[k];
  }
}
