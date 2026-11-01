'use strict';
// =====================================================================
//  GENERAL MANAGERS: the men who run the other clubs' rosters
//  A GM hires the head coach and makes the roster and money calls (draft, free agency, contracts, cuts, trades). He never touches
//  the coaching (who starts, play-calling): that is the staff's. Every club scouts as well as every other; what sets a GM apart
//  is what he is willing to do with the same read. Each trait runs 0-100 ("willingness to..."): 50 is the league's middle, and
//  both ends have a cost. Nothing here is shown as a number: a club's page carries his name, his career and a short summary.
//  Your club has no GM: you are it.
// =====================================================================
const GM_TRAITS = [
  // valuation (in every channel: draft, free agency, trades, re-signing)
  'upside', 'injury', 'nonPrem', 'character', 'need', 'workout',
  // draft
  'getGuy', 'tradeBack',
  // free agency
  'topDollar', 'payOwn',
  // trades
  'stars', 'sellVets', 'allIn',
  // money
  'spendCap', 'extendEarly', 'frontload', 'leverage',
  // direction
  'patience', 'tearDown',
  // hiring the head coach (offDef: 0 defense, 100 offense; proven: 0 hot coordinator, 100 established)
  'offDef', 'proven', 'qbDev', 'within', 'staffSpend',
  // firing the head coach
  'standards',
];
const GM_SD = 22;                 // wide spreads: most GMs lean hard on a handful of things and sit near the middle on the rest
const GM_HIRE_AGE = [46, 6, 35, 60]; // a first GM job: mean, spread, youngest, oldest
const GM_POOL_YRS = 4;            // a fired GM stays in the running this many offseasons
const GM_RETREAD = 0.4;           // the chance each of them is a candidate for a given opening (most openings go to a first-timer)
// ---------- judging a GM: one rule for every club, no owners ----------
const GM_JUDGE = {
  wpz: 1.55,        // wins a season per standard deviation of preseason roster strength (the league's own record, 20-season runs)
  dir: 4.6,         // a building club's early years: wins' worth of a standard deviation the roster climbs over the year (a gain that lasts)
  early: 3, late: 5, // judged against his roster through year 3; by year 5 the roster is his and the bar is absolute
  bar: 10,          // the absolute bar: a contender's wins
  po: 1, poWin: 1, title: 2, // playoffs: getting in, each win, the title (on top of the wins)
  qbNone: 1.5,      // a season with no answer at quarterback (from his 2nd year)
  qbBust: 2,        // a first-round quarterback he drafted who is not the answer three years on (once)
  hcFail: [2, 4],   // a head coach he hired is fired: the first, and any after
  decay: 0.6,       // last year's standing carries this much into this year's
  fire: 6, noise: 1, minYrs: 2, // let go below this standing (with a little noise in the call); never after a single season
};
const GM_BG = ['assistant general manager', 'director of player personnel', 'vice president of player personnel', 'director of college scouting', 'director of pro personnel'];

// how he is described: [high end, low end]; null where that end says nothing worth saying
const GM_TXT = {
  upside: ['betting on raw, high-ceiling talent', 'preferring safe, finished prospects'],
  injury: ['taking chances on players with injury histories', 'steering clear of injury risks'],
  nonPrem: ['spending big on running backs, linebackers and safeties', 'putting his money and picks into premium positions'],
  character: ['giving players with character questions a chance', 'insisting on clean character'],
  need: ['drafting for need', 'taking the best player on the board'],
  workout: ['falling for workout warriors', 'trusting the tape over the stopwatch'],
  getGuy: ['trading up for players he believes in', 'staying put on draft day'],
  tradeBack: ['trading down to stockpile picks', null],
  topDollar: ['paying top dollar for proven free agents', 'staying out of free agent bidding wars'],
  payOwn: ['paying to keep his own stars', 'letting his own stars walk rather than pay them'],
  stars: ['trading for established stars', 'building rather than trading for stars'],
  sellVets: ['moving veterans a year early', 'holding on to his veterans'],
  allIn: ['pushing his chips in when a window opens', 'refusing to mortgage the future'],
  spendCap: ['spending to the cap every year', 'keeping cap room in reserve'],
  extendEarly: ['extending young players early', 'waiting until contracts run out to negotiate'],
  frontload: ['front-loading contracts', null],
  leverage: ['borrowing against future caps to win now', 'keeping future caps clean'],
  patience: ['giving his coaches and young players time', 'making changes quickly'],
  tearDown: ['tearing rosters down to rebuild', 'patching rosters rather than starting over'],
  offDef: ['favoring offensive head coaches', 'favoring defensive head coaches'],
  proven: ['hiring established head coaches', 'hiring hot young coordinators'],
  qbDev: ['pairing young quarterbacks with a quarterback developer', null],
  within: ['promoting from within', 'looking outside the building for new coaches'],
  staffSpend: ['paying for a top coaching staff', 'running a lean coaching budget'],
  standards: ['holding his coaches to a high standard', null],
};

