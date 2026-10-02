'use strict';
// =====================================================================
//  PERCEPTION — what the league believes about each player (DESIGN §1, §8)
//  True ratings stay hidden. Everyone (you and the AI) works from:
//    scouting estimate b  — tracks the truth with a lag; sharpens with snaps (film) and experience
//    hype h               — volume stats, team success, awards, contract years, combine numbers
//    growth estimate g    — how much better the scouts think he'll get
//  Consensus value = b + h. AI teams add their own scouting noise; every team knows its own players
//  better (coaches see practice). The engine itself always plays the truly better player.
// =====================================================================
let PER_TH = null; // tier thresholds by position group (consensus values of rostered players)

// deterministic per-(player, team, season) noise so views don't flicker between screens
function hashGauss(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  const nx = () => { h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return ((h >>> 0) % 1000000 + 0.5) / 1000000; };
  const u = nx(), v = nx();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// growth the scouts expect over the next year (league-average aging; individuals surprise)
function scoutPeak(p) { return p.pos === 'QB' ? 30.7 : p.pos === 'K' || p.pos === 'P' ? 31.7 : p.pos === 'RB' ? 26.7 : 27.5; }
function expDelta(p) {
  const pk = scoutPeak(p);
  if (p.age < pk - 0.5) return Math.min(p.per.g, p.per.g / Math.max(1, pk - p.age) * 1.35);
  return -clamp((p.age + 1 - pk) * 0.42, 0, 3);
}

function initPerception(p, kind) {
  const prospect = kind === 'prospect';
  const conf = prospect ? 0.2 : clamp(0.3 + (p.exp || 0) * 0.11, 0.3, 0.9);
  const sdB = prospect ? 5.5 : 1 + 4.5 * (1 - conf);
  const sdG = p.age <= 23 ? 6 : p.age <= 26 ? 3.5 : 1.5;
  let h0 = gauss(0, 1.1);
  if (prospect) { // combine warriors: workout numbers move the needle more than they should
    const t = TEMPLATE_A[p.spot] || {};
    h0 = clamp(((p.a.spd - (t.spd || 60)) + (p.a.bur - (t.bur || 60))) * 0.07 + gauss(0, 0.7), -1.5, 2.5);
  }
  p.per = { b: p.ovr + gauss(0, sdB), g: Math.max(0, p.pot - p.ovr + gauss(0, sdG)), h0, h: h0, conf };
}
function ensurePerception() { for (const id in state.players) { const p = state.players[id]; if (!p.per && p.a) initPerception(p, p.tid === -2 ? 'prospect' : 'vet'); } }

// ---------- the values everyone uses ----------
function perOvr(p) { return p.per ? p.per.b + p.per.h : p.ovr; }
// how team tid sees him (null/undefined = league consensus)
function viewOvr(p, tid) {
  if (!p.per || tid == null || tid < 0) return perOvr(p);
  let v = perOvr(p);
  if (tid === p.tid) v = 0.5 * v + 0.5 * p.ovr; // your coaches see him every day
  else if (tid !== state.userTid) v += hashGauss(p.id, tid + 1, state.season) * (0.8 + 2.5 * (1 - p.per.conf));
  return v;
}
function viewGrowth(p, tid) {
  if (!p.per) return Math.max(0, p.pot - p.ovr);
  return tid != null && tid === p.tid ? 0.5 * p.per.g + 0.5 * Math.max(0, p.pot - p.ovr) : p.per.g;
}
function viewCeil(p, tid) { return viewOvr(p, tid) + viewGrowth(p, tid); }
// what the user's front office sees
function uOvr(p) { return viewOvr(p, state.userTid); }
function uCeil(p) { return viewCeil(p, state.userTid); }

// ---------- labels ----------
const ROTATION_GROUPS = new Set(['RB', 'WR', 'DL', 'CB']);
const TIER_ORDER = ['Elite', 'All-Pro', 'Starter', 'Rotation', 'Backup', 'Depth', 'Project', 'Fringe', 'Washed'];
const UPSIDE_ORDER = ['Elite', 'High-End Starter', 'Solid Starter', 'Borderline Starter', 'Strong Depth', 'Decent Depth', 'Special Teamer', 'Limited Upside'];
function computeThresholds() {
  const by = {};
  for (const id in state.players) { const p = state.players[id]; if (p.tid >= 0 && p.a) (by[p.pos] = by[p.pos] || []).push(perOvr(p)); }
  PER_TH = {};
  for (const g in by) {
    const v = by[g].sort((a, b) => b - a), n = v.length, N = Math.min(n, (STARTERS[g] || 1) * 32);
    const at = r => v[clamp(Math.round(r) - 1, 0, n - 1)];
    PER_TH[g] = { elite: at(Math.max(1, n * 0.03)), allpro: at(Math.max(2, n * 0.1)), hi: at(N * 0.3), mid: at(N * 0.6), starter: at(N), rotation: at(N * 1.75), depth: at(N * 2.6), vals: v.slice().reverse(), N };
  }
}
function th(p, g) { if (!PER_TH) computeThresholds(); return PER_TH[g || p.pos] || PER_TH.WR; }
function tierOf(p, v, g) {
  const t = th(p, g);
  if (v === undefined) v = uOvr(p);
  if (v >= t.elite) return 'Elite';
  if (v >= t.allpro) return 'All-Pro';
  if (v >= t.starter) return 'Starter';
  if (v >= t.rotation) return ROTATION_GROUPS.has(g || p.pos) ? 'Rotation' : 'Backup';
  if (v >= t.depth) return 'Depth';
  return p.age <= 25 ? 'Project' : p.age <= 29 ? 'Fringe' : 'Washed';
}
function upsideOf(p, c) {
  const t = th(p);
  if (c === undefined) c = uCeil(p);
  if (c >= t.elite) return 'Elite';
  if (c >= t.hi) return 'High-End Starter';
  if (c >= t.mid) return 'Solid Starter';
  if (c >= t.starter) return 'Borderline Starter';
  if (c >= t.rotation) return 'Strong Depth';
  const ath = (p.a.spd + p.a.bur + p.a.agi) / 3;
  if (['RB', 'WR', 'TE', 'LB', 'CB', 'S'].includes(p.pos) && ath >= 72) return 'Special Teamer'; // a role on coverage units
  if (c >= t.depth) return 'Decent Depth';
  return 'Limited Upside';
}
function confLabel(p) { const c = p.per ? p.per.conf : 1; return c >= 0.75 ? 'High' : c >= 0.45 ? 'Medium' : 'Low'; }
function buzzLabel(p) {
  if (!p.per) return null;
  const b = p.per.h + hashGauss(p.id, 7, state.season) * 0.8;
  return b >= 3 ? 'Media darling' : b >= 2 ? 'Getting buzz' : null;
}

// ---------- scouting phrases (2–3 per player, from what scouts think they see) ----------
const TRAIT_TXT = {
  spd: ['Rare long speed', 'Lacks top-end speed'], bur: ['Explosive first step', 'Slow to accelerate'], agi: ['Fluid change of direction', 'Stiff hips'],
  str: ['Powerful at the point of attack', 'Gets pushed around'], siz: ['Prototype size', 'Undersized'],
  sacc: ['Accurate underneath', 'Scattershot short accuracy'], dacc: ['Drops it in the bucket deep', 'Erratic deep ball'], arm: ['Cannon arm', 'Limited arm'],
  proc: ['Quick processor', 'Slow through progressions'], dec: ['Smart with the football', 'Forces throws'], pkt: ['Calm in the pocket', 'Panics under pressure'],
  tor: ['Dangerous on the move', 'Struggles outside the pocket'], vis: ['Patient, sees the cutback', 'Misses running lanes'], elu: ['Makes defenders miss', 'Goes down easy in space'],
  bal: ['Runs through contact', 'Goes down on first contact'], bsec: ['Secure with the ball', 'Fumble issues'], rte: ['Polished route runner', 'Raw route runner'],
  rel: ['Wins off the line', 'Struggles vs. press'], hnd: ['Reliable hands', 'Concentration drops'], cth: ['Wins 50-50 balls', 'Loses contested catches'],
  pbk: ['Sturdy pass protector', 'Leaky in pass protection'], rbk: ['Road grader', 'Soft run blocker'], bawr: ['Picks up stunts and blitzes', 'Misses assignments'],
  prsh: ['Refined pass-rush plan', 'Limited rush repertoire'], shed: ['Sheds blocks', 'Stays blocked'], tkl: ['Sure tackler', 'Misses tackles'],
  strp: ['Punches the ball out', null], prec: ['Diagnoses quickly', 'Bites on play-action'], man: ['Sticky in man coverage', 'Exposed in man'],
  zone: ['Instinctive in zone', 'Lost in zone'], prs: ['Physical at the line', 'Soft at the line'], bsk: ['Ball hawk', 'Rarely finds the ball'],
  kcon: ['Metronome accuracy', 'Inconsistent'], krng: ['Big leg', 'Limited range'], kfal: ['Holds accuracy from distance', 'Fades from distance'], ktrj: ['Clean trajectory', 'Low trajectory'],
  pdis: ['Booming leg', 'Short punter'], pplc: ['Pins it inside the 10', 'Erratic placement'], phng: ['Elite hang time', 'Low hang time'], pspn: ['Controls the bounce', 'Touchback-prone'],
};
// ---------- star rating: position-relative ability, weighted toward current form (½ to 5 stars) ----------
function pctInGroup(p, v) {
  const t = th(p), a = t.vals || [];
  if (!a.length) return 0.5;
  let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; }
  return lo / a.length;
}
function starsOf(p) {
  if (!p.a || !p.per) return null;
  // judged against the starters at his position: a league-average starter is ~3 stars
  const t = th(p), base = clamp(0.5 + (uOvr(p) - t.starter) / Math.max(4, t.elite - t.starter) * 0.5, 0, 1);
  let score = base;
  const f = (p.form || []).filter(x => x !== null);
  if (f.length) {
    let s = 0, w = 0; f.forEach((g, i) => { const k = 1 + i * 0.35; s += g * k; w += k; });
    const formPct = clamp((s / w - 40) / 45, 0, 1); // 40 grade ≈ bottom, 85 ≈ top
    const wt = 0.45 * Math.min(1, f.length / 4);
    score = base * (1 - wt) + formPct * wt;
  }
  return Math.max(0.5, Math.round(score * 10) / 2);
}
// recent game grades (any game he played real snaps in)
function recordForm(box) {
  if (!box.adv) return;
  for (const pid in box.adv) {
    const p = P(pid), l = box.stats[pid];
    if (!p || !l || (l.snp || 0) < 12) continue;
    const g = overallGrade(box.adv[pid], p.spot);
    if (g === null || g === undefined) continue;
    p.form = [...(p.form || []).slice(-5), g];
  }
}
// ---------- strengths & weaknesses (what scouts think they see; fogged by confidence) ----------
function scoutTraits(p) {
  if (!p.a) return { str: [], weak: [] };
  const w = SPOTS[p.spot].w, t = TEMPLATE_A[p.spot] || {}, fog = p.per ? 1 - p.per.conf : 0.3;
  const keys = Object.keys(w).filter(k => TRAIT_TXT[k] && t[k] !== undefined);
  const mw = keys.reduce((s, k) => s + w[k], 0) / Math.max(1, keys.length);
  // scouts talk about what matters at the position: deviation scaled by how much the trait counts there
  const sc = keys.map(k => {
    // young players are described by their tools (where they're headed), not just today's polish
    const grow = k !== 'siz' && p.age <= 25 && p.per ? p.per.g * 0.7 : 0;
    const seen = (k === 'siz' ? p.a.siz : p.a[k]) + grow + hashGauss(p.id, k.charCodeAt(0) * 31 + k.charCodeAt(1), 3) * 7 * fog;
    return [k, (seen - t[k]) * Math.min(1.6, w[k] / mw)];
  });
  const str = sc.filter(x => x[1] >= 5).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => TRAIT_TXT[x[0]][0]);
  const weak = sc.filter(x => x[1] <= -5 && TRAIT_TXT[x[0]][1]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(x => TRAIT_TXT[x[0]][1]);
  return { str, weak };
}
function traitTags(p) {
  const { str, weak } = scoutTraits(p);
  return [...str.slice(0, 2), ...weak.slice(0, str.length ? 1 : 2)];
}

