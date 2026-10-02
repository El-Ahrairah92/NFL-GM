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
  g.gx = { man: ['C0', 'C1', 'C2M'].includes(dc.cov), blz: dc.pres === 'BLITZ' || dc.pres === 'SIM', pa: oc.tags && oc.tags.has('PA'), zone: oc.scheme === 'ZONE', run: !!oc.isRun,
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
  const yds = res.kind === 'sack' ? res.yds : (res.yds || 0);
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
  }
  // ---- passing plays ----
  if (isPass && res.qb) {
    const qb = res.qb.p;
    avInc(g, qb, 'db'); avInc(g, qb, 'epaDb', epa);
    if (res.ttt) { avInc(g, qb, 'ttt', res.ttt + 0.25); avInc(g, qb, 'tttN'); } // + the throwing motion
    if (res.pressure) avInc(g, qb, 'prsd');
    if (oc.tags && oc.tags.has('PA')) { avInc(g, qb, 'paDb'); avInc(g, qb, 'paEpa', epa); }
    const attempt = (res.kind === 'comp' || res.kind === 'inc' || res.kind === 'int') && !res.throwaway && res.target;
    const comp = res.kind === 'comp' ? 1 : 0;
    if (attempt) {
      avInc(g, qb, 'att'); avInc(g, qb, 'air', res.air || 0); avInc(g, qb, 'xc', res.xc || 0.65); avInc(g, qb, 'cmp', comp);
      if (res.pressure) { avInc(g, qb, 'prsdAtt'); avInc(g, qb, 'prsdCmp', comp); }
      if ((res.air || 0) >= 20) { avInc(g, qb, 'deepAtt'); avInc(g, qb, 'deepCmp', comp); }
    }
    // QB grade: results (EPA) plus decision quality
    let qc = clamp(epa * 0.42, -1.6, 1.6);
    if (res.kind === 'int' && res.route && res.route.w < 0) qc -= 0.7;
    if (res.kind === 'sack' && res.ttt > 3.1 && !(res.rushers && res.rushers.some(a => a.free))) qc -= 0.35;
    if (res.throwaway && res.pressure) qc += 0.2;
    if (comp && res.route && res.route.w < 0.2) qc += 0.3;
    if (res.kind === 'scramble' && yds >= 5) qc += 0.25;
    grade(g, qb, 'q', qc);
    // receivers: every route run counts; targets get the real credit
    for (const r of res.routes || []) {
      const rp = r.e.p;
      avInc(g, rp, 'routes');
      if (res.target && r.e === res.target) {
        avInc(g, rp, 'sep', sepYards(r.w)); avInc(g, rp, 'sepN'); avInc(g, rp, 'adot', r.depth); avInc(g, rp, 'epaTgt', epa);
        if (res.contested) { avInc(g, rp, 'cAtt'); avInc(g, rp, 'cWon', comp); }
        const ow = r.w + (r.shade || 0); // graded against his man, not the bracket
        const c = comp ? 0.45 + (res.yac || 0) / 12 + (res.contested ? 0.6 : 0) + Math.max(0, epa) * 0.15 + (r.shade || 0) * 0.5 : res.drop ? -1.3 : ow > 0.7 ? 0.08 : ow > 0.2 ? -0.03 : -0.3; // an off-target throw to an open man is on the QB
        grade(g, rp, 'rec', c, [r.pressAtt ? 'press' : null, res.contested ? 'ctd' : null]);
      } else { const ow = r.w + (r.shade || 0); grade(g, rp, 'rec', clamp((ow - 0.45) * 0.3, -0.25, 0.25), [r.pressAtt ? 'press' : null]); } // every route won or lost counts
    }
    if (res.target && res.target.slot !== 'QB' && !(res.routes || []).some(r => r.e === res.target)) { // screens
      const rp = res.target.p; avInc(g, rp, 'routes'); avInc(g, rp, 'sep', 4); avInc(g, rp, 'sepN'); avInc(g, rp, 'adot', res.air || 0); avInc(g, rp, 'epaTgt', epa);
      grade(g, rp, 'rec', comp ? 0.3 + (res.yac || 0) / 12 : -0.2);
    }
    // protection & rush
    if (res.prot) {
      const pressers = new Set((res.rushers || []).map(a => a.e));
      for (const e of off) if (OL_SLOTS.includes(e.slot)) avInc(g, e.p, 'pbSnaps');
      for (const a of res.prot.rushers) {
        const rp = a.e.p, beat = a.free || a.t < WIN_T;
        avInc(g, rp, 'prSnaps'); if (beat) avInc(g, rp, 'prWins'); if (a.blockers.length > 1) avInc(g, rp, 'dbl');
        const sacked = res.kind === 'sack' && res.sacker === a.e;
        grade(g, rp, 'pr', (beat ? 0.45 : -0.08) + (pressers.has(a.e) ? 0.25 : 0) + (sacked ? 1.0 : 0) - (a.blockers.length > 1 && !beat ? -0.05 : 0), [a.blockers.length > 1 ? 'dbl' : 'sgl']);
        const b = a.blockers[0];
        if (b) {
          const bp = b.p;
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
        if (res.def === e && res.target) {
          avInc(g, e.p, 'tgtA'); avInc(g, e.p, 'cmpA', comp); avInc(g, e.p, 'ydsA', comp ? yds : 0); if (comp && td) avInc(g, e.p, 'tdA');
          if (res.kind === 'int' && res.intBy === e) avInc(g, e.p, 'intA');
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
    const cp = res.carrier.p, ybc = res.ybc !== undefined ? res.ybc : yds;
    avInc(g, cp, 'rush'); avInc(g, cp, 'ybc', ybc); avInc(g, cp, 'yaco', yds - ybc); avInc(g, cp, 'epaRush', epa);
    if (yds <= 0) avInc(g, cp, 'stuff'); if (yds >= 10) avInc(g, cp, 'explR'); if (success) avInc(g, cp, 'succR');
    grade(g, cp, 'run', clamp(epa * 0.3, -1, 1) + (yds - ybc - 1.6) * 0.15 + (res.missed || []).length * 0.45 - (res.fumble ? 1.5 : 0));
  }
  if (carrier && res.missed) {
    if (res.kind === 'comp') avInc(g, carrier.p, 'mtfRec', res.missed.length);
    avInc(g, carrier.p, 'mtf', res.missed.length);
    for (const m of res.missed) { avInc(g, m.p, 'mt'); grade(g, m.p, 'tk', -0.7); }
  }
  if (res.tackler && carrier) {
    avInc(g, res.tackler.p, 'tkAtt');
    grade(g, res.tackler.p, 'tk', 0.15);
    if (!success) { avInc(g, res.tackler.p, 'stops'); grade(g, res.tackler.p, oc.isRun ? 'rd' : 'cov', 0.25); }
    if (res.missed) for (const m of res.missed) avInc(g, m.p, 'tkAtt');
  }
  if (res.blk) {
    for (const r of res.blk) {
      if (r.won === undefined) continue; // backside / uncontested: not charted
      const won = r.won;
      avInc(g, r.e.p, 'rdSnaps'); if (won) avInc(g, r.e.p, 'rdWins');
      grade(g, r.e.p, 'rd', won ? (r.penetrated ? 0.75 : 0.42) : r.state === 'free' ? 0 : -0.08);
      for (const b of r.blockers) {
        if (!b || !b.p) continue;
        avInc(g, b.p, 'rbSnaps'); if (!won) avInc(g, b.p, 'rbWins');
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
    add('Separation', a.sepN ? r1(a.sep / a.sepN) + ' yds' : '—', 'at the catch point, on targets');
    add('aDOT', a.sepN ? r1(a.adot / a.sepN) : '—');
    add('Tgt / route', pctM(a.sepN || 0, a.routes));
    add('Contested', a.cAtt ? `${a.cWon || 0}/${a.cAtt}` : '—', 'contested catches won');
    add('Missed tkl forced', a.mtfRec || 0);
    add('EPA/target', a.sepN ? r2((a.epaTgt || 0) / a.sepN) : '—');
  }
  if (spot === 'RB' || spot === 'FB' || (a.rush || 0) >= 5) {
    add('Yds before contact', a.rush ? r1(a.ybc / a.rush) : '—', 'per carry — mostly the blocking');
    add('Yds after contact', a.rush ? r1(a.yaco / a.rush) : '—', 'per carry — mostly the runner');
    add('Missed tkl forced', a.mtf || 0);
    add('Stuff rate', pctM(a.stuff || 0, a.rush), 'carries for 0 or less');
    add('Explosive rate', pctM(a.explR || 0, a.rush), 'carries of 10+');
    add('Success rate', pctM(a.succR || 0, a.rush));
    add('EPA/rush', a.rush ? r2((a.epaRush || 0) / a.rush) : '—');
  }
  if (['LT', 'LG', 'C', 'RG', 'RT'].includes(spot)) {
    add('Pass block win%', a.pbSnaps ? pctM(a.pbSnaps - (a.pbLoss || 0), a.pbSnaps) : '—', 'held his man past 3.0s');
    add('Pressures allowed', a.prsA || 0);
    add('Sacks allowed', a.sackA || 0);
    add('Run block win%', pctM(a.rbWins || 0, a.rbSnaps));
  }
  if (['NT', 'DT', 'DE', 'EDGE'].includes(spot) || (a.prSnaps || 0) > 30) {
    add('Pass rush win%', pctM(a.prWins || 0, a.prSnaps), 'beat his block within 3.0s');
    add('Double-team rate', pctM(a.dbl || 0, a.prSnaps));
    add('Run stop win%', pctM(a.rdWins || 0, a.rdSnaps));
    add('Stops', a.stops || 0, 'tackles that end in an offensive failure');
  }
  if (['MLB', 'WLB', 'CB', 'NCB', 'FS', 'SS'].includes(spot)) {
    add('Targets allowed', a.tgtA || 0);
    add('Comp% allowed', pctM(a.cmpA || 0, a.tgtA));
    add('Yds/cov snap', a.covSnaps ? r1((a.ydsA || 0) / a.covSnaps * 100) / 100 : '—');
    add('Rating allowed', ratingAllowed(a) ?? '—');
    add('Missed tackle%', pctM(a.mt || 0, a.tkAtt), 'of tackle attempts');
    add('Stops', a.stops || 0);
  }
  return m;
}

// compact season record for career history: grades plus the raw sums the role's key metrics need
const CAREER_ADV_KEYS = ['db', 'epaDb', 'att', 'cmp', 'xc', 'air', 'ttt', 'tttN', 'prsd', 'routes', 'sep', 'sepN', 'adot', 'rush', 'ybc', 'yaco', 'mtf', 'stuff', 'explR',
  'pbSnaps', 'pbLoss', 'prsA', 'sackA', 'rbSnaps', 'rbWins', 'prSnaps', 'prWins', 'rdSnaps', 'rdWins', 'stops', 'tgtA', 'cmpA', 'ydsA', 'tdA', 'intA', 'covSnaps', 'mt', 'tkAtt'];
function careerAdv(a, spot) {
  const out = { g: overallGrade(a, spot) };
  for (const f in FACETS) { const gr = facetGrade(a, f); if (gr !== null && (a['n' + f] || 0) >= 25) out['g' + f] = gr; }
  for (const k of CAREER_ADV_KEYS) if (a[k]) out[k] = Math.round(a[k] * 100) / 100;
  return out;
}
