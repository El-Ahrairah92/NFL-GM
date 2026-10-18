'use strict';
// =====================================================================
//  CONTRACTS & ROSTER RULES (DESIGN §9)
//  p.contract = { amt (cap hit/yr), yrs (left, incl. this one), gtd (guaranteed $ still owed),
//                 next? {amt, yrs, gtd} (extension / option year starting next league year),
//                 rookie?, opt5? 'pending'|'exercised'|'declined', tagged? }
//  Cap grows each league year (minimum salary and the market scale with it). Practice squad players
//  have tid -3 and psTid = their team; IR is p.ir = { wk } with a minimum stay and a return limit.
// =====================================================================
const BASE_CAP = 280, BASE_MIN = 0.9;
const PS_MAX = 16, PS_VETS = 6, GAMEDAY_ACTIVE = 48, IR_MIN_WEEKS = 4, IR_RETURNS = 8;
let PS_SALARY = 0.25;
function capFactor() { return state && state.cap ? state.cap / BASE_CAP : 1; }
// keep the global constants in step with the league year
function syncEconomy() {
  if (!state.cap) state.cap = BASE_CAP;
  CAP = state.cap;
  MIN_SALARY = round2(BASE_MIN * capFactor());
  PS_SALARY = round2(0.25 * capFactor());
}

// ---------- guarantees ----------
// share of total value guaranteed: stars get security, depth players get almost none, older players get short money
function gtdShare(p, yrs) {
  const t = PER_TH && PER_TH[p.pos] && p.per ? tierOf(p, perOvr(p)) : p.ovr >= 82 ? 'All-Pro' : p.ovr >= 72 ? 'Starter' : 'Depth';
  let s = { Elite: 0.68, 'All-Pro': 0.55, Starter: 0.38, Rotation: 0.22, Backup: 0.22, Depth: 0.1 }[t] || 0.05;
  if (p.age >= ageFor(p, 30)) s *= 0.75; // clubs guarantee less to a man past his best
  if (yrs <= 1) s = Math.max(s, 0.5);
  return clamp(s + gauss(0, 0.06), 0, 1);
}
function makeContract(p, amt, yrs, share) {
  amt = round2(Math.max(MIN_SALARY, amt));
  const total = amt * yrs, sh = share === undefined ? gtdShare(p, yrs) : share;
  let gtd = total * sh;
  if (sh >= 0.25) gtd = Math.max(gtd, amt); // meaningful deals guarantee at least year one
  return { amt, yrs, gtd: round2(Math.min(total, gtd)) };
}
// dead money if he's cut today: what's still guaranteed. Offseason cuts of multi-year deals split over two league years.
function deadIfCut(p) {
  const c = p.contract;
  if (!c || c.yrs <= 0) return { now: 0, next: 0 };
  const dead = round2(Math.min(c.gtd || 0, c.sched ? c.sched.reduce((s, x) => s + x, 0) : c.amt * c.yrs) + (c.next ? c.next.gtd || 0 : 0));
  const inSeason = state.phase === 'REG' || state.phase === 'PLAYOFFS';
  if (!inSeason && c.yrs >= 2 && dead > c.amt) return { now: round2(c.amt), next: round2(dead - c.amt) };
  return { now: dead, next: 0 };
}
function payrollNext(tid) {
  let s = T(tid).deadNext || 0;
  for (const p of rosterOf(tid)) { const c = p.contract; if (c.yrs >= 2) s += c.sched && c.sched.length >= 2 ? c.sched[1] : c.amt; else if (c.next) s += c.next.amt; }
  return round2(s);
}

// ---------- rookie scale ----------
function rookieContract(pickNo, round) {
  const amt = round2(Math.max(MIN_SALARY, 11 * capFactor() * Math.exp(-(pickNo - 1) / 26)));
  const share = round === 1 ? 1 : round === 2 ? clamp(0.75 - (pickNo - 33) * 0.016, 0.25, 0.75) : 0.08;
  const c = { amt, yrs: 4, gtd: round2(amt * 4 * share), rookie: true };
  if (round === 1) c.opt5 = 'pending';
  return c;
}
// salaries at a position group, highest first
function positionPay(pos) {
  const pay = [];
  for (const id in state.players) { const p = state.players[id]; if (p.tid >= 0 && p.pos === pos && p.contract.yrs > 0) pay.push(p.contract.amt); }
  return pay.sort((a, b) => b - a);
}
const avgRange = (arr, a, b) => { const s = arr.slice(a, b); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : MIN_SALARY; };
function optionAmount(p) { return round2(Math.max(p.contract.amt * 1.5, avgRange(positionPay(p.pos), 2, 20))); }
// NFL-style: 1st tag = max(top-5 average, 120% of last salary); 2nd = 120% of last; 3rd = 144% of last or the QB tag, whichever is more
function tagAmount(p) {
  const last = p.lastAmt || p.contract.amt || MIN_SALARY, n = p.tags || 0;
  if (n >= 2) return round2(Math.max(avgRange(positionPay('QB'), 0, 5), last * 1.44));
  return round2(Math.max(avgRange(positionPay(p.pos), 0, 5), last * 1.2));
}

