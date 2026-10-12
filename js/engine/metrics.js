'use strict';
// =====================================================================
//  ENGINE · charting: EPA, "next gen" tracking metrics and play-by-play grades
//  Every snap is charted here; league.js rolls games into season totals.
// =====================================================================

// Expected points for the offense in a down/distance/field-position state
function epState(down, togo, ydl) {
  const t = Math.min(togo, 25);
  let v = -0.6 + 0.066 * clamp(ydl, 1, 99);
  if (down === 1) v -= 0.03 * (t - 10);
  else if (down === 2) v -= 0.35 + 0.05 * (t - 7);
  else if (down === 3) v -= 0.95 + 0.08 * (t - 5);
  else v -= 1.7 + 0.08 * t;
  return v;
}
// separation in yards at the catch point, from the engine's openness value
function sepYards(w) { return clamp(2.45 + w * 1.4, 0.2, 9); }
// separation on a route with the route's own depth taken out (a deep route is covered by design), and where "open" starts and "blanketed" ends
// (centred so an ordinary route reads about two and a half yards, as tracking data does)
function sepRoute(r) { return sepYards((r.w0 !== undefined ? r.w0 : r.w) - (r.band === 'S' ? TUNE.shortOpen : r.band === 'D' ? TUNE.deepCov : TUNE.midCov) + 0.8); }
const SEP_OPEN = 3.0, SEP_WIDE = 3.85, SEP_TIGHT = 1.9;
const SKILL_SLOTS = new Set(['X', 'Z', 'SLOT', 'SLOT2', 'Y', 'H', 'Y2', 'RB', 'FB']);
const BLOWN_T = 1.8; // beaten this quickly and it was never a block
// a rusher 'wins' if he beats his block before a normal throw would be out
const WIN_T = 3.0;

function av(g, p) { if (!p || p.id < 0) return null; return g.adv[p.id] || (g.adv[p.id] = { tid: p.tid }); }
function avInc(g, p, k, v = 1) { const a = av(g, p); if (a) a[k] = (a[k] || 0) + v; }
// grading: credits per facet; a facet's grade comes from the average credit per graded snap
const FACETS = { q: 'Passing', rec: 'Receiving', run: 'Rushing', pb: 'Pass Block', rb: 'Run Block', pr: 'Pass Rush', rd: 'Run Defense', cov: 'Coverage', tk: 'Tackling' };
function grade(g, p, f, credit, extra) {
  const a = av(g, p); if (!a) return;
  const add = k => { a['g' + k] = (a['g' + k] || 0) + credit; a['n' + k] = (a['n' + k] || 0) + 1; };
  add(f);
  // situational splits ("grade vs man", "grade under pressure"...) share the facet's scale
  for (const t of ctxTags(g, f)) if (t) add(f + '_' + t);
  if (extra) for (const t of extra) if (t) add(f + '_' + t);
}
function ctxTags(g, f) {
  const x = g.gx || {};
  switch (f) {
    case 'q': return [x.prs ? 'prs' : 'cln', x.air === undefined ? null : x.air >= 20 ? 'dp' : x.air >= 10 ? 'md' : 'sh', x.pa ? 'pa' : null, x.blz ? 'blz' : null];
    case 'rec': case 'cov': return [x.man ? 'man' : 'zon'];
    case 'run': case 'rb': return x.run ? [x.zone ? 'zn' : 'gp'] : [];
    case 'pb': return [x.blz ? 'blz' : 'std'];
    default: return [];
  }
}
const SPLIT_LABELS = { q_cln: 'Clean pocket', q_prs: 'Under pressure', q_sh: 'Short (<10)', q_md: 'Intermediate', q_dp: 'Deep (20+)', q_pa: 'Play-action', q_blz: 'vs. Blitz',
  rec_man: 'vs. Man', rec_zon: 'vs. Zone', rec_press: 'vs. Press', rec_ctd: 'Contested', run_zn: 'Zone runs', run_gp: 'Gap runs', rb_zn: 'Zone blocking', rb_gp: 'Gap blocking',
  pb_std: 'vs. 4-man rush', pb_blz: 'vs. Blitz', pr_sgl: 'vs. Single block', pr_dbl: 'vs. Double team', cov_man: 'Man coverage', cov_zon: 'Zone coverage' };
function tav(g, s, k, v = 1) { g.tadv[s][k] = (g.tadv[s][k] || 0) + v; }
const LBS = new Set(['MLB', 'WLB', 'SAM']);

