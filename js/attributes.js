'use strict';
// =====================================================================
//  Attributes, positions (spots), measurables, fits, aging
//  See docs/DESIGN.md §2, §5, §7 and docs/PLAYBOOK_SPEC.md §1
// =====================================================================

// key: [label, short, aging group (E explosive / P power / T technique / M mental), pool]
const ATTRS = {
  spd: ['Speed', 'SPD', 'E', 'ath'], bur: ['Burst', 'BUR', 'E', 'ath'], agi: ['Agility', 'AGI', 'E', 'ath'], str: ['Strength', 'STR', 'P', 'ath'], jmp: ['Leaping', 'JMP', 'E', 'ath'],
  sacc: ['Short Accuracy', 'SAC', 'T', 'pass'], dacc: ['Deep Accuracy', 'DAC', 'T', 'pass'], arm: ['Arm Strength', 'ARM', 'P', 'pass'],
  proc: ['Processing', 'PRO', 'M', 'pass'], dec: ['Decision-Making', 'DEC', 'M', 'pass'], pkt: ['Pocket Presence', 'PKT', 'M', 'pass'], tor: ['Throw on the Run', 'TOR', 'T', 'pass'],
  vis: ['Vision', 'VIS', 'M', 'carry'], elu: ['Elusiveness', 'ELU', 'T', 'carry'], bal: ['Contact Balance', 'BAL', 'T', 'carry'], bsec: ['Ball Security', 'BSC', 'T', 'carry'],
  rte: ['Route Running', 'RTE', 'T', 'recv'], rel: ['Release', 'REL', 'T', 'recv'], hnd: ['Hands', 'HND', 'T', 'recv'], cth: ['Contested Catch', 'CTH', 'T', 'recv'],
  pbk: ['Pass Block', 'PBK', 'T', 'block'], rbk: ['Run Block', 'RBK', 'T', 'block'], bawr: ['Blocking Awareness', 'BAW', 'M', 'block'],
  prsh: ['Pass Rush', 'PRU', 'T', 'def'], shed: ['Block Shedding', 'SHD', 'T', 'def'], tkl: ['Tackling', 'TKL', 'T', 'def'], strp: ['Ball Stripping', 'STP', 'T', 'def'],
  prec: ['Play Recognition', 'PRC', 'M', 'def'], man: ['Man Coverage', 'MAN', 'T', 'def'], zone: ['Zone Coverage', 'ZON', 'T', 'def'], prs: ['Press', 'PRS', 'T', 'def'], bsk: ['Ball Skills', 'BSK', 'T', 'def'],
  kcon: ['Kick Consistency', 'KCN', 'T', 'kick'], krng: ['Comfort Range', 'KRG', 'P', 'kick'], kfal: ['Range Falloff', 'KFL', 'T', 'kick'], ktrj: ['Trajectory', 'TRJ', 'T', 'kick'],
  st: ['Special Teams', 'ST', 'T', 'teams'],
  pdis: ['Punt Distance', 'PDS', 'P', 'punt'], pplc: ['Directional Placement', 'PPL', 'T', 'punt'], phng: ['Hang Time', 'HNG', 'P', 'punt'], pspn: ['Spin Control', 'SPN', 'T', 'punt'],
};
const POOL_LABELS = { ath: 'Athletic', pass: 'Passing', carry: 'Ball Carrying', recv: 'Receiving', block: 'Blocking', def: 'Defense', kick: 'Kicking', punt: 'Punting', teams: 'Special Teams' };
const SIDE_POOLS = { off: ['ath', 'pass', 'carry', 'recv', 'block', 'teams'], def: ['ath', 'def', 'teams'], k: ['ath', 'kick'], p: ['ath', 'punt'] };
const ATH_KEYS = ['spd', 'bur', 'agi', 'str'];
const AGE_GROUPS = ['E', 'P', 'T', 'M'];
const AGE_GROUP_LABEL = { E: 'Explosive', P: 'Power', T: 'Technique', M: 'Mental' };

