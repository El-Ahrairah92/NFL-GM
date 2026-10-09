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
function foUnitScoreSlow(jobs, ids, V, H, skip) {
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
function foUnitScore(jobs, ids, V, H, skip) {
  const nj = jobs.length, order = new Array(nj);
  for (let j = 0; j < nj; j++) { const a = []; for (const id of ids) if (id !== skip && V[id][j] > 0) a.push(id); order[j] = a.sort((x, y) => V[y][j] - V[x][j]); }
  const used = new Set(); let who;
  const solve = (out1, out2) => { let tot = 0; used.clear(); who = [];
    for (let j = 0; j < nj; j++) { const o = order[j], free = jobs[j].free;
      for (let k = 0; k < o.length; k++) { const id = o[k]; if (id === out1 || id === out2 || (!free && used.has(id))) continue; tot += V[id][j]; if (!free) { used.add(id); who.push(id); } break; } }
    return tot; };
  const v0 = solve(-1, -1), st = who; let num = v0, den = 1;
  for (let i = 0; i < st.length; i++) { const hi = H[st[i]]; num += hi * solve(st[i], -1); den += hi;
    for (let k = i + 1; k < st.length; k++) { const w = hi * H[st[k]]; num += w * solve(st[i], st[k]); den += w; } }
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
// =====================================================================
//  The club's roster as its front office sees it, and what a new man would add to it
//  Used wherever a club brings someone in: filling the camp roster, waiver claims, replacing the injured.
// =====================================================================
function foModel(tid, players) {
  const M = { tid, jobsAll: foJobs(tid), units: {}, V: {}, H: {}, extra: {}, dev: {}, byId: {}, counts: {}, comp: {} };
  for (const p of players) foAdd(M, p);
  return M;
}
function foUnitOf(M, p) { const u = FO_UNIT[p.pos] || 'SKILL'; return M.units[u] || (M.units[u] = { key: u, jobs: M.jobsAll.filter(j => j.unit === u).sort((x, y) => (x.free - y.free) || (y.w * (SPOTS[y.spot].val || 1) - x.w * (SPOTS[x.spot].val || 1))), ids: [] }); }
// work out one man's reads for this club (whether or not he is on it yet)
function foRow(M, p) {
  if (M.V[p.id]) return;
  const U = foUnitOf(M, p), fit = typeof schemeFit === 'function' ? schemeFit(p, M.tid) : 0;
  M.byId[p.id] = p;
  M.R = M.R || {}; M.R[p.id] = U.jobs.map(j => SPOTS[j.spot].side === SPOTS[p.spot].side ? foRead(p, M.tid, j.spot, fit) + (j.extra ? j.extra(p) : 0) : 0);
  M.V[p.id] = U.jobs.map((j, i) => M.R[p.id][i] ? j.w * foVal(M.R[p.id][i], j.spot) : 0);
  M.H[p.id] = Math.min(0.6, (FO.hurt[p.pos] || 0.1) * (1 + Math.max(0, p.age - 28) * 0.06) * FO.risk);
  const now = foRead(p, M.tid, p.spot, fit), g = p.age <= 26 ? viewGrowth(p, M.tid) * Math.min(1, (27 - p.age) / 4) : 0;
  M.dev[p.id] = FO.dev * Math.max(0, foVal(now + g, p.spot) - foVal(now, p.spot));
  M.extra[p.id] = (typeof stCover === 'function' && ST_OK.has(p.spot) ? clamp((stCover(p) - 60) / 10, 0, 1.5) * FO.st : 0);
}
function foAdd(M, p) { foRow(M, p); const U = foUnitOf(M, p); U.hold = null; U.base = null; if (!U.ids.includes(p.id)) { U.ids.push(p.id); M.counts[p.pos] = (M.counts[p.pos] || 0) + 1; } }
function foRemove(M, p) { const U = foUnitOf(M, p); U.hold = null; U.base = null; if (U.ids.includes(p.id)) { U.ids = U.ids.filter(id => id !== p.id); M.counts[p.pos]--; } }
// what the club's lineups gain if he joins: starter, rotation, situational and cover value across the injury scenarios
function foGain(M, p) {
  foRow(M, p); const U = foUnitOf(M, p); if (U.ids.includes(p.id)) return 0;
  const base = U.base !== undefined && U.base !== null ? U.base : (U.base = foUnitScore(U.jobs, U.ids, M.V, M.H, -1)), withHim = foUnitScore(U.jobs, [...U.ids, p.id], M.V, M.H, -1);
  const projects = U.ids.filter(id => M.byId[id].pos === p.pos && M.dev[id] > M.dev[p.id]).length; // a club's appetite for projects at a position halves with each one it already has
  return withHim - base + M.extra[p.id] + M.dev[p.id] * Math.pow(0.5, projects);
}
// what each man already here is worth to the club (the drop without him), for deciding who makes way
function foWorths(M, unitKey) {
  const out = {};
  for (const u in M.units) { if (unitKey && u !== unitKey) continue; const U = M.units[u], full = foUnitScore(U.jobs, U.ids, M.V, M.H, -1);
    for (const id of U.ids) { const p = M.byId[id]; out[id] = full - foUnitScore(U.jobs, U.ids, M.V, M.H, id) + M.extra[id] + M.dev[id] * 0.5 - Math.max(0, cutSavings(p) - MIN_SALARY) * FO.money; } }
  return out;
}
function foLeast(M, keepIds) { // the man the club would miss least, never taking a position below its floor
  const w = foWorths(M); let best = null, low = 1e9;
  for (const id in w) { const p = M.byId[id]; if ((M.counts[p.pos] || 0) <= (FO.floor[p.pos] || 1) || (keepIds && keepIds.has(+id))) continue; if (w[id] < low) { low = w[id]; best = p; } }
  return best ? { p: best, worth: low } : null;
}
// who holds each job in the club's best healthy lineup
function foHolders(M, U) {
  if (U.hold) return U.hold; const used = new Set();
  return U.hold = U.jobs.map((j, i) => { let b = -1, bv = 0; for (const id of U.ids) { if (!j.free && used.has(id)) continue; const v = M.V[id][i]; if (v > bv) { bv = v; b = id; } } if (b >= 0 && !j.free) used.add(b); return b; });
}
// the grade below which a job is not really won: higher for a starting job than for a depth or situational one
function foBar(j) { return j.free ? 62 : j.w >= 0.5 ? 66 : 60; }
// a job where nobody has it won: worth bringing in more than one man to fight for it
function foOpenJob(M, p) {
  const U = foUnitOf(M, p), r = M.R[p.id], hold = foHolders(M, U); let best = null, bv = 0;
  U.jobs.forEach((j, i) => { if (!r[i] || (M.comp[j.key] || 0) >= 2) return; const inc = hold[i] >= 0 ? M.R[hold[i]][i] : 40, bar = foBar(j);
    if (inc < bar && r[i] >= inc - 4) { const v = 0.45 * j.w * (SPOTS[j.spot].val || 1) * (1 + (bar - inc) / 20); if (v > bv) { bv = v; best = j; } } });
  return best ? { job: best, v: bv } : null;
}
// ---------- filling the camp roster: bodies for the rooms that need them, chosen for the jobs that are open ----------
function foCampSignings(tid) {
  const M = foModel(tid, rosterOf(tid).filter(p => p.a && !p.injury));
  const pool = Object.values(state.players).filter(p => p.tid === -1 && p.a && !p.injury && p.age <= 28 && p.exp <= 6 && p.ask <= MIN_SALARY * 1.3);
  const byPos = {}; for (const p of pool) (byPos[p.pos] = byPos[p.pos] || []).push(p);
  for (const pos in byPos) byPos[pos] = byPos[pos].sort((a, b) => viewCeil(b, tid) - viewCeil(a, tid)).slice(0, 30); // the men a club would have on its list
  const counts = {}; rosterOf(tid).forEach(p => counts[p.pos] = (counts[p.pos] || 0) + 1);
  let n = 0;
  for (const pos of POSITIONS) {
    while ((counts[pos] || 0) < CAMP_TARGET[pos] && rosterOf(tid).length < OFFSEASON_MAX) {
      let pick = null, bs = -1e9, pj = null;
      for (const p of byPos[pos] || []) { if (p.tid !== -1) continue; const g = foGain(M, p), oj = foOpenJob(M, p), sc = g + (oj ? oj.v : 0) + (viewOvr(p, tid) + viewCeil(p, tid)) * 0.01; /* when nobody moves the needle, the better player gets the invitation */ if (sc > bs) { bs = sc; pick = p; pj = oj; } }
      if (!pick) pick = campBody(pos);
      setTid(pick, tid); pick.contract = makeContract(pick, MIN_SALARY, 1, 0); delete pick.ask;
      if (pick.a) { foAdd(M, pick); if (pj) M.comp[pj.job.key] = (M.comp[pj.job.key] || 0) + 1; }
      counts[pos] = (counts[pos] || 0) + 1; n++;
    }
  }
  return n;
}
// ---------- waivers: would this man make the club better than the man he would replace? ----------
const FO_MODELS = { key: null, m: {} };
function foCachedModel(tid) { const key = state.season + ':' + state.phase + ':' + state.week; if (FO_MODELS.key !== key) { FO_MODELS.key = key; FO_MODELS.m = {}; } return FO_MODELS.m[tid] || (FO_MODELS.m[tid] = foModel(tid, rosterOf(tid).filter(p => p.a && !onIR(p)))); }
function foWaiverDrop(p, tid) {
  const M = foCachedModel(tid); if (M.byId[p.id] && foUnitOf(M, p).ids.includes(p.id)) return null;
  const g = foGain(M, p); if (g < 0.35) return null;
  if ((M.counts[p.pos] || 0) >= (FO.cap[p.pos] || 99)) { // already carrying all it wants there: one of them has to be the man who goes
    const U = foUnitOf(M, p), w = foWorths(M, U.key); let b = null, low = 1e9; for (const id of U.ids) if (M.byId[id].pos === p.pos && w[id] < low) { low = w[id]; b = M.byId[id]; }
    return b && g - low > 0.35 ? b : null;
  }
  M.least = M.least || foLeast(M); // the one man this club would let go
  return M.least && g - M.least.worth > 0.35 && M.least.p.id !== p.id ? M.least.p : null;
}
// ---------- during the season: when a man goes down, find the player who fixes the hole it leaves ----------
// The answer may be on the street or on the club's own practice squad.
function foInjuryMoves(tid) {
  const ro = rosterOf(tid), hurt = ro.filter(p => p.injury && p.injury.weeks >= 2 && p.a);
  if (!hurt.length) return 0;
  const key = hurt.map(p => p.id).sort().join(','), t = T(tid); if (t.foHurt === key) return 0; t.foHurt = key; // only when the injury list has changed
  const M = foModel(tid, ro.filter(p => p.a && !p.injury)), poss = new Set(hurt.map(p => p.pos));
  let moves = 0;
  for (const pos of poss) {
    const room = capRoom(tid);
    const fa = Object.values(state.players).filter(p => p.tid === -1 && p.a && p.pos === pos && !p.injury && !p.waiver && p.ask <= room).sort((a, b) => viewOvr(b, tid) - viewOvr(a, tid)).slice(0, 8);
    const own = typeof psOf === 'function' ? psOf(tid).filter(p => p.a && p.pos === pos && !p.injury) : [];
    let pick = null, bg = 0;
    for (const p of [...fa, ...own]) { const g = foGain(M, p) + (p.tid === -3 ? 0.15 : -Math.max(0, p.ask - MIN_SALARY) * FO.money); if (g > bg) { bg = g; pick = p; } } // his own man knows the system and costs the minimum
    if (!pick || bg < 0.3) continue;
    if (activeCount(tid) >= ROSTER_MAX) { const d = foLeast(M); if (!d || bg - d.worth < 0.4) continue; releasePlayer(d.p.id); foRemove(M, d.p); }
    const err = pick.tid === -3 ? promoteFromPS(pick.id, tid, pos + ' injuries') : signFA(pick.id, tid, 1);
    if (err) continue;
    foAdd(M, pick); moves++;
    if (moves >= 2) break;
  }
  return moves;
}
// =====================================================================
//  The street market: every window in which a club may sign a free agent runs the same way.
//  Each club names the one man who would add the most to its lineups for what he costs. A player wanted by several
//  goes where he adds the most. Then everyone looks again. It ends when nobody left is worth a roster spot to anyone.
//  Nothing limits how many a club signs except the things that limit a real one: each signing fills the hole the
//  next man would have filled, every spot taken is one somebody else loses, and the money runs out.
// =====================================================================
const FO_SHOP = {
  camp: { bar: 0.6, reserve: 5, per: 14 },  // after the draft: veterans for the holes the spring and the draft left
  cut: { bar: 0.45, reserve: 3, per: 12 },  // after cutdown: other clubs' cuts against the bottom of the 53
  week: { bar: 0.9, reserve: 2, per: 6 },   // during the season: only a clear upgrade is worth the churn
};
function foShop(kind, only) {
  const cfg = FO_SHOP[kind];
  const clubs = state.teams.filter(t => isAI(t.id) && (!FO.extra || FO.extra(t.id)) && (!only || only(t.id)));
  if (!clubs.length || FO.on === false) return 0;
  const byPos = {}; for (const p of Object.values(state.players)) if (p.tid === -1 && p.a && !p.injury && !p.waiver) (byPos[p.pos] = byPos[p.pos] || []).push(p);
  const cand = []; for (const pos in byPos) cand.push(...byPos[pos].sort((a, b) => perOvr(b) - perOvr(a)).slice(0, cfg.per)); // the names every club has on its list
  if (!cand.length) return 0;
  const S = clubs.map(t => ({ tid: t.id, M: foModel(t.id, rosterOf(t.id).filter(p => p.a && !p.injury && !onIR(p))), g: {}, weak: null, least: undefined, done: false }));
  // a quick look before the full sum: is he anywhere near the weakest job-holder at his position?
  const weakOf = (c, p) => { if (!c.weak) c.weak = {}; if (c.weak[p.pos] !== undefined) return c.weak[p.pos]; const U = foUnitOf(c.M, p), hold = foHolders(c.M, U); let w = 99;
    U.jobs.forEach((j, i) => { if (j.free || SPOTS[j.spot].g !== p.pos) return; w = Math.min(w, hold[i] >= 0 ? c.M.R[hold[i]][i] : 40); }); return c.weak[p.pos] = w; };
  // the camp limit before cutdown, the 53 from then on
  const count = tid => kind === 'camp' ? rosterOf(tid).length : activeCount(tid), limit = kind === 'camp' ? OFFSEASON_MAX : ROSTER_MAX;
  // a club already carrying all it wants at a position (one kicker, three quarterbacks) only signs another by letting one of them go
  const leastAt = (c, pos) => { if (!c.lp) c.lp = {}; if (c.lp[pos] !== undefined) return c.lp[pos]; const U = c.M.units[FO_UNIT[pos] || 'SKILL']; if (!U) return c.lp[pos] = null; const w = foWorths(c.M, U.key); let b = null, low = 1e9;
    for (const id of U.ids) if (c.M.byId[id].pos === pos && w[id] < low) { low = w[id]; b = c.M.byId[id]; } return c.lp[pos] = b ? { p: b, worth: low } : null; };
  let signed = 0;
  for (let round = 0; round < 12; round++) {
    const bids = [];
    for (const c of S) {
      if (c.done) continue;
      const room = capRoom(c.tid) - cfg.reserve, full = count(c.tid) >= limit;
      if (room < MIN_SALARY) { c.done = true; continue; }
      if (full && c.least === undefined) c.least = foLeast(c.M);
      if (full && !c.least) { c.done = true; continue; }
      let best = null, bs = -1e9, bd = null, open = false;
      for (const p of cand) {
        if (p.tid !== -1 || p.ask > room) continue;
        const over = kind !== 'camp' && (c.M.counts[p.pos] || 0) >= (FO.cap[p.pos] || 99), drop = over ? leastAt(c, p.pos) : full ? c.least : null;
        if ((over || full) && (!drop || drop.p.id === p.id)) continue;
        let g = c.g[p.id];
        if (g === undefined) g = c.g[p.id] = viewOvr(p, c.tid) + 6 < weakOf(c, p) && p.pos !== 'K' && p.pos !== 'P' ? 0 : foGain(c.M, p);
        const net = g - Math.max(0, p.ask - MIN_SALARY) * FO.money - (drop ? Math.max(0, drop.worth) : 0);
        if (net > bs) { bs = net; best = p; bd = drop; open = !drop; }
      }
      const bar = open && kind === 'cut' ? 0.01 : cfg.bar; // an open place on the 53 goes to the best man available
      if (best && bs >= bar) bids.push({ c, p: best, net: bs, drop: bd }); else c.done = true;
    }
    if (!bids.length) break;
    bids.sort((a, b) => b.net - a.net); const took = new Set();
    for (const b of bids) {
      if (took.has(b.p.id)) continue; // he went elsewhere: this club looks again next round
      const c = b.c;
      if (b.drop) { releasePlayer(b.drop.p.id); foRemove(c.M, b.drop.p); }
      else if (count(c.tid) >= limit) { c.done = true; continue; }
      if (signFA(b.p.id, c.tid, 1)) { c.done = true; continue; }
      took.add(b.p.id); foAdd(c.M, b.p); c.g = {}; c.weak = null; c.least = undefined; c.lp = null; signed++;
    }
  }
  return signed;
}
// ---------- getting under the cap: the men whose loss costs the lineups least for each dollar it frees ----------
function foCapCuts(tid) {
  let n = 0;
  while (capRoom(tid) < 0 && n < 12) {
    const ro = rosterOf(tid).filter(p => p.a && !onIR(p)), M = foModel(tid, ro), w = foWorths(M); let pick = null, low = 1e9;
    for (const p of ro) { const sv = cutSavings(p); if (sv <= 0.5 || (M.counts[p.pos] || 0) <= (FO.floor[p.pos] || 1)) continue;
      const s = (w[p.id] + Math.max(0, sv - MIN_SALARY) * FO.money + 0.5) / sv; if (s < low) { low = s; pick = p; } }
    if (!pick) break;
    releasePlayer(pick.id); n++;
  }
  return n;
}
// ---------- the practice squad: the best long-term bets, with a lean toward the jobs the 53 is thin at ----------
function foPsOrder(tid, pool, score) {
  const M = foModel(tid, rosterOf(tid).filter(p => p.a && !onIR(p)));
  const top = pool.slice(0, 48).map(p => ({ p, s: score(p) + (p.a ? clamp(foGain(M, p), 0, 3) * 1.5 : 0) })).sort((a, b) => b.s - a.s).map(x => x.p);
  return top.concat(pool.slice(48));
}