const G = id => state.gms && state.gms[id];
function gmOf(tid) { const t = T(tid); return t && t.gm != null ? G(t.gm) : null; }
// a club's lean on one trait; a club with no GM (yours) sits in the middle
function gmTrait(tid, k) { const g = gmOf(tid); return g ? g.t[k] : 50; }
// the season a GM is working toward: the one being played, or in the offseason the one ahead
function gmYear() { return state.phase === 'REG' || state.phase === 'PLAYOFFS' || state.phase === 'RECAP' ? state.season : state.season + 1; }

function genGM(opts = {}) {
  const [first, last] = randomName();
  const A = GM_HIRE_AGE, g = {
    id: state.nextGmid++, first, last, tid: -1,
    age: opts.age || clamp(Math.round(gauss(A[0], A[1])), A[2], A[3]),
    t: {}, bg: GM_BG[randInt(0, GM_BG.length - 1)], bgTid: randInt(0, state.teams.length - 1), hist: [],
  };
  for (const k of GM_TRAITS) g.t[k] = Math.round(clamp(gauss(50, GM_SD), 1, 99));
  state.gms[g.id] = g;
  return g;
}
function hireGM(tid, g, since) {
  const t = T(tid);
  g.tid = tid; g.since = since; delete g.out; g.s = 0; g.hcFails = 0; g.z = gmZ(tid);
  while (!g.hist.length && g.bgTid === tid) g.bgTid = randInt(0, state.teams.length - 1); // a first-timer comes from another club's front office
  t.gm = g.id;
}
// he leaves the job: the stint goes on his record
function vacateGM(g, why, yr = gmYear()) {
  const t = T(g.tid);
  if (t && t.gm === g.id) t.gm = null;
  g.hist.push({ tid: g.tid, from: g.since, to: yr - 1, why });
  g.tid = -1; g.out = yr; delete g.since;
}

