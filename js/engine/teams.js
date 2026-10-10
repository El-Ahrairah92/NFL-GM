'use strict';
// =====================================================================
//  SPECIAL TEAMS
//  Four units, ten men each besides the specialist: kickoff coverage, kick return, the punt team and punt return.
//  They are picked from the men who dress: by the staff, who weigh what a man does on the unit against what it
//  costs to expose a starter, or by you on the depth chart. Kicks are settled by the men on the field: coverage
//  against return blocking, gunners against the men holding them up, the rush against the protection.
//  Special Teams is its own skill (a.st): taking on blocks at speed, staying in a lane, tackling in space.
// =====================================================================
const ST_KEYS = ['KO', 'KRU', 'PU', 'PRU'];
const ST_UNIT = { KO: 'Kickoff coverage', KRU: 'Kick return', PU: 'Punt team', PRU: 'Punt return' };
const ST_SIZE = 10;
const ST_OK = new Set(['RB', 'FB', 'WRX', 'WRZ', 'SLOT', 'TEY', 'TEH', 'EDGE', 'MLB', 'WLB', 'CB', 'NCB', 'FS', 'SS']);
// where the skill tends to sit by position: linebackers, safeties and fullbacks make their living here
const ST_BASE = { QB: 18, RB: 52, FB: 60, WRX: 46, WRZ: 46, SLOT: 48, TEY: 50, TEH: 54, LT: 26, LG: 26, C: 26, RG: 26, RT: 26, NT: 28, DT: 30, DE: 36, EDGE: 48, MLB: 58, WLB: 60, CB: 54, NCB: 56, FS: 58, SS: 60 };
function genST(spot, q, z) { return ST_BASE[spot] === undefined ? undefined : Math.round(clamp(ST_BASE[spot] + (q || 0) * 1.5 + (z === undefined ? gauss(0, 13) : z * 13), 15, 99)); }
function ensureST(p) { if (p.a && p.a.st === undefined && ST_BASE[p.spot] !== undefined) p.a.st = genST(p.spot, 0, clamp(hashGauss(p.id, 4127, 3), -2.4, 2.4)); }
const stv_ = (p, k, d) => p.a && p.a[k] !== undefined ? p.a[k] : (d === undefined ? 40 : d);
function stCover(p) { return stv_(p, 'st') * 0.45 + stv_(p, 'spd') * 0.25 + stv_(p, 'tkl') * 0.18 + stv_(p, 'bur') * 0.12; }
function stBlock(p) { return stv_(p, 'st') * 0.45 + stv_(p, 'str') * 0.2 + Math.max(stv_(p, 'rbk'), stv_(p, 'shed')) * 0.2 + stv_(p, 'spd') * 0.15; }
function stGun(p) { return stv_(p, 'st') * 0.4 + stv_(p, 'spd') * 0.35 + stv_(p, 'tkl') * 0.15 + stv_(p, 'bur') * 0.1; }
function stJam(p) { return stv_(p, 'st') * 0.4 + stv_(p, 'spd') * 0.3 + Math.max(stv_(p, 'man'), stv_(p, 'rbk')) * 0.3; }
function stRush(p) { return stv_(p, 'st') * 0.35 + stv_(p, 'bur') * 0.3 + stv_(p, 'spd') * 0.2 + stv_(p, 'prsh') * 0.15; }
function stRole(p, key) { return key === 'KO' ? stCover(p) : key === 'KRU' ? stBlock(p) : key === 'PU' ? stCover(p) * 0.6 + stBlock(p) * 0.4 : stBlock(p) * 0.6 + stRush(p) * 0.4; }
// what your staff believes about a man's special teams value: close on your own players, vaguer on everyone else's
function stSeen(p, v) { const mine = typeof state !== 'undefined' && state && (p.tid === state.userTid || (p.tid === -3 && p.psTid === state.userTid)); return v + hashGauss(p.id, 4141, 7) * (mine ? 1.5 : 4); }
// one word for the planner, the depth chart and the scouts (for one unit when a key is given)
function stWord(p, key) { if (!p.a || !ST_OK.has(p.spot)) return null; const v = stSeen(p, key && ST_UNIT[key] ? stRole(p, key) : stCover(p)); return v >= 72 ? ['Core special teamer', 'good'] : v >= 65 ? ['Helps on special teams', ''] : v >= 56 ? ['Can fill in on teams', 'muted'] : ['Little special teams value', 'muted']; }
// what a spot at the back of the roster is worth because of the kicking game
function stRosterValue(p) { return p.a && ST_OK.has(p.spot) ? clamp((stCover(p) - 63) * 0.4, 0, 5) : 0; }
function stStarters(roster) {
  const out = new Set(), by = {};
  for (const p of roster) if (p.a) (by[p.pos] = by[p.pos] || []).push(p);
  for (const pos in by) by[pos].sort((a, b) => b.ovr - a.ovr).slice(0, LINEUP_NEED[pos] || 1).forEach(p => out.add(p.id));
  return out;
}
// the staff's view of a man for a unit: the job he does, less the risk of putting a starter out there
function stUnitScore(p, key, starters) { if (!p.a || !ST_OK.has(p.spot)) return -1e9; return stRole(p, key) - (starters && starters.has(p.id) ? 10 + Math.max(0, p.ovr - 75) * 0.8 : 0); }
function stArrange(l, key) { // the two outside men lead the list on the punting units
  if (key !== 'PU' && key !== 'PRU') return l;
  const f = key === 'PU' ? stGun : stJam, two = l.slice().sort((a, b) => f(b) - f(a)).slice(0, 2);
  return [...two, ...l.filter(p => !two.includes(p))];
}
function stStaffUnit(roster, key, starters) { return stArrange(roster.filter(p => p.a && ST_OK.has(p.spot)).sort((a, b) => stUnitScore(b, key, starters) - stUnitScore(a, key, starters)).slice(0, ST_SIZE), key); }
// the four units for one side of a game (rebuilt if the men available change)
function stUnits(g, s) {
  const T_ = g.side[s], sig = T_.roster.length + ':' + (T_.roster[0] ? T_.roster[0].id : 0) + ':' + (T_.roster[T_.roster.length - 1] ? T_.roster[T_.roster.length - 1].id : 0);
  if (T_.stu && T_.stuSig === sig) return T_.stu;
  const starters = stStarters(T_.roster), chart = userChart(g, s, 'st'), out = {};
  for (const key of ST_KEYS) {
    const staff = stStaffUnit(T_.roster, key, starters);
    let l = chart && chart.lists[key] ? chart.lists[key].map(id => T_.roster.find(p => p.id === id)).filter(Boolean) : null;
    if (l) { for (const p of staff) { if (l.length >= ST_SIZE) break; if (!l.includes(p)) l.push(p); } l = l.slice(0, ST_SIZE); } // your order stands; an empty place is filled for that game only
    out[key] = l || staff;
  }
  T_.stu = out; T_.stuSig = sig;
  return out;
}
const stAvg = (l, f) => l.length ? l.reduce((s, p) => s + f(p), 0) / l.length : 50;
// league-typical gaps between the two units on a kick, so an average matchup changes nothing
const ST0 = { ko: -6.3, pu: -6.5, gun: 3.0, rush: 5.6 };
const ST_K = { ko: 0.26, pu: 0.24, gun: 0.012, rush: 6, wear: 0.6, hurt: 0.003 };
// everyone on the unit played the snap: it costs legs, and now and then a man
function stSnap(g, units) {
  for (const l of units) for (const p of l) { if (p.id < 0) continue; inc(g, p, 'sts'); const st = g.ps[p.id]; if (st) st.fat += ST_K.wear; }
  const all = units.flat().filter(p => p.id >= 0); if (all.length) injuryCheck(g, [pick(all), pick(all)], ST_K.hurt);
}
function stShare(g, l, v) { if (!l.length) return; const each = v / l.length; for (const p of l) if (p.id >= 0) inc(g, p, 'stv', Math.round(each * 100) / 100); }
function stTackle(g, l) { const c = l.filter(p => p.id >= 0); if (!c.length) return null; const p = weightedPick(c, c.map(x => Math.pow(Math.max(20, stCover(x)) / 60, 4))); inc(g, p, 'stk'); return p; }
function stGrade(s) { const n = s ? s.sts || 0 : 0; return n < 25 ? null : Math.round(clamp(60 + ((s.stv || 0) / n) * 55 + ((s.stk || 0) / n) * 120 - 6, 25, 97)); }
