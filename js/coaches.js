'use strict';
// =====================================================================
//  Coaches: staffs, knobs, tendencies, archetypes, development, wear
//  See docs/DESIGN.md §6
// =====================================================================
const COACH_ROLES = ['HC', 'OC', 'DC', 'STC', 'SC'];
const ROLE_LABEL = { HC: 'Head Coach', OC: 'Offensive Coordinator', DC: 'Defensive Coordinator', STC: 'Special Teams Coordinator', SC: 'Strength & Conditioning' };
const ROLE_SHORT = { HC: 'HC', OC: 'OC', DC: 'DC', STC: 'ST', SC: 'S&C' };
const KNOBS = {
  HC: ['gm', 'cul', 'pc', 'adp'],
  OC: ['pc', 'adp', 'runD', 'passD', 'dcp', 'dQB', 'dBC', 'dREC', 'dOL'],
  DC: ['pc', 'adp', 'frontD', 'covD', 'presD', 'dPR', 'dRD', 'dCOV'],
  STC: ['units', 'dSPEC'],
  SC: ['prev', 'recov', 'dPOW', 'dSPD'],
};
const KNOB_LABEL = {
  gm: 'Game Management', cul: 'Culture', pc: 'Play Calling', adp: 'Adaptability',
  runD: 'Run Design', passD: 'Pass Design', dcp: 'Deception', frontD: 'Front Design', covD: 'Coverage Design', presD: 'Pressure Design',
  dQB: 'QB Development', dBC: 'Ball Carrier Dev.', dREC: 'Receiver Dev.', dOL: 'O-Line Dev.',
  dPR: 'Pass Rush Dev.', dRD: 'Run Defense Dev.', dCOV: 'Coverage Dev.',
  units: 'Coverage & Return Units', dSPEC: 'Specialist Dev.',
  prev: 'Injury Prevention', recov: 'Recovery', dPOW: 'Strength/Power Dev.', dSPD: 'Speed/Agility Dev.',
};
// which coach knob develops each attribute (DESIGN §6b)
const DEV_GROUPS = {
  dQB: ['sacc', 'dacc', 'proc', 'dec', 'pkt', 'tor'], dBC: ['vis', 'elu', 'bal', 'bsec'], dREC: ['rte', 'rel', 'hnd', 'cth'], dOL: ['pbk', 'rbk', 'bawr'],
  dPR: ['prsh', 'strp'], dRD: ['shed', 'tkl', 'prec'], dCOV: ['man', 'zone', 'prs', 'bsk'],
  dSPEC: ['kcon', 'kfal', 'ktrj', 'pplc', 'pspn', 'phng'], dPOW: ['str', 'arm', 'krng', 'pdis'], dSPD: ['spd', 'bur', 'agi'],
};
const DEV_OWNER = { dQB: 'OC', dBC: 'OC', dREC: 'OC', dOL: 'OC', dPR: 'DC', dRD: 'DC', dCOV: 'DC', dSPEC: 'STC', dPOW: 'SC', dSPD: 'SC' };
const ATTR_DEV = {};
for (const k in DEV_GROUPS) for (const a of DEV_GROUPS[k]) ATTR_DEV[a] = k;