// ---------- the judgment ----------
// where a club's roster stands in the league, in standard deviations, as its own staff reads it
function gmStrengths() { const o = {}; for (const t of state.teams) o[t.id] = clubStrength(t.id); return o; }
function gmZOf(str, tid) { const v = Object.values(str), m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1; return (str[tid] - m) / sd; }
function gmZ(tid) { return typeof clubStrength === 'function' && state.players && Object.keys(state.players).length && state.skV ? gmZOf(gmStrengths(), tid) : undefined; }
// at the opener: what every roster was expected to do this season
function gmSeasonStart() { state.gmPre = { s: state.season, str: gmStrengths() }; }
// one season's verdict on a GM, in wins: against what his roster should have done early on, against a contender's bar later
function gmSeasonScore(g, tid, yrs, now) {
  const J = GM_JUDGE, r = recOfTid(tid), gp = r.w + r.l + r.t || SEASON_WEEKS, w = (r.w + r.t * 0.5) * SEASON_WEEKS / gp;
  const pre = state.gmPre && state.gmPre.s === state.season ? state.gmPre.str : now, zPre = gmZOf(pre, tid), zNow = gmZOf(now, tid);
  const po = state.playoffs, seeds = po && po.seeds ? [...(po.seeds.AFC || []), ...(po.seeds.NFC || [])] : [];
  let poCredit = 0;
  if (seeds.includes(tid)) { const bye = po.seeds.AFC[0] === tid || po.seeds.NFC[0] === tid, e = po.elim[tid] !== undefined ? po.elim[tid] : 0; poCredit = J.po + J.poWin * Math.max(0, e - (bye ? 1 : 0)) + (po.champ === tid ? J.title : 0); }
  const qb = qbOutlookRead(tid).v, build = ['rebuild', 'rising'].includes(T(tid).stance) || qb === 'developing'; // building: the direction counts for more than the wins
  // a contender's roster slips every year as it ages: only a building club is judged on where its roster is heading
  const rel = (w - (SEASON_WEEKS / 2 + J.wpz * zPre)) * (build ? 0.5 : 1) + poCredit + (build && g.z !== undefined ? J.dir * (zNow - g.z) : 0);
  const abs = w - J.bar + poCredit, a = clamp((yrs - J.early) / (J.late - J.early), 0, 1);
  let sc = (1 - a) * rel + a * abs;
  if (yrs >= 2) sc -= qb === 'none' ? J.qbNone : qb === 'bridge' ? J.qbNone / 2 : 0; // a bridge is not the answer either
  g.busts = g.busts || [];
  for (const p of Object.values(state.players)) if (p.pos === 'QB' && p.draft && p.draft.tid === tid && p.draft.round === 1 && p.draft.year >= g.since && state.season - p.draft.year >= 3 && !g.busts.includes(p.id)) {
    if (p.tid === tid && qbOutlookRead(tid).by[p.id] === 'developing') continue; // a patient GM is still waiting on him
    const v = p.tid === tid ? viewOvr(p, tid) : perOvr(p); if (v < qbLines().fr) { g.busts.push(p.id); sc -= J.qbBust; } // not the answer
  }
  return sc;
}
// after the season: every GM's standing moves; the ones far enough below the line are let go
function gmJudge(yr) {
  const J = GM_JUDGE, now = gmStrengths(), out = [];
  for (const t of state.teams) {
    const g = gmOf(t.id); if (!g) continue;
    const yrs = state.season - g.since + 1;
    g.s = round2((g.s || 0) * J.decay + gmSeasonScore(g, t.id, yrs, now)); g.z = gmZOf(now, t.id);
    if (yrs >= J.minYrs && g.s + gauss(0, J.noise) < -J.fire) out.push(g);
  }
  for (const g of out) vacateGM(g, 'fired', yr);
  return out.length;
}
// a head coach is fired: if this GM hired him, it counts against the GM
function gmHcFired(tid, c) {
  const g = gmOf(tid); if (!g || !c || c.gmBy !== g.id) return;
  g.s = round2((g.s || 0) - GM_JUDGE.hcFail[Math.min(g.hcFails || 0, 1)]); g.hcFails = (g.hcFails || 0) + 1;
}
// a new GM and the head coach he inherits (until head-coach firing is built from his standards and patience): one who looks
// outside the building leans toward his own man. The coach's record is judged where coaches are fired, not again here.
function gmReviewHC(tid, predecessorFired) {
  const g = gmOf(tid), c = C(T(tid).hc); if (!g || !c) return;
  const p = (0.15 + 0.45 * (100 - g.t.within) / 100) * (predecessorFired ? 1 : 0.5);
  if (rand() < p) fireCoach(tid, 'HC');
}

// a new league (or a save from before GMs): every computer club already has one, some in the job a long while, some a few
// of them on their second job; and a few out-of-work GMs are waiting for the next opening
function seedGMs() {
  state.gms = {}; state.nextGmid = state.nextGmid || 1;
  const yr = gmYear();
  for (const t of state.teams) {
    t.gm = null;
    if (t.id === state.userTid) continue;
    const ten = randInt(1, 8), g = genGM();
    g.age = clamp(g.age + ten - 1, GM_HIRE_AGE[2], 80);
    hireGM(t.id, g, yr - ten + 1);
    const hc = C(t.hc); if (hc && rand() < Math.min(0.8, ten / 5)) hc.gmBy = g.id; // the longer he has been there, the likelier the coach is his hire
  }
  // a past stint somewhere else, ended before that club's current GM came in
  const prior = (g, end) => {
    const opts = state.teams.filter(t => t.id !== g.tid && (!gmOf(t.id) || gmOf(t.id).since > end)); if (!opts.length) return false;
    const len = randInt(2, 6);
    g.hist.push({ tid: opts[randInt(0, opts.length - 1)].id, from: end - len + 1, to: end, why: 'fired' });
    return true;
  };
  for (const g of Object.values(state.gms)) if (rand() < 0.25) prior(g, g.since - 1 - randInt(0, 3));
  for (let i = 0; i < 3; i++) { const g = genGM({ age: randInt(48, 64) }); if (prior(g, yr - randInt(1, 3))) g.out = g.hist[0].to + 1; else delete state.gms[g.id]; }
}