// ---------- spots ----------
// l: label · g: legacy engine group · side · body: [ht in, ht sd, wt lb, wt sd, arm in]
// t: starter-level template (number = mean, [mean, sd]) · w: value weights · sal: top-of-market $M · val: positional trade value
const SPOTS = {
  QB: { l: 'QB', g: 'QB', side: 'off', body: [75.5, 1.5, 222, 10, 32], sal: 55, val: 1.6,
    t: { spd: [56, 12], bur: [58, 10], agi: [58, 10], str: 50, sacc: 72, dacc: 66, arm: 75, proc: 68, dec: 66, pkt: 66, tor: 62, vis: 50, elu: [46, 12], bal: 46, bsec: 62, hnd: 45 },
    w: { sacc: 3, dacc: 2, arm: 2, proc: 3, dec: 2.5, pkt: 2, tor: 1, spd: 0.5, agi: 0.5, bsec: 0.5 } },
  RB: { l: 'RB', g: 'RB', side: 'off', body: [70.5, 1.5, 214, 10, 31], sal: 19, val: 0.7,
    t: { spd: 82, bur: 84, agi: 80, str: 60, vis: 72, elu: 72, bal: 72, bsec: 70, hnd: [60, 10], rte: [52, 10], rel: 45, cth: 40, pbk: [50, 10], bawr: [52, 10], rbk: 40 },
    w: { vis: 2, elu: 2, bal: 2, bur: 2, spd: 1.5, agi: 1, bsec: 1, hnd: 0.8, rte: 0.5, pbk: 0.5, bawr: 0.3, str: 0.5 } },
  FB: { l: 'FB', g: 'TE', side: 'off', body: [72, 1.2, 245, 8, 32], sal: 4, val: 0.3,
    t: { spd: 58, bur: 62, agi: 55, str: 75, rbk: 70, pbk: 62, bawr: 66, bal: 66, vis: 50, elu: 40, hnd: 58, rte: 42, rel: 40, cth: 45, bsec: 70 },
    w: { rbk: 3, bawr: 1.5, str: 2, pbk: 1, hnd: 0.7, bal: 0.7, bsec: 0.5 } },
  WRX: { l: 'X', g: 'WR', side: 'off', body: [74.5, 1.5, 212, 8, 32.6], sal: 35, val: 1.0,
    t: { spd: 84, bur: 80, agi: 78, str: 52, rte: 72, rel: 72, hnd: 72, cth: 72, elu: 62, bal: 56, vis: 50, bsec: 68, rbk: 45 },
    w: { rte: 2.5, rel: 2, hnd: 2, cth: 2, spd: 1.5, bur: 1, agi: 1, elu: 0.5, siz: 1 } },
  WRZ: { l: 'Z', g: 'WR', side: 'off', body: [72.5, 1.5, 198, 8, 31.6], sal: 33, val: 1.0,
    t: { spd: 87, bur: 84, agi: 82, str: 48, rte: 72, rel: 66, hnd: 70, cth: 62, elu: 70, bal: 55, vis: 52, bsec: 68, rbk: 42 },
    w: { rte: 2.5, rel: 1.5, hnd: 2, cth: 1, spd: 2, bur: 1.5, agi: 1, elu: 1 } },
  SLOT: { l: 'Slot', g: 'WR', side: 'off', body: [71, 1.4, 190, 8, 31], sal: 25, val: 0.8,
    t: { spd: 83, bur: 86, agi: 88, str: 45, rte: 76, rel: 64, hnd: 74, cth: 56, elu: 74, bal: 55, vis: 55, bsec: 68, rbk: 40 },
    w: { rte: 3, hnd: 2, agi: 2, bur: 1.5, spd: 1, elu: 1.5, rel: 1, cth: 0.5 } },
  TEY: { l: 'Y TE', g: 'TE', side: 'off', body: [77, 1, 256, 8, 33.6], sal: 17, val: 0.7,
    t: { spd: 64, bur: 64, agi: 62, str: 70, rbk: 70, pbk: 64, bawr: 62, rte: 60, rel: 58, hnd: 68, cth: 66, elu: 50, bal: 62, vis: 45, bsec: 68 },
    w: { rbk: 2.5, pbk: 1.5, bawr: 1, str: 1.5, hnd: 1.5, rte: 1.2, cth: 1, rel: 0.5, siz: 1 } },
  TEH: { l: 'H TE', g: 'TE', side: 'off', body: [76, 1.2, 246, 8, 33], sal: 18, val: 0.75,
    t: { spd: 72, bur: 72, agi: 72, str: 58, rbk: 55, pbk: 52, bawr: 55, rte: 70, rel: 64, hnd: 72, cth: 68, elu: 60, bal: 58, vis: 48, bsec: 68 },
    w: { rte: 2.2, hnd: 2, cth: 1.5, spd: 1.2, agi: 1, rel: 1, rbk: 1, elu: 0.8, bur: 0.8 } },
  LT: { l: 'LT', g: 'OL', side: 'off', body: [78, 1, 314, 8, 34.6], sal: 28, val: 1.0,
    t: { spd: 30, bur: 46, agi: 62, str: 76, pbk: 76, rbk: 70, bawr: 68 },
    w: { pbk: 3.5, rbk: 1.5, bawr: 1.5, agi: 1.5, str: 1.5 } },
  LG: { l: 'LG', g: 'OL', side: 'off', body: [76.5, 1, 318, 9, 33.6], sal: 20, val: 0.75,
    t: { spd: 26, bur: 44, agi: 52, str: 82, pbk: 70, rbk: 76, bawr: 66 },
    w: { pbk: 2.2, rbk: 2.8, bawr: 1.3, str: 2.2, agi: 1 } },
  C: { l: 'C', g: 'OL', side: 'off', body: [75.5, 1, 305, 8, 32.8], sal: 18, val: 0.75,
    t: { spd: 27, bur: 46, agi: 56, str: 78, pbk: 70, rbk: 72, bawr: 76 },
    w: { pbk: 2.2, rbk: 2.5, bawr: 2.5, str: 1.8, agi: 1 } },
  RG: { l: 'RG', g: 'OL', side: 'off', body: [76.5, 1, 318, 9, 33.6], sal: 20, val: 0.75,
    t: { spd: 26, bur: 44, agi: 52, str: 82, pbk: 70, rbk: 76, bawr: 66 },
    w: { pbk: 2.2, rbk: 2.8, bawr: 1.3, str: 2.2, agi: 1 } },
  RT: { l: 'RT', g: 'OL', side: 'off', body: [77.5, 1, 320, 9, 34.3], sal: 22, val: 0.85,
    t: { spd: 28, bur: 44, agi: 56, str: 80, pbk: 72, rbk: 74, bawr: 66 },
    w: { pbk: 3, rbk: 2, bawr: 1.2, agi: 1.2, str: 2 } },
  NT: { l: 'NT', g: 'DL', side: 'def', body: [75, 1.2, 330, 12, 33.5], sal: 16, val: 0.65,
    t: { spd: 30, bur: 55, agi: 45, str: 86, shed: 76, prsh: 50, tkl: 62, prec: 64, strp: 40 },
    w: { shed: 3, str: 3, prec: 1, tkl: 1, siz: 1.5, prsh: 0.5, bur: 0.5 } },
  DT: { l: 'DT', g: 'DL', side: 'def', body: [75.5, 1.2, 300, 10, 33.6], sal: 30, val: 1.0,
    t: { spd: 40, bur: 72, agi: 62, str: 78, prsh: 70, shed: 68, tkl: 62, prec: 62, strp: 48 },
    w: { prsh: 3, bur: 2, shed: 2, str: 1.5, agi: 1, tkl: 0.8, prec: 0.8, strp: 0.3 } },
  DE: { l: 'DE', g: 'DL', side: 'def', body: [76.5, 1.2, 288, 10, 34], sal: 20, val: 0.8,
    t: { spd: 50, bur: 66, agi: 58, str: 80, prsh: 64, shed: 74, tkl: 64, prec: 64, strp: 48 },
    w: { shed: 2.5, str: 2, prsh: 2, bur: 1, prec: 1, tkl: 1, siz: 0.8 } },
  EDGE: { l: 'EDGE', g: 'DL', side: 'def', body: [76, 1.2, 256, 10, 34], sal: 34, val: 1.1,
    t: { spd: 68, bur: 82, agi: 70, str: 70, prsh: 74, shed: 64, tkl: 64, prec: 60, strp: 58, zone: 36, man: 30 },
    w: { prsh: 3.5, bur: 2.5, agi: 1.5, spd: 1, shed: 1.5, str: 1, tkl: 0.8, prec: 0.8, strp: 0.5 } },
  MLB: { l: 'MLB', g: 'LB', side: 'def', body: [74, 1, 240, 7, 32.5], sal: 20, val: 0.75,
    t: { spd: 66, bur: 70, agi: 64, str: 66, shed: 66, tkl: 76, prec: 74, zone: 60, man: 52, prsh: [50, 10], bsk: 50, strp: 55, prs: 40 },
    w: { tkl: 2.5, prec: 2.5, shed: 1.5, zone: 1.5, spd: 1, bur: 0.8, man: 0.5, strp: 0.3, prsh: 0.3, str: 0.5 } },
  WLB: { l: 'WLB', g: 'LB', side: 'def', body: [73.5, 1, 231, 7, 32.4], sal: 16, val: 0.7,
    t: { spd: 74, bur: 74, agi: 72, str: 58, shed: 58, tkl: 72, prec: 70, zone: 66, man: 62, prsh: [50, 10], bsk: 54, strp: 52, prs: 42 },
    w: { tkl: 2, prec: 2, zone: 2, man: 1.2, spd: 1.5, agi: 1, shed: 0.8, bur: 0.8, bsk: 0.5 } },
  CB: { l: 'CB', g: 'CB', side: 'def', body: [72, 1.3, 192, 7, 31.5], sal: 28, val: 1.0,
    t: { spd: 86, bur: 82, agi: 82, str: 45, man: 74, zone: 70, prs: 70, bsk: 66, tkl: 58, prec: 62, shed: 40, strp: 50 },
    w: { man: 3, zone: 2, prs: 1.5, spd: 2, agi: 1.5, bsk: 1.5, bur: 1, tkl: 0.6, prec: 0.6 } },
  NCB: { l: 'Slot CB', g: 'CB', side: 'def', body: [70.5, 1.3, 188, 7, 31], sal: 17, val: 0.75,
    t: { spd: 84, bur: 86, agi: 88, str: 45, man: 72, zone: 72, prs: 60, bsk: 62, tkl: 64, prec: 68, shed: 42, strp: 50 },
    w: { man: 2.5, zone: 2.5, agi: 2, bur: 1.5, spd: 1, tkl: 1.2, prec: 1.2, bsk: 1, prs: 0.8 } },
  FS: { l: 'FS', g: 'S', side: 'def', body: [72.5, 1.2, 200, 7, 31.8], sal: 18, val: 0.8,
    t: { spd: 84, bur: 80, agi: 76, str: 52, zone: 74, man: 62, bsk: 68, prec: 70, tkl: 64, prs: 50, shed: 45, strp: 50 },
    w: { zone: 3, spd: 2, prec: 2, bsk: 2, man: 1, tkl: 1, agi: 0.8 } },
  SS: { l: 'SS', g: 'S', side: 'def', body: [72.5, 1.2, 208, 7, 32], sal: 16, val: 0.7,
    t: { spd: 78, bur: 78, agi: 72, str: 62, zone: 66, man: 62, bsk: 60, prec: 70, tkl: 72, shed: 56, prs: 52, strp: 54 },
    w: { tkl: 2.2, zone: 2, prec: 2, man: 1.2, shed: 1, spd: 1.2, bsk: 1, str: 0.6 } },
  K: { l: 'K', g: 'K', side: 'k', body: [72.5, 2, 195, 12, 31], sal: 6, val: 0.3,
    t: { spd: 45, bur: 45, agi: 45, str: 40, kcon: 78, krng: 72, kfal: 70, ktrj: 70 },
    w: { kcon: 3, krng: 3, kfal: 2, ktrj: 1 } },
  P: { l: 'P', g: 'P', side: 'p', body: [74.5, 2, 215, 12, 32], sal: 4, val: 0.25,
    t: { spd: 45, bur: 45, agi: 45, str: 42, pdis: 74, pplc: 70, phng: 72, pspn: 68 },
    w: { pdis: 3, phng: 2, pplc: 2, pspn: 1 } },
};
const SPOT_KEYS = Object.keys(SPOTS);
const SPOTS_BY_SIDE = { off: [], def: [], k: [], p: [] };
for (const s of SPOT_KEYS) SPOTS_BY_SIDE[SPOTS[s].side].push(s);

