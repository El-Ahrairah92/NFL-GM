'use strict';
// =====================================================================
//  Scout report PROTOTYPE: a layered read of a prospect, shown on its own tab of his file.
//  College profile (usage and production every season), tools vs technique, how he wins (the engine's own
//  formulas run on the scouts' read), upside as what refined technique would make of his tools, other spots,
//  and his makeup from named sources. Three depths of scouting: an area scout, a cross-check, a full workup.
//  Everything is derived on the fly from the player with stable hashes: nothing is stored, nothing in the game changes.
//  (In the real build college usage would shape his technique; here it is read back from his attributes.)
// =====================================================================

const PR_DEPTHS = [['Area scout', 'One look at the tape and the box scores. Tools are measured; the rest is fragments.'],
  ['Cross-check', 'A second scout charts his film: how he wins, how he was used, what the tape says about him.'],
  ['Full workup', 'Film, coaches, interviews, background, the strength staff: the full report.']];
const PR_SD = { tool: [2, 2, 2], T: [10, 6, 3.5], M: [14, 8, 5] }; // read error by depth: tools are measured, so every depth sees the same numbers
const PR_NOUN = { spd: 'speed', bur: 'burst', agi: 'change of direction', str: 'strength', jmp: 'leaping', sacc: 'short accuracy', dacc: 'deep accuracy', arm: 'arm strength',
  proc: 'processing', dec: 'decision-making', pkt: 'pocket feel', tor: 'accuracy on the move', vis: 'vision', elu: 'elusiveness', bal: 'contact balance', bsec: 'ball security',
  rte: 'route craft', rel: 'release', hnd: 'hands', cth: 'catch-point skills', pbk: 'pass sets', rbk: 'run-blocking technique', bawr: 'blocking awareness', prsh: 'rush plan',
  shed: 'hands at the point of attack', tkl: 'tackling', strp: 'ball punching', prec: 'instincts', man: 'man technique', zone: 'zone eyes', prs: 'press technique', bsk: 'ball skills',
  kcon: 'consistency', krng: 'leg', kfal: 'range', ktrj: 'trajectory', pdis: 'leg', pplc: 'placement', phng: 'hang time', pspn: 'spin control', len: 'length', w: 'mass', h: 'height' };
const PR_NOUN_DL = { bur: 'get-off', agi: 'bend', str: 'power' }, PR_NOUN_OL = { agi: 'feet', bur: 'quickness off the snap', str: 'anchor' };
function prNoun(spot, k) { return (['NT', 'DT', 'DE', 'EDGE'].includes(spot) && PR_NOUN_DL[k]) || (['LT', 'LG', 'C', 'RG', 'RT'].includes(spot) && PR_NOUN_OL[k]) || PR_NOUN[k] || k; }
function prCap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function prTool(k) { return k === 'len' || k === 'w' || k === 'h' || (ATTRS[k] && (ATTRS[k][2] === 'E' || ATTRS[k][2] === 'P')); }

// ---- the jobs, as the engine plays them (weights from trench.js / plays.js; b: body terms in sd from the spot's norm) ----
const PR_JOBS = {
  rush: { n: 'pass rusher', pick: 'max', paths: [{ l: 'speed and bend', w: { prsh: 0.55, bur: 0.25, agi: 0.2 }, b: { len: 1.8, w: -0.5 } }, { l: 'power', w: { prsh: 0.55, str: 0.45 }, b: { w: 2.4, h: -0.3 } }] },
  runD: { n: 'run defender', pick: 'avg', paths: [{ l: 'against zone runs', w: { shed: 0.5, bur: 0.25, agi: 0.25 }, b: { len: 1.2, w: -0.4 } }, { l: 'against gap runs', w: { shed: 0.5, str: 0.5 }, b: { w: 2.4, h: -0.3, len: 0.4 } }] },
  lbRun: { n: 'run defender', pick: 'avg', paths: [{ l: 'taking on blocks', w: { shed: 0.4, spd: 0.3, prec: 0.3 }, b: { w: 1.5 } }] },
  tackle: { n: 'tackler', pick: 'avg', paths: [{ l: 'in space', w: { tkl: 0.5, spd: 0.2, agi: 0.2, str: 0.1 }, b: { w: 0.4, len: 0.8 } }, { l: 'in traffic', w: { tkl: 0.6, spd: 0.15, str: 0.25 }, b: { w: 1.8, len: 0.3 } }] },
  blitz: { n: 'blitzer', pick: 'avg', paths: [{ l: 'getting home', w: { prsh: 0.5, bur: 0.5 } }] },
  man: { n: 'man coverage defender', pick: 'avg', paths: [{ l: 'underneath', w: { man: 0.6, agi: 0.15, bur: 0.25 }, b: { w: 0.3, len: 0.5 } }, { l: 'at the intermediate level', w: { man: 0.55, agi: 0.1, bur: 0.15, spd: 0.2 }, b: { w: 0.3, len: 0.5 } }, { l: 'downfield', w: { man: 0.45, agi: 0.1, spd: 0.45 }, b: { len: 1.1, w: 0.5 } }] },
  zone: { n: 'zone defender', pick: 'avg', paths: [{ l: 'underneath', w: { zone: 0.45, prec: 0.25, spd: 0.15, agi: 0.15 } }, { l: 'deep', w: { zone: 0.4, prec: 0.2, spd: 0.4 } }] },
  ball: { n: 'playmaker on the ball', pick: 'avg', paths: [{ l: 'at the catch point', w: { bsk: 0.6, spd: 0.25, jmp: 0.15 } }] },
  pass: { n: 'pass protector', pick: 'min', paths: [{ l: 'against speed', w: { pbk: 0.65, agi: 0.2, bawr: 0.15 }, b: { len: 1.8, w: -0.4 } }, { l: 'against power', w: { pbk: 0.55, str: 0.45 }, b: { w: 2.6, h: -0.3 } }] },
  runB: { n: 'run blocker', pick: 'avg', paths: [{ l: 'in zone schemes', w: { rbk: 0.5, agi: 0.27, bawr: 0.13, bur: 0.1 }, b: { len: 0.6 } }, { l: 'in gap schemes', w: { rbk: 0.5, str: 0.27, bawr: 0.13, bur: 0.1 }, b: { w: 1.5 } }, { l: 'climbing to the second level', w: { rbk: 0.45, agi: 0.22, str: 0.15, spd: 0.18 }, b: { w: -0.3 } }] },
  routes: { n: 'route runner', pick: 'avg', paths: [{ l: 'short', w: { rte: 0.5, agi: 0.2, bur: 0.3 }, b: { w: 0.3 } }, { l: 'intermediate', w: { rte: 0.45, agi: 0.15, bur: 0.2, spd: 0.2 }, b: { w: 0.3 } }, { l: 'deep', w: { rte: 0.63, agi: 0.1, spd: 0.27 }, b: { h: 0.6, w: 0.5 } }] },
  catch: { n: 'pass catcher', pick: 'avg', paths: [{ l: 'in rhythm', w: { hnd: 1 } }, { l: 'in traffic', w: { cth: 0.75, hnd: 0.15, jmp: 0.1 }, b: { h: 1, w: 1.5 } }] },
  carry: { n: 'ball carrier', pick: 'avg', paths: [{ l: 'making men miss', w: { elu: 0.52, agi: 0.11, bur: 0.17, spd: 0.2 } }, { l: 'through contact', w: { bal: 0.5, elu: 0.25, str: 0.15, spd: 0.1 }, b: { w: 1.6, h: -0.7 } }, { l: 'finding the hole', w: { vis: 1 } }] },
  qbAcc: { n: 'thrower', pick: 'avg', paths: [{ l: 'short', w: { sacc: 1 } }, { l: 'intermediate', w: { sacc: 0.4, dacc: 0.4, arm: 0.2 } }, { l: 'deep', w: { dacc: 0.6, arm: 0.4 } }] },
  qbMind: { n: 'processor', pick: 'avg', paths: [{ l: 'reading the field', w: { proc: 0.5, dec: 0.5 } }] },
  qbPkt: { n: 'pocket passer', pick: 'avg', paths: [{ l: 'in the pocket', w: { pkt: 0.55, agi: 0.2, spd: 0.1, bur: 0.15 } }, { l: 'on the move', w: { tor: 0.5, spd: 0.25, agi: 0.25 } }] },
  kick: { n: 'kicker', pick: 'avg', paths: [{ l: 'for range', w: { krng: 0.6, kfal: 0.4 } }, { l: 'for accuracy', w: { kcon: 1 } }] },
  punt: { n: 'punter', pick: 'avg', paths: [{ l: 'for distance and hang', w: { pdis: 0.6, phng: 0.4 } }, { l: 'for placement', w: { pplc: 0.6, pspn: 0.4 } }] },
};
const PR_SPOT_JOBS = { EDGE: ['rush', 'runD', 'tackle'], DE: ['rush', 'runD', 'tackle'], DT: ['runD', 'rush', 'tackle'], NT: ['runD', 'rush', 'tackle'],
  MLB: ['lbRun', 'tackle', 'zone', 'man', 'blitz'], WLB: ['lbRun', 'zone', 'man', 'tackle', 'blitz'], CB: ['man', 'zone', 'ball', 'tackle'], NCB: ['man', 'zone', 'ball', 'tackle'],
  FS: ['zone', 'ball', 'man', 'tackle'], SS: ['tackle', 'zone', 'man', 'lbRun', 'ball'], LT: ['pass', 'runB'], RT: ['pass', 'runB'], LG: ['pass', 'runB'], C: ['pass', 'runB'], RG: ['pass', 'runB'],
  TEY: ['runB', 'pass', 'routes', 'catch'], TEH: ['routes', 'catch', 'runB'], WRX: ['routes', 'catch'], WRZ: ['routes', 'catch'], SLOT: ['routes', 'catch'],
  RB: ['carry', 'catch', 'routes', 'pass'], FB: ['runB', 'carry', 'catch'], QB: ['qbMind', 'qbAcc', 'qbPkt'], K: ['kick'], P: ['punt'] };
