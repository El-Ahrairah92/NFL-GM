// =====================================================================
//  THE DEPTH CHART
//  Who plays, in what order: one sheet the size of the screen, nothing to scroll. The club's band and the figures that matter
//  on game day; then, on the left, the field (the lineup in any look, every man a medallion rimmed in the metal of his level at
//  the job, as the staff's medallions are) and under it the players (the job you are on and everyone who could do it, best
//  first, or the man you picked); on the right the chart (every job a row, printed the way a club prints one: first team,
//  second team, third team). Drag a man anywhere: along a row to reorder it, onto another row to add him there, onto a
//  medallion for that look only. Click him for what he is and what you can do with him.
// =====================================================================
const DK_UNITS = [['def', 'Defense'], ['off', 'Offense'], ['st', 'Special teams']];
const DK_SIDE = { def: 'defense', off: 'offense', st: 'special teams' };
function dkTab() { return ['def', 'off', 'st'].includes(ui.dchTab) ? ui.dchTab : 'def'; }
function dkTierCls(tr) { return !tr ? '' : THIN_TIERS.has(tr) ? 't-thin' : OK_TIERS.has(tr) ? 't-soft' : 't-good'; }
// a man's level at a job in the metals of the staff's medallions: gold, silver, bronze, iron (steel: a job with no grade)
function dkMetal(tr) { return !tr ? 'steel' : tr === 'Elite' || tr === 'All-Pro' ? 'gold' : tr === 'Starter' ? 'silver' : OK_TIERS.has(tr) ? 'bronze' : 'iron'; }
const DK_METAL_KEY = [['gold', 'Elite'], ['silver', 'Starter'], ['bronze', 'Backup'], ['iron', 'Depth']];
// the stamp on a medallion: the job in a few letters
const DK_CODE = { NOSE: 'NT', T3: '3T', WE: 'WE', SE: 'SE', WOLB: 'OLB', SOLB: 'OLB', DT: 'DT', WEDGE: 'WE', SEDGE: 'SE', MLB: 'MLB', WLB: 'WLB', SAM: 'SAM', CB: 'CB', NCB: 'NB', DIME: 'DB', FS: 'FS', SS: 'SS',
  RUSHE: 'ER', RUSHI: 'IR', WLBP: 'WLB', NCBP: 'NB', QB: 'QB', RB: 'RB', FB: 'FB', RB3D: 'RB', RBSY: 'RB', X: 'X', Z: 'Z', SLOT: 'SL', SLOT2: 'SL', Y: 'Y', H: 'H', Y2: 'Y', Y3D: 'Y', LT: 'LT', LG: 'LG', C: 'C', RG: 'RG', RT: 'RT', OL6: 'OL' };
const dkCode = k => DK_CODE[k] || String(JOB_SHORT[k] || k).replace(/[^A-Z0-9]/g, '').slice(0, 3);
const dkShort = k => JOB_SHORT[k] || chartName(k);
// everything the three parts of the page share
function dkCtx() {
  const u = state.userTid, t = T(u), cg = ensureChart(u); refreshChart(u);
  const prac = ui.scMode === 'prac', c = prac ? pracChart(u) : cg, tab = dkTab(), ro = rosterOf(u).filter(p => p.a), J = tab === 'def' ? defJobs(t) : null;
  const probs = prac ? [] : chartProblems(u), mine = probs.filter(p => p.tab === tab);
  const groups = DC_GROUPS[tab].map(([title, keys]) => [title, keys.filter(k => (tab !== 'def' || J.n[k] || ['RUSHE', 'RUSHI', 'WLBP', 'NCBP'].includes(k)) && (!prac || REP_JOB[k]))]).filter(g => g[1].length);
  const jobs = groups.flatMap(g => g[1]);
  const need = k => prac && REP_JOB[k] ? REP_JOB[k][3] : tab === 'def' ? (J.n[k] || (k === 'RUSHE' || k === 'RUSHI' ? 2 : 1)) : ST_UNIT[k] ? 10 : 1;
  const job = jobs.includes(ui.dcJob) ? ui.dcJob : jobs[0]; ui.dcJob = job;
  const listOf = k => (c.lists[k] || []).map(id => P(id)).filter(p => p && p.tid === u);
  const startsAt = {}; for (const k of jobs) (c.lists[k] || []).slice(0, need(k)).forEach(id => { if (!startsAt[id]) startsAt[id] = k; });
  const L = listOf(job), pick = ui.dchPid && ro.some(p => p.id === ui.dchPid) ? P(ui.dchPid) : L[0] || null;
  return { u, t, c, cg, prac, tab, ro, J, probs, mine, groups, jobs, need, job, listOf, startsAt, pick, auto: !prac && !!c.auto[tab] };
}
// a man's places on this side of the chart: [[job, index]]
function dkListed(x, p) { return x.jobs.map(k => [k, (x.c.lists[k] || []).indexOf(p.id)]).filter(e => e[1] >= 0); }