// each offseason (yr: the league year ahead): everyone a year older; some retire, and the out-of-work drop out of the running;
// empty chairs are filled
function gmOffseason(yr = gmYear()) {
  if (!state.gms) return;
  const had = Object.fromEntries(state.teams.map(t => [t.id, t.gm]));
  gmJudge(yr);
  const fired = new Set(state.teams.filter(t => had[t.id] != null && t.gm == null).map(t => t.id));
  for (const g of Object.values(state.gms)) {
    g.age++;
    const go = g.age >= 80 ? 0.5 : g.age >= 75 ? 0.3 : g.age >= 70 ? 0.15 : g.age >= 65 ? 0.08 : 0; // most are done in their late 60s; a few keep going well past 70
    if (g.tid >= 0) { if (rand() < go) { vacateGM(g, 'retired', yr); delete state.gms[g.id]; } }
    else if (rand() < go || yr - (g.out || 0) > GM_POOL_YRS) delete state.gms[g.id];
  }
  fillGMVacancies(yr);
  for (const t of state.teams) if (t.gm != null && t.gm !== had[t.id] && had[t.id] != null) gmReviewHC(t.id, fired.has(t.id)); // the new man looks at the coach he inherits
}
// an opening goes to one of the out-of-work GMs or to a first-timer from another club's front office, as it falls
// (a GM let go this offseason sits out a year before he is a candidate anywhere)
function fillGMVacancies(yr = gmYear()) {
  for (const t of shuffle(state.teams.slice())) {
    if (t.id === state.userTid || gmOf(t.id)) continue;
    const pool = Object.values(state.gms).filter(g => g.tid < 0 && g.out < yr && !g.hist.some(h => h.tid === t.id && h.why === 'fired') && rand() < GM_RETREAD);
    const fresh = []; for (let i = 0; i < 4; i++) fresh.push(genGM());
    const all = [...pool, ...fresh], pick = all[randInt(0, all.length - 1)];
    for (const g of fresh) if (g !== pick) delete state.gms[g.id];
    hireGM(t.id, pick, yr);
  }
}

// ---------- how a club's page describes him ----------
function gmName(g) { return g.first + ' ' + g.last; }
// what he is known for: his two or three strongest leanings, in words
function gmSummary(g) {
  const lean = GM_TRAITS.map(k => { const v = g.t[k], hi = v >= 50, txt = GM_TXT[k] && GM_TXT[k][hi ? 0 : 1]; return { k, d: Math.abs(v - 50), txt }; })
    .filter(x => x.txt && x.d >= 18).sort((a, b) => b.d - a.d).slice(0, 3);
  if (!lean.length) return 'A by-the-book executive with no strong leanings.';
  const l = lean.map(x => x.txt), list = l.length === 1 ? l[0] : l.length === 2 ? l.join(' and ') : `${l[0]}, ${l[1]} and ${l[2]}`;
  return `Known for ${list}.`;
}
function gmCareer(g) {
  const yrs = gmYear() - g.since + 1, prev = g.hist.filter(h => h.to >= h.from);
  const now = `In his ${ordinal(yrs)} season.`;
  if (!prev.length) return `${now} First GM job, formerly ${g.bg} of the ${teamName(g.bgTid)}.`;
  const l = prev.map(h => `the ${teamName(h.tid)} (${h.from}${h.to > h.from ? '–' + h.to : ''})`);
  return `${now} Previously GM of ${l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l[0]}.`;
}