// ---------- scheme archetypes ----------
const OFF_ARCH = {
  WZ: { l: 'Wide Zone / Boot', t: { pers: { 11: 45, 12: 30, 21: 15, 13: 5, 22: 5 }, uc: 0.55, pass: 0.54, zone: 0.8, quick: 0.25, deep: 0.2, pa: 0.3, motion: 0.6, rpo: 0.05, boot: 0.12, screen: 0.06, trick: 0.03, qbRun: 0.03, rb1: 0.65 } },
  SPREAD: { l: 'Spread / Air Raid', t: { pers: { 11: 70, 10: 15, 12: 12, 13: 3 }, uc: 0.1, pass: 0.62, zone: 0.55, quick: 0.42, deep: 0.13, pa: 0.1, motion: 0.35, rpo: 0.25, boot: 0.03, screen: 0.12, trick: 0.03, qbRun: 0.06, rb1: 0.7 } },
  POWER: { l: 'Power / Gap', t: { pers: { 12: 35, 11: 35, 13: 12, 22: 10, 21: 8 }, uc: 0.55, pass: 0.5, zone: 0.3, quick: 0.25, deep: 0.25, pa: 0.26, motion: 0.3, rpo: 0.05, boot: 0.06, screen: 0.05, trick: 0.02, qbRun: 0.03, rb1: 0.6 } },
  WCO: { l: 'West Coast', t: { pers: { 11: 60, 12: 25, 21: 8, 13: 7 }, uc: 0.35, pass: 0.58, zone: 0.5, quick: 0.4, deep: 0.1, pa: 0.18, motion: 0.4, rpo: 0.08, boot: 0.06, screen: 0.12, trick: 0.02, qbRun: 0.03, rb1: 0.65 } },
  VERT: { l: 'Vertical', t: { pers: { 11: 72, 12: 18, 10: 6, 13: 4 }, uc: 0.25, pass: 0.6, zone: 0.5, quick: 0.25, deep: 0.27, pa: 0.2, motion: 0.3, rpo: 0.05, boot: 0.05, screen: 0.06, trick: 0.03, qbRun: 0.03, rb1: 0.7 } },
  RPO: { l: 'RPO / QB Run', t: { pers: { 11: 60, 10: 15, 12: 20, 13: 5 }, uc: 0.05, pass: 0.52, zone: 0.7, quick: 0.4, deep: 0.15, pa: 0.12, motion: 0.45, rpo: 0.35, boot: 0.04, screen: 0.08, trick: 0.04, qbRun: 0.18, rb1: 0.6 } },
};
const DEF_ARCH = {
  TWOHIGH: { l: 'Two-High (Fangio)', t: { front: 'Tite', base: 0.25, man: 0.25, high: 0.7, blitz: 0.18, sim: 0.15, stunt: 0.2 } },
  C3: { l: 'Cover 3 (Seattle)', t: { front: '4-3', base: 0.4, man: 0.25, high: 0.25, blitz: 0.25, sim: 0.05, stunt: 0.15 } },
  WIDE9: { l: 'Wide-9 Attack', t: { front: 'Wide-9', base: 0.3, man: 0.35, high: 0.35, blitz: 0.2, sim: 0.05, stunt: 0.25 } },
  MANBLITZ: { l: 'Man-Blitz', t: { front: '4-3', base: 0.25, man: 0.6, high: 0.3, blitz: 0.42, sim: 0.15, stunt: 0.15 } },
  TWOGAP: { l: '3-4 Two-Gap', t: { front: '3-4', base: 0.45, man: 0.35, high: 0.45, blitz: 0.28, sim: 0.1, stunt: 0.1 } },
};
function jitterTend(base) {
  const t = JSON.parse(JSON.stringify(base));
  for (const k in t) if (typeof t[k] === 'number') t[k] = round2(clamp(t[k] * Math.exp(gauss(0, 0.12)), 0, 0.95));
  if (t.pers) for (const k in t.pers) t.pers[k] = Math.max(0, Math.round(t.pers[k] * Math.exp(gauss(0, 0.15))));
  return t;
}

// ---------- generation ----------
function C(id) { return id == null ? null : state.coaches[id]; }
function cname(c) { return c ? c.first + ' ' + c.last : 'Vacant'; }
function knob(c, k) { return c && c.k[k] !== undefined ? c.k[k] : 35; } // vacancies are bad at everything

