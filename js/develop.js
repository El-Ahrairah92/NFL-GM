'use strict';
// =====================================================================
//  DEVELOPMENT — growth is earned, not scheduled (DESIGN §24)
//  Every young player has growth available each year in four areas: explosive (E), power (P),
//  technique (T) and mental (M). The body matures in the offseason (strength staff + work habits).
//  Technique and mental growth are paid out through the year at checkpoints, scaled by what he
//  earned: game snaps, practice, his position coach, first-team reps. Half of what he does not earn
//  is gone for good. Rare surges, collapses and late bloomers sit on top; decline is per player.
// =====================================================================
const DEV = {
  off: 0.40, camp: 0.15, season: 0.45, // share of the year's technique/mental growth on offer in each period
  leak: 0.42,                          // share of unearned growth that is lost
  scale: 1.04,                         // a starter with a good coach and good habits earns a little over 100%
  room: 1.45, roomP: 1.2,               // growth on offer is larger than what a typical player realises (skills / body)
  expect: 0.69, expectP: 0.83,        // ...so this is what the scouts assume he keeps of what is left
  swing: 1.8,                          // good year / bad year, in rating points per skill area
  surge: 0.0030, collapse: 0.020, late: 0.012, tail: 0.12,
  front: [1.5, 1.3, 1.1],               // the first seasons in the league are when most of it comes
  gameSnaps: 62,
};
const CP_WEEKS = [4, 8, 12, 16, 18]; // regular-season checkpoints (after these weeks)
const TRACK_LABEL = { surge: 'Breaking out', ahead: 'Ahead of schedule', on: 'On track', behind: 'Behind schedule', stalled: 'Stalled', late: 'Late bloomer', steady: 'Holding steady', slip: 'Lost a step', fall: 'Falling off', done: 'Finished product' };
const TRACK_CLS = { surge: 'good', ahead: 'good', on: '', behind: 'warn', stalled: 'bad', late: 'good', steady: '', slip: 'warn', fall: 'bad', done: '' };

// ---------- when a player starts to decline, and how ----------
const DECL_SPOT = { QB: 33, RB: 27, FB: 29, WRX: 29, WRZ: 29, SLOT: 29, TEY: 30, TEH: 30, LT: 31, LG: 31, C: 31, RG: 31, RT: 31, NT: 30, DT: 30, DE: 29.5, EDGE: 29,
  MLB: 29, WLB: 29, CB: 28, NCB: 28, FS: 30, SS: 30, K: 36, P: 36 };
const DECL_OFFSET = { E: -1, T: 0, P: 1, M: 3 }; // the legs go first, the mind last
const DECL_RATE = { g: 1.9, c: 1.9, a: 1.2 };
const CLIFF_EXTRA = { E: 2.6, T: 2.2, P: 1.2, M: 0.6 }; // a cliff ager loses this much on top, every year once it starts
function genDecline(p) {
  const norm = DECL_SPOT[p.spot] || 29, dur = (p.h && p.h.dur) || 55;
  p.dc = { a: round1(clamp(norm + gauss(0, 1.5) + (dur - 55) / 45, norm - 2.5, norm + 5)), t: weightedPick(['g', 'c', 'a'], [65, 20, 15]) };
  return p.dc;
}
function declStart(p, g) { const dc = p.dc || genDecline(p); return dc.a + DECL_OFFSET[g] + (dc.t === 'a' ? 3 : 0); }
function declRate(p) { return DECL_RATE[(p.dc || genDecline(p)).t] * clamp(1.16 - (((p.h && p.h.work) || 55) / 350), 0.88, 1.15); }
// growth window for an area (a late bloomer's window reopens)
function growPeak(p, g) { const pk = peakAge(p, g); return (g === 'T' || g === 'M') && p.lateTo ? Math.max(pk, p.lateTo) : pk; }
// total points an area has lost by a given age (used to age a generated veteran)
function declineTotal(p, g, age) {
  const ds = declStart(p, g); let d = 0;
  for (let y = 1; y <= Math.floor(age - ds); y++) d += declineAt(g, y) * declRate(p) + (p.dc.t === 'c' ? CLIFF_EXTRA[g] : 0);
  return d;
}

