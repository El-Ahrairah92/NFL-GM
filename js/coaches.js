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
  OC: ['pc', 'adp', 'runD', 'passD', 'dcp'],          // player development now belongs to the position coaches
  DC: ['pc', 'adp', 'frontD', 'covD', 'presD'],
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
  if (c.tier >= 3) { c.ovr = Math.round(c.exp !== undefined ? c.exp : (c.dev + c.disc) / 2); return; }
  if (c.role === 'HC') v = k.gm * 0.3 + k.cul * 0.3 + (c.t.caller ? k.pc * 0.25 + k.adp * 0.15 : k.pc * 0.2 + k.adp * 0.2);
  else if (c.role === 'OC') v = k.pc * 0.3 + k.adp * 0.12 + k.runD * 0.19 + k.passD * 0.25 + k.dcp * 0.14;
  else if (c.role === 'DC') v = k.pc * 0.25 + k.adp * 0.12 + k.frontD * 0.22 + k.covD * 0.22 + k.presD * 0.19;
  else if (c.role === 'STC') v = k.units * 0.6 + k.dSPEC * 0.4;
  else v = k.prev * 0.35 + k.recov * 0.35 + k.dPOW * 0.15 + k.dSPD * 0.15;
  c.ovr = Math.round(clamp(v, 1, 99));
}
function coachTier(v) { return v >= 85 ? 'Elite' : v >= 70 ? 'Strong' : v >= 50 ? 'Average' : 'Weak'; }
function schemeLabel(c) {
  if (!c) return '';
  if (c.role === 'OC' || (c.role === 'HC' && c.t.caller === 'O')) { ensureOffPk(c); return offSheetLabel(c.role === 'HC' ? c.ct : c.t); }
  if (c.role === 'DC' || (c.role === 'HC' && c.t.caller === 'D')) { ensureDefPk(c); return defSheetLabel((c.role === 'HC' ? c.ct : c.t).front, c.pk); }
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
  ensureAssistants(t);
  for (const r of ASST_ROLES) asst(t, r).yrs = randInt(0, 6);
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
function offTend(t) { return blendedTend(t, 'O'); }
function defTend(t) { return blendedTend(t, 'D'); }
function offArch(t) { const c = offCaller(t); return c ? c.arch : null; }
function defArch(t) { const c = defCaller(t); return c ? c.arch : null; }

// ---------- development (offseason) ----------
// Returns per-attribute multipliers: grow (how much of a player's growth is realized) and decl (how fast decline hits)
function teamDev(tid, pos) {
  if (tid < 0) return null;
  const t = T(tid), staff = {};
  for (const r of COACH_ROLES) staff[r] = C(t[r.toLowerCase()]);
  const room = pos && ROOM_COACH[pos] ? roomDevVal(tid, pos) : null;
  // football skills: the position coach's room. Physical traits stay with strength & conditioning, kicking with special teams.
  const val = k => DEV_OWNER[k] === 'OC' || DEV_OWNER[k] === 'DC' ? (room !== null ? room : 0.5 * knob(staff.HC, 'cul') + 25) : knob(staff[DEV_OWNER[k]], k);
  return {
    // a position coach's room swings more than the old coordinator-wide effect did: roughly ±25% of a young player's growth
    grow: a => { const k = ATTR_DEV[a]; return !k ? 1 : (DEV_OWNER[k] === 'OC' || DEV_OWNER[k] === 'DC') && room !== null ? 0.55 + val(k) * 0.009 : 0.7 + val(k) * 0.006; },
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
  t.staffDead = round2((t.staffDead || 0) + owedIfFired(c)); if (role === 'HC') t.hcFired = (t.hcFired || 0) + 1; delete c.prom; delete c.sal;
  c.tid = -1; t[role.toLowerCase()] = null; TEND_VER++;
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
  TEND_VER++;
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
  fillAsstVacancies();
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
  webSeason(); contractsOffseason();
  asstOffseason(recs, rank, pf, pa);
  // aging, growth, retirement
  for (const id in state.coaches) {
    const c = state.coaches[id];
    c.age++;
    const drift = c.age < 45 ? 0.8 : c.age < 60 ? 0.1 : -1.0;
    for (const k in c.k) c.k[k] = Math.round(clamp(c.k[k] + gauss(drift, 1.4), 15, 97));
    updateCoachOvr(c);
    if (c.age >= 72 || (c.age >= 64 && rand() < 0.15) || (c.tid < 0 && rand() < 0.2)) {
      if (c.tid >= 0) { const tid = c.tid; if (tid === state.userTid || (c.ovr >= 75 && !isAsst(c))) addNews(`${ROLE_SHORT[c.role] || c.role} ${cname(c)} (${T(tid).abbr}) retired.`, [tid]); vacateCoach(c); }
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
      c.tid = -1; promoteToHead(c);
    }
    // now and then a special teams coordinator gets his shot too: a manager of the whole game, not a play-caller
    else if (c.role === 'STC' && c.ovr >= 74 && c.age < 60 && rand() < 0.05) {
      if (c.tid >= 0) { T(c.tid).stc = null; addNews(`${T(c.tid).abbr} special teams coordinator ${cname(c)} leaves to pursue head coaching jobs.`, [c.tid]); }
      c.tid = -1; promoteToHead(c);
    }
  }
  fillCoachPool(9); fillAsstPool(3); TEND_VER++;
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

// =====================================================================
//  STAFF HIERARCHY
//  Tier 1-2: head coach and coordinators (full cards, above).
//  Tier 3: four specialists who bend their coordinator's playbook: pass game and run game coordinators on offense,
//          pass defense and run defense coordinators on defense. One lean, one expertise rating, a personality.
//  Tier 4: eight position coaches. Two ratings (Development, Discipline), a personality and keywords that say where
//          they come from. They run their room; on promotion the keywords become a real system and tendencies.
// =====================================================================
const SPEC_ROLES = ['PGC', 'RGC', 'DPC', 'DRC'];
const POS_ROLES = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB'];
const ASST_ROLES = [...SPEC_ROLES, ...POS_ROLES];
const ASST_LABEL = { PGC: 'Pass Game Coordinator', RGC: 'Run Game Coordinator', DPC: 'Pass Defense Coordinator', DRC: 'Run Defense Coordinator',
  QB: 'Quarterbacks Coach', RB: 'Running Backs Coach', WR: 'Receivers Coach', TE: 'Tight Ends Coach', OL: 'Offensive Line Coach', DL: 'Defensive Line Coach', LB: 'Linebackers Coach', DB: 'Defensive Backs Coach' };
const ASST_SIDE = { PGC: 'O', RGC: 'O', DPC: 'D', DRC: 'D', QB: 'O', RB: 'O', WR: 'O', TE: 'O', OL: 'O', DL: 'D', LB: 'D', DB: 'D' };
const ROOM_COACH = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL', DL: 'DL', LB: 'LB', CB: 'DB', S: 'DB' }; // player position → his position coach
const SPEC_OVER = { QB: 'PGC', WR: 'PGC', TE: 'PGC', RB: 'RGC', OL: 'RGC', DL: 'DRC', LB: 'DRC', DB: 'DPC' };      // which specialist a room answers to
for (const r of ASST_ROLES) { ROLE_LABEL[r] = ASST_LABEL[r]; ROLE_SHORT[r] = SPEC_ROLES.includes(r) ? r : r + ' coach'; }
// leans: what a specialist adds to (or takes from) his coordinator's call sheet. Values scale with his expertise.
const LEANS = {
  PGC: { VERT: ['Vertical', { deep: 1.5, pa: 0.6 }], TIMING: ['Timing', { quick: 1.2, deep: -0.8 }], PA: ['Play-action', { pa: 1.6, boot: 1.6 }], QUICK: ['Quick game', { quick: 0.9, screen: 1.6 }] },
  RGC: { ZONE: ['Zone', { zone: 0.8 }], GAP: ['Power / Gap', { zone: -0.8 }], OPTION: ['Option', { qbRun: 2.5, rpo: 1.6 }] },
  DPC: { PRESSURE: ['Pressure', { blitz: 1.6, sim: 1.6 }], MAN: ['Man-match', { man: 1.3 }], SHELL: ['Zone shell', { high: 0.9, blitz: -0.8 }] },
  DRC: { PENETRATE: ['Penetrating', { stunt: 1.6, base: -0.4 }], TWOGAP: ['Two-gap', { base: 0.8, stunt: -0.8 }] },
};
const COACH_STYLES = ['Demanding', "Players' coach", 'Teacher', 'Old school', 'Innovator', 'Motivator'];
function leanLabel(c) { const r = SPEC_ROLES.includes(c.role) ? c.role : SPEC_OVER[c.role]; return c.lean && LEANS[r] && LEANS[r][c.lean] ? LEANS[r][c.lean][0] : ''; }
function bgLabel(c) { const a = ASST_SIDE[c.role] === 'O' ? OFF_ARCH[c.bg] : DEF_ARCH[c.bg]; return a ? a.l.replace(/ \(.*\)/, '') : ''; }
function isAsst(c) { return !!c && ASST_ROLES.includes(c.role); }
function genAssistant(role, opts = {}) {
  const [first, last] = randomName(), spec = SPEC_ROLES.includes(role), side = ASST_SIDE[role];
  const q = opts.q !== undefined ? opts.q : gauss(0, 1), r = () => Math.round(clamp(gauss(54 + q * 8, 11), 15, 97));
  const archs = Object.keys(side === 'O' ? OFF_ARCH : DEF_ARCH);
  const c = { id: state.nextCid++, first, last, role, tid: -1, tier: spec ? 3 : 4, age: clamp(Math.round(gauss(spec ? 45 : 40, 7)), 27, 68),
    k: {}, t: {}, arch: null, rec: { w: 0, l: 0, t: 0, titles: 0 }, mentors: [], hist: [], yrs: 0,
    style: pick(COACH_STYLES), bg: opts.bg && archs.includes(opts.bg) ? opts.bg : pick(archs), lean: pick(Object.keys(LEANS[spec ? role : SPEC_OVER[role]])) };
  if (spec) c.exp = r(); else { c.dev = opts.dev !== undefined ? Math.round(clamp(opts.dev, 15, 97)) : r(); c.disc = r(); }
  updateCoachOvr(c);
  state.coaches[c.id] = c;
  return c;
}
function asst(t, role) { return t && t.asst ? C(t.asst[role]) : null; }
function posCoach(tid, pos) { return tid >= 0 && ROOM_COACH[pos] ? asst(T(tid), ROOM_COACH[pos]) : null; }
function specOver(tid, pos) { return tid >= 0 && ROOM_COACH[pos] ? asst(T(tid), SPEC_OVER[ROOM_COACH[pos]]) : null; }
let TEND_VER = 1; // bumped on any staff change: blended tendencies are cached per team
function setAsst(t, role, c, quiet) {
  t.asst = t.asst || {};
  const old = C(t.asst[role]);
  if (old) old.tid = -1;
  t.asst[role] = c ? c.id : null;
  if (c) { c.tid = t.id; c.yrs = 0; const boss = C(ASST_SIDE[role] === 'O' ? t.oc : t.dc) || C(t.hc); if (boss && !c.mentors.includes(boss.id)) c.mentors.push(boss.id);
    if (!quiet && t.id === state.userTid) addNews(`${t.abbr} hired ${ASST_LABEL[role].toLowerCase()} ${cname(c)}.`, [t.id], 'coach'); }
  TEND_VER++;
}
function vacateCoach(c) { // he leaves his club, whatever his job was
  if (!c || c.tid < 0) return;
  const t = T(c.tid);
  if (isAsst(c)) { if (t.asst && t.asst[c.role] === c.id) t.asst[c.role] = null; } else if (t[c.role.toLowerCase()] === c.id) t[c.role.toLowerCase()] = null;
  c.tid = -1; TEND_VER++;
}
const DEV_HANDOFF = { QB: 'dQB', RB: 'dBC', WR: 'dREC', TE: 'dREC', OL: 'dOL', DL: 'dPR', LB: 'dRD', DB: 'dCOV' }; // old coordinator ratings seed the first position coaches
function ensureAssistants(t, seed) {
  t.asst = t.asst || {};
  for (const role of ASST_ROLES) {
    if (asst(t, role)) continue;
    const side = ASST_SIDE[role], coord = C(side === 'O' ? t.oc : t.dc), bg = side === 'O' ? offArch(t) : defArch(t);
    const old = seed && coord && coord.k[DEV_HANDOFF[role]] !== undefined ? coord.k[DEV_HANDOFF[role]] + gauss(0, 6) : undefined;
    setAsst(t, role, genAssistant(role, { bg: rand() < 0.75 ? bg : undefined, dev: old }), true);
    asst(t, role).yrs = seed ? randInt(1, 5) : 0;
  }
}
function fillAsstPool(n = 3) {
  for (const role of ASST_ROLES) { const have = Object.values(state.coaches).filter(c => c.tid < 0 && c.role === role).length; for (let i = have; i < n; i++) genAssistant(role, { q: gauss(-0.2, 1) }); }
}
function fillAsstVacancies() {
  fillAsstPool(3);
  for (const t of shuffle([...state.teams])) for (const role of ASST_ROLES) {
    if (asst(t, role)) continue;
    const side = ASST_SIDE[role], bg = side === 'O' ? offArch(t) : defArch(t);
    const pool = Object.values(state.coaches).filter(c => c.tid < 0 && c.role === role).sort((a, b) => b.ovr + (b.bg === bg ? 4 : 0) + gauss(0, 4) - a.ovr - (a.bg === bg ? 4 : 0));
    setAsst(t, role, pool[0] || genAssistant(role, { bg }), true);
  }
}
// a new coordinator brings some of his own people: about half the assistants on his side turn over
function bringStaff(t, side, coord) {
  if (!t.asst) return;
  let n = 0;
  for (const role of ASST_ROLES) {
    if (ASST_SIDE[role] !== side) continue;
    const cur = asst(t, role);
    if (cur && cur.bg === coord.arch && rand() < 0.8) continue; // already speaks his language
    if (cur && rand() < 0.5) continue;
    setAsst(t, role, genAssistant(role, { bg: coord.arch, q: gauss((coord.ovr - 55) / 25, 0.9) }), true); n++;
  }
  if (n && t.id === state.userTid) addNews(`${cname(coord)} brought ${n} of his own assistant${n === 1 ? '' : 's'} with him. You can replace any of them on the Staff page.`, [t.id], 'coach');
}
// ---- what the lower tiers do ----
// development: mostly the position coach, with the head coach's culture and the specialist over the room
function roomDevVal(tid, pos) {
  const t = T(tid), pc = posCoach(tid, pos), sp = specOver(tid, pos);
  return 0.7 * (pc ? pc.dev : 38) + 0.15 * knob(C(t.hc), 'cul') + 0.15 * (sp ? sp.exp : 38);
}
function roomDisc(tid, pos) { const pc = posCoach(tid, pos); return pc ? pc.disc : 38; }
function teachMult(tid, pos) { const pc = posCoach(tid, pos), sp = specOver(tid, pos); return (0.9 + (pc ? pc.dev : 38) / 500) * (0.88 + (sp ? sp.exp : 38) / 450); } // ~0.95-1.2
// design ratings: the coordinator's plan, sharpened or dulled by the specialist for that area
const DESIGN_SPEC = { passD: ['oc', 'PGC'], runD: ['oc', 'RGC'], covD: ['dc', 'DPC'], presD: ['dc', 'DPC'], frontD: ['dc', 'DRC'] };
function designKnob(t, k) { const [ck, sr] = DESIGN_SPEC[k], sp = asst(t, sr); return 0.75 * knob(C(t[ck]), k) + 0.25 * (sp ? sp.exp : 38); }
// tendencies: the play-caller's sheet, a share of the coordinator's when the head coach calls it, bent by each specialist
function applyLean(tn, role, lean, s) {
  const L = LEANS[role] && LEANS[role][lean];
  if (!L) return;
  for (const k in L[1]) { if (typeof tn[k] !== 'number') continue; tn[k] = k === 'zone' ? round2(clamp(tn[k] + L[1][k] * s, 0.05, 0.95)) : round2(clamp(tn[k] * (1 + L[1][k] * s), 0, 0.95)); }
}
function leanStrength(t, sp) { // 8-18% from the specialist, a touch more when his position coaches think the same way
  const echo = POS_ROLES.filter(r => SPEC_OVER[r] === sp.role).map(r => asst(t, r)).filter(c => c && c.lean === sp.lean).length;
  return (0.08 + sp.exp / 1000) * (1 + 0.15 * echo);
}
const TEND_CACHE = {};
function blendedTend(t, side) {
  const key = t.id + side, hit = TEND_CACHE[key];
  if (hit && hit.ver === TEND_VER && hit.st === state) return hit.t;
  const caller = side === 'O' ? offCaller(t) : defCaller(t), coord = C(side === 'O' ? t.oc : t.dc);
  let tn;
  [caller, coord, ...SPEC_ROLES.map(r => asst(t, r))].forEach(c => { ensureOffPk(c); });
  if (!caller) tn = Object.assign({}, side === 'O' ? OFF_ARCH.WCO.t : DEF_ARCH.C3.t);
  else if (caller.role === 'HC') { tn = Object.assign({}, caller.ct); if (coord && coord.t) for (const k in tn) if (typeof tn[k] === 'number' && typeof coord.t[k] === 'number') tn[k] = round2(tn[k] * 0.7 + coord.t[k] * 0.3); }
  else tn = Object.assign({}, caller.t);
  if (side === 'O') { // the pass game and run game coordinators install their packages on top of the caller's sheet
    tn.pers = Object.assign({}, tn.pers); ensureOffSheet(tn, caller ? caller.arch : 'WCO'); tn.by = {};
    for (const r of ['PGC', 'RGC']) { const sp = asst(t, r); if (!sp || !sp.pks) continue; const b = 0.06 + sp.exp / 1000; for (const id of sp.pks) { if (!OFF_PK[id]) continue; const had = OFF_PK[id][3](tn); OFF_PK[id][2](tn, b); if (!had && OFF_PK[id][3](tn)) tn.by[id] = sp.id; else if (!had) { OFF_PK[id][2](tn, b); if (OFF_PK[id][3](tn)) tn.by[id] = sp.id; } } }
    for (const k in tn) if (typeof tn[k] === 'number') tn[k] = round2(clamp(tn[k], 0, 0.95));
  } else { const sp = asst(t, 'DRC'); if (sp) applyLean(tn, 'DRC', sp.lean, leanStrength(t, sp)); }
  if (side === 'D') { const pk = teamDefPk(t); tn.pk = pk; tn.man = pkShare(pk.sh, MAN_SHELLS); tn.high = pkShare(pk.sh, HIGH_SHELLS); tn.blitz = pkShare(pk.pr, ['BLITZ', 'FZ']); tn.sim = pk.pr.SIM || 0; tn.stunt = pk.stunt; }
  TEND_CACHE[key] = { ver: TEND_VER, st: state, t: tn };
  return tn;
}
// where the call sheet's flavour comes from, for the Staff page
function tendInfluences(t, side) {
  const out = [], caller = side === 'O' ? offCaller(t) : defCaller(t), coord = C(side === 'O' ? t.oc : t.dc);
  if (caller && caller.role === 'HC' && coord) out.push(`${cname(coord)} (coordinator) shapes about 30% of the head coach's call sheet`);
  if (side === 'D') { const sp = asst(t, 'DPC'); if (sp) { ensureDefPk(sp); out.push(`${cname(sp)} (DPC) installed: ${sp.pks.map(id => PK_NAME[id]).join(', ') || 'nothing of his own'}`); } }
  if (side === 'O') for (const r of ['PGC', 'RGC']) { const sp = asst(t, r); if (sp) { ensureOffPk(sp); out.push(`${cname(sp)} (${r}) installed: ${sp.pks.map(id => PK_NAME[id]).join(', ')}`); } }
  for (const r of SPEC_ROLES) { if (ASST_SIDE[r] !== side || r !== 'DRC') continue; const sp = asst(t, r); if (!sp) continue; const s = leanStrength(t, sp), L = LEANS[r][sp.lean];
    out.push(`${cname(sp)} (${r}): ${Object.entries(L[1]).map(([k, v]) => `${{ deep: 'deep shots', pa: 'play-action', quick: 'quick game', boot: 'bootlegs', screen: 'screens', zone: 'zone runs', qbRun: 'QB runs', rpo: 'RPOs', blitz: 'blitzes', sim: 'simulated pressure', man: 'man coverage', high: 'two-high shells', stunt: 'stunts', base: 'base personnel' }[k] || k} ${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * s * 100)}%`).join(', ')}`); }
  return out;
}
// ---- the ladder ----
function promoteToSpecialist(c) {
  const role = SPEC_OVER[c.role];
  c.role = role; c.tier = 3; c.exp = Math.round(clamp(gauss((c.dev + c.disc) / 2, 8), 20, 95));
  if (!LEANS[role][c.lean]) c.lean = pick(Object.keys(LEANS[role]));
  delete c.pks; ensureDefPk(c); ensureOffPk(c);
  c.yrs = 0; updateCoachOvr(c); TEND_VER++;
  return c;
}
// the keywords become a system: his background is the scheme, his lean is baked into the tendencies
function promoteToCoordinator(c) {
  const side = ASST_SIDE[c.role], from = c.role, role = side === 'O' ? 'OC' : 'DC', A = side === 'O' ? OFF_ARCH : DEF_ARCH;
  const base = c.exp !== undefined ? c.exp : (c.dev + c.disc) / 2;
  c.arch = A[c.bg] ? c.bg : pick(Object.keys(A));
  c.t = jitterTend(A[c.arch].t);
  if (LEANS[from]) applyLean(c.t, from, c.lean, 0.22);
  c.k = {}; for (const k of KNOBS[role]) c.k[k] = Math.round(clamp(gauss(base - 3, 9), 15, 95)); // a good assistant is a good bet, not a sure thing
  const boost = { PGC: ['passD'], RGC: ['runD'], DPC: ['covD', 'presD'], DRC: ['frontD'] }[from] || [];
  for (const k of boost) c.k[k] = Math.round(clamp(c.k[k] + 7, 15, 97));
  if (role === 'DC') { c.pk = genDefPk(c.arch); for (const id of c.pks || []) { if (SHELLS[id]) c.pk.sh[id] = (c.pk.sh[id] || 0) + 0.15; else if (PRESSURES[id]) c.pk.pr[id] = (c.pk.pr[id] || 0) + 0.12; else if (id === 'DISG') c.pk.disg = Math.min(0.6, c.pk.disg + 0.25); else if (id === 'STUNT') c.pk.stunt = Math.min(0.5, c.pk.stunt + 0.1); } normShares(c.pk.sh); normShares(c.pk.pr); }
  if (role === 'OC') { ensureOffSheet(c.t, c.arch); c.t.pers = Object.assign({}, c.t.pers); for (const id of c.pks || []) if (OFF_PK[id]) OFF_PK[id][2](c.t, 0.15); for (const k in c.t) if (typeof c.t[k] === 'number') c.t[k] = round2(clamp(c.t[k], 0, 0.95)); }
  delete c.pks;
  c.role = role; c.tier = 2; delete c.exp; delete c.dev; delete c.disc; c.promoted = state.season;
  updateCoachOvr(c); TEND_VER++;
  return c;
}
// a coordinator becomes a head coach: he keeps his side of the ball and often the play sheet; a special teams man runs the building and leaves the calls to his coordinators
function promoteToHead(c) {
  const from = c.role, side = from === 'OC' ? 'O' : from === 'DC' ? 'D' : 'ST', arch = c.arch, st = side === 'ST';
  const num = (v, m, sd) => v !== undefined ? v : Math.round(clamp(gauss(m, sd), 20, 90));
  c.role = 'HC';
  c.k = { gm: Math.round(clamp(gauss(st ? 55 : 50, 10), 20, 90)), cul: Math.round(clamp(gauss(st ? 56 : 52, 11), 20, 92)), pc: num(c.k.pc, 42, 8), adp: num(c.k.adp, 50, 9) };
  c.t = { aggr: round2(clamp(gauss(0.5, 0.17), 0.05, 0.95)), clock: round2(clamp(gauss(0.5, 0.17), 0.05, 0.95)), bg: side };
  if (st) { c.t.caller = null; delete c.ct; c.arch = null; delete c.pk; }
  else { makeCaller(c, arch); if (!c.t.caller && rand() < 0.5) { c.t.caller = side; c.arch = arch; c.ct = jitterTend((side === 'O' ? OFF_ARCH : DEF_ARCH)[arch].t); } }
  c.promoted = state.season; updateCoachOvr(c); TEND_VER++;
  return c;
}
function promoteHeadCost(c) { return round2(Math.max(c.sal || 0, coachAsk(c, 'HC') * 0.85)); } // an in-house promotion comes a little cheaper than the open market
function userPromote(cid) { // from the Staff page: move one of your own assistants up into an open job above him
  const c = C(cid), t = T(state.userTid);
  if (c && c.tid === t.id && ['OC', 'DC', 'STC'].includes(c.role)) {
    if (t.hc) return 'Let your head coach go first';
    const sal = promoteHeadCost(c);
    if (sal - (c.sal || 0) > staffRoom(t.id) + 0.001) return `Not enough staff budget: he would want ${fmtMoney(sal)} as head coach`;
    const was = ROLE_LABEL[c.role].toLowerCase(), key = c.role.toLowerCase();
    t[key] = null; c.tid = -1; delete c.prom; promoteToHead(c); hireCoach(t.id, c.id, true);
    signCoachContract(c, sal, askYears(c, 'HC'), askGtd(c, 'HC')); setCaller(t);
    addNews(`${t.abbr} promoted ${was} ${cname(c)} to head coach.`, [t.id], 'coach');
    return null;
  }
  if (!c || c.tid !== t.id || !isAsst(c)) return 'He is not on your staff';
  if (SPEC_ROLES.includes(c.role)) {
    const key = ASST_SIDE[c.role] === 'O' ? 'oc' : 'dc';
    if (t[key]) return 'Fire your coordinator first';
    const name = cname(c); t.asst[c.role] = null; c.tid = -1; promoteToCoordinator(c); hireCoach(t.id, c.id, true);
    addNews(`${t.abbr} promoted ${name} to ${ROLE_LABEL[c.role].toLowerCase()} (${schemeLabel(c)}).`, [t.id], 'coach');
  } else {
    const up = SPEC_OVER[c.role];
    if (asst(t, up)) return 'That job is not open';
    t.asst[c.role] = null; promoteToSpecialist(c); setAsst(t, up, c, true);
    addNews(`${t.abbr} promoted ${cname(c)} to ${ASST_LABEL[up].toLowerCase()}.`, [t.id], 'coach');
  }
  return null;
}
function asstOffseason(recs, rank, pf, pa) {
  for (const t of state.teams) {
    if (!t.asst) continue;
    const r = recs[t.id];
    for (const role of ASST_ROLES) { const c = asst(t, role); if (!c) continue; c.yrs = (c.yrs || 0) + 1; c.hist.push({ s: state.season, tid: t.id, role, w: r.w, l: r.l, off: rank(pf, r.pf, true), def: rank(pa, r.pa, false) }); if (c.hist.length > 25) c.hist.shift(); }
  }
  for (const c of Object.values(state.coaches)) {
    if (!isAsst(c)) continue;
    const drift = c.age < 42 ? 0.9 : c.age < 58 ? 0.1 : -0.9;
    for (const k of ['exp', 'dev', 'disc']) if (c[k] !== undefined) c[k] = Math.round(clamp(c[k] + gauss(drift, 1.5), 15, 97));
    updateCoachOvr(c);
  }
  // the ladder: good position coaches get specialist jobs, good specialists get coordinator interviews
  for (const c of Object.values(state.coaches)) {
    if (!isAsst(c) || c.age >= 62) continue;
    const mine = c.tid === state.userTid && !isAI(state.userTid);
    if (SPEC_ROLES.includes(c.role) && c.exp >= 66 && (c.yrs || 0) >= 2 && rand() < 0.14) {
      if (c.tid >= 0) { if (mine) addNews(`${ASST_LABEL[c.role]} ${cname(c)} is leaving to interview for coordinator jobs.`, [c.tid], 'coach'); vacateCoach(c); }
      promoteToCoordinator(c);
    } else if (POS_ROLES.includes(c.role) && (c.dev + c.disc) / 2 >= 64 && (c.yrs || 0) >= 2 && rand() < 0.1) {
      if (c.tid >= 0) { if (mine) addNews(`${ASST_LABEL[c.role]} ${cname(c)} is leaving for a bigger job elsewhere.`, [c.tid], 'coach'); vacateCoach(c); }
      promoteToSpecialist(c);
    }
  }
  // other clubs turn over a few assistants every year
  for (const t of state.teams) { if (!isAI(t.id) || !t.asst) continue; for (const role of ASST_ROLES) { const c = asst(t, role); if (c && rand() < (c.ovr < 42 ? 0.3 : 0.05)) vacateCoach(c); } }
  TEND_VER++;
}
// ---- how you see them: words, and a little unsure until you have worked with a man ----
function asstWord(c, key) {
  if (!coachKnown(c)) return "Not interviewed"; // during the search you only know your own staff and the men you have sat down with
  const mine = c.tid === state.userTid, sd = mine ? ((c.yrs || 0) >= 3 ? 2 : (c.yrs || 0) >= 1 ? 6 : 10) : 12;
  const v = c[key] + hashGauss(c.id, 700 + key.charCodeAt(1), 5) * sd;
  return v >= 78 ? 'Excellent' : v >= 64 ? 'Good' : v >= 46 ? 'Average' : v >= 34 ? 'Below average' : 'Poor';
}
function asstWordCls(w) { return w === 'Excellent' || w === 'Good' ? 'good' : w === 'Poor' || w === 'Below average' ? 'bad' : ''; }

// =====================================================================
//  THE COACHING SEARCH
//  Coaches are a web: men who have worked together are tied to each other, and a coach on the market has "his guys".
//  Staff slots are currency. Promise one and the coach you are courting brings his man; keep it and the job is yours
//  to fill. Interviews reveal what a candidate wants: play-calling, staff slots, a player re-signed, money, security.
//  The carousel runs over four days, and every other club is hiring from the same pool.
// =====================================================================
const BOSS = { OC: 'HC', DC: 'HC', STC: 'HC', SC: 'HC', PGC: 'OC', RGC: 'OC', DPC: 'DC', DRC: 'DC', QB: 'PGC', WR: 'PGC', TE: 'PGC', RB: 'RGC', OL: 'RGC', DB: 'DPC', DL: 'DRC', LB: 'DRC' };
const ALL_ROLES = [...COACH_ROLES, ...ASST_ROLES];
const ROLE_TIER = { HC: 1, OC: 2, DC: 2, STC: 2, SC: 2, PGC: 3, RGC: 3, DPC: 3, DRC: 3, QB: 4, RB: 4, WR: 4, TE: 4, OL: 4, DL: 4, LB: 4, DB: 4 };
const CAROUSEL_DAYS = 4, DAY_NAME = ['Head coaches', 'Coordinators', 'Specialists', 'Position coaches'];
// interviews you get for each job, by level: head coach, coordinators, specialists, position coaches
const IV_TIER = { 1: 5, 2: 4, 3: 4, 4: 3 };
function ivLeftOf(role) { const car = state.car; return !car ? 0 : car.ivLeft[role] !== undefined ? car.ivLeft[role] : IV_TIER[ROLE_TIER[role]] || 0; }
function subRoles(role) { const out = []; const walk = r => { for (const k in BOSS) if (BOSS[k] === r) { out.push(k); walk(k); } }; walk(role); return out; }
function staffCoach(t, role) { return COACH_ROLES.includes(role) ? C(t[role.toLowerCase()]) : asst(t, role); }
function roleName(r) { return ROLE_LABEL[r] || r; }
// ---- the web ----
function linkOf(a, b) { return a && b && a.links ? (a.links[b.id] || 0) : 0; }
function addLink(a, b, v) { if (!a || !b || a === b) return; a.links = a.links || {}; b.links = b.links || {}; const n = round2(clamp((a.links[b.id] || 0) + v, 0, 1)); if (n <= 0.02) { delete a.links[b.id]; delete b.links[a.id]; } else a.links[b.id] = b.links[a.id] = n; }
function linkWord(v) { return v >= 0.7 ? 'right-hand man' : v >= 0.5 ? 'close' : v >= 0.3 ? 'has worked with him' : 'knows him'; }
function isAbove(a, b) { let r = b; while (BOSS[r]) { r = BOSS[r]; if (r === a) return true; } return false; }
// a season together ties a staff: strongest up and down the chain of command
function webSeason() {
  for (const c of Object.values(state.coaches)) if (c.links) for (const id in c.links) { const o = C(+id); if (!o) { delete c.links[id]; continue; } if (o.tid !== c.tid || c.tid < 0) c.links[id] = round2(c.links[id] * 0.95); if (c.links[id] < 0.05) delete c.links[id]; }
  for (const t of state.teams) { const st = ALL_ROLES.map(r => staffCoach(t, r)).filter(Boolean); for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) addLink(st[i], st[j], isAbove(st[i].role, st[j].role) || isAbove(st[j].role, st[i].role) ? 0.16 : 0.05); }
}
function seedWeb() { // a league that already has a history
  for (const t of state.teams) { const st = ALL_ROLES.map(r => staffCoach(t, r)).filter(Boolean); for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) if (!linkOf(st[i], st[j])) { const chain = isAbove(st[i].role, st[j].role) || isAbove(st[j].role, st[i].role); addLink(st[i], st[j], chain ? 0.15 + rand() * 0.6 : rand() * 0.3); } }
  const free = Object.values(state.coaches).filter(c => c.tid < 0);
  for (const c of free) { if (c.links && Object.keys(c.links).length) continue;     const n = c.college ? 0 : ROLE_TIER[c.role] <= 2 ? Math.round(repOf(c) * 8 + rand() * 2) : randInt(0, 2); // the longer a man has been around, the more people he has
    for (let i = 0; i < n; i++) { const o = pick(free); if (o !== c && ROLE_TIER[o.role] !== ROLE_TIER[c.role]) addLink(c, o, 0.25 + rand() * 0.65); } }
}
// ---- reputation, contracts, the staff budget ----
function repOf(c) { // 0..1: what the league thinks of him
  const yrs = Math.max(c.hist ? c.hist.length : 0, c.college ? 0 : clamp((c.age - 36) / 2, 0, 10)), wins = c.role === 'HC' && c.rec ? c.rec.w / Math.max(1, c.rec.w + c.rec.l) - 0.5 : 0;
  return clamp((c.ovr - 45) / 45 * 0.6 + Math.min(yrs, 10) / 10 * 0.3 + wins * 0.6 + (c.rec && c.rec.titles ? 0.15 : 0) - (c.college ? 0.25 : 0), 0, 1);
}
function repLabel(c) { const r = repOf(c); return c.college ? 'College ranks' : r >= 0.72 ? 'Proven winner' : r >= 0.52 ? 'Established' : r >= 0.34 ? 'On the rise' : 'Unproven'; }
function coachAsk(c, role) {
  role = role || c.role; const v = c.ovr, k = (state.cap || 280) / 280;
  const base = role === 'HC' ? 4 + (v - 50) * 0.24 : role === 'OC' || role === 'DC' ? 1.2 + (v - 50) * 0.09 : role === 'STC' || role === 'SC' ? 0.6 + (v - 50) * 0.03 : SPEC_ROLES.includes(role) ? 0.55 + (v - 50) * 0.02 : 0.32 + (v - 50) * 0.012;
  const floor = role === 'HC' ? 3 : role === 'OC' || role === 'DC' ? 0.9 : SPEC_ROLES.includes(role) ? 0.4 : 0.22;
  return round2(Math.max(floor, base) * k * (c.college ? 0.65 : 1));
}
function askYears(c, role) { const r = repOf(c); return (role || c.role) === 'HC' ? (r >= 0.6 ? 5 : 4) : ROLE_TIER[role || c.role] === 2 ? 3 : 2; }
function askGtd(c, role) { const r = repOf(c), y = askYears(c, role); return r >= 0.7 ? y : r >= 0.45 ? Math.min(y, 2) : 1; }
function ensureCoachContracts() {
  for (const c of Object.values(state.coaches)) if (c.tid >= 0 && c.sal === undefined) { c.sal = coachAsk(c); c.cyrs = randInt(1, askYears(c)); c.cgtd = Math.min(c.cyrs, randInt(0, 2)); }
  for (const t of state.teams) if (t.staffBud === undefined) t.staffBud = round1((27 + rand() * 9) * (state.cap || 280) / 280);
}
function staffPayroll(tid) { const t = T(tid); return round2(ALL_ROLES.reduce((s, r) => { const c = staffCoach(t, r); return s + (c ? c.sal || 0 : 0); }, 0) + (t.staffDead || 0)); }
function staffRoom(tid) { return round2(T(tid).staffBud - staffPayroll(tid)); }
function owedIfFired(c) { return round2((c.sal || 0) * Math.max(0, (c.cgtd || 0))); }
function signCoachContract(c, sal, yrs, gtd) { c.sal = round2(sal); c.cyrs = yrs; c.cgtd = Math.min(yrs, gtd); }
function contractsOffseason() { // a year comes off every deal; guaranteed money from firings clears; expired deals roll over at market
  for (const t of state.teams) { t.staffDead = 0; t.staffBud = round1(t.staffBud * 1.05); }
  for (const c of Object.values(state.coaches)) { if (c.tid < 0 || c.sal === undefined) continue; c.cyrs = (c.cyrs || 1) - 1; c.cgtd = Math.max(0, (c.cgtd || 0) - 1);
    if (c.cyrs <= 0) { signCoachContract(c, Math.max(c.sal, coachAsk(c)), 2, 1); if (c.tid === state.userTid && ROLE_TIER[c.role] <= 2) addNews(`${ROLE_SHORT[c.role]} ${cname(c)}'s contract rolled over: 2 years at ${fmtMoney(c.sal)}.`, [c.tid], 'coach'); } }
}
// ---- who is whose ----
// can coach x take job `role` on team t? Never a sideways move from another club; a step up is fine.
function fitsJob(x, role, t) {
  if (x.tid === t.id) return false;
  const same = x.role === role, up = (POS_ROLES.includes(x.role) && SPEC_OVER[x.role] === role) || (SPEC_ROLES.includes(x.role) && role === (ASST_SIDE[x.role] === 'O' ? 'OC' : 'DC'));
  if (x.tid < 0) return same || up;
  if (x.hiredS === state.season && state.car) return false; // he took a job this week
  return up || (same && t.id === state.userTid && !!state.car); // employed elsewhere: a promotion, or a sideways move if you make it worth his while
}
function isLateral(c, role) { return c.tid >= 0 && c.tid !== state.userTid && ROLE_TIER[role] >= ROLE_TIER[c.role]; }
// will his club fight to keep him? 0..1, falling as your offer pulls away from what he makes now
function clubMatchChance(c, sal) { const now = c.sal || coachAsk(c), r = sal / Math.max(0.05, now); return clamp(0.3 + (c.ovr - 62) * 0.02, 0.1, 0.8) * (r >= 1.5 ? 0.35 : r >= 1.3 ? 0.6 : 1); }
function clubMatchWord(p) { return p >= 0.55 ? 'His club will probably match to keep him' : p >= 0.3 ? 'His club may match to keep him' : 'His club is unlikely to fight for him'; }
function guysOf(c, role, t) { // the men he would bring, strongest tie first, one per job under him
  const out = [], used = new Set(), subs = subRoles(role), rep = repOf(c), cut = 0.75 - 0.45 * rep;
  const cands = Object.keys(c.links || {}).map(id => C(+id)).filter(Boolean).sort((a, b) => linkOf(c, b) - linkOf(c, a));
  for (const x of cands) { const w = linkOf(c, x); if (w < Math.max(0.3, cut) || used.has(x.id)) continue;
    const r = subs.find(s => fitsJob(x, s, t) && !out.some(o => o.role === s)); if (!r) continue;
    out.push({ role: r, cid: x.id, w, firm: w >= 0.72 && rep >= 0.55 }); used.add(x.id); }
  return out;
}
function wantsCall(c, role) {
  role = role || c.role;
  if (role === 'HC') return c.t && c.t.caller ? (repOf(c) >= 0.55 || c.k.pc >= 72 ? 'hard' : 'soft') : 'none';
  if (role === 'OC' || role === 'DC') return c.k.pc >= 72 && repOf(c) >= 0.45 ? 'hard' : c.k.pc >= 55 ? 'soft' : 'none';
  return 'none';
}
function callSide(c, role) { role = role || c.role; return role === 'HC' ? (c.t ? c.t.caller : null) : role === 'OC' ? 'O' : role === 'DC' ? 'D' : null; }
// what he wants from you (worked out once, when you first sit down with him)
function demandsOf(c, role) {
  const car = state.car, u = state.userTid, t = T(u); role = role || c.role;
  if (car && car.dem[c.id] && car.dem[c.id].role === role) return car.dem[c.id];
  const d = { role, call: wantsCall(c, role), slots: guysOf(c, role, t), resign: null, sal: coachAsk(c, role), yrs: askYears(c, role), gtd: askGtd(c, role) };
  if (c.tid >= 0 && c.tid !== u) d.sal = round2(Math.max(d.sal, (c.sal || 0) * (isLateral(c, role) ? 1.2 : 1.08))); // a man with a job does not move for the same money
  if (ROLE_TIER[role] <= 2 && role !== 'STC' && role !== 'SC' && hashGauss(c.id, 91, state.season) > 0.5) {
    const side = role === 'OC' ? 'off' : role === 'DC' ? 'def' : c.t && c.t.bg === 'D' ? 'def' : 'off';
    const p = rosterOf(u).filter(x => x.expiring && SPOTS[x.spot].side === side && ['Elite', 'All-Pro', 'Starter'].includes(tierOf(x))).sort((a, b) => uOvr(b) - uOvr(a))[0];
    if (p) d.resign = p.id;
  }
  if (car) car.dem[c.id] = d;
  return d;
}
// who already holds play-calling on a side (by promise)
function callHeldBy(t, side) { for (const r of ['HC', side === 'O' ? 'OC' : 'DC']) { const c = staffCoach(t, r); if (c && c.prom && c.prom.call === side) return c; } return null; }
function teamAppeal(t) {
  const qb = rosterOf(t.id).filter(p => p.pos === 'QB').sort((a, b) => perOvr(b) - perOvr(a))[0], r = standings()[t.id] || { w: 8, l: 9, t: 0 };
  return clamp(((qb ? perOvr(qb) : 60) - 72) * 0.5, -8, 8) + (r.w / Math.max(1, r.w + r.l + r.t) - 0.5) * 16 - 4 * (t.hcFired || 0);
}
function outsideOffer(c, role) { const open = state.teams.filter(x => x.id !== state.userTid && !staffCoach(x, role)).length; return 52 + (c.ovr - 60) * 0.9 + Math.min(open, 4) * 2 + hashGauss(c.id, 33, state.season) * 5; }
// how he feels about an offer: { score, need, ok, hard (deal-breaker text), notes }
function judgeOffer(c, o) {
  const t = T(state.userTid), d = demandsOf(c, o.role), notes = [];
  let s = 50 + teamAppeal(t), hard = null;
  if (ROLE_TIER[o.role] < ROLE_TIER[c.role]) { s += 12; notes.push(['+', 'A step up for him']); }
  if (c.tid < 0) s += 5;
  if (state.car && state.car.blocked && state.car.blocked[c.id]) hard = 'His club matched your offer and he is staying put';
  if (isLateral(c, o.role)) {
    const home = T(c.tid), tie = Math.max(0, ...ALL_ROLES.map(r => linkOf(c, staffCoach(t, r))));
    s -= 12 + clamp(teamAppeal(home), -8, 10) * 0.6; notes.push(['-', `Under contract with ${home.abbr} in the same job: it takes a clearly better offer`]);
    if (tie >= 0.3) { s += tie * 14; notes.push(['+', 'Has people he trusts on your staff']); }
    if ((c.cyrs || 1) <= 1) { s += 5; notes.push(['+', 'His deal there is almost up']); }
  }
  const ratio = o.sal / d.sal; s += clamp((ratio - 1) * 45, -30, isLateral(c, o.role) ? 30 : 18); // a man with a job can be bought, at a price if (ratio < 0.92) notes.push(['-', 'Money is light']); else if (ratio > 1.08) notes.push(['+', 'Strong money']);
  s += (o.yrs - d.yrs) * 3 + (o.gtd - d.gtd) * 5; if (o.gtd < d.gtd) notes.push(['-', 'Wants more guaranteed years']);
  if (d.call !== 'none') { if (o.call) s += d.call === 'hard' ? 2 : 6; else if (d.call === 'hard') hard = 'He will not come unless he calls the plays'; else { s -= 8; notes.push(['-', 'Would like to call plays']); } }
  for (const g of d.slots) { if (o.slots[g.role] === g.cid) { s += g.w * 6; } else { s -= g.w * (g.firm ? 15 : 6); notes.push(['-', `Wants ${cname(C(g.cid))} as his ${roleName(g.role).toLowerCase()}${g.firm ? ' (insists)' : ''}`]); } }
  if (d.resign) { if (o.resign) s += 2; else { s -= 15; notes.push(['-', `Wants ${pname(P(d.resign))} re-signed`]); } }
  else if (o.resign) s += 3;
  // a man tied to someone still on the market may hold out to follow him
  if (ROLE_TIER[o.role] >= 2 && state.car && state.car.day < CAROUSEL_DAYS - 1) {
    const boss = Object.keys(c.links || {}).map(id => C(+id)).find(b => b && b.tid < 0 && linkOf(c, b) >= 0.7 && ROLE_TIER[b.role] < ROLE_TIER[o.role] && isAbove(b.role, o.role));
    if (boss) hard = `He is waiting to see where ${cname(boss)} lands`;
  }
  const need = isLateral(c, o.role) ? 60 : Math.max(58, outsideOffer(c, o.role)); // he is not shopping himself: there is no outside market to beat, only his own comfort
  return { score: s, need, ok: !hard && s >= need, hard, notes };
}
function interestLabel(j) { if (j.hard) return ['Will not sign', 'bad']; const d = j.score - j.need; return d >= 0 ? ['Ready to sign', 'good'] : d >= -6 ? ['Close', 'warn'] : d >= -15 ? ['Needs more', 'warn'] : ['Not interested', 'bad']; }
function interview(cid, role) { // the job you are interviewing him for is the one that spends the interview
  const c = C(cid), car = state.car;
  if (!car || !c) return 'The search is closed';
  if (car.iv[cid]) return null;
  const key = role || c.role;
  if (ivLeftOf(key) <= 0) return `No interviews left for ${roleName(key).toLowerCase()} candidates`;
  car.ivLeft[key] = ivLeftOf(key) - 1;
  car.iv[cid] = 1; demandsOf(c, key);
  return null;
}
// during the search you only really know your own staff and the men you have sat down with
function coachKnown(c) { return !state.car || c.tid === state.userTid || !!state.car.iv[c.id]; }
// ---- putting a man in a job ----
function placeCoach(t, role, c, quiet) {
  if (c.tid >= 0 && c.tid !== t.id) vacateCoach(c);
  if (c.role !== role) { if (POS_ROLES.includes(c.role) && SPEC_ROLES.includes(role)) promoteToSpecialist(c); else if (SPEC_ROLES.includes(c.role)) promoteToCoordinator(c); else if (role === 'HC' && ['OC', 'DC', 'STC'].includes(c.role)) promoteToHead(c); }
  c.hiredS = state.season;
  const cur = staffCoach(t, role);
  if (cur && cur !== c) dismissCoach(t, cur, quiet);
  if (COACH_ROLES.includes(role)) hireCoach(t.id, c.id, true); else setAsst(t, role, c, true);
  if (c.sal === undefined || quiet) signCoachContract(c, coachAsk(c), askYears(c), askGtd(c));
  delete c.college;
}
function dismissCoach(t, c, quiet) { // let go: guaranteed years stay on the budget
  t.staffDead = round2((t.staffDead || 0) + owedIfFired(c));
  if (t.locks) for (const r in t.locks) if (t.locks[r] === c.id) delete t.locks[r];
  if (c.role === 'HC') t.hcFired = (t.hcFired || 0) + 1;
  delete c.prom; delete c.sal; vacateCoach(c);
  if (!quiet) addNews(`${t.abbr} let ${ROLE_SHORT[c.role] || c.role} ${cname(c)} go.`, [t.id], 'coach');
}
function setCaller(t) { // play-calling follows the promises; without one the head coach's own habit stands
  const hc = C(t.hc); if (!hc) return;
  for (const side of ['O', 'D']) { const co = C(side === 'O' ? t.oc : t.dc);
    if (co && co.prom && co.prom.call === side && hc.t.caller === side) { hc.t.caller = null; }
    if (hc.prom && hc.prom.call === side && hc.t.caller !== side) { hc.t.caller = side; if (!hc.ct || !hc.arch) { const A = side === 'O' ? OFF_ARCH : DEF_ARCH; hc.arch = A[hc.arch] ? hc.arch : pick(Object.keys(A)); hc.ct = jitterTend(A[hc.arch].t); } } }
  TEND_VER++;
}
// you and the candidate have a deal
function userHire(cid, o) {
  const c = C(cid), t = T(state.userTid), j = judgeOffer(c, o);
  if (!j.ok) return j.hard || 'He turned the offer down';
  const cur = staffCoach(t, o.role);
  if (t.locks && t.locks[o.role] && cur) return `That job was promised to ${cname(C(t.locks[o.role]))}'s staff`;
  const cost = o.sal - (cur ? cur.sal || 0 : 0) + (cur ? owedIfFired(cur) : 0);
  if (cost > staffRoom(t.id) + 0.001) return 'Over your staff budget';
  if (isLateral(c, o.role) && state.car) { // his club gets one chance to match
    const car = state.car, home = T(c.tid); car.roll = car.roll || {}; car.blocked = car.blocked || {};
    if (car.roll[c.id] === undefined) car.roll[c.id] = rand();
    if (car.roll[c.id] < clubMatchChance(c, o.sal)) {
      car.blocked[c.id] = 1; signCoachContract(c, round2(Math.max(c.sal || 0, o.sal)), Math.max(c.cyrs || 1, 2), Math.max(c.cgtd || 0, 1));
      addNews(`${home.abbr} matched ${t.abbr}'s offer to keep ${roleName(c.role).toLowerCase()} ${cname(c)}: ${fmtMoney(c.sal)}/yr.`, [t.id, home.id], 'coach');
      return `${home.abbr} matched your offer. He is staying.`;
    }
    addNews(`${t.abbr} hired ${cname(c)} away from ${home.abbr}.`, [t.id, home.id], 'coach');
  }
  placeCoach(t, o.role, c);
  signCoachContract(c, o.sal, o.yrs, o.gtd);
  c.prom = { call: o.call ? callSide(c, o.role) : null, slots: Object.assign({}, o.slots), resign: o.resign ? (demandsOf(c, o.role).resign || o.resignPid || null) : null };
  addNews(`${t.abbr} hired ${roleName(o.role).toLowerCase()} ${cname(c)}${schemeLabel(c) ? ' (' + schemeLabel(c) + ')' : ''}: ${o.yrs} yr, ${fmtMoney(o.sal)}/yr.`, [t.id], 'coach');
  // the slots you promised: his men come with him, and those jobs are his to keep
  t.locks = t.locks || {};
  for (const role in o.slots) { const g = C(o.slots[role]); if (!g || !fitsJob(g, role, t)) continue; placeCoach(t, role, g, true); t.locks[role] = c.id; addNews(`${cname(c)} brought ${cname(g)} as his ${roleName(role).toLowerCase()}.`, [t.id], 'coach'); queueRequests(g, role); }
  setCaller(t);
  if (state.car) delete state.car.dem[c.id];
  return null;
}
// a man who arrives with his boss has people of his own: these come to you as requests, not demands
function queueRequests(g, role) {
  const t = T(state.userTid), car = state.car; if (!car) return;
  for (const x of guysOf(g, role, t)) if (!(t.locks && t.locks[x.role])) car.req.push({ by: g.id, role: x.role, cid: x.cid, w: x.w });
}
function answerRequest(i, yes) {
  const car = state.car, r = car.req[i], t = T(state.userTid); if (!r) return 'No such request';
  car.req.splice(i, 1);
  if (!yes) return null;
  const g = C(r.cid), by = C(r.by);
  if (!g || !by || !fitsJob(g, r.role, t)) return 'He is no longer available';
  const cur = staffCoach(t, r.role), cost = coachAsk(g, r.role) - (cur ? cur.sal || 0 : 0) + (cur ? owedIfFired(cur) : 0);
  if (cost > staffRoom(t.id) + 0.001) return 'Over your staff budget';
  placeCoach(t, r.role, g, true); (t.locks = t.locks || {})[r.role] = by.id; (by.prom = by.prom || { slots: {} }).slots[r.role] = g.id;
  addNews(`${cname(by)} brought ${cname(g)} as his ${roleName(r.role).toLowerCase()}.`, [t.id], 'coach');
  queueRequests(g, r.role);
  return null;
}
function userFire(role) {
  const t = T(state.userTid), c = staffCoach(t, role); if (!c) return 'Nobody holds that job';
  if (t.locks && t.locks[role] && C(t.locks[role]) && C(t.locks[role]).tid === t.id) return `You promised ${cname(C(t.locks[role]))} that job for his man. Promises are kept.`;
  dismissCoach(t, c); return null;
}
// ---- other clubs: a hire brings the men tied to him ----
function bringNetwork(t, c, role) {
  let n = 0;
  for (const g of guysOf(c, role, t)) { const cur = staffCoach(t, g.role); if (cur && linkOf(c, cur) >= g.w) continue; if (rand() < 0.35 + g.w * 0.5) { placeCoach(t, g.role, C(g.cid), true); n++; bringNetwork(t, C(g.cid), g.role); } }
  return n;
}
function aiHireRoles(roles) {
  for (const role of roles) for (const t of shuffle([...state.teams])) {
    if (!isAI(t.id) || staffCoach(t, role)) continue;
    const pool = Object.values(state.coaches).filter(c => c.tid < 0 && (c.role === role || fitsJob(c, role, t)) && !(c.role !== role && ROLE_TIER[c.role] - ROLE_TIER[role] !== 1));
    const boss = BOSS[role] ? staffCoach(t, BOSS[role]) : null;
    const sc = c => (c.role === role ? c.ovr : c.ovr - 4) + (boss ? linkOf(boss, c) * 14 : 0) + (COACH_ROLES.includes(role) && c.role === role ? hireScore(t, c) - c.ovr : 0) + gauss(0, 3);
    pool.sort((a, b) => sc(b) - sc(a));
    const c = pool[0] || (COACH_ROLES.includes(role) ? genCoach(role) : genAssistant(role, { bg: ASST_SIDE[role] === 'O' ? offArch(t) : defArch(t) }));
    placeCoach(t, role, c, true);
    if (ROLE_TIER[role] <= 2 || t.id === state.userTid) addNews(`${t.abbr} hired ${roleName(role).toLowerCase()} ${cname(c)}${schemeLabel(c) ? ' (' + schemeLabel(c) + ')' : ''}.`, [t.id], 'coach');
    if (ROLE_TIER[role] <= 3) bringNetwork(t, c, role);
  }
  TEND_VER++;
}
// ---- other clubs come for your people ----
// A club with an open job can ask for one of yours: a step up for him, or the same job next to a man he is tied to.
// A sideways move you can match. A promotion is hard to talk a man out of.
// There is no limit on how many come calling: good coaches on winning clubs draw the most interest, each man is approached once a year,
// and every offer you match makes him dearer. What keeps a great staff together is money.
const RAID = { promo: 0.10, lateral: 0.12, tie: 0.3 };
function genRaids(roles) {
  const car = state.car, u = state.userTid, ut = T(u);
  if (!car || isAI(u)) return;
  car.raids = car.raids || []; car.raided = car.raided || {};
  const ur = standings()[u] || { w: 8, l: 9, t: 0 }, heat = 0.5 + clamp((ur.w / Math.max(1, ur.w + ur.l + ur.t) - 0.4) / 0.4, 0, 1); // winners get raided
  for (const role of roles) for (const t of shuffle([...state.teams])) {
    if (t.id === u || staffCoach(t, role) || car.raids.some(r => r.tid === t.id)) continue;
    const boss = BOSS[role] ? staffCoach(t, BOSS[role]) : null;
    const cands = ALL_ROLES.map(r => staffCoach(ut, r)).filter(c => c && c.hiredS !== state.season && !car.raided[c.id]).map(c => {
      const same = c.role === role, up = (POS_ROLES.includes(c.role) && SPEC_OVER[c.role] === role) || (SPEC_ROLES.includes(c.role) && role === (ASST_SIDE[c.role] === 'O' ? 'OC' : 'DC')) || (role === 'HC' && (c.role === 'OC' || c.role === 'DC'));
      if (!same && !up) return null;
      const tie = boss ? linkOf(boss, c) : 0;
      const q = clamp((c.ovr - 60) / 25, 0, 1.2); // how good the league thinks he is
      const p = up ? 0.01 + q * RAID.promo * heat + tie * RAID.tie : Math.max(0, q - 0.6) * RAID.lateral * heat + (tie >= 0.3 ? tie * RAID.tie : 0);
      return { c, up, tie, p };
    }).filter(x => x && rand() < x.p).sort((a, b) => b.c.ovr + b.tie * 10 - a.c.ovr - a.tie * 10);
    const x = cands[0]; if (!x) continue;
    const sal = round2(Math.max(coachAsk(x.c, role), (x.c.sal || 0) * (x.up ? 1.1 : 1.2)));
    car.raids.push({ cid: x.c.id, tid: t.id, role, promo: x.up, sal, yrs: askYears(x.c, role), tie: x.tie, roll: rand(), by: boss ? boss.id : null }); car.raided[x.c.id] = 1;
    addNews(`${t.abbr} want your ${roleName(x.c.role).toLowerCase()} ${cname(x.c)}${x.up ? ` as their ${roleName(role).toLowerCase()}` : ''}${boss && x.tie >= 0.4 ? ` (${cname(boss)} asked for him)` : ''}. Answer on the Staff page before you advance.`, [u], 'coach');
  }
}
function raidStayChance(r) { const c = C(r.cid), hc = C(T(state.userTid).hc); return r.promo ? 0.3 + (hc && linkOf(hc, c) >= 0.5 ? 0.2 : 0) : r.tie >= 0.6 ? 0.5 : 0.85; }
function raidLeave(r) {
  const c = C(r.cid), ut = T(state.userTid), t = T(r.tid); if (!c || c.tid !== ut.id || staffCoach(t, r.role)) return false;
  const was = roleName(c.role).toLowerCase();
  if (ut.locks) for (const k in ut.locks) if (ut.locks[k] === c.id) delete ut.locks[k];
  delete c.prom; placeCoach(t, r.role, c, true); signCoachContract(c, r.sal, r.yrs, askGtd(c, r.role));
  addNews(`${ut.abbr} ${was} ${cname(c)} left to become ${t.abbr}'s ${roleName(r.role).toLowerCase()}.`, [ut.id, t.id], 'coach');
  return true;
}
function resolveRaids() { const car = state.car; if (!car || !car.raids) return; for (const r of car.raids) raidLeave(r); car.raids = []; }
// keep = pay him what they offered to stay. Returns a message for the player.
function answerRaid(i, keep) {
  const car = state.car, r = car && car.raids ? car.raids[i] : null; if (!r) return 'That offer is gone';
  const c = C(r.cid), t = T(state.userTid), club = T(r.tid);
  car.raids.splice(i, 1);
  if (!c || c.tid !== t.id) return 'He is no longer on your staff';
  if (!keep) { raidLeave(r); return `${cname(c)} is off to ${club.abbr}.`; }
  if (r.sal - (c.sal || 0) > staffRoom(t.id) + 0.001) { car.raids.splice(i, 0, r); return 'Over your staff budget: you cannot match that'; }
  if (r.roll < raidStayChance(r)) {
    signCoachContract(c, Math.max(c.sal || 0, r.sal), Math.max(c.cyrs || 1, r.yrs), Math.max(c.cgtd || 0, 1));
    addNews(`${t.abbr} ${r.promo ? 'talked' : 'matched an offer to keep'} ${roleName(c.role).toLowerCase()} ${cname(c)}${r.promo ? ' out of leaving' : ''}: ${fmtMoney(c.sal)}/yr.`, [t.id], 'coach');
    return `${cname(c)} is staying.`;
  }
  raidLeave(r); return `${cname(c)} thanked you for the offer and took the ${club.abbr} job anyway.`;
}
function genCollegeClass() { // fresh faces: no ties, cheap, and nobody really knows
  for (const [role, n] of [['HC', 5], ['OC', 6], ['DC', 6], ['STC', 3], ['SC', 3], ...SPEC_ROLES.map(r => [r, 4]), ...POS_ROLES.map(r => [r, 6])]) for (let i = 0; i < n; i++) {
    const c = COACH_ROLES.includes(role) ? genCoach(role, { q: gauss(-0.15, 1.35) }) : genAssistant(role, { q: gauss(-0.15, 1.35) });
    c.college = true; c.age = clamp(c.age - randInt(2, 8), 28, 60); c.links = {};
  }
}
function startCarousel() {
  state.car = { day: 0, iv: {}, ivLeft: {}, dem: {}, req: [], raids: [], raided: {}, blocked: {}, roll: {} };
  ensureCoachContracts(); genCollegeClass(); seedWeb();
  genRaids(['HC']);
}
// the market moves a tier a day; whatever is still open on the last day gets filled
function advanceCarousel() {
  const car = state.car || (startCarousel(), state.car);
  const day = car.day;
  resolveRaids(); // anyone you did not fight for is gone
  if (day === 0) aiHireRoles(['HC']);
  else if (day === 1) aiHireRoles(['OC', 'DC', 'STC', 'SC']);
  else if (day === 2) aiHireRoles(SPEC_ROLES);
  car.day++;
  if (car.day >= CAROUSEL_DAYS) { finishCarousel(); return; }
  genRaids(car.day === 1 ? ['OC', 'DC'] : car.day === 2 ? SPEC_ROLES : POS_ROLES);
}
function finishCarousel() {
  const u = state.userTid, t = T(u);
  if (!isAI(u)) { // your open jobs: the men above them fill what you left (never a promised slot's holder)
    for (const role of ALL_ROLES) if (!staffCoach(t, role)) { const boss = BOSS[role] ? staffCoach(t, BOSS[role]) : null; const pool = Object.values(state.coaches).filter(c => c.tid < 0 && c.role === role).sort((a, b) => b.ovr + (boss ? linkOf(boss, b) * 14 : 0) - a.ovr - (boss ? linkOf(boss, a) * 14 : 0));
      const c = pool[0] || (COACH_ROLES.includes(role) ? genCoach(role) : genAssistant(role)); placeCoach(t, role, c, true); addNews(`${t.abbr} filled the open ${roleName(role).toLowerCase()} job with ${cname(c)}.`, [u], 'coach'); }
  }
  aiHireRoles(ALL_ROLES);
  for (const x of state.teams) { for (const r of ALL_ROLES) { const c = staffCoach(x, r); if (c && c.sal === undefined) signCoachContract(c, coachAsk(c), askYears(c), askGtd(c)); } setCaller(x); }
  // the college men nobody hired go back to campus
  for (const id in state.coaches) { const c = state.coaches[id]; if (c.college && c.tid < 0) { for (const o in c.links || {}) { const x = C(+o); if (x && x.links) delete x.links[c.id]; } delete state.coaches[id]; } }
  state.car = null;
  leaveCoaches();
}
// promised re-signings: a market-value offer keeps your word (it is made for you if you forget)
function promisedResigns(tid) { const t = T(tid), out = []; for (const r of ALL_ROLES) { const c = staffCoach(t, r); if (c && c.prom && c.prom.resign) { const p = P(c.prom.resign); if (p && p.tid === tid && p.expiring) out.push({ c, p }); } } return out; }
function keepResignPromises(tid) {
  for (const { c, p } of promisedResigns(tid)) { const err = resignPlayer(p.id); addNews(err ? `You promised ${cname(c)} that ${pname(p)} would be re-signed, but there was no cap room to make the offer.` : `${T(tid).abbr} re-signed ${p.lbl} ${pname(p)}, as promised to ${cname(c)}.`, [tid], 'sign'); delete c.prom.resign; }
}