const PR_ALT = { EDGE: ['WLB', 'MLB', 'DE'], DE: ['EDGE', 'DT'], DT: ['DE', 'NT'], NT: ['DT'], MLB: ['WLB', 'SS'], WLB: ['MLB', 'EDGE', 'SS'], CB: ['NCB', 'FS'], NCB: ['CB', 'SS', 'FS'],
  FS: ['SS', 'CB'], SS: ['FS', 'WLB', 'NCB'], LT: ['RT', 'LG'], RT: ['LT', 'RG'], LG: ['RG', 'C', 'LT'], RG: ['LG', 'C', 'RT'], C: ['LG', 'RG'], WRX: ['WRZ', 'SLOT'], WRZ: ['WRX', 'SLOT'],
  SLOT: ['WRZ', 'RB'], TEY: ['TEH'], TEH: ['TEY', 'SLOT'], RB: ['SLOT'], FB: ['TEY', 'RB'], QB: [], K: [], P: [] };

// ---- reads ----
function prSalt(k) { return k.charCodeAt(0) * 31 + (k.charCodeAt(1) || 0) * 7 + (k.charCodeAt(2) || 0); }
function prRead(p, k, d) { // part of the error survives a deeper look, part of it does not
  const g = ATTRS[k] ? ATTRS[k][2] : 'T', kind = g === 'E' || g === 'P' ? 'tool' : g, s = prSalt(k);
  const e = hashGauss(p.id, 900 + s, 1) * 0.6 + hashGauss(p.id, 900 + s, 1 + (kind === 'tool' ? 3 : d)) * 0.8;
  return clamp((p.a[k] === undefined ? 40 : p.a[k]) + e * PR_SD[kind][d - 1], 10, 99);
}
function prTrue(p, k) { return p.a[k] === undefined ? 40 : p.a[k]; }
function prBody(p, spot) { // as engine/depth.js bod(), against the norm of the spot he is judged at
  const b = SPOTS[spot].body; if (!p.m) return { w: 0, h: 0, len: 0 };
  const w = clamp((p.m.wt - b[2]) / b[3], -2.5, 2.5), h = clamp((p.m.ht - b[0]) / b[1], -2.5, 2.5), arm = clamp(((p.m.arm || b[4]) - (b[4] + (p.m.ht - b[0]) * 0.35)) / 0.6, -2.5, 2.5);
  return { w, h, len: clamp(h * 0.65 + arm * 0.35, -2.5, 2.5) };
}
function prTpl(spot, k) { const t = TEMPLATE_A[spot]; return t && t[k] !== undefined ? t[k] : 45; }
function prLvl(d) { return d >= 12 ? 'elite' : d >= 6 ? 'plus' : d >= -5 ? 'average' : d >= -11 ? 'below-average' : 'poor'; }
function prBodyWord(k, z) { return k === 'len' ? (z >= 0.9 ? 'long arms' : z <= -0.9 ? 'short arms' : null) : k === 'w' ? (z >= 0.9 ? 'heavy for the spot' : z <= -0.9 ? 'light for the spot' : null) : (z >= 0.9 ? 'tall for the spot' : z <= -0.9 ? 'short for the spot' : null); }