// roster construction: [spot, count, starters]
const ROSTER_BUILD = [['QB', 3, 1], ['RB', 3, 1], ['FB', 1, 0], ['WRX', 2, 1], ['WRZ', 2, 1], ['SLOT', 2, 1], ['TEY', 2, 1], ['TEH', 1, 0],
  ['LT', 2, 1], ['LG', 2, 1], ['C', 2, 1], ['RG', 2, 1], ['RT', 1, 1],
  ['NT', 1, 1], ['DT', 3, 2], ['DE', 2, 1], ['EDGE', 4, 2], ['MLB', 2, 1], ['WLB', 3, 1], ['CB', 4, 2], ['NCB', 2, 1], ['FS', 2, 1], ['SS', 2, 1], ['K', 1, 1], ['P', 1, 1]];
const DRAFT_SPOT_W = { QB: 3, RB: 3, FB: 0.6, WRX: 2.5, WRZ: 2.5, SLOT: 2, TEY: 1.6, TEH: 1.2, LT: 1.4, LG: 1.4, C: 1.2, RG: 1.4, RT: 1.4,
  NT: 1, DT: 2.6, DE: 1.8, EDGE: 3.4, MLB: 1.6, WLB: 2, CB: 3.6, NCB: 1.8, FS: 1.6, SS: 1.6, K: 0.5, P: 0.5 };
// roster page sections
const FAMILIES = [['QB', ['QB']], ['RB', ['RB']], ['FB', ['FB']], ['WR', ['WRX', 'WRZ', 'SLOT']], ['TE', ['TEY', 'TEH']], ['OL', ['LT', 'LG', 'C', 'RG', 'RT']],
  ['Interior DL', ['NT', 'DT', 'DE']], ['EDGE', ['EDGE']], ['LB', ['MLB', 'WLB']], ['CB', ['CB', 'NCB']], ['S', ['FS', 'SS']], ['K', ['K']], ['P', ['P']]];

