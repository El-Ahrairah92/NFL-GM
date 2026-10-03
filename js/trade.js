'use strict';
// =====================================================================
//  Trades
// =====================================================================
function tradeWindowOpen() {
  if (state.phase === 'REG') return state.week <= TRADE_DEADLINE;
  return ['RECAP', 'COACHES', 'RESIGN', 'FA', 'DRAFT', 'PRESEASON'].includes(state.phase);
}
// picks already used in the current draft can't be traded
function pickUsed(pk) { const o = pickSlot(pk); return !!(o && o.pid); }
function tradablePicks(tid) {
  return state.picks.filter(pk => pk.owner === tid && !pickUsed(pk)).sort((a, b) => a.season - b.season || a.round - b.round || (pickSlot(a) ? pickSlot(a).pick : 0) - (pickSlot(b) ? pickSlot(b).pick : 0));
}
// how much the AI team values an asset (it values its own starters a bit more)
function aiAssetValue(p, aiTid, giving) {
  let v = playerValue(p, aiTid);
  if (giving) {
    const n = needAt(aiTid, p.pos);
    const rank = n.arr.indexOf(p);
    if (rank >= 0 && rank < STARTERS[p.pos]) v *= p.pos === 'QB' ? 1.4 : 1.15;
  } else {
    const n = needAt(aiTid, p.pos);
    if (viewOvr(p, aiTid) > n.floor + 3) v *= 1.1;            // fills a need
    if (n.count >= ROSTER_TEMPLATE[p.pos] + 1) v *= 0.8; // already deep here
  }
  return v;
}
function sideValue(assets, aiTid, giving) {
  let v = 0;
  for (const pid of assets.players) v += aiAssetValue(P(pid), aiTid, giving);
  for (const id of assets.picks) v += pickValue(state.picks.find(pk => pk.id === id));
  return v;
}
function salaryOf(assets) { return round2(sum(assets.players.map(pid => { const p = P(pid); return p.contract.yrs > 0 ? p.contract.amt : 0; }))); }

// userAssets: what the user gives; aiAssets: what the user receives
function evaluateTrade(userTid, aiTid, userAssets, aiAssets) {
  if (!tradeWindowOpen()) return { ok: false, msg: state.phase === 'REG' ? 'The trade deadline has passed.' : 'Trades are closed during this phase.' };
  if (!userAssets.players.length && !userAssets.picks.length && !aiAssets.players.length && !aiAssets.picks.length) return { ok: false, msg: 'Add players or picks to the deal.' };
  const inV = sideValue(userAssets, aiTid, false), outV = sideValue(aiAssets, aiTid, true);
  const needed = outV * 1.1 + 0.5;
  const res = { inV, outV, needed, ok: true, msg: '' };
  const uSal = salaryOf(userAssets), aSal = salaryOf(aiAssets);
  if (capRoom(userTid) + uSal - aSal < 0) return Object.assign(res, { ok: false, msg: 'This trade puts you over the cap.' });
  if (capRoom(aiTid) + aSal - uSal < 0) return Object.assign(res, { ok: false, msg: `${T(aiTid).abbr} can't fit the salary under the cap.` });
  const lim = rosterLimit();
  const uAfter = rosterCount(userTid) - userAssets.players.length + aiAssets.players.length;
  const aAfter = rosterCount(aiTid) - aiAssets.players.length + userAssets.players.length;
  if (uAfter > lim) return Object.assign(res, { ok: false, msg: `Your roster would exceed ${lim}. Release someone first.` });
  if (aAfter > lim) return Object.assign(res, { ok: false, msg: `${T(aiTid).abbr}'s roster would exceed ${lim}.` });
  if (inV < needed) {
    const gap = needed - inV;
    res.ok = false;
    res.msg = gap < 2 ? "Close — they want a little more." : gap < 8 ? 'Not enough value for them.' : 'They laughed at this offer.';
  } else res.msg = 'They would accept this deal.';
  return res;
}
function executeTrade(tidA, tidB, aAssets, bAssets) {
  const move = (assets, to) => {
    for (const pid of assets.players) { const p = P(pid); setTid(p, to); }
    for (const id of assets.picks) {
      const pk = state.picks.find(x => x.id === id);
      pk.owner = to;
      if (state.draft) state.draft.order.forEach(o => { if (o.pickId === id) o.owner = to; });
    }
  };
  move(aAssets, tidB); move(bAssets, tidA);
  // rosters must still be legal: an incoming body over 53 means a cut
  for (const tid of [tidA, tidB]) {
    const lim = rosterLimit();
    while (rosterCount(tid) > lim) {
      const c = autoCut(tid, lim, state.phase === 'REG' || state.phase === 'PLAYOFFS');
      if (!c.length) break;
      if (tid === state.userTid) addNews(`${T(tid).abbr} released ${c.map(p => pname(p)).join(', ')} to make room after the trade.`, [tid]);
    }
  }
  const desc = assets => [...assets.players.map(pid => { const p = P(pid); return `${p.lbl} ${pname(p)}`; }), ...assets.picks.map(id => pickLabel(state.picks.find(pk => pk.id === id)))].join(', ') || 'nothing';
  addNews(`TRADE: ${T(tidA).abbr} send ${desc(aAssets)} to ${T(tidB).abbr} for ${desc(bAssets)}.`, [tidA, tidB], 'trade');
}
function proposeTrade(userTid, aiTid, userAssets, aiAssets) {
  const ev = evaluateTrade(userTid, aiTid, userAssets, aiAssets);
  if (ev.ok) executeTrade(userTid, aiTid, userAssets, aiAssets);
  return ev;
}