// ---------- updates ----------
// production that drives hype, by group (season totals: volume, not efficiency)
function hypeMetric(p, s) {
  switch (p.pos) {
    case 'QB': return (s.passY || 0) + (s.passTD || 0) * 25 + (s.rushY || 0) * 0.5;
    case 'RB': return (s.rushY || 0) + (s.recY || 0) + ((s.rushTD || 0) + (s.recTD || 0)) * 50;
    case 'WR': case 'TE': return (s.recY || 0) + (s.recTD || 0) * 50;
    case 'DL': return (s.sck || 0) * 30 + (s.tfl || 0) * 8 + (s.tkl || 0);
    case 'LB': return (s.tkl || 0) + (s.sck || 0) * 15 + (s.dint || 0) * 25;
    case 'CB': case 'S': return (s.dint || 0) * 30 + (s.pd || 0) * 6 + (s.tkl || 0) * 0.5;
    case 'K': return (s.fgm || 0);
    default: return 0;
  }
}
// in-season hype from season-to-date production & team success
function seasonHype() {
  const recs = standings(), by = {};
  for (const id in state.players) { const p = state.players[id]; if (p.tid >= 0 && p.per && p.stats.gs) (by[p.pos] = by[p.pos] || []).push(p); }
  const hS = {};
  for (const g in by) {
    const l = by[g].map(p => [p, hypeMetric(p, p.stats)]).sort((a, b) => a[1] - b[1]);
    l.forEach(([p], i) => { hS[p.id] = (l.length > 1 ? i / (l.length - 1) : 0.5) - 0.5; });
  }
  for (const id in state.players) {
    const p = state.players[id];
    if (!p.per) continue;
    let h = p.per.h0;
    if (p.tid >= 0 && p.stats.gp) {
      const r = recs[p.tid], gp = r.w + r.l + r.t, wt = Math.min(1, gp / 10);
      let stat = (hS[p.id] !== undefined ? hS[p.id] : -0.3) * 3.2 * wt;
      if (p.contract && p.contract.yrs <= 1 && stat > 0) stat *= 1.4; // contract-year spike
      const startShare = (p.stats.gs || 0) / Math.max(1, p.stats.gp);
      const team = gp ? ((r.w + r.t * 0.5) / gp - 0.5) * 3 * Math.min(1, gp / 6) * startShare : 0;
      h += stat + team;
    }
    p.per.h = clamp(h, -5, 5);
  }
}
// one game of film: everyone who played gets a little better understood
function filmUpdate(box) {
  for (const pid in box.stats) {
    const p = P(pid), l = box.stats[pid];
    if (!p || !p.per || !l.snp) continue;
    const share = p.spot === 'K' || p.spot === 'P' ? 0.5 : clamp(l.snp / 64, 0, 1);
    const signal = p.ovr + gauss(0, 4);
    p.per.b += 0.035 * share * (signal - p.per.b);
    p.per.conf = Math.min(0.95, p.per.conf + 0.012 * share);
  }
}
function refreshPerception() { seasonHype(); computeThresholds(); }