// ---------- size & fit ----------
function sizeScore(ht, wt, arm) { return Math.round(clamp(50 + (ht - 74) * 3 + (wt - 245) * 0.25 + (arm - 33) * 3, 1, 99)); }
function bodyPenalty(p, spot) {
  const b = SPOTS[spot].body, side = SPOTS[spot].side;
  if (side === 'k' || side === 'p') return 0;
  const m = p.m;
  const wLo = b[2] - 2.2 * b[3], wHi = b[2] + 2.2 * b[3], hLo = b[0] - 2.5 * b[1], hHi = b[0] + 2.5 * b[1];
  return Math.max(0, wLo - m.wt, m.wt - wHi) * 0.4 + Math.max(0, hLo - m.ht, m.ht - hHi) * 1.5;
}
function attrVal(a, k) { const v = a[k]; return v === undefined ? 25 : v; }
function rawSpotValue(a, spot) {
  const w = SPOTS[spot].w;
  let s = 0, n = 0;
  for (const k in w) { s += w[k] * attrVal(a, k); n += w[k]; }
  return s / n;
}
// how high he gets off the ground: what a starter at each spot brings
const JMP_T = { QB: 55, RB: 78, FB: 62, WRX: 82, WRZ: 82, SLOT: 78, TEY: 68, TEH: 74, LT: 45, LG: 42, C: 42, RG: 42, RT: 44, NT: 42, DT: 50, DE: 60, EDGE: 68, MLB: 70, WLB: 72, CB: 84, NCB: 82, FS: 82, SS: 78, K: 40, P: 40 };
for (const s in JMP_T) if (SPOTS[s]) SPOTS[s].t.jmp = JMP_T[s];
const tMean = t => Array.isArray(t) ? t[0] : t;
// older players were built before leaping was a rating: read it from the vertical he was measured at, against the rest of his workout
function ensureLeap(p) {
  if (!p || !p.a || p.a.jmp !== undefined || !SPOTS[p.spot]) return;
  const S = SPOTS[p.spot], tb = S.t.bur !== undefined ? tMean(S.t.bur) : p.a.bur;
  const d = p.m && p.m.vert !== undefined && p.m.ten !== undefined ? clamp(((p.m.vert - 14) / 0.26 - (1.98 - p.m.ten) / 0.0055) * 0.6, -12, 12) : hashGauss(p.id || 0, 93, 1) * 5;
  p.a.jmp = clamp(Math.round(S.t.jmp + ((p.a.bur || tb) - tb) * 0.75 + d), 15, 99);
}
// template (average starter) attribute sets, used to center ratings at 74
const TEMPLATE_A = {}, TEMPLATE_RAW = {};
for (const s of SPOT_KEYS) {
  const S = SPOTS[s], a = {};
  for (const k in S.t) a[k] = Array.isArray(S.t[k]) ? S.t[k][0] : S.t[k];
  a.siz = sizeScore(S.body[0], S.body[2], S.body[4]);
  TEMPLATE_A[s] = a; TEMPLATE_RAW[s] = rawSpotValue(a, s);
}
const STARTER_CENTER = 74;
function spotRating(p, spot, a) {
  return STARTER_CENTER + rawSpotValue(a || p.a, spot) - TEMPLATE_RAW[spot] - bodyPenalty(p, spot);
}

// ---------- labels ----------
function positionLabel(elig) {
  const has = s => elig.includes(s);
  const used = new Set(), tokens = [];
  const take = (spots, label) => { tokens.push(label); spots.forEach(s => used.add(s)); };
  for (const s of elig) {
    if (used.has(s)) continue;
    if ((s === 'LT' || s === 'RT') && has('LT') && has('RT')) take(['LT', 'RT'], 'OT');
    else if ((s === 'LG' || s === 'RG' || s === 'C') && (has('LG') || has('RG')) && has('C')) take(['LG', 'RG', 'C'], 'IOL');
    else if ((s === 'LG' || s === 'RG') && has('LG') && has('RG')) take(['LG', 'RG'], 'G');
    else if (['WRX', 'WRZ', 'SLOT'].includes(s) && ['WRX', 'WRZ', 'SLOT'].filter(has).length >= 2)
      take(['WRX', 'WRZ', 'SLOT'], ['WRX', 'WRZ', 'SLOT'].every(has) || (has('SLOT') && has('WRX')) ? 'WR' : has('SLOT') ? 'Z/Slot' : 'Outside WR');
    else if ((s === 'TEY' || s === 'TEH') && has('TEY') && has('TEH')) take(['TEY', 'TEH'], 'TE');
    else if ((s === 'CB' || s === 'NCB') && has('CB') && has('NCB')) take(['CB', 'NCB'], 'CB');
    else if ((s === 'FS' || s === 'SS') && has('FS') && has('SS')) take(['FS', 'SS'], 'S');
    else if ((s === 'MLB' || s === 'WLB') && has('MLB') && has('WLB')) take(['MLB', 'WLB'], 'LB');
    else take([s], SPOTS[s].l);
  }
  return tokens.slice(0, 2).join('/');
}

// Cost (OVR points) of playing a spot other than your primary: technique you'd have to learn
const MOVE_COST = {};
[['LG', 'RG', 0.5], ['LT', 'RT', 1], ['LG', 'C', 2], ['RG', 'C', 2], ['LT', 'LG', 1.5], ['LT', 'RG', 1.5], ['RT', 'LG', 1.5], ['RT', 'RG', 1.5], ['LT', 'C', 3], ['RT', 'C', 3],
 ['WRX', 'WRZ', 0.5], ['WRZ', 'SLOT', 1], ['WRX', 'SLOT', 1.5], ['TEY', 'TEH', 1], ['TEH', 'WRX', 2.5], ['TEH', 'SLOT', 2.5], ['TEY', 'FB', 2], ['RB', 'FB', 2.5], ['RB', 'SLOT', 10], ['RB', 'WRZ', 12], ['RB', 'WRX', 13],
 ['NT', 'DT', 1], ['DT', 'DE', 1], ['NT', 'DE', 1.5], ['DE', 'EDGE', 1.5], ['DT', 'EDGE', 2.5], ['EDGE', 'MLB', 3], ['EDGE', 'WLB', 3],
 ['MLB', 'WLB', 1], ['WLB', 'SS', 2.5], ['MLB', 'SS', 3], ['CB', 'NCB', 1], ['NCB', 'SS', 2], ['NCB', 'FS', 2.5], ['CB', 'FS', 2.5], ['CB', 'SS', 3], ['FS', 'SS', 1]]
  .forEach(([a, b, c]) => { MOVE_COST[a + '>' + b] = c; MOVE_COST[b + '>' + a] = c; });
function moveCost(from, to) { return from === to ? 0 : (MOVE_COST[from + '>' + to] || 4); }