// ---------- decisions (RESIGN phase) ----------
// worth it when the option year costs no more than he'd command on the market (stars always)
function optionWorthIt(p, tid) {
  const t = tierOf(p, viewOvr(p, tid));
  if (t === 'Elite' || t === 'All-Pro') return true;
  if (t !== 'Starter') return false;
  return marketValue(p) * 0.95 + viewGrowth(p, tid) * 0.4 >= optionAmount(p);
}
function optionDue(p) { return p.tid >= 0 && p.contract.opt5 === 'pending' && p.contract.yrs === 1; }
function exerciseOption(pid, yes) {
  const p = P(pid);
  if (!p || !optionDue(p)) return 'No option decision due';
  if (yes) {
    const amt = optionAmount(p);
    p.contract.next = { amt, yrs: 1, gtd: amt }; p.contract.opt5 = 'exercised';
    if (p.tid === state.userTid || perOvr(p) >= 78) addNews(`${T(p.tid).abbr} exercised the 5th-year option on ${p.lbl} ${pname(p)} (${fmtMoney(amt)}).`, [p.tid], 'sign');
  } else {
    p.contract.opt5 = 'declined';
    if (p.tid === state.userTid) addNews(`${T(p.tid).abbr} declined the 5th-year option on ${p.lbl} ${pname(p)}.`, [p.tid], 'sign');
  }
  return null;
}
function canTag(p) { return state.phase === 'RESIGN' && p.expiring && p.tid >= 0 && T(p.tid).tagYr !== state.season + 1 && (p.tags || 0) < 3; }
function franchiseTag(pid) {
  const p = P(pid);
  if (!p || !canTag(p)) return 'Not taggable';
  const amt = tagAmount(p);
  if (amt > capRoom(p.tid)) return 'Not enough cap room';
  p.contract = { amt, yrs: 1, gtd: amt, tagged: true };
  p.tags = (p.tags || 0) + 1; p.expiring = false; delete p.ask;
  T(p.tid).tagYr = state.season + 1;
  addNews(`${T(p.tid).abbr} placed the franchise tag on ${p.lbl} ${pname(p)} (${fmtMoney(amt)}).`, [p.tid], 'sign');
  return null;
}
function extensionDue(p) {
  const c = p.contract;
  if (p.tid < 0 || c.yrs !== 1 || c.next || c.tagged || p.expiring) return false;
  if (c.rookie && c.opt5 === 'pending') return false; // option decision comes first
  return ['RESIGN', 'FA', 'DRAFT', 'PRESEASON', 'CUTDOWN'].includes(state.phase) || (state.phase === 'REG' && state.week <= TRADE_DEADLINE);
}
// ---------- negotiating leverage ----------
// The more the league wants a player, the more he dictates the terms. A fringe player takes whatever length you offer;
// a star wants his deal, charges for anything else, and refuses lengths far from what he has in mind.
function leverageOf(p) {
  const t = PER_TH && p.per ? tierOf(p, perOvr(p)) : p.ovr >= 82 ? 'All-Pro' : p.ovr >= 72 ? 'Starter' : 'Depth'; // league consensus sets his market
  let l = { Elite: 1, 'All-Pro': 0.85, Starter: 0.6, Rotation: 0.32, Backup: 0.28, Depth: 0.12 }[t] || 0.05;
  if (p.age >= ageFor(p, 32)) l *= 0.5; else if (p.age >= ageFor(p, 30)) l *= 0.72;
  if (p.age <= 25 && viewGrowth(p, null) >= 4) l = Math.min(1, l + 0.12); // young and still rising: he knows it
  return l;
}
function leverageLabel(l) { return l >= 0.8 ? 'Very high' : l >= 0.55 ? 'High' : l >= 0.3 ? 'Moderate' : l >= 0.12 ? 'Low' : 'Almost none'; }
// the length he has in mind: mostly age, with some personality (betting on himself vs. wanting security)
function prefYears(p, base) {
  const h = hashGauss(p.id, 41, 7);
  return clamp((base || contractYears(p)) + (h > 0.9 ? 1 : h < -0.9 ? -1 : 0), 1, 5);
}
// every length from 1 to 5 years: the per-year price at that length, or why he will not sign it
function contractOptions(p, amt, pref, minYrs) {
  const lev = leverageOf(p), maxY = Math.max(pref, clamp((['QB', 'K', 'P'].includes(p.pos) ? 40 : 36) - p.age, 1, 5)), opts = [];
  const limit = lev >= 0.8 ? 2 : lev >= 0.55 ? 3 : 9; // how far from his number he will even discuss
  for (let y = 1; y <= 5; y++) {
    const dev = y - pref;
    let ok = true, why = '';
    if (y < (minYrs || 1)) { ok = false; why = 'Extensions run at least ' + minYrs + ' years'; }
    else if (y > maxY) { ok = false; why = 'Too long a commitment at his age'; }
    else if (Math.abs(dev) >= limit && !(dev > 0 && p.age >= 30)) { ok = false; why = dev < 0 ? 'Wants long-term security, not a short deal' : 'Will not lock himself in that long at this price'; }
    let m = 1 + lev * Math.abs(dev) * (dev < 0 ? 0.05 : 0.06);
    if (lev < 0.3 && dev > 0) m = 1 - 0.02 * dev; // for a fringe player, extra years of security are worth a small discount
    else if (p.age >= 30 && dev > 0) m = 1 - 0.01 * dev; // a veteran never turns down extra years: the risk is all yours
    opts.push({ yrs: y, amt: round2(Math.max(MIN_SALARY, amt * m)), ok, why, pref: dev === 0 });
  }
  return { lev, pref, opts };
}
function resignTerms(p) { return contractOptions(p, p.ask, prefYears(p)); }
function extensionTerms(p) { const a = extensionAsk(p); return contractOptions(p, a.amt, a.yrs, 2); }