// one path: his number against an ordinary starter at the spot, term by term. val(k) gives the attribute to use.
function prPath(p, spot, path, val) {
  const B = prBody(p, spot), z = TUNE.size, parts = [];
  for (const k in path.w) parts.push({ k, c: path.w[k] * (val(k) - prTpl(spot, k)), v: val(k) - prTpl(spot, k) });
  for (const k in path.b || {}) parts.push({ k, c: path.b[k] * B[k] * z, v: B[k], body: 1 });
  return { path, parts, diff: parts.reduce((s, x) => s + x.c, 0) };
}
function prJob(p, spot, jk, val) {
  const J = PR_JOBS[jk], rs = J.paths.map(pa => prPath(p, spot, pa, val)), by = rs.slice().sort((a, b) => b.diff - a.diff);
  const diff = J.pick === 'max' ? by[0].diff : J.pick === 'min' ? by[by.length - 1].diff : rs.reduce((s, r) => s + r.diff, 0) / rs.length;
  return { jk, J, rs, best: by[0], worst: by[by.length - 1], diff };
}
function prVerdict(spot, jk, d) { const q = prPctl(spot, jk, d); return q >= 0.9 ? 'wins consistently' : q >= 0.7 ? 'wins more than he loses' : q >= 0.45 ? 'holds his own' : q >= 0.2 ? 'loses more than he wins' : 'overmatched'; } // against the league's men at the spot
// where a number would rank among the league's players at the spot today: premier is a top-5% man at the job
const PR_RANKS = new Map();
function prPctl(spot, jk, d) {
  const key = spot + '|' + jk + '|' + state.season + '|' + state.week;
  let a = PR_RANKS.get(key);
  if (!a) { a = Object.values(state.players).filter(q => q.tid >= 0 && q.spot === spot && q.a).map(q => prJob(q, spot, jk, k => prTrue(q, k)).diff).sort((x, y) => x - y); PR_RANKS.set(key, a); }
  if (!a.length) return 0.5;
  let i = 0; while (i < a.length && a[i] < d) i++;
  return i / a.length;
}
function prTier(spot, jk, d) { return prTierQ(prPctl(spot, jk, d)); }
function prTierQ(q) { return q >= 0.95 ? 'premier' : q >= 0.78 ? 'quality starting' : q >= 0.5 ? 'starting' : q >= 0.25 ? 'rotational' : 'backup'; }
function prPartWord(spot, x) { return x.body ? prBodyWord(x.k, x.v) : `${prLvl(x.v)} ${prNoun(spot, x.k)}`; }
function prJoin(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

// how he wins at a job, in a sentence or two
function prWinLine(p, spot, r) {
  const J = r.J, main = J.pick === 'min' ? r.worst : r.best;
  let s = `${prCap(prVerdict(spot, r.jk, r.diff))} as a ${J.n}`;
  if (J.paths.length > 1) {
    if (J.pick === 'max') s += `, winning mostly with ${main.path.l}`;
    else if (J.pick === 'min') s += `; most vulnerable ${r.worst.path.l}`;
    else if (r.best.diff - r.worst.diff >= 3) s += `; better ${r.best.path.l} than ${r.worst.path.l}`;
  }
  const parts = (J.pick === 'avg' ? r.rs.flatMap(x => x.parts) : main.parts).filter(x => !x.body || prBodyWord(x.k, x.v));
  const merged = {}; for (const x of parts) { const m = merged[x.k] || (merged[x.k] = { k: x.k, c: 0, v: x.v, body: x.body }); m.c += x.c; }
  const ps = Object.values(merged), carry = ps.filter(x => x.c >= 1.2).sort((a, b) => b.c - a.c).slice(0, 2), hold = ps.filter(x => x.c <= -1.2).sort((a, b) => a.c - b.c).slice(0, 2);
  const bits = [];
  if (carry.length) bits.push(`${prJoin(carry.map(x => prPartWord(spot, x)))} carr${carry.length > 1 ? 'y' : 'ies'} it`);
  if (hold.length) bits.push(`${prJoin(hold.map(x => prPartWord(spot, x)))} hold${hold.length > 1 ? '' : 's'} him back`);
  s += '.' + (bits.length ? ' ' + prCap(bits.join('; ')) + '.' : '');
  const tech = ps.filter(x => !prTool(x.k)).reduce((a, x) => a + x.c, 0), tool = ps.filter(x => prTool(x.k)).reduce((a, x) => a + x.c, 0);
  if (tech >= 3 && tool <= -2) s += ' He wins with craft more than tools.';
  return s;
}

// upside: the same job with his technique refined to a polished pro's, on the tools he has
function prRefinedVal(p, spot, d) { return k => { const v = prRead(p, k, d); return prTool(k) ? v : Math.max(v, prTpl(spot, k) + 5); }; } // a solid pro's technique
function prUpside(p, spot, d, jk) {
  jk = jk || PR_SPOT_JOBS[spot][0]; const now = prJob(p, spot, jk, k => prRead(p, k, d)), ref = prJob(p, spot, jk, prRefinedVal(p, spot, d));
  const gain = {}; for (const r of ref.rs) for (const x of r.parts) if (!prTool(x.k) && !x.body) gain[x.k] = (gain[x.k] || 0) + x.c;
  for (const r of now.rs) for (const x of r.parts) if (!prTool(x.k) && !x.body) gain[x.k] -= x.c;
  const need = Object.entries(gain).filter(([, g]) => g >= 1).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => prNoun(spot, k));
  const toolSum = ref.rs.flatMap(r => r.parts).filter(x => prTool(x.k)).reduce((a, x) => a + x.c, 0) / ref.rs.length;
  return { jk, now, ref, gap: ref.diff - now.diff, need, toolSum, tier: prTier(spot, jk, ref.diff), q: prPctl(spot, jk, ref.diff), qNow: prPctl(spot, jk, now.diff) };
}
function prUpsideLine(p, spot, u) {
  const n = PR_JOBS[u.jk].n;
  if (u.gap < 2 && u.qNow >= 0.5) return `Polished: what you see is what you get, a ${prTier(spot, u.jk, u.now.diff)} ${n}.`;
  const refine = u.need.length ? `; will need to refine his ${prJoin(u.need)} to translate` : '';
  if (u.q < 0.5) return `The tools cap him: even with his technique refined, a ${u.tier} ${n}.`;
  if (u.q < 0.78 && u.toolSum <= -2) return `Limited tools: a ${u.tier} ${n} at best${refine}.`;
  return `Has the tools to be a ${u.tier} ${n}${refine}.`;
}
// other spots: his tools there, with that spot's technique refined. A spot is its first two jobs (a coverage
// linebacker has to take on blocks and cover), and he needs a real athletic tool for it, not just the size.
function prAlts(p, d) {
  const mine = prUpside(p, p.spot, d), out = [];
  for (const s of PR_ALT[p.spot] || []) {
    const us = PR_SPOT_JOBS[s].slice(0, 2).map(jk => prUpside(p, s, d, jk)), q = Math.min(...us.map(u => u.q));
    const tools = [...new Set(us.flatMap(u => u.ref.rs.flatMap(r => r.parts)).filter(x => prTool(x.k) && !x.body && x.c > 0.8).sort((a, b) => b.c - a.c).map(x => prNoun(s, x.k)))].slice(0, 2);
    const fresh = us[0].jk !== mine.jk || (us[1] && us[1].jk !== (PR_SPOT_JOBS[p.spot][1]));
    if (q >= 0.5 && tools.length && us.every(u => u.toolSum >= -1) && (fresh ? q >= mine.q - 0.15 : q >= mine.q + 0.1)) out.push({ s, us, q, tools });
  }
  return out.sort((a, b) => b.q - a.q).slice(0, 2).map(({ s, us, q, tools }) => {
    const need = [...new Set(us.flatMap(u => u.need))].slice(0, 2);
    return `Has the ${prJoin(tools)} for ${(JOB_NAME[s] || s).toLowerCase()}${need.length ? `; would need to learn ${prJoin(need)}` : ''}. Projects as a ${prTierQ(q)} ${(JOB_NAME[s] || s).toLowerCase()} there.`;
  });
}