// ---------- positional comfort: learned through reps, not implied by size or athleticism ----------
// p.cf[spot] 0–100. Natural 85+ · Comfortable 60+ · Decent 30+ · Raw <30 · Unfamiliar 0.
// Playing a spot you haven't learned costs technique & mental attributes (busted assignments, poor footwork).
const SPOT_NEIGHBORS = {
  QB: [], RB: ['FB'], FB: ['RB', 'TEH'], WRX: ['WRZ', 'SLOT'], WRZ: ['WRX', 'SLOT'], SLOT: ['WRZ', 'WRX'], TEY: ['TEH', 'FB'], TEH: ['TEY', 'FB'],
  LT: ['RT', 'LG'], LG: ['RG', 'C', 'LT'], C: ['LG', 'RG'], RG: ['LG', 'C', 'RT'], RT: ['LT', 'RG'],
  NT: ['DT'], DT: ['NT', 'DE'], DE: ['DT', 'EDGE'], EDGE: ['DE', 'WLB'], MLB: ['WLB'], WLB: ['MLB', 'EDGE', 'SS'],
  CB: ['NCB', 'FS'], NCB: ['CB', 'SS', 'FS'], FS: ['SS', 'NCB'], SS: ['FS', 'WLB', 'NCB'], K: ['P'], P: ['K'],
};
// Jobs that sit next to each other share most of what a man has to know. Along the line (nose - tackle - end - edge), from the
// box to the deep middle (middle linebacker - weak side - strong safety - free safety) and from outside in (corner - slot - strong
// safety), a man is never less at home than what carries over from the next job along: about two fifths of it one step away.
const CARRY_EDGES = [['NT', 'DT'], ['DT', 'DE'], ['DE', 'EDGE'], ['MLB', 'WLB'], ['WLB', 'SS'], ['SS', 'FS'], ['CB', 'NCB'], ['NCB', 'SS']];
const CARRY_NEXT = {}; for (const [a, b] of CARRY_EDGES) { (CARRY_NEXT[a] = CARRY_NEXT[a] || []).push(b); (CARRY_NEXT[b] = CARRY_NEXT[b] || []).push(a); }
function comfortOwn(p, s) { return p.cf ? (p.cf[s] || 0) : (s === p.spot ? 100 : 0); }
function comfortOf(p, s) { let c = comfortOwn(p, s); const n = CARRY_NEXT[s]; if (n && c < 40) for (const k of n) c = Math.max(c, comfortOwn(p, k) * 0.4); return c; }
function comfortLabel(c) { return c >= 85 ? 'Natural' : c >= 60 ? 'Comfortable' : c >= 30 ? 'Decent' : c > 0 ? 'Raw' : 'Unfamiliar'; }
function comfortPen(p, s) { return Math.round(16 * Math.pow(1 - comfortOf(p, s) / 100, 1.6) * 10) / 10; }
// ---------- the defensive line is one line ----------
// Nose, 3-technique, 5-technique and wide edge are four points along it, not four positions. A man's rating and his comfort
// anywhere on the line are read between the points on either side: a 2i asks for some of what a nose does and some of what a
// 3-technique does. ax is how far from the center he lines up (the same scale the fronts use).
const LINE_ANCHORS = [['NT', 0.2], ['DT', 1.35], ['DE', 2.3], ['EDGE', 2.9]];
const LINE_SPOTS = new Set(LINE_ANCHORS.map(a => a[0]));
function linePos(ax) {
  const A = LINE_ANCHORS; if (ax <= A[0][1]) return 0;
  for (let i = 1; i < A.length; i++) if (ax <= A[i][1]) return i - 1 + (ax - A[i - 1][1]) / (A[i][1] - A[i - 1][1]);
  return A.length - 1;
}
function lineBlend(ax) { const u = linePos(ax), i = Math.min(LINE_ANCHORS.length - 2, Math.floor(u)), f = u - i; return f <= 0.001 ? [[LINE_ANCHORS[i][0], 1]] : f >= 0.999 ? [[LINE_ANCHORS[i + 1][0], 1]] : [[LINE_ANCHORS[i][0], 1 - f], [LINE_ANCHORS[i + 1][0], f]]; }
// comfort: what he has learned at the points either side, and never less than what carries over from the spot he knows best
// (a step along the line is a different job, half a step is nearly the same one)
function lineComfort(p, ax) {
  const u = linePos(ax); let lin = 0, best = 0;
  LINE_ANCHORS.forEach(([s], i) => { const c = comfortOwn(p, s), d = Math.abs(u - i); lin += Math.max(0, 1 - d) * c; best = Math.max(best, c * Math.max(0, 1 - 0.6 * d)); });
  return clamp(Math.max(lin, best), 0, 100);
}
function penOfComfort(c) { return Math.round(16 * Math.pow(1 - c / 100, 1.6) * 10) / 10; }
function linePen(p, ax) { return penOfComfort(lineComfort(p, ax)); }
function lineRating(p, ax) { let r = 0; for (const [s, w] of lineBlend(ax)) r += w * spotRating(p, s); return r; }
// how heavy he is for the spot, in steps of twelve pounds: a 256-pound edge at nose is six short, a 330-pound nose out wide is six over
function lineMass(p, ax) { if (!p || !p.m) return 0; let w = 0; for (const [k, v] of lineBlend(ax)) w += v * SPOTS[k].body[2]; return clamp((p.m.wt - w) / 12, -4, 4); }
function lineSlotRating(p, ax) { return p.a ? lineRating(p, ax) - linePen(p, ax) : p.ovr || 40; }
// history at neighboring spots: most players have a little, veterans more; true utility men are rare
// nearly the same job: most players at one have real reps at the other
const CLOSE_PAIRS = new Set(['DT>DE', 'DE>DT', 'DT>NT', 'NT>DT', 'LG>RG', 'RG>LG', 'LT>RT', 'RT>LT', 'MLB>WLB', 'WLB>MLB', 'FS>SS', 'SS>FS', 'WRX>WRZ', 'WRZ>WRX', 'TEY>TEH', 'TEH>TEY', 'CB>NCB', 'NCB>CB']);
function genComfort(p) {
  const cf = { [p.spot]: 100 }, yrs = Math.max(0, p.age - 21);
  for (const n of SPOT_NEIGHBORS[p.spot] || []) {
    const close = CLOSE_PAIRS.has(p.spot + '>' + n);
    if (rand() < (close ? 0.65 : 0.25) + yrs * 0.03) cf[n] = Math.round(clamp(gauss((close ? 55 : 28) + yrs * 3, 18), 5, 95));
  }
  if (rand() < 0.06) { const two = (SPOT_NEIGHBORS[pick(SPOT_NEIGHBORS[p.spot].length ? SPOT_NEIGHBORS[p.spot] : [p.spot])] || []).filter(s => s !== p.spot && !cf[s]); if (two.length) cf[pick(two)] = Math.round(clamp(gauss(40, 15), 10, 80)); }
  p.cf = cf;
}
// how fast he picks up a new spot: hidden Adaptability, football IQ, youth, and his coaches
function learnRate(p) {
  const iq = Math.max(p.a.proc || 0, p.a.prec || 0, p.a.bawr || 0, 50);
  const dev = p.tid >= 0 && typeof teamDev === 'function' ? teamDev(p.tid, p.pos) : null;
  return clamp((0.55 + ((p.h && p.h.adapt) || 55) / 100) * (1 + (iq - 60) * 0.006) * (p.age <= 24 ? 1.1 : p.age >= 31 ? 0.75 : 1) * (dev ? dev.grow('prec') : 1), 0.35, 1.9);
}
// add comfort points (slower as he nears Natural); returns true if his level changed
function learnSpot(p, s, pts) {
  if (!p.cf) genComfort(p);
  const c = Math.max(p.cf[s] || 0, comfortOf(p, s)), before = comfortLabel(c); // he starts from what already carries over
  p.cf[s] = Math.min(100, Math.round((c + pts * (c < 60 ? 1 : c < 85 ? 0.8 : 0.5)) * 10) / 10);
  return comfortLabel(p.cf[s]) !== before;
}

