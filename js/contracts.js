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
  if (p.age >= 31) s *= 0.75;
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
  const dead = round2(Math.min(c.gtd || 0, c.amt * c.yrs) + (c.next ? c.next.gtd || 0 : 0));
  const inSeason = state.phase === 'REG' || state.phase === 'PLAYOFFS';
  if (!inSeason && c.yrs >= 2 && dead > c.amt) return { now: round2(c.amt), next: round2(dead - c.amt) };
  return { now: dead, next: 0 };
}
function payrollNext(tid) {
  let s = T(tid).deadNext || 0;
  for (const p of rosterOf(tid)) { const c = p.contract; if (c.yrs >= 2) s += c.amt; else if (c.next) s += c.next.amt; }
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
  if (p.age >= 33) l *= 0.5; else if (p.age >= 31) l *= 0.72;
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
  let ext = 0;
  for (const p of ro.filter(extensionDue).sort((a, b) => playerValue(b, tid) - playerValue(a, tid))) {
    if (ext >= 2) break;
    const ageOk = p.age <= (p.pos === 'QB' ? 33 : p.pos === 'RB' ? 26 : 29);
    if (good(p) && ageOk && rand() < 0.55 && !extendPlayer(p.id)) ext++;
  }
  // franchise tag: the best expiring player who would otherwise be hard to keep
  const exp = ro.filter(p => p.expiring).sort((a, b) => playerValue(b, tid) - playerValue(a, tid));
  const top = exp[0];
  // nobody tags a player a third time; a second tag only when it's still sensible money
  if (top && canTag(top) && (top.tags || 0) < 2 && ['Elite', 'All-Pro'].includes(tierOf(top, viewOvr(top, tid))) && top.age <= 30 &&
      (top.ask > capRoom(tid) - 4 || rand() < 0.35) && tagAmount(top) <= capRoom(tid) - 2 && tagAmount(top) <= state.cap * ((top.tags || 0) ? 0.15 : 0.2)) franchiseTag(top.id);
}

// ---------- league year rollover (start of offseason) ----------
function rolloverContract(p) {
  const c = p.contract;
  // guarantees work like a prorated bonus: an even share of what's left is used up each year
  c.gtd = round2((c.gtd || 0) * Math.max(0, c.yrs - 1) / Math.max(1, c.yrs));
  c.yrs--;
  if (c.yrs > 0) return;
  p.lastAmt = c.amt;
  if (c.next) { p.contract = Object.assign({}, c.next, c.opt5 === 'exercised' ? { opt5: 'exercised' } : {}); return; }
  c.yrs = 0; p.expiring = true; p.ask = resignAsk(p);
}
function growCap() {
  // the market re-prices toward teams spending ~92% of the cap (median), like the real league
  const pays = state.teams.map(t => payroll(t.id) / state.cap).sort((a, b) => a - b);
  const med = pays[Math.floor(pays.length / 2)];
  state.mkt = round2(clamp((state.mkt || 1) * clamp(Math.pow(0.93 / Math.max(0.4, med), 0.6), 0.9, 1.12), 0.6, 2.2));
  const g = clamp(gauss(0.06, 0.012), 0.03, 0.09);
  state.cap = round2(state.cap * (1 + g));
  syncEconomy();
  addNews(`The ${state.season + 1} salary cap is set at ${fmtMoney(state.cap)} (+${Math.round(g * 100)}%).`);
  for (const t of state.teams) { t.dead = round2(t.deadNext || 0); t.deadNext = 0; t.irRet = 0; }
}