function extensionAsk(p) {
  const yrs = Math.max(2, contractYears({ age: p.age + 1 }));
  // cap is expected to grow; players price in the bump and the security of signing early
  return { amt: round2(marketValue(p) * (1.04 + hashGauss(p.id, 3, state.season) * 0.03)), yrs };
}
function extendPlayer(pid, yrs) {
  const p = P(pid);
  if (!p || !extensionDue(p)) return 'Not eligible for an extension';
  let a = extensionAsk(p);
  if (yrs && yrs !== a.yrs) { const o = extensionTerms(p).opts.find(x => x.yrs === yrs); if (!o || !o.ok) return o ? o.why : 'Not an option'; a = o; }
  if (payrollNext(p.tid) + a.amt > state.cap * 1.06) return 'Would not fit under next year\'s cap';
  p.contract.next = makeContract(p, a.amt, a.yrs);
  addNews(`${T(p.tid).abbr} extended ${p.lbl} ${pname(p)}: ${a.yrs} yr, ${fmtMoney(p.contract.next.amt)}/yr (${fmtMoney(p.contract.next.gtd)} gtd).`, [p.tid], 'sign');
  return null;
}
// AI front offices (and auto-managed users) at the start of re-signing season
function aiContractDecisions(tid) {
  const ro = rosterOf(tid);
  const good = p => ['Elite', 'All-Pro', 'Starter'].includes(tierOf(p, viewOvr(p, tid)));
  for (const p of ro.filter(optionDue)) exerciseOption(p.id, optionWorthIt(p, tid));
  // extensions for core players entering their final year
  // the core goes first: the quarterback, then the starters nobody is coming up behind
  let ext = 0; const st = stanceOf(tid), plan = roomPlan(tid);
  const lim = p => (p.pos === 'QB' ? 31 : p.pos === 'RB' ? 25 : 28) + (st === 'allin' ? 1 : st === 'rebuild' ? -3 : st === 'retool' ? -1 : 0); // nobody extends a man into his decline
  for (const p of ro.filter(extensionDue).sort((a, b) => (b.pos === 'QB') - (a.pos === 'QB') || (plan.rooms[b.pos] && plan.rooms[b.pos].successor) - (plan.rooms[a.pos] && plan.rooms[a.pos].successor) || playerValue(b, tid) - playerValue(a, tid))) {
    if (ext >= 3) break;
    if (!good(p) || p.age > lim(p)) continue;
    const a = extensionAsk(p), b = clubBudget(tid).y[1];
    if (b.slack - a.amt < -0.03 * b.cap) continue; // next year cannot carry it
    if (a.amt > Math.min(clubMaxAAV(tid, p, faClubAAV(tid, p), { own: true, sched: [p.contract.amt, a.amt] }) * 1.1, aiCeil(p.pos))) continue;
    if (p.pos === 'QB' && clubRead(tid, p).clear < 0.5 && a.amt > 0.05 * state.cap) continue; // not sure he is the starter: no starter's extension
    if (!extendPlayer(p.id)) ext++;
  }
  // franchise tag: the best expiring player who would otherwise be hard to keep
  const exp = ro.filter(p => p.expiring).sort((a, b) => playerValue(b, tid) - playerValue(a, tid));
  const top = exp[0];
  // nobody tags a player a third time; a second tag only when it's still sensible money
  if (top && canTag(top) && (top.tags || 0) < 2 && ['Elite', 'All-Pro'].includes(tierOf(top, viewOvr(top, tid))) && top.age <= ageFor(top, 29) &&
      (top.ask > capRoom(tid) - 4 || rand() < 0.35) && tagAmount(top) <= capRoom(tid) - 2 && tagAmount(top) <= state.cap * ((top.tags || 0) ? 0.15 : 0.2)) franchiseTag(top.id);
}