// Expected best rating over the rest of his career (no random shocks): the hidden Ceiling
function projectCeiling(p) {
  const q = { a: Object.assign({}, p.a), grow: Object.assign({}, p.grow), age: p.age, spot: p.spot, ag: p.ag, h: p.h, m: p.m, dc: p.dc, lateTo: p.lateTo };
  let best = spotRating(q, p.spot);
  for (let i = 0; i < 12 && q.age < 36; i++) {
    for (const g of AGE_GROUPS) {
      const pk = growPeak(q, g), ds = declStart(q, g);
      let d = 0;
      if (q.age >= ds) d = -(declineAt(g, Math.floor(q.age - ds) + 1) * declRate(q) + (q.dc && q.dc.t === 'c' ? CLIFF_EXTRA[g] : 0));
      else if (q.age < pk - 0.5 && q.grow[g] > 0) { const s = pk - q.age <= 1 ? q.grow[g] : q.grow[g] / Math.max(1, pk - q.age); q.grow[g] -= s; d = s * (g === 'E' || g === 'P' ? DEV.expectP : DEV.expect); } // the scouts assume a typical path
      if (d) for (const k in q.a) if (ATTRS[k] && ATTRS[k][2] === g) q.a[k] = clamp(q.a[k] + d, 10, 99);
    }
    q.age++;
    best = Math.max(best, spotRating(q, p.spot));
  }
  return best;
}

// Recompute fits, primary spot, label, legacy pos/ovr and ceiling. Call after any attribute change.
function updateRatings(p) {
  const side = SPOTS[p.spot].side;
  const vals = {};
  if (!p.cf) genComfort(p);
  for (const s of SPOTS_BY_SIDE[side]) vals[s] = spotRating(p, s) - comfortPen(p, s);
  // primary spot sticks unless another spot is clearly better (position changes happen with age)
  let best = p.spot;
  for (const s in vals) if (vals[s] > vals[best] + 2) best = s;
  if (best !== p.spot) p.spot = best; // a learned position he's now better at becomes his primary
  const top = vals[best];
  const elig = Object.keys(vals).filter(s => vals[s] >= top - 2).sort((a, b) => (b === best) - (a === best) || vals[b] - vals[a]);
  p.fit = {};
  for (const s in vals) if (vals[s] >= top - 10) p.fit[s] = Math.round(vals[s]);
  p.lbl = positionLabel(elig);
  p.pos = SPOTS[best].g; // legacy group used by the current engine/AI
  p.ovr = clamp(Math.round(top), 20, 99);
  p.pot = clamp(Math.round(projectCeiling(p)), p.ovr, 99);
  if (typeof trackPeak === 'function' && typeof state !== 'undefined' && state) trackPeak(p);
}

// ---------- aging ----------
const BASE_PEAK = { E: 25, P: 28, T: 27, M: 29.5 };
const GROW_RATE = { E: 1.0, P: 1.8, T: 2.4, M: 2.0 }; // points per year still to grow before peak
function peakAge(p, g) {
  let pk = BASE_PEAK[g] + p.ag[g][0];
  if (p.spot === 'RB' && (g === 'E' || g === 'T')) pk -= 1;
  if (p.spot === 'QB' && (g === 'M' || g === 'P')) pk += g === 'M' ? 2 : 1;
  if (p.spot === 'K' || p.spot === 'P') pk += 4;
  if (p.h.curve === 'early') pk -= 1.2; else if (p.h.curve === 'late') pk += 1.5;
  return pk;
}
function declineAt(g, y) { // points lost in the y-th year past peak
  if (g === 'E') return 0.4 + 0.35 * y;
  if (g === 'P') return 0.2 + 0.2 * y;
  if (g === 'T') return 0.3 + 0.3 * y;
  return 0.1 + 0.2 * y;
}
// mf: optional per-attribute multiplier on delta (coaching development)
function shiftGroup(p, g, delta, noise, mf) {
  for (const k in p.a) {
    if (!ATTRS[k] || ATTRS[k][2] !== g) continue;
    p.a[k] = clamp(Math.round(p.a[k] + delta * (mf ? mf(k) : 1) + gauss(0, noise)), 10, 99);
  }
}
function fatTail(sd, p, mult) { return gauss(0, sd) * (rand() < p ? mult : 1); }

// One offseason of development lives in develop.js (progressPlayer): growth is earned there.