// ---- college: usage and production, every season (generated from the true player) ----
function prH(p, a, b) { return hashGauss(p.id, a, b || 1); }
function prGroup(spot) { return ['EDGE', 'DE', 'DT', 'NT'].includes(spot) ? 'DL' : ['MLB', 'WLB'].includes(spot) ? 'LB' : ['CB', 'NCB'].includes(spot) ? 'CB' : ['FS', 'SS'].includes(spot) ? 'S' : ['LT', 'LG', 'C', 'RG', 'RT'].includes(spot) ? 'OL' : ['WRX', 'WRZ', 'SLOT'].includes(spot) ? 'WR' : ['TEY', 'TEH', 'FB'].includes(spot) ? 'TE' : spot; }
function prShare(ws) { const t = ws.reduce((s, x) => s + Math.max(0.01, x[1]), 0); return ws.map(([l, w]) => [l, Math.round(Math.max(0.01, w) / t * 100)]); }
function prUsage(p) {
  const a = k => prTrue(p, k), B = prBody(p, p.spot), g = prGroup(p.spot), n = s => prH(p, 1200 + s) * 0.25;
  switch (g) {
    case 'DL': { const inner = ['DT', 'NT'].includes(p.spot) ? 1 : 0;
      return { split: prShare([['Wide', (1 - inner) * (1 + (a('bur') + a('agi') - 150) / 30 - B.w * 0.4) + n(1)], ['Tight', 0.8 + B.w * 0.2 + n(2)], ['Inside', 0.25 + inner * 1.6 + B.w * 0.4 + (a('str') - 70) / 30 + n(3)]]),
        extra: [['Dropped into coverage', clamp(0.03 + (a('zone') - 35) / 300 + (a('spd') - 70) / 300 - inner * 0.04 + n(4) * 0.1, 0, 0.3)]] }; }
    case 'LB': return { split: prShare([['Box', 1.2 + (a('str') - 60) / 40 + n(1)], ['Overhang / slot', 0.4 + (a('man') + a('zone') - 100) / 60 + (a('spd') - 72) / 40 + n(2)], ['On the edge', 0.15 + (a('prsh') - 45) / 60 + n(3)]]),
      extra: [['Blitzed', clamp(0.1 + (a('prsh') - 40) / 300 + n(4) * 0.1, 0.03, 0.35)], ['Dropped into coverage', clamp(0.45 + (a('zone') - 50) / 200 + n(5) * 0.1, 0.2, 0.7)]] };
    case 'CB': return { split: prShare([['Outside', (p.spot === 'NCB' ? 0.4 : 1.4) + B.h * 0.2 + n(1)], ['Slot', (p.spot === 'NCB' ? 1.4 : 0.3) + (a('agi') - 75) / 30 + n(2)]]),
      extra: [['Press', clamp(0.35 + (a('prs') - 55) / 120 + n(3) * 0.1, 0.05, 0.85)], ['Man coverage', clamp(0.4 + (a('man') - a('zone')) / 100 + n(4) * 0.1, 0.1, 0.8)]] };
    case 'S': return { split: prShare([['Deep', (p.spot === 'FS' ? 1.5 : 0.6) + (a('spd') - 80) / 30 + n(1)], ['Box', (p.spot === 'SS' ? 1.2 : 0.4) + (a('str') - 60) / 40 + n(2)], ['Slot', 0.35 + (a('man') - 55) / 60 + n(3)]]) };
    case 'OL': { const sp = { LT: [1.8, 0.3, 0.05, 0.05, 0.4], RT: [0.4, 0.1, 0.05, 0.3, 1.8], LG: [0.3, 1.8, 0.3, 0.4, 0.1], RG: [0.1, 0.4, 0.3, 1.8, 0.3], C: [0.02, 0.3, 1.8, 0.3, 0.02] }[p.spot];
      return { split: prShare(['LT', 'LG', 'C', 'RG', 'RT'].map((l, i) => [l, sp[i] + n(i + 1)])) }; }
    case 'WR': return { split: prShare([['Outside', (p.spot === 'SLOT' ? 0.5 : 1.6) + B.h * 0.2 + n(1)], ['Slot', (p.spot === 'SLOT' ? 1.6 : 0.4) + (a('agi') - 78) / 30 + n(2)], ['Backfield / jet', 0.06 + (a('elu') - 60) / 300 + n(3) * 0.2]]) };
    case 'TE': return { split: prShare([['In-line', (p.spot === 'TEY' ? 1.5 : p.spot === 'FB' ? 0.2 : 0.6) + (a('rbk') - 60) / 40 + n(1)], ['Slot', (p.spot === 'TEH' ? 1.1 : 0.4) + (a('rte') - 60) / 40 + n(2)], ['Wide', 0.1 + (a('spd') - 75) / 60 + n(3) * 0.4], ['H-back', (p.spot === 'FB' ? 1.6 : 0.2) + n(4)]]) };
    case 'RB': return { split: prShare([['Inside runs', 1 + (a('bal') + a('str') - 130) / 50 + n(1)], ['Outside runs', 0.8 + (a('spd') + a('elu') - 160) / 50 + n(2)]]),
      extra: [['Ran routes on passing downs', clamp(0.35 + (a('rte') + a('hnd') - 110) / 200 + n(3) * 0.1, 0.1, 0.8)], ['Stayed in to block', clamp(0.3 + (a('pbk') - 50) / 150 + n(4) * 0.1, 0.05, 0.6)]] };
    case 'QB': return { split: prShare([['Shotgun / pistol', 2.4 + n(1)], ['Under center', 0.8 + (a('pkt') - 65) / 40 + n(2)]]),
      extra: [['Play action', clamp(0.24 + n(3) * 0.1, 0.1, 0.4)], ['Designed runs a game', clamp(1.5 + (a('spd') - 60) / 8 + n(4) * 2, 0, 12)]] };
  }
  return { split: [] };
}
const PR_CACHE = new WeakMap(); // kept off the player so it never reaches a save
function prCollege(p) {
  if (PR_CACHE.has(p)) return PR_CACHE.get(p);
  const tier = typeof schoolTier === 'function' ? schoolTier(p.college) : 3, n = clamp(Math.round(p.age - 18.4 + prH(p, 951) * 0.4), 3, 5);
  const room = ((p.grow && (p.grow.T || 0) + (p.grow.M || 0)) || 0), slope = clamp(1.6 + room * 0.18 + prH(p, 952) * 1.0, 0, 6);
  const bar = [0, 66, 63, 60, 57, 54, 51, 48, 45][tier], comp = (tier - 2) * 1.6, g = prGroup(p.spot), use = prUsage(p);
  const jobDiff = jk => prJob(p, p.spot, jk, k => prTrue(p, k)).diff, ol = g === 'OL';
  const seasons = [];
  for (let i = 0; i < n; i++) {
    const left = n - 1 - i, ci = p.ovr - slope * left - (left >= 3 ? 2 : 0) + prH(p, 960 + i) * 1.5, role = ci >= bar ? 'S' : ci >= bar - 6 ? 'R' : 'B';
    const rs = n === 5 && i === 0, gp = rs ? randIntH(p, 971, 1, 4) : role === 'B' ? randIntH(p, 972 + i, 4, 10) : randIntH(p, 975 + i, 11, 13);
    const gs = role === 'S' ? gp - (prH(p, 980 + i) > 1 ? 1 : 0) : role === 'R' ? randIntH(p, 985 + i, 0, 3) : 0;
    const snaps = Math.round(gp * (role === 'S' ? (ol ? 68 : 60) : role === 'R' ? 26 : 7) * (1 + prH(p, 990 + i) * 0.06));
    const dom = ci + comp - 62, nz = s => prH(p, 1000 + i * 37 + s);
    const yr = (p.draftYear || state.season + 1) - n + i, cls = n === 5 ? ['Fr (redshirt)', 'RS Fr', 'RS So', 'RS Jr', 'RS Sr'][i] : ['Fr', 'So', 'Jr', 'Sr'][i];
    const st = { yr, cls, gp, gs: rs ? 0 : gs, snaps: rs ? Math.min(snaps, 40) : snaps, dom };
    prSeasonStats(p, g, st, use, dom, nz, jobDiff);
    st.pen = Math.max(0, Math.round(snaps / 700 * (2.2 + (55 - p.h.disc) * 0.05 + (55 - p.h.temp) * 0.02) + nz(30) * 0.8));
    st.pf = Math.max(0, Math.round(snaps / 700 * (0.4 + (50 - (p.h.temp + p.h.cond) / 2) * 0.03) + nz(31) * 0.5));
    seasons.push(st);
  }
  const c = { tier, n, seasons, use, g }; PR_CACHE.set(p, c); return c;
}
function randIntH(p, s, lo, hi) { return lo + Math.floor(clamp((prH(p, s) + 2.5) / 5, 0, 0.999) * (hi - lo + 1)); }
function prSeasonStats(p, g, st, use, dom, nz, jobDiff) {
  const S = st.snaps, ex = l => ((use.extra || []).find(x => x[0] === l) || [0, 0])[1], r = Math.round;
  if (g === 'DL') { const rushSn = S * 0.55 * (1 - ex('Dropped into coverage')), pr = clamp(0.1 + 0.0055 * (dom + jobDiff('rush') * 0.5) + nz(1) * 0.012, 0.03, 0.24), prs = r(rushSn * pr);
    st.prs = prs; st.sck = r(prs * clamp(0.15 + nz(2) * 0.03, 0.07, 0.24) * 2) / 2; st.tfl = r(S * 0.45 * clamp(0.02 + 0.0012 * (dom + jobDiff('runD') * 0.5), 0.004, 0.05) + st.sck);
    st.tkl = r(S * clamp(0.06 + 0.0015 * dom - (['DT', 'NT'].includes(p.spot) ? 0.008 : 0), 0.03, 0.11)); st.ff = Math.max(0, r(st.sck * 0.15 + nz(3) * 0.6 * Math.min(1, S / 400))); st.prR = rushSn ? prs / rushSn : 0; }
  else if (g === 'LB') { const cov = S * 0.55 * ex('Dropped into coverage');
    st.tkl = r(S * clamp(0.12 + 0.002 * dom, 0.07, 0.16)); st.tfl = r(S * clamp(0.012 + 0.0006 * dom + nz(1) * 0.002, 0.003, 0.03)); st.sck = r(S * 0.55 * ex('Blitzed') * clamp(0.05 + 0.002 * (dom + jobDiff('blitz') * 0.4), 0.01, 0.12) * 2) / 2;
    st.int = Math.max(0, r(cov * 0.004 * (1 + (prTrue(p, 'bsk') - 55) / 60) + nz(2) * 0.6)); st.pd = Math.max(0, r(cov * 0.018 * (1 + (prTrue(p, 'bsk') - 55) / 60) + nz(3))); st.mt = clamp(0.14 - (prTrue(p, 'tkl') - 62) * 0.003 - dom * 0.002 + nz(4) * 0.015, 0.03, 0.28); }
  else if (g === 'CB' || g === 'S') { const cov = S * 0.6, tg = r(cov * (g === 'CB' ? 0.14 : 0.08) * (1 + nz(1) * 0.08)), cd = jobDiff(g === 'CB' ? 'man' : 'zone');
    st.tgt = tg; st.cmp = clamp(0.6 - dom * 0.006 - cd * 0.006 + nz(2) * 0.03, 0.35, 0.75); st.int = Math.max(0, r(tg * clamp(0.035 + (prTrue(p, 'bsk') - 60) * 0.001, 0.005, 0.08) + nz(3) * 0.7));
    st.pd = Math.max(0, r(tg * clamp(0.14 + (prTrue(p, 'bsk') - 60) * 0.003 + dom * 0.002, 0.04, 0.3) + nz(4))); st.tkl = r(S * (g === 'S' ? 0.09 : 0.06) * (1 + nz(5) * 0.08)); st.ypc = clamp(1.2 - dom * 0.02 - cd * 0.02 + nz(6) * 0.12, 0.4, 2.2); st.mt = clamp(0.13 - (prTrue(p, 'tkl') - 60) * 0.003 + nz(7) * 0.015, 0.03, 0.28); }
  else if (g === 'OL') { const ps = S * 0.55, d = dom + jobDiff('pass') * 0.6; st.sa = Math.max(0, r(ps * clamp(0.005 - 0.00025 * d, 0.0005, 0.015) + nz(1) * 0.6)); st.pa = Math.max(st.sa, r(ps * clamp(0.045 - 0.0015 * d, 0.008, 0.11))); st.paR = ps ? st.pa / ps : 0; }
  else if (g === 'QB') { const att = r(S * 0.5), dA = dom + jobDiff('qbAcc') * 0.5, dM = dom + jobDiff('qbMind') * 0.5;
    st.att = att; st.pct = clamp(0.62 + 0.004 * dA + nz(1) * 0.015, 0.48, 0.75); st.cmp = r(att * st.pct); st.ya = clamp(7.4 + 0.08 * dA + nz(2) * 0.4, 5, 11); st.yds = r(att * st.ya);
    st.td = r(att * clamp(0.05 + 0.0015 * dM, 0.015, 0.11)); st.int = r(att * clamp(0.026 - 0.0009 * dM + nz(3) * 0.003, 0.006, 0.05)); st.sk = clamp(0.065 - 0.0015 * (jobDiff('qbPkt') + dom * 0.5) + nz(4) * 0.008, 0.02, 0.13);
    st.ry = r(st.gp * ex('Designed runs a game') * clamp(4 + (prTrue(p, 'spd') - 65) / 10, 1, 9) + nz(5) * 40); }
  else if (g === 'RB') { const car = r(S * 0.3 * (1 + nz(1) * 0.1)), d = dom + jobDiff('carry') * 0.6;
    st.car = car; st.ypc = clamp(5 + 0.06 * d + nz(2) * 0.3, 3, 7.8); st.ryd = r(car * st.ypc); st.rtd = r(car * clamp(0.045 + 0.0015 * d, 0.01, 0.1)); st.yco = clamp(st.ypc * 0.58 + (prTrue(p, 'bal') - 70) * 0.02, 1, 5);
    st.rec = r(S * 0.45 * ex('Ran routes on passing downs') * clamp(0.11 + 0.002 * dom, 0.03, 0.2)); st.recy = r(st.rec * clamp(8 + nz(3), 4, 13)); st.mtf = clamp(0.18 + (prTrue(p, 'elu') - 70) * 0.004 + nz(4) * 0.02, 0.05, 0.35); }
  else if (g === 'WR' || g === 'TE') { const routes = S * 0.5 * (g === 'TE' ? 0.6 : 0.95), d = dom + jobDiff('routes') * 0.6, tg = r(routes * clamp((g === 'TE' ? 0.15 : 0.2) + 0.005 * d, 0.05, 0.33));
    st.tgt = tg; st.rec = r(tg * clamp(0.63 + 0.003 * jobDiff('catch') + nz(1) * 0.03, 0.45, 0.8)); st.ypr = clamp((g === 'TE' ? 11 : 13.5) + (prTrue(p, 'spd') - 85) * 0.15 + nz(2), 7, 21); st.yds = r(st.rec * st.ypr);
    st.td = r(st.rec * clamp(0.1 + nz(3) * 0.02, 0.03, 0.2)); st.yprr = routes ? st.yds / routes : 0; st.drop = clamp(0.07 - (prTrue(p, 'hnd') - 70) * 0.002 + nz(4) * 0.01, 0.01, 0.16); }
  else if (g === 'K') { st.fga = r(18 + nz(1) * 3); st.fgm = r(st.fga * clamp(0.78 + (prTrue(p, 'kcon') - 70) * 0.004, 0.55, 0.96)); st.lng = r(clamp(46 + (prTrue(p, 'krng') - 70) * 0.4 + nz(2) * 3, 38, 62)); }
  else if (g === 'P') { st.pnt = r(52 + nz(1) * 8); st.avg = clamp(42 + (prTrue(p, 'pdis') - 70) * 0.2 + nz(2), 36, 50); st.i20 = r(st.pnt * clamp(0.32 + (prTrue(p, 'pplc') - 70) * 0.004, 0.15, 0.5)); }
}
const PR_COLS = {
  DL: [['Tkl', 'tkl'], ['TFL', 'tfl'], ['Sacks', 'sck'], ['Pressures', 'prs'], ['FF', 'ff'], ['Pressure %', 'prR', 'pct', 2]],
  LB: [['Tkl', 'tkl'], ['TFL', 'tfl'], ['Sacks', 'sck'], ['INT', 'int'], ['PD', 'pd'], ['Missed tkl %', 'mt', 'pct', 2]],
  CB: [['Tkl', 'tkl'], ['INT', 'int'], ['PD', 'pd'], ['Targets', 'tgt'], ['Comp % allowed', 'cmp', 'pct', 2], ['Yds / cov snap', 'ypc', 'f2', 2]],
  S: [['Tkl', 'tkl'], ['INT', 'int'], ['PD', 'pd'], ['Comp % allowed', 'cmp', 'pct', 2], ['Missed tkl %', 'mt', 'pct', 2]],
  OL: [['Sacks allowed', 'sa'], ['Pressures allowed', 'pa'], ['Pressure %', 'paR', 'pct', 2]],
  QB: [['Cmp', 'cmp'], ['Att', 'att'], ['Pct', 'pct', 'pct'], ['Yds', 'yds'], ['TD', 'td'], ['INT', 'int'], ['Y/A', 'ya', 'f1'], ['Rush yds', 'ry'], ['Sack %', 'sk', 'pct', 2]],
  RB: [['Car', 'car'], ['Yds', 'ryd'], ['YPC', 'ypc', 'f1'], ['TD', 'rtd'], ['Rec', 'rec'], ['Rec yds', 'recy'], ['Yds after contact', 'yco', 'f1', 2], ['Missed tkl forced', 'mtf', 'pct', 2]],
  WR: [['Tgt', 'tgt'], ['Rec', 'rec'], ['Yds', 'yds'], ['TD', 'td'], ['Yds / route', 'yprr', 'f2', 2], ['Drop %', 'drop', 'pct', 2]],
  TE: [['Tgt', 'tgt'], ['Rec', 'rec'], ['Yds', 'yds'], ['TD', 'td'], ['Yds / route', 'yprr', 'f2', 2], ['Drop %', 'drop', 'pct', 2]],
  K: [['FGM', 'fgm'], ['FGA', 'fga'], ['Long', 'lng']], P: [['Punts', 'pnt'], ['Avg', 'avg', 'f1'], ['Inside 20', 'i20']],
};
function prFmt(v, f) { return v === undefined ? '' : f === 'pct' ? (v * 100).toFixed(1) : f === 'f1' ? v.toFixed(1) : f === 'f2' ? v.toFixed(2) : v; }
// what the production says, the way scouts summarize it
function prProdNotes(c, p) {
  const st = c.seasons.filter(s => s.gs >= 6), notes = [], big = s => s.dom;
  if (st.length >= 2 && st.every((s, i) => i === 0 || s.dom > st[i - 1].dom + 0.8)) notes.push(['Ascending: better every season he started', 'good']);
  if (st.length === 1 && c.n >= 4) notes.push(['One-year starter', 'warn']);
  if (st.length >= 3) notes.push([`${st.length}-year starter`, '']);
  if (c.tier >= 5) notes.push([`Small-school production: ${c.tier >= 6 ? 'FCS-level' : 'Group of Five-level'} competition flatters the numbers`, 'warn']);
  else if (c.tier <= 1) notes.push(['Produced against top competition', 'good']);
  const last = c.seasons[c.seasons.length - 1];
  if (last && last.gs < 6) notes.push(['Never a full-time starter', 'warn']);
  return notes;
}