function genCoach(role, opts = {}) {
  const [first, last] = randomName();
  const c = {
    id: state.nextCid++, first, last, role, tid: -1,
    age: clamp(Math.round(gauss(role === 'HC' ? 52 : role === 'SC' || role === 'STC' ? 44 : 46, 7)), 30, 70),
    k: {}, t: {}, arch: null, rec: { w: 0, l: 0, t: 0, titles: 0 }, mentors: [], hist: [],
  };
  const q = opts.q !== undefined ? opts.q : gauss(0, 1);
  for (const k of KNOBS[role]) c.k[k] = gauss(52 + q * 7, 11);
  // identity: a couple of real strengths and a weakness
  const pool = KNOBS[role].filter(k => k !== 'pc' && k !== 'gm');
  shuffle(pool);
  if (pool[0]) c.k[pool[0]] += randInt(10, 18);
  if (pool[1] && rand() < 0.6) c.k[pool[1]] += randInt(6, 14);
  if (pool[2] && rand() < 0.7) c.k[pool[2]] -= randInt(8, 16);
  for (const k in c.k) c.k[k] = Math.round(clamp(c.k[k], 15, 97));
  if (role === 'OC') { c.arch = opts.arch || pick(Object.keys(OFF_ARCH)); c.t = jitterTend(OFF_ARCH[c.arch].t); }
  if (role === 'DC') { c.arch = opts.arch || pick(Object.keys(DEF_ARCH)); c.t = jitterTend(DEF_ARCH[c.arch].t); }
  if (role === 'HC') {
    c.t.aggr = round2(clamp(gauss(0.5, 0.17), 0.05, 0.95));
    c.t.clock = round2(clamp(gauss(0.5, 0.17), 0.05, 0.95));
    c.t.bg = opts.bg || weightedPick(['O', 'D', 'ST'], [45, 45, 10]);
    makeCaller(c, opts.callerArch);
  }
  updateCoachOvr(c);
  state.coaches[c.id] = c;
  return c;
}
// some head coaches call plays for their side of the ball
function makeCaller(c, arch) {
  c.t.caller = null; delete c.ct;
  if ((c.t.bg === 'O' && rand() < 0.5) || (c.t.bg === 'D' && rand() < 0.3)) {
    c.t.caller = c.t.bg;
    c.arch = arch || pick(Object.keys(c.t.bg === 'O' ? OFF_ARCH : DEF_ARCH));
    if (!(c.t.bg === 'O' ? OFF_ARCH : DEF_ARCH)[c.arch]) c.arch = pick(Object.keys(c.t.bg === 'O' ? OFF_ARCH : DEF_ARCH));
    c.ct = jitterTend((c.t.bg === 'O' ? OFF_ARCH : DEF_ARCH)[c.arch].t);
  }
}
function devAvg(c) { const ks = KNOBS[c.role].filter(k => DEV_OWNER[k]); return ks.length ? avg(ks.map(k => c.k[k])) : 50; }
function updateCoachOvr(c) {
  const k = c.k;
  let v;
  if (c.role === 'HC') v = k.gm * 0.3 + k.cul * 0.3 + (c.t.caller ? k.pc * 0.25 + k.adp * 0.15 : k.pc * 0.2 + k.adp * 0.2);
  else if (c.role === 'OC') v = k.pc * 0.25 + k.adp * 0.1 + k.runD * 0.15 + k.passD * 0.2 + k.dcp * 0.1 + devAvg(c) * 0.2;
  else if (c.role === 'DC') v = k.pc * 0.2 + k.adp * 0.1 + k.frontD * 0.2 + k.covD * 0.2 + k.presD * 0.15 + devAvg(c) * 0.15;
  else if (c.role === 'STC') v = k.units * 0.6 + k.dSPEC * 0.4;
  else v = k.prev * 0.35 + k.recov * 0.35 + k.dPOW * 0.15 + k.dSPD * 0.15;
  c.ovr = Math.round(clamp(v, 1, 99));
}
function coachTier(v) { return v >= 85 ? 'Elite' : v >= 70 ? 'Strong' : v >= 50 ? 'Average' : 'Weak'; }
function schemeLabel(c) {
  if (!c) return '';
  if (c.role === 'OC' || (c.role === 'HC' && c.t.caller === 'O')) return OFF_ARCH[c.arch] ? OFF_ARCH[c.arch].l : '';
  if (c.role === 'DC' || (c.role === 'HC' && c.t.caller === 'D')) return DEF_ARCH[c.arch] ? DEF_ARCH[c.arch].l : '';
  return '';
}