// ---------- generation ----------
// character: how he works, how he follows his assignments, and whether a room follows him
function genCharacter() {
  const work = clamp(gauss(56, 17), 5, 99);
  return { work: Math.round(work), disc: Math.round(clamp(0.35 * work + 0.65 * gauss(56, 17), 5, 99)), lead: Math.round(clamp(gauss(45, 20), 5, 99)) };
}
function genHidden() {
  return {
    dur: Math.round(clamp(gauss(55, 18), 5, 99)),
    cons: Math.round(clamp(gauss(55, 18), 5, 99)),
    stam: Math.round(clamp(gauss(60, 15), 10, 99)),
    curve: weightedPick(['early', 'normal', 'late'], [2, 6, 2]),
    adapt: Math.round(clamp(gauss(55, 18), 5, 99)), // learns new positions / schemes
    ...genCharacter(),
  };
}
function genAging() {
  const ag = {};
  for (const g of AGE_GROUPS) {
    const pk = clamp(fatTail(1.2, 0.1, 2.2), -5, 5);
    let rate = Math.exp(gauss(0, 0.28));
    if (rand() < 0.06) rate *= rand() < 0.5 ? 0.35 : 2.0;
    ag[g] = [round1(pk), round2(rate)];
  }
  return ag;
}
function fmtHeight(inches) { return `${Math.floor(inches / 12)}'${inches % 12}"`; }
// ---------- the workout ----------
// Each drill has a raw mark set by what it tests (per: the drill's units per rating point). Work ethic sets how far above the raw mark he can go
// (the ceiling: two months of rehearsed starts and turns), consistency how far below it (the floor). The result is drawn from inside that range,
// so a workout lies downward more easily than upward: a slow man cannot fake a fast time, but a fast man can run a bad one.
const DRILLS = {
  forty: { base: 5.55, per: -0.0125, mix: { spd: 0.7, bur: 0.3 }, main: 'spd', up: [0.02, 0.08], dn: [0.03, 0.10], lo: 4.2, hi: 5.8, r: round2 },
  ten: { base: 1.98, per: -0.0055, mix: { bur: 0.75, str: 0.25 }, main: 'bur', up: [0.01, 0.03], dn: [0.01, 0.04], lo: 1.38, hi: 2.0, r: round2 },
  vert: { base: 14, per: 0.26, mix: { jmp: 0.75, bur: 0.25 }, main: 'jmp', up: [0.5, 1.5], dn: [1, 3], lo: 20, hi: 46, r: v => Math.round(v * 2) / 2 },
  broad: { base: 70, per: 0.55, mix: { jmp: 0.5, bur: 0.3, str: 0.2 }, main: 'jmp', up: [1, 3], dn: [2, 6], lo: 88, hi: 147, r: Math.round },
  cone: { base: 8.2, per: -0.016, mix: { agi: 0.75, bur: 0.25 }, main: 'agi', up: [0.04, 0.16], dn: [0.05, 0.18], lo: 6.4, hi: 8.5, r: round2 },
  shut: { base: 4.95, per: -0.009, mix: { agi: 0.55, bur: 0.45 }, main: 'agi', up: [0.02, 0.08], dn: [0.03, 0.10], lo: 3.85, hi: 5.05, r: round2 },
  bench: { base: -9, per: 0.45, mix: { str: 1 }, main: 'str', up: [1, 5], dn: [1, 4], lo: 0, hi: 45, r: Math.round },
};
const DRILL_KEYS = Object.keys(DRILLS);
for (const k of DRILL_KEYS) DRILLS[k].k = 1 / Math.sqrt(Object.values(DRILLS[k].mix).reduce((s, w) => s + w * w, 0)); // a blend of several ratings spreads men as widely as one would
// the raw mark, as a rating: a starter at his spot, moved by how he differs from one in what the drill tests, and by his build
// (taken around age 22, about two points short of his explosive peak)
function drillRaw(p, k) {
  const D = DRILLS[k], S = SPOTS[p.spot], t = S.t, a = p.a, T = j => t[j] !== undefined ? tMean(t[j]) : a[j] !== undefined ? a[j] : 40;
  let dev = 0; for (const j in D.mix) dev += D.mix[j] * ((a[j] !== undefined ? a[j] : T(j)) - T(j));
  let r = T(D.main) + dev * D.k - 2;
  const b = S.body, dh = p.m.ht - b[0];
  if (k === 'broad') r += dh * 0.9;          // long legs
  else if (k === 'cone') r -= dh * 0.5;      // a tall man bends worse
  else if (k === 'bench') r += ((p.m.wt - b[2]) / 15 - ((p.m.arm || b[4]) - (b[4] + dh * 0.35))) * 2.2; // long arms cost about a rep an inch; mass helps
  return r;
}
function drillRange(p, k) {
  const D = DRILLS[k], h = p.h || {}, wq = clamp(((h.work === undefined ? 56 : h.work) - 20) / 70, 0, 1), cq = clamp(((h.cons === undefined ? 55 : h.cons) - 20) / 70, 0, 1);
  return { up: D.up[0] + (D.up[1] - D.up[0]) * wq, dn: D.dn[1] - (D.dn[1] - D.dn[0]) * cq, cq };
}
// day: how his whole day is going (shared by every drill he runs)
function drillDraw(p, k, day) {
  const D = DRILLS[k], g = drillRange(p, k), good = D.per > 0 ? 1 : -1;
  let off = -g.dn + clamp(0.5 + (day || 0) * 0.1 + gauss(0, 0.17), 0, 1) * (g.up + g.dn);
  if (rand() < 0.02 + 0.05 * (1 - g.cq)) off = -g.dn * (1.3 + rand()); // a slip or a false step: the one way to land under his floor
  return D.r(clamp(D.base + D.per * drillRaw(p, k) + good * off, D.lo, D.hi));
}
const HAND_T = { QB: 9.6, RB: 9.2, FB: 9.5, WRX: 9.6, WRZ: 9.3, SLOT: 9.2, TEY: 10, TEH: 9.9, LT: 10.2, LG: 10.1, C: 10, RG: 10.1, RT: 10.2, NT: 10.1, DT: 10, DE: 10, EDGE: 9.9, MLB: 9.7, WLB: 9.6, CB: 9.2, NCB: 9.1, FS: 9.3, SS: 9.4, K: 9.1, P: 9.2 };
function handSize(spot, ht, z) { return Math.round(clamp((HAND_T[spot] || 9.5) + (ht - SPOTS[spot].body[0]) * 0.07 + z * 0.4, 8, 11.75) * 8) / 8; }
function genMeasurables(p) {
  const day = gauss(0, 1); for (const k of DRILL_KEYS) p.m[k] = drillDraw(p, k, day);
  return p.m;
}
// older players were measured before jumps were recorded: fill them in from their explosiveness (a drill a man chose not to do stays blank)
function ensureJumps(p) {
  if (!p.m || p.m.vert !== undefined || !p.a || p.m.x) return;
  const bu = p.a.bur - 2;
  p.m.vert = Math.round(clamp(14 + bu * 0.26 + hashGauss(p.id, 91, 1) * 1.6, 22, 45) * 10) / 10;
  p.m.broad = Math.round(clamp(70 + bu * 0.55 + hashGauss(p.id, 92, 1) * 3, 90, 145));
}
// and before hands were measured: sized to his position and height, a little bigger on a sure-handed man
function ensureHand(p) {
  if (!p || !p.m || p.m.hand !== undefined || !SPOTS[p.spot]) return;
  const t = SPOTS[p.spot].t, tilt = p.a && p.a.hnd !== undefined && t.hnd !== undefined ? clamp((p.a.hnd - tMean(t.hnd)) / 12, -1, 1) * 0.4 : 0;
  p.m.hand = handSize(p.spot, p.m.ht, clamp(hashGauss(p.id || 0, 94, 1) * 0.9 + tilt, -2.6, 2.6));
}
// Relative Athletic Score: each test as a 0–10 percentile against his position, averaged (size, speed, explosion, agility, strength)
const RAS_CACHE = {};
function rasOf(p, peers) {
  if (!p.m) return null;
  ensureJumps(p);
  if (DRILL_KEYS.filter(k => p.m[k] !== undefined).length < 4) return null; // too little of a workout to score
  const tests = [['ht', 1], ['wt', 1], ['forty', -1], ['ten', -1], ['vert', 1], ['broad', 1], ['cone', -1], ['shut', -1], ['bench', 1]];
  // sorted test results per position, cached briefly (a draft board asks for hundreds of these at once)
  const now = Date.now();
  if (!RAS_CACHE.t || now - RAS_CACHE.t > 3000 || RAS_CACHE.st !== state) { RAS_CACHE.t = now; RAS_CACHE.st = state; RAS_CACHE.by = {}; }
  const key = p.pos;
  if (!RAS_CACHE.by[key]) {
    const pool = peers || Object.values(state.players).filter(q => q.m && q.pos === p.pos);
    RAS_CACHE.by[key] = {};
    for (const [k] of tests) RAS_CACHE.by[key][k] = pool.map(q => { ensureJumps(q); return q.m[k]; }).filter(v => v !== undefined).sort((x, y) => x - y);
  }
  let s = 0, n = 0;
  for (const [k, dir] of tests) {
    const vals = RAS_CACHE.by[key][k];
    if (vals.length < 5 || p.m[k] === undefined) continue;
    const below = vals.filter(v => v < p.m[k]).length, eq = vals.filter(v => v === p.m[k]).length;
    const pct = (below + eq / 2) / vals.length;
    s += (dir > 0 ? pct : 1 - pct) * 10; n++;
  }
  return n ? Math.round(s / n * 100) / 100 : null;
}

