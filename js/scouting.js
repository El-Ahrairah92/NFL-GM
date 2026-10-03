'use strict';
// =====================================================================
//  SCOUTING DEPARTMENT — needs by depth-chart spot and targets to fill them
//  Everything here is your staff's read (perception), never the hidden truth.
// =====================================================================
const SCOUT_KEYS = { off: ['QB', 'RB', 'X', 'Z', 'SLOT', 'Y', 'H', 'LT', 'LG', 'C', 'RG', 'RT'], def: ['EDGE1', 'EDGE2', 'IDL1', 'IDL2', 'NT', 'MLB', 'WLB', 'CB1', 'CB2', 'NCB', 'FS', 'SS'], st: ['K', 'P'] };
// how your staff sees a player at a spot: perceived level plus how his skills and comfort fit that spot
function staffValueAt(p, spot, tid) { return viewOvr(p, tid) + (slotRating(p, spot) - p.ovr); }
// can he play there? his own spot, or one he's at least Decent at (as your scouts read it)
function playsSpot(p, spot) { return p.spot === spot || seenComfort(p, spot) >= 30; }
function chartStarter(tid, key) {
  const c = ensureChart(tid), ids = (c.lists[key] || []).filter(id => P(id) && P(id).tid === tid);
  return { s1: ids[0] ? P(ids[0]) : null, s2: ids[1] ? P(ids[1]) : null };
}
// the league's typical starter at a spot (perceived): median across teams of their n-th best there
const KEY_RANK = { CB2: 2, EDGE2: 2, IDL2: 2 };
let SCOUT_BENCH = null;
function benchmarkAt(spot, rank) {
  rank = rank || 1;
  if (!SCOUT_BENCH || SCOUT_BENCH.st !== state || SCOUT_BENCH.season !== state.season || SCOUT_BENCH.phase !== state.phase) SCOUT_BENCH = { st: state, season: state.season, phase: state.phase, m: {} };
  const k = spot + rank;
  if (SCOUT_BENCH.m[k] !== undefined) return SCOUT_BENCH.m[k];
  const fam = spot === 'EDGE' ? ['EDGE', 'DE'] : spot === 'DT' ? ['DT', 'DE', 'NT'] : [spot];
  const nth = state.teams.map(t => rosterOf(t.id).filter(p => p.a && fam.includes(p.spot)).map(p => perOvr(p)).sort((a, b) => b - a)[rank - 1] || 55);
  nth.sort((a, b) => a - b);
  return (SCOUT_BENCH.m[k] = nth[nth.length >> 1]);
}
// need at one chart key: how far your starter sits below a typical starter, and whether there's a No. 2
function scoutNeed(tid, key) {
  const spot = CHART_SPOT[key], { s1, s2 } = chartStarter(tid, key);
  const v1 = s1 ? staffValueAt(s1, spot, tid) : 40, v2 = s2 ? staffValueAt(s2, spot, tid) : 40;
  const bench = benchmarkAt(spot, KEY_RANK[key]);
  let score = (bench - v1) * SPOTS[spot].val + Math.max(0, bench - 8 - v2) * 0.15;
  if (s1 && s1.age >= 32) score += 1.5;
  if (s1 && s1.contract && s1.contract.yrs <= 1 && tid >= 0) score += 1;
  const lvl = score >= 9 ? 'Big need' : score >= 3 ? 'Upgrade' : score >= -2.5 ? 'Solid' : 'Strength';
  return { key, spot, s1, s2, v1, v2, score, lvl, cls: { 'Big need': 'bad', Upgrade: 'warn', Solid: '', Strength: 'good' }[lvl] };
}
function scoutNeeds(tid) { return [...SCOUT_KEYS.off, ...SCOUT_KEYS.def, ...SCOUT_KEYS.st].map(k => scoutNeed(tid, k)); }

