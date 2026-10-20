'use strict';
// =====================================================================
//  THE CLUB'S PLAN: how much it means to spend, on what, and how far ahead it looks
//  - Carryover: cap space a club does not use rolls into next season, up to 10% of the cap.
//  - Stance: what the front office is trying to do (all-in, contend, rising, retool, rebuild), set when the league year opens
//    and looked at again at the trade deadline. Never shown; read from what clubs do. Your club has none: your staff advises
//    from your real budget as a contender would.
//  - Room plans: each position room two seasons out (who is here, who is aging out, whose deal ends) and what it needs.
//  - The budget: what the club means to spend this season and next, less what it has committed and what its needs will cost.
//    What is left (the slack) sets one price of money for the club, used by every decision that spends or saves.
// =====================================================================

// ---------- carryover ----------
const CARRY_MAX = 0.10; // of the cap
function capOf(tid) { const t = T(tid); return round2(CAP + ((t && t.carry) || 0)); }
// at the end of the league year: what each club did not use comes with it, up to the limit
function carryoverClose() {
  const was = CAP_ALL; CAP_ALL = true; // the whole season's payroll counts, not the offseason's top 51
  const left = {}; for (const t of state.teams) left[t.id] = Math.max(0, capRoom(t.id));
  CAP_ALL = was; return left;
}
function carryoverOpen(left) {
  for (const t of state.teams) {
    const unused = left[t.id] || 0, carry = round2(Math.min(unused, CARRY_MAX * state.cap));
    t.carry = carry;
    if (t.id === state.userTid && !isAI(t.id) && unused > 0.5) addNews(unused > carry + 0.05 ? `You finished ${fmtMoney(unused)} under the cap. ${fmtMoney(carry)} carries into next season (the most a club can carry over is ${Math.round(CARRY_MAX * 100)}% of the cap); ${fmtMoney(round2(unused - carry))} is gone.` : `You finished ${fmtMoney(unused)} under the cap. All of it carries into next season.`, [t.id]);
  }
}

// ---------- stances ----------
// spend: share of the cap it means to use. reserve: kept back for injuries and claims ($M). now/next: how the price of money
// leans this season and next (below 1 = that year's money feels cheap). youth: how hard the front office leans on playing
// the young. vet / prime: the longest deal it gives a 30-plus veteran and a player in his prime. walk: age at which a merely
// good player is let go. dev: how much upside counts at cutdown.
const STANCE = {
  allin:   { spend: 0.99, reserve: 5, now: 0.8, next: 0.85, youth: -1, vet: 2, prime: 5, walk: 33, dev: 0.6, draftNow: 1.0, draftNext: 0.3 },
  contend: { spend: 0.97, reserve: 6, now: 1.0, next: 1.0, youth: 0, vet: 2, prime: 5, walk: 31, dev: 1.0, draftNow: 1.0, draftNext: 0.6 },
  rising:  { spend: 0.95, reserve: 6, now: 1.0, next: 1.0, youth: 0.5, vet: 1, prime: 5, walk: 30, dev: 1.2, draftNow: 0.9, draftNext: 0.8 },
  retool:  { spend: 0.92, reserve: 7, now: 1.0, next: 1.15, youth: 1, vet: 1, prime: 3, walk: 29, dev: 1.5, draftNow: 0.6, draftNext: 1.0 },
  rebuild: { spend: 0.90, reserve: 8, now: 0.85, next: 1.25, youth: 2, vet: 1, prime: 4, walk: 28, dev: 2.0, draftNow: 0.4, draftNext: 1.0 },
};
function stanceOf(tid) {
  const t = T(tid); if (!t) return 'contend';
  if (tid === state.userTid && !isAI(tid)) return 'contend'; // your staff advises as a contender would; you decide
  if (!t.stance || !STANCE[t.stance]) setStance(tid);
  return t.stance;
}
function stanceCfg(tid) { return STANCE[stanceOf(tid)]; }
function qbHunt(tid) { stanceOf(tid); return !!T(tid).qbHunt; }
// how good a roster is, as its own front office sees it: the best at each job the club fields, the passer counted twice
function clubStrength(tid) {
  const ro = rosterOf(tid).filter(p => !(p.ir && p.ir.season)), by = {}; ro.forEach(p => (by[p.pos] = by[p.pos] || []).push(viewOvr(p, tid)));
  let s = 0, n = 0; for (const pos of POSITIONS) { const l = (by[pos] || []).sort((a, b) => b - a), k = STARTERS[pos] || 1; for (let i = 0; i < k; i++) { const w = pos === 'QB' ? 2 : 1; s += (l[i] || 45) * w; n += w; } }
  return s / n;
}
function setStance(tid, midSeason) {
  const t = T(tid), u = state.userTid; if (!t) return;
  const str = state.teams.map(x => [x.id, clubStrength(x.id)]).sort((a, b) => a[1] - b[1]), rk = str.findIndex(x => x[0] === tid) / Math.max(1, str.length - 1);
  const recs = standings(), r = recs.find ? recs.find(x => x.tid === tid) : recs[tid], g = r ? r.w + r.l + r.t : 0, win = g >= 4 ? (r.w + r.t * 0.5) / g : 0.5;
  const score = 0.65 * rk + 0.35 * win;
  const top = rosterOf(tid).slice().sort((a, b) => viewOvr(b, tid) - viewOvr(a, tid)).slice(0, 15), coreAge = top.reduce((s, p) => s + p.age, 0) / Math.max(1, top.length);
  const q = rosterOf(tid).filter(p => p.pos === 'QB').sort((a, b) => viewOvr(b, tid) - viewOvr(a, tid))[0], qv = q ? viewOvr(q, tid) : 0;
  const qbGood = !!q && qv >= 74 && q.age <= 32, qbOk = !!q && qv >= 68 && q.age <= 33, qbYoung = !!q && q.age <= 26 && qv >= 66, hc = C(t.hc), fresh = !!hc && (hc.yrs || 0) === 0;
  const prev = t.stance;
  if (midSeason) { // at the deadline the record speaks
    if ((prev === 'allin' || prev === 'contend') && g >= 6 && win <= 0.3) t.stance = 'retool';
    else if ((prev === 'retool' || prev === 'rising') && g >= 6 && win >= 0.7) t.stance = 'contend';
  } else if (score >= 0.70 && qbGood && (coreAge >= 27 || q.age >= 31)) t.stance = 'allin';
  else if (score >= 0.52 && qbOk) t.stance = 'contend';
  else if (score >= 0.3 && (coreAge <= 27 || qbYoung)) t.stance = 'rising';
  else if (score < 0.2 || (score < 0.34 && !qbOk && (coreAge >= 27.6 || fresh))) t.stance = 'rebuild';
  else t.stance = 'retool';
  t.qbHunt = !q || qv < 66 || q.age >= 33 || (q.contract && q.contract.yrs <= 1 && q.age >= 31 && !rosterOf(tid).some(x => x.pos === 'QB' && x !== q && x.age <= 25 && viewCeil(x, tid) >= 72));
  if (tid === u && !isAI(u)) { t.stance = null; } // yours is yours
  BUDGET_CACHE.key = null; PLAN_CACHE.key = null;
}
function setStances(midSeason) { for (const t of state.teams) if (isAI(t.id)) setStance(t.id, midSeason); }