function chartPlay(g, oc, dc, res, before, off, def) {
  const o = before.poss, d = 1 - o;
  g.gx = { man: ['C0', 'C1', 'C2M'].includes(dc.cov), blz: dc.pres === 'BLITZ' || dc.pres === 'SIM' || dc.pres === 'FZ', pa: oc.tags && oc.tags.has('PA'), zone: oc.scheme === 'ZONE', run: !!oc.isRun,
    prs: !!res.pressure, air: res.kind === 'comp' || res.kind === 'inc' || res.kind === 'int' ? res.air : undefined };
  const epB = epState(before.down, before.togo, before.ydl);
  const sd = g.score[o] - before.score[o], od = g.score[d] - before.score[d];
  let epA;
  if (sd >= 6) epA = 6.4;
  else if (od >= 6) epA = -6.4;
  else if (od === 2) epA = -2.9;
  else if (g.poss !== o) epA = -epState(1, 10, g.ydl);
  else epA = epState(g.down, g.togo, g.ydl);
  const epa = epA - epB;
  const yds = Math.min(res.yds || 0, 100 - before.ydl); // a play cannot gain more than the field left: the box score stops at the goal line and so does the chart
  const td = sd >= 6;
  const success = td || (before.down === 1 ? yds >= before.togo * 0.4 : before.down === 2 ? yds >= before.togo * 0.6 : yds >= before.togo);
  const isPass = !oc.isRun || res.kind === 'pass' || res.kind === 'comp' || res.kind === 'inc' || res.kind === 'int' || res.kind === 'sack' || (res.kind === 'scramble');
  // ---- team ----
  tav(g, o, 'plays'); tav(g, o, 'epa', epa); if (success) tav(g, o, 'succ');
  tav(g, d, 'dPlays'); tav(g, d, 'dEpa', epa); if (success) tav(g, d, 'dSucc');
  // self-scout: usage and results by call (offense) and by the defense's call (EPA from the offense's side)
  const ss = (s, k) => { tav(g, s, 'u_' + k); tav(g, s, 'e_' + k, epa); if (success) tav(g, s, 's_' + k); };
  const sitK = before.down === 1 ? '1st' : before.down === 2 ? (before.togo >= 7 ? '2L' : '2S') : before.togo <= 2 ? '3S' : before.togo <= 6 ? '3M' : '3L';
  if (oc.pers) ss(o, 'pers' + oc.pers);
  if (oc.type) ss(o, 'type' + oc.type);
  if (oc.form) ss(o, 'form' + oc.form);
  if (oc.tags) for (const t of oc.tags) ss(o, 'tag' + t);
  ss(o, 'sit' + sitK + (oc.isRun ? 'R' : 'P'));
  if (dc.pkg) ss(d, 'pkg' + dc.pkg);
  if (dc.cov && !oc.isRun) ss(d, 'cov' + dc.cov);
  if (dc.pres && !oc.isRun) ss(d, 'pres' + dc.pres);
  if (oc.isRun) ss(d, 'vsRun'); else ss(d, 'vsPass');
  if (before.down <= 2 && !isHurry(g)) { tav(g, o, 'early'); if (isPass) tav(g, o, 'earlyPass'); }
  if (isPass) {
    tav(g, o, 'db'); tav(g, d, 'dDb'); tav(g, o, 'passEpa', epa);
    if (res.pressure) { tav(g, o, 'prs'); tav(g, d, 'dPrs'); }
    if (res.ttt) { tav(g, o, 'ttt', res.ttt + 0.25); tav(g, o, 'tttN'); }
    if (res.kind === 'comp' && yds >= 20) tav(g, o, 'expl');
    if (res.target) { tav(g, o, 'air', res.air || 0); tav(g, o, 'airN'); }
  } else {
    tav(g, o, 'rushN'); tav(g, o, 'rushEpa', epa);
    if (yds >= 10) tav(g, o, 'expl');
    // where the rushing yards come from: the line's first five, the second level, the open field
    if (res.kind === 'run') { tav(g, o, 'lyN'); if (yds <= 0) tav(g, o, 'ly0'); tav(g, o, 'ly5', clamp(yds, 0, 5)); tav(g, o, 'ly10', clamp(yds - 5, 0, 5)); tav(g, o, 'lyOpen', Math.max(0, yds - 10)); }
  }
  if (isPass && !g.gx.blz) { tav(g, d, 'nbDb'); if (res.pressure) tav(g, d, 'nbPrs'); } // pressure without sending extra men
  const conv = td || yds >= before.togo;
  // where everyone lined up
  for (const e of off) { if (!SKILL_SLOTS.has(e.slot)) continue; avInc(g, e.p, 'oSnp'); if (e.slot === 'SLOT' || e.slot === 'SLOT2' || e.flex) avInc(g, e.p, 'alS'); else if (e.slot === 'X' || e.slot === 'Z') avInc(g, e.p, 'alW'); else if (isInline(e)) avInc(g, e.p, 'alI'); }
  for (const e of def) { if (e.depth < ON_LINE) continue; avInc(g, e.p, 'dSnp'); if (e.depth <= 5.5 && Math.abs(e.x) <= 5) avInc(g, e.p, 'alBox'); else if (e.depth >= 9) avInc(g, e.p, 'alDeep'); }
  // ---- passing plays ----
  if (isPass && res.qb) {
    const qb = res.qb.p;
    avInc(g, qb, 'db'); avInc(g, qb, 'epaDb', epa);
    if (res.ttt) { avInc(g, qb, 'ttt', res.ttt + 0.25); avInc(g, qb, 'tttN'); } // + the throwing motion
    if (res.pressure) avInc(g, qb, 'prsd');
    if (oc.tags && oc.tags.has('PA')) { avInc(g, qb, 'paDb'); avInc(g, qb, 'paEpa', epa); }
    if (success) avInc(g, qb, 'succDb');
    if (!res.pressure) { avInc(g, qb, 'clnDb'); avInc(g, qb, 'clnEpa', epa); }
    if (res.kind === 'sack') { avInc(g, qb, 'skd'); avInc(g, qb, 'skY', -yds); }
    if (res.kind === 'scramble') avInc(g, qb, 'scr');
    if (before.down === 3 || before.down === 4) { avInc(g, qb, 'd3Db'); if (conv) avInc(g, qb, 'd3Cv'); }
    if (before.ydl >= 80) { avInc(g, qb, 'rzDb'); avInc(g, qb, 'rzEpa', epa); if (td) avInc(g, qb, 'rzTd'); }
    if ((before.q === 2 || before.q === 4) && before.clock <= 120) { avInc(g, qb, 'm2Db'); avInc(g, qb, 'm2Epa', epa); }
    const attempt = (res.kind === 'comp' || res.kind === 'inc' || res.kind === 'int') && !res.throwaway && res.target;
    const comp = res.kind === 'comp' ? 1 : 0;
    if (attempt) {
      avInc(g, qb, 'att'); avInc(g, qb, 'air', res.air || 0); avInc(g, qb, 'xc', res.xc || 0.65); avInc(g, qb, 'cmp', comp);
      if (res.pressure) { avInc(g, qb, 'prsdAtt'); avInc(g, qb, 'prsdCmp', comp); }
      if ((res.air || 0) >= 20) { avInc(g, qb, 'deepAtt'); avInc(g, qb, 'deepCmp', comp); }
      const xq = res.xcQ !== undefined ? res.xcQ : res.xc || 0.65;
      avInc(g, qb, 'xcq', xq); avInc(g, qb, 'xint', res.xint || 0);
      if (!res.pressure) { avInc(g, qb, 'clnAtt'); avInc(g, qb, 'clnCmp', comp); }
      if ((res.xint || 0) >= 0.1) avInc(g, qb, 'twp');                                    // a ball that should have been picked, whether or not it was
      if (comp && (res.air || 0) >= 15 && xq <= 0.55) avInc(g, qb, 'btt');                 // a hard throw downfield, made
      if (res.route && res.route.w < -0.5) avInc(g, qb, 'aggN');                           // into a tight window
      if (before.down === 3) { avInc(g, qb, 'ay3', (res.air || 0) - before.togo); avInc(g, qb, 'ay3N'); }
      if (comp) { avInc(g, qb, 'pyds', yds); avInc(g, qb, 'pyac', Math.min(res.yac || 0, yds)); }
      for (const e of off) if (SKILL_SLOTS.has(e.slot)) { avInc(g, e.p, 'tmTgt'); avInc(g, e.p, 'tmAir', Math.max(0, res.air || 0)); }
    }
    // QB grade: results (EPA) plus decision quality
    let qc = clamp(epa * 0.42, -1.6, 1.6);
    if (res.kind === 'int' && res.route && res.route.w < 0) qc -= 0.7;
    if (res.kind === 'sack' && res.ttt > 3.1 && !(res.rushers && res.rushers.some(a => a.free))) qc -= 0.35;
    if (res.throwaway && res.pressure) qc += 0.2;
    if (comp && res.route && res.route.w < 0.2) qc += 0.3;
    if (res.kind === 'scramble' && yds >= 5) qc += 0.25;
    grade(g, qb, 'q', qc);
    for (const e of off) if (SKILL_SLOTS.has(e.slot)) avInc(g, e.p, 'pSnp');
    // receivers: every route run counts; targets get the real credit
    const tgtCredit = rp => {
      avInc(g, rp, 'cmpT', comp); avInc(g, rp, 'xcr', res.xcR !== undefined ? res.xcR : res.xc || 0.65); avInc(g, rp, 'airT', Math.max(0, res.air || 0));
      if (res.drop) avInc(g, rp, 'drpT'); if (res.kind === 'int') avInc(g, rp, 'tInt');
      if (comp) { avInc(g, rp, 'tYds', yds); if (td) avInc(g, rp, 'tTd'); if (conv) avInc(g, rp, 'fdRec'); avInc(g, rp, g.gx.man ? 'ydM' : 'ydZ', yds);
        if (res.xYac !== undefined) { avInc(g, rp, 'yacN'); avInc(g, rp, 'yacT', Math.min(res.yac || 0, yds)); avInc(g, rp, 'xyac', res.xYac); } }
    };
    for (const r of res.routes || []) {
      const rp = r.e.p;
      const sp = sepRoute(r);
      avInc(g, rp, 'routes'); avInc(g, rp, 'sepR', sp); avInc(g, rp, 'sxR', r.sx || 0); // with the route's own depth taken out: a deep route is covered by design
      // how often he is open, thrown to or not, and how often blanketed; and the same route from the other side, for the man covering it
      if (sp >= SEP_OPEN) avInc(g, rp, 'openN'); if (sp >= SEP_WIDE) avInc(g, rp, 'wideN'); if (sp <= SEP_TIGHT) avInc(g, rp, 'tightN');
      avInc(g, rp, g.gx.man ? 'rtM' : 'rtZ');
      if (r.def && r.def.p) { const dp = r.def.p; avInc(g, dp, 'covR'); avInc(g, dp, 'sepA', sp); avInc(g, dp, 'dxR', r.dx || 0); if (sp <= SEP_TIGHT) avInc(g, dp, 'cwN'); if (sp >= SEP_OPEN) avInc(g, dp, 'openA'); }
      if (res.target && r.e === res.target) {
        avInc(g, rp, 'sep', sepYards(r.w)); avInc(g, rp, 'sepN'); avInc(g, rp, 'adot', r.depth); avInc(g, rp, 'epaTgt', epa);
        if (res.contested) { avInc(g, rp, 'cAtt'); avInc(g, rp, 'cWon', comp); }
        tgtCredit(rp);
        const ow = r.w + (r.shade || 0); // graded against his man, not the bracket
        const c = res.batted || res.uncatch ? clamp((ow - 0.45) * 0.3, -0.25, 0.25) : comp ? 0.45 + (res.yac || 0) / 12 + (res.contested ? 0.6 : 0) + Math.max(0, epa) * 0.15 + (r.shade || 0) * 0.5 : res.drop ? -1.3 : ow > 0.7 ? 0.08 : ow > 0.2 ? -0.03 : -0.3; // an off-target throw to an open man is on the QB
        grade(g, rp, 'rec', c, [r.pressAtt ? 'press' : null, res.contested ? 'ctd' : null]);
      } else { const ow = r.w + (r.shade || 0); grade(g, rp, 'rec', clamp((ow - 0.45) * 0.3, -0.25, 0.25), [r.pressAtt ? 'press' : null]); } // every route won or lost counts
    }
    if (res.target && res.target.slot !== 'QB' && !(res.routes || []).some(r => r.e === res.target)) { // screens
      const rp = res.target.p; avInc(g, rp, 'routes'); avInc(g, rp, 'sep', 4); avInc(g, rp, 'sepN'); avInc(g, rp, 'adot', res.air || 0); avInc(g, rp, 'epaTgt', epa); tgtCredit(rp);
      grade(g, rp, 'rec', comp ? 0.3 + (res.yac || 0) / 12 : -0.2);
    }
    // protection & rush
    if (res.prot) {
      const pressers = new Set((res.rushers || []).map(a => a.e));
      // a true pass set: no play-action, no screen, no quick game. The snaps where a blocker has to hold up.
      const tps = !(oc.tags && oc.tags.has('PA')) && !['QUICK', 'RBSCR', 'WRSCR', 'GADGET'].includes(oc.type);
      for (const e of off) if (OL_SLOTS.includes(e.slot)) { avInc(g, e.p, 'pbSnaps'); if (tps) avInc(g, e.p, 'tpsSnaps'); }
      for (const a of res.prot.rushers) {
        const rp = a.e.p, beat = a.free || a.t < WIN_T;
        avInc(g, rp, 'prSnaps'); if (beat) avInc(g, rp, 'prWins'); if (a.blockers.length > 1 || a.chip) avInc(g, rp, 'dbl'); if (a.chip && a.blockers.length <= 1) avInc(g, rp, 'chip');
        const sacked = res.kind === 'sack' && res.sacker === a.e;
        if (pressers.has(a.e)) avInc(g, rp, 'prsR');
        if (beat) { avInc(g, rp, 'ttpT', a.t); avInc(g, rp, 'ttpN'); }
        if (tps) { avInc(g, rp, 'tpsR'); if (beat) avInc(g, rp, 'tpsRW'); }
        if (a.e.blitz && a.e.depth >= ON_LINE) { avInc(g, rp, 'blzN'); if (pressers.has(a.e)) avInc(g, rp, 'blzP'); }
        if (a.blockers.length > 1) for (const h of a.blockers) avInc(g, h.p, 'dblRep');
        grade(g, rp, 'pr', (beat ? 0.45 : -0.08) + (pressers.has(a.e) ? 0.25 : 0) + (sacked ? 1.0 : 0) - (a.blockers.length > 1 && !beat ? -0.05 : 0), [a.blockers.length > 1 || a.chip ? 'dbl' : 'sgl']);
        const b = a.blockers[0];
        if (b) {
          const bp = b.p, lost = beat && !a.missed;
          avInc(g, bp, 'pbRep'); if (lost) { avInc(g, bp, 'pbRepL'); avInc(g, bp, 'tpaT', a.t); avInc(g, bp, 'tpaN'); if (a.t < BLOWN_T) avInc(g, bp, 'blown'); }
          if (tps && lost && OL_SLOTS.includes(b.slot)) avInc(g, bp, 'tpsLoss');
          if (a.e.blitz || a.tw) { avInc(g, bp, 'pbxRep'); if (lost) avInc(g, bp, 'pbxL'); }
          if (beat && !a.missed) { avInc(g, bp, 'pbLoss'); if (pressers.has(a.e)) avInc(g, bp, 'prsA'); if (sacked) avInc(g, bp, 'sackA'); grade(g, bp, 'pb', -0.45 - (sacked ? 1.0 : 0)); }
          else grade(g, bp, 'pb', 0.08);
          for (const h of a.blockers.slice(1)) grade(g, h.p, 'pb', beat ? -0.15 : 0.08);
        } else if (a.missed && pressers.has(a.e)) {
          // missed pickup: blame lands on the back/lineman who had him
        }
      }
      // spare linemen who had nobody still get a (winning) rep
      for (const e of off) if (OL_SLOTS.includes(e.slot) && !res.prot.rushers.some(a => a.blockers.includes(e))) grade(g, e.p, 'pb', 0.05);
      // coverage
      for (const e of res.prot.droppers) {
        avInc(g, e.p, 'covSnaps');
        if (res.def === e && res.target && !res.batted && !res.uncatch) {
          avInc(g, e.p, 'tgtA'); avInc(g, e.p, 'cmpA', comp); avInc(g, e.p, 'ydsA', comp ? yds : 0); if (comp && td) avInc(g, e.p, 'tdA');
          if (res.kind === 'int' && res.intBy === e) avInc(g, e.p, 'intA');
          if (res.pbu === e || (res.kind === 'int' && res.intBy === e)) avInc(g, e.p, 'fInc');
          if (comp) { avInc(g, e.p, 'yacA', Math.min(res.yac || 0, yds)); if (yds >= 20) avInc(g, e.p, 'explA'); }
          const c = res.kind === 'int' && res.intBy === e ? 1.5 : comp ? -(0.3 + yds / 15) - (td ? 0.6 : 0) : res.pbu === e ? 0.8 : 0.35;
          grade(g, e.p, 'cov', c);
        } else {
          const mine = (res.routes || []).find(r => r.def === e);
          grade(g, e.p, 'cov', mine ? (mine.w < -0.3 ? 0.1 : mine.w > 1.1 ? -0.25 : 0.02) : 0.02);
        }
      }
    }
  }
  // ---- runs (designed) and ball carriers ----
  const carrier = res.kind === 'run' || res.kind === 'scramble' ? res.carrier : res.kind === 'comp' ? res.target : null;
  if (res.kind === 'run' || (res.kind === 'scramble')) {
    const cp = res.carrier.p, ybc = Math.min(res.ybc !== undefined ? res.ybc : yds, yds);
    avInc(g, cp, 'rush'); avInc(g, cp, 'ybc', ybc); avInc(g, cp, 'yaco', yds - ybc); avInc(g, cp, 'epaRush', epa);
    if (yds <= 0) avInc(g, cp, 'stuff'); if (yds >= 10) avInc(g, cp, 'explR'); if (success) avInc(g, cp, 'succR');
    avInc(g, cp, 'rushY', yds); if (yds >= 15) avInc(g, cp, 'brkY', yds);
    if (res.xYds !== undefined) { avInc(g, cp, 'xRushN'); avInc(g, cp, 'xRush', res.xYds); avInc(g, cp, 'xRushY', yds); }
    if (res.box !== undefined) { avInc(g, cp, 'boxN'); if (res.box > res.hats) avInc(g, cp, 'box8'); } // more men in the box than there are blockers for
    if (before.togo <= 2 && (before.down >= 3 || before.ydl >= 98)) { avInc(g, cp, 'syN'); if (conv) avInc(g, cp, 'syCv'); }
    grade(g, cp, 'run', clamp(epa * 0.3, -1, 1) + (yds - ybc - 1.6) * 0.15 + (res.missed || []).length * 0.45 - (res.fumble ? 1.5 : 0));
  }
  if (carrier && res.missed) {
    if (res.kind === 'comp') { avInc(g, carrier.p, 'mtfRec', res.missed.length); avInc(g, carrier.p, 'recs'); }
    avInc(g, carrier.p, 'mtf', res.missed.length);
    for (const m of res.missed) { avInc(g, m.p, 'mt'); avInc(g, m.p, 'tkAtt'); grade(g, m.p, 'tk', -0.7); } // a miss is an attempt whether or not anyone got him down in the end
  }
  if (res.tackler && carrier) {
    avInc(g, res.tackler.p, 'tkAtt');
    if (res.kind === 'run') { avInc(g, res.tackler.p, 'tkRunN'); avInc(g, res.tackler.p, 'tkRunY', Math.max(-5, yds)); } // how far downfield his tackles on runs are made
    grade(g, res.tackler.p, 'tk', 0.15);
    if (!success) { avInc(g, res.tackler.p, 'stops'); grade(g, res.tackler.p, oc.isRun ? 'rd' : 'cov', 0.25); }
  }
  if (res.blk) {
    for (const r of res.blk) {
      if (r.won === undefined) continue; // backside / uncontested: not charted
      const won = r.won;
      avInc(g, r.e.p, 'rdSnaps'); if (won) avInc(g, r.e.p, 'rdWins');
      grade(g, r.e.p, 'rd', won ? (r.penetrated ? 0.75 : 0.42) : r.state === 'free' ? 0 : -0.08);
      for (const b of r.blockers) {
        if (!b || !b.p) continue;
        avInc(g, b.p, 'rbSnaps'); if (!won) avInc(g, b.p, 'rbWins'); if (won && r.penetrated) avInc(g, b.p, 'blown');
        if (res.poa !== undefined && Math.abs(r.px - res.poa) <= 1.6) { avInc(g, b.p, 'gapRuns'); avInc(g, b.p, 'gapYbc', Math.min(res.ybc !== undefined ? res.ybc : yds, yds)); } // the runs that came through his gap
        grade(g, b.p, 'rb', won ? (r.penetrated ? -0.85 : -0.45) : 0.13);
      }
    }
  }
}