// unbiased fractional change to every attribute in an area (ratings are whole numbers)
function shiftSoft(p, g, delta) {
  if (!delta) return;
  const s = delta < 0 ? -1 : 1, m = Math.abs(delta), whole = Math.floor(m), frac = m - whole;
  for (const k in p.a) {
    if (!ATTRS[k] || ATTRS[k][2] !== g) continue;
    p.a[k] = clamp(p.a[k] + s * (whole + (rand() < frac ? 1 : 0)), 10, 99);
  }
}
// pay out some of the year's growth: what he earns goes on his ratings, part of the rest is lost
function payGrowth(p, g, amount, earn) {
  if (amount <= 0 || !(p.grow[g] > 0)) return 0;
  amount = Math.min(amount, p.grow[g]);
  const got = Math.min(p.grow[g], amount * earn);
  p.grow[g] = round2(Math.max(0, p.grow[g] - got - DEV.leak * Math.max(0, amount - got)));
  shiftSoft(p, g, got);
  return got;
}

// ---------- what a player earns (each input runs about 0.2 to 1.2; an average one is near 0.7) ----------
function devTid(p) { return p.tid >= 0 ? p.tid : p.tid === -3 && p.psTid != null ? p.psTid : -1; }
function nCoach(p) {
  const tid = devTid(p);
  if (tid < 0) return 0.35; // working out on his own
  const v = ROOM_COACH[p.pos] ? roomDevVal(tid, p.pos) : knob(C(T(tid).stc), 'dSPEC');
  return clamp(0.15 + (v - 35) / 38, 0.15, 1.3); // a great teacher is worth a lot more than a poor one
}
function nWork(p) { return clamp(0.25 + (((p.h && p.h.work) || 55) - 30) / 55, 0.2, 1.2); }
function nStrength(p) { const tid = devTid(p); if (tid < 0) return 0.45; const sc = C(T(tid).sc); return clamp(0.25 + ((knob(sc, 'dPOW') + knob(sc, 'dSPD')) / 2 - 35) / 50, 0.2, 1.2); }
function pracAvg(p) {
  if (p.pa && p.pa[1]) return p.pa[0] / p.pa[1];
  const h = (p.pracH || []); if (h.length) return h.reduce((s, x) => s + x, 0) / h.length;
  const c = p.h || {}; return 46 + ((c.work || 55) - 55) * 0.42 + ((c.disc || 55) - 55) * 0.28; // what his habits would produce
}
function nPractice(p) { return devTid(p) < 0 ? 0.4 : clamp(0.72 + (pracAvg(p) - 46) / 42, 0.2, 1.2); }
function nReps(p) { return p.tid < 0 ? 0.15 : [1, 0.5, 0.15][p.prac ? p.prac.t || 0 : 2]; }
// share of his unit's snaps since the last checkpoint: 60% is full credit, straight line below that
function snapShare(p, weeks) { return p.tid < 0 ? 0 : clamp((((p.stats && p.stats.snp) || 0) - (p.cs || 0)) / (Math.max(1, weeks) * DEV.gameSnaps), 0, 1); }
function nSnaps(p, weeks) {
  if (p.tid < 0) return 0;
  if (p.pos === 'K' || p.pos === 'P') return p.stats && p.stats.gp ? 1 : 0;
  let c = clamp(snapShare(p, weeks) / 0.6, 0, 1);
  const f = (p.form || []).filter(x => x !== null && x !== undefined);
  if (c > 0 && f.length >= 2) c *= 0.7 + 0.3 * clamp((f.reduce((s, x) => s + x, 0) / f.length - 35) / 25, 0, 1); // badly overmatched: the snaps teach less
  return c;
}
// exhibition snaps count for everyone, more for players in their first three years
function nPreSnaps(p) {
  if (p.tid < 0 || !p.preS) return 0;
  if (p.pos === 'K' || p.pos === 'P') return 1;
  return clamp(p.preS.snp / (PRESEASON_GAMES * DEV.gameSnaps) / 0.3, 0, 1) * (p.exp <= 2 ? 1 : 0.4);
}
function earnRate(p, g, kind, weeks) {
  let e;
  if (g === 'E' || g === 'P') e = 0.35 * nWork(p) + 0.65 * nStrength(p);
  else if (kind === 'off') e = 0.6 * nCoach(p) + 0.4 * nWork(p);
  else {
    const sn = kind === 'camp' ? nPreSnaps(p) : nSnaps(p, weeks);
    e = g === 'M' ? 0.35 * sn + 0.10 * nReps(p) + 0.30 * nCoach(p) + 0.25 * nPractice(p) : 0.30 * sn + 0.40 * nCoach(p) + 0.30 * nPractice(p);
  }
  return clamp(e * DEV.scale, 0.1, 1.25);
}

