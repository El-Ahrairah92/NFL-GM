'use strict';
// =====================================================================
//  THE STAFF AT WORK (DESIGN section 52)
//  What the rebuilt coach ratings do between Sundays and on them:
//    practice reps (head coach: Organizing Practice)        how much work reaches the second and third team
//    install (head coach: Team Building, then the coordinator: Install)   how much of the playbook the unit holds
//    chemistry (head coach: Team Building, then the position coach: Cohesion)
//    season film and the game plan (specialists: Game Planning against Concept Creativity; the caller: Adjustments)
//    the green dot: the defender who makes the calls
// =====================================================================

function specAvg(t, roles, key) { const v = roles.map(r => asst(t, r)).filter(Boolean).map(c => c[key]).filter(x => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 42; }
function offCreativity(t) { return specAvg(t, ['PGC', 'RGC'], 'cre'); }
function defCreativity(t) { return specAvg(t, ['DPC', 'DRC'], 'cre'); }
function offPlanning(t) { return specAvg(t, ['PGC', 'RGC'], 'plan'); }
function defPlanning(t) { return specAvg(t, ['DPC', 'DRC'], 'plan'); }

// ---------- practice reps ----------
// The week has an allowance of reps: 100 for an ordinary practice, 80 to 120 by how well the head coach runs one.
// The first team takes its 60 whatever happens. What is left goes down the order: extra reps fill up the second team before
// the third sees much, and a short week comes out of the third team first.
function repAllowance(tid) { return clamp(100 + (knob(C(T(tid).hc), 'prac') - 50) * 0.5, 80, 120); }
function repFactors(tid) { // how each team's reps compare with an ordinary week: [first, second, third]
  const m = (repAllowance(tid) - 60) / 40;
  let s2 = 0.5, s3 = 0.15;
  if (m >= 1) { const extra = (m - 1) * 0.65; s2 += Math.min(0.5, extra * 0.75); s3 += extra * 0.25; }
  else { const short = (1 - m) * 0.65; s3 = Math.max(0.03, 0.15 - short); s2 = 0.5 - Math.max(0, short - 0.12); }
  return [1, s2 / 0.5, s3 / 0.15];
}
const REP_SHARE = [1, 0.5, 0.15]; // a full share, half of one, a taste
function repShare(p) { const t = p.prac ? p.prac.t || 0 : 2, f = p.prac && p.prac.rf !== undefined ? p.prac.rf : 1; return p.tid < 0 && p.tid !== -3 ? 0.15 : REP_SHARE[t] * f; }

// ---------- how big a system is, and how much of it gets installed ----------
// A bigger book has more answers in it and takes longer to learn. Creative specialists add to it.
const OFF_SIZE_REF = 0.8;
function offSize(t) {
  const tn = offTend(t), ft = formTraits(t);
  return round2(offInstalled(tn).length * 0.035 + (tn.motion || 0) * 0.25 + ((ft.doubles || 0) + (ft.wing || 0) + (ft.offI || 0)) * 0.12 + Math.max(0, (tn.rpo || 0) * 0.5 + (tn.trick || 0) * 1.5) + clamp((offCreativity(t) - 50) / 100, -0.2, 0.4) * 0.35);
}
function defSize(t) { const pk = teamDefPk(t); return round2(libSize(pk && pk.lib) + clamp((defCreativity(t) - 50) / 100, -0.2, 0.4) * 0.35); }
function sysSize(tid, side) { const t = T(tid); return t ? (side === 'O' ? offSize(t) : defSize(t)) : 0.4; }
function sysLearn(tid, side) { return side === 'O' ? (1 + OFF_SIZE_REF) / (1 + offSize(T(tid))) : 1 / (1 + Math.max(0, defSize(T(tid)))); }
// Two stages. The head coach's Team Building gets everybody to a working knowledge quickly. Past that the coordinator's Install
// sets the pace, and a coordinator who installs poorly never gets all of a big system in: the unit stops short of it.
function installPlan(tid, side) {
  const t = T(tid), tb = knob(C(t.hc), 'tb'), co = C(side === 'O' ? t.oc : t.dc), inst = knob(co, 'inst'), size = sysSize(tid, side);
  return { lvl: 40 + tb * 0.35, fast: 0.75 + tb / 200, slow: 0.6 + inst / 125, cap: inst >= 60 ? 100 : clamp(100 - (60 - inst) * 0.7 * (0.5 + size), 60, 100) };
}
function installedPct(tid, side) { // what the unit actually knows, on the first team
  const ps = rosterOf(tid).filter(p => PRAC_SIDE[p.pos] === side && (!p.prac || !p.prac.t));
  return ps.length ? ps.reduce((s, p) => s + pbOf(p), 0) / ps.length : 0;
}
// A caller mostly sticks to what his players know. When a call asks for more than the unit has, he usually takes something out of
// it, unless he is chasing the game or it is a down he has to have: that is when the busts come.
function trimOffCall(g, call, sit) {
  const U = g.pbU ? g.pbU[g.poss][0] : 100; let need = offNeed(call);
  if (need <= U + 4) return;
  const must = (sit && (sit.hurry || g.down >= 3)) || (g.q >= 4 && g.score[g.poss] < g.score[1 - g.poss]);
  if (rand() < (must ? 0.35 : 0.8)) {
    for (const k of ['TRICK', 'RPO', 'BOOT', 'RUB', 'PA', 'MOTION']) { if (need <= U + 4) break; if (call.tags.has(k) && !(k === 'MOTION' && call.type === 'JET')) { call.tags.delete(k); need = offNeed(call); } }
    for (const k of ['optrt', 'counter', 'nohud', 'duo', 'maxp']) { if (need <= U + 4) break; if (call[k]) { call[k] = false; need = offNeed(call); } }
    call.trimmed = true;
  }
}
function trimDefCall(g, call, sit) {
  const d = 1 - g.poss, U = g.pbU ? g.pbU[d][1] : 100;
  if (defNeed(call) <= U + 4) return;
  const must = (sit && sit.passDown && g.down >= 3) || (g.q >= 4 && g.score[d] < g.score[g.poss]);
  if (rand() >= (must ? 0.35 : 0.8)) return;
  if (call.disg) call.disg = false;
  if (defNeed(call) > U + 4 && call.changeup) { call.changeup = false; delete call.look; delete call.lookT; delete call.mug; }
  if (defNeed(call) > U + 4 && call.stunt) call.stunt = false;
  if (defNeed(call) > U + 4 && (call.pres === 'SIM' || call.pres === 'FZ')) call.pres = 'FOUR';
  if (defNeed(call) > U + 4 && ['C6', 'T2', 'C4', 'C2M'].includes(call.cov)) call.cov = call.cov === 'C2M' ? 'C1' : 'C3';
  call.trimmed = true;
}

// ---------- chemistry ----------
// How well a man knows the men he plays with. A room is a unit (line, linebackers, secondary, the kicking battery): each
// player has his own number for it. A receiver, back or tight end has one with each quarterback.
// It builds in two stages, like the playbook: Team Building gets a newcomer functional in weeks; from there his position
// coach's Cohesion sets how far the room can go. Past that ceiling it all but stops, so full chemistry is rare: it takes
// an excellent coach, two seasons and very little turnover.
const CH_UNIT = { OL: 'OL', DL: 'DL', LB: 'LB', CB: 'DB', S: 'DB', K: 'KB', P: 'KB' }, CH_START = 12;
const CH_NAME = { OL: 'Offensive line', DL: 'Defensive line', LB: 'Linebackers', DB: 'Secondary', KB: 'Kicking battery', QB: 'Quarterback and his targets' };
function chemTid(p) { return p.tid >= 0 ? p.tid : p.tid === -3 ? p.psTid : -1; }
function chemOf(p) {
  if (!CH_UNIT[p.pos]) return null;
  const tid = chemTid(p);
  if (!p.ch || p.ch.t !== tid) p.ch = { t: tid, v: CH_START };
  return p.ch.v;
}
function chemPair(rec, qb) { if (!rec || !qb) return CH_START; const tid = chemTid(rec); return rec.cq && rec.cq.t === tid && rec.cq.q[qb.id] !== undefined ? rec.cq.q[qb.id] : CH_START; }
function chemCap(tid, pos) { const c = pos === 'K' || pos === 'P' ? null : posCoach(tid, pos); return clamp(55 + (c ? c.coh : pos === 'K' || pos === 'P' ? knob(C(T(tid).stc), 'kop') : 38) * 0.5, 55, 100); }
function chemStep(v, share, lvl, fast, cap) {
  if (v < lvl) return Math.min(lvl, v + fast * Math.sqrt(Math.max(0.35, share)));
  const slow = v < cap ? 1 : Math.max(0.03, 1 - (v - cap) / 6);
  return Math.min(100, v + 1.15 * share * slow);
}
function chemWeek(tid) {
  const t = T(tid), tb = knob(C(t.hc), 'tb'), lvl = 35 + tb * 0.4, fast = 4 + tb / 20;
  const all = [...rosterOf(tid), ...psOf(tid)].filter(p => !p.injury);
  for (const p of all) if (CH_UNIT[p.pos]) { const v = chemOf(p); p.ch.v = round1(chemStep(v, CH_UNIT[p.pos] === 'KB' ? 1 : repShare(p), lvl, fast, chemCap(tid, p.pos))); }
  // each quarterback with every man he throws to: the quarterbacks coach sets how fast they find each other, the receiver's own coach how far it goes
  const qbs = repsOrder(tid, 'QB').filter(p => !p.injury), qc = posCoach(tid, 'QB'), qFast = 2.5 + (qc ? qc.coh : 38) / 20 + tb / 40;
  qbs.forEach((qb, i) => { const qs = i === 0 ? 1 : i === 1 ? 0.4 : 0.12;
    for (const p of all) { if (!['RB', 'WR', 'TE'].includes(p.pos)) continue;
      if (!p.cq || p.cq.t !== tid) p.cq = { t: tid, q: {} };
      const v = p.cq.q[qb.id] !== undefined ? p.cq.q[qb.id] : CH_START;
      p.cq.q[qb.id] = round1(chemStep(v, qs * repShare(p), lvl, qFast * qs, chemCap(tid, p.pos))); } });
  const here = new Set([...rosterOf(tid), ...psOf(tid)].filter(p => p.pos === 'QB').map(p => p.id));
  for (const p of all) if (p.cq && p.cq.t === tid) for (const id in p.cq.q) if (!here.has(+id)) delete p.cq.q[id]; // quarterbacks who have gone (a hurt one keeps what he has built)
}
// the offseason programme and camp: the weeks before the opener, once a year
function chemCamp(tid) { const t = T(tid); if (state.phase !== 'REG' || t.chemCamp === state.season) return; t.chemCamp = state.season; for (let i = 0; i < 6; i++) chemWeek(tid); }
// How much of his book a caller can really use: all of it when the unit knows it, a shrinking part when it does not.
// A unit that is still learning plays a plainer game: fewer concepts, formations, looks and line games, and so easier to read.
function variety(g, s, side) { const U = g.pbU ? g.pbU[s][side === 'O' ? 0 : 1] : 100; return clamp((U - 70) / 24, 0.3, 1); }
function chemOffseason() { for (const p of Object.values(state.players)) { if (p.ch) p.ch.v = round1(p.ch.v * 0.96); if (p.cq) for (const id in p.cq.q) p.cq.q[id] = round1(p.cq.q[id] * 0.95); } } // a winter apart costs a little
// a league that is starting out already has men who have played together: chemistry by time with the club
function chemSeed() {
  for (const t of state.teams) { const tb = knob(C(t.hc), 'tb'), lvl = 35 + tb * 0.4, qb = repsOrder(t.id, 'QB')[0];
    for (const p of rosterOf(t.id)) {
      const yrs = clamp(p.exp === 0 ? 0 : Math.min(p.exp, 1 + Math.floor(rand() * 4)), 0, 4), cap = chemCap(t.id, p.pos), v = round1(clamp(yrs === 0 ? lvl * 0.8 : lvl + (cap - lvl) * Math.min(1, yrs / 2.2) + gauss(0, 4), CH_START, 100));
      if (CH_UNIT[p.pos]) p.ch = { t: t.id, v };
      if (['RB', 'WR', 'TE'].includes(p.pos) && qb) p.cq = { t: t.id, q: { [qb.id]: v } };
    } }
}
function ensureChem() { if (state.chemV) return; state.chemV = 1; chemSeed(); }
// a unit's number, as the page shows it: the first team
function unitChem(tid, u) {
  if (u === 'QB') { const qb = repsOrder(tid, 'QB')[0], recs = ['WR', 'TE', 'RB'].flatMap(pos => repsOrder(tid, pos).slice(0, pos === 'WR' ? 3 : 1)); return qb && recs.length ? recs.reduce((s, p) => s + chemPair(p, qb), 0) / recs.length : 0; }
  const first = Object.keys(CH_UNIT).filter(pos => CH_UNIT[pos] === u).flatMap(pos => u === 'KB' ? rosterOf(tid).filter(p => p.pos === pos).slice(0, 1) : repsOrder(tid, pos).slice(0, REPS_FIRST[pos] || 1));
  return first.length ? first.reduce((s, p) => s + chemOf(p), 0) / first.length : 0;
}
function defChem(tid) { return (unitChem(tid, 'DL') + unitChem(tid, 'LB') + unitChem(tid, 'DB')) / 3; }
function chemWord(v) { return v >= 92 ? 'One mind' : v >= 82 ? 'In sync' : v >= 70 ? 'Settled' : v >= 55 ? 'Working' : v >= 35 ? 'Still learning each other' : 'Strangers'; }
// In a game: how far above or below an ordinary unit these men are, from the players actually on the field
function chemEdge(entries, pos) { let s = 0, n = 0; for (const e of entries) if (e && e.p && e.p.a && (!pos || pos.includes(e.p.pos)) && CH_UNIT[e.p.pos]) { s += chemOf(e.p); n++; } return n ? (s / n - TUNE.chemRef) / 100 : 0; }
function chemPairEdge(rec, qb) { return rec && qb && rec.p && qb.p && ['RB', 'WR', 'TE'].includes(rec.p.pos) ? (chemPair(rec.p, qb.p) - TUNE.chemRef) / 100 : 0; }
function gameChem(g) { // set once a game for the things that are about the whole unit
  g.chem = [0, 1].map(s => { const tid = g.tids[s], d = defChem(tid); return { D: (d - TUNE.chemRef) / 100, KB: (unitChem(tid, 'KB') - TUNE.chemRef) / 100 }; });
  g.pbU = [0, 1].map(s => [installedPct(g.tids[s], 'O'), installedPct(g.tids[s], 'D')]);
}

// ---------- the green dot ----------
// One defender gets the call from the sideline and makes the checks. How good he is at it is who he is: what he sees, how well
// he knows the system, and whether the others listen. The club names him; the staff does if it has not.
function dotScore(p) { return p && p.a ? (p.a.prec || 40) * 0.55 + pbOf(p) * 0.2 + ((p.h && p.h.lead) || 50) * 0.25 : 0; }
function dotPool(tid) { return rosterOf(tid).filter(p => p.pos === 'LB' && p.a && !p.injury); } // a linebacker: the man in the middle who does not leave the field
function greenDot(tid) {
  const t = T(tid), pool = dotPool(tid);
  const named = t && t.dot !== undefined && !isAI(tid) ? pool.find(p => p.id === t.dot) : null; if (named) return named;
  const first = pool.filter(p => { const o = repsOrder(tid, p.pos); return o.indexOf(p) < (REPS_FIRST[p.pos] || 1); });
  return (first.length ? first : pool).sort((a, b) => dotScore(b) - dotScore(a))[0] || null;
}
// who is making the calls on this snap: the named man if he is out there, the best of the rest if he is not
function dotOnField(g, d, def) {
  const cache = g.dotP || (g.dotP = [undefined, undefined]); if (cache[d] === undefined) cache[d] = greenDot(g.tids[d]) || null;
  const lbs = def.filter(e => ['MLB', 'WLB', 'SAM'].includes(e.slot) && e.p && e.p.a), named = cache[d] ? def.find(e => e.p && e.p.id === cache[d].id) : null;
  if (named) return named;
  if (lbs.length) return lbs.sort((a, b) => dotScore(b.p) - dotScore(a.p))[0];
  return def.filter(e => ['SS', 'FS'].includes(e.slot) && e.p && e.p.a).sort((a, b) => dotScore(b.p) - dotScore(a.p))[0] || null; // no linebacker out there at all: a safety makes the calls
}

// ---------- season film and the game plan ----------
// What a defense showed in a game is added to its film; older games count for less. A new defensive coordinator means no film.
function foldFilm(g) {
  for (const s of [0, 1]) { const t = T(g.tids[s]), f = g.dSeen && g.dSeen[s]; if (!t || !f || !f.n || g.pre) continue;
    const dc = defCaller(t), id = dc ? dc.id : -1; let m = t.dfilm;
    if (!m || m.dc !== id || m.s !== state.season) m = t.dfilm = { dc: id, s: state.season, n: 0, blitz: 0, man: 0, sl0: 0, sl1: 0, twist: 0, cov: {} };
    for (const k of ['n', 'blitz', 'man', 'sl0', 'sl1', 'twist']) m[k] = round2(m[k] * 0.8 + f[k]);
    for (const k in m.cov) m.cov[k] = round2(m.cov[k] * 0.8); for (const k in f.cov) m.cov[k] = round2((m.cov[k] || 0) + f.cov[k]);
    // and what the offense did, by situation and grouping
    const of = t.film && t.film.s === state.season && t.film.oc === (offCaller(t) ? offCaller(t).id : -1) ? t.film : (t.film = { s: state.season, oc: offCaller(t) ? offCaller(t).id : -1 });
    for (const k in of) if (Array.isArray(of[k])) of[k] = [round2(of[k][0] * 0.8), round2(of[k][1] * 0.8)];
    for (const k in g.liveFilm[s]) { const a = of[k] || [0, 0], b = g.liveFilm[s][k]; of[k] = [round2(a[0] + b[0]), round2(a[1] + b[1])]; }
  }
}
// How much of the opponent's film this side walks in knowing (0 to about 0.8), and how much weight what it believed beforehand
// keeps against what it sees today (1 is ordinary; lower catches on faster).
function planTrust(g, s) { // s: the defense being studied
  const c = g.gp || (g.gp = {}); if (c['p' + s] !== undefined) return c['p' + s];
  const o = 1 - s, f = T(g.tids[s]).dfilm, n = f && f.s === state.season ? f.n : 0;
  return c['p' + s] = clamp((g.cx[o].plan - 30) / 60, 0, 1) * (n / (n + 60)) * clamp(1.3 - g.cx[s].dcre / 100, 0.4, 1.1);
}
function seenWeight(g, s) { const c = g.gp || (g.gp = {}); if (c['w' + s] !== undefined) return c['w' + s]; const o = 1 - s; return c['w' + s] = clamp(1.6 - g.cx[o].adp / 83, 0.5, 1.6) * clamp(0.5 + g.cx[s].dcre / 100, 0.7, 1.45) * (0.7 + 0.3 * variety(g, s, 'D')); } // a plain defense is learned sooner
// the league's habits this season, from everybody's film: a game plan is knowing how this defense differs from the rest
const LEAGUE_FILM = { key: null, m: null };
function leagueFilm() {
  const key = state.season * 100 + (state.week || 0); if (LEAGUE_FILM.key === key && LEAGUE_FILM.st === state) return LEAGUE_FILM.m;
  const m = { n: 0, blitz: 0, man: 0, sl0: 0, sl1: 0, twist: 0, cov: {} };
  for (const t of state.teams) { const f = t.dfilm; if (!f || f.s !== state.season) continue; for (const k of ['n', 'blitz', 'man', 'sl0', 'sl1', 'twist']) m[k] += f[k]; for (const k in f.cov) m.cov[k] = (m.cov[k] || 0) + f.cov[k]; }
  LEAGUE_FILM.key = key; LEAGUE_FILM.st = state; return LEAGUE_FILM.m = m;
}
function filmShare(g, s, k, prior) { const f = T(g.tids[s]).dfilm, L = leagueFilm(); return f && f.s === state.season && f.n > 0 && L.n > 200 && f[k] !== undefined ? clamp(prior + (f[k] / f.n - L[k] / L.n) * planTrust(g, s), 0, 1) : prior; }
function filmCov(g, s, k, prior) { const f = T(g.tids[s]).dfilm, L = leagueFilm(); return f && f.s === state.season && f.n > 0 && L.n > 200 ? Math.max(0, prior + ((f.cov[k] || 0) / f.n - (L.cov[k] || 0) / L.n) * planTrust(g, s)) : prior; }