// =====================================================================
//  DEFENSIVE PACKAGES
//  A play-caller no longer has "a tendency to play man 35% of the time". He carries packages: coverage shells and
//  pressures, each with a share of his call sheet. His pass defense coordinator brings a few of his own. The
//  familiar numbers (man rate, two-high rate, blitz rate) are read off the result.
// =====================================================================
const SHELLS = { C3: 'Cover 3', C1: 'Cover 1', C2: 'Cover 2', C4: 'Quarters', C2M: '2-Man', C0: 'Cover 0', T2: 'Tampa 2', C6: 'Cover 6' };
const PRESSURES = { FOUR: 'Four-man rush', BLITZ: 'Man blitz', FZ: 'Fire zone', SIM: 'Simulated pressure', THREE: 'Three-man rush' };
const EXTRAS = { STUNT: 'Stunts and twists', DISG: 'Disguise and rotation' };
const PK_NAME = Object.assign({}, SHELLS, PRESSURES, EXTRAS);
const MAN_SHELLS = ['C1', 'C2M', 'C0'], HIGH_SHELLS = ['C2', 'C2M', 'C4', 'T2', 'C6'];
// what each school of defense is built from
const DEF_PK_TEMPLATE = {
  TWOHIGH: { sh: { C4: 0.3, C6: 0.2, C2: 0.2, C3: 0.15, C1: 0.1, C2M: 0.05 }, pr: { FOUR: 0.62, SIM: 0.2, BLITZ: 0.08, FZ: 0.07, THREE: 0.03 }, disg: 0.35 },
  C3: { sh: { C3: 0.55, C1: 0.2, C2: 0.1, C4: 0.1, C0: 0.05 }, pr: { FOUR: 0.72, BLITZ: 0.15, FZ: 0.08, SIM: 0.05 }, disg: 0 },
  WIDE9: { sh: { C1: 0.27, C3: 0.33, C2: 0.15, C4: 0.17, C2M: 0.08 }, pr: { FOUR: 0.75, BLITZ: 0.13, SIM: 0.05, FZ: 0.04, THREE: 0.03 }, disg: 0 },
  MANBLITZ: { sh: { C1: 0.42, C0: 0.08, C2M: 0.14, C3: 0.2, C4: 0.16 }, pr: { FOUR: 0.42, BLITZ: 0.36, SIM: 0.14, FZ: 0.08 }, disg: 0 },
  TWOGAP: { sh: { C3: 0.28, C2: 0.2, C4: 0.17, C1: 0.22, C2M: 0.08, T2: 0.05 }, pr: { FOUR: 0.56, FZ: 0.18, BLITZ: 0.13, SIM: 0.1, THREE: 0.03 }, disg: 0 },
};
function normShares(o) { const s = Object.values(o).reduce((a, b) => a + b, 0) || 1; for (const k in o) o[k] = round2(o[k] / s); return o; }
function genDefPk(arch) {
  const T_ = DEF_PK_TEMPLATE[arch] || DEF_PK_TEMPLATE.C3, jit = o => { const r = {}; for (const k in o) r[k] = o[k] * Math.exp(gauss(0, 0.25)); return r; };
  const top = (o, n, keep) => { const e = Object.entries(o).sort((a, b) => b[1] - a[1]); const r = {}; e.forEach(([k, v], i) => { if (i < n || k === keep) r[k] = v; }); return normShares(r); };
  const odd = DEF_ARCH[arch] && ['3-4', 'Tite'].includes(DEF_ARCH[arch].t.front);
  const fr = { UNDER: !odd && rand() < 0.5 ? round2(0.1 + rand() * 0.25) : 0, BEAR: rand() < (odd ? 0.4 : 0.3) ? round2(0.05 + rand() * 0.14) : 0, BIGN: rand() < 0.35 ? round2(0.12 + rand() * 0.28) : 0 };
  return { fr, sh: top(jit(T_.sh), 4), pr: top(jit(T_.pr), 3, 'FOUR'), stunt: round2(clamp((DEF_ARCH[arch] ? DEF_ARCH[arch].t.stunt : 0.15) * Math.exp(gauss(0, 0.2)), 0, 0.5)), disg: round2(T_.disg ? clamp(T_.disg * Math.exp(gauss(0, 0.2)), 0, 0.6) : rand() < 0.15 ? 0.2 : 0) };
}
// a pass defense coordinator's own packages, by what he believes in
const SPEC_PK_POOL = { PRESSURE: ['FZ', 'BLITZ', 'SIM', 'C0', 'STUNT'], MAN: ['C1', 'C2M', 'C0', 'BLITZ'], SHELL: ['T2', 'C6', 'C4', 'C2', 'DISG', 'BIGN'], PENETRATE: ['STUNT', 'UNDER'], TWOGAP: ['BEAR', 'BIGN'] };
function genSpecPk(c) { const pool = (SPEC_PK_POOL[c.lean] || []).slice(); shuffle(pool); return pool.slice(0, c.role === 'DPC' ? 3 : 2); }
// every defense carries some man coverage and brings an extra rusher now and then
function floorDefPk(pk) {
  if (!pk || pk.fl) return pk; pk.fl = 1;
  if (!MAN_SHELLS.some(k => (pk.sh[k] || 0) >= 0.05)) { pk.sh.C1 = Math.max(pk.sh.C1 || 0, 0.07); normShares(pk.sh); }
  if ((pk.pr.BLITZ || 0) + (pk.pr.FZ || 0) < 0.05) { pk.pr.BLITZ = Math.max(pk.pr.BLITZ || 0, 0.06); normShares(pk.pr); }
  return pk;
}
function ensureDefPk(c) {
  if (c && c.pk) floorDefPk(c.pk);
  if (!c) return;
  if ((c.role === 'DC' || (c.role === 'HC' && c.t && c.t.caller === 'D')) && !c.pk) c.pk = genDefPk(c.arch);
  if ((c.role === 'DPC' || c.role === 'DRC') && !c.pks) c.pks = genSpecPk(c);
}
// the call sheet a team actually carries: the caller's packages (with the coordinator's when the head coach calls it),
// plus whatever the specialists installed
function teamDefPk(t) {
  const caller = defCaller(t), coord = C(t.dc);
  [caller, coord, asst(t, 'DPC'), asst(t, 'DRC')].forEach(ensureDefPk);
  const src = caller && caller.pk ? caller.pk : genDefPk('C3');
  const pk = { sh: Object.assign({}, src.sh), pr: Object.assign({}, src.pr), fr: Object.assign({ UNDER: 0, BEAR: 0, BIGN: 0 }, src.fr || {}), stunt: src.stunt, disg: src.disg, by: {} };
  if (caller && caller.role === 'HC' && coord && coord.pk) { for (const cat of ['sh', 'pr']) { for (const k in pk[cat]) pk[cat][k] *= 0.7; for (const k in coord.pk[cat]) pk[cat][k] = (pk[cat][k] || 0) + coord.pk[cat][k] * 0.3; } pk.stunt = pk.stunt * 0.7 + coord.pk.stunt * 0.3; pk.disg = pk.disg * 0.7 + coord.pk.disg * 0.3; }
  for (const r of ['DPC', 'DRC']) { const sp = asst(t, r); if (!sp || !sp.pks) continue; const b = 0.06 + sp.exp / 1000;
    for (const id of sp.pks) { if (SHELLS[id]) pk.sh[id] = (pk.sh[id] || 0) + b; else if (PRESSURES[id]) pk.pr[id] = (pk.pr[id] || 0) + b; else if (id === 'STUNT') pk.stunt = Math.min(0.6, pk.stunt + b); else if (id === 'DISG') pk.disg = Math.min(0.7, pk.disg + b * 2); else if (pk.fr[id] !== undefined) pk.fr[id] = round2(Math.min(0.5, pk.fr[id] + b * (id === 'BEAR' ? 1 : 2))); pk.by[id] = sp.id; } }
  normShares(pk.sh); normShares(pk.pr); pk.stunt = round2(pk.stunt); pk.disg = round2(pk.disg);
  return pk;
}
function pkShare(o, ids) { return round2(ids.reduce((s, k) => s + (o[k] || 0), 0)); }
function pkList(o, names) { return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${names[k]} ${Math.round(v * 100)}%`).join(' · '); }

// =====================================================================
//  OFFENSIVE PACKAGES · FRONTS · WHAT A PLAYBOOK IS CALLED
//  The offense's call sheet is a set of numbers (how often it goes quick, deep, play-action, zone, ...). A package is
//  a named piece of that sheet. Coordinators carry a core; the pass game and run game coordinators install three
//  each. New looks (trips, bunch, tight splits, counter, duo, option routes, max protect, no-huddle) only exist on a
//  sheet if somebody on the staff brought them.
// =====================================================================
const OFF_PK = {
  QUICK: ['Quick game', 'Pass', (t, b) => { t.quick += b * 0.8; }, t => t.quick >= 0.3, t => t.quick],
  SHOT: ['Shot plays', 'Pass', (t, b) => { t.deep += b * 0.6; }, t => t.deep >= 0.17, t => t.deep],
  PA: ['Play-action', 'Pass', (t, b) => { t.pa += b * 0.8; }, t => t.pa >= 0.17, t => t.pa],
  BOOT: ['Bootlegs', 'Pass', (t, b) => { t.boot += b * 0.5; }, t => t.boot >= 0.07, t => t.boot],
  RPO: ['Run-pass options', 'Pass', (t, b) => { t.rpo += b * 0.7; }, t => t.rpo >= 0.1, t => t.rpo],
  SCREEN: ['Screen game', 'Pass', (t, b) => { t.screen += b * 0.5; }, t => t.screen >= 0.09, t => t.screen],
  OPTRT: ['Option routes', 'Pass', (t, b) => { t.optrt += b * 2.2; }, t => t.optrt >= 0.08, t => t.optrt],
  MAXP: ['Max protect', 'Pass', (t, b) => { t.maxp += b * 2; }, t => t.maxp >= 0.1, t => t.maxp],
  IZ: ['Inside zone', 'Run', (t, b) => { t.zone += b; t.wz -= b; }, t => t.zone >= 0.45 && t.wz < 0.5, t => t.zone * (1 - t.wz)],
  WZ: ['Wide zone', 'Run', (t, b) => { t.zone += b; t.wz += b * 2; }, t => t.zone >= 0.45 && t.wz >= 0.5, t => t.zone * t.wz],
  POWER: ['Power', 'Run', (t, b) => { t.zone -= b; }, t => t.zone < 0.55, t => (1 - t.zone) * Math.max(0, 1 - t.counter - t.duo)],
  COUNTER: ['Counter', 'Run', (t, b) => { t.counter += b * 2.5; t.zone -= b * 0.4; }, t => t.counter >= 0.1, t => (1 - t.zone) * t.counter],
  DUO: ['Duo', 'Run', (t, b) => { t.duo += b * 2.5; t.zone -= b * 0.4; }, t => t.duo >= 0.1, t => (1 - t.zone) * t.duo],
  OPTION: ['Zone read', 'Run', (t, b) => { t.qbRun += b * 0.6; t.rpo += b * 0.3; }, t => t.qbRun >= 0.08, t => t.qbRun],
  TRIPS: ['Trips', 'Formation', (t, b) => { t.trips += b * 3; }, t => t.trips >= 0.1, t => t.trips],
  BUNCH: ['Bunch and stack', 'Formation', (t, b) => { t.bunch += b * 3; }, t => t.bunch >= 0.1, t => t.bunch],
  TIGHT: ['Tight splits', 'Formation', (t, b) => { t.tight += b * 3; }, t => t.tight >= 0.1, t => t.tight],
  EMPTY: ['Empty', 'Formation', (t, b) => { t.empty += b * 1.2; }, t => t.empty >= 0.05, t => t.empty],
  PISTOL: ['Pistol', 'Formation', (t, b) => { t.pistol += b * 3; }, t => t.pistol >= 0.1 || t.rpo + t.qbRun > 0.25, t => Math.max(t.pistol, t.rpo + t.qbRun > 0.25 ? 0.35 : 0)],
  FOURWIDE: ['Four-wide', 'Formation', (t, b) => { t.pers[10] = (t.pers[10] || 0) + b * 100; }, t => (t.pers[10] || 0) >= 12, t => (t.pers[10] || 0) / 100],
  TWOTE: ['Two tight ends', 'Formation', (t, b) => { t.pers[12] = (t.pers[12] || 0) + b * 120; t.uc += b; }, t => (t.pers[12] || 0) >= 26, t => (t.pers[12] || 0) / 100],
  HEAVY: ['Heavy sets', 'Formation', (t, b) => { t.pers[13] = (t.pers[13] || 0) + b * 60; t.pers[22] = (t.pers[22] || 0) + b * 40; }, t => (t.pers[13] || 0) + (t.pers[22] || 0) >= 14, t => ((t.pers[13] || 0) + (t.pers[22] || 0)) / 100],
  TWOBACK: ['Two-back', 'Formation', (t, b) => { t.pers[21] = (t.pers[21] || 0) + b * 100; }, t => (t.pers[21] || 0) >= 10, t => (t.pers[21] || 0) / 100],
  MOTION: ['Pre-snap motion', 'Tempo', (t, b) => { t.motion += b * 2; }, t => t.motion >= 0.45, t => t.motion],
  NOHUD: ['No-huddle', 'Tempo', (t, b) => { t.nohud += b * 3; }, t => t.nohud >= 0.1, t => t.nohud],
};
for (const k in OFF_PK) PK_NAME[k] = OFF_PK[k][0];
Object.assign(PK_NAME, { UNDER: 'Under front', BEAR: 'Bear front', BIGN: 'Big nickel' });
const OFF_NEW_FIELDS = ['wz', 'counter', 'duo', 'trips', 'bunch', 'tight', 'optrt', 'maxp', 'nohud', 'empty', 'pistol'];
// what each school installs of the newer looks (a coach may not carry all of them)
const OFF_NEW_TEMPLATE = {
  WZ: { wz: 0.72, tight: 0.3, duo: 0.1, counter: 0.05 }, SPREAD: { wz: 0.3, trips: 0.3, nohud: 0.25, bunch: 0.1, empty: 0.08, optrt: 0.06 },
  POWER: { wz: 0.2, counter: 0.3, duo: 0.3, tight: 0.15, maxp: 0.2 }, WCO: { wz: 0.35, bunch: 0.25, optrt: 0.16, trips: 0.15, counter: 0.1 },
  VERT: { wz: 0.3, maxp: 0.3, trips: 0.25, duo: 0.1, counter: 0.1 }, RPO: { wz: 0.4, trips: 0.2, nohud: 0.2, counter: 0.15, bunch: 0.1, pistol: 0.3 },
};
function ensureOffSheet(tn, arch) { // fill in the newer fields on a play-caller's sheet (older saves, new coaches)
  if (!tn || tn.wz !== undefined) return tn;
  const T_ = OFF_NEW_TEMPLATE[arch] || {};
  for (const k of OFF_NEW_FIELDS) { let v = T_[k] || 0; if (k !== 'wz') { if (v && rand() < 0.3) v = 0; else if (!v && rand() < 0.08) v = 0.15; } tn[k] = round2(clamp(v * Math.exp(gauss(0, 0.25)), 0, 0.9)); }
  return tn;
}
const OFF_SPEC_POOL = { VERT: ['SHOT', 'PA', 'MAXP', 'TRIPS'], TIMING: ['QUICK', 'OPTRT', 'BUNCH', 'MOTION'], PA: ['PA', 'BOOT', 'TIGHT', 'TWOTE'], QUICK: ['QUICK', 'SCREEN', 'RPO', 'TRIPS', 'NOHUD', 'EMPTY'],
  ZONE: ['WZ', 'IZ', 'TIGHT', 'BOOT'], GAP: ['POWER', 'COUNTER', 'DUO', 'HEAVY', 'TWOBACK'], OPTION: ['OPTION', 'RPO', 'PISTOL', 'COUNTER'] };
function ensureOffPk(c) {
  if (!c) return;
  if (c.role === 'OC') ensureOffSheet(c.t, c.arch);
  if (c.role === 'HC' && c.t && c.t.caller === 'O') ensureOffSheet(c.ct, c.arch);
  if ((c.role === 'PGC' || c.role === 'RGC') && !c.pks) { const pool = (OFF_SPEC_POOL[c.lean] || []).slice(); shuffle(pool); c.pks = pool.slice(0, 3); }
}
function offInstalled(tn) { return Object.keys(OFF_PK).filter(k => OFF_PK[k][3](tn)); }
function offPkHTML(tn) { // grouped, with who brought what
  const by = tn.by || {}, out = [];
  for (const cat of ['Formation', 'Run', 'Pass', 'Tempo']) { const ids = offInstalled(tn).filter(k => OFF_PK[k][1] === cat).sort((a, b) => OFF_PK[b][4](tn) - OFF_PK[a][4](tn));
    if (ids.length) out.push(`<b>${cat === 'Formation' ? 'Formations' : cat === 'Tempo' ? 'Tempo' : cat + ' concepts'}:</b> ${ids.map(k => OFF_PK[k][0] + (by[k] && C(by[k]) ? ` <span class="muted">(${C(by[k]).last})</span>` : '')).join(' · ')}`); }
  return out.join('<br>');
}
// ---- what a sheet is called: read off what is on it ----
function offSheetLabel(t) {
  if (!t) return '';
  const p10 = (t.pers && t.pers[10]) || 0;
  if (t.qbRun >= 0.12 && t.rpo >= 0.22) return 'RPO / QB Run';
  if ((t.optrt || 0) >= 0.2 && t.quick >= 0.3) return 'Erhardt-Perkins';
  if (t.pass >= 0.6 && p10 >= 10 && t.quick >= 0.36) return 'Air Raid';
  if (t.zone >= 0.66 && (t.wz || 0) >= 0.5 && t.pa + t.boot >= 0.32) return 'Shanahan Wide Zone';
  if (t.zone <= 0.4) return 'Power / Gap';
  if (t.deep >= 0.24) return 'Air Coryell';
  if (t.quick >= 0.36) return 'West Coast';
  if (t.pass >= 0.58) return 'Spread';
  return 'Pro-Style';
}
function defSheetLabel(front, pk) {
  if (!pk) return '';
  const s = k => pk.sh[k] || 0, man = pkShare(pk.sh, MAN_SHELLS), high = pkShare(pk.sh, HIGH_SHELLS), blitz = (pk.pr.BLITZ || 0) + (pk.pr.FZ || 0), odd = front === '3-4' || front === 'Tite';
  if (man >= 0.48 && blitz >= 0.3) return 'Man-Pressure';
  if ((pk.pr.FZ || 0) >= 0.15 && odd) return '3-4 Zone Blitz';
  if (s('T2') + s('C2') >= 0.4) return 'Tampa 2';
  if (s('C3') >= 0.42) return 'Cover 3';
  if (s('C4') + s('C6') >= 0.4) return high >= 0.55 && (pk.pr.SIM || 0) >= 0.12 ? 'Fangio Two-High' : 'Quarters / Match';
  if (front === 'Wide-9') return 'Wide-9 Attack';
  if (odd) return '3-4 Two-Gap';
  if (high >= 0.55) return 'Two-High';
  return 'Multiple';
}
function teamSchemeLabel(t, side) { const tn = blendedTend(t, side); return side === 'O' ? offSheetLabel(tn) : defSheetLabel(tn.front, tn.pk); }
// ---- how much of a playbook carries over ----
function pkVector(t, side) {
  const tn = blendedTend(t, side), v = {};
  if (side === 'O') for (const k of offInstalled(tn)) v[k] = 1;
  else { for (const k in tn.pk.sh) v[k] = tn.pk.sh[k] * 4; for (const k in tn.pk.pr) v[k] = tn.pk.pr[k] * 3; v['F_' + tn.front] = 2; if (tn.pk.disg) v.DISG = 1; for (const k of ['UNDER', 'BEAR', 'BIGN']) if (tn.pk.fr && tn.pk.fr[k]) v[k] = 0.5; }
  return v;
}
function pkOverlap(a, b) { let mn = 0, mx = 0; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { mn += Math.min(a[k] || 0, b[k] || 0); mx += Math.max(a[k] || 0, b[k] || 0); } return mx ? mn / mx : 1; }
function snapPlaybooks() { for (const t of state.teams) t.pkSnap = { O: pkVector(t, 'O'), D: pkVector(t, 'D') }; }