// ---------- the chart: a row a job ----------
// a man on the chart: his place in a little medallion (the club's leather for a starter, steel behind him; the rim his level)
function dkChipHTML(x, p, k, i, n) {
  const tr = jobTier(p, k), sat = !x.prac && dcSat(p), sel = x.pick && x.pick.id === p.id && x.job === k, at = x.startsAt[p.id], u = i < n ? 1 : i < 2 * n ? 2 : i < 3 * n ? 3 : 4;
  const cf = jobSide(k) === 'st' ? '' : comfortLabel(jobComfort(p, k)), L = x.listOf(k);
  const tip = `${pname(p)} · ${p.lbl}${tr ? ` · ${tr} at ${jobLabel(k).toLowerCase()}` : ''}${cf && cf !== 'Natural' ? ` · ${cf} here` : ''}${p.injury ? ` · out ${p.injury.weeks} wk` : ''}${sat ? ' · sitting' : ''}${at && at !== k && i >= n ? ` · starts at ${jobLabel(at).toLowerCase()}: while he is there the next man plays here` : ''}`;
  const mv = (to, l) => `<button class="dk-mk" data-action="dcMove" data-key="${k}" data-pid="${p.id}" data-to="${to}">${l}</button>`;
  const el = at && at !== k && i >= n;
  return `<div class="dk-chip u${u} ${sel ? 'sel' : ''} ${sat ? 'sat' : ''} ${p.injury ? 'inj' : ''} ${el ? 'el' : ''}" draggable="true" data-dcp="${p.id}" data-dci="${i}" data-dcjob="${k}" data-action="dkPick" data-pid="${p.id}" data-key="${k}" data-mkl="Show him" title="${esc(tip)}">
    <i class="dk-n m-${dkMetal(tr)}"><span>${i + 1}</span></i><b>${esc(p.last)}</b>${dcDot(p, k)}${p.elev && p.elev.preview ? '<i class="dk-ps" title="Practice squad: comes up for this game">PS</i>' : ''}
    <button class="dk-x" data-action="dcRemove" data-key="${k}" data-i="${i}" title="Take him off ${esc(jobLabel(k).toLowerCase())}">×</button>
    ${i > 1 ? mv(0, 'Move to the top') : ''}${i > 0 ? mv(i - 1, 'Move up one') : ''}${i < L.length - 1 ? mv(i + 1, 'Move down one') : ''}${x.prac ? '' : `<button class="dk-mk" data-action="dcSit" data-pid="${p.id}">${sat ? 'Play him: stop sitting him' : 'Sit him: no snaps anywhere'}</button><button class="dk-mk" data-action="dcOut" data-pid="${ui.dcOut === p.id ? 0 : p.id}">${ui.dcOut === p.id ? 'Back to the real lineup' : 'Show the field without him'}</button>`}<span class="dk-mk" data-action="player" data-pid="${p.id}">${esc(pname(p))}</span></div>`;
}
// an open place in a job's order: a list of the men who could fill it, best first
function dkAddHTML(x, k, i, empty, small) {
  const on = new Set(x.c.lists[k] || []), cands = dkCands(x, k).filter(p => !on.has(p.id)).slice(0, 24);
  return `<label class="dk-add ${empty ? 'need' : ''} ${small ? 'small' : ''}" title="Put a man here"><span>${empty ? 'Needs a man' : small ? '+' : '+ Add'}</span><select data-change="dkPut" data-key="${k}" data-i="${i}" aria-label="Add a man to ${esc(jobLabel(k))}"><option value="">${esc(jobLabel(k))}: who?</option>${cands.map(p => { const tr = jobTier(p, k), at = x.startsAt[p.id];
    return `<option value="${p.id}">${esc(pshort(p))} · ${esc(p.lbl)}${tr ? ' · ' + tr : ''}${at ? ' · starts at ' + dkShort(at) : ''}</option>`; }).join('')}</select></label>`;
}
function dkRowHTML(x, k) {
  const { prac, need, job, listOf, mine, u, c } = x, L = listOf(k), n = need(k), m = prac ? Math.max(L.length + 1, 3 * n) : chartMax(k, u), on = k === job, prob = mine.some(p => p.key === k), st = !!ST_UNIT[k], span = st || ['K', 'P', 'KR', 'PRET'].includes(k);
  const chip = (p, i) => dkChipHTML(x, p, k, i, n);
  let cells = '';
  if (span) {
    cells = `<div class="dk-cell dk-span" data-dcjob="${k}">${L.map(chip).join('')}${L.length < m ? dkAddHTML(x, k, L.length, !L.length && prob, false) : ''}</div>`;
  } else for (let g = 0; g < 4; g++) {
    const a = g * n, b = g < 3 ? a + n : m; let inner = '';
    for (let i = a; i < b; i++) { if (i < L.length) inner += chip(L[i], i); else { if (i === L.length && i < m) inner += dkAddHTML(x, k, i, g === 0 && prob, i > a); else if (g === 0 && prob) inner += '<span class="dk-hole" title="A starter is missing here">—</span>'; break; } }
    cells += `<div class="dk-cell c${g + 1}${n > 1 ? ' multi' : ''}" data-dcjob="${k}" data-dci="${Math.min(a, L.length)}">${inner}</div>`;
  }
  if (isPhone()) cells = `<div class="dk-strip" data-dcjob="${k}">${L.map(chip).join('')}${L.length < m ? dkAddHTML(x, k, L.length, !L.length && prob, false) : ''}</div>`; // a phone: the job's men in a line you swipe along
  const rot = !prac && ROT_KEYS.has(k) && c.rot && c.rot[k] !== undefined && ROT_BAND[k] && Math.abs(c.rot[k] - ROT_BAND[k][1]) > 0.005 ? `<i class="dk-tg" title="The next man's share of the snaps">rot ${Math.round(rotOf(c, k) * 100)}%</i>` : '';
  const tags = `${n > 1 && !st ? `<i class="dk-tg" title="${n} men play this job at once: the first ${n} listed all start">${n} start</i>` : st ? '<i class="dk-tg">10 men</i>' : ''}${rot}${prac && c.own && c.own[k] ? '<i class="dk-tg own" title="You set this practice order; it no longer follows the game order">yours</i>' : ''}${prob ? '<i class="dk-tg bad">needs a man</i>' : ''}`;
  return `<div class="dk-row ${on ? 'on' : ''} ${prob ? 'bad' : ''} ${span ? 'st' : ''} ${n > 1 && !span ? 'two' : ''}" data-dcjob="${k}"><button class="dk-job" data-action="dcJob" data-key="${k}" title="${esc(JOB_HELP[k] || jobLabel(k))}"><b>${esc(jobLabel(k))}</b><span>${tags}</span></button>${cells}</div>`;
}
// the chart in its sections; each section's head carries the column heads, so a chart folded into two columns reads the same
function dkBoardHTML(x) {
  const heads = x.prac ? ['Ones', 'Twos', 'Threes', 'The rest'] : ['1st team', '2nd team', '3rd team', 'Reserve'];
  return x.groups.map(([title, keys]) => `<div class="dk-grp"><div class="dk-row dk-sec ${x.tab === 'st' ? 'st' : ''}"><span><b>${esc(title)}</b>${keys.some(k => x.mine.some(p => p.key === k)) ? '<i class="dk-tg bad">needs a man</i>' : ''}</span>${x.tab === 'st' ? '' : heads.map(l => `<span>${l}</span>`).join('')}</div>${keys.map(k => dkRowHTML(x, k)).join('')}</div>`).join('');
}