// ---------- the offseason: the body matures, the first share of skill growth, aging, rare events ----------
function progressPlayer(p) {
  const old = p.ovr, age = p.age;
  if (!p.dc) genDecline(p);
  if (!p.h.work) ensureCharacter(p);
  if (p.pos === 'RB' && p.dcW !== state.season) { const c = (p.career || [])[p.career.length - 1]; if (c && (c.rushA || 0) >= 280) { p.dc.a = round1(p.dc.a - 0.35); p.dcW = state.season; } } // heavy seasons add up
  const tid = devTid(p), dev = tid >= 0 ? teamDev(tid, p.pos) : null;
  // rare events first: they change what is available
  let ev = null;
  const left = (p.grow.T || 0) + (p.grow.M || 0);
  if (age <= 25 && rand() < DEV.collapse) { shiftSoft(p, 'T', -Math.max(2, gauss(5.5, 1.5))); shiftSoft(p, 'M', -Math.max(1, gauss(3.5, 1.2))); p.grow.T = round2(p.grow.T * 0.5); p.grow.M = round2(p.grow.M * 0.5); ev = 'collapse'; }
  else if (age >= 26 && age <= 30 && left < 1.5 && age < declStart(p, 'T')) {
    const pc = tid >= 0 ? posCoach(tid, p.pos) : null;
    const chance = DEV.late * (pc && (pc.yrs || 0) <= 1 && pc.dev >= 60 ? 1.8 : 1);
    if (rand() < chance) { p.grow.T = round2((p.grow.T || 0) + randInt(3, 6)); p.grow.M = round2((p.grow.M || 0) + randInt(2, 4)); p.lateTo = age + 3; ev = 'late'; }
  }
  const yr = {};
  for (const g of AGE_GROUPS) {
    const pk = growPeak(p, g), ds = declStart(p, g);
    if (age >= ds) {
      const y = Math.floor(age - ds) + 1, mf = dev ? (g === 'E' || g === 'P' ? clamp(1.25 - (knob(C(T(tid).sc), 'recov') || 50) * 0.005, 0.8, 1.25) : 1) : 1.1;
      shiftSoft(p, g, -(declineAt(g, y) * declRate(p) + (p.dc.t === 'c' ? CLIFF_EXTRA[g] : 0)) * mf * Math.max(0.3, gauss(1, 0.3)));
      p.grow[g] = 0;
    } else if (age < pk - 0.5 && p.grow[g] > 0.05) {
      let slice = pk - age <= 1 ? p.grow[g] : p.grow[g] / (pk - age) * Math.max(0.35, gauss(1, 0.3)) * (g === 'T' || g === 'M' ? DEV.front[p.exp + 1] || 1 : 1);
      if (p.h.curve === 'early') slice *= 1.3; else if (p.h.curve === 'late') slice *= 0.8;
      slice = Math.min(p.grow[g], slice);
      if (g === 'E' || g === 'P') payGrowth(p, g, slice, earnRate(p, g, 'off'));
      else { yr[g] = round2(slice); payGrowth(p, g, slice * DEV.off, earnRate(p, g, 'off')); }
    } else if (age >= pk - 0.5 && p.grow[g] > 0) p.grow[g] = 0; // the window closed
    // good year, bad year
    if (g === 'T' || g === 'M') shiftSoft(p, g, fatTail(DEV.swing * (g === 'M' ? 0.7 : 1), DEV.tail, 2.2));
  }
  p.yr = yr; // what is still on offer this coming year (camp, then the season)
  delete p.pa; p.cs = 0;
  if (p.lateTo && age >= p.lateTo) delete p.lateTo;
  p.age++;
  p.exp++;
  updateRatings(p);
  const d = p.ovr - old;
  p.dv = Object.assign(p.dv || {}, { d, ev: ev || undefined });
  if (ev) p.dv.evS = state.season + 1;
  return d;
}