// Create a player at `spot` with peak talent q (0 = average starter, +1 ≈ +5 OVR) and current age.
// gf: hidden growth factor (prospects only): how much of the usual room is really there
// raw: extra polish a prospect still lacks on draft day (he is further from his peak than his age alone says)
// Skills that do not follow a player's overall quality as closely as the rest: [how far quality moves them, how wide the individual roll is].
// A back's hands, routes, pass protection and strength are his own: a modest runner can catch and block, a feature back may not.
// That spread is what gives the league its passing-down backs and its short-yardage backs, with every shade in between.
// Skills in the same family share one roll per player (a back is a receiver or he is not), plus a smaller roll of their own.
const GEN_LOOSE = { RB: { hnd: [2.5, 6, 'rec'], rte: [2.5, 6, 'rec'], pbk: [2.5, 6, 'rec'], str: [1.5, 9] } }, GEN_BENT = { rec: 15 };
function genPlayer(spot, q, age, gf, raw) {
  const S = SPOTS[spot];
  const [first, last] = randomName(S.g);
  const ht = Math.round(gauss(S.body[0], S.body[1]));
  const wt = Math.round(gauss(S.body[2], S.body[3]));
  const arm = Math.round((S.body[4] + (ht - S.body[0]) * 0.35 + gauss(0, 0.6)) * 8) / 8;
  const dw = (wt - S.body[2]) / S.body[3];
  const a = {}, bent = {};
  for (const pool of SIDE_POOLS[S.side]) for (const k in ATTRS) {
    if (ATTRS[k][3] !== pool) continue;
    const t = S.t[k], ath = pool === 'ath';
    let v;
    if (k === 'st') v = genST(spot, q); // its own skill: tied to the position, barely to how good he is from scrimmage
    else if (t === undefined) v = gauss(30, 8);
    else {
      const [mean, sd] = Array.isArray(t) ? t : [t, ath ? 6 : 5], L = GEN_LOOSE[spot] && GEN_LOOSE[spot][k];
      v = mean + q * (L ? L[0] : ath ? 3 : 6) + gauss(0, L ? L[1] : sd);
      if (L && L[2]) v += bent[L[2]] !== undefined ? bent[L[2]] : (bent[L[2]] = gauss(0, GEN_BENT[L[2]]));
    }
    a[k] = v;
  }
  a.jmp += (a.bur - tMean(S.t.bur !== undefined ? S.t.bur : 30) - q * 3) * 0.45 - dw * 2; // an explosive man jumps; a heavy one less so
  a.spd -= dw * 2; a.agi -= dw * 1.5; a.str += dw * 3;
  // hands: big ones hold on to the ball. A quarterback's most of all.
  const hz = clamp(gauss(0, 1), -2.6, 2.6);
  for (const [k, v] of [['hnd', 1.5], ['bsec', S.g === 'QB' ? 2 : 1.5], ['cth', 1], ['bsk', 1]]) if (a[k] !== undefined) a[k] += hz * v;
  for (const k in a) a[k] = clamp(Math.round(a[k]), 15, 99);
  a.siz = sizeScore(ht, wt, arm);
  const p = {
    id: state.nextPid++, first, last, age, spot, pos: S.g, lbl: S.l, a,
    m: { ht, wt, arm, hand: handSize(spot, ht, hz) }, h: genHidden(), ag: genAging(), grow: { E: 0, P: 0, T: 0, M: 0 },
    ovr: 0, pot: 0, fit: {}, tid: -1, college: pickSchool(clamp(1 + ((q || 60) - 62) / 20, 0.85, 1.6)),
    contract: { amt: MIN_SALARY, yrs: 1 }, injury: null, stats: {}, career: [], draft: null, exp: 0,
  };
  genMeasurables(p);
  genDecline(p);
  // age the peak profile back (still growing) or forward (declining) to the current age
  for (const g of AGE_GROUPS) {
    const pk = peakAge(p, g);
    if (age < pk) {
      const gap = Math.max(0, (pk - age) * GROW_RATE[g] * Math.max(0.45, gauss(1, 0.3))) + (raw && (g === 'T' || g === 'M') ? raw : 0);
      p.grow[g] = round1(gap * (g === 'E' || g === 'P' ? DEV.roomP : DEV.room * (gf || 1))); // more is on offer than a typical player keeps
      shiftGroup(p, g, -gap, 1);
    } else {
      const d = declineTotal(p, g, age); // a plateau between his peak and the age his decline starts
      if (d) shiftGroup(p, g, -d, 1);
    }
  }
  state.players[p.id] = p; if (typeof rostersDirty === 'function') rostersDirty();
  updateRatings(p);
  return p;
}