// ---------- derived metrics (for display) ----------
// grade for one facet from summed credits; regresses small samples toward an average 60
// league-average credit per snap (base) and spread (scale) per facet, measured from simulated seasons,
// so an average starter grades ~62 and the season spread is ~10 points
const GRADE_BASE = { q: 0.015, rec: -0.012, run: 0.165, pb: 0.022, rb: -0.074, pr: 0.03, rd: 0.153, cov: -0.03, tk: 0.022 };
const GRADE_SCALE = { q: 0.2, rec: 0.17, run: 0.32, pb: 0.094, rb: 0.104, pr: 0.118, rd: 0.14, cov: 0.157, tk: 0.2 };
function facetGrade(a, f, minN) {
  const n = a['n' + f] || 0;
  if (!n || n < (minN || 1)) return null;
  const b = f.split('_')[0];
  const avgC = ((a['g' + f] || 0) + GRADE_BASE[b] * 6) / (n + 6); // small samples regress to average
  return clamp(Math.round(62 + 40 * Math.tanh((avgC - GRADE_BASE[b]) / (GRADE_SCALE[b] * 0.9))), 25, 99);
}
// which facets make up a player's overall grade
function gradeFacets(spot) {
  if (spot === 'QB') return { q: 1 };
  if (spot === 'RB') return { run: 0.65, rec: 0.25, pb: 0.1 };
  if (spot === 'FB') return { rb: 0.6, run: 0.2, rec: 0.2 };
  if (['WRX', 'WRZ', 'SLOT'].includes(spot)) return { rec: 0.9, rb: 0.1 };
  if (spot === 'TEY' || spot === 'TEH') return { rec: 0.55, rb: 0.3, pb: 0.15 };
  if (['LT', 'LG', 'C', 'RG', 'RT'].includes(spot)) return { pb: 0.55, rb: 0.45 };
  if (['NT', 'DT', 'DE', 'EDGE'].includes(spot)) return { pr: 0.5, rd: 0.4, tk: 0.1 };
  if (spot === 'MLB' || spot === 'WLB') return { rd: 0.4, cov: 0.4, tk: 0.1, pr: 0.1 };
  if (['CB', 'NCB', 'FS', 'SS'].includes(spot)) return { cov: 0.75, rd: 0.1, tk: 0.15 };
  return {};
}
function overallGrade(a, spot) {
  if (!a) return null;
  let s = 0, w = 0;
  for (const [f, wt] of Object.entries(gradeFacets(spot))) {
    const gr = facetGrade(a, f);
    if (gr === null) continue;
    const vol = Math.min(1, (a['n' + f] || 0) / 15); // facets with real volume count fully
    s += gr * wt * vol; w += wt * vol;
  }
  return w ? Math.round(s / w) : null;
}
function addAdv(into, a) { for (const k in a) if (k !== 'tid') into[k] = (into[k] || 0) + a[k]; }
const r1 = x => Math.round(x * 10) / 10, r2 = x => (Math.round(x * 100) / 100).toFixed(2), pctM = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
function ratingAllowed(a) { return a.tgtA ? r1(passerRating(a.cmpA || 0, a.tgtA, a.ydsA || 0, a.tdA || 0, a.intA || 0)) : null; }
// Next-gen style lines by role: [label, value, hint]
function advMetrics(a, spot) {
  if (!a) return [];
  const m = [];
  const add = (l, v, h) => m.push([l, v, h || '']);
  if (spot === 'QB') {
    add('EPA/dropback', a.db ? r2((a.epaDb || 0) / a.db) : '—', 'expected points added per dropback');
    add('CPOE', a.att ? (r1(100 * ((a.cmp || 0) - (a.xc || 0)) / a.att) > 0 ? '+' : '') + r1(100 * ((a.cmp || 0) - (a.xc || 0)) / a.att) + '%' : '—', 'completion % over expected');
    add('Time to throw', a.tttN ? (a.ttt / a.tttN).toFixed(2) + 's' : '—');
    add('aDOT', a.att ? r1(a.air / a.att) : '—', 'average depth of target');
    add('Pressured', pctM(a.prsd || 0, a.db), 'share of dropbacks under pressure');
    add('Comp% pressured', pctM(a.prsdCmp || 0, a.prsdAtt));
    add('Deep comp%', pctM(a.deepCmp || 0, a.deepAtt), '20+ air yards');
    add('PA EPA/db', a.paDb ? r2((a.paEpa || 0) / a.paDb) : '—', 'on play-action');
  } else if (['WRX', 'WRZ', 'SLOT', 'TEY', 'TEH'].includes(spot) || (a.routes || 0) > (a.rush || 0)) {
    add('Routes', a.routes || 0);
    add('Separation', a.sepR && a.routes ? r1(a.sepR / a.routes) + ' yds' : a.sepN ? r1(a.sep / a.sepN) + ' yds' : '—', 'on every route he runs, thrown to or not');
    add('Separation when targeted', a.sepN ? r1(a.sep / a.sepN) + ' yds' : '—', 'at the catch point: partly a measure of where his quarterback goes with the ball');
    add('aDOT', a.sepN ? r1(a.adot / a.sepN) : '—');
    add('Tgt / route', pctM(a.sepN || 0, a.routes));
    add('Contested', a.cAtt ? `${a.cWon || 0}/${a.cAtt}` : '—', 'contested catches won');
    add('Missed tkl forced', rateTot(a.mtfRec, a.recs), 'per catch (total)');
    add('EPA/target', a.sepN ? r2((a.epaTgt || 0) / a.sepN) : '—');
  }
  if (spot === 'RB' || spot === 'FB' || (a.rush || 0) >= 5) {
    add('Yds before contact', a.rush ? r1(a.ybc / a.rush) : '—', 'per carry — mostly the blocking');
    add('Yds after contact', a.rush ? r1(a.yaco / a.rush) : '—', 'per carry — mostly the runner');
    add('Missed tkl forced', rateTot(a.mtf, a.rush), 'per carry (total)');
    add('Stuff rate', pctM(a.stuff || 0, a.rush), 'carries for 0 or less');
    add('Explosive rate', pctM(a.explR || 0, a.rush), 'carries of 10+');
    add('Success rate', pctM(a.succR || 0, a.rush));
    add('EPA/rush', a.rush ? r2((a.epaRush || 0) / a.rush) : '—');
  }
  if (['LT', 'LG', 'C', 'RG', 'RT'].includes(spot)) {
    add('Pass block win%', a.pbSnaps ? pctM(a.pbSnaps - (a.pbLoss || 0), a.pbSnaps) : '—', 'held his man past 3.0s');
    add('Pressure% allowed', rateTot(a.prsA, a.pbSnaps, 1), 'of pass-block snaps (total)');
    add('Sack% allowed', rateTot(a.sackA, a.pbSnaps, 1), 'of pass-block snaps (total)');
    add('Run block win%', pctM(a.rbWins || 0, a.rbSnaps));
  }
  if (['NT', 'DT', 'DE', 'EDGE'].includes(spot) || (a.prSnaps || 0) > 30) {
    add('Pass rush win%', pctM(a.prWins || 0, a.prSnaps), 'beat his block within 3.0s');
    add('Double-team rate', pctM(a.dbl || 0, a.prSnaps));
    add('Run stop win%', pctM(a.rdWins || 0, a.rdSnaps));
    add('Stop rate', rateTot(a.stops, a.rdSnaps, 1), 'tackles that end in an offensive failure, per run-defense snap (total)');
  }
  if (['MLB', 'WLB', 'CB', 'NCB', 'FS', 'SS'].includes(spot)) {
    add('Targeted', rateTot(a.tgtA, a.covSnaps, 1), 'of coverage snaps (total)');
    add('Comp% allowed', pctM(a.cmpA || 0, a.tgtA));
    add('Yds/cov snap', a.covSnaps ? r1((a.ydsA || 0) / a.covSnaps * 100) / 100 : '—');
    add('Rating allowed', ratingAllowed(a) ?? '—');
    add('Missed tackle%', rateTot(a.mt, a.tkAtt), 'of tackle attempts (total)');
    add('Stop rate', rateTot(a.stops, a.tkAtt), 'share of his tackles that end in an offensive failure (total)');
  }
  return m;
}