// ---------- checkpoints: end of camp, end of preseason, every four weeks, end of the season ----------
// a player who has not been through an offseason here yet (a rookie, or an older save): this year's share from what he has left
function initYear(p) { const yr = {}; for (const g of ['T', 'M']) { const pk = growPeak(p, g); if (p.age < pk - 0.5 && p.grow[g] > 0.05) yr[g] = round2(pk - p.age <= 1 ? p.grow[g] : Math.min(p.grow[g], p.grow[g] / (pk - p.age) * (DEV.front[p.exp] || 1))); } return yr; }
function yearSlice(p, g) { return (p.yr && p.yr[g]) || 0; }
function devPay(kind, weeks) {
  const frac = kind === 'camp' ? DEV.camp * 0.4 : kind === 'pre' ? DEV.camp * 0.6 : DEV.season * weeks / SEASON_WEEKS;
  const ek = kind === 'season' ? 'season' : kind === 'pre' ? 'camp' : 'off'; // camp itself is coaching and habits; the exhibitions add snaps
  for (const id in state.players) {
    const p = state.players[id];
    if (!p.a || p.tid === -2 || !p.grow) continue;
    if (!p.yr) p.yr = initYear(p);
    let earned = 0, n = 0, changed = false;
    for (const g of ['T', 'M']) {
      const s = yearSlice(p, g);
      if (s <= 0 || !(p.grow[g] > 0)) continue;
      const e = earnRate(p, g, ek, weeks);
      if (payGrowth(p, g, s * frac, e) > 0) changed = true;
      earned += e; n++;
    }
    // a surge: a young player cashes in years of growth at once, usually when the chance finally comes
    if (p.age <= 25 && (p.grow.T || 0) + (p.grow.M || 0) >= 2 && p.tid >= 0) {
      const sn = kind === 'season' ? nSnaps(p, weeks) : nPreSnaps(p);
      if (rand() < DEV.surge * (0.5 + 2 * sn) * (nPractice(p) > 0.9 ? 1.5 : 1)) {
        for (const g of ['T', 'M']) { const got = Math.min(p.grow[g] || 0, Math.max(3, yearSlice(p, g) * 2.6)); p.grow[g] = round2(p.grow[g] - got); shiftSoft(p, g, got); }
        p.grow.T = round2(p.grow.T + randInt(0, 2));
        p.dv = Object.assign(p.dv || {}, { sg: state.cp + 1, ev: 'surge', evS: state.season });
        changed = true;
      }
    }
    // rust: technique slips when it is not being used
    if (kind === 'season' && p.exp > 0 && nSnaps(p, weeks) < 0.1 && p.pos !== 'K' && p.pos !== 'P') { shiftSoft(p, 'T', -(p.tid < 0 && p.tid !== -3 ? 0.22 : 0.1 * (1.3 - nPractice(p))) * weeks / 4); changed = true; }
    if (n) { const e = earned / n; p.dv = p.dv || {}; p.dv.e = p.dv.e === undefined || p.dv.e === null ? e : round2(0.5 * p.dv.e + 0.5 * e); }
    if (kind === 'season') { p.cs = (p.stats && p.stats.snp) || 0; delete p.pa; }
    if (changed) updateRatings(p);
  }
}
function trackOf(p) {
  const dv = p.dv || {}, cp = state.cp || 0;
  if (dv.sg && cp - dv.sg < 3) return 'surge';
  if (p.lateTo) return 'late';
  const growing = isDeveloping(p);
  if (growing && dv.e !== undefined && dv.e !== null) return dv.e >= 0.95 ? 'ahead' : dv.e >= 0.68 ? 'on' : dv.e >= 0.45 ? 'behind' : 'stalled';
  if (growing) return 'on';
  if (p.age >= declStart(p, 'E') - 1 && dv.d !== undefined) return dv.d <= -3 ? 'fall' : dv.d <= -1 ? 'slip' : 'steady';
  return p.age >= 26 ? 'steady' : 'done';
}