function genStaff(t) {
  const hc = genCoach('HC');
  hireCoach(t.id, hc.id, true);
  for (const role of ['OC', 'DC', 'STC', 'SC']) {
    const c = genCoach(role, { arch: role === 'OC' && hc.t.caller === 'O' ? hc.arch : role === 'DC' && hc.t.caller === 'D' ? hc.arch : undefined });
    hireCoach(t.id, c.id, true);
    c.rec.w = 0;
  }
  hc.rec.w = randInt(0, 80); hc.rec.l = randInt(0, 80);
}
function fillCoachPool(n = 9) {
  for (const role of COACH_ROLES) {
    const have = Object.values(state.coaches).filter(c => c.tid < 0 && c.role === role).length;
    for (let i = have; i < n; i++) genCoach(role, { q: gauss(-0.2, 1) });
  }
}

// ---------- who calls plays / whose scheme ----------
function offCaller(t) { const hc = C(t.hc); return hc && hc.t.caller === 'O' ? hc : C(t.oc); }
function defCaller(t) { const hc = C(t.hc); return hc && hc.t.caller === 'D' ? hc : C(t.dc); }
function offTend(t) { const c = offCaller(t); return c ? (c.role === 'HC' ? c.ct : c.t) : OFF_ARCH.WCO.t; }
function defTend(t) { const c = defCaller(t); return c ? (c.role === 'HC' ? c.ct : c.t) : DEF_ARCH.C3.t; }
function offArch(t) { const c = offCaller(t); return c ? c.arch : null; }
function defArch(t) { const c = defCaller(t); return c ? c.arch : null; }

// ---------- development (offseason) ----------
// Returns per-attribute multipliers: grow (how much of a player's growth is realized) and decl (how fast decline hits)
function teamDev(tid) {
  if (tid < 0) return null;
  const t = T(tid), staff = {};
  for (const r of COACH_ROLES) staff[r] = C(t[r.toLowerCase()]);
  const val = k => knob(staff[DEV_OWNER[k]], k);
  return {
    grow: a => { const k = ATTR_DEV[a]; return k ? 0.7 + val(k) * 0.006 : 1; },
    decl: a => { const k = ATTR_DEV[a]; return k ? 1.25 - val(k) * 0.005 : 1; },
  };
}

// ---------- in-season wear (S&C Recovery) ----------
function addWear(p, line, tid) {
  if (!p.h || !line || !line.gp) return;
  const sc = C(T(tid).sc);
  let w = line.gs ? 0.4 : 0.1;
  w += (line.rushA || 0) * 0.12 + (line.rec || 0) * 0.05 + (line.sacked || 0) * 0.5 + (line.tkl || 0) * 0.04;
  if (p.pos === 'DL' && line.gs) w += 0.5;
  w *= (1.4 - p.h.stam / 125) * (1.2 - knob(sc, 'recov') / 250);
  p.wear = round1((p.wear || 0) + w);
}
function weeklyRecovery() {
  for (const t of state.teams) {
    const rec = 1.2 + knob(C(t.sc), 'recov') / 80;
    for (const p of rosterOf(t.id)) if (p.wear) p.wear = round1(Math.max(0, p.wear - rec));
  }
}
function wearPenalty(p) { return Math.min(4, (p.wear || 0) * 0.2); }

// ---------- scheme familiarity ----------
// first season under a new play-caller's system: a small, fading penalty
function updateSystems() {
  for (const t of state.teams) {
    t.sys = t.sys || { O: { arch: null, yrs: 0 }, D: { arch: null, yrs: 0 } };
    for (const [side, fn] of [['O', offArch], ['D', defArch]]) {
      const a = fn(t);
      if (a && a === t.sys[side].arch) t.sys[side].yrs++;
      else t.sys[side] = { arch: a, yrs: 0 };
    }
  }
}
function familiarityPenalty(t, side) {
  if (!t.sys || !t.sys[side] || t.sys[side].yrs > 0 || state.phase !== 'REG') return 0;
  return 1.5 * Math.max(0, 1 - (state.week - 1) / 16);
}