// AI <-> AI: a team with a hole trades for a surplus player
function aiTrade() {
  const teams = shuffle(state.teams.filter(t => isAI(t.id)).map(t => t.id));
  for (const A of teams) {
    // find A's weakest starting spot relative to league norms
    let needPos = null, worst = 0;
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S']) {
      const n = needAt(A, pos);
      const healthyFloor = n.arr.filter(p => !p.injury)[STARTERS[pos] - 1];
      const f = healthyFloor ? viewOvr(healthyFloor, A) : 40;
      const gap = (70 - f) * POS_VALUE[pos];
      if (gap > worst) { worst = gap; needPos = pos; }
    }
    if (!needPos || worst < 4) continue;
    for (const B of shuffle(teams.filter(x => x !== A))) {
      const nb = needAt(B, needPos);
      // B trades a depth player that would start for A
      const cand = nb.arr.slice(STARTERS[needPos]).find(p => viewOvr(p, A) >= 68 && !p.injury);
      if (!cand) continue;
      const want = aiAssetValue(cand, B, true) * 1.05;
      // A pays with picks first, then surplus players
      const give = { players: [], picks: [] };
      let v = 0;
      for (const pk of tradablePicks(A).filter(pk => pk.round >= 2).sort((a, b) => pickValue(a) - pickValue(b))) {
        if (v >= want) break;
        give.picks.push(pk.id); v += pickValue(pk);
      }
      if (v < want) {
        const r1 = tradablePicks(A).find(pk => pk.round === 1 && pk.season === state.season + 1 + (state.phase === 'REG' ? 0 : 1));
        if (r1 && want - v < pickValue(r1) * 1.6) { give.picks.push(r1.id); v += pickValue(r1); }
      }
      if (v < want || v > want * 2.2) continue;
      if (capRoom(A) < cand.contract.amt) continue;
      executeTrade(B, A, { players: [cand.id], picks: [] }, give);
      return true;
    }
  }
  return false;
}

// ---------- draft-day trade-down offers (you're on the clock) ----------
// A team picking later that likes someone still on the board offers its pick plus a sweetener worth ~105–115% of yours.
function draftOffers() {
  const d = state.draft, pk = currentPick();
  if (state.phase !== 'DRAFT' || !pk || pk.owner !== state.userTid) return [];
  d.offers = d.offers || {};
  if (d.offers[d.idx]) return d.offers[d.idx].filter(o => offerStillValid(o));
  const mine = state.picks.find(x => x.id === pk.pickId);
  const out = [];
  if (!mine) { d.offers[d.idx] = out; return out; }
  const myV = pickValue(mine);
  // the best player left on the consensus board drives interest
  const top = prospects().sort((a, b) => (boardRank(a) || 999) - (boardRank(b) || 999))[0];
  const steal = top && boardRank(top) < pk.pick - 4; // a slider makes teams jump
  // not every pick draws calls: early picks and a falling star do
  if (!steal && rand() > (pk.round <= 2 ? 0.7 : 0.45)) { d.offers[d.idx] = out; return out; }
  const later = d.order.slice(d.idx + 1, d.idx + 1 + (pk.round === 1 ? 20 : 28)).filter(o => o.owner !== state.userTid);
  const seen = new Set();
  for (const o of shuffle(later.slice())) {
    if (out.length >= 2 || seen.has(o.owner)) continue;
    if (rand() > (steal ? 0.5 : 0.22)) continue;
    seen.add(o.owner);
    const theirs = state.picks.find(x => x.id === o.pickId);
    if (!theirs || theirs.owner !== o.owner) continue;
    const want = myV * (1.05 + rand() * 0.1);
    const give = [theirs.id];
    let v = pickValue(theirs);
    // sweeten with their next-best picks: this draft first, then next year's
    const extras = tradablePicks(o.owner).filter(x => x.id !== theirs.id).map(x => [x, pickValue(x)]).sort((a, b) => a[1] - b[1]);
    let guard = 0;
    while (v < want && extras.length && guard++ < 4) {
      // the smallest pick that closes the gap without overpaying, else the biggest one that still leaves a gap
      let j = extras.findIndex(([, xv]) => v + xv >= want && v + xv <= myV * 1.2);
      if (j < 0) { j = -1; for (let k = extras.length - 1; k >= 0; k--) if (v + extras[k][1] < want) { j = k; break; } }
      if (j < 0) break;
      const [x, xv] = extras.splice(j, 1)[0];
      give.push(x.id); v += xv;
    }
    if (v < myV * 1.03 || v > myV * 1.2) continue;
    out.push({ tid: o.owner, mine: mine.id, give, v: round2(v), myV: round2(myV) });
  }
  d.offers[d.idx] = out;
  return out;
}
function offerStillValid(o) {
  const mine = state.picks.find(x => x.id === o.mine);
  return mine && mine.owner === state.userTid && o.give.every(id => { const x = state.picks.find(pk => pk.id === id); return x && x.owner === o.tid && !pickUsed(x); });
}
function acceptDraftOffer(i) {
  const d = state.draft, offers = (d.offers && d.offers[d.idx]) || [], o = offers[i];
  if (!o || !offerStillValid(o)) return 'That offer is no longer available.';
  executeTrade(state.userTid, o.tid, { players: [], picks: [o.mine] }, { players: [], picks: o.give });
  d.offers[d.idx] = [];
  return null;
}
function declineDraftOffers() { const d = state.draft; if (d && d.offers) d.offers[d.idx] = []; }