// ---- what the staff believes after each checkpoint ----
const CP_LABEL = { camp: 'training camp', pre: 'the preseason', season: 'the last month', final: 'the season', off: 'the offseason' };
const UP_WHY = {
  1: { camp: 'a strong camp', pre: 'strong preseason film', season: 'what he has put on film this month', final: 'his season', off: 'outgrowing expectations this offseason', surge: 'a breakout that looks real', late: 'a late jump nobody saw coming' },
  '-1': { camp: 'a poor camp', pre: 'a rough preseason', season: 'what the film has shown this month', final: 'a season that did not answer the questions', off: 'another year without the progress they wanted', collapse: 'a step backwards', inj: 'the injury' },
};
function perceptionCheckpoint(kind, weeks) {
  for (const id in state.players) {
    const p = state.players[id];
    if (!p.per || !p.a || p.tid === -2) continue;
    const sn = kind === 'season' || kind === 'final' ? clamp(snapShareSeen(p, weeks) / 0.6, 0, 1) : kind === 'pre' ? clamp(nPreSnaps(p) + 0.2, 0, 1) : kind === 'camp' ? 0.25 : 0.2;
    let rate = 0.06 + 0.3 * sn;
    if (Math.abs(p.ovr - p.per.b) >= 4 && sn >= 0.4) rate = Math.max(rate, 0.5); // the film is overwhelming
    if (p.dv && p.dv.sg === (state.cp || 0) + 1) rate = Math.max(rate, 0.45);
    // the staff's misreads hold for a season rather than re-rolling every month
    p.per.b += rate * (p.ovr + hashGauss(p.id, 78, state.season) * 1.5 * (1 - p.per.conf) - p.per.b);
    p.per.g = Math.max(0, p.per.g + rate * (Math.max(0, p.pot - p.ovr) + hashGauss(p.id, 77, state.season) * 2.5 * (1 - p.per.conf) - p.per.g));
    p.per.conf = Math.min(0.95, p.per.conf + 0.015 + 0.03 * sn);
    p.per.cc = round2(p.per.conf); // the confidence the finished-product report was written with
  }
}
function snapShareSeen(p, weeks) { return p.tid < 0 ? 0 : clamp((((p.stats && p.stats.snp) || 0) - (p.csP || 0)) / (Math.max(1, weeks) * DEV.gameSnaps), 0, 1); }
// the upside pill is sticky between checkpoints, and cannot reverse direction for two checkpoints
function upsideRaw(p) { return upsideOf(p, uCeil(p)); }
function stickyUpside(kind) {
  const cp = state.cp || 0, u = state.userTid;
  for (const id in state.players) {
    const p = state.players[id];
    if (!p.per || !p.a || p.tid === -2) continue;
    const cur = p.upL;
    if (!cur) { p.upL = upsideRaw(p); continue; }
    // he has to clear the line by a margin: a label does not move on a coin flip
    const c = uCeil(p), mg = p.age <= 25 ? 1.6 : 2.0, ix = l => UPSIDE_ORDER.indexOf(l), up = upsideOf(p, c - mg), dn = upsideOf(p, c + mg);
    const now = ix(up) < ix(cur) ? up : ix(dn) > ix(cur) ? dn : cur;
    if (now === cur) continue;
    const dir = ix(now) < ix(cur) ? 1 : -1;
    const hurt = p.injury && p.injury.weeks >= 8;
    if (p.upM && p.upM.d === -dir && cp - p.upM.cp < 2 && !hurt) continue;
    const ev = p.dv && p.dv.ev && p.dv.evS === state.season ? p.dv.ev : null;
    const why = dir < 0 && hurt ? UP_WHY[-1].inj : (ev && UP_WHY[dir][ev]) || UP_WHY[dir][kind] || UP_WHY[dir].season;
    const steps = Math.abs(UPSIDE_ORDER.indexOf(now) - UPSIDE_ORDER.indexOf(cur));
    p.upM = { d: dir, cp, from: cur, why, s: state.season, k: kind };
    p.upL = now;
    if ((p.tid === u || p.psTid === u) && !state.settings.autoUser && p.age <= 27 && (steps >= 2 || ['Elite', 'High-End Starter', 'Solid Starter'].includes(dir > 0 ? now : cur)))
      addNews(`${p.lbl} ${pname(p)}: upside ${dir > 0 ? 'raised' : 'lowered'} to ${now} after ${why}.`, [u], 'prog');
  }
}
// one checkpoint: pay what was earned, update what everyone believes, re-read the labels
function devCheckpoint(kind, weeks) {
  state.cp = state.cp || 0;
  if (kind !== 'off') devPay(kind === 'final' ? 'season' : kind, weeks || 4);
  perceptionCheckpoint(kind, weeks || 4);
  for (const id in state.players) { const p = state.players[id]; if (p.stats) p.csP = p.stats.snp || 0; }
  computeThresholds();
  state.cp++;
  stickyUpside(kind);
  state.cpInfo = { kind, season: state.season, week: state.phase === 'REG' ? state.week : 0 };
}
// the two summer checkpoints, exactly once a year (camp before the first exhibition, then after the last)
function devSummer(which) {
  const yr = state.draft ? state.draft.year : state.season + 1, d = state.devS || (state.devS = { y: 0, camp: 0, pre: 0 });
  if (d.y !== yr) { d.y = yr; d.camp = 0; d.pre = 0; }
  if (!d.camp) { d.camp = 1; devCheckpoint('camp'); }
  if (which === 'pre' && !d.pre) { d.pre = 1; devCheckpoint('pre'); }
}