// ---------- league year rollover (start of offseason) ----------
function rolloverContract(p) {
  const c = p.contract;
  if (c.inc && typeof incSettle === 'function') incSettle(p); // incentives: pay what he earned and square the cap
  // guarantees work like a prorated bonus: an even share of what's left is used up each year
  c.gtd = round2((c.gtd || 0) * Math.max(0, c.yrs - 1) / Math.max(1, c.yrs));
  c.yrs--;
  if (c.sched) { c.sched.shift(); if (c.sched.length) c.amt = c.sched[0]; } // a front- or back-loaded deal: this year's cap hit is the next number on the schedule
  if (c.inc && c.yrs > 0 && typeof incReclass === 'function') incReclass(p);
  if (c.yrs > 0) return;
  p.lastAmt = c.amt;
  if (c.next) { p.contract = Object.assign({}, c.next, c.opt5 === 'exercised' ? { opt5: 'exercised' } : {}); if (p.contract.inc && typeof incReclass === 'function') incReclass(p); return; }
  c.yrs = 0; p.expiring = true; p.ask = resignAsk(p);
}
function growCap() {
  // the market re-prices toward teams spending ~92% of the cap (median), like the real league
  const was = CAP_ALL; CAP_ALL = true; const pays = state.teams.map(t => payroll(t.id) / (typeof capOf === 'function' ? capOf(t.id) : state.cap)).sort((a, b) => a - b); CAP_ALL = was;
  const med = pays[Math.floor(pays.length / 2)];
  state.lvl = round2(clamp(payLevel() * clamp(Math.pow(0.95 / Math.max(0.4, med), 0.9), 0.93, 1.12), 0.8, 2.5));
  const g = clamp(gauss(0.06, 0.012), 0.03, 0.09);
  state.cap = round2(state.cap * (1 + g));
  syncEconomy();
  addNews(`The ${state.season + 1} salary cap is set at ${fmtMoney(state.cap)} (+${Math.round(g * 100)}%).`);
  for (const t of state.teams) { t.dead = round2(t.deadNext || 0); t.deadNext = 0; t.irRet = 0; }
}