// ---- makeup: what each source says (each reads only its traits, with its own error) ----
const PR_SRC = { buzz: [1, 18], film: [2, 10], coach: [3, 9], interview: [3, 10], background: [3, 6], strength: [3, 9] };
function prPers(p, k, src) { return clamp(p.h[k] + hashGauss(p.id, 1500 + prSalt(k) + Object.keys(PR_SRC).indexOf(src) * 211, 1) * PR_SRC[src][1], 1, 99); }
function prMakeup(p, d, c) {
  ensureCharacter(p);
  const out = [], R = (k, s) => prPers(p, k, s), pf = c.seasons.reduce((s, x) => s + x.pf, 0);
  if (d === 1) {
    const a = (R('pas', 'buzz') + R('lead', 'buzz')) / 2, b = (R('cond', 'buzz') + R('temp', 'buzz')) / 2;
    out.push(['Reputation', b < 38 ? 'Some maturity questions follow him.' : a >= 66 ? 'Known as a high-motor, team-first player.' : a < 42 ? 'Not known as a worker.' : 'Nothing notable either way.']);
    return out;
  }
  const film = [], pas = R('pas', 'film'), tmp = R('temp', 'film'), cons = R('cons', 'film');
  film.push(pas >= 70 ? 'Plays to the whistle and chases from the back side' : pas >= 48 ? 'Effort is fine' : 'Takes plays off when the ball goes away');
  if (tmp <= 36 || pf >= 4) film.push(`Loses his cool${pf ? `: ${pf} personal foul${pf === 1 ? '' : 's'} in college` : ''}`); else if (tmp <= 50 && pf >= 2) film.push(`A few late hits (${pf} personal fouls)`);
  if (cons >= 70) film.push('The same player every week'); else if (cons <= 38) film.push('Up and down from game to game');
  out.push(['Film', film.join('. ') + '.']);
  if (d >= 3) {
    const co = [], cp = R('pas', 'coach'), cd = R('disc', 'coach'), cl = R('lead', 'coach');
    co.push(cp >= 75 ? 'First in, last out' : cp >= 55 ? 'Does what is asked' : cp >= 40 ? 'Has to be pushed' : 'Coasts when nobody is watching');
    if (cd >= 70) co.push('does his job every snap'); else if (cd <= 40) co.push('freelances, trusts his gut over the call');
    if (cl >= 72) co.push('teammates follow him'); else if (cl <= 34) co.push('keeps to himself');
    out.push(['His college coaches', co.join('; ') + '.']);
    const iv = [], ii = R('int', 'interview'), ia = R('adapt', 'interview'), ie = R('ego', 'interview'), im = R('amb', 'interview');
    iv.push(ii >= 72 ? 'Sharp on the whiteboard' : ii <= 40 ? 'Struggled with the whiteboard work' : 'Handled the whiteboard');
    if (ia >= 70) iv.push('picked up a new concept on the spot'); else if (ia <= 38) iv.push('got lost when we changed the call on him');
    if (ie >= 75) iv.push('talked mostly about himself and his role'); else if (ie <= 32) iv.push('team-first in everything he said');
    if (im >= 75) iv.push('asked what it takes to be great'); else if (im <= 36) iv.push('seemed content just to have made it');
    out.push(['Interview', iv.join('; ') + '.']);
    const bc = R('cond', 'background'), bt = R('temp', 'background');
    out.push(['Background', bc <= 28 ? 'An arrest in college after a fight; the charges were dropped.' : bc <= 42 ? 'Suspended for a game for a team rules violation.' : bt <= 30 ? 'A reported scuffle with a teammate at practice.' : bc >= 72 ? 'Clean record; teachers and staff speak highly of him.' : 'Nothing on the record.']);
    const sw = (R('amb', 'strength') + R('pas', 'strength')) / 2;
    out.push(['Strength staff', sw >= 72 ? 'Lives in the weight room.' : sw <= 40 ? 'Did the minimum in the offseason program.' : 'Did the work.']);
  }
  return out;
}
function prFlag(p, d) {
  if (d === 1) return ['Unverified', ''];
  const R = (k, s) => prPers(p, k, s);
  const temp = d >= 3 ? (R('temp', 'film') + R('temp', 'background')) / 2 : R('temp', 'film'), pas = d >= 3 ? (R('pas', 'film') + R('pas', 'coach') + R('pas', 'strength')) / 3 : R('pas', 'film');
  if (d === 2) return temp < 32 || pas < 36 ? ['Questions (film only)', 'warn'] : ['Nothing on film', ''];
  const cond = R('cond', 'background'), ego = R('ego', 'interview'), disc = R('disc', 'coach'), lead = R('lead', 'coach');
  if (cond < 30 || temp < 26 || (ego > 85 && lead < 40)) return ['Flag', 'bad'];
  if (pas < 38 || disc < 35 || cond < 42 || temp < 38 || ego > 78) return ['Questions', 'warn'];
  return ['Clean', 'good'];
}
// will the technique come: his work, how he learns, his age, and his college trajectory
function prOdds(p, c) {
  const R = (k, s) => prPers(p, k, s), work = (R('pas', 'coach') + R('pas', 'strength') + R('amb', 'interview') + R('amb', 'strength')) / 4, learn = (R('int', 'interview') + R('adapt', 'interview')) / 2;
  const st = c.seasons.filter(s => s.gs >= 6), trend = st.length >= 2 ? (st[st.length - 1].dom - st[0].dom) / (st.length - 1) : 0;
  const s = (work - 55) / 15 + (learn - 55) / 20 + (22 - p.age) * 0.35 + trend * 0.25, why = [];
  why.push(work >= 68 ? 'a worker' : work <= 42 ? 'questions about his work' : 'ordinary work habits');
  why.push(learn >= 66 ? 'a quick study' : learn <= 42 ? 'a slow learner' : 'learns at a normal pace');
  why.push(p.age <= 21 ? 'young for the class' : p.age >= 23 ? 'old for the class' : 'typical age');
  if (trend >= 2) why.push('still ascending');
  return { s, label: s >= 1.2 ? 'Good bet to get there' : s >= -0.2 ? 'Even money' : 'Long shot', cls: s >= 1.2 ? 'good' : s >= -0.2 ? '' : 'warn', why };
}
// what an area scout pulls off the tape: a few traits, often wrong
function prTape(p) {
  const w = SPOTS[p.spot].w || {}, rows = Object.keys(w).filter(k => !prTool(k)).map(k => ({ k, v: prRead(p, k, 1) - prTpl(p.spot, k) }));
  const pos = rows.filter(r => r.v >= 5).sort((a, b) => b.v - a.v).slice(0, 2).map(r => ['good', `Flashes ${prLvl(r.v)} ${prNoun(p.spot, r.k)}`]);
  const neg = rows.filter(r => r.v <= -6).sort((a, b) => a.v - b.v).slice(0, 1).map(r => ['bad', `${prCap(prNoun(p.spot, r.k))} looks ${prLvl(r.v)}`]);
  return [...pos, ...neg];
}
function prTools(p) {
  const ks = new Set(); for (const jk of PR_SPOT_JOBS[p.spot]) for (const pa of PR_JOBS[jk].paths) for (const k in pa.w) if (prTool(k)) ks.add(k);
  const B = prBody(p, p.spot), out = [...ks].map(k => ({ k, v: prRead(p, k, 3) - prTpl(p.spot, k) })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4).map(x => `${prLvl(x.v)} ${prNoun(p.spot, x.k)}`);
  for (const k of ['len', 'w']) { const wd = prBodyWord(k, B[k]); if (wd) out.push(wd); }
  return out;
}