// ---------- the finished product: what the staff thinks he becomes ----------
// fog on how much growth is left in each area: fixed per player, fades as film piles up
function projError(p, g) { return hashGauss(p.id, 900 + g.charCodeAt(0), 5) * 7 * (1 - ((p.per && (p.per.cc || p.per.conf)) || 0.5)); }
function projectedAttrs(p, best) {
  const a = Object.assign({}, p.a), young = p.age < growPeak(p, 'M') - 0.5;
  if (!young) return a;
  for (const g of AGE_GROUPS) {
    const left = (p.grow[g] || 0) * (best ? 0.95 : g === 'E' || g === 'P' ? DEV.expectP : DEV.expect);
    const d = Math.max(0, left + (left > 0.5 || g === 'T' ? projError(p, g) * (g === 'E' || g === 'P' ? 0.3 : 1) : 0) + (best ? 2 : 0));
    if (!d) continue;
    for (const k in a) if (ATTRS[k] && ATTRS[k][2] === g) a[k] = clamp(Math.round(a[k] + d), 10, 99);
  }
  return a;
}
// a stand-in for the player he is expected to become, so the usual scouting language can describe him
function finishedPlayer(p, best) {
  const a = projectedAttrs(p, best), ceil = uCeil(p) + (best ? 3 : 0);
  return { id: p.id, a, spot: p.spot, pos: p.pos, lbl: p.lbl, age: 27, tid: -9, ovr: ceil, m: p.m, h: p.h, exp: 5,
    per: { b: ceil, h: 0, g: 0, h0: 0, conf: (p.per && (p.per.cc || p.per.conf)) || 0.5 } };
}
function isDeveloping(p) { return !!p.grow && p.pot - p.ovr >= 2 && p.age < growPeak(p, 'M') - 0.5; } // real room left, not a point of late polish
function finishedRemark(p) {
  const q = finishedPlayer(p), line = scoutProfile(q), t = scoutTraits(q);
  return { line, str: t.str.slice(0, 2), weak: t.weak.slice(0, 2) };
}
// ---- comps: who in this league (or its history) plays like the finished product ----
const COMP_CACHE = { key: null, m: {} };
function compPool(spotGrp) {
  const live = Object.values(state.players).filter(c => c.a && c.tid !== -2 && c.exp >= 3 && PROFILE_GROUP[c.spot] === spotGrp).map(c => ({ id: c.id, n: pname(c), tid: c.tid, a: c.a, m: c.m, v: perOvr(c) }));
  const old = Object.values(state.retired || {}).filter(r => r.a && PROFILE_GROUP[r.spot] === spotGrp && r.pk >= 74).map(r => ({ rid: r.id, n: r.n, tid: -9, a: r.a, m: { ht: r.ht, wt: r.wt }, v: r.pk, yrs: r.to }));
  return live.concat(old);
}
function compFor(p, best) {
  const key = state.season + ':' + (state.cp || 0) + ':' + state.phase;
  if (COMP_CACHE.key !== key) { COMP_CACHE.key = key; COMP_CACHE.m = {}; }
  const ck = p.id + (best ? 'b' : 'e');
  if (COMP_CACHE.m[ck] !== undefined) return COMP_CACHE.m[ck];
  const grp = PROFILE_GROUP[p.spot], keys = (PROFILE_ATTRS[grp] || []).filter(k => k !== 'siz'), w = SPOTS[p.spot].w || {};
  const a = projectedAttrs(p, best), level = uCeil(p) + (best ? 4 : 0);
  const mean = o => keys.reduce((s, k) => s + (o[k] || 25), 0) / Math.max(1, keys.length), ma = mean(a);
  let bestC = null, bestD = 1e9;
  for (const c of compPool(grp)) {
    if (c.id === p.id) continue;
    const mc = mean(c.a);
    let d = 0;
    for (const k of keys) { const x = (a[k] || 25) - ma - ((c.a[k] || 25) - mc); d += x * x * (w[k] !== undefined ? 1.6 : 1); } // shape of the game first
    d = d / Math.max(1, keys.length);
    d += Math.pow((p.m.ht - c.m.ht) * 2.2, 2) * 0.25 + Math.pow((p.m.wt - c.m.wt) / 5, 2) * 0.35; // build
    d += Math.pow((level - c.v) * 1.1, 2) * 0.5 + (best && c.v < level - 3 ? 60 : 0);                 // then how good
    if (d < bestD) { bestD = d; bestC = c; }
  }
  return (COMP_CACHE.m[ck] = bestC);
}