// ---------- practice squad ----------
function psOf(tid) { return rosterOf(-3).filter(p => p.psTid === tid); }
// ---------- practice squad elevations ----------
// Before a game a club may bring up to two of its practice squad players onto its game-day roster, each at most three times in a
// regular season (playoff elevations do not count). After the game he reverts to the squad, no waivers. It is how a club covers a
// hole of a week or two; a longer one is a real promotion.
const ELEV_MAX = 2, ELEV_SEASON = 3;
function elevLeft(p) { return p.elevS === state.season ? Math.max(0, ELEV_SEASON - (p.elevN || 0)) : ELEV_SEASON; }
function canElevate(p, tid, playoff) { return !!p && p.tid === -3 && p.psTid === tid && !p.injury && (playoff || elevLeft(p) > 0); }
function elevate(p, tid, playoff) {
  if (!playoff) { if (p.elevS !== state.season) { p.elevS = state.season; p.elevN = 0; } p.elevN++; }
  p.elev = { tid, wk: state.week }; setTid(p, tid);
}
function revertElevations() { for (const id in state.players) { const p = state.players[id]; if (!p.elev) continue; const tid = p.elev.tid; delete p.elev; if (p.tid === tid) { p._rev = 1; setTid(p, -3); delete p._rev; } } }
// a computer club elevates where injuries have left it short of what it usually dresses at a position (the third back, the fifth
// receiver, the eighth lineman), the biggest holes first
const ELEV_DRESS = { QB: 2, RB: 3, WR: 5, TE: 3, OL: 8, DL: 8, LB: 5, CB: 5, S: 4, K: 1, P: 1 };
function aiElevations(tid, playoff) {
  const ro = rosterOf(tid), out = [], holes = [];
  for (const pos of POSITIONS) { const healthy = ro.filter(p => p.pos === pos && !p.injury && !onIR(p)).length, short = (ELEV_DRESS[pos] || 1) - healthy; if (short > 0) holes.push({ pos, short: short + (healthy < LINEUP_NEED[pos] ? 2 : 0) }); }
  holes.sort((a, b) => b.short - a.short);
  for (const h of holes) for (let k = 0; k < h.short && out.length < ELEV_MAX; k++) {
    const c = psOf(tid).filter(p => p.pos === h.pos && canElevate(p, tid, playoff) && !out.includes(p)).sort((a, b) => viewOvr(b, tid) - viewOvr(a, tid))[0];
    if (!c) break; out.push(c);
  }
  return out;
}
// game day: every club playing makes its elevations (yours are the ones you chose on the Practice Squad page)
function gameDayElevations(tids, playoff) {
  for (const tid of tids) {
    const list = isAI(tid) ? aiElevations(tid, playoff) : ((state.elev && state.elev[tid]) || []).map(id => P(id)).filter(p => canElevate(p, tid, playoff)).slice(0, ELEV_MAX);
    for (const p of list) elevate(p, tid, playoff);
  }
}
// a short hole the squad can cover on game day needs no roster move: the injured back within two weeks, a man to elevate meanwhile
function elevationCovers(tid, pos) {
  const hurt = rosterOf(tid).filter(p => p.pos === pos && p.injury && !onIR(p)); if (!hurt.length) return false;
  const back = Math.min(...hurt.map(p => p.injury.weeks || 0)); if (back > 2) return false;
  return psOf(tid).some(p => p.pos === pos && !p.injury && elevLeft(p) >= back);
}
function psVet(p) { return p.exp > 2; }
function psRoom(tid, p) {
  const ps = psOf(tid);
  if (ps.length >= PS_MAX) return false;
  if (p && psVet(p) && ps.filter(psVet).length >= PS_VETS) return false;
  return true;
}
function signToPS(pid, tid) {
  const p = P(pid);
  if (!p || p.tid !== -1) return 'Not a free agent';
  if (p.waiver) return 'He is on waivers';
  if (!psRoom(tid, p)) return 'Practice squad is full';
  if (p.pbTid !== tid) pbArrive(p, tid);
  setTid(p, -3); p.psTid = tid; p.contract = { amt: PS_SALARY, yrs: 1, gtd: 0 }; delete p.ask;
  return null;
}
function promoteFromPS(pid, tid, why) {
  const p = P(pid);
  if (!p || p.tid !== -3) return 'Not on a practice squad';
  if (activeCount(tid) >= ROSTER_MAX) return 'Active roster is full';
  if (capRoom(tid) < MIN_SALARY * 1.2 - PS_SALARY) return 'Not enough cap room';
  const from = p.psTid;
  setTid(p, tid); delete p.psTid;
  if (from === tid) p.promPS = { tid, s: state.season }; else delete p.promPS; // his own squad: if he is let go this season, he can come back to it
  p.contract = makeContract(p, MIN_SALARY * (from === tid ? 1 : 1.2), from === tid ? 1 : 2, 0.2);
  if (from !== tid && from === state.userTid) addNews(`${T(tid).abbr} signed ${p.lbl} ${pname(p)} off your practice squad.`, [from, tid], 'sign');
  else if (tid === state.userTid) addNews(`${T(tid).abbr} promoted ${p.lbl} ${pname(p)} from the practice squad${why ? ' (' + why + ')' : ''}.`, [tid], 'sign');
  return null;
}
function releaseFromPS(pid) { const p = P(pid); if (!p || p.tid !== -3) return; setTid(p, -1); delete p.psTid; p.ask = MIN_SALARY; p.contract = { amt: MIN_SALARY, yrs: 0, gtd: 0 }; }
// What a practice squad spot is for: a prospect worth developing, or a ready body to call up when someone goes down.
// A club's own cut has two edges over an outsider: the staff watched him all camp, and he already knows the playbook.
const PS_AGE = 30, PS_OWN = 3;
function psFamiliar(p, tid) { return p.lastTid === tid ? PS_OWN + (p.pbTid === tid ? clamp(((p.pb || 50) - 40) / 15, 0, 4) : 0) : 0; }
function psScore(p, tid) { const now = viewOvr(p, tid); return Math.max(viewCeil(p, tid) - Math.max(0, p.age - 22) * 0.8, now + 1) + psFamiliar(p, tid); }
function psEligible(p) { return p.tid === -1 && !p.waiver && !p.injury && p.age <= PS_AGE && p.pos !== 'K' && p.pos !== 'P'; }
const psPosCap = pos => Math.max(1, Math.ceil(ROSTER_TEMPLATE[pos] / 3));
// the squad a club would build from these players: always a quarterback, then the best of the rest with no room overloaded
function psPlan(tid, pool, have) {
  const counts = {}, plan = [], vets = { n: 0 }, room = PS_MAX - have.length;
  have.forEach(p => { counts[p.pos] = (counts[p.pos] || 0) + 1; if (psVet(p)) vets.n++; });
  let order = pool.slice().sort((a, b) => psScore(b, tid) - psScore(a, tid));
  if (typeof foPsOrder === 'function' && FO.on !== false && (!FO.extra || FO.extra(tid))) order = foPsOrder(tid, order, p => psScore(p, tid));
  const take = p => { plan.push(p); counts[p.pos] = (counts[p.pos] || 0) + 1; if (psVet(p)) vets.n++; };
  const fits = p => !plan.includes(p) && (!psVet(p) || vets.n < PS_VETS);
  if (!counts.QB) { const q = order.find(p => p.pos === 'QB' && fits(p)); if (q) take(q); }
  for (const p of order) { if (plan.length >= room) break; if (fits(p) && (counts[p.pos] || 0) < psPosCap(p.pos)) take(p); }
  return plan;
}
// at cutdown: the cuts a club wants back on its practice squad if they clear, kept only where nobody better is out there
function psBringBacks(tid) {
  const pool = Object.values(state.players).filter(p => p.tid === -1 && p.age <= PS_AGE && p.pos !== 'K' && p.pos !== 'P' && !p.injury);
  return psPlan(tid, pool, psOf(tid)).filter(p => p.lastTid === tid).map(p => p.id);
}
// After waivers the practice squads are a market: every club names the players it wants, each player picks one club (his old
// club if it wants him, otherwise where the path to the 53 looks clearest), and the clubs that lost someone look again.
// Nobody goes first, you included. Your list is yours: it is not redrawn for you.
function psAppeal(p, tid) {
  const ahead = rosterOf(tid).filter(x => x.pos === p.pos && !onIR(x)).length + psOf(tid).filter(x => x.pos === p.pos).length;
  return (p.lastTid === tid ? 1.5 : 0) + clamp((ROSTER_TEMPLATE[p.pos] + 1 - ahead) * 0.8, -3, 3) + hashGauss(p.id, 700 + tid, state.season) * 1.2;
}
function psMarket(userWants) {
  const u = state.userTid, out = { got: [], lost: [] }, mine = isAI(u) ? [] : [...new Set(userWants)], ai = state.teams.filter(t => isAI(t.id)).map(t => t.id);
  const elsewhere = p => p.tid === -3 ? (p.psTid === p.lastTid ? 'went back to ' : 'chose ') + T(p.psTid).abbr : p.tid >= 0 ? 'signed to the 53 by ' + T(p.tid).abbr : 'unavailable';
  for (let round = 0; round < 6; round++) {
    const pool = Object.values(state.players).filter(psEligible), bids = {};
    for (const tid of ai) if (psRoom(tid)) for (const p of psPlan(tid, pool, psOf(tid))) (bids[p.id] = bids[p.id] || []).push(tid);
    if (round === 0) for (const id of mine) { const p = P(id); if (p && p.tid === -1 && !p.waiver) (bids[id] = bids[id] || []).push(u); }
    const ids = Object.keys(bids).map(Number).sort((a, b) => perOvr(P(b)) - perOvr(P(a)));
    if (!ids.length) break;
    let signed = 0;
    for (const id of ids) {
      const p = P(id); if (!p || p.tid !== -1) continue;
      const live = bids[id].filter(tid => psRoom(tid, p)).sort((a, b) => psAppeal(p, b) - psAppeal(p, a));
      if (!live.length) { if (bids[id].includes(u)) out.lost.push({ p, why: 'your practice squad was full' }); continue; }
      if (!signToPS(id, live[0])) { signed++; if (live[0] === u) out.got.push(p); else if (bids[id].includes(u)) out.lost.push({ p, why: elsewhere(p) }); }
    }
    if (!signed) break;
  }
  for (const id of mine) { const p = P(id); if (p && !out.got.includes(p) && !out.lost.some(x => x.p === p)) out.lost.push({ p, why: p.tid === -1 ? (p.waiver ? 'still on waivers' : 'he did not sign') : elsewhere(p) }); }
  for (const tid of ai) fillPS(tid); // whatever is still open: the best left on the street, or a camp-type body
  return out;
}
// fill to 16, and never without a quarterback; if the street is bare, a camp-type body
function fillPS(tid) {
  if (!psRoom(tid)) return;
  for (const p of psPlan(tid, Object.values(state.players).filter(psEligible), psOf(tid))) if (psRoom(tid, p)) signToPS(p.id, tid);
  const counts = {}; psOf(tid).forEach(p => counts[p.pos] = (counts[p.pos] || 0) + 1);
  for (let guard = 0; psRoom(tid) && guard < PS_MAX; guard++) {
    const open = POSITIONS.filter(x => x !== 'K' && x !== 'P' && (counts[x] || 0) < psPosCap(x)), want = !counts.QB ? 'QB' : pick(open.length ? open : ['WR', 'CB', 'OL', 'DL']);
    const b = campBody(want); setTid(b, -1); b.ask = MIN_SALARY; b.exp = 0;
    if (signToPS(b.id, tid)) break; counts[want] = (counts[want] || 0) + 1;
  }
}
// in-season: other teams sign promising practice squad players to their 53
function psPoaching() {
  for (const t of state.teams) {
    if (!isAI(t.id) || activeCount(t.id) >= ROSTER_MAX || rand() > 0.12) continue;
    const pos = POSITIONS[randInt(0, POSITIONS.length - 1)];
    const n = needAt(t.id, pos);
    if (n.count >= ROSTER_TEMPLATE[pos]) continue;
    const cand = Object.values(state.players).filter(p => p.tid === -3 && p.psTid !== t.id && p.pos === pos && !p.injury)
      .sort((a, b) => viewCeil(b, t.id) - viewCeil(a, t.id))[0];
    if (cand && faGain(t.id, cand) >= 1.5 && capRoom(t.id) > MIN_SALARY * 1.5) promoteFromPS(cand.id, t.id);
  }
}
// promote from your own squad when a position runs dry (AI always; your team only in a true emergency or on auto)
function psPromotions(tid) {
  if (!isAI(tid)) return; // your call-ups are yours to make
  const auto = true;
  for (const pos of POSITIONS) {
    const healthy = rosterOf(tid).filter(p => p.pos === pos && !p.injury).length;
    const need = LINEUP_NEED[pos] + (auto && pos === 'QB' ? 1 : 0);
    if (healthy >= need || elevationCovers(tid, pos)) continue; // a short hole: an elevation on game day covers it
    const c = psOf(tid).filter(p => p.pos === pos && !p.injury).sort((a, b) => viewOvr(b, tid) - viewOvr(a, tid))[0];
    if (!c) continue;
    if (activeCount(tid) >= ROSTER_MAX) {
      const counts = {}; rosterOf(tid).forEach(p => { if (!p.injury) counts[p.pos] = (counts[p.pos] || 0) + 1; });
      const cut = rosterOf(tid).filter(p => !onIR(p) && p.pos !== pos && (counts[p.pos] || 0) > LINEUP_NEED[p.pos] + 1).sort((a, b) => cutValue(a) - cutValue(b))[0];
      if (!cut) continue;
      releasePlayer(cut.id);
    }
    promoteFromPS(c.id, tid, `${pos} injuries`);
  }
}
// a reserve/future contract for one of your practice squad players (offseason)
function signFutures(pid) {
  const p = P(pid), tid = state.userTid;
  if (!p || p.tid !== -3 || p.psTid !== tid) return 'Not on your practice squad';
  if (rosterOf(tid).length >= OFFSEASON_MAX) return 'Roster is full';
  setTid(p, tid); delete p.psTid; p.contract = makeContract(p, MIN_SALARY, 2, 0);
  addNews(`${T(tid).abbr} signed ${p.lbl} ${pname(p)} to a reserve/future deal.`, [tid], 'sign');
  return null;
}
function releaseUserPS() { for (const p of psOf(state.userTid)) { releaseFromPS(p.id); p.lastTid = state.userTid; } }
// positions where you cannot field a healthy lineup this week
function lineupShort(tid) {
  return POSITIONS.map(pos => [pos, rosterOf(tid).filter(p => p.pos === pos && !p.injury).length]).filter(([pos, n]) => n < LINEUP_NEED[pos]).map(([pos, n]) => `${pos} (${n} healthy, need ${LINEUP_NEED[pos]})`);
}
// offseason: squads dissolve; teams keep the best on reserve/future deals
function psOffseason() {
  for (const t of state.teams) {
    if (!isAI(t.id)) continue; // you decide who gets a reserve/future deal during the re-signing period
    const ps = psOf(t.id).sort((a, b) => viewCeil(b, t.id) - viewCeil(a, t.id));
    ps.forEach((p, i) => {
      if (i < 8 && p.age <= 27) { setTid(p, t.id); delete p.psTid; p.contract = makeContract(p, MIN_SALARY, 2, 0); }
      else { releaseFromPS(p.id); p.lastTid = t.id; }
    });
  }
}