// ---------- the field: the lineup in one look, every man a medallion where he lines up ----------
function dkFieldHTML(x) {
  const { t, u, tab, prac, c, auto, ro } = x; if (tab === 'st') return '';
  const views = dcViews(t, tab); ui.dchView = ui.dchView || {};
  const vid = views.some(v => v.id === ui.dchView[tab]) ? ui.dchView[tab] : views[0].id, vw = views.find(v => v.id === vid);
  const sub = tab === 'def' && (vw.pkg === 'NICKEL' || vw.pkg === 'DIME'), pass = tab === 'off' ? (ui.dcSit === 'pass' || ui.dcSit === 'short' ? ui.dcSit : false) : sub && ui.dcPass === '1';
  const outP = ui.dcOut && ro.some(p => p.id === ui.dcOut) ? P(ui.dcOut) : null, pstr = [0, 1, 2].includes(ui.pracStr) ? ui.pracStr : 0, pl0 = prac ? pracLineup(t, tab, vid, pass, pstr) : null;
  const lay = prac ? pl0.lay : dcLayout(t, tab, vid, pass), normal = prac ? pl0.m : dcLineup(u, tab, vid, pass), lineup = outP && !prac ? dcLineup(u, tab, vid, pass, outP.id) : normal, ok = ovKeyFor(t, tab, vid, pass);
  const whyText = (b, p) => { const w = lineup._why[b.name]; if (prac || !w || w === 'ov' || auto) return null;
    if (w === 'rot' || w === 'tired') return ['rest', 'In while the man ahead of him takes a breather'];
    const list = c.lists[b.key] || [], at = q => lay.find(z => lineup[z.name] === q);
    const above = (w === 'staff' ? list : list.slice(0, Math.max(0, list.indexOf(p.id)))).map(id => P(id)).filter(q => q && q.tid === u);
    const why = above.map(q => (outP && q.id === outP.id) || q.injury ? `${q.last} is out` : at(q) ? `${q.last} is at ${at(q).label.toLowerCase()} in this look` : dcSat(q) ? `${q.last} is sitting` : onIR(q) ? `${q.last} is on injured reserve` : `${q.last} is inactive: the staff left him out of the ${GAMEDAY_ACTIVE}`);
    if (w === 'staff') return ['staff', "Nobody left on this job's list, so the staff put him here" + (why.length ? ': ' + why.join(' · ') : '')];
    return ['next up', why.length ? why.join(' · ') : 'Next man up']; };
  // where each man stands: across the field by his alignment; down it on one of four levels (defense: the deep men, the corners,
  // the linebackers, the line; offense: the line, the receivers and a quarterback under center, the quarterback in the gun and
  // the fullback, the tailback), eased apart along his level so no two medallions touch. A man with room to either side gets
  // a wider plate; every disc is the size the most crowded level allows, and a crowded level (a heavy line) gets slim plates
  const fmD = tab === 'off' ? (FORMS[vid] && FORMS[vid][ui.dcFm] ? ui.dcFm : FORM_HOME[vid]) : null, flexD = fmD && FORMS[vid][fmD]._flex || [], snapD = fmD ? formSnap(vid, fmD) : 'SG', BK = d => 0.9 + d * 0.62;
  const OFFD = b => OL_SLOTS.includes(b.name) || (INLINE.has(b.name) && !flexD.includes(b.name)) ? [OL_SLOTS.includes(b.name) ? OL_X[b.name] : formX(vid, fmD, b.name), 0] : ['QB', 'RB', 'FB'].includes(b.name) ? [backSpot(snapD, fmD, b.name)[0], BK(backSpot(snapD, fmD, b.name)[1])] : [formX(vid, fmD, b.name), 1.4];
  const pos = lay.map(b => { const [px, d] = tab === 'def' ? [b.x, b.depth] : OFFD(b); return { b, left: 50 + px * 10.2, lvl: tab === 'def' ? clamp(b.row || 2, 1, 4) : d <= 0.2 ? 1 : d <= 2.2 ? 2 : d <= 4.3 ? 3 : 4 }; });
  const byL = {}; for (const q of pos) (byL[q.lvl] = byL[q.lvl] || []).push(q);
  let Gmin = 20;
  for (const a of Object.values(byL)) {
    const G = Math.min(20, 97 / a.length), lo = G / 2 + 0.4, hi = 100 - lo; Gmin = Math.min(Gmin, G);
    a.sort((p, q) => p.left - q.left);
    for (let it = 0; it < 30; it++) for (let i = 1; i < a.length; i++) { const gap = a[i].left - a[i - 1].left; if (gap < G) { const s = (G - gap) / 2; a[i - 1].left -= s; a[i].left += s; } }
    for (const q of a) q.left = clamp(q.left, lo, hi);
    for (let i = 1; i < a.length; i++) a[i].left = Math.max(a[i].left, a[i - 1].left + G);
    if (a[a.length - 1].left > hi) { a[a.length - 1].left = hi; for (let i = a.length - 2; i >= 0; i--) a[i].left = Math.min(a[i].left, a[i + 1].left - G); }
    if (a.length > 1 && a[0].left < lo) a.forEach((q, i) => { q.left = lo + i * (hi - lo) / (a.length - 1); });
    a.forEach((q, i) => { q.w = Math.min(27, 2 * q.left - 0.6, 2 * (100 - q.left) - 0.6, i > 0 ? q.left - a[i - 1].left : 99, i < a.length - 1 ? a[i + 1].left - q.left : 99); });
  }
  const used = [...new Set(pos.map(q => q.lvl))].sort((a, b) => a - b), TOP = {}; used.forEach((l, i) => { TOP[l] = (i + 0.5) / used.length * 100; }); // each level's disc, its plate under it, centered in its band
  const medal = ({ b, left, lvl, w }) => { const p = lineup[b.name] && lineup[b.name].a ? lineup[b.name] : null, ov = !prac && !auto && c.ov[ok + ':' + b.name] !== undefined, tr = p ? jobTier(p, b.key) : null;
    const wy = p ? whyText(b, p) : null, chg = outP && normal[b.name] !== lineup[b.name], sel = b.key === x.job;
    const tip = `${b.label}${b.tech ? ' (' + b.tech + ')' : ''}: ${p ? `${pname(p)} · ${p.lbl}${tr ? ' · ' + tr + ' at this job' : ''}` : 'nobody'}${ov ? ' · set for this look only' : ''}${wy ? ' · ' + wy[1] : ''}`;
    return `<div class="dk-md ${p ? 'm-' + dkMetal(tr) : 'vac'} ${sel ? 'sel' : ''} ${ov ? 'ov' : ''} ${chg ? 'chg' : ''} ${byL[lvl].length >= 6 ? 'tight' : ''}" style="left:${left.toFixed(2)}%;top:calc(${TOP[lvl].toFixed(2)}% - 6.5px);--wq:${w.toFixed(2)}" data-action="dkSpot" data-key="${b.key}" ${p ? `data-pid="${p.id}" draggable="true" data-dcp="${p.id}"` : ''} ${prac ? '' : `data-dcov="${b.name}"`} title="${esc(tip)}">
      <span class="pm-disc"><b>${esc(dkCode(b.key))}</b>${b.tech ? `<i class="dk-tech">${esc(b.tech)}</i>` : ''}</span><span class="pm-plate"><b>${p ? esc(p.last) : 'Nobody'}</b>${p ? dcDot(p, b.key) : ''}</span>
      ${ov ? `<button class="dk-pin" data-action="dcOvClear" data-name="${b.name}" title="Set for this look only. Click to go back to the job's order">this look ×</button>` : wy ? `<em class="${wy[0] === 'staff' ? 'bad' : ''}">${wy[0]}</em>` : ''}</div>`; };
  const nOv = Object.keys(c.ov).filter(k => k.startsWith(ok + ':')).length;
  // the pickers: which look, which down, which string
  const looks = tab === 'def' ? `<select data-change="dkLook" title="The look on the field">${[...new Set(views.map(v => v.group))].map(gr => `<optgroup label="${esc(gr)}">${views.filter(v => v.group === gr).map(v => `<option value="${esc(v.id)}" ${v.id === vid ? 'selected' : ''}>${esc(v.label)}${v.group === 'Nickel' ? ' nickel' : ''}${v.share && v.group !== 'Other' ? ` · ${Math.round(v.share * 100)}%` : ''}</option>`).join('')}</optgroup>`).join('')}</select>`
    : `<select data-change="dkLook" title="The grouping on the field">${views.map(v => `<option value="${esc(v.id)}" ${v.id === vid ? 'selected' : ''}>${esc(v.id === 'JUMBO' ? 'Jumbo' : v.id + ' personnel')}${v.share ? ` · ${Math.round(v.share * 100)}%` : ''}</option>`).join('')}</select><select data-change="dkFm" title="The formation">${formShares(t, vid).map(([k, s2]) => `<option value="${esc(k)}" ${k === fmD ? 'selected' : ''}>${esc(k)} · ${Math.round(s2 * 100)}%</option>`).join('')}</select>`;
  const down = tab === 'off' ? `<select data-change="dkDown" title="Who is on the field changes with the down: your passing-down back and tight end, your short-yardage back">${[['', 'Early downs'], ['pass', 'Passing downs'], ['short', 'Short yardage']].map(([k, l]) => `<option value="${k}" ${(pass || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`
    : sub ? `<select data-change="dkDown" title="On passing downs your rushers and pass-down men come in">${[['0', 'Run downs'], ['1', 'Passing downs']].map(([k, l]) => `<option value="${k}" ${(pass ? '1' : '0') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : '';
  const str = prac ? `<select data-change="dkStr" title="Which string's team period">${REP_STRING.map((l, i) => `<option value="${i}" ${pstr === i ? 'selected' : ''}>The ${l.toLowerCase()}</option>`).join('')}</select>` : '';
  const title = tab === 'def' ? (vw.group === 'Other' ? vw.label : `${vw.label} · ${vw.pkg === 'BASE' ? vw.group : 'nickel'}${sub && pass ? ' · passing downs' : ''}`) : `${PERS_LABEL[vid] || vid} · ${fmD} · ${snapD === 'UC' ? 'under center' : 'shotgun'}${pass === 'pass' ? ' · passing downs' : pass === 'short' ? ' · short yardage' : ''}`;
  const open = ui.dkField !== false;
  return `<section class="dk-fieldp ${open ? '' : 'closed'}"><div class="dk-fh"><b>On the field</b><span class="dk-sels">${looks}${down}${str}</span><span class="spacer"></span>
      ${outP && !prac ? `<span class="dk-out" title="The field as it would line up without him">Without <b>${esc(outP.last)}</b><button class="link" data-action="dcOut" data-pid="0" title="Back to the real lineup">×</button></span>` : nOv ? `<span class="dk-k" title="Men you dropped on a medallion: they play there in this look only">${nOv} this look only</span>` : ''}
      <button class="dk-fbtn" data-action="dkField" title="${open ? 'Fold the field away to give the players the room' : 'Show the field'}">${open ? 'Hide' : 'Show the field'}</button></div>
    ${open ? `<div class="dk-field ${tab}" style="--gq:${Gmin.toFixed(2)}"><span class="dk-cap">${esc(title)}</span><div class="dk-los"></div>${pos.map(medal).join('')}</div>
    <div class="dk-key" title="The rim is his level at the job, as the staff sees it">${DK_METAL_KEY.map(([m, l]) => `<span><i class="m-${m}"></i>${l}</span>`).join('')}<span><i class="dcd warn"></i>Learning</span><span><i class="dcd bad"></i>Raw</span><span class="dk-kh">${prac ? `The ${['ones', 'twos', 'threes'][pstr]} in team periods` : 'Drop a man on a medallion: this look only'}</span></div>` : ''}</section>`;
}

// ---------- the players: the job you are on and everyone who could do it, or the man you picked ----------
function dkCands(x, job) {
  const { ro } = x, all = ro.filter(p => ST_UNIT[job] ? ST_OK.has(p.spot) || ui.dchAll : job === 'KR' || job === 'PRET' ? returnScore(p) > -1e8 : ['K', 'P'].includes(job) ? comfortOf(p, job) > 0 || ui.dchAll : SPOTS[p.spot].side === SPOTS[CHART_SPOT[job]].side);
  const fam = LINE_SEATS.has(job) ? ['NT', 'DT', 'DE', 'EDGE', ...(STAND_SEATS.has(job) ? ['MLB', 'WLB'] : [])] : (FAMILIES.find(f => f[1].includes(CHART_SPOT[job])) || [null, []])[1];
  const near = all.filter(p => jobSide(job) === 'st' || jobComfort(p, job) >= 25 || fam.includes(p.spot));
  return (ui.dchAll ? all : near).sort((a, b) => jobValue(b, job) - jobValue(a, job));
}
// the job you are on: what it is, where it plays, the next man's share, where its men line up, the exhibition minutes
function dkJobHTML(x) {
  const { prac, c, J, tab, t, job: k, need, listOf } = x, L = listOf(k), where = J ? J.where[k] : null, n = need(k);
  let rot = '';
  if (!prac && ROT_KEYS.has(k)) { const rl = rotOpts(k), now = rotOf(c, k), pick = rl.length ? rl.reduce((a, o) => Math.abs(o[0] - now) < Math.abs(a[0] - now) ? o : a)[0] : 0;
    if (rl.length > 1) rot = `<label class="dk-ctl" title="How much of the work goes to the next man on the list"><span>Next man</span><select data-change="dchRot" data-key="${k}">${rl.map(([v, l]) => `<option value="${v}" ${v === pick ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`; }
  const dur = preTimeOn() && !prac && !ST_UNIT[k] && !['K', 'P', 'KR', 'PRET'].includes(k) && L.length ? `<details class="dcj-more" ${foldAttr('dkDur')}><summary>this exhibition</summary><div class="dk-dur">${L.map((p, i) => `<span class="dk-du"><b>${esc(p.last)}</b>${dcDurSel(p, k, i)}</span>`).join('')}</div></details>` : '';
  const seat = tab === 'def' && !prac ? seatCardHTML(t, k, L) : '';
  const help = JOB_HELP[k] || '', plays = where && where.length ? [...new Set(where)].join(', ') : '';
  const tag = ST_UNIT[k] ? '10 men' : n > 1 ? `${n} start` : '';
  return `<div class="dk-jh"><div class="dk-jt"><b>${esc(jobLabel(k))}</b>${tag ? `<i class="dk-tg">${tag}</i>` : ''}<span class="spacer"></span>${rot}</div>
    ${help || plays ? `<div class="dk-about" title="${esc(help + (plays ? ` Plays in ${plays}.` : ''))}">${esc(help)}${plays ? ` <span class="dk-k">Plays in</span>${esc(plays)}` : ''}</div>` : ''}${seat || dur ? `<div class="dk-jf">${seat}${dur}</div>` : ''}</div>`;
}
function dkSideHTML(x) {
  const { job, c, startsAt, pick, prac } = x, list = c.lists[job] || [], cands = dkCands(x, job), dress = chartDress(x.u), man = ui.dkSide === 'man' && !!pick;
  const row = p => { const tr = jobTier(p, job), sw = !tr && stWord(p, ST_UNIT[job] ? job : null), i = list.indexOf(p.id), at = startsAt[p.id], ls = dkListed(x, p).filter(e => e[0] !== job).slice(0, 3);
    const out = p.injury ? 'Out' : !prac && dcSat(p) ? 'Sitting' : dress && !dress.has(p.id) ? 'Inactive' : '';
    return `<div class="dk-pr ${pick && pick.id === p.id ? 'sel' : ''} ${i >= 0 ? 'in' : ''} ${out ? 'off' : ''}" draggable="true" data-dcp="${p.id}" data-action="dkPick" data-pid="${p.id}" data-key="${job}">
      ${posTag(p, at ? 'on' : '')}<span class="dk-prn"><b>${esc(pname(p))}</b>${dcDot(p, job)}<i>${p.age} · ${ls.map(([k, j]) => `${esc(dkShort(k))} ${j + 1}`).join(', ')}${out ? ` <u>${out}</u>` : ''}</i></span>
      ${tr ? `<span class="dk-fit ${dkTierCls(tr)}">${tr}</span>` : sw ? `<span class="dk-fit">${sw[0]}</span>` : '<span></span>'}
      ${i >= 0 ? `<span class="dk-onj" title="His place at this job">${i + 1}</span>` : `<button class="dk-addb" data-action="dcAdd" data-key="${job}" data-pid="${p.id}" title="Add him to ${esc(jobLabel(job).toLowerCase())}">+</button>`}</div>`; };
  const tabs = `<nav class="dk-stabs"><button class="${man ? '' : 'on'}" data-action="dkSideTab" data-v="list" title="The job you are on, and everyone who could do it"><i>The job</i>${esc(jobLabel(job))}</button><button class="${man ? 'on' : ''}" data-action="dkSideTab" data-v="man" ${pick ? '' : 'disabled'} title="The man you picked"><i>The man</i>${pick ? esc(pshort(pick)) : '—'}</button></nav>`;
  return `<aside class="dk-side ${man ? 'man' : 'list'}">${tabs}<div class="dk-sbody"><div class="dk-jobp">${dkJobHTML(x)}
      <div class="dk-lh"><span class="dk-k">Best at it</span><span class="dk-cnt">${cands.length}</span><span class="spacer"></span><label class="dk-ctl"><select data-change="dkWho" title="Whom to list"><option value="" ${ui.dchAll ? '' : 'selected'}>Who can play it</option><option value="1" ${ui.dchAll ? 'selected' : ''}>Everyone</option></select></label></div>
      <div class="dk-list">${cands.map(row).join('') || '<div class="dk-none">Nobody on the roster can play here.</div>'}</div></div>
    ${pick ? dkCardHTML(x, pick) : '<div class="dk-card"><div class="dk-none">Click a man on the chart, the field or the list.</div></div>'}</div></aside>`;
}
// the man you picked: who he is, how he fits the job you are on, what you can do with him; the scouts' read, where he can
// play, his strengths and his body behind four small tabs, so the card stands in the room it has
function dkCardHTML(x, p) {
  const { job, c, prac } = x, list = c.lists[job] || [], i = list.indexOf(p.id), tr = jobTier(p, job), cf = comfortLabel(jobComfort(p, job)), ax = jobAx(job), m = ax !== null && p.m ? lineMass(p, ax) : 0;
  const ord = n => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'][n] || (n + 1) + 'th', sat = !prac && dcSat(p), listed = dkListed(x, p), pb = PRAC_SIDE[p.pos] ? pbOf(p) : null, n = x.need(job);
  const mv = (to, l, tip) => `<button class="sm" data-action="dcMove" data-key="${job}" data-pid="${p.id}" data-to="${to}" title="${tip}">${l}</button>`;
  const here = i >= 0 ? `${i > 0 ? mv(0, i < n ? 'To the top' : 'Make him a starter', 'First on the list') : ''}${i > 0 ? mv(i - 1, '▲', 'Up one place') : ''}${i < list.length - 1 ? mv(i + 1, '▼', 'Down one place') : ''}<button class="sm danger" data-action="dcRemove" data-key="${job}" data-i="${i}">Take him off</button>`
    : `<button class="sm primary" data-action="dcAdd" data-key="${job}" data-pid="${p.id}">Add to ${esc(jobLabel(job).toLowerCase())}</button>`;
  const more = prac ? '' : `<button class="sm ${sat ? 'primary' : ''}" data-action="dcSit" data-pid="${p.id}" title="${sat ? 'Sitting: he does not dress and takes no snaps anywhere. Click to play him.' : 'He does not dress and takes no snaps anywhere, not even on special teams'}">${sat ? 'Sitting · play him' : 'Sit him'}</button>${x.tab === 'st' ? '' : `<button class="sm ${ui.dcOut === p.id ? 'primary' : ''}" data-action="dcOut" data-pid="${ui.dcOut === p.id ? 0 : p.id}" title="The field as it would line up without him">${ui.dcOut === p.id ? 'Showing without him ×' : 'If he goes down'}</button>`}`;
  const ct = ['read', 'where', 'str', 'phys'].includes(ui.dkCard) ? ui.dkCard : 'where', ras = rasOf(p);
  const pane = ct === 'read' ? `<div class="dk-read">${esc(scoutProfile(p))}.</div><div class="dk-pills">${tierPill(p)}${upsidePill(p)}${rowGrades(p)}${stWord(p) ? `<span class="pill ${stWord(p)[1]}">${stWord(p)[0]}</span>` : ''}${pb !== null ? `<span class="pill" title="How much of the playbook he knows">${pbLabel(pb)}</span>` : ''}</div>`
    : ct === 'where' ? comfortHTML(p) : ct === 'str' ? strengthsHTML(p) : `${ras === null ? '' : `<div class="dk-k">Athletic score ${ras.toFixed(2)}</div>`}${combineHTML(p)}`;
  return `<div class="dk-card"><div class="dk-ch">${posTag(p, x.startsAt[p.id] ? 'on' : '')}<b class="dk-cn">${playerLink(p)}</b>${statusPills(p)}<span class="spacer"></span><button class="link" data-action="player" data-pid="${p.id}">His file ›</button></div>
    <div class="dk-bio">${esc(JOB_NAME[p.spot] || p.lbl)} · age ${p.age} · ${fmtHeight(p.m.ht)}, ${p.m.wt} lb · ${p.exp} yr${p.exp === 1 ? '' : 's'} · ${fmtContract(p)}${p.injury ? ` · <span class="bad">out ${p.injury.weeks} wk</span>` : ''}</div>
    <div class="dk-fitbox"><div class="dk-pills"><span class="dk-k">At ${esc(jobLabel(job).toLowerCase())}</span>${tr ? `<span class="pill ${TIER_CLS[tr]}">${tr} here</span>` : ''}${jobSide(job) === 'st' ? '' : `<span class="pill ${CF_CLS[cf]}">${cf}</span>`}${m <= -1.5 ? '<span class="pill warn">light for the spot</span>' : m >= 1.5 ? '<span class="pill warn">heavy for the spot</span>' : ''}${i >= 0 ? `<span class="pill" title="His place on the list">${ord(i)}${i < n ? ' · starts' : ''}</span>` : ''}</div>
      <div class="dk-acts">${here}${more}</div></div>
    ${listed.length ? `<div class="dk-pills dk-lst"><span class="dk-k">Listed at</span>${listed.map(([k, j]) => `<button class="pill dk-lj ${k === job ? 'on' : ''}" data-action="dkPick" data-key="${k}" data-pid="${p.id}">${esc(jobLabel(k))} · ${ord(j)}</button>`).join('')}</div>` : ''}
    <nav class="dk-ctabs">${[['read', 'Scouting'], ['where', 'Positions'], ['str', 'Strengths'], ['phys', 'Physical']].map(([k, l]) => `<button class="${ct === k ? 'on' : ''}" data-action="dkCardTab" data-v="${k}">${l}</button>`).join('')}</nav>
    <div class="dk-cpane">${pane}</div></div>`;
}

// ---------- the page ----------
function depthChartHTML() {
  const x = dkCtx(), { u, t, tab, prac, auto, mine, probs, c } = x;
  const ro = rosterOf(u), inj = ro.filter(p => p.injury).length, sitting = ro.filter(p => dcSat(p)).length, active = ro.filter(p => !onIR(p)).length;
  const nx = userMatchup(), opp = nx ? (nx.h === u ? nx.a : nx.h) : null, when = `${state.season} · ${state.phase === 'REG' ? 'Week ' + Math.min(state.week, SEASON_WEEKS) : esc(PHASE_LABEL[state.phase] || state.phase)}`;
  const setBy = un => x.cg.auto && x.cg.auto[un] ? 'staff' : 'you';
  const fig = (k, v, s, tt) => `<div${tt ? ` title="${esc(tt)}"` : ''}><div class="k">${k}</div><div class="v">${v}${s ? `<small>${s}</small>` : ''}</div></div>`;
  ensureChem();
  const chem = (tab === 'def' ? ['DL', 'LB', 'DB', 'D'] : tab === 'off' ? ['OL', 'QB'] : ['KB']).map(un => { const v = un === 'D' ? defChem(u) : unitChem(u, un); return fig(un === 'D' ? 'The defense' : un === 'QB' ? 'QB and targets' : CH_NAME[un], `<span style="color:${gradeColor(v)}">${chemWord(v)}</span>`, '', 'Chemistry of the first team: how well the men know each other'); });
  const figs = [fig('Dress', Math.min(GAMEDAY_ACTIVE, active), `of ${active}`, `${GAMEDAY_ACTIVE} dress on game day`), fig('Injured', inj), fig('Sitting', sitting, '', 'Men you are sitting: no snaps anywhere'),
    fig('Gaps', probs.length ? `<span class="bad">${probs.length}</span>` : '0', '', 'Jobs your system needs that nobody is listed at'), ...chem];
  const strip = DK_UNITS.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-action="dchTab" data-tab="${k}">${l}${probs.some(p => p.tab === k) ? '<i class="dk-dot bad" title="Not complete"></i>' : `<i>${setBy(k) === 'you' ? 'yours' : 'staff'}</i>`}</button>`).join('');
  const mode = `<span class="dk-seg">${[['game', 'Game day'], ['prac', 'Practice']].map(([k, l]) => `<button class="${(prac ? 'prac' : 'game') === k ? 'on' : ''}" data-action="scMode" data-v="${k}" title="${k === 'game' ? 'Who plays on game day, in what order' : 'Who takes the first, second and third string reps in practice'}">${l}</button>`).join('')}</span>`;
  const ctl = prac ? '' : `<label class="rs-vl"><span>Set by</span><select data-change="dkSetBy" title="Staff: the coaches set this side every week. You: your order stands until you change it."><option value="staff" ${auto ? 'selected' : ''}>The staff</option><option value="you" ${auto ? '' : 'selected'}>You</option></select></label>`;
  const extra = prac ? '' : tab === 'def' ? dkGreenDot(t) : tab === 'off' ? dkEQB(t) : '';
  // the foot of the chart: who is setting this side, the way between the two orders, and how to move men
  const nOwnP = prac ? REP_JOBS.filter(j => j[4] === tab && c.own[j[0]]).length : 0;
  let note = prac ? `First, second and third string reps${state.phase === 'PRESEASON' || state.phase === 'CUTDOWN' ? ' in camp' : ' each week'}. ${nOwnP ? `You set ${nOwnP} job${nOwnP === 1 ? '' : 's'} here; the rest follow the game order. <button class="link" data-action="pracReset" data-unit="${tab}">Back to the game order</button>` : 'Every job follows your game order until you change it.'}`
    : auto ? `The staff sets the ${DK_SIDE[tab]} each week: drag anyone to take it over.` : `Your order stands until you change it; the staff fills a gap for a game.`;
  if (tab !== 'st') note += ` <button class="link" data-action="scCopy" data-v="${prac ? 'g2p' : 'p2g'}">Copy from ${prac ? 'game day' : 'practice'}</button>`;
  const alerts = (state.settings.autoUser ? '<div class="cl-notice dk-warnr"><b>Auto</b><span>Auto-manage is on: the staff sets the depth chart until you turn it off in Settings.</span></div>' : '')
    + (mine.length ? `<div class="cl-notice dk-warnr"><b>Gaps</b><span>${mine.map(p => esc(p.text)).join(' · ')}. If you play a game like this, the staff fills the gap for that game only.</span></div>` : '');
  const pre = preTimeOn() && tab !== 'st' && !prac ? `<details class="dk-pre" ${foldAttr('dkPre')}><summary>Exhibition playing time</summary>${prePlanHTML()}</details>` : '';
  const field = dkFieldHTML(x), showField = !!field;
  const hint = `Drag a man along a row to reorder it, onto another row to add him there${showField ? ', onto a medallion for that look only' : ''}. With a man picked, ← → moves him, Delete takes him off.`, hintS = 'Drag to reorder or add · ← → moves the man you picked · Delete takes him off';
  return `<div class="club ros dk" style="${clubVarsCSS(u)}">
    <header class="cl-mast rs-mast" data-abbr="${esc(t.abbr)}">
      <button class="cl-badge" data-action="team" data-tid="${u}" title="Home">${esc(t.abbr)}</button>
      <div class="cl-id"><div class="cl-over">${esc(t.conf + ' ' + t.div)} · Depth chart · ${when}${opp !== null ? ` · next: ${nx.h === u ? 'vs' : 'at'} ${esc(T(opp).abbr)}` : ''}</div>
        <div class="rs-name"><h1>${esc(t.region)} <b>${esc(t.name)}</b></h1></div>
</div>
      <div class="cl-rec rs-count"><div class="cl-big">${Math.min(GAMEDAY_ACTIVE, active)}<small>/${active}</small></div><div class="cl-place">Dress on game day · ${Math.max(0, active - GAMEDAY_ACTIVE)} inactive</div></div>
    </header>
    <div class="cl-ledger" style="--n:${figs.length}">${figs.join('')}</div>
    <div class="rs-bar"><nav class="rs-pos dk-units">${strip}</nav>${mode}<span class="spacer"></span>${extra}${ctl}</div>
    ${alerts}<div class="dk-body ${showField ? 'has-field' : 'no-field'}">${field}
      <section class="dk-board"><div class="dk-rows">${pre}<div class="dk-cols">${dkBoardHTML(x)}</div></div>
        <div class="dk-foot"><span class="dk-who"><b>${prac ? 'Practice' : auto ? 'Staff' : 'Yours'}</b>${note}</span><span class="dk-hint" title="${esc(hint)}">${hintS}</span></div></section>
      ${dkSideHTML(x)}</div></div>`;
}
function dkGreenDot(t) {
  const pool = dotPool(t.id).sort((a, b) => dotScore(b) - dotScore(a)).slice(0, 12), cur = greenDot(t.id);
  return `<label class="rs-vl" title="The linebacker who gets the call from the sideline and makes the checks at the line. What he sees, how well he knows the system and whether the others listen all count."><span>Green dot</span><select data-change="dotSet">${t.dot === undefined ? '<option value="">Staff pick</option>' : ''}${pool.map(p => `<option value="${p.id}" ${t.dot !== undefined && cur && cur.id === p.id ? 'selected' : ''}>${esc(pshort(p))}${t.dot === undefined && cur && cur.id === p.id ? ' (staff)' : ''}</option>`).join('')}</select></label>`;
}
function dkEQB(t) {
  const sq = psOf(t.id).filter(p => p.pos === 'QB' && p.a).sort((a, b) => b.ovr - a.ovr), pool = [...sq, ...rosterOf(t.id).filter(p => p.pos !== 'QB' && !['OL', 'DL', 'K', 'P'].includes(p.pos) && p.a).sort((a, b) => emergencyScore(b) - emergencyScore(a)).slice(0, 12)];
  const cur = t.eqb !== undefined ? pool.find(p => p.id === t.eqb) : emergencySquadQB(t.id) || emergencyPasser(t.id);
  return `<label class="rs-vl" title="If every quarterback on the 53 is hurt during a game, he takes the snaps. A practice squad quarterback is brought up for the rest of that game (it does not use one of his elevations)."><span>Emergency QB</span><select data-change="eqbSet">${t.eqb === undefined ? '<option value="">Staff pick</option>' : ''}${pool.map(p => `<option value="${p.id}" ${t.eqb !== undefined && cur && cur.id === p.id ? 'selected' : ''}>${esc(pshort(p))} · ${p.tid === -3 ? 'QB, squad' : esc(p.lbl)}${t.eqb === undefined && cur && cur.id === p.id ? ' (staff)' : ''}</option>`).join('')}</select></label>`;
}

// ---------- what you can do ----------
// a job you pick that is not in the look on the field: the field goes to a look (and a down) where he plays
function dkShowJob(k) {
  const tab = dkTab(); if (tab === 'st' || view !== 'depth') return; const t = T(state.userTid), views = dcViews(t, tab); ui.dchView = ui.dchView || {};
  const passK = tab === 'off' ? (k === 'RB3D' || k === 'Y3D' ? 'pass' : k === 'RBSY' ? 'short' : '') : ['RUSHE', 'RUSHI', 'WLBP', 'NCBP'].includes(k) ? '1' : '';
  const pass = tab === 'off' ? (passK || (ui.dcSit === 'pass' || ui.dcSit === 'short' ? ui.dcSit : false)) : passK === '1' || ui.dcPass === '1';
  const has = vid => dcLayout(t, tab, vid, pass).some(b => b.key === k || b.baseKey === k);
  const cur = views.some(v => v.id === ui.dchView[tab]) ? ui.dchView[tab] : views[0].id;
  if (passK) { if (tab === 'off') ui.dcSit = passK; else ui.dcPass = '1'; }
  if (has(cur)) return; const v = views.find(w => has(w.id)); if (v) { ui.dchView[tab] = v.id; if (tab === 'off') ui.dcFm = null; }
}
if (typeof actions !== 'undefined') Object.assign(actions, {
  dcJob: d => { ui.dcJob = d.key; ui.dchPid = null; ui.dkSide = 'list'; dkShowJob(d.key); render(); },
  dkPick: d => { ui.dchPid = +d.pid; if (d.key) ui.dcJob = d.key; ui.dkSide = 'man'; render(); },
  dkSpot: d => { ui.dcJob = d.key; ui.dchPid = d.pid ? +d.pid : null; ui.dkSide = d.pid ? 'man' : 'list'; render(); const r = document.querySelector('.dk-row.on'); if (r) r.scrollIntoView({ block: 'nearest' }); },
  dkField: () => { ui.dkField = ui.dkField === false; render(); },
  dkSideTab: d => { ui.dkSide = d.v; render(); },
  dkCardTab: d => { ui.dkCard = d.v; render(); },
});
if (typeof changes !== 'undefined') Object.assign(changes, {
  dkSetBy: v => { const tab = dkTab(); setChartAuto(state.userTid, tab, v === 'staff'); save(); },
  dkLook: v => { (ui.dchView = ui.dchView || {})[dkTab()] = v; ui.dcFm = null; },
  dkFm: v => { ui.dcFm = v; },
  dkDown: v => { if (dkTab() === 'off') ui.dcSit = v; else ui.dcPass = v; },
  dkStr: v => { ui.pracStr = +v; },
  dkWho: v => { ui.dchAll = !!v; ui.dkSide = 'list'; },
  dkPut: (v, el) => { if (!v) return; const k = el.dataset.key, i = +el.dataset.i, pid = +v, u = state.userTid; const blocked = chartBlocked(u, k, pid); if (blocked) { toast(blocked); return; }
    if (scPrac()) { if (REP_JOB[k]) pracSet(k, i, pid); } else setChart(u, k, i, pid); ui.dcJob = k; ui.dchPid = pid; save(); },
});
// with a man picked on the chart: ← → moves him along his row, Delete takes him off it
if (typeof document !== 'undefined') document.addEventListener('keydown', e => {
  if (!state || view !== 'depth' || !ui.dchPid || !ui.dcJob || (e.target.closest && e.target.closest('input, select, textarea')) || !$('#modal').classList.contains('hidden')) return;
  const k = ui.dcJob, l = scPrac() ? (ensureReps().jobs[k] || []) : (ensureChart(state.userTid).lists[k] || []), i = l.indexOf(ui.dchPid); if (i < 0) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const to = i + (e.key === 'ArrowRight' ? 1 : -1); if (to < 0 || to >= l.length) return; e.preventDefault(); actions.dcMove({ key: k, pid: ui.dchPid, to }); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actions.dcRemove({ key: k, i }); }
});