// ---------- hiring / firing / carousel ----------
function fireCoach(tid, role) {
  const t = T(tid), c = C(t[role.toLowerCase()]);
  if (!c) return;
  c.tid = -1; t[role.toLowerCase()] = null;
  addNews(`${t.abbr} fired ${role === 'SC' ? 'S&C coach' : role} ${cname(c)}.`, [tid], 'coach');
}
function hireCoach(tid, cid, quiet) {
  const c = C(cid), t = T(tid), key = c.role.toLowerCase();
  if (c.tid >= 0) return false;
  if (t[key]) C(t[key]).tid = -1;
  t[key] = c.id; c.tid = tid;
  const hc = C(t.hc);
  if (hc && c.role !== 'HC' && !c.mentors.includes(hc.id)) c.mentors.push(hc.id);
  if (c.role === 'HC') for (const r of ['oc', 'dc', 'stc', 'sc']) { const a = C(t[r]); if (a && !a.mentors.includes(c.id)) a.mentors.push(c.id); }
  if (!quiet) addNews(`${t.abbr} hired ${ROLE_LABEL[c.role]} ${cname(c)}${schemeLabel(c) ? ' (' + schemeLabel(c) + ')' : ''}.`, [tid], 'coach');
  return true;
}
// AI preference: quality + coaching-tree ties + scheme family match with the head coach
function hireScore(t, c) {
  let s = c.ovr + gauss(0, 3);
  const hc = C(t.hc);
  if (hc && c.role !== 'HC') {
    if (c.mentors.includes(hc.id) || hc.mentors.includes(c.id)) s += 5;
    if (c.role === 'OC' && hc.t.bg === 'O' && hc.arch === c.arch) s += 4;
    if (c.role === 'DC' && hc.t.bg === 'D' && hc.arch === c.arch) s += 4;
  }
  if (c.age > 64) s -= 3;
  return s;
}
function fillCoachVacancies() {
  fillCoachPool(6);
  // head coaches first so coordinators can be matched to them
  for (const role of COACH_ROLES) for (const t of shuffle([...state.teams])) {
    if (t[role.toLowerCase()]) continue;
    const pool = Object.values(state.coaches).filter(c => c.tid < 0 && c.role === role);
    if (!pool.length) { const c = genCoach(role); hireCoach(t.id, c.id); continue; }
    pool.sort((a, b) => hireScore(t, b) - hireScore(t, a));
    hireCoach(t.id, pool[0].id);
  }
}
function coachOffseason() {
  const recs = standings();
  // record the season on each coach's résumé
  const pf = state.teams.map(t => recs[t.id].pf), pa = state.teams.map(t => recs[t.id].pa);
  const rank = (arr, v, desc) => 1 + arr.filter(x => desc ? x > v : x < v).length;
  for (const t of state.teams) {
    const r = recs[t.id];
    for (const role of COACH_ROLES) {
      const c = C(t[role.toLowerCase()]);
      if (!c) continue;
      c.hist.push({ s: state.season, tid: t.id, role, w: r.w, l: r.l, off: rank(pf, r.pf, true), def: rank(pa, r.pa, false) });
      if (c.hist.length > 25) c.hist.shift();
    }
  }
  // aging, growth, retirement
  for (const id in state.coaches) {
    const c = state.coaches[id];
    c.age++;
    const drift = c.age < 45 ? 0.8 : c.age < 60 ? 0.1 : -1.0;
    for (const k in c.k) c.k[k] = Math.round(clamp(c.k[k] + gauss(drift, 1.4), 15, 97));
    updateCoachOvr(c);
    if (c.age >= 72 || (c.age >= 64 && rand() < 0.15) || (c.tid < 0 && rand() < 0.2)) {
      if (c.tid >= 0) { T(c.tid)[c.role.toLowerCase()] = null; if (c.tid === state.userTid || c.ovr >= 75) addNews(`${c.role} ${cname(c)} (${T(c.tid).abbr}) retired.`, [c.tid]); }
      delete state.coaches[id];
    }
  }
  // AI firings: HC on record; coordinators on their unit's rank
  for (const t of state.teams) {
    if (!isAI(t.id)) continue;
    const r = recs[t.id], wp = pct(r);
    const offR = rank(pf, r.pf, true), defR = rank(pa, r.pa, false);
    if (C(t.hc) && ((wp < 0.3 && rand() < 0.75) || (wp < 0.45 && rand() < 0.3) || (wp < 0.55 && rand() < 0.08))) fireCoach(t.id, 'HC');
    if (C(t.oc) && rand() < (offR > 24 ? 0.45 : offR > 16 ? 0.12 : 0.04)) fireCoach(t.id, 'OC');
    if (C(t.dc) && rand() < (defR > 24 ? 0.45 : defR > 16 ? 0.12 : 0.04)) fireCoach(t.id, 'DC');
    for (const role of ['STC', 'SC']) if (C(t[role.toLowerCase()]) && rand() < 0.07) fireCoach(t.id, role);
  }
  // hot coordinators get head-coaching chances; they keep their scheme and often call plays
  for (const c of Object.values(state.coaches)) {
    if ((c.role === 'OC' || c.role === 'DC') && c.ovr >= 70 && c.age < 60 && rand() < 0.18) {
      if (c.tid >= 0) { T(c.tid)[c.role.toLowerCase()] = null; addNews(`${T(c.tid).abbr} ${c.role} ${cname(c)} leaves to pursue head coaching jobs.`, [c.tid]); }
      const side = c.role === 'OC' ? 'O' : 'D', arch = c.arch;
      c.role = 'HC'; c.tid = -1;
      c.k = { gm: Math.round(clamp(gauss(50, 10), 20, 90)), cul: Math.round(clamp(gauss(52, 11), 20, 92)), pc: c.k.pc, adp: c.k.adp };
      c.t = { aggr: round2(clamp(gauss(0.5, 0.17), 0.05, 0.95)), clock: round2(clamp(gauss(0.5, 0.17), 0.05, 0.95)), bg: side };
      makeCaller(c, arch);
      if (!c.t.caller && rand() < 0.5) { c.t.caller = side; c.arch = arch; c.ct = jitterTend((side === 'O' ? OFF_ARCH : DEF_ARCH)[arch].t); }
      updateCoachOvr(c);
    }
  }
  fillCoachPool(9);
}