// ---------- the record book: nobody disappears when he retires ----------
const CAREER_SUM = ['gp', 'gs', 'passA', 'passC', 'passY', 'passTD', 'passInt', 'rushA', 'rushY', 'rushTD', 'rec', 'recY', 'recTD', 'tkl', 'sck', 'dint', 'pd', 'ff', 'fgm', 'fga'];
function trackPeak(p) {
  if (!p.a || p.tid === -2) return;
  if (!p.pkR || p.ovr > p.pkR.o) p.pkR = { o: p.ovr, s: state.season, a: Object.assign({}, p.a) };
}
function archiveRetired(p) {
  const car = p.career || [];
  if (!car.length && !(p.awards && p.awards.length)) return;
  const tot = {}; for (const c of car) for (const k of CAREER_SUM) if (c[k]) tot[k] = (tot[k] || 0) + c[k];
  const teams = []; for (const c of car) if (c.tid >= 0 && teams[teams.length - 1] !== c.tid) teams.push(c.tid);
  const pk = p.pkR || { o: p.ovr, a: p.a, s: state.season };
  (state.retired = state.retired || {})[p.id] = {
    id: p.id, n: pname(p), pos: p.pos, spot: p.spot, lbl: p.lbl, ht: p.m.ht, wt: p.m.wt, col: p.college,
    from: car.length ? car[0].season : state.season, to: state.season, yrs: p.exp, age: p.age,
    dr: p.draft ? [p.draft.year, p.draft.round, p.draft.pick, p.draft.tid] : null,
    pk: pk.o, pkS: pk.s, a: pk.a, tm: teams, tot, aw: (p.awards || []).slice(), best: car.reduce((b, c) => c.adv && c.adv.g && (!b || c.adv.g > b) ? Math.round(c.adv.g) : b, 0) || undefined,
  };
}