// end of season: film review, awards, hype carries over at half strength
function seasonPerception(awards) {
  const bonus = {};
  for (const k in awards) { const a = awards[k]; if (a && a.pid) bonus[a.pid] = (bonus[a.pid] || 0) + (/roy/i.test(k) ? 1 : 2); }
  for (const id in state.players) {
    const p = state.players[id];
    if (!p.per) continue;
    const share = clamp((p.stats.snp || 0) / 900, 0, 1);
    p.per.b += 0.2 * share * (p.ovr + gauss(0, 2) - p.per.b);
    p.per.conf = Math.min(0.95, p.per.conf + 0.04);
    p.per.h0 = clamp(0.5 * p.per.h + (bonus[p.id] || 0), -4, 4.5);
    p.per.h = p.per.h0;
  }
}
// offseason: scouts bake in normal aging; the surprise (breakout, cliff) stays hidden until camp & film
function offseasonExpectation(p) {
  if (!p.per) return;
  p.per.pre = p.ovr;
  p.per.exp = expDelta(p);
}
function offseasonApply(p) {
  if (!p.per || p.per.exp === undefined) return;
  const e = p.per.exp;
  p.per.b += e;
  p.per.g = Math.max(0, p.per.g - Math.max(0, e));
  p.per.g += 0.2 * (Math.max(0, p.pot - p.ovr) - p.per.g); // re-evaluated with another year of tape
  if (p.age >= scoutPeak(p) + 1) p.per.g *= 0.5;
}