// ---------- injured reserve ----------
// long injuries go on IR (frees an active spot); min stay of 4 weeks; 8 returns per team per season
function irPlacements() {
  for (const id in state.players) {
    const p = state.players[id];
    if (p.tid >= 0 && p.injury && !p.ir && p.injury.weeks >= IR_WEEKS) p.ir = { wk: state.week };
  }
}
function irActivations() {
  for (const id in state.players) {
    const p = state.players[id];
    if (!p.ir || p.injury || p.tid < 0) continue;
    if (state.phase !== 'REG' && state.phase !== 'PLAYOFFS') { delete p.ir; continue; }
    if (p.ir.season) continue;
    if (state.week - p.ir.wk < IR_MIN_WEEKS) continue;
    const t = T(p.tid), pup = !!p.ir.pup, use = () => { if (!pup) t.irRet = (t.irRet || 0) + 1; }; // coming off PUP does not use one of the eight returns
    if (!pup && (t.irRet || 0) >= IR_RETURNS) { p.ir.season = true; continue; } // out of designations: done for the year
    if (activeCount(p.tid) >= ROSTER_MAX && !isAI(p.tid)) {
      delete p.ir; use();
      addNews(`${p.lbl} ${pname(p)} is off ${pup ? 'the PUP list' : 'injured reserve'}. That puts you at ${activeCount(p.tid)} on a ${ROSTER_MAX}-man roster: make a move before your next game.`, [p.tid], 'inj');
      continue;
    }
    if (activeCount(p.tid) >= ROSTER_MAX) {
      let cut = null;
      if (typeof foLeast === 'function' && FO.on !== false && isAI(p.tid) && (!FO.extra || FO.extra(p.tid)) && p.a) {
        // the front office's call: he comes back when the lineups are better with him than with the man they would miss least
        const M = foModel(p.tid, rosterOf(p.tid).filter(x => x.a && !x.injury && (!onIR(x) || x.id === p.id))), least = foLeast(M, new Set([p.id])), mine = foWorths(M, (FO_UNIT[p.pos] || 'SKILL'))[p.id];
        if (least && mine !== undefined && least.worth < mine) cut = least.p;
      } else {
        cut = rosterOf(p.tid).filter(x => !onIR(x) && x.id !== p.id && cutSavings(x) >= 0).sort((a, b) => cutValue(a) - cutValue(b))[0];
        if (cut && cutValue(cut) > cutValue(p)) cut = null;
      }
      if (!cut) continue; // stays on IR until there's a spot worth opening
      releasePlayer(cut.id);
    }
    delete p.ir; use();
    if (p.tid === state.userTid) addNews(`${pname(p)} was activated from ${pup ? 'the PUP list' : 'injured reserve'}.`, [p.tid], 'inj');
  }
}