// ---------- practice squad ----------
function psOf(tid) { return rosterOf(-3).filter(p => p.psTid === tid); }
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
  p.contract = makeContract(p, MIN_SALARY * (from === tid ? 1 : 1.2), from === tid ? 1 : 2, 0.2);
  if (from !== tid && from === state.userTid) addNews(`${T(tid).abbr} signed ${p.lbl} ${pname(p)} off your practice squad.`, [from, tid], 'sign');
  else if (tid === state.userTid) addNews(`${T(tid).abbr} promoted ${p.lbl} ${pname(p)} from the practice squad${why ? ' (' + why + ')' : ''}.`, [tid], 'sign');
  return null;
}
function releaseFromPS(pid) { const p = P(pid); if (!p || p.tid !== -3) return; setTid(p, -1); delete p.psTid; p.ask = MIN_SALARY; p.contract = { amt: MIN_SALARY, yrs: 0, gtd: 0 }; }
// fill to 16 with the best long-term bets (own cuts first), keeping the squad balanced across groups
function fillPS(tid) {
  const cap = pos => Math.max(1, Math.ceil(ROSTER_TEMPLATE[pos] / 3));
  const counts = {}; psOf(tid).forEach(p => counts[p.pos] = (counts[p.pos] || 0) + 1);
  const score = p => viewCeil(p, tid) + (p.lastTid === tid ? 2 : 0) - p.age * 0.3;
  const pool = Object.values(state.players).filter(p => p.tid === -1 && !p.waiver && p.exp <= 6 && !p.injury && p.age <= 28).sort((a, b) => score(b) - score(a));
  for (let guard = 0; psRoom(tid) && guard < 40; guard++) {
    const open = POSITIONS.filter(x => x !== 'K' && x !== 'P' && (counts[x] || 0) < cap(x));
    if (!open.length) break;
    let p = pool.find(x => x.tid === -1 && open.includes(x.pos) && psRoom(tid, x));
    if (!p) { // nobody left on the street: an undrafted-type rookie
      p = genVeteran(pick(open), 'fringe'); p.age = randInt(22, 24); p.exp = randInt(0, 1); setTid(p, -1); p.ask = MIN_SALARY;
    }
    if (!signToPS(p.id, tid)) counts[p.pos] = (counts[p.pos] || 0) + 1;
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
    if (cand && viewCeil(cand, t.id) > n.floor + 2 && capRoom(t.id) > MIN_SALARY * 1.5) promoteFromPS(cand.id, t.id);
  }
}
// promote from your own squad when a position runs dry (AI always; your team only in a true emergency or on auto)
function psPromotions(tid) {
  if (!isAI(tid)) return; // your call-ups are yours to make
  const auto = true;
  for (const pos of POSITIONS) {
    const healthy = rosterOf(tid).filter(p => p.pos === pos && !p.injury).length;
    const need = LINEUP_NEED[pos] + (auto && pos === 'QB' ? 1 : 0);
    if (healthy >= need) continue;
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
    const t = T(p.tid);
    if ((t.irRet || 0) >= IR_RETURNS) { p.ir.season = true; continue; } // out of designations: done for the year
    if (activeCount(p.tid) >= ROSTER_MAX) {
      const cut = rosterOf(p.tid).filter(x => !onIR(x) && x.id !== p.id && cutSavings(x) >= 0).sort((a, b) => cutValue(a) - cutValue(b))[0];
      if (!cut || cutValue(cut) > cutValue(p)) continue; // stays on IR until there's a spot worth opening
      releasePlayer(cut.id);
    }
    delete p.ir; t.irRet = (t.irRet || 0) + 1;
    if (p.tid === state.userTid) addNews(`${pname(p)} was activated from injured reserve.`, [p.tid], 'inj');
  }
}

// ---------- game day: 48 of the 53 dress ----------
const GAMEDAY_MIN = { QB: 2, RB: 2, WR: 4, TE: 2, OL: 7, DL: 8, LB: 5, CB: 5, S: 3, K: 1, P: 1 };
function gameDayActives(tid) {
  const ro = rosterOf(tid).filter(p => !p.injury);
  if (ro.length <= GAMEDAY_ACTIVE) return new Set(ro.map(p => p.id));
  const counts = {}; ro.forEach(p => counts[p.pos] = (counts[p.pos] || 0) + 1);
  const out = new Set();
  // coaches know who helps on Sunday: the least valuable surplus bodies sit (often QB3, extra linemen, raw rookies)
  for (const p of ro.slice().sort((a, b) => a.ovr - b.ovr)) {
    if (ro.length - out.size <= GAMEDAY_ACTIVE) break;
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
  c.amt = round2(c.amt - x); c.gtd = round2((c.gtd || 0) + x);
  t.deadNext = round2((t.deadNext || 0) + x);
  if (p.tid === state.userTid) addNews(`${t.abbr} restructured ${p.lbl} ${pname(p)}'s deal: ${fmtMoney(x)} of cap space this year, pushed into next year.`, [p.tid], 'sign');
  return x;
}