// ---------- targets ----------
function scoutTargets(tid, key) {
  const need = scoutNeed(tid, key), spot = need.spot;
  const fit = p => (SPOTS[p.spot].side === 'off' || SPOTS[p.spot].side === 'def') ? schemeFit(p, tid) : 0;
  const row = (p, extra) => { const v = staffValueAt(p, spot, tid); return Object.assign({ p, v, gain: v - need.v1, gain2: v - need.v2, fit: fit(p) }, extra); };
  // free agents: anyone who can play the spot and would at least push for the No. 2 job
  const fa = Object.values(state.players).filter(p => p.tid === -1 && p.a && playsSpot(p, spot)).map(p => row(p, { cost: p.ask }))
    .filter(r => r.gain2 > -6).sort((a, b) => (b.gain + b.fit * 0.6 - b.cost * 0.08) - (a.gain + a.fit * 0.6 - a.cost * 0.08)).slice(0, 25);
  // draft prospects: now plus some of the growth your scouts expect
  const myPicks = state.draft ? state.draft.order.slice(state.draft.idx).filter(o => o.owner === tid) : [];
  const draft = Object.values(state.players).filter(p => p.tid === -2 && p.a && playsSpot(p, spot)).map(p => {
    const r = row(p), rank = boardRank(p);
    r.now = r.v; r.v = r.v + 0.5 * viewGrowth(p, tid); r.gain = r.v - need.v1; r.rank = rank;
    r.pick = myPicks.find(o => o.pick >= (rank || 999) - 10) || null; // the first pick of yours that could realistically get him
    return r;
  }).sort((a, b) => (b.gain + b.fit * 0.4) - (a.gain + a.fit * 0.4)).slice(0, 25);
  // trade targets: players on other teams who'd start for you
  const trade = [], recs = standings();
  for (const t of state.teams) {
    if (t.id === tid) continue;
    const rec = recs[t.id], gp = rec.w + rec.l + rec.t, pct = gp ? (rec.w + rec.t * 0.5) / gp : 0.5;
    for (const p of rosterOf(t.id)) {
      if (!p.a || !playsSpot(p, spot)) continue;
      const r = row(p);
      if (r.gain < 1.5) continue;
      r.cost = aiAssetValue(p, t.id, true);
      // availability: a backup on his team, a vet on a losing team, or a big contract are all easier to pry loose
      const theirs = rosterOf(t.id).filter(x => x.spot === p.spot && x.id !== p.id && viewOvr(x, t.id) > viewOvr(p, t.id)).length;
      let av = theirs >= 1 ? 2 : 0;
      if (pct < 0.4 && p.age >= 28) av += 1;
      if (p.contract && p.contract.amt > marketValue(p) * 1.2) av += 1;
      if (p.age <= 25 && viewOvr(p, t.id) >= 74) av -= 1;
      r.avail = av >= 2 ? 'Likely' : av >= 1 ? 'Possible' : 'Unlikely';
      r.availN = av;
      trade.push(r);
    }
  }
  trade.sort((a, b) => (b.gain * 2 + b.availN * 2 - Math.sqrt(b.cost) * 1.5) - (a.gain * 2 + a.availN * 2 - Math.sqrt(a.cost) * 1.5));
  return { need, fa, draft, trade: trade.slice(0, 25) };
}
// one line from the scouting director
function scoutTake(tid, key, t) {
  const n = t.need, nm = chartName(key);
  const best = (arr, f) => arr.filter(f)[0];
  const parts = [];
  parts.push(n.lvl === 'Big need' ? `${nm} is a real hole for us${n.s1 ? `: ${pshort(n.s1)} grades out well below a typical starter there` : ''}.` : n.lvl === 'Upgrade' ? `We could upgrade at ${nm}.` : n.lvl === 'Solid' ? `${nm} is in decent shape.` : `${nm} is a strength. Only an elite talent moves the needle.`);
  const fa = best(t.fa, r => r.gain > 1);
  if (fa) parts.push(`Best free agent: ${pshort(fa.p)} (${tierOf(fa.p)}, asking ${fmtMoney(fa.p.ask)}).`);
  const dr = best(t.draft, r => r.gain > 0);
  if (dr && state.draft) parts.push(`In the draft, ${pshort(dr.p)} (${projLabel(dr.rank)}) fits${dr.fit >= 3 ? ' our scheme well' : ''}.`);
  const tr = best(t.trade, r => r.avail !== 'Unlikely');
  if (tr) parts.push(`On the trade market, ${T(tr.p.tid).abbr}'s ${pshort(tr.p)} looks gettable.`);
  return parts.join(' ');
}
// the depth-chart label for a key, e.g. 'Slot corner (nickel)'
function chartLabel(key) { for (const sec of CHART_SECTIONS) { const r = sec.rows.find(x => x[0] === key); if (r) return r[1]; } return key; }
