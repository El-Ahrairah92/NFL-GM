'use strict';
// =====================================================================
//  FRONT OFFICE: how a club values its own roster
//  One question drives every decision: how much better are this team's lineups with a player than without him?
//  - Jobs come from what the team runs: its personnel groupings, its front, its sub packages, its situational roles.
//  - A player is read job by job, through this club's eyes: what the film shows, his size, the scheme, how well he
//    knows the spot. Clubs know their own men better than anyone else's, and better front offices read more truly.
//  - A unit is scored healthy, with each starter out, and with each pair out. In every case the best lineup is found
//    with anyone free to move, so one flexible backup can be the answer to several injuries but only one at a time.
//  - A player's worth is what the unit loses without him, plus what he may become, what he does on special teams,
//    and less what he costs.
//  Nothing here is shown to the player and no club is given knowledge it would not have.
// =====================================================================
const FO = {
  sdOwn: 1.0, sdJob: 3.0,     // how far off a read can be at his own spot, and at a spot he has not played for this club to see
  ownMen: 0.5,                // a club's doubt about its own players, against anyone else's
  risk: 2.0,                  // clubs weigh injuries more heavily than the bare odds: a season is long and a hole is costly
  dev: 0.15, st: 0.8, money: 0.3,
  hurt: { QB: 0.07, RB: 0.15, WR: 0.11, TE: 0.11, OL: 0.10, DL: 0.10, LB: 0.10, CB: 0.11, S: 0.10, K: 0.02, P: 0.02 }, // share of a season a starter misses
  size: { QB: 0.2, RB: 0.8, WR: 0.5, TE: 0.5, OL: 1.2, DL: 1.0, LB: 0.6, CB: 0.8, S: 0.5 },                          // rating points per standard deviation of weight
  floor: { QB: 2, RB: 3, WR: 5, TE: 3, OL: 8, DL: 7, LB: 4, CB: 5, S: 3, K: 1, P: 1 },
  cap: { QB: 3, RB: 5, WR: 8, TE: 5, OL: 11, DL: 11, LB: 8, CB: 8, S: 6, K: 1, P: 1 },                                    // and bodies it will not carry more of, whatever the sums say                                // bodies a club will not go below, whatever the sums say
};
const FO_UNIT = { QB: 'QB', RB: 'SKILL', WR: 'SKILL', TE: 'SKILL', OL: 'OL', DL: 'FRONT', LB: 'FRONT', CB: 'DB', S: 'DB', K: 'K', P: 'P' };
// every club has a front office of its own quality: sharp across the league, with a real spread
function foQuality(t) { if (t.fo === undefined) t.fo = Math.round(clamp(72 + hashGauss(t.id, 771, 3) * 8, 52, 93)); return t.fo; }
function foVal(v, spot) { return v <= 45 ? 0 : Math.pow((v - 45) / 10, 2.4) * (SPOTS[spot].val || 1); }
function foSize(p, spot) { const b = SPOTS[spot].body; return b && p.m ? clamp((p.m.wt - b[2]) / b[3], -2.5, 2.5) * (FO.size[SPOTS[spot].g] || 0) : 0; }
// what this club thinks he is at a given spot
function foRead(p, tid, spot, fit) {
  const q = foQuality(T(tid)), own = p.tid === tid, same = spot === p.spot;
  const sd = (same ? FO.sdOwn : FO.sdJob) * (1.7 - q / 100) * (own ? FO.ownMen : 1);
  return slotRating(p, spot) + (viewOvr(p, tid) - p.ovr) + foSize(p, spot) + (same ? (fit || 0) * 0.8 : 0) + hashGauss(p.id * 7 + SPOT_KEYS.indexOf(spot), 900 + tid, state.season) * sd;
}
// the jobs this club has to fill, weighted by how much it uses them
function foJobs(tid) {
  const t = T(tid), ot = offTend(t) || {}, dt = defTend(t) || {}, pers = ot.pers || { 11: 62, 12: 20, 21: 8 };
  const tot = Object.values(pers).reduce((s, x) => s + x, 0) || 100, sh = k => (pers[k] || 0) / tot;
  const slot = clamp(sh('11') + sh('10'), 0.2, 1), te2 = clamp(sh('12') + sh('13') + sh('22'), 0.08, 0.8), fb = sh('21') + sh('22');
  const base = dt.base !== undefined ? dt.base : 0.3, odd = dt.front === '3-4' || dt.front === 'Tite', dime = 0.13, sub = clamp(1 - base, 0.3, 0.95);
  const a = (o, k) => (o.a && o.a[k]) || 40, J = (key, unit, spot, w, extra, free) => ({ key, unit, spot, w, extra: extra || null, free: !!free });
  return [
    J('QB', 'QB', 'QB', 1),
    J('RB', 'SKILL', 'RB', 0.7), J('RB2', 'SKILL', 'RB', 0.3), J('WR4', 'SKILL', 'WRX', 0.26), J('X', 'SKILL', 'WRX', 1), J('Z', 'SKILL', 'WRZ', 0.95), J('SLOT', 'SKILL', 'SLOT', slot), J('Y', 'SKILL', 'TEY', 0.85), J('H', 'SKILL', 'TEH', te2), ...(fb >= 0.06 ? [J('FB', 'SKILL', 'FB', fb * 0.6)] : []),
    // situational: a man already on the field can hold these too, so only a real specialist earns anything here
    J('RB3D', 'SKILL', 'RB', 0.28, p => ((a(p, 'hnd') + a(p, 'pbk') + a(p, 'rte')) / 3 - 58) * 0.4, true), J('RBSY', 'SKILL', 'RB', 0.08, p => ((a(p, 'str') + a(p, 'bal')) / 2 - 66) * 0.4, true),
    J('LT', 'OL', 'LT', 1), J('LG', 'OL', 'LG', 1), J('C', 'OL', 'C', 1), J('RG', 'OL', 'RG', 1), J('RT', 'OL', 'RT', 1),
    J('EDGE1', 'FRONT', 'EDGE', 1), J('EDGE2', 'FRONT', 'EDGE', 1), J('EDGE3', 'FRONT', 'EDGE', 0.4), J('IDL3', 'FRONT', 'DT', 0.45), J('IDL4', 'FRONT', odd ? 'DE' : 'DT', 0.28), // the line plays in waves
    ...(odd ? [J('NT', 'FRONT', 'NT', 0.55 + 0.4 * base), J('DE1', 'FRONT', 'DE', 0.95), J('DE2', 'FRONT', 'DE', 0.5 + 0.5 * base)] : [J('DT1', 'FRONT', 'DT', 0.95), J('DT2', 'FRONT', 'NT', 0.55 + 0.4 * base)]),
    J('RUSHE', 'FRONT', 'EDGE', 0.22, p => (a(p, 'prsh') - 66) * 0.45, true), J('RUSHI', 'FRONT', 'DT', 0.22, p => (a(p, 'prsh') - 62) * 0.45, true),
    J('MLB', 'FRONT', 'MLB', 1), J('WLB', 'FRONT', 'WLB', 1 - dime * 0.6), ...(odd ? [] : [J('SAM', 'FRONT', 'WLB', base * 0.85)]),
    J('CB1', 'DB', 'CB', 1), J('CB2', 'DB', 'CB', 1), J('NCB', 'DB', 'NCB', sub), J('DIME', 'DB', 'NCB', dime), J('FS', 'DB', 'FS', 1), J('SS', 'DB', 'SS', 1), J('CB4', 'DB', 'CB', 0.2), J('S3', 'DB', 'SS', 0.3),
    J('K', 'K', 'K', 0.5), J('P', 'P', 'P', 0.35),
  ];
}
// a unit's worth: its best lineup healthy, with each starter missing, and with each pair missing, weighted by how likely that is
function foUnitScore(jobs, ids, V, H, skip) {
  const solve = (out1, out2) => { let tot = 0; const used = new Set(), who = [];
    for (let j = 0; j < jobs.length; j++) { let best = -1, bv = 0;
      for (const id of ids) { if (id === skip || id === out1 || id === out2 || (!jobs[j].free && used.has(id))) continue; const v = V[id][j]; if (v > bv) { bv = v; best = id; } }
      tot += bv; if (!jobs[j].free && best >= 0) { used.add(best); who.push(best); } }
    return [tot, who]; };
  const [v0, st] = solve(-1, -1); let num = v0, den = 1;
  for (let i = 0; i < st.length; i++) { const hi = H[st[i]]; num += hi * solve(st[i], -1)[0]; den += hi;
    for (let k = i + 1; k < st.length; k++) { const w = hi * H[st[k]]; num += w * solve(st[i], st[k])[0]; den += w; } }
  return num / den;
}
// the staff's 53: cut the man the club would miss least, re-check his unit, and repeat
let FO_CACHE = { key: null, plan: null };
function foCutPlan(tid, limit) {
  const all = rosterOf(tid).filter(p => p.a && (typeof countsOn53 !== 'function' || countsOn53(p)) && !onIR(p));
  const key = `${tid}:${limit}:${state.season}:${state.phase}:${all.length}:${all.reduce((s, p) => s + p.id, 0)}`;
  if (FO_CACHE.key === key) return FO_CACHE.plan;
  const jobsAll = foJobs(tid), units = {}, V = {}, H = {}, extra = {}, byId = {}, dev = {};
  for (const p of all) {
    byId[p.id] = p; const u = FO_UNIT[p.pos] || 'SKILL', jobs = units[u] || (units[u] = { jobs: jobsAll.filter(j => j.unit === u).sort((x, y) => (x.free - y.free) || (y.w * (SPOTS[y.spot].val || 1) - x.w * (SPOTS[x.spot].val || 1))), ids: [] }); jobs.ids.push(p.id);
    const fit = typeof schemeFit === 'function' ? schemeFit(p, tid) : 0;
    V[p.id] = jobs.jobs.map(j => { const side = SPOTS[j.spot].side === SPOTS[p.spot].side; if (!side) return 0; const r = foRead(p, tid, j.spot, fit) + (j.extra ? j.extra(p) : 0); return j.w * foVal(r, j.spot); });
    H[p.id] = Math.min(0.6, (FO.hurt[p.pos] || 0.1) * (1 + Math.max(0, p.age - 28) * 0.06) * FO.risk);
    // beyond today's lineup: what he may become, what he does in the kicking game, and what he costs to keep
    const now = foRead(p, tid, p.spot, fit), g = p.age <= 26 ? viewGrowth(p, tid) * Math.min(1, (27 - p.age) / 4) : 0;
    dev[p.id] = FO.dev * Math.max(0, foVal(now + g, p.spot) - foVal(now, p.spot));
    extra[p.id] = (typeof stCover === 'function' && ST_OK.has(p.spot) ? clamp((stCover(p) - 60) / 10, 0, 1.5) * FO.st : 0)
      - Math.max(0, cutSavings(p) - MIN_SALARY) * FO.money + (p.exp === 0 && p.draft ? (p.draft.round <= 3 ? 3 : 0.8) : 0);
  }
  for (const pos of POSITIONS) all.filter(p => p.pos === pos).sort((a, b) => dev[b.id] - dev[a.id]).forEach((p, i) => { extra[p.id] += dev[p.id] * Math.pow(0.5, i); });
  const worth = {}, sweep = u => { const U = units[u], full = foUnitScore(U.jobs, U.ids, V, H, -1); for (const id of U.ids) worth[id] = full - foUnitScore(U.jobs, U.ids, V, H, id) + extra[id]; };
  for (const u in units) sweep(u);
  const cuts = [], counts = {}; for (const p of all) counts[p.pos] = (counts[p.pos] || 0) + 1;
  let n = all.length; const alive = new Set(all.map(p => p.id));
  while (n > limit) {
    let pick = null, low = 1e9; const over = POSITIONS.filter(pos => (counts[pos] || 0) > (FO.cap[pos] || 99));
    for (const id of alive) { const p = byId[id]; if (counts[p.pos] <= (FO.floor[p.pos] || 1)) continue; if (over.length && !over.includes(p.pos)) continue; if (worth[id] < low) { low = worth[id]; pick = p; } }
    if (!pick) break;
    alive.delete(pick.id); cuts.push(pick.id); counts[pick.pos]--; n--;
    const u = FO_UNIT[pick.pos] || 'SKILL'; units[u].ids = units[u].ids.filter(id => id !== pick.id); sweep(u); // the men around him are worth more or less now that he is gone
  }
  const kept = [...alive].sort((a, b) => worth[a] - worth[b]);
  const plan = { cuts: new Set(cuts), order: cuts, worth, bubble: new Set([...kept.slice(0, 7), ...cuts.slice(-5)]) };
  FO_CACHE = { key, plan };
  return plan;
}