// volume stats read as a rate with the raw total alongside: "18% (24)"
function rateTot(n, d, dec) { n = n || 0; return d ? `${(100 * n / d).toFixed(dec || 0)}% (${n})` : n ? `— (${n})` : '—'; }
// where every qualified player's season grade ranks within his position group: { pid: [rank, of] }
const GRADE_RANK_GROUP = { QB: 'QB', RB: 'RB', FB: 'FB', WRX: 'WR', WRZ: 'WR', SLOT: 'WR', TEY: 'TE', TEH: 'TE', LT: 'OT', RT: 'OT', LG: 'IOL', C: 'IOL', RG: 'IOL',
  NT: 'IDL', DT: 'IDL', DE: 'IDL', EDGE: 'EDGE', MLB: 'LB', WLB: 'LB', CB: 'CB', NCB: 'CB', FS: 'S', SS: 'S' };
let GRADE_RANKS = null, GRADE_RANKS_KEY = '';
function gradeRanks() {
  const key = state.season + ':' + state.week + ':' + state.phase;
  if (GRADE_RANKS && GRADE_RANKS_KEY === key) return GRADE_RANKS;
  let games = 1; const by = {};
  for (const id in state.players) { const gp = state.players[id].stats.gp || 0; if (gp > games) games = gp; }
  for (const id in state.players) {
    const p = state.players[id], grp = GRADE_RANK_GROUP[p.spot];
    if (!grp || !p.advS || (p.stats.snp || 0) < games * (grp === 'FB' ? 6 : 15)) continue; // about a quarter of the snaps
    const g = overallGrade(p.advS, p.spot);
    if (g !== null) (by[grp] = by[grp] || []).push([p.id, g]);
  }
  const out = {};
  for (const grp in by) { const l = by[grp].sort((a, b) => b[1] - a[1]); l.forEach(([id, g], i) => { const first = l.findIndex(x => x[1] === g); out[id] = [first + 1, l.length, grp]; }); }
  GRADE_RANKS = out; GRADE_RANKS_KEY = key;
  return out;
}

