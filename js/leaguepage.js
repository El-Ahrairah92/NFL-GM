// =====================================================================
//  THE LEAGUE
//  The pages under the League tab: the schedule, the standings, the league's stats, its history and each season in
//  review. Each is one sheet in the language of the club pages: a band of plain leather (the league's, not a club's)
//  with the season stamped across it, the figures in steel, a bar with the page's choices, then ruled panes. A club
//  wears its own color wherever it stands on its own (its chip, its medallion's leather: the rim is the metal of its
//  place); your club's rows and your games wear yours. Every club, man and game is a link. The season in review wears
//  the champion's colors.
// =====================================================================
const LG_CUP = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SB_ICON.league}</svg>`;
const LG_DIVS = ['East', 'North', 'South', 'West'];
const lgConfs = () => [...new Set(state.teams.map(t => t.conf))].sort();
const lgSameDiv = (a, b) => T(a).conf === T(b).conf && T(a).div === T(b).div;
const lgAb = tid => `<button class="link lg-ab" data-action="team" data-tid="${tid}" title="${esc(teamName(tid))}">${esc(T(tid).abbr)}</button>`;
const lgFig = (k, v, s, tt) => `<div${tt ? ` title="${esc(tt)}"` : ''}><div class="k">${k}</div><div class="v">${v}${s ? `<small>${s}</small>` : ''}</div></div>`;
const lgNum = v => Math.round(v).toLocaleString('en-US');
const lgPct = r => { const s = pct(r).toFixed(3); return s[0] === '0' ? s.slice(1) : s; };
const lgRec = (w, l, t) => `${w}-${l}${t ? '-' + t : ''}`;
const lgWhen = () => state.phase === 'REG' ? `Week ${Math.min(state.week, state.schedule.length)}` : state.phase === 'PLAYOFFS' && state.playoffs ? ROUND_NAMES[state.playoffs.round] || 'Playoffs' : PHASE_LABEL[state.phase] || state.phase;
const lgInitials = name => String(name).split(' ').map(w => w[0]).join('');

// ---------- the sheet: band, figures, bar ----------
function lgMastHTML(o) {
  const club = o.tid !== undefined && o.tid !== null ? T(o.tid) : null;
  return `<header class="cl-mast rs-mast lg-mast${club ? ' own' : ''}" data-abbr="${esc(o.wm)}"${club ? ` style="${clubVarsCSS(o.tid)}"` : ''}>
    ${club ? `<button class="cl-badge" data-action="team" data-tid="${o.tid}" title="${esc(teamName(o.tid))}">${esc(club.abbr)}</button>` : `<span class="cl-badge lg-badge" title="The league">${LG_CUP}</span>`}
    <div class="cl-id"><div class="cl-over">${o.over}</div><div class="rs-name"><h1>${o.title}</h1></div></div>
    <div class="cl-rec rs-count"><div class="cl-big">${o.big}</div><div class="cl-place">${o.place}</div></div></header>`;
}
function lgSheet(cls, mast, figs, bar, body) {
  return `<div class="club ros lg ${cls}" style="${clubVarsCSS(state.userTid)}">${lgMastHTML(mast)}<div class="cl-ledger" style="--n:${figs.length}">${figs.join('')}</div>${bar}${body}</div>`;
}
function lgBarHTML(tabs, cur, act, right) {
  return `<div class="rs-bar lg-bar"><nav class="rs-pos">${tabs.map(([k, l, n, tt]) => `<button class="${k === cur ? 'on' : ''}" data-action="${act}" data-v="${esc(k)}"${tt ? ` title="${esc(tt)}"` : ''}>${l}${n !== undefined && n !== null ? `<i>${n}</i>` : ''}</button>`).join('')}</nav>${right ? `<div class="lg-ctl">${right}</div>` : ''}</div>`;
}
const lgSel = (label, change, opts, cur, tt) => `<label class="rs-vl"${tt ? ` title="${esc(tt)}"` : ''}>${label ? `<span>${label}</span>` : ''}<select data-change="${change}">${opts.map(([v, l]) => `<option value="${esc(String(v))}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(String(l))}</option>`).join('')}</select></label>`;
const lgPane = (cls, title, ctl, body, style) => `<section class="lg-pane ${cls}"${style ? ` style="${style}"` : ''}><div class="lg-ph"><h3>${title}</h3>${ctl || ''}</div><div class="lg-pb">${body}</div></section>`;
// a club as a medallion: its leather stamped with its letters, the rim the metal of its place
function lgMed(tid, o) {
  return `<button class="lg-md m-${o.metal || 'steel'}${o.cls ? ' ' + o.cls : ''}${tid === state.userTid ? ' me' : ''}" data-action="team" data-tid="${tid}" style="${clubVarsCSS(tid)}" title="${esc(o.tip || teamName(tid))}"><span class="pm-disc"><b>${esc(o.code || T(tid).abbr)}</b>${o.tab ? `<i class="lg-sd">${o.tab}</i>` : ''}</span>${o.plate ? `<span class="pm-plate">${o.plate}</span>` : ''}</button>`;
}

// ---------- the standings ----------
const lgSeedMetal = i => i === 0 ? 'gold' : i < 4 ? 'silver' : i < 7 ? 'bronze' : 'iron';
function lgSeeds(conf) { const po = state.playoffs, s = confSeeds(conf); return po && po.seeds && po.seeds[conf] ? [...po.seeds[conf], ...s.filter(t => !po.seeds[conf].includes(t))] : s; }
function lgOut(tid) { const po = state.playoffs; return !!po && !!po.elim && po.elim[tid] !== undefined && po.champ !== tid; }
const LG_SEED_KEY = '<span class="pyr-key lg-key" title="The rim is the club\'s place in the race"><span><i class="m-gold"></i>Bye</span><span><i class="m-silver"></i>Division leader</span><span><i class="m-bronze"></i>Wild card</span><span><i class="m-iron"></i>In the hunt</span></span>';
function standingsHTML() {
  const u = state.userTid, ut = T(u), recs = standings(), divs = divisionStandings(), confs = lgConfs(), po = state.playoffs;
  const played = recs.some(r => r.w + r.l + r.t), ties = recs.some(r => r.t), mode = ui.stView === 'conf' ? 'conf' : 'div';
  const final = state.schedule.length && state.schedule.every(wk => wk.every(m => m.score));
  const seeds = {}; for (const c of confs) seeds[c] = lgSeeds(c);
  const gb = (a, b) => ((a.w - b.w) + (b.l - a.l)) / 2, gbS = v => v <= 0 ? '–' : v % 1 ? v.toFixed(1) : String(v);
  const form = r => `<span class="lg-form">${(r.last || []).slice(-5).map(x => `<i class="${x}"></i>`).join('')}</span>`;
  const ncol = 13 + (ties ? 1 : 0);
  const head = `<tr><th class="lg-sdc" title="Seed: the club's place in its conference's playoff race">Sd</th><th class="l">Club</th><th>W</th><th>L</th>${ties ? '<th>T</th>' : ''}<th>Pct</th><th title="${mode === 'div' ? 'Games behind the division leader' : 'Games behind the last playoff place'}">GB</th><th class="lo">PF</th><th class="lo">PA</th><th>Diff</th><th class="lo1">Div</th><th class="lo1">Conf</th><th class="lo2">Strk</th><th class="lo lg-l5c">Last 5</th></tr>`;
  const row = (r, c, gbv) => { const i = seeds[c].indexOf(r.tid), d = r.pf - r.pa, t = T(r.tid);
    return `<tr class="${r.tid === u ? 'me' : ''}${lgOut(r.tid) ? ' out' : ''}"><td class="lg-sdc">${played && i < 7 ? `<i class="lg-sn m-${lgSeedMetal(i)}" title="No. ${i + 1} seed">${i + 1}</i>` : ''}</td><td class="l cl-opp"><div class="cl-ow">${clubTag(r.tid)}${mode === 'conf' ? `<i class="lg-dv" title="${esc(t.conf + ' ' + t.div)}">${esc(t.div)}</i>` : ''}</div></td>
      <td>${r.w}</td><td>${r.l}</td>${ties ? `<td>${r.t}</td>` : ''}<td>${played ? lgPct(r) : '–'}</td><td class="lg-gb">${gbS(gbv)}</td><td class="lo">${r.pf}</td><td class="lo">${r.pa}</td><td class="${d > 0 ? 'good' : d < 0 ? 'bad' : ''}">${d > 0 ? '+' : ''}${d}</td>
      <td class="lo1">${lgRec(r.dw, r.dl, r.dt)}</td><td class="lo1">${lgRec(r.cw, r.cl, r.ct)}</td><td class="lo2">${esc(r.streak || '–')}</td><td class="lo lg-l5c">${form(r)}</td></tr>`; };
  const confPane = c => {
    const sd = seeds[c];
    const body = mode === 'div'
      ? LG_DIVS.filter(d => divs[c + ' ' + d]).map(d => { const rows = divs[c + ' ' + d]; return `<tr class="lg-dh"><td colspan="${ncol}">${esc(c + ' ' + d)}</td></tr>${rows.map(r => row(r, c, gb(rows[0], r))).join('')}`; }).join('')
      : sd.map((tid, i) => `${i === 7 ? `<tr class="lg-cut"><td colspan="${ncol}"><span>The playoff line</span></td></tr>` : ''}${row(recs[tid], c, i < 7 ? 0 : gb(recs[sd[6]], recs[tid]))}`).join('');
    const med = (tid, i) => { const champ = po && po.champ === tid, out = lgOut(tid), role = i === 0 ? 'the top seed and the bye' : i < 4 ? 'a division leader' : i < 7 ? 'a wild card' : 'in the hunt';
      return lgMed(tid, { metal: champ ? 'gold' : lgSeedMetal(i), tab: i < 7 ? i + 1 : '', cls: `${i >= 7 ? 'hunt' : ''}${out ? ' out' : ''}`, plate: `<em>${recStr(recs[tid])}</em>`,
        tip: `${teamName(tid)} · ${i < 7 ? `No. ${i + 1} seed, ` : ''}${role} · ${recStr(recs[tid])}${champ ? ' · champions' : out ? ` · out in the ${ROUND_NAMES[po.elim[tid]]}` : ''}` }); };
    const pic = played ? `<div class="lg-seeds">${sd.slice(0, 7).map(med).join('')}<i class="lg-line" title="The playoff line"></i>${sd.slice(7, 10).map((tid, j) => med(tid, 7 + j)).join('')}</div>` : '<div class="lg-none">The playoff picture forms once games are played.</div>';
    const note = po ? (po.champ !== null && po.champ !== undefined ? 'The playoffs are over' : `The playoffs · ${ROUND_NAMES[po.round]}`) : final ? 'The final picture' : played ? 'If the season ended today' : '';
    return `<section class="lg-conf"><div class="lg-ph"><h3>${esc(c)}</h3><span class="lg-pn">${note}</span></div>${pic}<div class="lg-tw"><table class="cl-tbl lg-stt${mode === 'conf' ? ' cv' : ''}"><thead>${head}</thead><tbody>${body}</tbody></table></div></section>`;
  };
  // the figures: who leads the league, and how
  const all = recs.filter(r => r.w + r.l + r.t), g = r => Math.max(1, r.w + r.l + r.t), top = f => all.slice().sort((a, b) => f(b) - f(a))[0];
  const best = all.slice().sort(cmpRec)[0], off = top(r => r.pf / g(r)), def = top(r => -r.pa / g(r)), dif = top(r => r.pf - r.pa);
  const hot = all.filter(r => /^W/.test(r.streak)).sort((a, b) => +b.streak.slice(1) - +a.streak.slice(1))[0];
  const figs = played ? [lgFig('Best record', `${lgAb(best.tid)} ${recStr(best)}`), lgFig('Most points', `${lgAb(off.tid)} ${round1(off.pf / g(off))}`, 'a game'), lgFig('Fewest allowed', `${lgAb(def.tid)} ${round1(def.pa / g(def))}`, 'a game'),
    lgFig('Best diff', `${lgAb(dif.tid)} ${dif.pf - dif.pa > 0 ? '+' : ''}${dif.pf - dif.pa}`), lgFig('Hottest', hot ? `${lgAb(hot.tid)} ${esc(hot.streak)}` : '—', '', 'The longest winning streak going'),
    lgFig('Unbeaten', all.filter(r => !r.l && r.w).length), lgFig('Winless', all.filter(r => !r.w && r.l).length)]
    : ['Best record', 'Most points', 'Fewest allowed', 'Best diff', 'Hottest', 'Unbeaten', 'Winless'].map(k => lgFig(k, '—'));
  const ur = recs[u], si = seeds[ut.conf].indexOf(u), dp = (divs[ut.conf + ' ' + ut.div] || []).findIndex(r => r.tid === u) + 1;
  const place = played ? `${ordinal(dp)} ${esc(ut.conf + ' ' + ut.div)} · ${si < 7 ? `No. ${si + 1} seed` : `${ordinal(si + 1)} in the ${esc(ut.conf)}`}` : esc(ut.conf + ' ' + ut.div);
  return lgSheet('lg-st', { title: 'Standings', over: `The league · ${state.season} · ${final ? 'Final' : esc(lgWhen())}`, wm: String(state.season), big: recStr(ur), place: `${esc(ut.abbr)} · ${place}` }, figs,
    lgBarHTML([['div', 'Divisions', null, 'Each division, leader first'], ['conf', 'Conferences', null, 'Each conference in seed order, with the playoff line']], mode, 'lgStView', LG_SEED_KEY),
    `<div class="lg-body lg-stb">${confs.map(confPane).join('')}</div>`);
}

// ---------- the schedule ----------
// a schedule's weeks in one shape, from the live schedule or the few kilobytes a past season keeps: {h, a, hs, as, gid}
function lgWeeks(src) { return (src || []).map(wk => wk.map(m => Array.isArray(m) ? { h: m[0], a: m[1], hs: m[2] < 0 ? undefined : m[2], as: m[3] < 0 ? undefined : m[3] } : { h: m.h, a: m.a, hs: m.score ? m.score[0] : undefined, as: m.score ? m.score[1] : undefined, gid: m.gid })); }
function lgRecsOf(weeks) {
  const r = state.teams.map(t => ({ tid: t.id, w: 0, l: 0, t: 0 }));
  for (const wk of weeks) for (const g of wk) { const H = r[g.h], A = r[g.a]; if (g.hs === undefined || !H || !A) continue; if (g.hs > g.as) { H.w++; A.l++; } else if (g.hs < g.as) { H.l++; A.w++; } else { H.t++; A.t++; } }
  return r;
}
// a season's playoffs: the rounds played, the round about to be played (matchups without scores), each club's seed and each conference's bye.
// Before the playoffs it is the field as it would stand if the season ended today.
function lgRounds(yr) {
  const cur = yr === state.season, po = cur ? state.playoffs : null, confs = lgConfs();
  if (po) {
    const rounds = po.rounds.map((rd, i) => ({ name: ROUND_NAMES[i], games: rd.map(g => ({ h: g.h, a: g.a, hs: g.score[0], as: g.score[1], win: g.win, gid: g.gid })) }));
    if (po.round < 4 && state.phase === 'PLAYOFFS') rounds.push({ name: ROUND_NAMES[po.round], games: playoffMatchups().map(([h, a]) => ({ h, a })), next: true });
    const top = {}; for (const c of confs) top[c] = po.seeds[c][0];
    return { rounds, top, champ: po.champ, seed: tid => { const s = seedOf(tid); return s < 99 ? s : null; } };
  }
  if (cur) {
    if (!standings().some(r => r.w + r.l + r.t)) return null;
    const s = {}, top = {}; for (const c of confs) { s[c] = confSeeds(c).slice(0, 7); top[c] = s[c][0]; }
    return { rounds: [{ name: ROUND_NAMES[0], games: confs.flatMap(c => [[1, 6], [2, 5], [3, 4]].map(([x, y]) => ({ h: s[c][x], a: s[c][y] }))), next: true }], top, proj: true,
      seed: tid => { const i = s[T(tid).conf].indexOf(tid); return i >= 0 ? i + 1 : null; } };
  }
  const h = state.history.find(x => x.season === yr), br = h && h.wrap && h.wrap.bracket;
  if (!br || !br.length) return null;
  const seed = tid => { const e = (state.teamHist[tid] || []).find(x => x.season === yr); return e && e.seed ? e.seed : null; }, top = {};
  for (const c of confs) { const t = state.teams.find(x => x.conf === c && seed(x.id) === 1); if (t) top[c] = t.id; }
  return { rounds: br.map(rd => ({ name: rd.name, games: rd.games.map(g => ({ h: g.h, a: g.a, hs: g.score ? g.score[0] : undefined, as: g.score ? g.score[1] : undefined, win: g.win, gid: g.gid })) })), top, champ: h.champ, seed };
}
// the bracket: each conference's rounds toward the middle, the championship between them
function lgBracketHTML(B) {
  const u = state.userTid, confs = lgConfs();
  const line = (tid, sc, cls) => `<div class="lg-bl${cls}${tid === u ? ' me' : ''}"><i class="lg-bs">${B.seed(tid) || ''}</i><i class="cl-chip" style="background:${T(tid).color}"></i><button class="link" data-action="team" data-tid="${tid}" title="${esc(teamName(tid))}"><span class="lg-nf">${esc(T(tid).name)}</span><span class="lg-na">${esc(T(tid).abbr)}</span></button><b>${sc === undefined ? '' : sc}</b></div>`;
  const card = g => {
    if (!g) return '<div class="lg-bg tbd"><div class="lg-bl"><span class="lg-tbd">To be decided</span></div><div class="lg-bl"><span class="lg-tbd">&nbsp;</span></div></div>';
    const done = g.hs !== undefined, box = done && g.gid !== undefined && state.games[g.gid], res = tid => !done ? '' : g.win === tid ? ' w' : ' l';
    return `<div class="lg-bg${done ? ' done' : ' next'}${g.h === u || g.a === u ? ' me' : ''}${box ? ' box' : ''}"${box ? ` data-action="box" data-gid="${g.gid}" title="Box score"` : ''}>${line(g.a, g.as, res(g.a))}${line(g.h, g.hs, res(g.h))}${box && box.ot ? '<i class="lg-ot">OT</i>' : ''}</div>`;
  };
  const col = (c, i) => {
    const r = B.rounds[i], gs = r ? r.games.filter(g => T(g.h).conf === c) : [], need = [3, 2, 1][i];
    const cards = [...gs.map(card), ...Array.from({ length: Math.max(0, need - gs.length) }, () => card(null))];
    if (i === 0 && B.top[c] !== undefined) cards.unshift(`<div class="lg-bg bye">${line(B.top[c], undefined, '')}<div class="lg-bl"><span class="lg-tbd" title="The top seed sits out the Wild Card round">First-round bye</span></div></div>`);
    return `<div class="lg-bcol r${i}${r ? '' : ' wait'}"><div class="lg-bh">${ROUND_NAMES[i]}</div><div class="lg-bgs">${cards.join('')}</div></div>`;
  };
  const fin = B.rounds[3], fg = fin ? fin.games[0] : null, champ = B.champ !== null && B.champ !== undefined ? B.champ : null;
  return `<div class="lg-brkw"><div class="lg-brk"><div class="lg-bside"><div class="lg-bconf">${esc(confs[0])}</div><div class="lg-bcols">${[0, 1, 2].map(i => col(confs[0], i)).join('')}</div></div>
    <div class="lg-bfin"><div class="lg-bh">${ROUND_NAMES[3]}</div><div class="lg-bgs">${card(fg)}${champ !== null ? `<div class="lg-champ">${lgMed(champ, { metal: 'gold', plate: `<b>${esc(T(champ).name)}</b><em>Champions</em>`, tip: `${teamName(champ)}: champions` })}</div>` : ''}</div></div>
    <div class="lg-bside nfc"><div class="lg-bconf">${esc(confs[1])}</div><div class="lg-bcols">${[2, 1, 0].map(i => col(confs[1], i)).join('')}</div></div></div></div>`;
}
// the figures of a set of games
function lgGameFigs(games, total) {
  const done = games.filter(g => g.hs !== undefined), n = done.length;
  if (!n) return [lgFig('Played', 0, total ? `of ${total}` : ''), ...['Points a game', 'Home wins', 'Close games', 'Overtime', 'Shutouts', 'Most points', 'Biggest win'].map(k => lgFig(k, '—'))];
  const pts = done.reduce((s, g) => s + g.hs + g.as, 0), home = done.filter(g => g.hs > g.as).length, close = done.filter(g => Math.abs(g.hs - g.as) <= 8).length;
  const kept = done.filter(g => g.gid !== undefined && state.games[g.gid]), ot = kept.filter(g => state.games[g.gid].ot).length;
  const hi = done.reduce((b, g) => { const x = g.hs >= g.as ? [g.h, g.hs] : [g.a, g.as]; return !b || x[1] > b[1] ? x : b; }, null);
  const big = done.reduce((b, g) => { const m = Math.abs(g.hs - g.as); return !b || m > b.m ? { m, tid: g.hs > g.as ? g.h : g.a } : b; }, null);
  return [lgFig('Played', n, total ? `of ${total}` : ''), lgFig('Points a game', round1(pts / n / 2), 'a club'), lgFig('Home wins', `${Math.round(100 * home / n)}%`),
    lgFig('Close games', `${Math.round(100 * close / n)}%`, '', 'Decided by eight points or fewer'), lgFig('Overtime', kept.length ? ot : '—', '', kept.length && kept.length < n ? 'Of the games whose box score is kept' : ''),
    lgFig('Shutouts', done.filter(g => !g.hs || !g.as).length), lgFig('Most points', `${lgAb(hi[0])} ${hi[1]}`, '', 'The most points one club scored in a game'), lgFig('Biggest win', big.m ? `${lgAb(big.tid)} +${big.m}` : '—')];
}
function lgSchedYears() { return [state.season, ...state.history.filter(h => h.res || (h.wrap && h.wrap.bracket)).map(h => h.season).reverse()].filter((v, i, a) => a.indexOf(v) === i); }
function scheduleHTML() {
  const u = state.userTid, ut = T(u), yrs = lgSchedYears(), yr = yrs.includes(ui.schedYr) ? ui.schedYr : state.season, cur = yr === state.season, hist = state.history.find(h => h.season === yr);
  const part = ['pre', 'reg', 'po'].includes(ui.schedPart) ? ui.schedPart : cur && state.phase === 'PLAYOFFS' ? 'po' : 'reg';
  const B = lgRounds(yr);
  const bar = lgBarHTML([['pre', 'Preseason'], ['reg', 'Regular season'], ['po', 'Playoffs']], part, 'lgPart', lgSel('Season', 'schedYr', yrs.map(y => [y, y === state.season ? `${y} · this season` : y]), yr));
  const mast = (big, place) => ({ title: 'Schedule', over: `The league · ${yr} · ${part === 'pre' ? 'Preseason' : part === 'po' ? 'Playoffs' : 'Regular season'}${cur && state.phase === 'REG' ? ' · ' + esc(lgWhen()) : ''}`, wm: String(yr), big, place });
  if (part === 'po') {
    const games = B && !B.proj ? B.rounds.flatMap(r => r.games) : [];
    const mine = games.filter(g => g.hs !== undefined && (g.h === u || g.a === u)), mw = mine.filter(g => g.win === u).length;
    const ended = B && !B.proj ? B.rounds.findIndex(r => r.games.some(g => g.hs !== undefined && (g.h === u || g.a === u) && g.win !== u)) : -1;
    const inIt = B && !B.proj && B.seed(u), word = !B ? 'The bracket' : B.proj ? (B.seed(u) ? `No. ${B.seed(u)} seed as it stands` : 'Out as it stands') : !inIt ? 'Not in the playoffs' : B.champ === u ? 'Champions' : ended >= 0 ? `Out in the ${B.rounds[ended].name}` : 'Still alive';
    const note = B && B.proj ? '<div class="lg-cap">If the season ended today. The bracket is set when the regular season ends.</div>' : '';
    return lgSheet('lg-sch', mast(inIt ? lgRec(mw, mine.length - mw) : '—', `${esc(ut.abbr)} · ${word}`), lgGameFigs(games, B && !B.proj ? 13 : 0), bar,
      `<div class="lg-body lg-pob">${B ? lgPane('lg-po', `${yr} playoffs`, B.proj ? '<span class="lg-pn">Projected</span>' : '', note + lgBracketHTML(B)) : `<div class="lg-none">${cur ? 'The bracket appears once games are played.' : 'That bracket was not kept.'}</div>`}</div>`);
  }
  const src = part === 'pre' ? (cur ? (state.pre && state.pre.sched && state.pre.sched.length ? state.pre.sched : state.preRes) : hist && hist.res && hist.res.pre) : cur ? state.schedule : hist && hist.res && hist.res.reg;
  const weeks = lgWeeks(src), lab = part === 'pre' ? 'Game' : 'Week', live = cur && part === 'reg';
  if (!weeks.length) return lgSheet('lg-sch', mast('—', esc(ut.abbr)), lgGameFigs([], 0), bar, `<div class="lg-body"><div class="lg-none">${part === 'pre' ? 'No preseason games were kept for this season.' : 'Nothing was kept for this part of that season.'}</div></div>`);
  const nowWk = live && state.phase === 'REG' ? state.week : 0; ui.lgLive = live;
  const w = Math.max(1, Math.min(live ? ui.schedWeek || (nowWk ? Math.max(1, nowWk - 1) : weeks.length) : ui.schedWeekA || 1, weeks.length));
  const recs = live ? standings() : lgRecsOf(weeks);
  // your games, the club page's way
  let mine;
  if (live) mine = clGames(u);
  else {
    mine = weeks.map((wk, i) => { const m = wk.find(g => g.h === u || g.a === u); if (!m) return { wk: i + 1, bye: true }; const home = m.h === u, opp = home ? m.a : m.h, g = { wk: i + 1, label: String(i + 1), home, opp, gid: m.gid, div: lgSameDiv(u, opp) }; if (m.hs !== undefined) { g.us = home ? m.hs : m.as; g.them = home ? m.as : m.hs; } return g; });
    if (part === 'reg' && B && !cur) for (const r of B.rounds) for (const g of r.games) if (g.hs !== undefined && (g.h === u || g.a === u)) { const home = g.h === u; mine.push({ label: lgInitials(r.name), title: r.name, home, opp: home ? g.a : g.h, gid: g.gid, us: home ? g.hs : g.as, them: home ? g.as : g.hs, po: true }); }
  }
  const myDone = mine.filter(g => !g.bye && !g.po && g.us !== undefined), mw = myDone.filter(g => g.us > g.them).length, ml = myDone.filter(g => g.us < g.them).length;
  const ng = live ? nextGame(u) : null, nOpp = ng ? (ng.h === u ? ng.a : ng.h) : null;
  const minePane = lgPane('lg-mine', `${esc(ut.abbr)} · ${part === 'pre' ? `${yr} preseason` : `${yr} schedule`}`, `<button class="link cl-more" data-action="team" data-tid="${u}">Your club ›</button>`, clSchedule(u, mine, { recs, live, short: true }));
  // the week, every game in it
  const wk = weeks[w - 1] || [], byes = state.teams.filter(t => !wk.some(g => g.h === t.id || g.a === t.id)).map(t => t.id);
  const order = wk.slice().sort((a, b) => (b.h === u || b.a === u) - (a.h === u || a.a === u));
  const card = g => { const done = g.hs !== undefined, box = done && g.gid !== undefined && state.games[g.gid], me = g.h === u || g.a === u;
    const ln = (tid, s, o, home) => `<div class="lg-gl${done && s > o ? ' w' : done && s < o ? ' l' : ''}${tid === u ? ' me' : ''}">${home ? '<i class="lg-at">at</i>' : ''}<i class="cl-chip" style="background:${T(tid).color}"></i><button class="link" data-action="team" data-tid="${tid}" title="${esc(teamName(tid))}">${esc(T(tid).name)}</button><span class="lg-gr">${recStr(recs[tid])}</span><b>${done ? s : ''}</b></div>`;
    const foot = done ? `Final${box && box.ot ? ' · OT' : ''}` : nowWk && w === nowWk ? 'This week' : 'To play';
    return `<div class="lg-g${me ? ' me' : ''}${done ? ' done' : ''}${box ? ' box' : ''}"${box ? ` data-action="box" data-gid="${g.gid}" title="Box score"` : ''}>${ln(g.a, g.as, g.hs)}${ln(g.h, g.hs, g.as, true)}<div class="lg-gf"><span>${foot}</span>${lgSameDiv(g.h, g.a) ? '<i class="cl-div" title="Division game">DIV</i>' : ''}${me ? '<i class="lg-yg">Your game</i>' : ''}</div></div>`; };
  const pips = weeks.map((x, i) => { const all = x.length && x.every(g => g.hs !== undefined), any = x.some(g => g.hs !== undefined), bye = !x.some(g => g.h === u || g.a === u);
    return `<button class="${i + 1 === w ? 'on' : ''}${all ? ' done' : any ? ' part' : ''}${i + 1 === nowWk ? ' now' : ''}" data-action="lgWeek" data-w="${i + 1}" title="${lab} ${i + 1}${all ? ': played' : i + 1 === nowWk ? ': this week' : ''}${bye ? ' · your bye' : ''}">${i + 1}</button>`; }).join('');
  const nav = `<span class="lg-wn"><button class="pr-nav" data-action="lgWeek" data-w="${w - 1}" ${w <= 1 ? 'disabled' : ''} title="${lab} ${w - 1} (←)">‹</button><b>${lab} ${w}</b><button class="pr-nav" data-action="lgWeek" data-w="${w + 1}" ${w >= weeks.length ? 'disabled' : ''} title="${lab} ${w + 1} (→)">›</button></span>`;
  const weekPane = `<section class="lg-pane lg-week"><div class="lg-ph">${nav}<nav class="lg-pips">${pips}</nav></div><div class="lg-pb"><div class="lg-games">${order.map(card).join('')}</div>
    ${byes.length && byes.length < state.teams.length ? `<div class="lg-byes"><span class="dk-k">Bye</span>${byes.map(lgAb).join(' ')}</div>` : ''}</div></section>`;
  return lgSheet('lg-sch', mast(lgRec(mw, ml, myDone.length - mw - ml), `${esc(ut.abbr)} · ${nOpp !== null ? `next: ${ng.h === u ? 'vs' : 'at'} ${esc(T(nOpp).abbr)}` : part === 'pre' ? 'preseason' : 'regular season'}`),
    lgGameFigs(weeks.flat(), weeks.flat().length), bar, `<div class="lg-body lg-schb">${minePane}${weekPane}</div>`);
}

// ---------- the league's stats ----------
const LG_STAT_TABS = [['passing', 'Passing'], ['rushing', 'Rushing'], ['receiving', 'Receiving'], ['defense', 'Defense'], ['returns', 'Returns'], ['special', 'Special teams'], ['kicking', 'Kicking'], ['advanced', 'Advanced'], ['teams', 'Teams']];
// each category's leader boards: [label, value, qualifies (its line, the club's games), decimals]
const LG_LEADS = {
  passing: [['Passing yards', s => s.passY || 0], ['Touchdown passes', s => s.passTD || 0], ['Passer rating', s => passerRating(s.passC || 0, s.passA || 0, s.passY || 0, s.passTD || 0, s.passInt || 0), (s, G) => (s.passA || 0) >= 14 * G, 1], ['Yards an attempt', s => s.passA ? s.passY / s.passA : 0, (s, G) => (s.passA || 0) >= 14 * G, 2]],
  rushing: [['Rushing yards', s => s.rushY || 0], ['Rushing touchdowns', s => s.rushTD || 0], ['Yards a carry', s => s.rushA ? s.rushY / s.rushA : 0, (s, G) => (s.rushA || 0) >= 6.25 * G, 2], ['Longest run', s => s.rushLng || 0]],
  receiving: [['Receiving yards', s => s.recY || 0], ['Receptions', s => s.rec || 0], ['Touchdown catches', s => s.recTD || 0], ['Yards after the catch', s => s.yac || 0]],
  defense: [['Tackles', s => s.tkl || 0], ['Sacks', s => s.sck || 0], ['Interceptions', s => s.dint || 0], ['Pressures', s => s.prs || 0]],
  returns: [['Kick return yards', s => s.krY || 0], ['Punt return yards', s => s.prY || 0], ['Kick return average', s => s.krA ? s.krY / s.krA : 0, (s, G) => (s.krA || 0) >= G, 1], ['Return touchdowns', s => (s.krTD || 0) + (s.prTD || 0)]],
  special: [['Special teams tackles', s => s.stk || 0], ['Special teams grade', s => stGrade(s) || 0, (s, G) => (s.sts || 0) >= 8 * G, 1], ['Special teams snaps', s => s.sts || 0]],
  kicking: [['Field goals', s => s.fgm || 0], ['Field goal percentage', s => s.fga ? 100 * s.fgm / s.fga : 0, (s, G) => (s.fga || 0) >= G, 1], ['Punting average', s => s.pnt ? s.pntY / s.pnt : 0, (s, G) => (s.pnt || 0) >= 2.5 * G, 1], ['Punts inside the 20', s => s.pi20 || 0]],
};
function lgLeadsHTML(cat, rows, G) {
  const L = LG_LEADS[cat], u = state.userTid; if (!L) return '';
  const fmt = (v, dp) => dp ? v.toFixed(dp) : v % 1 ? v.toFixed(1) : lgNum(v);
  return `<section class="lg-leads">${L.map(([l, f, q, dp]) => {
    const top = rows.filter(r => !q || q(r.s, G)).map(r => [r, f(r.s)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!top.length) return `<div class="lg-ld"><div class="lg-ldk">${l}</div><div class="lg-ldx">Nobody qualifies yet</div></div>`;
    const [r1, v1] = top[0], club = r => r.tid >= 0 ? esc(T(r.tid).abbr) : 'FA';
    return `<div class="lg-ld"><div class="lg-ldk">${l}</div><div class="lg-l1${r1.tid === u ? ' me' : ''}">${r1.tid >= 0 ? lgMed(r1.tid, { metal: 'gold', cls: 'xs', tip: `${pname(r1.p)} · ${teamName(r1.tid)}` }) : ''}<span class="lg-l1n">${playerLink(r1.p, true)}<i>${esc(r1.p.lbl)} · ${club(r1)}</i></span><b>${fmt(v1, dp)}</b></div>
      ${top.slice(1).map(([r, v], i) => `<div class="lg-l2${r.tid === u ? ' me' : ''}"><i>${i + 2}</i>${playerLink(r.p, true)}<span>${club(r)}</span><b>${fmt(v, dp)}</b></div>`).join('')}</div>`; }).join('')}</section>`;
}
const lgTeamCell = tid => `<span class="lg-tc"><i class="cl-chip" style="background:${T(tid).color}"></i>${lgAb(tid)}</span>`;
const lgTeamOk = tid => ui.statTeam == null || tid === ui.statTeam;
const lgClubOf = p => { const c = typeof clubOf === 'function' ? clubOf(p) : p.tid; return c === null || c === undefined || !T(c) ? -1 : c; };
// everyone's line for a season: this season's running totals while it is played, the record books after
function lgSeasonRows(season, live) {
  const rows = [];
  for (const p of Object.values(state.players)) { const s = live ? (p.stats && p.stats.gp ? p.stats : null) : (p.career || []).find(c => c.season === season); if (s) rows.push({ p, s, tid: live ? lgClubOf(p) : s.tid }); }
  return rows;
}
function lgAdvTable(season, live, G) {
  const u = state.userTid, grp = Object.keys(ADV_GROUPS).includes(ui.advGrp) || ui.advGrp === 'Teams' ? ui.advGrp : 'QB';
  if (grp === 'Teams') {
    const rows = state.teams.map(t => ({ t, a: live ? (t.advS || {}) : (() => { const h = (state.teamHist[t.id] || []).find(x => x.season === season); return h ? { plays: 1, epa: h.offEpa, dPlays: 1, dEpa: h.defEpa } : {}; })() }));
    return table('advteams', [
      { k: 't', l: 'Club', v: r => r.t.abbr, f: r => lgTeamCell(r.t.id) },
      { k: 'oe', l: 'Off EPA/play', v: r => r.a.plays ? r.a.epa / r.a.plays : -9, f: r => r.a.plays ? (r.a.epa / r.a.plays).toFixed(3) : '—', num: 1 },
      { k: 'de', l: 'Def EPA/play', v: r => r.a.dPlays ? -r.a.dEpa / r.a.dPlays : -9, f: r => r.a.dPlays ? (r.a.dEpa / r.a.dPlays).toFixed(3) : '—', num: 1, title: 'Lower is better' },
      { k: 'os', l: 'Off success', v: r => r.a.plays && r.a.succ ? r.a.succ / r.a.plays : 0, f: r => r.a.succ ? Math.round(100 * r.a.succ / r.a.plays) + '%' : '—', num: 1 },
      { k: 'pr', l: 'Pressure% allowed', v: r => r.a.db ? -(r.a.prs || 0) / r.a.db : 0, f: r => r.a.db ? Math.round(100 * (r.a.prs || 0) / r.a.db) + '%' : '—', num: 1 },
      { k: 'dp', l: 'Pressure% made', v: r => r.a.dDb ? (r.a.dPrs || 0) / r.a.dDb : 0, f: r => r.a.dDb ? Math.round(100 * (r.a.dPrs || 0) / r.a.dDb) + '%' : '—', num: 1 },
      { k: 'ed', l: 'Early-down pass%', v: r => r.a.early ? r.a.earlyPass / r.a.early : 0, f: r => r.a.early ? Math.round(100 * r.a.earlyPass / r.a.early) + '%' : '—', num: 1 },
    ], rows, { sort: 'oe', cls: 'rs-tbl lg-tbl', rowClass: r => r.t.id === u ? 'me' : '' });
  }
  const Gp = ADV_GROUPS[grp], qualK = live ? clamp(G / 17, 1 / 17, 1) : 1, rows = []; // qualifying volume scales with games played
  for (const p of Object.values(state.players)) {
    if (!Gp.spots.includes(p.spot)) continue;
    let a = null, tid = lgClubOf(p);
    if (live) a = p.advS; else { const r = (p.career || []).find(c => c.season === season); if (r && r.adv) { a = r.adv; tid = r.tid; } }
    if (!a || !Gp.min(a, qualK) || !lgTeamOk(tid)) continue;
    rows.push({ p, a, tid, g: live ? overallGrade(a, p.spot) : a.g });
  }
  return table('adv-' + grp, [
    { k: 'rk', l: '#', f: (r, i) => i + 1 },
    { k: 'name', l: 'Player', v: r => r.p.last, f: r => playerLink(r.p) },
    { k: 'pos', l: 'Pos', v: r => r.p.lbl, f: r => esc(r.p.lbl) },
    { k: 'tm', l: 'Club', v: r => r.tid >= 0 ? T(r.tid).abbr : 'FA', f: r => r.tid >= 0 ? lgAb(r.tid) : '<span class="muted">FA</span>' },
    { k: 'gr', l: 'Grade', v: r => r.g || 0, f: r => gradeChip(r.g), num: 1 },
    ...Gp.cols.map(([l, fn, dp]) => ({ k: l, l, num: 1, v: r => fn(r.a), f: r => (fn(r.a) || 0).toFixed(dp) })),
  ], rows, { sort: 'gr', limit: 120, cls: 'rs-tbl lg-tbl', rowClass: r => r.tid === u ? 'me' : '' });
}
function lgTeamTable() {
  const u = state.userTid, side = ['off', 'def', 'net'].includes(ui.statSide) ? ui.statSide : 'off', per = ui.statPer !== 'tot', rows = teamTotals().filter(r => r.o.g);
  if (!rows.length) return '<div class="lg-none">No regular-season games have been played yet this year.</div>';
  const team = { k: 't', l: 'Club', v: r => r.t.abbr, f: r => lgTeamCell(r.t.id) }, gp = { k: 'g', l: 'G', v: r => r.o.g, num: 1 }, rk = { k: 'rk', l: '#', f: (r, i) => i + 1 }, rowClass = r => r.t.id === u ? 'me' : '';
  if (side === 'net') {
    const d = (l, k, fn, dp = 1, title = '') => ({ k, l, num: 1, title, v: r => fn(r), f: r => { const v = fn(r); return `<span class="${v > 0 ? 'good' : v < 0 ? 'bad' : ''}">${v > 0 ? '+' : ''}${v.toFixed(dp)}</span>`; } });
    const yds = a => a.passY + a.rushY, ypp = a => a.plays ? yds(a) / a.plays : 0;
    return table('tstat-net', [rk, team, gp,
      d('Pts/G', 'pts', r => (r.o.pts - r.d.pts) / r.o.g), d('Yds/G', 'yds', r => (yds(r.o) - yds(r.d)) / r.o.g), d('Yds/Play', 'ypp', r => ypp(r.o) - ypp(r.d), 2),
      d('Y/Att', 'ypa', r => (r.o.passA ? r.o.passY / r.o.passA : 0) - (r.d.passA ? r.d.passY / r.d.passA : 0), 2), d('Y/Car', 'ypc', r => (r.o.rushA ? r.o.rushY / r.o.rushA : 0) - (r.d.rushA ? r.d.rushY / r.d.rushA : 0), 2),
      d('Sacks', 'sk', r => r.d.sacks - r.o.sacks, 0, 'Sacks made minus sacks allowed'), d('Turnovers', 'to', r => r.d.to - r.o.to, 0, 'Takeaways minus giveaways'),
      d('3rd down %', 'd3', r => 100 * ((r.o.d3a ? r.o.d3c / r.o.d3a : 0) - (r.d.d3a ? r.d.d3c / r.d.d3a : 0)), 1),
    ], rows, { sort: 'pts', rowClass, cls: 'rs-tbl lg-tbl' });
  }
  const A = r => side === 'off' ? r.o : r.d, def = side === 'def';
  const vol = (l, k, fn, title = '') => ({ k, l, num: 1, title, v: r => per ? fn(A(r)) / A(r).g : fn(A(r)), f: r => per ? (fn(A(r)) / A(r).g).toFixed(1) : Math.round(fn(A(r))) });
  const rate = (l, k, fn, dp = 1, title = '') => ({ k, l, num: 1, title, v: r => fn(A(r)), f: r => fn(A(r)).toFixed(dp) });
  return table('tstat-' + side, [rk, team, gp,
    vol(def ? 'Pts allowed' : 'Points', 'pts', a => a.pts), vol('Yards', 'yds', a => a.passY + a.rushY), vol('Plays', 'plays', a => a.plays),
    rate('Yds/Play', 'ypp', a => a.plays ? (a.passY + a.rushY) / a.plays : 0, 2),
    vol('Pass yds', 'passY', a => a.passY), rate('Cmp%', 'pct', a => a.passA ? 100 * a.passC / a.passA : 0), rate('Y/Att', 'ypa', a => a.passA ? a.passY / a.passA : 0, 2),
    vol(def ? 'Sacks' : 'Sacks allowed', 'sacks', a => a.sacks),
    vol('Rush yds', 'rushY', a => a.rushY), vol('Carries', 'rushA', a => a.rushA), rate('Y/Car', 'ypc', a => a.rushA ? a.rushY / a.rushA : 0, 2),
    vol('1st downs', 'fd', a => a.fd), rate('3rd down %', 'd3', a => a.d3a ? 100 * a.d3c / a.d3a : 0),
    vol(def ? 'Takeaways' : 'Giveaways', 'to', a => a.to), vol('Punts', 'punts', a => a.punts),
    ...(def ? [] : [vol('Penalties', 'pen', a => a.pen || 0, 'Accepted penalties committed'), vol('Pen yds', 'penY', a => a.penY || 0)]),
  ], rows, { sort: 'pts', dir: def ? 1 : -1, rowClass, cls: 'rs-tbl lg-tbl' });
}
function statsHTML() {
  const u = state.userTid, ut = T(u), seasons = [state.season, ...state.history.map(h => h.season).filter(x => x !== state.season).reverse()];
  const cat = LG_STAT_TABS.some(x => x[0] === ui.statCat) ? ui.statCat : 'passing';
  const season = cat === 'teams' ? state.season : seasons.includes(ui.statSeason) ? ui.statSeason : state.season;
  const live = season === state.season && (state.phase === 'REG' || state.phase === 'PLAYOFFS');
  const G = live ? Math.max(1, Math.min(state.week - 1, SEASON_WEEKS)) : SEASON_WEEKS;
  // the figures: the league as a whole that season
  const everyone = lgSeasonRows(season, live), sum = k => everyone.reduce((a, r) => a + (r.s[k] || 0), 0);
  const C = sum('passC'), A = sum('passA'), Y = sum('passY'), RA = sum('rushA'), RY = sum('rushY'), FGM = sum('fgm'), FGA = sum('fga');
  const hist = state.history.find(h => h.season === season), sched = lgWeeks(season === state.season ? state.schedule : hist && hist.res && hist.res.reg).flat().filter(g => g.hs !== undefined);
  const figs = [lgFig('Points a game', sched.length ? round1(sched.reduce((a, g) => a + g.hs + g.as, 0) / sched.length / 2) : '—', sched.length ? 'a club' : ''), lgFig('Completion', A ? `${(100 * C / A).toFixed(1)}%` : '—'),
    lgFig('Yards a pass', A ? (Y / A).toFixed(2) : '—', '', 'Passing yards an attempt'), lgFig('Passer rating', A ? passerRating(C, A, Y, sum('passTD'), sum('passInt')).toFixed(1) : '—'), lgFig('Yards a carry', RA ? (RY / RA).toFixed(2) : '—'),
    lgFig('Sacks', everyone.length ? lgNum(sum('sck')) : '—'), lgFig('Interceptions', everyone.length ? sum('passInt') : '—'), lgFig('Field goals', FGA ? `${(100 * FGM / FGA).toFixed(1)}%` : '—')];
  // where your club ranks, scoring and stopping
  const rk = (() => { if (season === state.season) { const recs = standings(); if (!recs.some(r => r.w + r.l + r.t)) return null; return [1 + recs.filter(r => r.pf > recs[u].pf).length, 1 + recs.filter(r => r.pa < recs[u].pa).length, recStr(recs[u])]; }
    const hs = state.teams.map(t => (state.teamHist[t.id] || []).find(x => x.season === season)), me = hs[u]; if (!me) return null; return [1 + hs.filter(x => x && x.pf > me.pf).length, 1 + hs.filter(x => x && x.pa < me.pa).length, lgRec(me.w, me.l, me.t)]; })();
  const teamSel = (() => { const ts = [ut, ...state.teams.filter(t => t.id !== u).sort((a, b) => (a.region + a.name).localeCompare(b.region + b.name))]; return lgSel('', 'statTeam', [['', 'All clubs'], ...ts.map(t => [t.id, `${t.region} ${t.name}${t.id === u ? ' (yours)' : ''}`])], ui.statTeam == null ? '' : ui.statTeam, 'Show one club\'s players'); })();
  const seasonSel = lgSel('', 'statSeason', seasons.map(s => [s, s]), season, 'Season');
  let ctl, body, foot = '';
  if (cat === 'teams') {
    ctl = lgSel('', 'lgTSide', [['off', 'Offense'], ['def', 'Defense'], ['net', 'Differential']], ['off', 'def', 'net'].includes(ui.statSide) ? ui.statSide : 'off') + lgSel('', 'lgTPer', [['pg', 'Per game'], ['tot', 'Totals']], ui.statPer === 'tot' ? 'tot' : 'pg');
    body = lgTeamTable(); foot = `${state.season} regular season. Click a column to sort.${ui.statSide === 'def' ? ' Defense shows what each club has allowed: fewest points first.' : ''}`;
  } else if (cat === 'advanced') {
    const grp = Object.keys(ADV_GROUPS).includes(ui.advGrp) || ui.advGrp === 'Teams' ? ui.advGrp : 'QB';
    ctl = lgSel('', 'lgAdvGrp', [...Object.keys(ADV_GROUPS), 'Teams'].map(k => [k, k === 'Teams' ? 'Clubs' : k]), grp) + seasonSel + (grp === 'Teams' ? '' : teamSel);
    body = lgAdvTable(season, live, G); foot = 'Charted on every snap. Grades: an average starter is about 62, elite 85 and up.';
  } else {
    const C2 = STAT_CATS[cat], rows = everyone.filter(r => (!C2.pos || C2.pos.includes(r.p.pos)) && C2.min(r.s) && lgTeamOk(r.tid));
    ctl = seasonSel + teamSel;
    body = lgLeadsHTML(cat, rows, G) + table('stats-' + cat, [
      { k: 'rk', l: '#', f: (r, i) => i + 1 },
      { k: 'name', l: 'Player', v: r => r.p.last, f: r => playerLink(r.p) },
      { k: 'pos', l: 'Pos', v: r => r.p.lbl, f: r => esc(r.p.lbl) },
      { k: 'tm', l: 'Club', v: r => r.tid >= 0 ? T(r.tid).abbr : 'FA', f: r => r.tid >= 0 ? lgAb(r.tid) : '<span class="muted">FA</span>' },
      { k: 'gp', l: 'GP', v: r => r.s.gp || 0, num: 1 },
      ...C2.cols.map(([k, l, fn]) => ({ k, l, num: 1, v: r => fn ? fn(r.s) : (r.s[k] || 0) })),
    ], rows, { sort: C2.sort, limit: 150, cls: 'rs-tbl lg-tbl', rowClass: r => r.tid === u ? 'me' : '' });
    if (!live) foot = 'Past seasons list the players still in the league.';
  }
  const label = (LG_STAT_TABS.find(x => x[0] === cat) || [])[1];
  return lgSheet('lg-sts', { title: 'League stats', over: `The league · ${season} · ${live ? esc(lgWhen()) : 'Regular season'} · ${label}`, wm: String(season), big: rk ? rk[2] : '—', place: rk ? `${esc(ut.abbr)} · ${ordinal(rk[0])} in points, ${ordinal(rk[1])} in points allowed` : esc(ut.abbr) }, figs,
    lgBarHTML(LG_STAT_TABS.map(([k, l]) => [k, l]), cat, 'lgCat', ctl), `<div class="rs-scroll lg-scroll">${body}${foot ? `<div class="rs-foot">${foot}</div>` : ''}</div>`);
}

// ---------- history ----------
function lgAllTime(tid) { return (state.teamHist[tid] || []).reduce((a, s) => ({ w: a.w + s.w, l: a.l + s.l, t: a.t + s.t, ti: a.ti + (s.result === 'Won Championship' ? 1 : 0), po: a.po + (s.seed ? 1 : 0), n: a.n + 1 }), { w: 0, l: 0, t: 0, ti: 0, po: 0, n: 0 }); }
function lgFinalOf(h) { const br = h.wrap && h.wrap.bracket, g = br && br.length ? br[br.length - 1].games[0] : null; return g && g.score ? g : null; }
function historyHTML() {
  const u = state.userTid, ut = T(u), hs = state.history, rs = Object.values(state.retired || {}), view = ui.histView === 'retired' ? 'retired' : 'league';
  const tid = ui.histTid != null && T(ui.histTid) ? ui.histTid : u, th = state.teamHist[tid] || [], me = lgAllTime(u), titles = {};
  for (const h of hs) titles[h.champ] = (titles[h.champ] || 0) + 1;
  const most = Object.entries(titles).sort((a, b) => b[1] - a[1])[0];
  const figs = [lgFig('Seasons', hs.length), lgFig('Champions', Object.keys(titles).length, Object.keys(titles).length === 1 ? 'club' : 'clubs'), lgFig('Most titles', most ? `${lgAb(+most[0])} ${most[1]}` : '—'),
    lgFig('Your titles', me.ti), lgFig('Your playoffs', me.po, me.po === 1 ? 'year' : 'years'), lgFig('Your record', me.n ? lgRec(me.w, me.l, me.t) : '—'), lgFig('Retired players', rs.length)];
  const bar = lgBarHTML([['league', 'Champions and clubs'], ['retired', 'Retired players', rs.length]], view, 'lgHistView', '');
  const mast = { title: 'History', over: `The league · ${hs.length} season${hs.length === 1 ? '' : 's'} in the books`, wm: hs.length > 1 ? `${hs[0].season}–${hs[hs.length - 1].season}` : hs.length ? String(hs[0].season) : String(state.season), big: me.n ? lgRec(me.w, me.l, me.t) : '—', place: `${esc(ut.abbr)} all time · ${me.ti} title${me.ti === 1 ? '' : 's'} · ${me.po} playoff trip${me.po === 1 ? '' : 's'}` };
  if (view === 'retired') {
    const pk = r => tierOf({ age: 30, pos: r.pos }, r.pk, r.pos);
    const tbl = rs.length ? table('retired', [
      { k: 'n', l: 'Player', v: r => r.n, f: r => `<b>${esc(r.n)}</b>` }, { k: 'pos', l: 'Pos', v: r => r.pos, f: r => esc(r.lbl || r.pos) },
      { k: 'yrs', l: 'Career', v: r => r.to, f: r => `${r.from}–${r.to}` }, { k: 'sn', l: 'Seasons', v: r => r.yrs, num: 1 },
      { k: 'tm', l: 'Clubs', f: r => (r.tm || []).map(lgAb).join(' ') },
      { k: 'dr', l: 'Drafted', v: r => r.dr ? -r.dr[2] : -999, f: r => r.dr ? `${r.dr[0]} R${r.dr[1]} #${r.dr[2]}` : '<span class="muted">Undrafted</span>' },
      { k: 'pk', l: 'At his best', v: r => r.pk, f: r => `<span class="pill ${TIER_CLS[pk(r)] || ''}">${pk(r)}</span>` },
      { k: 'gp', l: 'GP', v: r => r.tot.gp || 0, num: 1 }, { k: 'gs', l: 'GS', v: r => r.tot.gs || 0, num: 1 },
      { k: 'line', l: 'Career totals', f: r => `<span class="small">${statSummary(r.tot, r.pos)}</span>` },
      { k: 'aw', l: 'Awards', v: r => (r.aw || []).length, f: r => (r.aw || []).length ? `<span class="small" title="${esc(r.aw.join(' | '))}">${r.aw.length}</span>` : '', num: 1 },
    ], rs, { sort: 'pk', limit: 250, cls: 'rs-tbl lg-tbl' }) : '<div class="lg-none">Nobody has retired yet.</div>';
    return lgSheet('lg-hist', mast, figs, bar, `<div class="rs-scroll lg-scroll">${tbl}</div>`);
  }
  // the roll of champions, newest first
  const who = (a, k) => a ? `<span class="lg-cra"><i>${k}</i>${a.pid !== undefined && P(a.pid) ? playerLink(P(a.pid), true) : esc(a.name)} <em>${esc(T(a.tid).abbr)} ${esc(a.pos)}</em></span>` : '';
  const roll = hs.length ? hs.slice().reverse().map(h => { const g = lgFinalOf(h), aw = h.awards || {};
    return `<div class="lg-cr${h.champ === u ? ' me' : ''}"><b class="lg-cy">${h.season}</b>${lgMed(h.champ, { metal: 'gold', cls: 'xs', tip: `${teamName(h.champ)}: ${h.season} champions` })}<div class="lg-crn"><div class="cl-ow">${clubTag(h.champ)}</div><span>beat ${clubTag(h.runnerUp)}${g ? ` ${Math.max(...g.score)}–${Math.min(...g.score)}` : ''}</span></div>
      <div class="lg-craw">${who(aw.mvp, 'MVP')}${who(aw.dpoy, 'DPOY')}</div><button class="link cl-more" data-action="seasonOpen" data-s="${h.season}">Review ›</button></div>`; }).join('') : '<div class="lg-none">Finish a season to start the history books.</div>';
  // a club's years
  const opts = [ut, ...state.teams.filter(t => t.id !== u).sort((a, b) => (a.region + a.name).localeCompare(b.region + b.name))].map(t => [t.id, `${t.region} ${t.name}${t.id === u ? ' (yours)' : ''}`]);
  const at = lgAllTime(tid), bestS = th.slice().sort((a, b) => (b.w + b.t / 2) - (a.w + a.t / 2) || (b.pf - b.pa) - (a.pf - a.pa))[0];
  const bars = th.length ? `<div class="lg-wins" title="Wins each season: gold a title, the club's color a playoff year">${th.map(s => `<i class="${s.result === 'Won Championship' ? 'ti' : s.seed ? 'po' : ''}" style="height:${Math.max(6, Math.round(100 * (s.w + s.t / 2) / 17))}%" title="${s.season}: ${lgRec(s.w, s.l, s.t)} · ${esc(s.result)}"><b>${String(s.season).slice(-2)}</b></i>`).join('')}</div>` : '';
  const club = `<div class="lg-cl"><div class="lg-clk"><span><b>${at.n ? lgRec(at.w, at.l, at.t) : '—'}</b> all time</span><span><b>${at.ti}</b> title${at.ti === 1 ? '' : 's'}</span><span><b>${at.po}</b> playoff year${at.po === 1 ? '' : 's'}</span>${bestS ? `<span>Best: <b>${bestS.season}</b> ${lgRec(bestS.w, bestS.l, bestS.t)}</span>` : ''}</div>${bars}
    ${th.length ? `<table class="cl-tbl lg-th"><thead><tr><th class="l">Season</th><th>Record</th><th>PF</th><th>PA</th><th>Seed</th><th class="l">Result</th></tr></thead><tbody>${th.slice().reverse().map(s => `<tr class="${s.result === 'Won Championship' ? 'ti' : ''}"><td class="l"><b>${s.season}</b></td><td>${lgRec(s.w, s.l, s.t)}</td><td>${s.pf}</td><td>${s.pa}</td><td>${s.seed || ''}</td><td class="l ${s.result === 'Won Championship' ? 'good' : s.result === 'Missed playoffs' ? 'muted' : ''}">${esc(s.result)}</td></tr>`).join('')}</tbody></table>` : '<div class="lg-none">No finished seasons yet.</div>'}</div>`;
  return lgSheet('lg-hist', mast, figs, bar, `<div class="lg-body lg-hb">${lgPane('lg-roll', 'Champions', '', roll)}${lgPane('lg-club', 'Club history', `<select class="lg-psel" data-change="histTeam" title="Another club's history">${opts.map(([v, l]) => `<option value="${v}" ${v === tid ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`, club, clubVarsCSS(tid))}</div>`);
}

// ---------- the season in review ----------
const LG_AW = { mvp: 'MVP', opoy: 'OPOY', dpoy: 'DPOY', oroy: 'OROY', droy: 'DROY', cpoy: 'CPOY', mip: 'MIP', oly: 'OLY', moy: 'MOY', coy: 'COY', acoy: 'ACOY', exec: 'EXEC' };
function seasonHTML() {
  const hs = state.history, u = state.userTid, ut = T(u);
  if (!hs.length) return lgSheet('lg-rev', { title: 'Season review', over: `The league · ${state.season}`, wm: String(state.season), big: '—', place: 'No season finished yet' }, [lgFig('Champion', '—'), lgFig('MVP', '—')], '', '<div class="lg-body"><div class="lg-none">Finish a season and its review opens here.</div></div>');
  const h = hs.find(x => x.season === ui.seasonYr) || hs[hs.length - 1], w = h.wrap || {}, aw = h.awards || {}, ct = T(h.champ), fg = lgFinalOf(h);
  const chs = [['awards', 'Awards'], ...(w.allPro ? [['allpro', 'All-Pro']] : []), ...(w.proBowl ? [['probowl', 'Pro Bowl']] : []), ...(w.leaders ? [['leaders', 'Leaders']] : []), ...(w.bracket && w.bracket.length ? [['playoffs', 'The playoffs']] : [])];
  const ch = chs.some(x => x[0] === ui.revCh) ? ui.revCh : 'awards';
  const pl = x => `<span class="lg-pp${x.tid === u ? ' me' : ''}">${P(x.pid) ? playerLink(P(x.pid), true) : esc(x.name)}<em>${esc(T(x.tid).abbr)}</em></span>`;
  // the figures: the champion, the MVP, and the league's story
  const lf = (w.league || []).map(l => lgFig(esc(l.label), lgAb(l.tid), esc(l.line.replace(/ points a game$/, '/g').replace(/ allowed a game$/, '/g')), l.line));
  const figs = [lgFig('Champion', lgAb(h.champ), fg ? `${Math.max(...fg.score)}–${Math.min(...fg.score)}` : ''), lgFig('Runner-up', lgAb(h.runnerUp)), lgFig('MVP', aw.mvp ? (P(aw.mvp.pid) ? playerLink(P(aw.mvp.pid), true) : esc(aw.mvp.name)) : '—', aw.mvp ? esc(T(aw.mvp.tid).abbr) : ''), ...lf];
  let body;
  if (ch === 'awards') {
    const card = (k, big) => { const a = aw[k]; if (!a) return '';
      const who = a.pid !== undefined && P(a.pid) ? playerLink(P(a.pid)) : a.cid !== undefined && C(a.cid) ? coachNameLink(C(a.cid)) : `<b>${esc(a.name)}</b>`;
      return `<div class="lg-aw${big ? ' big' : ''}${a.tid === u ? ' me' : ''}" style="${clubVarsCSS(a.tid)}"><span class="lg-awd m-${big ? 'gold' : 'silver'}" title="${esc(AWARD_NAMES[k] || k)}"><span class="pm-disc"><b>${LG_AW[k] || esc(k)}</b></span></span>
        <div class="lg-awt"><i>${k === 'mvp' ? 'Most Valuable Player' : esc(AWARD_NAMES[k] || k)}</i><span class="lg-awn">${who}</span><span class="lg-awc">${clubTag(a.tid)}<em>${esc(a.pos)}</em></span><span class="lg-awl" title="${esc((a.line || '') + (a.note ? ' · ' + a.note : ''))}">${esc(a.line || '')}${a.note ? ` · ${esc(a.note)}` : ''}</span></div></div>`; };
    const small = ['oroy', 'droy', 'cpoy', 'mip', 'oly', 'moy'].filter(k => aw[k]), staff = ['coy', 'acoy', 'exec'].filter(k => aw[k]);
    body = `<div class="lg-aws">${['mvp', 'opoy', 'dpoy'].map(k => card(k, true)).join('')}</div>${small.length ? `<div class="lg-sh">Players</div><div class="lg-aws sm">${small.map(k => card(k)).join('')}</div>` : ''}
      ${staff.length ? `<div class="lg-sh">Coaches and front offices</div><div class="lg-aws sm">${staff.map(k => card(k)).join('')}</div>` : ''}${h.wrap ? '' : '<div class="lg-cap">This season was played before the full review existed, so only the main awards were kept.</div>'}`;
  } else if (ch === 'allpro') {
    const rows = HONOR_SLOTS.map(([g]) => ({ g, a: w.allPro[1].filter(x => x.g === g), b: w.allPro[2].filter(x => x.g === g) })).filter(r => r.a.length || r.b.length);
    const n = [...w.allPro[1], ...w.allPro[2]].filter(x => x.tid === u).length;
    body = `<div class="lg-two"><div><div class="lg-sh">All-Pro teams${n ? ` <span class="lg-shn">${n} of yours</span>` : ''}</div><table class="cl-tbl lg-hon"><thead><tr><th class="l">Position</th><th class="l">First team</th><th class="l">Second team</th></tr></thead><tbody>${rows.map(r => `<tr><th class="l">${HONOR_NAME[r.g]}</th><td class="l">${r.a.map(pl).join('')}</td><td class="l">${r.b.map(pl).join('')}</td></tr>`).join('')}</tbody></table>
      <div class="lg-cap">The best season at every position: production where the position has it, the season grade where it does not.</div></div>
      <div><div class="lg-sh">All-Rookie team</div>${w.allRookie && w.allRookie.length ? `<table class="cl-tbl lg-hon"><tbody>${ROOKIE_SLOTS.map(([g]) => { const l = w.allRookie.filter(x => x.g === g); return l.length ? `<tr><th class="l">${HONOR_NAME[g]}</th><td class="l">${l.map(pl).join('')}</td></tr>` : ''; }).join('')}</tbody></table>` : '<div class="lg-none">No rookies played enough to qualify.</div>'}</div></div>`;
  } else if (ch === 'probowl') {
    const confs = Object.keys(w.proBowl).sort(), n = confs.reduce((a, c) => a + w.proBowl[c].filter(x => x.tid === u).length, 0);
    body = `<div class="lg-sh">The Pro Bowl: the best of each conference${n ? ` <span class="lg-shn">${n} of yours</span>` : ''}</div><table class="cl-tbl lg-hon"><thead><tr><th class="l">Position</th>${confs.map(c => `<th class="l">${esc(c)}</th>`).join('')}</tr></thead><tbody>${PRO_BOWL_SLOTS.map(([g]) => `<tr><th class="l">${HONOR_NAME[g]}</th>${confs.map(c => `<td class="l">${w.proBowl[c].filter(x => x.g === g).map(pl).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  } else if (ch === 'leaders') {
    body = `<div class="lg-boards">${w.leaders.filter(l => l.rows.length).map(l => `<div class="lg-ld"><div class="lg-ldk">${esc(l.label)}</div>${l.rows.map((r, i) => i === 0
      ? `<div class="lg-l1${r.tid === u ? ' me' : ''}">${lgMed(r.tid, { metal: 'gold', cls: 'xs' })}<span class="lg-l1n">${P(r.pid) ? playerLink(P(r.pid), true) : esc(r.name)}<i>${esc(r.pos)} · ${esc(T(r.tid).abbr)}</i></span><b>${r.v % 1 ? r.v : lgNum(r.v)}</b></div>`
      : `<div class="lg-l2${r.tid === u ? ' me' : ''}"><i>${i + 1}</i>${P(r.pid) ? playerLink(P(r.pid), true) : esc(r.name)}<span>${esc(T(r.tid).abbr)}</span><b>${r.v % 1 ? r.v : lgNum(r.v)}</b></div>`).join('')}</div>`).join('')}</div>`;
  } else {
    const seed = tid => { const e = (state.teamHist[tid] || []).find(x => x.season === h.season); return e && e.seed ? e.seed : null; }, top = {};
    for (const c of lgConfs()) { const t = state.teams.find(x => x.conf === c && seed(x.id) === 1); if (t) top[c] = t.id; }
    body = lgBracketHTML({ rounds: w.bracket.map(rd => ({ name: rd.name, games: rd.games.map(g => ({ h: g.h, a: g.a, hs: g.score ? g.score[0] : undefined, as: g.score ? g.score[1] : undefined, win: g.win, gid: g.gid })) })), top, champ: h.champ, seed });
  }
  // your season, beside it
  const m = w.mine, mineAw = Object.keys(aw).filter(k => aw[k].tid === u), ap = w.allPro ? [...w.allPro[1], ...w.allPro[2]].filter(x => x.tid === u).length : 0, pb = w.proBowl ? Object.values(w.proBowl).flat().filter(x => x.tid === u).length : 0, ar = w.allRookie ? w.allRookie.filter(x => x.tid === u).length : 0;
  const prow = (l, x) => x ? `<span class="dk-k">${l}</span><span>${P(x.pid) ? playerLink(P(x.pid)) : esc(x.name)} <i class="muted">${esc(x.pos)} · ${esc(x.line)}${x.note ? ' · now ' + esc(x.note) : ''}</i></span>` : '';
  const you = `<div class="lg-you"><div class="lg-yb"><b>${esc(m ? m.rec : h.userRec || '—')}</b><span>${esc(m ? m.result : '')}</span></div>
    ${m ? `<div class="lg-yk"><span class="dk-k">Points scored</span><span><b>${m.pf}</b> <i class="muted">No. ${m.offRk} in the league</i></span><span class="dk-k">Points allowed</span><span><b>${m.pa}</b> <i class="muted">No. ${m.defRk}</i></span>${prow('Best season', m.mvp)}${prow('Top rookie', m.rookie)}${prow('Biggest step', m.improved)}</div>` : ''}
    <div class="lg-yh">${mineAw.map(k => `<span class="pill good" title="${esc(aw[k].name)}">${esc(AWARD_NAMES[k])}</span>`).join('')}${ap ? `<span class="pill">${ap} All-Pro</span>` : ''}${pb ? `<span class="pill">${pb} Pro Bowl</span>` : ''}${ar ? `<span class="pill">${ar} All-Rookie</span>` : ''}${!mineAw.length && !ap && !pb && !ar ? '<i class="muted">No honors this year.</i>' : ''}</div></div>`;
  return lgSheet('lg-rev', { tid: h.champ, title: `${esc(ct.region)} <b>${esc(ct.name)}</b>`, over: `${h.season} season in review · league champions`, wm: String(h.season), big: fg ? (fg.gid !== undefined && state.games[fg.gid] ? `<button class="link" data-action="box" data-gid="${fg.gid}" title="Box score of the final">${Math.max(...fg.score)}–${Math.min(...fg.score)}</button>` : `${Math.max(...fg.score)}–${Math.min(...fg.score)}`) : '🏆', place: `beat the ${esc(T(h.runnerUp).name)} in the final` }, figs,
    lgBarHTML(chs, ch, 'lgRevCh', lgSel('Season', 'seasonPick', hs.slice().reverse().map(x => [x.season, x.season]), h.season)),
    `<div class="lg-body lg-revb"><section class="lg-pane lg-ch"><div class="lg-pb">${body}</div></section>${lgPane('lg-yours', `${esc(ut.abbr)} · your season`, `<button class="link cl-more" data-action="team" data-tid="${u}">Your club ›</button>`, you)}</div>`);
}

if (typeof actions !== 'undefined') Object.assign(actions, {
  lgStView: d => { ui.stView = d.v; render(); },
  lgPart: d => { ui.schedPart = d.v; ui.schedWeekA = 1; render(); },
  lgWeek: d => { const n = +d.w; if (!(n >= 1)) return; if (ui.lgLive) ui.schedWeek = n; else ui.schedWeekA = n; render(); },
  lgCat: d => { ui.statCat = d.v; render(); },
  lgHistView: d => { ui.histView = d.v; render(); },
  lgRevCh: d => { ui.revCh = d.v; render(); },
});
if (typeof changes !== 'undefined') Object.assign(changes, {
  lgAdvGrp: v => { ui.advGrp = v; },
  lgTSide: v => { ui.statSide = v; },
  lgTPer: v => { ui.statPer = v; },
});
// ← → walks the weeks of the schedule
if (typeof document !== 'undefined') document.addEventListener('keydown', e => {
  if (!state || view !== 'schedule' || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || (e.target.closest && e.target.closest('input, select, textarea')) || !$('#modal').classList.contains('hidden')) return;
  const b = document.querySelector(`.lg-wn .pr-nav:${e.key === 'ArrowRight' ? 'last-of-type' : 'first-of-type'}`);
  if (b && !b.disabled) { e.preventDefault(); b.click(); }
});