// ---------- scheme fit (DESIGN §6f): the same player is worth more in some systems ----------
const SCHEME_GROUP = { QB: 'QB', RB: 'RB', FB: 'RB', WRX: 'WR', WRZ: 'WR', SLOT: 'WR', TEY: 'TE', TEH: 'TE', LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
  NT: 'IDL', DT: 'IDL', DE: 'IDL', EDGE: 'EDGE', MLB: 'LB', WLB: 'LB', CB: 'CB', NCB: 'CB', FS: 'S', SS: 'S' };
// Which attributes a system leans on, computed from the play caller's actual call mix: the engine runs those plays,
// so the attributes those plays read matter more (e.g. 80% zone -> agile linemen and vision backs).
function schemeMults(spot, side, tend) {
  if (!tend) return null;
  const g = SCHEME_GROUP[spot], m = {};
  const set = (k, v) => { m[k] = clamp((m[k] || 1) * v, 0.6, 1.6); };
  if (side === 'O') {
    const t = tend, dz = t.zone - 0.55, dd = t.deep - 0.18, dq = t.quick - 0.32, dp = t.pass - 0.56, dpa = t.pa + t.boot - 0.3, dr = t.qbRun + t.rpo * 0.5 - 0.1, ds = t.screen - 0.08;
    if (g === 'QB') { set('dacc', 1 + dd * 2.5); set('arm', 1 + dd * 2.5); set('sacc', 1 + dq * 1.5); set('proc', 1 + dq * 1.2 + dp); set('spd', 1 + dr * 3); set('agi', 1 + dr * 2); set('elu', 1 + dr * 3); set('tor', 1 + dpa * 1.5); set('pkt', 1 + dd * 1.5); }
    if (g === 'RB') { set('vis', 1 + dz * 1.2); set('bal', 1 - dz); set('str', 1 - dz); set('hnd', 1 + ds * 3 + dp); set('rte', 1 + dp); set('pbk', 1 + dp * 1.2); }
    if (g === 'WR') { set('spd', 1 + dd * 2.5); set('rte', 1 + dq * 1.2); set('rel', 1 + dq); set('elu', 1 + ds * 3); set('cth', 1 + dd * 1.5); set('rbk', 1 + dz * 0.8 - dp * 0.5); }
    if (g === 'TE') { set('rbk', 1 + dz * 0.6 - dp * 0.8); set('pbk', 1 + dd); set('rte', 1 + dp * 1.2); set('hnd', 1 + dp); }
    if (g === 'OL') { set('agi', 1 + dz * 1.4); set('str', 1 - dz * 1.2); set('pbk', 1 + dp * 1.2); set('rbk', 1 - dp * 1.2); set('bawr', 1 + dpa * 0.6); }
  } else {
    const t = tend, dm = t.man - 0.35, dh = t.high - 0.45, db = t.blitz - 0.25, dsim = t.sim + t.stunt - 0.3;
    const two = t.front === '3-4' || t.front === 'Tite', w9 = t.front === 'Wide-9';
    if (g === 'IDL') { set('shed', two ? 1.25 : 1); set('str', two ? 1.2 : 1); set('prsh', two ? 0.85 : w9 ? 1.1 : 1); set('bur', w9 ? 1.15 : two ? 0.9 : 1); }
    if (g === 'EDGE') { set('spd', w9 ? 1.25 : 1); set('bur', w9 ? 1.2 : 1); set('shed', two ? 1.15 : 1); set('zone', 1 + dsim * 1.5); }
    if (g === 'LB') { set('man', 1 + dm * 1.5); set('zone', 1 - dm * 1.2 + dh * 0.5); set('prsh', 1 + db * 2.5); set('spd', 1 + dh * 0.6); }
    if (g === 'CB') { set('man', 1 + dm * 1.8); set('prs', 1 + dm * 1.5); set('zone', 1 - dm * 1.4 + dh * 0.6); set('prec', 1 - dm * 0.8 + dh * 0.5); }
    if (g === 'S') { set('zone', 1 + dh * 1.2); set('spd', 1 + dh * 0.8); set('man', 1 + dm * 1.4); set('prsh', 1 + db * 2); set('tkl', 1 - dh * 0.8); }
  }
  return m;
}
function schemeSpotRating(p, spot, mg) {
  const w = SPOTS[spot].w;
  let s = 0, n = 0, ts = 0;
  for (const k in w) { const wk = w[k] * (mg[k] || 1); s += wk * attrVal(p.a, k); ts += wk * attrVal(TEMPLATE_A[spot], k); n += wk; }
  return STARTER_CENTER + (s - ts) / n - bodyPenalty(p, spot);
}
// rating points gained/lost by playing in team tid's current system
function schemeFit(p, tid) {
  if (!p || !p.a || tid == null || tid < 0) return 0;
  const sideKey = SPOTS[p.spot].side === 'off' ? 'O' : SPOTS[p.spot].side === 'def' ? 'D' : null;
  if (!sideKey) return 0;
  const t = T(tid);
  const mg = schemeMults(p.spot, sideKey, sideKey === 'O' ? offTend(t) : defTend(t));
  if (!mg) return 0;
  return Math.round((schemeSpotRating(p, p.spot, mg) - spotRating(p, p.spot)) * 10) / 10;
}
function fitLabel(f) { return f >= 2.5 ? 'Ideal fit' : f >= 1 ? 'Good fit' : f > -1 ? 'Neutral fit' : f > -2.5 ? 'Poor fit' : 'Bad fit'; }