// ---------- game day: 48 of the 53 dress ----------
const GAMEDAY_MIN = { QB: 2, RB: 2, WR: 4, TE: 2, OL: 7, DL: 8, LB: 5, CB: 5, S: 3, K: 1, P: 1 };
// men you have told to sit: they do not dress, so they take no snaps anywhere (preseason: held out)
function satSet(tid) {
  if (!state || tid !== state.userTid || state.settings.autoUser) return null;
  const s = new Set(), c = T(tid).dch; if (c && c.sit) for (const id in c.sit) s.add(+id);
  if (state.phase === 'PRESEASON' && state.prePlan) for (const id in state.prePlan.hold) s.add(+id);
  return s.size ? s : null;
}
function gameDayActives(tid) {
  const sat = satSet(tid), rest = typeof restingStarters === 'function' ? restingStarters(tid) : null, ro = rosterOf(tid).filter(p => !p.injury && !onIR(p) && !(sat && sat.has(p.id)) && !(rest && rest.has(p.id))); // a man still on injured reserve does not dress, healthy or not
  if (ro.length <= GAMEDAY_ACTIVE) return new Set(ro.map(p => p.id));
  const counts = {}; ro.forEach(p => counts[p.pos] = (counts[p.pos] || 0) + 1);
  const out = new Set(), keep = typeof chartDress === 'function' ? chartDress(tid) : null; // a man you start does not sit because he grades out low
  // coaches know who helps on Sunday: the least valuable surplus bodies sit (often QB3, extra linemen, raw rookies)
  for (const p of ro.slice().sort((a, b) => a.ovr + stRosterValue(a) * 1.5 - b.ovr - stRosterValue(b) * 1.5)) { // a core special teamer dresses ahead of a slightly better body who does not help there
    if (ro.length - out.size <= GAMEDAY_ACTIVE) break;
    if ((keep && keep.has(p.id)) || p.elev) continue; // a man elevated for this game dresses
    if (counts[p.pos] > (GAMEDAY_MIN[p.pos] || 1)) { out.add(p.id); counts[p.pos]--; }
  }
  return new Set(ro.filter(p => !out.has(p.id)).map(p => p.id));
}

// your option decisions if you leave re-signing without making them (same logic as the AI)
function autoOptions(tid) {
  for (const p of rosterOf(tid).filter(optionDue)) exerciseOption(p.id, optionWorthIt(p, tid));
}

// restructure: lower this year's cap hit; the converted money lands on next year's cap (as a charge the team can't escape)
function restructure(p, x) {
  const c = p.contract, t = T(p.tid);
  x = round2(Math.max(0, Math.min(x, c.amt - MIN_SALARY)));
  if (!x) return 0;
  c.amt = round2(c.amt - x); c.gtd = round2((c.gtd || 0) + x); if (c.sched) c.sched[0] = c.amt;
  t.deadNext = round2((t.deadNext || 0) + x);
  if (p.tid === state.userTid) addNews(`${t.abbr} restructured ${p.lbl} ${pname(p)}'s deal: ${fmtMoney(x)} of cap space this year, pushed into next year.`, [p.tid], 'sign');
  return x;
}