// ---------- training camp (~70% reliable) ----------
const CAMP_UP = ['is the talk of camp — noticeably quicker and more decisive.', 'added muscle and is winning reps against starters.', 'has coaches raving about his progress.', 'looks like a different player this summer.', 'has been the most impressive player in team drills.'];
const CAMP_DOWN = ['appears to have lost a step.', 'has struggled through camp.', 'has coaches quietly concerned.', 'is getting beat more often in team drills.', 'looks a beat slow this summer.'];
const CAMP_ROOKIE_UP = ['has been a revelation as a rookie.', 'is already pushing for a starting job.'];
const CAMP_ROOKIE_DOWN = ['is finding the jump to the pros difficult.', 'looks overwhelmed early in camp.'];
function campReports(year) {
  const reports = [], truths = [];
  for (const id in state.players) {
    const p = state.players[id];
    if (!p.per || p.tid < 0) continue;
    let s = null, rookie = false;
    if (p.per.pre !== undefined) s = (p.ovr - p.per.pre) - p.per.exp;
    else if (p.exp === 0) { s = (p.ovr - p.per.b) * 0.4; rookie = true; } // only the big scouting misses show up in camp
    delete p.per.pre; delete p.per.exp;
    if (s === null) continue;
    if (Math.abs(s) >= 2.5) truths.push([p, s, rookie]);
  }
  // true signals get noticed 70% of the time; false alarms make up ~30% of what gets reported
  const told = truths.filter(() => rand() < 0.7);
  const nFalse = Math.round(told.length * 0.43);
  const pool = Object.values(state.players).filter(p => p.per && p.tid >= 0 && !truths.some(t => t[0] === p));
  for (let i = 0; i < nFalse && pool.length; i++) {
    const p = pool.splice(randInt(0, pool.length - 1), 1)[0];
    told.push([p, rand() < 0.55 ? 2.5 : -2.5, p.exp === 0, true]);
  }
  for (const [p, s, rookie, fake] of told) {
    const up = s > 0;
    p.per.b += fake ? (up ? 1.2 : -1.2) : s * 0.5;
    p.per.h += up ? 0.5 : -0.3; p.per.h0 += up ? 0.5 : -0.3;
    const txt = pick(rookie ? (up ? CAMP_ROOKIE_UP : CAMP_ROOKIE_DOWN) : (up ? CAMP_UP : CAMP_DOWN));
    reports.push({ pid: p.id, tid: p.tid, up, text: `${p.lbl} ${pname(p)} ${txt}` });
  }
  reports.sort((a, b) => (b.tid === state.userTid) - (a.tid === state.userTid));
  state.camp = { season: year || state.season, reports };
  for (const r of reports) {
    const p = P(r.pid);
    if (r.tid === state.userTid || ['Elite', 'All-Pro'].includes(tierOf(p, perOvr(p)))) addNews(`Camp: ${r.text}`, [r.tid], 'camp');
  }
  computeThresholds();
}