// compact season record for career history: grades plus the raw sums the role's key metrics need
const CAREER_ADV_KEYS = ['recs', 'mtfRec', 'db', 'epaDb', 'att', 'cmp', 'xc', 'air', 'ttt', 'tttN', 'prsd', 'routes', 'sep', 'sepN', 'sepR', 'chip', 'adot', 'rush', 'ybc', 'yaco', 'mtf', 'stuff', 'explR',
  'pbSnaps', 'pbLoss', 'prsA', 'sackA', 'rbSnaps', 'rbWins', 'prSnaps', 'prWins', 'rdSnaps', 'rdWins', 'stops', 'tgtA', 'cmpA', 'ydsA', 'tdA', 'intA', 'covSnaps', 'mt', 'tkAtt'];
function careerAdv(a, spot) {
  const out = { g: overallGrade(a, spot) };
  for (const f in FACETS) { const gr = facetGrade(a, f); if (gr !== null && (a['n' + f] || 0) >= 25) out['g' + f] = gr; }
  for (const k of CAREER_ADV_KEYS) if (a[k]) out[k] = Math.round(a[k] * 100) / 100;
  return out;
}

// =====================================================================
//  The numbers a player is read by. One table: every metric, what question it answers, which way is good, and how much of a
//  sample it needs. a: the season's charted sums · s: his box score line. A metric with nothing to divide by is null.
//  sec: sit (him or his situation) · prod (production) · role · style · fin (does he finish) · cost · clutch
//  dir: 1 higher is better, -1 lower is better, 0 a description, not a judgment · fam: metrics that tell the same story
// =====================================================================
const AD = (n, d) => d ? (n || 0) / d : null, AP = (n, d) => d ? 100 * (n || 0) / d : null;
const ADV_SEC = { prod: 'Production', sit: 'Him or his situation', role: 'His role', style: 'What kind of player', fin: 'Does he finish', cost: 'What he costs you', clutch: 'When it matters' };
const ADV_DEF = {
  // ---- quarterback ----
  q_epa: ['EPA per dropback', 'prod', 1, 2, '', 'eff', a => AD(a.epaDb, a.db), a => a.db, 60],
  q_succ: ['Success rate', 'prod', 1, 1, '%', 'eff', a => AP(a.succDb, a.db), a => a.db, 60],
  q_anya: ['Adjusted net yards per attempt', 'prod', 1, 2, '', 'eff', (a, s) => s && (s.passA || 0) + (a.skd || 0) ? ((s.passY || 0) + 20 * (s.passTD || 0) - 45 * (s.passInt || 0) - (a.skY || 0)) / ((s.passA || 0) + (a.skd || 0)) : null, a => a.db, 60],
  q_cpoe: ['Completion % over expected', 'sit', 1, 1, '', 'acc', a => a.att ? 100 * ((a.cmp || 0) - (a.xcq !== undefined ? a.xcq : a.xc || 0)) / a.att : null, a => a.att, 60],
  q_cln: ['EPA from a clean pocket', 'sit', 1, 2, '', 'eff', a => AD(a.clnEpa, a.clnDb), a => a.clnDb, 50],
  q_clnc: ['Completion %, clean pocket', 'sit', 1, 1, '%', 'acc', a => AP(a.clnCmp, a.clnAtt), a => a.clnAtt, 50],
  q_prsc: ['Completion %, under pressure', 'sit', 1, 1, '%', 'prs', a => AP(a.prsdCmp, a.prsdAtt), a => a.prsdAtt, 25],
  q_prsd: ['Pressured', 'sit', 0, 1, '%', 'prsd', a => AP(a.prsd, a.db), a => a.db, 60],
  q_yacs: ['Share of yards after the catch', 'sit', 0, 0, '%', 'yacs', a => AP(a.pyac, a.pyds), a => a.att, 60],
  q_adot: ['Depth of target', 'style', 0, 1, '', 'adot', a => AD(a.air, a.att), a => a.att, 60],
  q_ttt: ['Time to throw', 'style', 0, 2, 's', 'ttt', a => AD(a.ttt, a.tttN), a => a.tttN, 60],
  q_ay3: ['Air yards to the sticks, 3rd down', 'style', 0, 1, '', 'ay3', a => AD(a.ay3, a.ay3N), a => a.ay3N, 20],
  q_agg: ['Throws into tight windows', 'style', 0, 1, '%', 'agg', a => AP(a.aggN, a.att), a => a.att, 60],
  q_scr: ['Scramble rate', 'style', 0, 1, '%', 'scr', a => AP(a.scr, a.db), a => a.db, 60],
  q_deep: ['Deep completion %', 'fin', 1, 0, '%', 'deep', a => AP(a.deepCmp, a.deepAtt), a => a.deepAtt, 15],
  q_btt: ['Big-time throws', 'fin', 1, 1, '%', 'deep', a => AP(a.btt, a.att), a => a.att, 60],
  q_p2s: ['Pressure turned into sacks', 'fin', -1, 0, '%', 'sack', a => AP(a.skd, a.prsd), a => a.prsd, 25],
  q_twp: ['Turnover-worthy throws', 'cost', -1, 1, '%', 'risk', a => AP(a.twp, a.att), a => a.att, 60],
  q_d3: ['Third and fourth down conversions', 'clutch', 1, 0, '%', 'd3', a => AP(a.d3Cv, a.d3Db), a => a.d3Db, 25],
  q_rz: ['EPA in the red zone', 'clutch', 1, 2, '', 'rz', a => AD(a.rzEpa, a.rzDb), a => a.rzDb, 20],
  q_m2: ['EPA in the two-minute drill', 'clutch', 1, 2, '', 'm2', a => AD(a.m2Epa, a.m2Db), a => a.m2Db, 20],
  q_pa: ['EPA on play-action', 'clutch', 1, 2, '', 'pa', a => AD(a.paEpa, a.paDb), a => a.paDb, 25],
  // ---- ball carriers ----
  r_ryoe: ['Rushing yards over expected', 'sit', 1, 2, '', 'run', a => a.xRushN ? ((a.xRushY || 0) - (a.xRush || 0)) / a.xRushN : null, a => a.xRushN, 25],
  r_ybc: ['Yards before contact', 'sit', 0, 2, '', 'ybc', a => AD(a.ybc, a.rush), a => a.rush, 25],
  r_box: ['Runs into a loaded box', 'sit', 0, 0, '%', 'box', a => AP(a.box8, a.boxN), a => a.boxN, 25],
  r_yaco: ['Yards after contact', 'prod', 1, 2, '', 'run', a => AD(a.yaco, a.rush), a => a.rush, 25],
  r_mtf: ['Missed tackles forced', 'prod', 1, 0, '%', 'elu', a => AP(a.mtf, a.rush), a => a.rush, 25],
  r_succ: ['Success rate', 'prod', 1, 0, '%', 'run', a => AP(a.succR, a.rush), a => a.rush, 25],
  r_epa: ['EPA per carry', 'prod', 1, 2, '', 'run', a => AD(a.epaRush, a.rush), a => a.rush, 25],
  r_expl: ['Explosive runs (10+)', 'fin', 1, 0, '%', 'boom', a => AP(a.explR, a.rush), a => a.rush, 25],
  r_brk: ['Share of yards on breakaways (15+)', 'style', 0, 0, '%', 'brk', a => (a.rushY || 0) > 0 ? 100 * (a.brkY || 0) / a.rushY : null, a => a.rush, 40],
  r_stuff: ['Stuffed', 'cost', -1, 0, '%', 'bust', a => AP(a.stuff, a.rush), a => a.rush, 25],
  r_sy: ['Short-yardage conversions', 'clutch', 1, 0, '%', 'sy', a => AP(a.syCv, a.syN), a => a.syN, 8],
  r_fum: ['Fumbles per 100 touches', 'cost', -1, 1, '', 'fum', (a, s) => s && (a.rush || 0) + (a.cmpT || 0) ? 100 * (s.fum || 0) / ((a.rush || 0) + (a.cmpT || 0)) : null, a => (a.rush || 0) + (a.cmpT || 0), 60],
  r_pbw: ['Pass-block win rate', 'fin', 1, 0, '%', 'pb', a => a.pbRep ? 100 - 100 * (a.pbRepL || 0) / a.pbRep : null, a => a.pbRep, 8],
  // ---- anyone who runs routes ----
  c_yprr: ['Yards per route', 'prod', 1, 2, '', 'prod', a => AD(a.tYds, a.routes), a => a.routes, 60],
  c_fdr: ['First downs per route', 'prod', 1, 1, '%', 'prod', a => AP(a.fdRec, a.routes), a => a.routes, 60],
  c_epa: ['EPA per target', 'prod', 1, 2, '', 'prod', a => AD(a.epaTgt, a.sepN), a => a.sepN, 20],
  c_rtg: ['Passer rating when targeted', 'prod', 1, 1, '', 'prod', a => a.sepN ? passerRating(a.cmpT || 0, a.sepN, a.tYds || 0, a.tTd || 0, a.tInt || 0) : null, a => a.sepN, 20],
  c_sepx: ['Separation created (over an ordinary receiver)', 'sit', 1, 2, ' yd', 'sepx', a => AD(a.sxR, a.routes), a => a.routes, 60],
  c_open: ['Open on his routes', 'sit', 0, 0, '%', 'sep', a => AP(a.openN, a.routes), a => a.routes, 60],
  c_wide: ['Wide open', 'sit', 0, 1, '%', 'sep', a => AP(a.wideN, a.routes), a => a.routes, 60],
  c_sep: ['Separation, every route', 'sit', 0, 2, ' yd', 'sep', a => AD(a.sepR, a.routes), a => a.routes, 60],
  c_cpoe: ['Catch % over expected', 'sit', 1, 1, '', 'hands', a => a.sepN ? 100 * ((a.cmpT || 0) - (a.xcr || 0)) / a.sepN : null, a => a.sepN, 20],
  c_yacoe: ['Yards after catch over expected', 'sit', 1, 2, '', 'yac', a => a.yacN ? ((a.yacT || 0) - (a.xyac || 0)) / a.yacN : null, a => a.yacN, 15],
  c_man: ['Yards per route against man', 'sit', 1, 2, '', 'prod', a => AD(a.ydM, a.rtM), a => a.rtM, 40],
  c_zone: ['Yards per route against zone', 'sit', 1, 2, '', 'prod', a => AD(a.ydZ, a.rtZ), a => a.rtZ, 40],
  c_tsh: ['Target share', 'role', 0, 0, '%', 'vol', a => AP(a.sepN, a.tmTgt), a => a.tmTgt, 60],
  c_ash: ['Air yards share', 'role', 0, 0, '%', 'air', a => AP(a.airT, a.tmAir), a => a.tmTgt, 60],
  c_tpr: ['Targets per route', 'role', 1, 0, '%', 'vol', a => AP(a.sepN, a.routes), a => a.routes, 60],
  c_rp: ['Route participation', 'role', 0, 0, '%', 'rp', a => AP(a.routes, a.pSnp), a => a.pSnp, 60],
  c_slot: ['Lined up in the slot', 'role', 0, 0, '%', 'al', a => AP(a.alS, a.oSnp), a => a.oSnp, 100],
  c_inl: ['Lined up in-line', 'role', 0, 0, '%', 'al', a => AP(a.alI, a.oSnp), a => a.oSnp, 100],
  c_adot: ['Depth of target', 'style', 0, 1, '', 'adot', a => AD(a.adot, a.sepN), a => a.sepN, 20],
  c_ctd: ['Contested catches won', 'fin', 1, 0, '%', 'ctd', a => AP(a.cWon, a.cAtt), a => a.cAtt, 8],
  c_mtf: ['Missed tackles forced per catch', 'fin', 1, 0, '%', 'yac', a => AP(a.mtfRec, a.recs), a => a.recs, 15],
  c_drop: ['Drop rate', 'cost', -1, 1, '%', 'hands', a => (a.cmpT || 0) + (a.drpT || 0) ? 100 * (a.drpT || 0) / ((a.cmpT || 0) + (a.drpT || 0)) : null, a => (a.cmpT || 0) + (a.drpT || 0), 20],
  c_rbw: ['Run-block win rate', 'prod', 1, 1, '%', 'rb', a => AP(a.rbWins, a.rbSnaps), a => a.rbSnaps, 40],
  // ---- blockers ----
  o_pbw: ['Pass-block win rate', 'prod', 1, 1, '%', 'pb', a => a.pbSnaps ? 100 - 100 * (a.pbLoss || 0) / a.pbSnaps : null, a => a.pbSnaps, 80],
  o_rbw: ['Run-block win rate', 'prod', 1, 1, '%', 'rb', a => AP(a.rbWins, a.rbSnaps), a => a.rbSnaps, 60],
  o_prs: ['Pressure allowed', 'cost', -1, 1, '%', 'pb', a => AP(a.prsA, a.pbSnaps), a => a.pbSnaps, 80],
  o_sack: ['Sacks allowed per 100 pass blocks', 'cost', -1, 2, '', 'pb', a => AP(a.sackA, a.pbSnaps), a => a.pbSnaps, 80],
  o_tps: ['Win rate in true pass sets', 'sit', 1, 1, '%', 'pb', a => a.tpsSnaps ? 100 - 100 * (a.tpsLoss || 0) / a.tpsSnaps : null, a => a.tpsSnaps, 50],
  o_pbx: ['Win rate against blitzes and stunts', 'sit', 1, 1, '%', 'stunt', a => a.pbxRep ? 100 - 100 * (a.pbxL || 0) / a.pbxRep : null, a => a.pbxRep, 25],
  o_gap: ['Yards before contact through his gap', 'sit', 1, 2, '', 'rb', a => AD(a.gapYbc, a.gapRuns), a => a.gapRuns, 30],
  o_dbl: ['Share of reps in a double team', 'role', 0, 0, '%', 'dbl', a => AP(a.dblRep, a.pbRep), a => a.pbRep, 60],
  o_tpa: ['Time before he is beaten', 'fin', 1, 2, 's', 'tpa', a => AD(a.tpaT, a.tpaN), a => a.tpaN, 8],
  o_blown: ['Blown blocks per 100 snaps', 'cost', -1, 2, '', 'blown', a => (a.pbRep || 0) + (a.rbSnaps || 0) ? 100 * (a.blown || 0) / ((a.pbRep || 0) + (a.rbSnaps || 0)) : null, a => (a.pbRep || 0) + (a.rbSnaps || 0), 120],
  o_pen: ['Penalties per 100 snaps', 'cost', -1, 2, '', 'pen', (a, s) => s && s.snp ? 100 * (s.pen || 0) / s.snp : null, (a, s) => s ? s.snp : 0, 200],
  // ---- rushers and run defenders ----
  d_prw: ['Pass-rush win rate', 'prod', 1, 1, '%', 'rush', a => AP(a.prWins, a.prSnaps), a => a.prSnaps, 60],
  d_prs: ['Pressure rate', 'prod', 1, 1, '%', 'rush', a => AP(a.prsR, a.prSnaps), a => a.prSnaps, 60],
  d_tps: ['Win rate in true pass sets', 'sit', 1, 1, '%', 'rush', a => AP(a.tpsRW, a.tpsR), a => a.tpsR, 40],
  d_dbl: ['Double-teamed', 'sit', 0, 0, '%', 'dbl', a => AP(a.dbl, a.prSnaps), a => a.prSnaps, 60],
  d_rsw: ['Run-defense win rate', 'prod', 1, 1, '%', 'run', a => AP(a.rdWins, a.rdSnaps), a => a.rdSnaps, 40],
  d_stop: ['Run stops per run snap', 'prod', 1, 1, '%', 'run', a => AP(a.stops, a.rdSnaps), a => a.rdSnaps, 40],
  d_p2s: ['Pressures turned into sacks', 'fin', 0, 0, '%', 'fin', (a, s) => s && a.prsR ? 100 * (s.sck || 0) / a.prsR : null, a => a.prsR, 10],
  d_ttp: ['Time to pressure', 'fin', -1, 2, 's', 'ttp', a => AD(a.ttpT, a.ttpN), a => a.ttpN, 10],
  d_dep: ['Depth of his tackles against the run', 'fin', -1, 1, ' yd', 'dep', a => AD(a.tkRunY, a.tkRunN), a => a.tkRunN, 10],
  d_mt: ['Missed tackles', 'cost', -1, 0, '%', 'tk', a => AP(a.mt, a.tkAtt), a => a.tkAtt, 15],
  // ---- coverage ----
  v_ypcs: ['Yards per coverage snap', 'prod', -1, 2, '', 'cov', a => AD(a.ydsA, a.covSnaps), a => a.covSnaps, 80],
  v_rtg: ['Passer rating allowed', 'prod', -1, 1, '', 'cov', a => a.tgtA ? ratingAllowed(a) : null, a => a.tgtA, 20],
  v_cmp: ['Completion % allowed', 'prod', -1, 0, '%', 'cov', a => AP(a.cmpA, a.tgtA), a => a.tgtA, 20],
  v_sepx: ['Separation taken away (over an ordinary defender)', 'sit', 1, 2, ' yd', 'sticky', a => AD(a.dxR, a.covR), a => a.covR, 60],
  v_cw: ['Routes blanketed', 'sit', 1, 0, '%', 'sticky', a => AP(a.cwN, a.covR), a => a.covR, 60],
  v_open: ['Routes left open', 'sit', -1, 0, '%', 'sticky', a => AP(a.openA, a.covR), a => a.covR, 60],
  v_sep: ['Separation allowed, every route', 'sit', -1, 2, ' yd', 'sticky', a => AD(a.sepA, a.covR), a => a.covR, 60],
  v_tgt: ['Targeted', 'role', 0, 1, '%', 'tgt', a => AP(a.tgtA, a.covSnaps), a => a.covSnaps, 80],
  v_box: ['Lined up in the box', 'role', 0, 0, '%', 'al', a => AP(a.alBox, a.dSnp), a => a.dSnp, 100],
  v_deep: ['Lined up deep', 'role', 0, 0, '%', 'al', a => AP(a.alDeep, a.dSnp), a => a.dSnp, 100],
  v_finc: ['Forced incompletions', 'fin', 1, 0, '%', 'ball', a => AP(a.fInc, a.tgtA), a => a.tgtA, 20],
  v_ball: ['Ball production per target', 'fin', 1, 0, '%', 'ball', (a, s) => s && a.tgtA ? 100 * ((s.pd || 0) + 0) / a.tgtA : null, a => a.tgtA, 20],
  v_yac: ['Yards after the catch allowed', 'fin', -1, 1, '', 'yac', a => AD(a.yacA, a.cmpA), a => a.cmpA, 12],
  v_expl: ['Explosive plays allowed per 100 coverage snaps', 'cost', -1, 1, '', 'big', a => AP(a.explA, a.covSnaps), a => a.covSnaps, 80],
  v_mt: ['Missed tackles', 'cost', -1, 0, '%', 'tk', a => AP(a.mt, a.tkAtt), a => a.tkAtt, 15],
  v_stop: ['Stops, share of his tackles', 'prod', 1, 0, '%', 'run', a => AP(a.stops, a.tkAtt), a => a.tkAtt, 15],
  v_dep: ['Depth of his tackles against the run', 'fin', -1, 1, ' yd', 'dep', a => AD(a.tkRunY, a.tkRunN), a => a.tkRunN, 10],
  v_blz: ['Pressure rate when he blitzes', 'fin', 1, 0, '%', 'blz', a => AP(a.blzP, a.blzN), a => a.blzN, 15],
};
const ADV_RECV = ['c_yprr', 'c_fdr', 'c_epa', 'c_rtg', 'c_sepx', 'c_open', 'c_wide', 'c_sep', 'c_cpoe', 'c_yacoe', 'c_man', 'c_zone', 'c_tsh', 'c_ash', 'c_tpr', 'c_rp', 'c_slot', 'c_adot', 'c_ctd', 'c_mtf', 'c_drop'];
const ADV_COVER = ['v_ypcs', 'v_rtg', 'v_cmp', 'v_sepx', 'v_cw', 'v_open', 'v_sep', 'v_tgt', 'v_finc', 'v_ball', 'v_yac', 'v_expl', 'v_mt'];
// what each position is read by, and what makes a man count as having played enough of it ([sum he needs, how much of it over a full season])
const ADV_POS = {
  QB: { ids: ['q_epa', 'q_succ', 'q_anya', 'q_cpoe', 'q_cln', 'q_clnc', 'q_prsc', 'q_prsd', 'q_yacs', 'q_adot', 'q_ttt', 'q_ay3', 'q_agg', 'q_scr', 'q_deep', 'q_btt', 'q_p2s', 'q_twp', 'q_d3', 'q_rz', 'q_m2', 'q_pa'], q: [a => a.db, 150] },
  RB: { ids: ['r_ryoe', 'r_ybc', 'r_box', 'r_yaco', 'r_mtf', 'r_succ', 'r_epa', 'r_expl', 'r_brk', 'r_stuff', 'r_sy', 'r_fum', 'c_yprr', 'c_tsh', 'c_rp', 'c_yacoe'], q: [a => a.rush, 60] },
  FB: { ids: ['c_rbw', 'r_pbw', 'r_yaco', 'r_sy', 'c_yprr', 'c_rp'], q: [a => (a.rbSnaps || 0) + (a.rush || 0), 40] },
  WR: { ids: ADV_RECV, q: [a => a.routes, 150] },
  TE: { ids: ADV_RECV.filter(k => k !== 'c_slot').concat(['c_inl', 'c_rbw', 'r_pbw']), q: [a => a.routes, 100] },
  OT: { ids: ['o_pbw', 'o_rbw', 'o_prs', 'o_sack', 'o_tps', 'o_pbx', 'o_gap', 'o_dbl', 'o_blown', 'o_pen'], q: [a => a.pbSnaps, 200] },
  IOL: { ids: ['o_pbw', 'o_rbw', 'o_prs', 'o_sack', 'o_tps', 'o_pbx', 'o_gap', 'o_dbl', 'o_blown', 'o_pen'], q: [a => a.pbSnaps, 200] },
  IDL: { ids: ['d_prw', 'd_prs', 'd_tps', 'd_dbl', 'd_rsw', 'd_stop', 'd_p2s', 'd_ttp', 'd_dep'], q: [a => a.prSnaps, 150] },
  EDGE: { ids: ['d_prw', 'd_prs', 'd_tps', 'd_dbl', 'd_rsw', 'd_stop', 'd_p2s', 'd_ttp', 'd_dep'], q: [a => a.prSnaps, 150] },
  LB: { ids: ADV_COVER.filter(k => !['v_finc', 'v_ball', 'v_expl', 'v_mt'].includes(k)).concat(['v_stop', 'v_dep', 'v_blz', 'd_rsw', 'v_box']), q: [a => a.covSnaps, 200] },
  CB: { ids: ADV_COVER, q: [a => a.covSnaps, 200] },
  S: { ids: ADV_COVER.concat(['v_stop', 'v_blz', 'v_box', 'v_deep']), q: [a => a.covSnaps, 200] },
};
function advGroupOf(p) { return GRADE_RANK_GROUP[p.spot] || null; }
function advValue(id, a, s) { const D = ADV_DEF[id]; if (!D || !a) return null; const v = D[6](a, s || {}); return v === null || v === undefined || !isFinite(v) ? null : v; }
function advEnough(id, a, s, k) { const D = ADV_DEF[id]; return (D[7](a, s || {}) || 0) >= D[8] * (k === undefined ? 1 : k); }
function advQualified(grp, a, k) { const G = ADV_POS[grp]; return !!(G && a && (G.q[0](a) || 0) >= G.q[1] * (k === undefined ? 1 : k)); }
function advFmt(id, v) { const D = ADV_DEF[id]; if (v === null || v === undefined) return '—'; const t = Math.abs(v).toFixed(D[3]); return (v < 0 && +t !== 0 ? '−' : '') + t + (D[4] || ''); }
// his whole sheet against the men who played enough at his position: pool is [[a, s], ...]. z is in the direction that is good for him.
function advSheet(grp, a, s, pool, k) {
  const G = ADV_POS[grp]; if (!G || !a) return [];
  return G.ids.map(id => {
    const D = ADV_DEF[id], v = advValue(id, a, s), ok = v !== null && advEnough(id, a, s, k);
    const vals = []; for (const [pa, ps] of pool) { if (!advEnough(id, pa, ps, k)) continue; const pv = advValue(id, pa, ps); if (pv !== null) vals.push(pv); }
    let z = null, pct = null, rank = null;
    if (v !== null && vals.length >= 8) {
      const m = vals.reduce((x, y) => x + y, 0) / vals.length, sd = Math.sqrt(vals.reduce((x, y) => x + (y - m) * (y - m), 0) / vals.length);
      z = sd > 1e-9 ? clamp((v - m) / sd, -4, 4) * (D[2] < 0 ? -1 : 1) : 0;
      const below = vals.filter(x => x < v).length, raw = below / vals.length; pct = D[2] < 0 ? 1 - raw : raw;
      rank = 1 + (D[2] < 0 ? below : vals.filter(x => x > v).length);
    }
    return { id, label: D[0], sec: D[1], dir: D[2], fam: D[5], v, ok, z, pct, rank, n: vals.length };
  });
}
// the four that say most about him: furthest from an ordinary man at his position, good or bad, one from each story.
// trust: how much of each metric is the player and how much is luck (measured by the stats audit); a noisy number has to be further out to make the cut
// (how well a full season of it repeats: from the odd and even weeks of ten simulated seasons)
const ADV_TRUST = {QB:{q_epa:0.86,q_succ:0.83,q_anya:0.86,q_cpoe:0.49,q_cln:0.69,q_clnc:0.61,q_prsc:0.48,q_prsd:0.9,q_yacs:0.55,q_adot:0.88,q_ttt:0.91,q_ay3:0.51,q_agg:0.78,q_scr:0.84,q_deep:0.55,q_btt:0.68,q_p2s:0.45,q_twp:0.72,q_d3:0.66,q_rz:0.29,q_m2:0.57,q_pa:0.62},RB:{r_ryoe:0.43,r_ybc:0.36,r_box:0.75,r_yaco:0.52,r_mtf:0.44,r_succ:0.59,r_epa:0.54,r_expl:0.33,r_brk:0.31,r_stuff:0.49,r_sy:0.14,r_fum:0.03,c_yprr:0.41,c_tsh:0.49,c_rp:0.82,c_yacoe:0.23,c_drop:0.11,r_pbw:0.13},WR:{c_yprr:0.76,c_fdr:0.77,c_epa:0.47,c_rtg:0.49,c_sepx:0.97,c_open:0.82,c_wide:0.76,c_sep:0.89,c_cpoe:0.43,c_yacoe:0.18,c_man:0.67,c_zone:0.71,c_tsh:0.79,c_ash:0.75,c_tpr:0.79,c_rp:0.89,c_slot:1,c_adot:0.87,c_ctd:0.29,c_mtf:0.39,c_drop:0.15},TE:{c_yprr:0.66,c_fdr:0.66,c_epa:0.44,c_rtg:0.44,c_sepx:0.97,c_open:0.73,c_wide:0.65,c_sep:0.79,c_cpoe:0.22,c_yacoe:0.16,c_man:0.59,c_zone:0.5,c_tsh:0.7,c_ash:0.74,c_tpr:0.71,c_rp:0.91,c_adot:0.77,c_ctd:0.16,c_mtf:0.18,c_drop:0,c_inl:0.98,c_rbw:0.65,r_pbw:0.21},OT:{o_pbw:0.69,o_rbw:0.66,o_prs:0.67,o_sack:0.48,o_tps:0.46,o_pbx:0.16,o_gap:0.36,o_dbl:0.91,o_blown:0.49,o_pen:0.33},IOL:{o_pbw:0.74,o_rbw:0.64,o_prs:0.68,o_sack:0.34,o_tps:0.56,o_pbx:0.42,o_gap:0.43,o_dbl:0.89,o_blown:0.6,o_pen:0.3},IDL:{d_prw:0.77,d_prs:0.67,d_tps:0.57,d_dbl:0.86,d_rsw:0.71,d_stop:0.61,d_p2s:0.04,d_ttp:0.24,d_dep:0.2},EDGE:{d_prw:0.67,d_prs:0.5,d_tps:0.54,d_dbl:0.84,d_rsw:0.72,d_stop:0.58,d_p2s:0.02,d_ttp:0.34,d_dep:0.15},LB:{v_ypcs:0.45,v_rtg:0.13,v_cmp:0.24,v_sepx:0.98,v_cw:0.67,v_open:0.72,v_sep:0.75,v_tgt:0.65,v_yac:0.06,v_mt:0.14,v_stop:0.3,v_dep:0.18,v_blz:0.26,d_rsw:0.71,v_box:0.49},CB:{v_ypcs:0.66,v_rtg:0.28,v_cmp:0.46,v_sepx:0.98,v_cw:0.9,v_open:0.89,v_sep:0.92,v_tgt:0.78,v_finc:0.33,v_ball:0.35,v_yac:0.06,v_expl:0.35,v_mt:0.67},S:{v_ypcs:0.66,v_rtg:0.18,v_cmp:0.61,v_sepx:0.97,v_cw:0.75,v_open:0.81,v_sep:0.84,v_tgt:0.85,v_finc:0.26,v_ball:0.27,v_yac:0.24,v_expl:0.55,v_mt:0.68,v_stop:0.43,v_blz:0.23,v_box:0.99,v_deep:0.99}};
function advOutliers(sheet, n, grp) {
  const T = ADV_TRUST[grp] || {}, tr = id => T[id] === undefined ? 0.5 : T[id];
  const judged = sheet.filter(m => m.ok && m.z !== null && m.dir !== 0 && tr(m.id) >= 0.25).map(m => Object.assign({ w: Math.abs(m.z) * Math.sqrt(tr(m.id)) }, m)).sort((x, y) => y.w - x.w);
  const out = [], fams = new Set();
  for (const m of judged) { if (fams.has(m.fam)) continue; fams.add(m.fam); out.push(m); if (out.length === (n || 4)) break; }
  if (out.length < (n || 4)) for (const m of sheet.filter(m => m.ok && m.z !== null && m.dir === 0).sort((x, y) => Math.abs(y.z) - Math.abs(x.z))) { if (fams.has(m.fam)) continue; fams.add(m.fam); out.push(m); if (out.length === (n || 4)) break; }
  return out;
}