// ---------- room plans ----------
const PLAN_BAR = { QB: 70, RB: 66, WR: 67, TE: 65, OL: 66, DL: 66, LB: 65, CB: 66, S: 65, K: 66, P: 64 }; // what a starter has to be, as the club sees it
const PRICE_SPOT = { QB: 'QB', RB: 'RB', WR: 'WRX', TE: 'TEY', OL: 'LG', DL: 'DT', LB: 'MLB', CB: 'CB', S: 'FS', K: 'K', P: 'P' };
// what a starter at a position costs on the open market (a 27-year-old a few points above the bar)
function starterCost(pos) {
  const spot = PRICE_SPOT[pos], max = SPOTS[spot].sal * capFactor(), f = clamp((PLAN_BAR[pos] + 4 - 58) / 37, 0, 1);
  return round2(MIN_SALARY + (max - MIN_SALARY) * payLevel() * Math.pow(f, POS_SAL_EXP[pos] / ((state && state.mkt) || 1)) * 1.12);
}
// what the club expects him to be a year from now: the young grow, the old fade (on the usual curve; nobody knows a man's own)
function projNext(p, tid) {
  const r = viewOvr(p, tid), g = viewGrowth(p, tid), dec = DECL_SPOT[p.spot] || 29;
  const grow = p.age <= 23 ? g * 0.35 : p.age <= 25 ? g * 0.2 : 0, fade = p.age + 1 > dec ? Math.min(1, p.age + 1 - dec) * 2.2 + Math.max(0, p.age - dec) * 0.4 : 0;
  return r + grow - fade;
}
function hereNext(p) { const c = p.contract; return !!c && (c.yrs >= 2 || !!c.next); }
// ---------- roles: what each man does for his club, as its front office reads it ----------
// Descriptive only. The depth chart, your own choices and the game itself never read it: coaches use players as they always
// have. It answers the front office's question, what does he do for us and what would we lose without him, and it is per
// club: a backup here may be a starter somewhere else. Most players have several roles: a starting job, package and
// situational jobs, first man up at others, special teams.
const ROLE_NAME = { QB: 'Quarterback', RB: 'Running back', RB2: 'Second back', SLOT2: 'Fourth receiver', Y2: 'Third tight end', OL6: 'Sixth lineman', Y3D: 'Passing-down tight end',
  NOSE: 'Nose tackle', SHADE: 'Shade tackle', T3: '3-technique', END: 'Defensive end', WIDE: 'Wide end', OLB: 'Edge linebacker', WLBP: 'Passing-down Will', NCBP: 'Passing-down nickel', RB3D: 'Third-down back', RBSY: 'Short-yardage back', FB: 'Fullback',
  X: 'X receiver', Z: 'Z receiver', SLOT: 'Slot receiver', WR4: 'Fourth receiver', Y: 'Y tight end', H: 'Second tight end',
  LT: 'Left tackle', LG: 'Left guard', C: 'Center', RG: 'Right guard', RT: 'Right tackle',
  EDGE1: 'Edge rusher', EDGE2: 'Edge rusher', EDGE3: 'Rotational edge', RUSHE: 'Passing-down edge', RUSHI: 'Passing-down inside rusher',
  DT1: 'Defensive tackle', DT2: 'Nose tackle', NT: 'Nose tackle', DE1: 'Defensive end', DE2: 'Defensive end', IDL3: 'Rotational tackle', IDL4: 'Rotational lineman',
  MLB: 'Mike linebacker', WLB: 'Will linebacker', SAM: 'Sam linebacker', CB1: 'Outside corner', CB2: 'Outside corner', NCB: 'Nickel corner', DIME: 'Dime back',
  CB4: 'Fourth corner', FS: 'Free safety', SS: 'Strong safety', S3: 'Third safety', K: 'Kicker', P: 'Punter', KR: 'Kick returner', PR: 'Punt returner', ST: 'Core special teamer' };