// ---------- breakouts & disappointments (perception moves over a season) ----------
function seasonStartSnapshot() { for (const id in state.players) { const p = state.players[id]; if (p.per) p.per.s0 = perOvr(p); } }
function seasonMovers() {
  const moved = Object.values(state.players).filter(p => p.per && p.tid >= 0 && p.per.s0 !== undefined && (p.stats.gs || 0) >= 6)
    .map(p => [p, perOvr(p) - p.per.s0]);
  const up = moved.filter(x => x[1] >= 4).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const down = moved.filter(x => x[1] <= -4).sort((a, b) => a[1] - b[1]).slice(0, 3);
  for (const [p] of up) addNews(`Breakout season: ${p.lbl} ${pname(p)} (${T(p.tid).abbr}) is now viewed as ${/^[AEIOU]/.test(tierOf(p, perOvr(p))) ? 'an' : 'a'} ${tierOf(p, perOvr(p))}.`, [p.tid], 'prog');
  for (const [p] of down) addNews(`Disappointing year: ${p.lbl} ${pname(p)} (${T(p.tid).abbr}) has slipped to ${tierOf(p, perOvr(p))}.`, [p.tid], 'prog');
  for (const id in state.players) { const p = state.players[id]; if (p.per) delete p.per.s0; }
}