// ---- the page ----
function protoReportHTML(p) {
  const d = clamp(ui.protoDepth || 1, 1, 3), c = prCollege(p), spot = p.spot, jobs = PR_SPOT_JOBS[spot] || [];
  const seg = `<div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap"><span class="pill warn">Prototype</span><span class="seg">${PR_DEPTHS.map(([l], i) => `<button class="sm ${d === i + 1 ? 'on' : ''}" data-action="protoDepth" data-v="${i + 1}" data-pid="${p.id}">${l}</button>`).join('')}</span><span class="small muted">${PR_DEPTHS[d - 1][1]}</span></div>`;
  const val = k => prRead(p, k, d), u = jobs.length ? prUpside(p, spot, d) : null, core = jobs.length ? prJob(p, spot, jobs[0], val) : null;
  // the read
  let left = `<div class="ds-lb">The read</div>`;
  if (d === 1) left += `<div class="ds-read sc-read">Tools: ${esc(prJoin(prTools(p)))}.</div>` + prTape(p).map(([cl, t]) => `<div class="sw-t ${cl}">${esc(t)}</div>`).join('') + `<div class="sc-fine">From one look at the tape: a cross-check will say how he actually wins.</div>`;
  else {
    left += core ? `<div class="ds-read sc-read">${esc(prCap(prVerdict(spot, jobs[0], core.diff)))} as a ${PR_JOBS[jobs[0]].n} today. ${esc(prUpsideLine(p, spot, u))}</div>` : '';
    left += `<div class="ds-rule"></div><div class="ds-lb">How he wins</div>` + jobs.slice(0, d === 2 ? 2 : jobs.length).map(jk => `<div class="sc-note" style="margin-bottom:6px">${esc(prWinLine(p, spot, prJob(p, spot, jk, val)))}</div>`).join('');
    left += `<div class="ds-rule"></div><div class="ds-lb">Tools</div><div class="sc-note">${esc(prCap(prJoin(prTools(p))))}.</div>`;
    if (d >= 3) {
      const alts = prAlts(p, d), od = prOdds(p, c);
      if (alts.length) left += `<div class="ds-rule"></div><div class="ds-lb">Could also play</div>` + alts.map(t => `<div class="sc-note" style="margin-bottom:6px">${esc(t)}</div>`).join('');
      left += `<div class="ds-rule"></div><div class="ds-lb">Will the technique come?</div><div><span class="pill ${od.cls}">${od.label}</span></div><div class="sc-note">${esc(prCap(od.why.join(', ')))}.</div>`;
    }
  }
  // college
  const cols = PR_COLS[c.g] || [], show = cols.filter(x => d >= 2 || !x[3]);
  const head = `<tr><th>Year</th><th>Class</th><th>GP</th><th>GS</th>${d >= 2 ? '<th>Snaps</th>' : ''}${show.map(x => `<th>${x[0]}</th>`).join('')}${d >= 2 ? '<th>Pen</th>' : ''}</tr>`;
  const body = c.seasons.map(s => `<tr><td>${s.yr}</td><td class="muted">${s.cls}</td><td>${s.gp}</td><td>${s.gs}</td>${d >= 2 ? `<td>${s.snaps}</td>` : ''}${show.map(x => `<td>${prFmt(s[x[1]], x[2])}</td>`).join('')}${d >= 2 ? `<td>${s.pen}</td>` : ''}</tr>`).join('');
  let mid = `<div class="ds-lb">College <span class="sc-lbr">${esc(p.college || '')} · ${c.tier <= 2 ? 'Power program' : c.tier <= 3 ? 'Power conference' : c.tier <= 5 ? 'Group of Five' : c.tier <= 7 ? 'FCS' : 'Division III'}</span></div>
    <div style="overflow-x:auto"><table class="pr-tbl">${head}${body}</table></div>`;
  mid += prProdNotes(c, p).map(([t, cl]) => `<div class="sc-note ${cl}">${esc(t)}</div>`).join('');
  if (d >= 2 && c.use.split.length) mid += `<div class="ds-rule"></div><div class="ds-lb">How he was used <span class="sc-lbr">charted from his film</span></div>
    <div class="sc-note">${c.use.split.filter(x => x[1] >= 3).map(([l, v]) => `${esc(l)} <b>${v}%</b>`).join(' · ')}</div>${(c.use.extra || []).map(([l, v]) => `<div class="sc-note">${esc(l)}: <b>${l.indexOf('a game') >= 0 ? v.toFixed(1) : Math.round(v * 100) + '%'}</b></div>`).join('')}`;
  else if (d === 1) mid += `<div class="sc-fine">Box-score numbers only. Usage and rate stats come with a cross-check.</div>`;
  // makeup
  const fl = prFlag(p, d);
  let right = `<div class="ds-lb">Makeup</div><div style="margin-bottom:6px"><span class="pill ${fl[1]}">${esc(fl[0])}</span></div>` + prMakeup(p, d, c).map(([s, t]) => `<div class="sc-note" style="margin-bottom:6px"><b>${esc(s)}:</b> ${esc(t)}</div>`).join('');
  if (d < 3) right += `<div class="sc-fine">${d === 1 ? 'Reputation only. Film comes with a cross-check; coaches, interviews and background with a full workup.' : 'Film only. Coaches, interviews and a background check come with a full workup.'}</div>`;
  return seg + `<div class="sc-grid pr2"><div class="sc-col">${left}</div><div class="sc-col">${right}</div></div>
    <div class="ds-rule"></div><div>${mid}</div>
    <div class="sc-fine" style="margin-top:14px">Prototype: built on the fly from the player. Nothing here changes the game yet.</div>`;
}