const ROLE_KIND_NAME = { starter: 'starter', rotation: 'rotation', situational: 'situational', backup: 'first man up', st: 'special teams' };
function roleKind(j) { return j.free ? 'situational' : j.w >= 0.5 ? 'starter' : 'rotation'; }
function roleJobName(key) { const k = String(key).replace(/~R|#\d+/g, ''); return ROLE_NAME[k] || (typeof faJobLabel === 'function' ? faJobLabel(k) : k); }
function roleLabel(r) { return (r.kind === 'backup' ? 'Backup ' + roleJobName(r.key).replace(/^[A-Z][a-z]/, m => m.toLowerCase()) : roleJobName(r.key)) + (r.kind === 'rotation' ? ' (rotation)' : ''); }
const ROLE_CACHE = { key: null, m: {} };
function planKey() { return state.season + ':' + state.phase + ':' + (state.week || 0) + ':' + (state.pre ? state.pre.wk : ''); }
// the club's model of its own roster and every man's role set in it
// healthy: this week's roles, with the injured out (for checking against who played)
function roleModel(tid, healthy) {
  const ro = rosterOf(tid).filter(p => p.a && !(p.ir && p.ir.season) && !p.expiring && !(healthy && (p.injury || onIR(p)))), key = planKey(), sig = (healthy ? 'h' : '') + ro.length + ':' + ro.reduce((s, p) => s + p.id, 0);
  if (ROLE_CACHE.key !== key) { ROLE_CACHE.key = key; ROLE_CACHE.m = {}; }
  const ck = tid + (healthy ? 'h' : ''), hit = ROLE_CACHE.m[ck]; if (hit && hit.sig === sig) return hit;
  const M = foModel(tid, ro), roles = {}; ro.forEach(p => roles[p.id] = []);
  for (const u in M.units) {
    const U = M.units[u], hold = foHolders(M, U), starters = new Set(hold.filter((h, i) => h >= 0 && !U.jobs[i].free));
    U.jobs.forEach((j, i) => {
      const h = hold[i]; if (h >= 0) roles[h].push({ key: j.key, spot: j.spot, kind: roleKind(j), w: j.w });
      if (j.free || j.w < 0.3) return;
      let b = -1, bv = 0; for (const id of U.ids) { if (starters.has(id)) continue; const v = M.V[id][i]; if (v > bv) { bv = v; b = id; } } // first man up: the best man not already starting somewhere
      if (b >= 0 && !roles[b].some(x => x.kind === 'backup' && x.key.replace(/~R|#\d+/g, '') === j.base)) roles[b].push({ key: j.key, spot: j.spot, kind: 'backup', w: j.w }); // once per job, not per copy of it
    });
  }
  // special teams: the returners and the core of the coverage units
  const st = ro.filter(p => typeof ST_OK !== 'undefined' && ST_OK.has(p.spot) && typeof stCover === 'function');
  for (const k of ['KR', 'PR']) { const r = ro.filter(p => typeof returnScore === 'function' && returnScore(p) > -1e8).sort((a, b) => returnScore(b) - returnScore(a))[0]; if (r) roles[r.id].push({ key: k, spot: r.spot, kind: 'st', w: 0.1 }); }
  st.filter(p => !roles[p.id].some(r => r.kind === 'starter')).sort((a, b) => stCover(b) - stCover(a)).slice(0, 8).forEach(p => { if (stCover(p) >= 60) roles[p.id].push({ key: 'ST', spot: p.spot, kind: 'st', w: 0.15 }); });
  for (const id in roles) roles[id].sort((x, y) => (x.kind === 'backup') - (y.kind === 'backup') || (x.kind === 'st') - (y.kind === 'st') || y.w - x.w);
  const out = { sig, M, roles };
  ROLE_CACHE.m[ck] = out; return out;
}
function rolesOf(p, tid) { tid = tid === undefined ? p.tid : tid; if (tid < 0) return []; return roleModel(tid).roles[p.id] || []; }
// the roles he would have at a club if he joined it (for free agency, claims and trades)
function rolesIfJoined(tid, p) {
  const RM = roleModel(tid), M = RM.M; if (!p.a) return [];
  const U = foUnitOf(M, p), had = U.ids.includes(p.id); if (!had) foAdd(M, p);
  const hold = foHolders(M, U), out = []; U.jobs.forEach((j, i) => { if (hold[i] === p.id) out.push({ key: j.key, spot: j.spot, kind: roleKind(j), w: j.w }); });
  if (!had) foRemove(M, p); return out;
}
// the kind of role a free agent would be signing up for: his job to lose, a job to fight for, or depth
// a starting job only when the staff is sure of it: a couple of points over the man there is a competition
function offerRole(tid, p) { const R = clubRead(tid, p); return R.start ? (R.clear >= 0.35 || R.gap >= 6 ? 'start' : 'compete') : R.holds ? 'compete' : 'depth'; }

// ---------- room plans, by job ----------
// Each job the club's scheme uses (weighted by how much it is on the field), this season and next: who holds it and how well,
// who will hold it next year, whether an aging or expiring starter has an heir. Needs are jobs, not head counts: a club short
// a slot receiver needs a slot receiver, not any receiver.
const PLAN_CACHE = { key: null, m: {} };
function roomPlan(tid) {
  const RM = roleModel(tid), key = planKey(), sig = RM.sig + ':' + (T(tid).stance || '');
  if (PLAN_CACHE.key !== key) { PLAN_CACHE.key = key; PLAN_CACHE.m = {}; }
  const hit = PLAN_CACHE.m[tid]; if (hit && hit.sig === sig) return hit;
  const M = RM.M, S = STANCE[stanceOf(tid)], rooms = {}, needs = [], succ = new Set(), surplus = new Set();
  const ro = rosterOf(tid).filter(p => !p.expiring && !(p.ir && p.ir.season));
  for (const pos of POSITIONS) rooms[pos] = { jobs: 0, now: 0, next: 0, depth: 0, successor: false, men: ro.filter(p => p.pos === pos).length, cost: starterCost(pos), bar: PLAN_BAR[pos] };
  const drift = {}; for (const id in M.byId) { const p = M.byId[id]; drift[id] = projNext(p, tid) - viewOvr(p, tid); }
  for (const u in M.units) {
    const U = M.units[u], hold = foHolders(M, U);
    U.jobs.forEach((j, i) => {
      if (j.free || j.w < 0.25) return; // situational jobs are filled from within, not shopped for
      const pos = SPOTS[j.spot].g, room = rooms[pos]; if (!room) return;
      const bar = foBar(j), h = hold[i], r0 = h >= 0 ? M.R[h][i] : 40, wt = Math.min(1, j.w + 0.25);
      if (j.w >= 0.5) room.jobs++;
      let best1 = 0; for (const id of U.ids) { const p = M.byId[id]; if (!M.R[id][i] || !hereNext(p)) continue; best1 = Math.max(best1, M.R[id][i] + drift[id]); }
      if (r0 < bar) { needs.push({ key: j.key, spot: j.spot, pos, when: 'now', bar, w: j.w }); room.now += wt; }
      else if (best1 < bar) { needs.push({ key: j.key, spot: j.spot, pos, when: 'next', bar, w: j.w }); room.next += wt; }
      if (h >= 0 && j.w >= 0.5 && pos !== 'K' && pos !== 'P') { // an heir for a starter who is aging out or whose deal is ending
        const hp = M.byId[h], going = hp.age + 1 >= (DECL_SPOT[hp.spot] || 29) || !hereNext(hp);
        if (going) { const heirs = U.ids.filter(id => id !== h && M.byId[id].age <= 25 && M.R[id][i] && (M.R[id][i] + drift[id] >= bar - 4 || M.R[id][i] + viewGrowth(M.byId[id], tid) >= bar + 2)).sort((a, b) => M.R[b][i] + viewGrowth(M.byId[b], tid) - M.R[a][i] - viewGrowth(M.byId[a], tid));
          if (heirs.length) succ.add(heirs[0]); else { needs.push({ key: j.key, spot: j.spot, pos, when: 'heir', bar, w: j.w }); room.successor = true; } }
      }
    });
  }
  // good players with no real job here: what a club could move
  for (const p of ro) { const r = RM.roles[p.id] || []; if (p.age >= 26 && !r.some(x => x.kind === 'starter' || x.kind === 'rotation') && viewOvr(p, tid) >= (PLAN_BAR[p.pos] || 66)) surplus.add(p.id); }
  let shop0 = 0, shop1 = 0;
  for (const pos of POSITIONS) { const room = rooms[pos]; room.depth = Math.max(0, (ROSTER_TEMPLATE[pos] || 1) - room.men);
    shop0 += room.now * room.cost * (S.draftNow >= 0.9 ? 1 : S.draftNow >= 0.6 ? 0.7 : 0.4) + room.depth * MIN_SALARY * 1.2; shop1 += room.next * room.cost; } // a rebuilding club fills a hole with a cheap one-year man
  const plan = { sig, rooms, needs, succ, surplus, shop0: round2(shop0), shop1: round2(shop1) };
  PLAN_CACHE.m[tid] = plan; return plan;
}
// how well a player answers what the club needs: a job open now or next year, an heir, or a room with nothing to offer him
function planNeedFor(tid, p, r) {
  const plan = roomPlan(tid), S = stanceCfg(tid); if (!p.a) return 0;
  const fit = typeof schemeFit === 'function' ? schemeFit(p, tid) : 0, g = viewGrowth(p, tid);
  let now = 0, next = 0, heir = 0;
  for (const nd of plan.needs) {
    if (SPOTS[nd.spot].side !== SPOTS[p.spot].side) continue;
    const rd = foRead(p, tid, nd.spot, nd.spot === p.spot ? fit : 0) + (r !== undefined && nd.spot === p.spot ? r - viewOvr(p, tid) : 0);
    if (nd.when === 'now' && rd >= nd.bar - 2) now = 1;
    else if (nd.when === 'next' && (rd >= nd.bar - 4 || rd + g >= nd.bar)) next = 1;
    else if (nd.when === 'heir' && p.age <= 25 && rd + g >= nd.bar + 2) heir = 1;
  }
  let n = now * S.draftNow + next * 0.8 * S.draftNext + heir * 0.6;
  const room = plan.rooms[p.pos];
  if (!n && room && !room.now && !room.next && room.men >= (ROSTER_TEMPLATE[p.pos] || 1) + 1) n -= 0.6;
  return n;
}

// ---------- the club's read of one player: what every roster decision weighs ----------
// One read for signing, re-signing, extending and claiming, in the coaching staff's terms:
// - g: how much better the club's lineups are with him (for a man already here: how much worse without him), in the model's
//   value points, with injury cover, special teams, upside, and a thin room's need for bodies
// - job / start / gap: the job he would hold and his margin over the next man at it (the starter he would push down, or for a
//   man already here, the one who would take over without him)
// - clear: how sure the staff can be that he is the starter, from that margin against how well it reads players. A couple of
//   points over a weak starter is a competition; a poor evaluator needs a bigger gap before it is sure.
// The market around him (how many like him are still out there, and how many clubs want one) is poolMult's.
const READ_CACHE = { key: null, m: {} };
// the lineup healthy and with each starter out in turn (the pairs the cut plan also weighs are left out: this is the market's quick read)
function foUnitScoreLite(jobs, ids, V, H) {
  const nj = jobs.length, order = new Array(nj);
  for (let j = 0; j < nj; j++) { const a = []; for (const id of ids) if (V[id][j] > 0) a.push(id); order[j] = a.sort((x, y) => V[y][j] - V[x][j]); }
  const used = new Set(); let who;
  const solve = out => { let tot = 0; used.clear(); who = [];
    for (let j = 0; j < nj; j++) { const o = order[j], free = jobs[j].free;
      for (let k = 0; k < o.length; k++) { const id = o[k]; if (id === out || (!free && used.has(id))) continue; tot += V[id][j]; if (!free) { used.add(id); who.push(id); } break; } }
    return tot; };
  const v0 = solve(-1), st = who; let num = v0, den = 1;
  for (const id of st) { const h = H[id]; num += h * solve(id); den += h; }
  return num / den;
}
function holdersOf(U, ids, V) { const used = new Set(); return U.jobs.map((j, i) => { let b = -1, bv = 0; for (const id of ids) { if (!j.free && used.has(id)) continue; const v = V[id][i]; if (v > bv) { bv = v; b = id; } } if (b >= 0 && !j.free) used.add(b); return b; }); }
const idsSig = ids => ids.length + ':' + ids.reduce((s, id) => s + id, 0);
function clubRead(tid, p) {
  if (!p || !p.a || tid < 0 || !T(tid)) return { g: 0, play: 0, gap: -99, sd: 3, clear: 0, sure: 0, start: false, holds: false, job: null, w: 0, read: 0, own: false };
  const RM = roleModel(tid), M = RM.M, U = foUnitOf(M, p), key = planKey();
  if (READ_CACHE.key !== key) { READ_CACHE.key = key; READ_CACHE.m = {}; }
  const usig = idsSig(U.ids) + ':' + p.tid + ':' + (p.expiring ? 1 : 0), hit = READ_CACHE.m[tid + ':' + p.id];
  if (hit && hit.usig === usig) return hit.r;
  foRow(M, p);
  const had = U.ids.includes(p.id), withIds = had ? U.ids : U.ids.concat(p.id), without = had ? U.ids.filter(id => id !== p.id) : U.ids;
  const lite = ids => foUnitScoreLite(U.jobs, ids, M.V, M.H);
  if (U.liteSig !== idsSig(U.ids)) { U.liteSig = idsSig(U.ids); U.lite = lite(U.ids); }
  let g;
  if (had) g = U.lite - lite(without) + M.extra[p.id] + M.dev[p.id] * 0.5;
  else { const projects = U.ids.filter(id => M.byId[id].pos === p.pos && M.dev[id] > M.dev[p.id]).length; g = lite(withIds) - U.lite + M.extra[p.id] + M.dev[p.id] * Math.pow(0.5, projects); }
  const n = (M.counts[p.pos] || 0) - (had ? 1 : 0); // a thin room needs bodies, whatever the sums say (a reason to sign someone, not to pay him more: any body fills it)
  const fill = n < (FO.floor[p.pos] || 1) ? 6 : n < (ROSTER_TEMPLATE[p.pos] || 1) ? 3 : 0;
  // the job he would hold, and the man next in line at it
  const hW = holdersOf(U, withIds, M.V), hWo = holdersOf(U, without, M.V), Rd = M.R;
  let bi = -1; U.jobs.forEach((j, i) => { if (hW[i] === p.id && !j.free && (bi < 0 || j.w > U.jobs[bi].w)) bi = i; });
  const start = bi >= 0 && U.jobs[bi].w >= 0.5, holds = hW.includes(p.id);
  if (bi < 0) { let bg = -1e9; U.jobs.forEach((j, i) => { if (j.free || j.w < 0.3 || !Rd[p.id][i]) return; const d = Rd[p.id][i] - (hW[i] >= 0 ? Rd[hW[i]][i] : 40); if (d > bg) { bg = d; bi = i; } }); }
  let gap = -99, read = 0, nx = -1;
  if (bi >= 0) { read = Rd[p.id][bi]; nx = hW[bi] === p.id ? hWo[bi] : hW[bi]; gap = read - (nx >= 0 ? Rd[nx][bi] : 40); }
  const k = 1.7 - foQuality(T(tid)) / 100, j = bi >= 0 ? U.jobs[bi] : null, mine = had || p.tid === tid;
  // how unsure the comparison is: the club's read of him (its own man as well as it has come to know him, anyone else through
  // scouting), more if the job is not his own spot, and its read of the man next in line
  const sd = Math.hypot(readSd(p, tid), j && j.spot !== p.spot ? FO.sdJob * k * 0.5 : 0, nx >= 0 && M.byId[nx] ? readSd(M.byId[nx], tid) : 1);
  const barF = j ? clamp((read - (foBar(j) - 4)) / 4, 0, 1) : 0, clear = start ? clamp((gap - 2 - sd) / 4, 0, 1) * barF : 0;
  // how sure the club is that he is its starter: for a newcomer, the clear call above. A man already starting here is known to be the
  // starter (a close backup makes him worth less, which his value already says, not less certain); a quarterback still needs the clear call.
  const sure = mine && start && p.pos !== 'QB' ? barF * clamp(0.5 + (gap - sd) / 8, 0.5, 1) : clear;
  const r = { g: round2(g + fill), play: round2(g), gap: round2(gap), sd: round2(sd), clear: round2(clear), sure: round2(sure), start, holds, job: j ? j.key : null, w: j ? j.w : 0, read: round2(read), own: had };
  READ_CACHE.m[tid + ':' + p.id] = { usig, r }; return r;
}
// ---------- the market around a player ----------
// How many players like him are still to be had (free agents now; before the draft, the top of the class; in re-signing season,
// the other clubs' players whose deals are up), against how many other clubs need one now. Plenty of supply: nobody pays top
// money for the first one off the shelf. One left and five clubs looking: he gets a premium.
let POOL_CACHE = { key: null };
function marketPools() {
  const key = planKey() + ':' + (state.fa && !state.fa.over ? state.fa.day : '-');
  if (POOL_CACHE.key === key) return POOL_CACHE;
  const fa = {}, ex = {}, dr = {}, pre = state.phase === 'RESIGN' || state.phase === 'FA', pros = [], push = (m, x, o) => (m[x.pos] = m[x.pos] || []).push({ id: x.id, o });
  for (const x of Object.values(state.players)) {
    if (x.tid === -1 && !x.waiver && x.a && !(x.injury && x.injury.wks > 4) && x.age <= 35) push(fa, x, perOvr(x));
    else if (state.phase === 'RESIGN' && x.tid >= 0 && x.expiring) push(ex, x, perOvr(x));
    else if (pre && x.tid === -2) pros.push(x);
  }
  const grow = x => (x.per ? x.per.g : Math.max(0, (x.pot || 0) - (x.ovr || 0)));
  pros.sort((a, b) => perOvr(b) + grow(b) * 0.5 - perOvr(a) - grow(a) * 0.5).slice(0, 64).forEach(x => push(dr, x, perOvr(x) + grow(x) * 0.35)); // the top two rounds, as they may be a year on
  POOL_CACHE = { key, fa, ex, dr, dem: {} }; return POOL_CACHE;
}
function marketDemand(pos) { const P0 = marketPools(); if (P0.dem[pos] === undefined) { let n = 0; for (const t of state.teams) { const r = roomPlan(t.id).rooms[pos]; if (r && r.now > 0) n++; } P0.dem[pos] = n; } return P0.dem[pos]; }
function poolMult(tid, p) {
  const P0 = marketPools(), lvl = perOvr(p), near = l => (l || []).reduce((s, x) => s + (x.id !== p.id && x.o >= lvl - 2 ? 1 : 0), 0);
  const alt = near(P0.fa[p.pos]) + 0.5 * near(P0.ex[p.pos]) + 0.5 * near(P0.dr[p.pos]), mine = roomPlan(tid).rooms[p.pos];
  const dem = Math.max(0, marketDemand(p.pos) - (mine && mine.now > 0 ? 1 : 0)); // the other clubs that want one
  return clamp(1 + (1 - (alt + 1) / (dem + 1)) * 0.08, 0.9, 1.08);
}
// ---------- quarterbacks: one clear starter chased at a time ----------
// A club goes after one quarterback it is sure would start. If it is not sure of anyone, it may bring in up to two to compete,
// at a competition's money (up to 5% of the cap), never a starter's. Backups (2% and under) are always fine.
function qbTier(tid, p, aav) { return clubRead(tid, p).clear >= 0.5 ? 'starter' : aav <= 0.02 * state.cap ? 'backup' : 'compete'; }
function qbChase(tid) {
  const t = T(tid), out = { starter: 0, compete: 0 };
  if (t.qbBuy && t.qbBuy.s === state.season) { out.starter += t.qbBuy.starter; out.compete += t.qbBuy.compete; }
  if (state.fa && state.fa.off) for (const pid in state.fa.off) { const q = P(+pid); if (!q || q.pos !== 'QB') continue; const o = state.fa.off[pid].find(x => x.tid === tid); if (o && out[o.tier] !== undefined) out[o.tier]++; }
  return out;
}
function qbChaseOk(tid, tier, aav) {
  if (tier === 'backup') return true;
  if (tier === 'compete' && aav > 0.05 * state.cap) return false; // not sure he starts: not at a starter's money
  const c = qbChase(tid); return tier === 'starter' ? c.starter === 0 : c.starter === 0 && c.compete < 2;
}
// a club bringing a man in off the street or off waivers pays no more than it would in the market, and keeps to the quarterback rule
function streetPayOk(tid, p, amt) {
  if (amt <= MIN_SALARY * 1.5) return true; // a minimum deal is always fine
  if (p.pos === 'QB' && !qbChaseOk(tid, qbTier(tid, p, amt), amt)) return false;
  return amt <= clubMaxAAV(tid, p, faClubAAV(tid, p), { yrs: 1 }) * 1.1;
}
function qbBought(tid, tier) { const t = T(tid); if (!t || tier === 'backup' || !tier) return; if (!t.qbBuy || t.qbBuy.s !== state.season) t.qbBuy = { s: state.season, starter: 0, compete: 0 }; t.qbBuy[tier]++; }

// ---------- the budget, and the price of money ----------
// committed money this season: the 53 the club will carry, its dead money, its practice squad, and a rookie class still to sign
function rookieClassCost(tid, season) { let s = 0; for (const pk of state.picks || []) if (pk.owner === tid && pk.season === season) s += rookieContract(pk.round * 32 - 16, pk.round).amt; return round2(s); }
function committedNow(tid) {
  const t = T(tid), ro = rosterOf(tid);
  if (state.phase === 'REG' || state.phase === 'PLAYOFFS' || state.phase === 'WAIVERS') return payroll(tid) + (state.phase === 'WAIVERS' ? 0 : 0);
  const hits = ro.filter(p => p.contract.yrs > 0).map(p => p.contract.amt).sort((a, b) => b - a), n = Math.min(53, hits.length);
  let s = (t.dead || 0) + hits.slice(0, n).reduce((a, b) => a + b, 0) + Math.max(0, 53 - n) * MIN_SALARY + PS_MAX * PS_SALARY;
  if (state.phase !== 'PRESEASON' && state.phase !== 'CUTDOWN' && state.phase !== 'UDFA') s += rookieClassCost(tid, state.season + 1);
  return round2(s);
}
function committedNext(tid) {
  const ro = rosterOf(tid), n = ro.filter(hereNext).length, inS = state.phase === 'REG' || state.phase === 'PLAYOFFS';
  return round2(payrollNext(tid) + (inS ? rookieClassCost(tid, state.season + 1) : rookieClassCost(tid, state.season + 2)) + Math.max(0, 46 - n) * MIN_SALARY + PS_MAX * PS_SALARY);
}
// slack (share of the cap) to price: plenty left makes a dollar cheap, none left makes it dear
function priceOf(x) { return clamp(0.3 * Math.exp(-x / 0.065), 0.05, 1.2); }
const BUDGET_CACHE = { key: null, m: {} };
function clubBudget(tid) {
  const t = T(tid), key = state.season + ':' + state.phase + ':' + (state.week || 0);
  if (BUDGET_CACHE.key !== key) { BUDGET_CACHE.key = key; BUDGET_CACHE.m = {}; }
  const pay = payroll(tid), nx = payrollNext(tid), sig = pay + ':' + nx + ':' + rosterOf(tid).length + ':' + (t.carry || 0) + ':' + (t.stance || '');
  const hit = BUDGET_CACHE.m[tid]; if (hit && hit.sig === sig) return hit;
  const S = stanceCfg(tid), plan = roomPlan(tid), inS = state.phase === 'REG' || state.phase === 'PLAYOFFS';
  const cap0 = capOf(tid), cap1 = round2(state.cap * 1.06);
  const y0 = { cap: cap0, budget: round2(S.spend * cap0 - S.reserve), committed: committedNow(tid), shop: inS ? 0 : plan.shop0 };
  const y1 = { cap: cap1, budget: round2(S.spend * cap1 - S.reserve), committed: committedNext(tid), shop: plan.shop1 };
  for (const [y, lean] of [[y0, S.now], [y1, S.next]]) { y.slack = round2(y.budget - y.committed - y.shop); y.price = round2(priceOf(y.slack / y.cap) * lean); }
  const b = { sig, stance: stanceOf(tid), y: [y0, y1] };
  BUDGET_CACHE.m[tid] = b; return b;
}
function priceNow(tid) { return clubBudget(tid).y[0].price; }
// what money costs a club in value points: amounts this season, next, and after (later years at next season's rate, a little softer)
function moneyCost(tid, amounts) {
  const b = clubBudget(tid).y; let s = 0;
  amounts.forEach((a, i) => { if (a) s += a * (i === 0 ? b[0].price : b[1].price * Math.pow(0.9, i - 1)); }); // a negative amount (cutting costs cap room) is a reason to keep
  return s;
}
// a contract as the yearly amounts a club pays above the minimum
function overMin(amt, yrs) { const a = Math.max(0, amt - MIN_SALARY), out = []; for (let i = 0; i < Math.max(1, yrs); i++) out.push(a); return out; }
// what cutting him saves on this year's cap, after his replacement's minimum. Negative when the guarantees that come due at once
// are more than his salary: cutting him then costs room. Next year's money is next year's decision: nobody cuts a man today to
// save a year he may still be worth.
function cutSavingsByYear(p) {
  const c = p.contract; if (!c || !(c.yrs > 0)) return [0];
  const d = deadIfCut(p);
  return [round2(c.amt - d.now - MIN_SALARY)];
}

// an advance: salary owed in later years paid this season instead (the club's future cap gets lighter); only plain deals
function aiAdvance(tid) {
  const S = stanceCfg(tid), cap = capOf(tid); let short = S.spend * cap - S.reserve - payroll(tid) - 0.03 * cap;
  if (short <= 0) return 0;
  let paid = 0;
  // the biggest deals first, in the rooms with headroom in their range before the ones already at the top (it is the same money either
  // way, only paid sooner: no room is skipped)
  const head = p => { const rg = clubRange(tid, p.pos); return rg ? rg[1] * cap - roomSpendYr(tid, p.pos, -1, 0) : 0; };
  for (const p of rosterOf(tid).filter(p => p.contract.yrs >= 2 && !p.contract.rookie && !p.contract.inc && !p.contract.next && p.contract.amt > MIN_SALARY * 2).sort((a, b) => (head(b) > 0) - (head(a) > 0) || b.contract.amt - a.contract.amt)) {
    if (short <= 0.5) break;
    const c = p.contract; if (!c.sched) c.sched = Array(c.yrs).fill(c.amt);
    const later = c.sched.slice(1).reduce((s, x) => s + x, 0), x = round2(Math.min(short, later * 0.3)); if (x <= 0.1) continue;
    for (let i = 1; i < c.sched.length; i++) c.sched[i] = round2(c.sched[i] - x * c.sched[i] / later);
    c.sched[0] = round2(c.sched[0] + x); c.amt = c.sched[0]; short -= x; paid += x;
  }
  return round2(paid);
}
// ---------- position spending ranges ----------
// share of the cap a room usually takes across the league (the real one); a club bidding past the top of a range pays for it in value
const ROOM_RANGE = { QB: [0.08, 0.24], RB: [0.02, 0.06], WR: [0.06, 0.17], TE: [0.03, 0.08], OL: [0.12, 0.21], DL: [0.14, 0.26], LB: [0.03, 0.08], CB: [0.06, 0.13], S: [0.03, 0.08], K: [0.004, 0.02], P: [0.003, 0.015] };
// Each club's range is its own: its coaching staff's scheme says how much it uses a room. A spread passing offense puts more
// into receivers and less into backs; a four-man front lives on its line, a 3-4 on its linebackers.
const RANGE_CACHE = { key: null, m: {} };
function schemeUse(tid) {
  const use = {}; for (const j of foJobs(tid)) { if (j.free) continue; const g = SPOTS[j.spot].g; use[g] = (use[g] || 0) + j.w; }
  const ot = offTend(T(tid)) || {}; use.pass = ot.pass !== undefined ? ot.pass : 0.58; return use;
}
function clubRange(tid, pos) {
  const base = ROOM_RANGE[pos]; if (!base) return null;
  if (pos === 'QB' || pos === 'K' || pos === 'P') return base;
  const key = state.season + ':' + state.phase;
  if (RANGE_CACHE.key !== key) { RANGE_CACHE.key = key; RANGE_CACHE.m = {}; const all = state.teams.map(t => schemeUse(t.id)), med = {};
    for (const k of [...POSITIONS, 'pass']) { const a = all.map(u => u[k] || 0).sort((x, y) => x - y); med[k] = a[a.length >> 1] || 1; } RANGE_CACHE.med = med; }
  const hit = RANGE_CACHE.m[tid] || (RANGE_CACHE.m[tid] = { use: schemeUse(tid), r: {} }); if (hit.r[pos]) return hit.r[pos];
  const med = RANGE_CACHE.med, u = (hit.use[pos] || med[pos]) / med[pos], dp = hit.use.pass - med.pass;
  const tilt = pos === 'WR' ? 1 + dp * 1.2 : pos === 'TE' ? 1 + dp * 0.4 : pos === 'RB' ? 1 - dp * 1.2 : 1;
  return hit.r[pos] = [round2(base[0] * clamp(u * tilt, 0.6, 1.4) * 1000) / 1000, round2(base[1] * clamp(Math.pow(u, 1.5) * tilt, 0.7, 1.3) * 1000) / 1000];
}
function roomSpend(tid, pos, excludeId) { return roomSpendYr(tid, pos, excludeId, 0); }
// what a room's contracts count against the cap in a given year from now (0 = this one)
function roomSpendYr(tid, pos, excludeId, yr) {
  let s = 0;
  for (const p of rosterOf(tid)) { if (p.pos !== pos || p.id === excludeId) continue; const c = p.contract; if (!c) continue;
    if (yr === 0) { if (c.yrs > 0) s += c.amt; } else if (c.yrs > yr) s += c.sched && c.sched[yr] !== undefined ? c.sched[yr] : c.amt; else if (yr === 1 && c.yrs === 1 && c.next) s += c.next.amt; }
  return s;
}
function projCap(tid, yr) { return yr === 0 ? capOf(tid) : state.cap * Math.pow(1.06, yr); }
// how much more willing a club is to put this money in this room: 1 inside its range; less past the top, checked against the
// biggest cap hit of the next two years (a front- or back-loaded deal counts at its peak). A new big contract stops for good well
// past the top; a club keeping its own man gets a little more room. A room's one star is never stopped.
// opt: { own, yrs, sched }
function roomRoomFor(tid, pos, aav, excludeId, opt) {
  opt = opt || {}; const r = clubRange(tid, pos); if (!r) return 1;
  const hits = opt.sched || Array(Math.min(2, Math.max(1, opt.yrs || 2))).fill(aav); let over = -1;
  for (let i = 0; i < Math.min(2, hits.length); i++) over = Math.max(over, (roomSpendYr(tid, pos, excludeId, i) + hits[i]) / projCap(tid, i) - r[1]);
  if (over <= 0) return 1;
  const alone = roomSpendYr(tid, pos, excludeId, 0) <= r[1] * 0.5 * capOf(tid);
  if (!alone && aav >= 0.015 * state.cap && over > (opt.own ? 0.08 : 0.06)) return 0;
  return clamp(1 - over * 6, 0.5, 1);
}
// how the club shapes a multi-year deal: its usual way, unless loading it would push the room past its range in the peak year
function loadFor(tid, p, aav, yrs) {
  const L = clubLoad(tid); if (L === 'even' || yrs < 2) return 'even';
  return roomRoomFor(tid, p.pos, aav, -1, { sched: loadSched(aav, yrs, L) }) < roomRoomFor(tid, p.pos, aav, -1, { yrs }) ? 'even' : L;
}
// how high a club will go for a player, in yearly money: its read of his market (base), how badly the room needs him, what money
// costs it now, how the stance sees his age, and how much of the cap the room already takes. Spare money only goes to a man the
// staff is sure would start: anyone else gets close to his market at most.
// the stance's ages are for most positions: a quarterback lasts a few years longer, a kicker or punter several more
function ageFor(p, age) { return age + (p.pos === 'K' || p.pos === 'P' ? 6 : p.pos === 'QB' ? 3 : 0); }
function walkAge(S, p) { return ageFor(p, S.walk); }
function clubMaxAAV(tid, p, base, opt) {
  const S = stanceCfg(tid), st = stanceOf(tid), pr = priceNow(tid), need = planNeedFor(tid, p), R = clubRead(tid, p), sure = R.sure;
  const cheap = clamp(Math.pow(0.3 / Math.max(0.05, pr), 0.35), 0.75, 1.6);
  let w = (cheap > 1 ? 1 + (cheap - 1) * sure : cheap) * clamp(1 + need * 0.12 * (0.4 + 0.6 * sure), 0.8, 1.25);
  if (p.age >= walkAge(S, p)) w *= 0.6; else if (p.age >= ageFor(p, 29) && (st === 'retool' || st === 'rebuild')) w *= 0.8;
  if (st === 'allin' && p.age >= 27 && viewOvr(p, tid) >= 74 && R.start) w *= 1.08; // a proven man for the push
  if (qbHunt(tid) && p.pos === 'QB') w *= 1 + 0.15 * sure;
  let max = base * w;
  if (sure < 0.5) max = Math.min(max, marketValue(p, viewOvr(p, tid)) * 1.15);
  max *= roomRoomFor(tid, p.pos, max, p.tid === tid ? p.id : -1, opt);
  return round2(Math.min(max, aiCeil(p.pos))); // even a bidding war stops at what the very best get
}
// the most any club pays one man a year: the very best quarterbacks, and everyone else
function aiCeil(pos) { return round2(state.cap * (pos === 'QB' ? 0.22 : 0.15)); }
// the longest deal the club will offer him
function clubMaxYears(tid, p) { const S = stanceCfg(tid); return p.age >= ageFor(p, 29) ? S.vet : p.age >= 25 ? S.prime : 5; }
// how the club would shape the money: an all-in club pushes it later, a rebuilding one pays it now
function clubLoad(tid) { const s = stanceOf(tid); return s === 'allin' ? 'back' : s === 'rebuild' || s === 'retool' ? 'front' : 'even'; }

// ---------- playing time: how hard the staff leans toward the young ----------
// The coaches set the depth chart. What pushes them: the head coach's own bent, what the front office is trying to do,
// where the season stands, and whether his job is on the line. A high draft pick gets a little more rope; a veteran on his way
// out loses a little when nothing is left to play for. Close calls only, until there is nothing to play for.
function coachYouth(c) { if (!c) return 0; if (c.youth === undefined) c.youth = clamp(Math.round(hashGauss(c.id, 913, 7) * 1.1), -2, 2); return c.youth; }
const STANCE_YOUTH = { allin: -1, contend: 0, rising: 0.5, retool: 1, rebuild: 2 };
const STANCE_EXPECT = { allin: 0.7, contend: 0.6, rising: 0.5, retool: 0.45, rebuild: 0.3 };
function recOfTid(tid) { const s = standings(), r = s.find ? s.find(x => x.tid === tid) : s[tid]; return r || { w: 0, l: 0, t: 0 }; }
function gamesLeft() { return state.phase === 'REG' ? Math.max(0, SEASON_WEEKS - state.week + 1) : 0; }
// out of the playoff race: even winning out would not reach the seventh seed's record today
function eliminated(tid) {
  if (state.phase !== 'REG') return state.phase === 'PLAYOFFS' ? !(state.playoffs && state.playoffs.seeds && Object.values(state.playoffs.seeds).some(l => l.includes(tid))) : false;
  const conf = T(tid).conf, seeds = confSeeds(conf), w7 = recOfTid(seeds[6]), r = recOfTid(tid), pts = x => x.w + x.t * 0.5;
  return seeds.indexOf(tid) > 6 && pts(r) + gamesLeft() < pts(w7);
}
// final week, nothing left to gain or lose: two games clear of the seed below and two behind the seed above
function seedLocked(tid) {
  if (state.phase !== 'REG' || state.week !== SEASON_WEEKS) return false;
  const seeds = confSeeds(T(tid).conf), i = seeds.indexOf(tid), pts = x => { const r = recOfTid(x); return r.w + r.t * 0.5; };
  if (i < 0 || i > 6) return false;
  const rest = seeds.slice(i + 1), above = i === 0 ? 99 : pts(seeds[i - 1]) - pts(tid), below = rest.length ? pts(tid) - Math.max(...rest.map(pts)) : 99;
  return above >= 2 && below >= 2;
}
function jobSecurity(tid) {
  const hc = C(T(tid).hc); if (!hc) return 0;
  const r = recOfTid(tid), g = r.w + r.l + r.t; if (g < 6 || (hc.yrs || 0) < 2) return 0;
  const exp = STANCE_EXPECT[T(tid).stance || 'contend'] || 0.55, win = (r.w + r.t * 0.5) / g;
  return exp - win >= 0.2 ? -1.5 : exp - win >= 0.12 ? -0.7 : 0; // a coach fighting for his job plays whoever wins now
}
const LEAN_CACHE = { key: null, m: {} };
function youthLeanOf(tid) {
  if (state.phase !== 'REG' && state.phase !== 'PLAYOFFS') return { lean: 0, cap: 0, dead: false };
  const key = state.season + ':' + state.phase + ':' + state.week; if (LEAN_CACHE.key !== key) { LEAN_CACHE.key = key; LEAN_CACHE.m = {}; }
  return LEAN_CACHE.m[tid] || (LEAN_CACHE.m[tid] = youthLean0(tid));
}
function youthLean0(tid) {
  const t = T(tid), out = eliminated(tid), late = state.phase === 'REG' && state.week >= SEASON_WEEKS - 4;
  let lean = coachYouth(C(t.hc)) + (isAI(tid) ? (STANCE_YOUTH[t.stance] || 0) : 0) + jobSecurity(tid);
  lean += out ? (late ? 3.5 : 2.5) : -0.5; // in the hunt, win now; out of it, look at the young (more so in December)
  const dead = out; // nothing left to play for
  return { lean: clamp(lean, -2, dead ? 7 : 3.5), cap: dead ? 7 : 3.5, dead };
}
// points added to a player's grade for depth-chart purposes
function youthBoost(p, tid, L) {
  if (!L || !L.lean) return 0;
  let b = 0;
  const w = clamp((26.5 - p.age) / 3.5, 0, 1) * (viewGrowth(p, tid) > 1 ? 1 : 0.4);
  if (L.lean > 0) b += L.lean * w; else b += L.lean * clamp((p.age - 27) / 4, 0, 1); // a win-now staff leans to the veterans
  if (p.draft && p.exp <= 2 && p.draft.round <= 2 && L.lean > 0) b += p.draft.round === 1 ? 0.75 : 0.35; // a high pick gets more rope
  if (L.dead && p.age >= 29 && p.contract && p.contract.yrs <= 1 && T(tid).stance !== 'allin' && T(tid).stance !== 'contend') b -= Math.min(2, L.lean * 0.4); // on his way out
  return clamp(b, -L.cap, L.cap);
}
// shut down: an eliminated club does not rush its injured veterans back; they finish the year on IR
function shutDowns(tid) {
  if (!isAI(tid) || state.phase !== 'REG' || !eliminated(tid)) return;
  const left = gamesLeft();
  for (const p of rosterOf(tid)) if (p.injury && p.age >= 28 && p.injury.weeks >= Math.max(2, left - 1)) { if (!p.ir || !p.ir.season) { p.ir = { wk: state.week, season: true }; } }
}
// rest: a club whose seed is settled sits its quarterback and its stars in the last game
function restingStarters(tid) {
  if (!isAI(tid) || !seedLocked(tid)) return null;
  const ro = rosterOf(tid).filter(p => !p.injury && !onIR(p)), qbs = ro.filter(p => p.pos === 'QB').sort((a, b) => viewOvr(b, tid) - viewOvr(a, tid));
  const out = new Set(); if (qbs.length >= 2) out.add(qbs[0].id);
  ro.filter(p => p.pos !== 'QB' && p.pos !== 'K' && p.pos !== 'P' && viewOvr(p, tid) >= 80).forEach(p => out.add(p.id));
  return out.size ? out : null;
}
