// =====================================================================
//  THE PLAYBOOK, DRAWN
//  Every call a play caller carries, drawn the way a pro playbook draws it: the formation, the routes and the order of the
//  reads, the blocks and the ball carrier's path; the defense's fronts, coverages and pressures with their landmarks and rush
//  lanes. Diagrams are in yards: x across the field (+ is the offense's right, its strength), y up the field from the line.
// =====================================================================
const PB = { line: 2, r: 0.9, ol: -0.95, off: -2.05, top: 19.9, side: 21 };
// frames: [x from, x to, y from, y to]; every card keeps the same shape (3 wide to 2 tall) so a page of them lines up
const PB_FR = { pass: [-22, 22, -8.4, 20.93], quick: [-22, 22, -8.4, 14.6], run: [-18.4, 18.4, -10.4, 14.13], def: [-22, 22, -6.6, 22.73], box: [-10.5, 10.5, -3.3, 8.4], game: [-11, 11, -6.6, 8.07],
  form: [-21, 21, -8.6, 2.4], ofield: [-21.5, 21.5, -9.6, 2.6], dfield: [-21.5, 21.5, -3, 15.4] };
// the engine lines men up in units (a lineman's split is one); a receiver split wide is drawn where he would stand in yards
const WIDE_PTS = [[0, 0], [2.2, 8], [2.4, 9], [3.2, 12], [3.6, 13.5], [4, 16], [4.6, 17.5], [5, 18.5], [6, 20]];
function wideX(u) { const a = Math.abs(u), s = u < 0 ? -1 : 1; for (let i = 1; i < WIDE_PTS.length; i++) { const [a0, y0] = WIDE_PTS[i - 1], [a1, y1] = WIDE_PTS[i]; if (a <= a1) return s * (y0 + (a - a0) / (a1 - a0) * (y1 - y0)); } return s * 20; }
const SKILL_LBL = { X: 'X', Z: 'Z', SLOT: 'S', SLOT2: 'S', Y: 'Y', H: 'H', Y2: 'Y', FB: 'F', RB: 'R', QB: 'Q', OL6: 'T' };
const SLOT_WORD = { X: 'X receiver', Z: 'Z receiver', SLOT: 'Slot', SLOT2: 'Second slot', Y: 'Tight end', H: 'Second tight end', Y2: 'Third tight end', RB: 'Back', FB: 'Fullback' };
const PB_STAG = { LG: 1, RG: 1, RB: 1, FB: 1 }; // names a line lower, so neighbours' names do not run into each other
const FM_CALL = { Trey: 'Trey', Doubles: 'Doubles', Trips: 'Trips', Bunch: 'Bunch', Tight: 'Tight', Nub: 'Nub Trips', Ace: 'Ace', Wing: 'Wing', Heavy: 'Heavy', Jumbo: 'Jumbo', I: 'I', Offset: 'Offset I', Split: 'Split' };
function pbCallName(pers, fm, snap) { return `${pers === 'JUMBO' ? 'Jumbo' : pers} · ${snap === 'EMP' ? 'Gun Empty' : [{ SG: 'Gun', PI: 'Pistol' }[snap], FM_CALL[fm] || fm].filter(Boolean).join(' ') + ' Rt'}`; }

// where each man stands in a formation: { slot: {x, y, kind} }; kind is ol, c (the center), te (attached), wr, bk (a back), qb
function pbAlign(pers, fm, snap) {
  const P0 = PERSONNEL[pers] || PERSONNEL['11'], F = (FORMS[pers] || {})[fm] || {}, flex = F._flex || [], A = {}, emp = snap === 'EMP';
  OL_SLOTS.forEach((k, i) => { A[k] = { x: (i - 2) * PB.line, y: PB.ol, kind: k === 'C' ? 'c' : 'ol' }; });
  A.QB = { x: 0, y: snap === 'UC' ? -2.85 : snap === 'PI' ? -4 : -5, kind: 'qb' };
  // men on the line next to the tackle; a second one on that side stands outside him a step off the line (a wing)
  const inl = P0.filter(k => INLINE.has(k) && !flex.includes(k)).map(k => [k, formX(pers, fm, k)]).sort((a, b) => Math.abs(a[1]) - Math.abs(b[1])), n = { L: 0, R: 0 };
  for (const [k, u] of inl) { const s = u < 0 ? -1 : 1, i = n[s < 0 ? 'L' : 'R']++; A[k] = { x: s * (3 + i) * PB.line, y: i ? PB.off : PB.ol, kind: k === 'OL6' ? 'ol' : 'te' }; }
  for (const k of P0) if (!A[k] && k !== 'RB' && k !== 'FB') A[k] = { x: wideX(formX(pers, fm, k)), y: k === 'X' ? PB.ol : PB.off, kind: INLINE.has(k) ? 'te' : 'wr' };
  if (fm === 'Bunch') { const g = P0.filter(k => !['RB', 'FB', 'OL6'].includes(k) && formX(pers, fm, k) > 0).sort((a, b) => formX(pers, fm, a) - formX(pers, fm, b)).slice(-3);
    if (g.length === 3) g.forEach((k, i) => { A[k] = { x: 10 + (i - 1) * 1.7, y: i === 1 ? PB.ol : PB.off - 0.4, kind: INLINE.has(k) ? 'te' : 'wr' }; }); }
  for (const k of ['RB', 'FB']) if (P0.includes(k)) {
    if (emp && k === 'RB') { A.RB = { x: wideX(emptySpot(pers, fm)), y: PB.off, kind: 'wr' }; continue; }
    const b = backSpot(emp ? 'SG' : snap, fm, k); A[k] = { x: b[0] * 1.8, y: -b[1] * (snap === 'UC' && !b[0] ? 1.08 : 1), kind: 'bk' }; // (a back behind a back stands a little deeper on paper, so the two do not touch)
  }
  return A;
}

// ---------- drawing ----------
const pbN = v => Math.round(v * 100) / 100;
// a path through points [x, y], or [x, y, cx, cy] for a curve bent toward (cx, cy)
function pbD(pts) { let d = `M${pbN(pts[0][0])} ${pbN(-pts[0][1])}`; for (let i = 1; i < pts.length; i++) { const p = pts[i]; d += p.length >= 4 ? `Q${pbN(p[2])} ${pbN(-p[3])} ${pbN(p[0])} ${pbN(-p[1])}` : `L${pbN(p[0])} ${pbN(-p[1])}`; } return d; }
function pbEndDir(pts) { const a = pts[pts.length - 1], b = a.length >= 4 ? [a[2], a[3]] : pts[pts.length - 2], dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
function pbHead(pts, kind, sz) {
  const a = pts[pts.length - 1], [ux, uy] = pbEndDir(pts), s = sz || 1;
  if (kind === 'arrow') { const L = 1.1 * s, W = 0.52 * s, bx = a[0] - ux * L, by = a[1] - uy * L; return `<polygon points="${pbN(a[0])},${pbN(-a[1])} ${pbN(bx - uy * W)},${pbN(-(by + ux * W))} ${pbN(bx + uy * W)},${pbN(-(by - ux * W))}"/>`; }
  if (kind === 'tee') { const W = 0.78 * s; return `<path d="M${pbN(a[0] - uy * W)} ${pbN(-(a[1] + ux * W))}L${pbN(a[0] + uy * W)} ${pbN(-(a[1] - ux * W))}"/>`; }
  return '';
}
function pbLine(pts, cls, head, sz) {
  if (!pts || pts.length < 2) return '';
  let p = pts; if (head === 'arrow') { const a = pts[pts.length - 1], [ux, uy] = pbEndDir(pts), k = 0.8 * (sz || 1); p = pts.slice(0, -1).concat([[a[0] - ux * k, a[1] - uy * k, ...a.slice(2)]]); }
  return `<g class="${cls}"><path d="${pbD(p)}"/>${pbHead(pts, head, sz)}</g>`;
}
// pre-snap motion: a zigzag
function pbZig(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, n = Math.max(2, Math.round(L / 0.85)), ux = dx / L, uy = dy / L, pts = [a];
  for (let i = 1; i < n; i++) { const t = i / n, s = i % 2 ? 0.42 : -0.42; pts.push([a[0] + dx * t - uy * s, a[1] + dy * t + ux * s]); } pts.push(b); return pts; }
// a point just short of a man, coming from a direction: where a block lands
function pbNear(from, to, k) { const dx = to[0] - from[0], dy = to[1] - from[1], l = Math.hypot(dx, dy) || 1, kk = Math.min(k, l * 0.6); return [to[0] - dx / l * kk, to[1] - dy / l * kk]; }
function pbField([x0, x1, y0, y1]) {
  let g = `<rect class="pb-fld" x="${x0}" y="${-y1}" width="${x1 - x0}" height="${y1 - y0}"/>`;
  for (let y = Math.ceil(y0 / 5) * 5; y <= y1; y += 5) if (y) g += `<line class="pb-yl" x1="${x0}" x2="${x1}" y1="${-y}" y2="${-y}"/>`;
  return g + `<line class="pb-los" x1="${x0}" x2="${x1}" y1="0" y2="0"/>`;
}
function pbSvg(fr, body, cls, label) { const [x0, x1, y0, y1] = fr; return `<svg class="pb-svg ${cls || ''}" viewBox="${x0} ${-y1} ${x1 - x0} ${y1 - y0}" role="img" aria-label="${esc(label || 'Play diagram')}">${pbField(fr)}${body}</svg>`; }
// an offensive man: a circle (the center a square) with his letter; on a big page his name under him, and a click opens his file
function pbMan(k, a, o = {}) {
  const r = PB.r, x = a.x, y = -a.y, w = o.who && o.who[k], p = w && w.p, warn = p && p.a && w.pen >= 3;
  const shape = a.kind === 'c' ? `<rect x="${pbN(x - r)}" y="${pbN(y - r)}" width="${2 * r}" height="${2 * r}" rx=".14"/>` : `<circle cx="${pbN(x)}" cy="${pbN(y)}" r="${r}"/>`;
  const lbl = SKILL_LBL[k] && a.kind !== 'ol' && a.kind !== 'c' ? `<text x="${pbN(x)}" y="${pbN(y + 0.37)}">${SKILL_LBL[k]}</text>` : '';
  const ln = a.kind === 'ol' || a.kind === 'c', cap = o.line && a.y === PB.ol && Math.abs(a.x) < 9 ? 8 : 11, last = p && p.a ? (p.last.length > cap ? p.last.slice(0, cap - 1) + '.' : p.last) : 'Sub';
  const nm = o.names && p && !(ln && o.noLine) ? `<text class="pb-pn" x="${pbN(x)}" y="${pbN(y + r + 1.05 + (o.stag && o.stag[k] ? 1.0 : 0))}">${esc(last)}</text>` : '';
  const act = o.names && p && p.a ? ` data-action="player" data-pid="${p.id}"` : '';
  const tt = p ? `<title>${esc(p.a ? `${pname(p)} — ${p.lbl || ''}${warn ? ` (${comfortLabel(comfortOf(p, w.spot))} here)` : ''}` : 'Emergency')}</title>` : '';
  return `<g class="pb-o${o.dim ? ' dim' : ''}${warn ? ' warn' : ''}${act ? ' hit' : ''}"${act}>${tt}${shape}${lbl}${nm}</g>`;
}
// a defender: his letter; on a big page his name over him
function pbDefMan(key, x, y, l, o = {}) {
  const w = o.who && o.who[key], p = w && w.p, act = o.names && p && p.a ? ` data-action="player" data-pid="${p.id}"` : '', warn = p && p.a && w.pen >= 3, up = o.up || 0;
  const nm = o.names && p ? `<text class="pb-pn" x="${pbN(x)}" y="${pbN(-y - 1.35 - up)}">${esc(p.a ? (p.last.length > 10 ? p.last.slice(0, 9) + '.' : p.last) : 'Sub')}</text>` : '';
  return `<g class="pb-d${o.dim ? ' dim' : ''}${warn ? ' warn' : ''}${act ? ' hit' : ''}"${act}>${p ? `<title>${esc(p.a ? `${pname(p)} — ${p.lbl || ''}` : 'Emergency')}</title>` : ''}<text x="${pbN(x)}" y="${pbN(-y + 0.55)}">${l}</text>${nm}</g>`;
}
function pbZone(Z, u) { const [cx, cy, rx, ry, l] = Z; return `<g class="pb-z ${u ? 'u' : 'd'}"><ellipse cx="${pbN(cx)}" cy="${pbN(-cy)}" rx="${rx}" ry="${ry}"/><text x="${pbN(cx)}" y="${pbN(-cy + 0.3)}">${l}</text></g>`; }
// the order of the reads: a numbered disc past the end of the route (the first one filled)
function pbRead(pts, n, fr, p1) {
  const a = pts[pts.length - 1], [ux, uy] = pbEndDir(pts); let x = a[0] + ux * 1.5, y = a[1] + uy * 1.5;
  if (y > fr[3] - 1.1) { x = a[0] + (ux >= 0 ? 1.75 : -1.75); y = a[1] - 0.7; }
  x = clamp(x, fr[0] + 1.1, fr[1] - 1.1); y = clamp(y, fr[2] + 1.1, fr[3] - 1.1);
  return `<g class="pb-rd${p1 ? ' p1' : ''}"><circle cx="${pbN(x)}" cy="${pbN(-y)}" r=".95"/><text x="${pbN(x)}" y="${pbN(-y + 0.37)}">${n}</text></g>`;
}
function pbWhoOff(tid, pers) { const m = {}; try { for (const e of lineupFor(tid, pers)) m[e.slot] = e; } catch (x) { /* no lineup to show */ } return m; }
const PB_DKEY = { CB1: 'CW', CB2: 'CS', NCB: 'N', WLB: 'W', MLB: 'M', SS: 'SS', FS: 'FS', LE: 'LE', DT1: 'DT1', DT2: 'DT2', RE: 'RE' };
function pbWhoDef(tid) { const m = {}; try { for (const e of defLineup(tid, 'NICKEL')) if (PB_DKEY[e.name]) m[PB_DKEY[e.name]] = e; } catch (x) { /* none */ } return m; }

// ---------- routes ----------
// the shape a route takes on paper, from the engine's own account of it: [slot, depth band, direction, depth, break time, read]
function pbArt(r, kind) {
  const [k, band, dir, dd, bt] = r, mid = (dd[0] + dd[1]) / 2, outside = k === 'X' || k === 'Z';
  if (k === 'RB' || k === 'FB') return dir === 'IN' ? 'check' : mid <= 0.5 ? 'swing' : 'flat';
  if (band === 'S') { if (dir === 'VERT') return 'hitch'; if (dir === 'OUT') return mid <= 4 || kind === 'te' ? 'flat' : 'out'; if (mid <= 3.5 && !outside) return 'drag'; return outside && bt <= 1.25 ? 'slant' : 'sit'; }
  if (band === 'I') { if (dir === 'VERT') return outside ? 'go' : 'seam'; if (dir === 'OUT') return mid >= 14 ? 'corner' : 'out'; return 'dig'; }
  return dir === 'VERT' ? 'go' : dir === 'IN' ? 'post' : 'corner';
}
const ART_WORD = { go: 'go', fade: 'fade', seam: 'seam', slant: 'slant', hitch: 'hitch', curl: 'curl', sit: 'sit down in the hole', out: 'out', in: 'square in', dig: 'dig', post: 'post', corner: 'corner',
  sail: 'deep out (sail)', flat: 'flat', drag: 'shallow cross', cross: 'deep cross', drift: 'drift into the void', wheel: 'wheel', swing: 'swing', check: 'check-release', leak: 'block, then leak out', sluggo: 'slant and go' };
// how a concept is drawn: the formations it is drawn from when he uses them, and routes the engine's shorthand does not tell apart
const CPT_ART = {
  'Stick': { fm: ['Trey', 'Trips', 'Doubles'] }, 'Slant-flat': { fm: ['Doubles', 'Trey'] }, 'Spacing': { fm: ['Trips', 'Trey'], r: { X: 'sit', Z: 'sit' } },
  'Curl-flat': { fm: ['Doubles', 'Trey'], r: { X: 'curl', Y: 'curl', SLOT: 'flat', SLOT2: 'flat' } }, 'Levels': { fm: ['Trey', 'Trips'], r: { SLOT: 'in' } },
  'Four verticals': { fm: ['Doubles'], two: 1 }, 'Mesh': { fm: ['Doubles'], two: 1, r: { SLOT: 'drag', SLOT2: 'drag', Y: 'drag' } }, 'Flood': { fm: ['Trey', 'Trips'] }, 'Dagger': { fm: ['Doubles'], two: 1 },
  'Smash': { fm: ['Doubles'], two: 1, r: { X: 'hitch', Z: 'hitch', Y: 'corner' } }, 'Post-dig': { fm: ['Trey', 'Doubles'], first: 'Z' }, 'Sail shot': { fm: ['Trey'], r: { Z: 'sail' }, first: 'Z' },
  'Snag': { fm: ['Trey', 'Bunch', 'Trips'], r: { Z: 'corner', SLOT: 'sit' } }, 'Hitch-seam': { fm: ['Doubles'], two: 1 }, 'Fade': { fm: ['Trey', 'Doubles'], r: { X: 'fade', Z: 'fade', Y: 'slant', SLOT2: 'slant' } },
  'Drive': { fm: ['Trey', 'Doubles'], r: { SLOT: 'drag' } }, 'Y-cross': { fm: ['Trey', 'Nub'], r: { Y: 'cross' } }, 'Double move': { fm: ['Trey', 'Doubles'], r: { X: 'sluggo' } },
  'Yankee': { fm: ['Trey', 'Ace'], r: { Z: 'cross' } }, 'Drift': { fm: ['Trey', 'Ace'], r: { SLOT: 'drift' } }, 'Post-wheel': { fm: ['Trey', 'Ace'], r: { SLOT: 'wheel' } },
  'Boot flood': { fm: ['Trey', 'Ace'], r: { X: 'cross' } }, 'Leak': { fm: ['Trey', 'Ace'], r: { X: 'cross', Y: 'leak', H: 'drag' } },
};
function pbRouteGeo(art, x0, y0, D, s, top) {
  const cl = x => clamp(x, -PB.side, PB.side), i = -s, T = top || PB.top;
  switch (art) {
    case 'go': return [[x0, y0], [x0, 5], [cl(x0 + s * 0.7), T]];
    case 'fade': return [[x0, y0], [cl(x0 + s * 2.4), T, cl(x0 + s * 0.2), 8]];
    case 'seam': return [[x0, y0], [x0 + s * 1.3, T, x0, 9]];
    case 'slant': { const e = clamp((D - 1.2) * 1.15, 3, 7.5); return [[x0, y0], [x0, 1.2], [x0 + i * e, D + 0.5]]; }
    case 'hitch': return [[x0, y0], [x0, D], [x0 + i * 0.7, D - 1.3]];
    case 'curl': return [[x0, y0], [x0, D], [x0 + i * 1.9, D - 1.6, x0 + i * 0.4, D + 0.7]];
    case 'sit': return [[x0, y0], [x0, D], [x0 + i * 1.6, D - 0.25]];
    case 'out': return [[x0, y0], [x0, D], [cl(x0 + s * 4.8), D - 0.5]];
    case 'in': return [[x0, y0], [x0, D], [x0 + i * 6.5, D]];
    case 'dig': return [[x0, y0], [x0, D], [x0 + i * 9.5, D]];
    case 'post': { const b = clamp(D * 0.45, 9, 12.5); return [[x0, y0], [x0, b], [x0 + i * (T - b) * 0.85, T]]; }
    case 'corner': { const b = clamp(D - 5, 7, 11), e = Math.min(D + 2.5, T); return [[x0, y0], [x0, b], [cl(x0 + s * (e - b) * 0.95), e]]; }
    case 'sail': return [[x0, y0], [x0, 11], [cl(x0 + s * 7), 17.2, cl(x0 + s * 4.6), 16.6]];
    case 'flat': { const d = Math.max(D, 1.2); return [[x0, y0], [cl(x0 + s * 7.5), d + 0.4, x0 + s * 1.2, d]]; }
    case 'drag': return [[x0, y0], [x0 + i * 1.2, D], [i * 10, D]];
    case 'cross': return [[x0, y0], [x0 + i * 0.8, 4], [i * 3, D - 1.2], [cl(i * 15), D + 1.2]];
    case 'drift': return [[x0, y0], [x0, 2.5], [x0 + i * 5.5, D]];
    case 'wheel': return [[x0, y0], [cl(x0 + s * 4.5), 4, cl(x0 + s * 4.5), -0.5], [cl(x0 + s * 5), T]];
    case 'swing': return [[x0, y0], [cl(x0 + s * 8), y0 + 3.2, x0 + s * 5, y0 - 0.8]];
    case 'check': return [[x0, y0], [x0 * 0.4, -0.4], [i * 0.6, 3.5]];
    case 'leak': return [[x0, y0], [x0 + i * 0.4, -0.1], [x0 + i * 3.5, 2.5], [cl(i * 13), D]];
    case 'sluggo': return [[x0, y0], [x0, 1.5], [x0 + i * 2.2, 4.2], [x0 + i * 2.6, T]];
  }
  return [[x0, y0], [x0, D]];
}
// the routes of a concept for a grouping, as the engine hands them out: an extra tight end or a fullback runs the route of the
// receiver he replaced (a deep one comes back to the intermediate level for a tight end)
function pbRoutes(k, pers) {
  let rs = CONCEPTS[k].r; if (Array.isArray(rs[0][0])) rs = rs[0];
  const on = new Set(PERSONNEL[pers] || PERSONNEL['11']); let out = rs.filter(r => on.has(r[0])).map(r => ({ r, from: r[0] }));
  const vac = ['SLOT', 'Z', 'SLOT2'].filter(s => !on.has(s)).map(s => rs.find(r => r[0] === s)).filter(Boolean);
  for (const h of ['H', 'Y2', 'FB']) {
    if (!on.has(h) || !vac.length) continue;
    const i = h === 'FB' ? vac.findIndex(r => r[1] === 'S') : 0; if (i < 0) continue;
    const v = vac.splice(i, 1)[0], conv = v[1] === 'D' || v[3][1] > 16;
    out = out.filter(x => x.r[0] !== h).concat([{ r: conv ? [h, 'I', v[2] === 'VERT' ? 'IN' : v[2], [9, 14], Math.min(v[4], 2.1), v[5]] : [h, ...v.slice(1)], from: conv ? h : v[0] }]);
  }
  return out;
}
// the grouping and formation a concept is drawn from: the one he throws it from most, in the formation it was built for when he uses it
function pbPersBy(t, M) { const ot = offTend(t); return Object.keys(ot.pers || {}).filter(k => FORMS[k] && M[k]).sort((a, b) => ot.pers[b] * M[b] - ot.pers[a] * M[a])[0] || '11'; }
function pbCptForm(t, k) {
  const f = CONCEPTS[k].f, fake = f === 'PA' || f === 'BOOT', ot = offTend(t);
  const pers = fake ? pbPersBy(t, { 10: 0.35, 11: 0.85, 12: 1.35, 13: 1.7, 21: 1.55, 22: 1.9 }) : pbPersBy(t, { 10: 1.7, 11: 1.15, 12: 0.75, 13: 0.45, 21: 0.65, 22: 0.35 });
  const sh = formShares(t, pers), art = CPT_ART[k] || {}, pref = art.fm || [], fm = pref.find(x => sh.some(([n, v]) => n === x && v >= 0.04)) || (art.two && FORMS[pers] && FORMS[pers].Doubles ? 'Doubles' : sh[0] ? sh[0][0] : FORM_HOME[pers]);
  const heavy = (PERSONNEL[pers] || []).includes('FB') || ['12', '13', '22'].includes(pers);
  const snap = fake ? (heavy || (ot.uc || 0) >= 0.3 ? 'UC' : (ot.pistol || 0) >= 0.2 ? 'PI' : 'SG') : formSnap(pers, fm) === 'UC' && (ot.uc || 0) >= 0.45 ? 'UC' : 'SG';
  return { pers, fm, snap };
}
// the concept as drawn: who runs what, in the order he reads them
function pbConceptPlan(t, k, form) {
  const F = form || pbCptForm(t, k), A = pbAlign(F.pers, F.fm, F.snap), ov = (CPT_ART[k] || {}).r || {}, first = (CPT_ART[k] || {}).first; // (among equal reads, the route the concept is named for goes first)
  const rs = pbRoutes(k, F.pers).map(x => { const a = A[x.r[0]]; if (!a) return null; const mid = (x.r[3][0] + x.r[3][1]) / 2;
    return { k: x.r[0], a, art: ov[x.from] || pbArt(x.r, a.kind), D: clamp(mid, 1.2, 20), role: x.r[5] }; }).filter(Boolean).sort((p, q) => p.role - q.role || (q.k === first) - (p.k === first) || q.D - p.D);
  return { F, A, rs };
}
function pbConceptSVG(t, k, o = {}) {
  const fam = CONCEPTS[k].f, { F, A, rs } = pbConceptPlan(t, k, o.form), fr = fam === 'QUICK' ? PB_FR.quick : PB_FR.pass, roof = fr[3] - 1.05, uc = F.snap === 'UC', q = A.QB; // the quick game is drawn on a shorter field
  let under = '', lines = '', top = '', rbFrom = null;
  if (o.vs) under += pbCovLayer(o.vs, A, { faint: 1 });
  for (const k2 of [...OL_SLOTS, 'OL6']) if (A[k2]) lines += pbLine([[A[k2].x, A[k2].y - PB.r], [A[k2].x, A[k2].y - PB.r - 0.85]], 'pb-bk', 'tee', 0.7);
  if (fam === 'PA' || fam === 'BOOT') { // the run fake: to the strength off play-action, away from where the bootleg goes
    const s = fam === 'BOOT' ? -1 : 1, rb = A.RB || A.FB, mesh = [s * 1.1, uc ? -3.9 : -4.4];
    if (rb) { rbFrom = [s * 2.7, uc ? -3.5 : -3.8]; lines += pbLine([[rb.x, rb.y], rbFrom], 'pb-fk', 'arrow', 0.7); }
    lines += fam === 'BOOT' ? pbLine([[q.x, q.y], mesh, [7.6, -6.0, 2.4, -7.2]], 'pb-qb', 'arrow', 0.8) : pbLine([[q.x, q.y], mesh, [0.4, -7.2]], 'pb-qb', 'arrow', 0.8);
  } else { const dd = fam === 'QUICK' ? (uc ? 2.4 : 1.1) : fam === 'DEEP' ? (uc ? 4.4 : 2.4) : (uc ? 3.6 : 1.9); lines += pbLine([[q.x, q.y - PB.r], [q.x, Math.max(q.y - PB.r - dd, fr[2] + 0.6)]], 'pb-qb', 'arrow', 0.7); }
  const mesh2 = rs.some(r => r.art === 'drag' && r.a.x < -0.5) && rs.some(r => r.art === 'drag' && r.a.x > 0.5), seen = {}; // a mesh: one crosser runs over the other
  const back = A.RB ? 'RB' : 'FB';
  rs.forEach((r, i) => {
    const s = r.a.x < -0.5 ? -1 : r.a.x > 0.5 ? 1 : fam === 'BOOT' ? -1 : 1, st = r.k === back && rbFrom ? rbFrom : [r.a.x, r.a.y];
    const lift = r.art === 'drag' ? (mesh2 && s > 0 ? 1.4 : (seen[s] = (seen[s] || 0) + 1) > 1 ? 1.8 * (seen[s] - 1) : 0) : 0;
    const pts = pbRouteGeo(r.art, st[0], st[1], Math.min(r.D + lift, roof - 1), s, roof);
    lines += pbLine(pts, 'pb-rt' + (i === 0 ? ' p1' : r.role >= 3 ? ' ck' : ''), 'arrow');
    top += pbRead(pts, i + 1, fr, i === 0);
  });
  let men = ''; const mo = o.names ? { names: 1, who: pbWhoOff(o.tid, F.pers), stag: PB_STAG, noLine: 1 } : {};
  for (const [k2, a] of Object.entries(A)) men += pbMan(k2, a, mo);
  return pbSvg(fr, under + lines + men + top, o.big ? 'big' : '', `${k}, from ${pbCallName(F.pers, F.fm, F.snap)}`);
}

// ---------- runs, screens and gadgets ----------
// Each is drawn against the front it was drawn up for. A block is [who, target...]: a target is a defender or a point, the last
// one gets the block's bar. c is the ball carrier's path (alt: his other way), fk the fakes, qb the quarterback, thr the throw.
const PB_DEF = {
  A: { LE: [-5, 1.1, 'E'], DT1: [-0.9, 1.1, 'T'], DT2: [2.7, 1.1, 'T'], RE: [7, 1.1, 'E'], W: [-3, 5, 'W'], M: [1.4, 5, 'M'], N: [8.2, 4.6, 'N'], C1: [-16, 6.5, 'C'], C2: [16, 6.5, 'C'], SS: [5, 10, '$'], FS: [-2.5, 13, 'F'] },
  B: { LE: [-5.4, 1.1, 'E'], NT: [-0.9, 1.1, 'N'], DT: [2.7, 1.1, 'T'], RE: [5.3, 1.1, 'E'], S: [7.9, 2.2, 'S'], M: [2.4, 5, 'M'], W: [-3, 5, 'W'], C1: [-16, 7, 'C'], C2: [16, 7, 'C'], SS: [5.5, 10.2, '$'], FS: [-2.5, 13.4, 'F'] },
};
const PB_RUNS = {
  IZ: { n: 'Inside zone', ch: 'run', f: ['11', 'Trey', 'SG'], d: 'A', tag: 'Zone', sh: pl => pl.run.IZ, pk: 'IZ',
    b: [['Y', 'RE'], ['RT', 'DT2', 'M'], ['RG', 'DT2'], ['C', 'DT1'], ['LG', 'DT1', 'W'], ['LT', 'LE'], ['SLOT', 'N'], ['Z', 'C2'], ['X', 'C1']],
    c: { who: 'RB', p: [[-0.3, -4.5], [1.0, -1.6], [1.3, 2.4], [0.7, 6.4]], alt: [[1.2, 0.6], [-1.6, 5.6]] }, fk: [[[0, -5], [-2.2, -5.9], [-5.8, -4.6]]],
    note: 'Everyone steps to the play side and takes the man in front of him. Two pairs of linemen double-team the tackles and one man of each pair climbs to a linebacker. The back aims at the guard and reads the blocks: straight ahead, bent back, or bounced outside.',
    rules: ['Line: step play side; double the tackles, then climb to the linebackers', 'Tight end: the end over him', 'Receivers: block the man over them', 'Back: aim at the guard; bang it, bend it or bounce it', 'Quarterback: hand it off and carry out the keep fake'] },
  WZ: { n: 'Wide zone', ch: 'run', f: ['12', 'Ace', 'UC'], d: 'B', tag: 'Zone', sh: pl => pl.run.WZ, pk: 'WZ',
    b: [['H', 'LE'], ['LT', 'W'], ['LG', 'NT'], ['C', 'M'], ['RG', 'DT'], ['RT', 'RE'], ['Y', 'S'], ['Z', 'C2'], ['X', 'C1']],
    c: { who: 'RB', p: [[1.8, -4.6], [6.3, -1.9], [7.9, 1.4], [8.7, 6.3]], alt: [[6.1, -1.5], [4.5, 1.8], [3.8, 6.1]] }, fk: [[[0, -2.85], [1.0, -3.8], [-6.4, -5.1, -1.8, -6.4]]],
    note: 'The stretch: the whole line runs sideways to the play side and reaches the man outside it. The back aims outside the tight end, presses the edge, and cuts up the first crease. The line moving sideways pulls the linebackers with it, so the cut back behind them is often there.',
    rules: ['Line: reach the man outside you; if you cannot, run him past the hole', 'Backside: cut off the pursuit', 'Back: aim at the tight end\'s outside hip; one cut and go', 'Quarterback: hand it off and bootleg the other way'] },
  POWER: { n: 'Power', ch: 'run', f: ['21', 'I', 'UC'], d: 'B', tag: 'Gap', sh: pl => pl.run.POWER, pk: 'POWER',
    b: [['Y', 'RE'], ['RT', 'DT'], ['RG', 'NT', 'W'], ['C', 'NT'], ['LT', [-4.9, -2.0]], ['LG', [-2.1, -2.3], [4.9, -2.3], [6.2, 0.5], 'M'], ['FB', [3.6, -2.6], 'S'], ['Z', 'C2'], ['X', 'C1']],
    c: { who: 'RB', p: [[1.0, -5.0], [5.0, -2.2], [6.6, 0.8], [7.0, 6.2]] }, qb: [[[0, -2.85], [1.2, -4.4]]],
    note: 'A hat on a hat at the point of attack. The play side blocks down, the fullback kicks out the end man, and the backside guard pulls through the hole for the linebacker. The back follows the guard. About a third of these go outside as a toss.',
    rules: ['Play side: block down on the man inside you', 'Center: block back for the pulling guard', 'Backside guard: pull and lead through the hole', 'Fullback: kick out the end man on the line', 'Back: follow the guard\'s hip'] },
  COUNTER: { n: 'Counter', ch: 'run', f: ['11', 'Trey', 'SG'], d: 'A', tag: 'Gap', sh: pl => pl.run.COUNTER, pk: 'COUNTER',
    b: [['RT', 'DT2'], ['RG', 'DT1', 'W'], ['C', 'DT1'], ['LG', [-2.1, -2.3], [5.3, -2.3], 'RE'], ['LT', [-4.1, -3.2], [4.3, -3.2], [5.2, 0.3], 'M'], ['Y', 'N'], ['SLOT', 'SS'], ['Z', 'C2'], ['X', 'C1']],
    c: { who: 'RB', p: [[-3.0, -4.5], [0.4, -3.9], [4.5, -1.5], [5.6, 1.2], [6.0, 6.2]] }, qb: [[[0, -5], [-0.8, -4.5]]],
    note: 'The back steps one way and the ball goes the other. Two men pull from the back side: the guard kicks out the end and the tackle wraps through the hole for the linebacker. The defense flows to the false step and the blockers arrive from behind it.',
    rules: ['Play side: block down', 'Backside guard: pull and kick out the end', 'Backside tackle: pull, wrap up through the hole for the linebacker', 'Back: counter step, then follow the tackle'] },
  DUO: { n: 'Duo', ch: 'run', f: ['12', 'Ace', 'UC'], d: 'B', tag: 'Gap', sh: pl => pl.run.DUO, pk: 'DUO',
    b: [['RT', 'RE'], ['Y', 'RE', 'S'], ['RG', 'DT'], ['C', 'NT'], ['LG', 'NT'], ['LT', 'W'], ['H', 'LE'], ['Z', 'C2'], ['X', 'C1']],
    c: { who: 'RB', p: [[1.3, -4.4], [3.6, -1.0], [3.8, 1.9], [3.4, 6.3]], alt: [[3.7, 1.0], [1.2, 5.8]] }, qb: [[[0, -2.85], [1.1, -4.2]]], read: 'M',
    note: 'Power without a puller: two double teams drive the defensive line back and the middle linebacker is left for the back. He reads him: if the linebacker fills one gap, he takes the other.',
    rules: ['Two double teams at the point; nobody pulls', 'Leave the middle linebacker; the back reads him', 'Back: downhill, then away from where the linebacker goes'] },
  DRAW: { n: 'Draw', ch: 'run', f: ['11', 'Trey', 'SG'], d: 'A', tag: 'Draw', sh: pl => pl.run.DRAW,
    rush: [['LE', [[-5.7, -2.9]]], ['DT1', [[-1.5, -2.3]]], ['DT2', [[3.5, -2.3]]], ['RE', [[7.6, -3]]]],
    b: [['LT', [-4.9, -2.1]], ['LG', [-1.8, -2.0]], ['RG', [3.0, -2.0]], ['RT', [5.0, -2.2]], ['C', 'M'], ['Y', 'N'], ['SLOT', 'SS'], ['Z', 'C2'], ['X', 'C1']],
    c: { who: 'RB', p: [[-1.0, -5.7], [0.8, -1.8], [1.0, 2.6], [0.6, 6.4]] }, qb: [[[0, -5], [-0.2, -6.4]]],
    note: 'It looks like a pass. The line sets to protect and lets the rushers run upfield past the hole; the quarterback drops and hands it to the back late. Best against a defense that is coming hard on passing downs.',
    rules: ['Line: pass set, then ride the rushers past the hole', 'Center: climb to the middle linebacker', 'Back: sell protection, take it late and go'] },
  OPTION: { n: 'Zone read', ch: 'run', f: ['11', 'Trey', 'SG'], d: 'A', tag: 'Option', sh: pl => pl.run.OPTION, pk: 'OPTION',
    b: [['Y', 'RE'], ['RT', 'DT2', 'M'], ['RG', 'DT2'], ['C', 'DT1'], ['LG', 'DT1'], ['LT', 'W'], ['SLOT', 'N'], ['Z', 'C2'], ['X', 'C1']],
    c: { who: 'RB', p: [[-0.3, -4.5], [1.0, -1.6], [1.3, 2.4], [0.7, 6.4]] }, keep: [[0, -5], [-2.6, -4.5], [-7.0, -1.2], [-8.0, 5.8]], read: 'LE',
    note: 'Inside zone with the back-side end left unblocked. The quarterback reads him: if he crashes on the back, the quarterback keeps it and runs where he left. Needs a quarterback who can run. (His designed quarterback runs are counted here too.)',
    rules: ['Line: inside zone; leave the back-side end alone', 'Quarterback: read the end; give if he stays home, keep if he crashes', 'Back: inside zone track'] },
  JET: { n: 'Jet sweep', ch: 'run', f: ['11', 'Trey', 'SG'], d: 'A', tag: 'Perimeter', sh: pl => pl.run.JET,
    b: [['LT', 'LE'], ['LG', 'DT1'], ['C', 'W'], ['RG', 'M'], ['RT', 'DT2'], ['Y', 'RE'], ['X', 'C1'], ['Z', 'C2']], mo: ['SLOT', [2.4, -2.7]],
    c: { who: 'SLOT', from: [2.4, -2.7], p: [[-0.8, -3.7], [-7.0, -3.0], [-10.4, 0.8], [-11.6, 6.2]] }, fk: [[[-1.98, -5.2], [0.6, -4.4], [2.6, -1.6]]],
    note: 'A receiver in full-speed motion takes the ball across the quarterback\'s face and races for the far edge while the back fakes inside zone the other way. Speed to the perimeter; it needs a fast receiver.',
    rules: ['Motion: full speed across the formation; the snap times him', 'Line: reach toward the sweep', 'Back: fake inside zone the other way'] },
  REV: { n: 'Reverse', ch: 'run', f: ['11', 'Trey', 'SG'], d: 'A', tag: 'Gadget', sh: pl => pl.run.REV,
    b: [['LT', 'LE'], ['LG', 'DT1'], ['C', 'W'], ['RG', 'DT2'], ['RT', 'RE'], ['Y', 'N'], ['X', 'C1'], ['SLOT', 'SS']],
    pre: [['Z', [[9.2, -3.5], [2.9, -3.95]]]], c: { who: 'Z', from: [2.9, -3.95], p: [[-5.8, -3.5], [-9.6, 0.2], [-10.6, 6.2]] },
    fk: [[[-1.98, -5.2], [0.2, -4.45], [2.6, -3.9]], [[2.6, -3.9], [5.6, -2.0]]],
    note: 'The flow goes one way and the ball comes back the other: the back takes the handoff toward the strength and gives it to the receiver running the opposite way behind him. The back-side end has to be held, or it dies in the backfield.',
    rules: ['Line: flow to the strength for a count', 'Back-side tackle: pin the end; he cannot chase', 'Back: take it, give it, carry out the fake'] },
  RPO: { n: 'Run-pass option', ch: 'pa', f: ['11', 'Trey', 'SG'], d: 'A', tag: 'RPO', sh: pl => pl.run.RPO, pk: 'RPO', of: 'of his runs',
    b: [['Y', 'RE'], ['RT', 'DT2', 'M'], ['RG', 'DT2'], ['C', 'DT1'], ['LG', 'DT1', 'W'], ['LT', 'LE'], ['Z', 'C2'], ['X', 'C1']],
    c: { who: 'RB', p: [[-0.3, -4.5], [1.0, -1.6], [1.3, 2.4], [0.7, 6.4]] }, opt: [['SLOT', [[14.4, -2.5, 10.4, -3.6]]]], thr: [[[0, -5], [13.6, -2.7]]], read: 'N',
    note: 'A run with a throw attached. The line blocks inside zone; the quarterback watches the defender who has to choose between the run and the receiver. If he steps up for the run, the ball goes out to where he was.',
    rules: ['Line: run blocking; nobody goes downfield', 'Quarterback: read the conflict defender; give or throw', 'Slot: the bubble behind the line'] },
  RBSCR: { n: 'Running back screen', ch: 'scr', f: ['11', 'Trey', 'SG'], d: 'A', tag: 'Screen', sh: pl => pl.pass.SCREEN / 2, pk: 'SCREEN', of: 'of his passes',
    rush: [['LE', [[-3.4, -4.4]]], ['DT1', [[-1.0, -3.7]]]],
    b: [['RG', 'DT2'], ['RT', 'RE'], ['Y', [6.4, -2.2]], ['LT', [-4.4, -2.2], [-9.4, -0.8], [-10.4, 2.4]], ['LG', [-2.3, -2.1], [-7.2, -0.6], [-7.0, 3.2]], ['C', [-0.3, -2.1], [-4.9, -1.2], [-4.4, 2.5]]],
    pre: [['RB', [[-2.6, -4.3], [-5.2, -4.3], [-7.2, -3.5]]]], c: { who: 'RB', from: [-7.2, -3.5], p: [[-8.5, -0.6], [-8.8, 6.2]] },
    qb: [[[0, -5], [0, -7.4]]], thr: [[[0, -7.4], [-6.9, -3.6]]], routes: [['X', [[-15.7, 14.2]]], ['SLOT', [[9.2, 3], [12.4, 12.5]]], ['Z', [[16.3, 14.2]]]],
    note: 'The rush is let in on purpose. The back slips out to the flat behind it, three linemen release in front of him, and the quarterback lofts it over the men chasing him. Best against a defense that is coming.',
    rules: ['Line: block a count, then release to the screen side', 'Back: hold, slide to the flat, catch, get behind the convoy', 'Receivers: run off the coverage'] },
  WRSCR: { n: 'Receiver screen', ch: 'scr', f: ['11', 'Trey', 'SG'], d: 'A', tag: 'Screen', sh: pl => pl.pass.SCREEN / 2, pk: 'SCREEN', of: 'of his passes',
    rush: [['LE', [[-3.6, -4.2]]], ['DT1', [[-0.9, -3.6]]], ['DT2', [[1.6, -3.6]]]],
    b: [['LT', [-4.4, -2.1]], ['LG', [-2.2, -2.0]], ['C', [0, -2.0]], ['Y', 'RE'], ['RT', [4.4, -2.0], [9.0, -0.4], 'N'], ['RG', [2.4, -2.0], [7.4, 0.3], 'M'], ['SLOT', 'C2'], ['X', 'C1']],
    pre: [['Z', [[16, 0.5], [12.6, -1.7]]]], c: { who: 'Z', from: [12.6, -1.7], p: [[10.8, 1.6], [10.2, 6.4]] }, thr: [[[0, -5], [12.3, -1.8]]],
    note: 'The tunnel screen: the outside receiver takes two steps upfield, comes back inside behind the line, and two linemen and the slot build a wall in front of him. A long handoff on the perimeter.',
    rules: ['Receiver: two steps up, come back inside for the ball', 'Tackle and guard: release to the first and second men inside', 'Slot: block the corner'] },
  FLEA: { n: 'Flea flicker', ch: 'scr', f: ['12', 'Ace', 'UC'], d: 'B', tag: 'Gadget', sh: pl => pl.pass.FLEA || 0, of: 'of his passes',
    b: [['LT', [-4.3, -2.1]], ['LG', [-2.1, -2.0]], ['C', [0, -2.0]], ['RG', [2.1, -2.0]], ['RT', [4.3, -2.1]], ['H', [-6.3, -2.2]]],
    fk: [[[0, -7], [1.2, -4.5], [1.8, -2.7]]], qb: [[[0, -2.85], [1.0, -4.1], [0.2, -7.9, 1.4, -6.6]]], thr: [[[1.8, -2.7], [0.3, -7.6]], [[0, -8], [6.6, 14.3]]],
    routes: [['Z', [[16, 8.5], [6.2, 14.4]], 'p1'], ['X', [[-15.6, 14.4]]], ['Y', [[6.2, 6], [7.4, 14.4]]]],
    note: 'The biggest run fake there is: the back takes the handoff, stops, and pitches it back to the quarterback, who throws deep over a secondary that came up for the run.',
    rules: ['Line: run-block look, then protect', 'Back: take it, stop short of the line, pitch it back', 'Receivers: sell the run block, then go deep'] },
};
const PB_RUN_ORDER = ['IZ', 'WZ', 'POWER', 'COUNTER', 'DUO', 'DRAW', 'OPTION', 'JET', 'REV', 'RPO', 'RBSCR', 'WRSCR', 'FLEA'];
function pbRunSVG(k, o = {}) {
  const R = PB_RUNS[k], [pers, fm, snap] = R.f, A = pbAlign(pers, fm, snap), fr = PB_FR.run, Dd = PB_DEF[R.d];
  const pos = key => Dd[key] ? [Dd[key][0], Dd[key][1]] : null, start = key => A[key] ? [A[key].x, A[key].y] : null;
  let lines = '', top = '';
  for (const [key, pts] of R.rush || []) lines += pbLine([pos(key), ...pts], 'pb-rush', 'arrow', 0.7);
  for (const b of R.b || []) { const s0 = start(b[0]); if (!s0) continue; const pts = [s0];
    for (let i = 1; i < b.length; i++) { const tg = b[i]; if (typeof tg === 'string') { const p = pos(tg); if (p) pts.push(pbNear(pts[pts.length - 1], p, 1.1)); } else pts.push(tg); }
    // a receiver's block is a stalk: a few steps at his man, not all the way to him
    if (A[b[0]].kind === 'wr' && pts.length === 2) { const [a, e] = pts, d = Math.hypot(e[0] - a[0], e[1] - a[1]); if (d > 4) pts[1] = [a[0] + (e[0] - a[0]) * 3.4 / d, a[1] + (e[1] - a[1]) * 3.4 / d]; }
    lines += pbLine(pts, 'pb-bk', 'tee'); }
  for (const [key, pts, cls] of R.routes || []) { const s0 = start(key); if (s0) lines += pbLine([s0, ...pts], 'pb-rt ' + (cls || 'ck'), 'arrow'); }
  for (const [key, pts] of R.opt || []) { const s0 = start(key); if (s0) lines += pbLine([s0, ...pts], 'pb-rt p1', 'arrow'); }
  for (const [key, pts] of R.pre || []) { const s0 = start(key); if (s0) lines += pbLine([s0, ...pts], 'pb-rt', ''); }
  if (R.mo) { const s0 = start(R.mo[0]); if (s0) lines += pbLine(pbZig(s0, R.mo[1]), 'pb-mo', ''); }
  for (const p of R.fk || []) lines += pbLine(p, 'pb-fk', 'arrow', 0.7);
  for (const p of R.qb || []) lines += pbLine(p, 'pb-qb', 'arrow', 0.6);
  for (const p of R.thr || []) lines += pbLine(p, 'pb-thr', 'arrow', 0.6);
  if (R.keep) lines += pbLine(R.keep, 'pb-run alt', 'arrow');
  if (R.c) { const c = R.c; lines += pbLine([c.from || start(c.who), ...c.p], 'pb-run', 'arrow'); if (c.alt) lines += pbLine(c.alt, 'pb-run alt', 'arrow', 0.8); }
  if (R.read) { const p = pos(R.read); top += `<g class="pb-read"><circle cx="${pbN(p[0])}" cy="${pbN(-p[1] - 0.05)}" r="1.5"/><text x="${pbN(p[0])}" y="${pbN(-p[1] - 2.05)}">READ</text></g>`; }
  let men = ''; for (const [key, v] of Object.entries(Dd)) men += pbDefMan(key, v[0], v[1], v[2]);
  const mo = o.names ? { names: 1, who: pbWhoOff(o.tid, pers), stag: PB_STAG, noLine: 1 } : {};
  for (const [k2, a] of Object.entries(A)) men += pbMan(k2, a, mo);
  return pbSvg(fr, lines + men + top, o.big ? 'big' : '', R.n);
}

// ---------- coverages and pressures ----------
// Zones by where they sit, x measured toward the strength of the formation: [x, y, half-width, half-depth, label]
const PB_Z = {
  d3W: [-15, 17, 6.4, 3.5, 'Deep ⅓'], d3M: [0, 18.2, 6.4, 3.5, 'Deep ⅓'], d3S: [15, 17, 6.4, 3.5, 'Deep ⅓'], d2W: [-10.5, 17.6, 9.4, 3.7, 'Deep ½'], d2S: [10.5, 17.6, 9.4, 3.7, 'Deep ½'],
  d4WO: [-16.2, 16.4, 4.5, 3.3, 'Deep ¼'], d4WI: [-5.6, 16.4, 4.5, 3.3, 'Deep ¼'], d4SI: [5.6, 16.4, 4.5, 3.3, 'Deep ¼'], d4SO: [16.2, 16.4, 4.5, 3.3, 'Deep ¼'],
  dMid: [0, 18.4, 9, 3.6, 'Deep middle'], pole: [0, 13.8, 3.6, 2.4, 'Middle'], fW: [-16, 4.2, 4.6, 2.3, 'Flat'], fS: [16, 4.2, 4.6, 2.3, 'Flat'],
  cfW: [-13, 6.4, 4.6, 2.6, 'Curl-flat'], cfS: [13, 6.4, 4.6, 2.6, 'Curl-flat'], cW: [-10, 8.6, 3.8, 2.4, 'Curl'], cS: [10, 8.6, 3.8, 2.4, 'Curl'],
  hW: [-4.6, 8.4, 3.5, 2.3, 'Hook'], hS: [4.6, 8.4, 3.5, 2.3, 'Hook'], hM: [0, 9, 3.5, 2.3, 'Hook'], rat: [0, 6.2, 2.8, 1.8, 'Hole'],
};
const PB_DEEPZ = new Set(['d3W', 'd3M', 'd3S', 'd2W', 'd2S', 'd4WO', 'd4WI', 'd4SI', 'd4SO', 'dMid', 'pole']);
// A coverage: where the corners play (off, pressed, squatting), how many safeties sit high, and each man's job. Whoever is left
// over drops into the underneath zones in the order they stand across the field.
const PB_COVS = {
  C3: { cb: 'off', hi: 1, deep: { CW: 'd3W', CS: 'd3S', FS: 'd3M' }, under: ['cfW', 'hW', 'hS', 'cfS'] },
  C1: { cb: 'press', hi: 1, deep: { FS: 'dMid' }, man: ['CW', 'CS', 'N', 'SS', 'W'], under: ['rat'] },
  C0: { cb: 'press', hi: 0, man: ['CW', 'CS', 'N', 'SS', 'W'], blitz: { M: 0.95, FS: -0.95 } },
  C2: { cb: 'squat', hi: 2, deep: { FS: 'd2W', SS: 'd2S' }, flat: { CW: 'fW', CS: 'fS' }, under: ['cW', 'hM', 'cS'] },
  T2: { cb: 'squat', hi: 2, deep: { FS: 'd2W', SS: 'd2S', M: 'pole' }, flat: { CW: 'fW', CS: 'fS' }, under: ['cW', 'cS'] },
  C2M: { cb: 'press', hi: 2, deep: { FS: 'd2W', SS: 'd2S' }, man: ['CW', 'CS', 'N', 'M', 'W'] },
  C4: { cb: 'off', hi: 2, deep: { CW: 'd4WO', FS: 'd4WI', SS: 'd4SI', CS: 'd4SO' }, under: ['cfW', 'hM', 'cfS'] },
  C6: { cb: 'c6', hi: 2, deep: { FS: 'd2W', SS: 'd4SI', CS: 'd4SO' }, flat: { CW: 'fW' }, under: ['cW', 'hM', 'cfS'] },
  // what plays behind the pressures
  FOUR: { cb: 'off', hi: 2, none: 1 },
  BLITZ: { cb: 'press', hi: 1, deep: { FS: 'dMid' }, man: ['CW', 'CS', 'N', 'SS', 'W'], blitz: { M: 0.95 } },
  FZ: { cb: 'off', hi: 1, deep: { CW: 'd3W', CS: 'd3S', FS: 'd3M' }, drop: { LE: 'cfW' }, blitz: { N: 'edge', W: -1.9 }, under: ['hM', 'cfS'] },
  SIM: { cb: 'off', hi: 1, deep: { CW: 'd3W', CS: 'd3S', FS: 'd3M' }, drop: { LE: 'hW' }, blitz: { M: 0.95 }, under: ['cfW', 'hS', 'cfS'] },
  THREE: { cb: 'squat', hi: 2, deep: { FS: 'd2W', SS: 'd2S' }, flat: { CW: 'fW', CS: 'fS' }, drop: { LE: 'hW' }, under: ['cW', 'hM', 'cS'] },
};
const PB_COV_TAG = { C3: 'Single high · zone', C1: 'Single high · man', C0: 'Nobody deep · man', C2: 'Two high · zone', T2: 'Two high · zone', C2M: 'Two high · man', C4: 'Two high · match', C6: 'Split field' };
const PB_PRES_TAG = { FOUR: '4 rush · 7 cover', BLITZ: '5 rush · man behind', FZ: '5 rush · 3 deep, 3 under', SIM: '4 rush · not the four he showed', THREE: '3 rush · 8 cover' };
const COV_NOTE = {
  C3: 'Three deep, four under. The corners and the free safety split the deep field in thirds and the strong safety rolls down to the curl and the flat. A safety in the box helps against the run; the seams and the flats are the soft spots.',
  C1: 'Man to man across the board with a free safety deep in the middle and a linebacker sitting in the hole. Tight on every receiver; a crosser, a rub or a receiver who simply wins can run away from it.',
  C0: 'Everyone in man and nobody deep: the two men left over come after the quarterback. The ball has to come out now, and a receiver who wins has no one behind him.',
  C2: 'Two safeties split the deep field in halves; the corners squat in the flats and jam the outside men. Five underneath take away the short game. The hole between the safeties and the sideline behind the corner are the soft spots.',
  T2: 'Cover 2 with the middle linebacker running down the middle of the field to close the hole between the safeties. Built to keep everything in front of it.',
  C2M: 'Man underneath with two safeties over the top. The underneath men play tight and trail their receivers because the help is behind them. Hard to throw on; it leaves the box light against the run.',
  C4: 'Quarters: four deep, each taking a quarter of the field, the safeties reading the inside receivers and jumping their routes. Strong against four verticals and the run; the flats are open.',
  C6: 'Quarter-quarter-half: quarters to the strength of the formation and Cover 2 to the weak side. A way to match a three-by-one set or an offense that throws to one side.',
};
const PRES_NOTE = {
  FOUR: 'The four linemen rush and seven drop. The coverage is whatever was called behind it, and the line has to get home on its own.',
  BLITZ: 'A linebacker comes with the four linemen and everyone else plays man, a free safety deep. Five rushers against five blockers: someone has to pick him up or the ball has to come out.',
  FZ: 'Five come, two of them from off the ball, while a lineman drops into the short zone they left. Three deep and three under behind it: the hot throw the quarterback expects to be open is covered by a man he never saw coming.',
  SIM: 'Four rush, but not the four the defense showed: a linebacker comes and a lineman drops out. The protection slides to the wrong man and the coverage stays whole behind it.',
  THREE: 'Three rush and eight drop: two deep and six underneath. Clogs every window on third and long, and gives the quarterback time.',
};
// the defense lined up against an offense for a coverage. Keys are jobs by side: CW the weak corner, CS the strong one, LE the weak end
function pbDefLine(cov, A) {
  const P = PB_COVS[cov] || PB_COVS.C3, rec = Object.entries(A).filter(([k, a]) => a.kind === 'wr' || a.kind === 'te').map(([k, a]) => ({ k, x: a.x, y: a.y, te: a.kind === 'te' }));
  const L = rec.filter(r => r.x < 0).sort((a, b) => a.x - b.x), R = rec.filter(r => r.x > 0).sort((a, b) => b.x - a.x), str = R.length >= L.length ? 1 : -1;
  const S = str > 0 ? R : L, W = str > 0 ? L : R, D = {};
  const att = side => rec.filter(r => r.te && Math.sign(r.x) === side && r.y > -1.5).sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[0];
  const teS = att(str), teW = att(-str);
  D.LE = [-str * (teW ? Math.abs(teW.x) + 1.0 : 5.2), 1.1, 'E']; D.DT1 = [-str * 2.7, 1.1, 'T']; D.DT2 = [str * 2.7, 1.1, 'T']; D.RE = [str * (teS ? Math.abs(teS.x) + 1.0 : 5.2), 1.1, 'E'];
  const corner = (list, side, how) => { const o = list[0]; if (!o || o.te) return [side * 11, 6.5]; return how === 'off' ? [o.x - side * 1.0, 6.6] : how === 'squat' ? [o.x + side * 0.7, 1.7] : [o.x - side * 0.6, 1.35]; };
  D.CW = [...corner(W, -str, P.cb === 'c6' ? 'squat' : P.cb), 'C']; D.CS = [...corner(S, str, P.cb === 'c6' ? 'off' : P.cb), 'C'];
  // the nickel over the second receiver out, the strong side's first
  const n2 = [S[1], W[1]].find(r => r && !r.te) || [S[1], W[1]].find(Boolean);
  D.N = n2 ? [n2.x - Math.sign(n2.x) * 0.9, 4.8, 'N'] : [str * 7.5, 4.8, 'N'];
  D.W = [-str * 2.9, 5.2, 'W']; D.M = [str * 1.8, 5.2, 'M'];
  if (P.hi === 2) { D.FS = [-str * 9.5, 12.6, 'F']; D.SS = [str * 9.5, 12.6, '$']; }
  else if (P.hi === 1) { D.FS = [0, 13.4, 'F']; D.SS = [str * (cov === 'C1' || cov === 'BLITZ' ? 6.8 : 8.6), 7.4, '$']; }
  else { D.FS = [-str * 1.5, 8.4, 'F']; D.SS = [str * 6.8, 6.4, '$']; }
  return { D, str, rec };
}
// a coverage (or a pressure, with what plays behind it) drawn against an offense lined up as A
function pbCovLayer(cov, A, o = {}) {
  const P = PB_COVS[cov] || PB_COVS.C3, { D, str, rec } = pbDefLine(cov, A), q = A.QB || { x: 0, y: -5 }, job = {};
  const z = id => { const Z = PB_Z[id]; return [Z[0] * str, Z[1], Z[2], Z[3], Z[4]]; };
  let zones = '', lines = '', men = '';
  const drop = (key, id) => { const Z = z(id), [x, y] = D[key], deep = PB_DEEPZ.has(id); zones += pbZone(Z, !deep); const ty = Z[1] - (deep ? Z[3] * 0.4 : 0);
    lines += pbLine([[x, y], [x + (Z[0] - x) * 0.9, y + (ty - y) * 0.9]], 'pb-drop', 'arrow', 0.62); job[key] = Z[4]; };
  const used = new Set([...Object.keys(P.deep || {}), ...Object.keys(P.flat || {}), ...(P.man || []), ...Object.keys(P.blitz || {})]);
  for (const [key, id] of Object.entries(P.deep || {})) drop(key, id);
  for (const [key, id] of Object.entries(P.flat || {})) drop(key, id);
  for (const [key, id] of Object.entries(P.drop || {})) drop(key, id);
  // man: the corners take the widest men, the nickel and the safety the next ones in, a linebacker the back
  if (P.man) {
    const backs = Object.entries(A).filter(([k, a]) => a.kind === 'bk').map(([k, a]) => ({ k, x: a.x, y: a.y, bk: 1 })), pool = rec.concat(backs), taken = new Set();
    for (const key of P.man) { const [x, y] = D[key], left = pool.filter(r => !taken.has(r.k)); let pick;
      if (key === 'CW' || key === 'CS') pick = left.filter(r => !r.bk && Math.sign(r.x) === (key === 'CS' ? str : -str)).sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[0];
      else if (key === 'W') pick = left.filter(r => r.bk).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
      if (!pick) pick = left.filter(r => !r.bk).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0] || left[0];
      if (!pick) continue; taken.add(pick.k); job[key] = 'Man on the ' + (SLOT_WORD[pick.k] || pick.k).toLowerCase();
      lines += pbLine([[x, y - 0.4], [pick.x, pick.y + PB.r + 0.25]], 'pb-man', ''); }
  }
  for (const [key, v] of Object.entries(P.blitz || {})) { const [x, y] = D[key], gx = v === 'edge' ? Math.sign(x) * 6.6 : v * str;
    lines += pbLine([[x, y], [gx, 0.7], [gx * 0.5, q.y + 1.4]], 'pb-blz', 'arrow', 0.8); job[key] = 'Blitz'; }
  const left = ['N', 'W', 'M', 'SS', 'FS'].filter(k => !used.has(k)).sort((a, b) => D[a][0] * str - D[b][0] * str);
  if (P.none) for (const key of left) { if (key === 'FS' || key === 'SS') continue; const [x, y] = D[key]; lines += pbLine([[x, y], [x * 0.92, y + 2.6]], 'pb-drop', 'arrow', 0.62); job[key] = 'Drops'; }
  else { const U = P.under || []; left.forEach((key, i) => { if (U[i]) drop(key, U[i]); }); }
  // the line: rushers, unless they dropped
  const rushers = ['LE', 'DT1', 'DT2', 'RE'].filter(k => !(P.drop && P.drop[k]));
  if (!o.faint) for (const key of rushers) { const [x, y] = D[key], edge = Math.abs(x) > 4, ex = Math.sign(x) * Math.min(Math.abs(x) * 0.42, 2.6);
    lines += pbLine(edge ? [[x, y], [ex, q.y + 1.5, x * 1.05, q.y + 3.2]] : [[x, y], [x * 0.5, q.y + 1.6]], o.press ? 'pb-rush2' : 'pb-rush', 'arrow', 0.7); job[key] = job[key] || 'Rush'; }
  const up = {}; ['LE', 'DT1', 'DT2', 'RE'].sort((a, b) => D[a][0] - D[b][0]).forEach((k, i) => { up[k] = i % 2 ? 0.95 : 0; }); // the line's names take turns a row higher
  for (const [key, v] of Object.entries(D)) men += pbDefMan(key, v[0], v[1], v[2], { dim: o.faint, names: o.names, who: o.who, up: up[key] });
  if (o.jobs) Object.assign(o.jobs, job);
  return `<g class="pb-cov${o.faint ? ' faint' : ''}">${zones}${lines}${men}</g>`;
}
const PB_REF = () => pbAlign('11', 'Doubles', 'SG');
function pbCovSVG(cov, o = {}) {
  const A = PB_REF(); let men = ''; for (const [k, a] of Object.entries(A)) men += pbMan(k, a, { dim: 1 });
  return pbSvg(PB_FR.def, men + pbCovLayer(cov, A, Object.assign({ press: !!PRES_NOTE[cov] }, o)), o.big ? 'big' : '', PK_NAME[cov] || cov);
}
// line games: the four linemen and the two linebackers in a sub front
const PB_GDEF = { LE: [-5.6, 1.1, 'E'], DT1: [-2.7, 1.1, 'T'], DT2: [2.7, 1.1, 'T'], RE: [5.6, 1.1, 'E'], W: [-2.8, 5, 'W'], M: [2.2, 5, 'M'] };
const PB_GAMES = {
  SL: { n: 'Slant', p: { LE: [[-3.9, -0.6], [-3.4, -3.4]], DT1: [[-1.1, -0.6], [-0.8, -3.4]], DT2: [[4.3, -0.6], [4.1, -3.4]], RE: [[7.1, -0.7], [6.3, -3.6]] }, lb: { W: [[-4.9, 3.6]], M: [[0.1, 3.6]] },
    note: 'The whole line takes a step into the next gap at the snap, toward the strength or away from it, or both tackles pinch inside. It wrecks the blocking rules of a zone run; the linebackers scrape the other way to fill the gaps it left.' },
  TT: { n: 'Tackle twist', p: { DT2: [[0.7, -0.5], [0.2, -3.6]], DT1: [[-1.6, 2.3, -2.9, 2.4], [1.6, 0.1], [1.3, -3.6]], LE: 'r', RE: 'r' },
    note: 'One tackle crashes across the center\'s face and the other loops around behind him into the gap he left. Built to beat a line that passes its men off late.' },
  TE: { n: 'Tackle-end twist', p: { DT2: [[4.6, -0.6], [4.0, -3.6]], RE: [[4.3, 2.4, 5.8, 2.4], [2.0, 0.2], [1.5, -3.6]], LE: 'r', DT1: 'r' },
    note: 'The tackle drives outside into the tackle\'s gap and the end loops inside behind him: the tackle picks, the end comes free up the middle.' },
  MUG: { n: 'Walked-up linebackers', pos: { W: [-1.0, 1.9], M: [1.0, 1.9] }, p: { LE: 'r', DT1: 'r', DT2: 'r', RE: 'r' },
    two: { W: [[[-0.6, -0.3], [-0.4, -3.6]], [[-4.6, 7.4]]], M: [[[0.6, -0.3], [0.4, -3.6]], [[4.6, 7.4]]] },
    note: 'Both linebackers walk up into the gaps beside the center before the snap. Either may come or drop back into coverage, so the protection has to account for six and cannot know which.' },
};
function pbGameSVG(k, o = {}) {
  const G = PB_GAMES[k], A = {}; OL_SLOTS.forEach((s, i) => { A[s] = { x: (i - 2) * PB.line, y: PB.ol, kind: s === 'C' ? 'c' : 'ol' }; }); A.QB = { x: 0, y: -5, kind: 'qb' }; A.RB = { x: -1.98, y: -5.2, kind: 'bk' };
  let lines = '', men = '';
  for (const [key, v] of Object.entries(PB_GDEF)) { const [x, y] = G.pos && G.pos[key] ? G.pos[key] : v, p = G.p[key];
    if (p === 'r') { const edge = Math.abs(x) > 4; lines += pbLine(edge ? [[x, y], [Math.sign(x) * 2.4, -3.6, x * 1.05, -2]] : [[x, y], [x * 0.5, -3.4]], 'pb-rush', 'arrow', 0.7); }
    else if (p) lines += pbLine([[x, y], ...p], 'pb-rush2', 'arrow', 0.75);
    if (G.lb && G.lb[key]) lines += pbLine([[x, y], ...G.lb[key]], 'pb-drop', 'arrow', 0.65);
    if (G.two && G.two[key]) { lines += pbLine([[x, y], ...G.two[key][0]], 'pb-blz alt', 'arrow', 0.7); lines += pbLine([[x, y], ...G.two[key][1]], 'pb-drop alt', 'arrow', 0.65); }
    men += pbDefMan(key, x, y, v[2]); }
  for (const [k2, a] of Object.entries(A)) men += pbMan(k2, a, { dim: 1 });
  return pbSvg(PB_FR.game, lines + men, o.big ? 'big' : '', G.n);
}
// ---------- fronts and formations ----------
const PB_DL = { LE: 'E', RE: 'E', LDE: 'E', RDE: 'E', NT: 'N', DT: 'T', DT1: 'T', DT2: 'T', LT: 'T', RT: 'T', LOLB: 'J', ROLB: 'S', MLB: 'M', WLB: 'W', SAM: 'S', NCB: 'N', DIME: 'D', CB1: 'C', CB2: 'C', FS: 'F', SS: '$', BIGN: 'N' };
function pbLookSVG(front, pkg, fam, name, o = {}) {
  const L = LOOKS[fam][name], rows = lookRows(packageLayout0(front, pkg), { t: L.t });
  let g = '', men = '';
  for (const [gx, l] of [[1, 'A'], [3, 'B'], [5, 'C'], [7, 'D']]) for (const s of [-1, 1]) if (l !== 'D' || s > 0) g += `<text class="pb-gap" x="${s * gx}" y="2.7">${l}</text>`;
  OL_SLOTS.forEach((k, i) => { men += pbMan(k, { x: (i - 2) * PB.line, y: PB.ol, kind: k === 'C' ? 'c' : 'ol' }); });
  men += pbMan('Y', { x: 6, y: PB.ol, kind: 'te' });
  for (const r of rows) { if (r[3] > 6.2) continue; const ln = r[3] === 0, x = r[2] * PB.line, y = ln ? 1.15 : r[3];
    men += pbDefMan(r[0], x, y, PB_DL[r[0]] || r[0][0]); if (ln) g += `<text class="pb-tq" x="${pbN(x)}" y="${pbN(-y - 1.55)}">${techOf(r[2])}</text>`; }
  return pbSvg(PB_FR.box, g + men, o.big ? 'big' : '', `${name} alignment`);
}
function pbFormSVG(pers, fm, snap) { const A = pbAlign(pers, fm, snap); let men = ''; for (const [k, a] of Object.entries(A)) men += pbMan(k, a); return pbSvg(PB_FR.form, men, 'form', `${fm} formation`); }
// the formation on the field with the men who would be in it
function pbOffFieldSVG(tid, pers, fm, snap) {
  const A = pbAlign(pers, fm, snap), who = pbWhoOff(tid, pers), stag = Object.assign({}, PB_STAG); let men = '';
  // the men on the line take turns: every other name a row lower, so neighbours' names do not run together
  Object.entries(A).filter(([k, a]) => a.y === PB.ol && Math.abs(a.x) < 9).sort((a, b) => a[1].x - b[1].x).forEach(([k], i) => { stag[k] = i % 2; });
  for (const [k, a] of Object.entries(A)) men += pbMan(k, a, { names: 1, who, stag, line: 1 });
  return pbSvg(PB_FR.ofield, men, 'big field', `${fm} with the players`);
}
function pbDefFieldSVG(tid, pkg, look) {
  let men = '', g = '';
  OL_SLOTS.forEach((k, i) => { men += pbMan(k, { x: (i - 2) * PB.line, y: PB.ol, kind: k === 'C' ? 'c' : 'ol' }, { dim: 1 }); }); men += pbMan('Y', { x: 6, y: PB.ol, kind: 'te' }, { dim: 1 });
  for (const e of defLineup(tid, pkg, look)) { const wide = ['CB', 'NCB', 'DIME', 'BIGN'].includes(e.slot) || /^CB|NCB|DIME/.test(e.name), x = wide ? wideX(e.x || 0) : (e.x || 0) * PB.line, ln = (e.depth || 0) === 0, y = ln ? 1.15 : e.depth;
    men += pbDefMan(e.name, x, y, PB_DL[e.name] || e.name[0], { names: 1, who: { [e.name]: e } }); if (ln) g += `<text class="pb-tq sub" x="${pbN(x + 1.05)}" y="${pbN(-0.25)}">${techOf(e.x || 0)}</text>`; }
  return pbSvg(PB_FR.dfield, g + men, 'big field', 'The defense on the field');
}

// ---------- the book: what goes on each page ----------
const PB_CH = [['over', 'Overview'], ['run', 'Runs'], ['pass', 'Passes'], ['pa', 'Play-action'], ['scr', 'Screens'], ['form', 'Formations'], ['front', 'Fronts'], ['cov', 'Coverages'], ['pres', 'Pressures'], ['scout', 'Film'], ['who', 'Lineups']];
const PB_SEP = { run: 1, front: 1, scout: 1 };
const PB_FAM = { QUICK: ['Quick game', 'quick game'], DROP: ['Dropback', 'dropbacks'], DEEP: ['Shot plays', 'shot plays'], PA: ['Play-action', 'play-action passes'], BOOT: ['Bootlegs', 'bootlegs'] };
const COV_SHORT = { C0: 'C0', C1: 'C1', C2: 'C2', C2M: '2-Man', C3: 'C3', C4: 'C4', T2: 'Tampa', C6: 'C6' };
const PLAY_LABEL = Object.assign({ SNEAK: 'QB sneak', FB: 'Fullback dive' }, ...Object.entries(PB_RUNS).map(([k, R]) => ({ [k]: R.n })), ...Object.keys(CONCEPTS).map(k => ({ [k]: k })));
function pbTid() { return ui.pbTid == null || !T(ui.pbTid) ? state.userTid : ui.pbTid; }
function pbSrc(t) { return t.advS && t.advS.plays ? { a: t.advS, lbl: `${state.season} season to date` } : t.advPrev && t.advPrev.plays ? { a: t.advPrev, lbl: `${t.advPrev.season} season` } : null; }
function pbStat(src, key) { const a = src && src.a, n = a && a['u_' + key]; return n ? { n, e: a['e_' + key] / n, s: (a['s_' + key] || 0) / n } : null; }
function pbStatHTML(src, key, def) { const s = pbStat(src, key); if (!s) return ''; const e = def ? -s.e : s.e;
  return `<span class="pb-st" title="${esc(src.lbl)}">${s.n} ${def ? 'snaps' : s.n === 1 ? 'call' : 'calls'} · ${Math.round(s.s * 100)}%${def ? ' allowed' : ''} · <b class="${e > 0.08 ? 'good' : e < -0.08 ? 'bad' : ''}">${s.e >= 0 ? '+' : ''}${s.e.toFixed(2)}</b></span>`; }
function pbBeats(k) { const e = Object.entries(CONCEPTS[k].vs).sort((a, b) => b[1] - a[1]), good = e.filter(x => x[1] >= 0.07).slice(0, 3).map(x => COV_SHORT[x[0]]), bad = e.filter(x => x[1] <= -0.07).slice(-3).reverse().map(x => COV_SHORT[x[0]]);
  return (good.length ? `<span><b class="good">Beats</b> ${good.join(' ')}</span>` : '') + (bad.length ? `<span><b class="bad">Hurt by</b> ${bad.join(' ')}</span>` : ''); }
const pbPc = v => Math.round(v * 100) + '%';
function pbFamShare(pl, f) { return { QUICK: pl.pass.QUICK, DROP: pl.pass.DROP, DEEP: pl.pass.DEEP, PA: pl.pass.PA, BOOT: pl.pass.BOOT }[f] || 0; }
// everything on one page of the book, in the order it is printed: [{ id, name, call, pct, pctNote, svg(o), info(), foot }]
function pbItems(t, ch) {
  const tn = offTend(t), pl = offPlan(tn), by = tn.by || {}, src = pbSrc(t), dt = defTend(t), pk = dt.pk, out = [];
  const brought = id => id && by[id] && C(by[id]) ? `<span class="pb-by">${esc(C(by[id]).last)}'s</span>` : '';
  const runs = () => { for (const k of PB_RUN_ORDER) { const R = PB_RUNS[k]; if (R.ch !== ch) continue; const v = R.sh(pl) || 0; if (v < 0.005) continue;
    out.push({ id: 'run:' + k, k, name: R.n, call: pbCallName(...R.f), pct: pbPc(v), pctNote: R.of || 'of his runs', v, rare: v < PK_MIN, svg: o => pbRunSVG(k, Object.assign({ tid: t.id }, o)), info: () => pbRunInfo(t, k, v),
      foot: `<span class="pb-tag">${R.tag}</span>${brought(R.pk)}${pbStatHTML(src, 'play' + k)}` }); } };
  const cpts = fams => { const book = conceptBook(t); for (const f of fams) { const fs = pbFamShare(pl, f); for (const [k, v] of Object.entries(book[f] || {}).sort((a, b) => b[1] - a[1])) { const F = pbCptForm(t, k);
    out.push({ id: 'cpt:' + k, k, fam: f, name: k, call: pbCallName(F.pers, F.fm, F.snap), pct: pbPc(v), pctNote: 'of his ' + PB_FAM[f][1], v: v * fs, rare: v * fs < 0.01, svg: o => pbConceptSVG(t, k, Object.assign({ tid: t.id }, o)), info: () => pbConceptInfo(t, k, v, fs),
      foot: pbBeats(k) + pbStatHTML(src, 'play' + k), vs: 1 }); } } };
  if (ch === 'run' || ch === 'scr') runs();
  else if (ch === 'pass') cpts(['QUICK', 'DROP', 'DEEP']);
  else if (ch === 'pa') { cpts(['PA', 'BOOT']); runs(); }
  else if (ch === 'cov' && pk) for (const [k, v] of Object.entries(pk.sh).sort((a, b) => b[1] - a[1])) out.push({ id: 'cov:' + k, k, short: PB_COV_TAG[k], name: SHELLS[k] || k, call: 'Nickel · against 11 Doubles', pct: pbPc(v), pctNote: 'of his coverages', v, rare: v < PK_MIN,
    svg: o => pbCovSVG(k, Object.assign({ who: o.names ? pbWhoDef(t.id) : null }, o)), info: () => pbCovInfo(t, k, v), foot: `<span class="pb-tag">${PB_COV_TAG[k] || ''}</span>${pk.by[k] && C(pk.by[k]) ? `<span class="pb-by">${esc(C(pk.by[k]).last)}'s</span>` : ''}${pbStatHTML(src, 'cov' + k, 1)}` });
  else if (ch === 'pres' && pk) for (const [k, v] of Object.entries(pk.pr).sort((a, b) => b[1] - a[1])) out.push({ id: 'pres:' + k, k, short: PB_PRES_TAG[k], name: PRESSURES[k] || k, call: 'Nickel · against 11 Doubles', pct: pbPc(v), pctNote: 'of his rushes', v, rare: v < PK_MIN,
    svg: o => pbCovSVG(k, Object.assign({ who: o.names ? pbWhoDef(t.id) : null }, o)), info: () => pbPresInfo(t, k, v), foot: `<span class="pb-tag">${PB_PRES_TAG[k] || ''}</span>${pk.by[k] && C(pk.by[k]) ? `<span class="pb-by">${esc(C(pk.by[k]).last)}'s</span>` : ''}${pbStatHTML(src, 'pres' + k, 1)}` });
  else if (ch === 'form') { const pers = pbPers(t), snap = ui.pbForm || 'SG', cur = FORMS[pers] && FORMS[pers][ui.pbFm] ? ui.pbFm : FORM_HOME[pers];
    for (const [k, v] of formShares(t, pers)) out.push({ id: 'fm:' + k, k, act: 'pbFm', sel: k === cur, name: k, call: `${PERS_LABEL[pers] ? pers + ' personnel' : pers}${k === FORM_HOME[pers] ? ' · home' : ''}`, pct: pbPc(v), pctNote: 'of the grouping', v,
      svg: () => pbFormSVG(pers, k, formSnap(pers, k) === 'UC' && snap !== 'EMP' ? 'UC' : snap === 'PI' ? 'PI' : 'SG'), foot: `<span class="pb-note">${esc(FORM_NOTE[k] || '')}</span>`, tip: 'Show it on the field above' }); }
  else if (ch === 'front') { const cur = ui.pbLook;
    for (const pkg of ['BASE', 'NICKEL']) { const { fam, list } = looksFor(t.id, pkg);
      list.forEach(([k, v], i) => { const L = LOOKS[fam][k]; out.push({ id: `look:${pkg}:${k}`, k, pkg, act: 'pbLook', data: `data-pkg="${pkg}"`, sel: cur === k, grp: pkg, name: k, call: `${pkg === 'BASE' ? esc(dt.front || '') + ' base' : 'Nickel and dime'}${i === 0 ? ' · home look' : L.k === 'run' ? ' · run look' : L.k === 'rush' ? ' · rush look' : ''}`,
        pct: pbPc(v), pctNote: pkg === 'BASE' ? 'of base snaps' : 'of sub snaps', v, svg: o => pbLookSVG(dt.front, pkg, fam, k, o), foot: `<span class="pb-note">${esc(LOOK_NOTE[k] || '')}</span>`, tip: 'Show it on the field above with the players' }); }); }
    const lib = pk && pk.lib; if (lib) {
      const sd = lib.sd || {}, way = [['S', 'to the strength'], ['W', 'away from it'], ['P', 'both tackles pinching']].sort((a, b) => (sd[b[0]] || 0) - (sd[a[0]] || 0));
      const g = (k, v, note, sub) => out.push({ id: 'game:' + k, k, grp: 'games', name: PB_GAMES[k].n, call: 'Line game', pct: pbPc(v), pctNote: note, v, rare: v < 0.02, sub, svg: o => pbGameSVG(k, o), info: () => pbGameInfo(t, k, v, note, sub), foot: `<span class="pb-note">${esc(sub)}</span>` });
      g('SL', lib.sl || 0, 'of snaps', lib.sl >= 0.02 ? `Most often ${way[0][1]} (${way.map(w => `${w[1]} ${pbPc(sd[w[0]] || 0)}`).join(' · ')}).` : 'Almost never.');
      const tw = dt.stunt || 0, tt = lib.tt;
      g('TT', tw * tt, 'of rushes', tt >= 0.6 ? 'His usual twist: the two tackles trade lanes.' : tt <= 0.4 ? 'The other twist is his usual one.' : 'About as often as the tackle-end twist.');
      g('TE', tw * (1 - tt), 'of rushes', tt <= 0.4 ? 'His usual twist: a tackle and the end beside him.' : tt >= 0.6 ? 'The tackle twist is his usual one.' : 'About as often as the tackle twist.');
      g('MUG', lib.mug || 0, 'of sub snaps', lib.mug >= 0.02 ? 'More on passing downs. They may come or drop.' : 'Almost never.');
    } }
  return ch === 'run' || ch === 'scr' ? out.sort((a, b) => b.v - a.v) : out;
}
function pbPers(t) { const ot = offTend(t), used = Object.entries(ot.pers || {}).sort((x, y) => y[1] - x[1]).map(x => x[0]).filter(k => PERSONNEL[k]); return ui.pbPers && PERSONNEL[ui.pbPers] ? ui.pbPers : used[0] || '11'; }
function pbCardHTML(it) {
  return `<div class="pb-card${it.rare ? ' rare' : ''}${it.sel ? ' sel' : ''}" data-action="${it.act || 'pbPlay'}" data-k="${esc(it.act ? it.k : it.id)}" ${it.data || ''} tabindex="0" role="button" title="${esc(it.tip || 'Open the page')}">
    <div class="pb-ch"><div class="pb-t"><span class="pb-call">${it.call}</span><b class="pb-nm">${esc(it.name)}</b></div><span class="pb-pct">${it.pct}<small>${it.pctNote}</small></span></div>
    ${it.svg({})}${it.foot ? `<div class="pb-cf">${it.foot}</div>` : ''}</div>`;
}
const pbGrid = list => list.length ? `<div class="pb-grid">${list.map(pbCardHTML).join('')}</div>` : '';
const pbH = (title, n, note) => `<div class="rs-sh pb-h"><h3>${title}</h3>${n ? `<span class="rs-shn">${n}</span>` : ''}</div>${note ? `<p class="rs-note">${note}</p>` : ''}`;

// ---------- the play's page ----------
function pbReadsHTML(t, k) {
  const { F, rs } = pbConceptPlan(t, k), who = pbWhoOff(t.id, F.pers);
  return `<ol class="pb-reads">${rs.map((r, i) => { const e = who[r.k], nm = e && e.p && e.p.a ? playerLink(e.p) : '';
    return `<li class="${i === 0 ? 'p1' : r.role >= 3 ? 'ck' : ''}"><b>${i + 1}</b><span>${SLOT_WORD[r.k] || r.k}${nm ? ` · ${nm}` : ''}</span><em>${ART_WORD[r.art] || r.art}${['go', 'fade', 'seam', 'post', 'wheel', 'sluggo'].includes(r.art) ? '' : ` at ${Math.round(r.D)}`}</em></li>`; }).join('')}</ol>`;
}
function pbVsWord(v) { return v >= 0.1 ? ['Built for it', 'good'] : v >= 0.04 ? ['Good', 'good'] : v > -0.04 ? ['Even', ''] : v > -0.1 ? ['Poor', 'bad'] : ['Bad', 'bad']; }
function pbConceptInfo(t, k, v, fs) {
  const c = CONCEPTS[k], src = pbSrc(t), vs = Object.entries(c.vs).sort((a, b) => b[1] - a[1]), cur = ui.pbVs;
  const rows = vs.map(([cv, x]) => { const [w, cls] = pbVsWord(x), wd = Math.min(50, Math.abs(x) / 0.3 * 50);
    return `<tr class="${cur === cv ? 'on' : ''}" data-action="pbVs" data-v="${cur === cv ? '' : cv}" title="Draw it against ${esc(SHELLS[cv])}"><th class="l">${SHELLS[cv]}</th><td class="pb-vb"><i class="${x >= 0 ? 'up' : 'dn'}" style="${x >= 0 ? 'left:50%' : `left:${50 - wd}%`};width:${wd}%"></i></td><td class="l ${cls}">${w}</td><td class="pb-lg">${pbPc(COV_MIX[cv] || 0)}</td></tr>`; }).join('');
  const st = pbStatHTML(src, 'play' + k);
  return clSec('The idea', `<p class="pb-p">${esc(c.d)}</p>`) + clSec('The reads', pbReadsHTML(t, k))
    + clSec('Against each coverage', `<table class="cl-tbl pb-vt"><thead><tr><th class="l">Coverage</th><th class="pb-vb"><span>worse</span><span>better</span></th><th class="l">Verdict</th><th title="How much of the league plays it">League</th></tr></thead><tbody>${rows}</tbody></table><div class="cl-foot">Click a coverage to draw it under the routes. A quarterback who reads the coverage can check out of a bad one at the line.</div>`)
    + clSec('In his book', `<p class="pb-p"><b>${pbPc(v)}</b> of his ${PB_FAM[c.f][1]}; <b>${pbPc(v * fs)}</b> of all his passes${c.rz && c.rz > 1.2 ? ', and more of them inside the 20' : c.rz && c.rz < 0.8 ? ', fewer of them inside the 20' : ''}.</p>`)
    + (st ? clSec('This season', `<p class="pb-p">${st}</p><div class="cl-foot">Calls · success rate · EPA a play. ${esc(src.lbl)}.</div>`) : '');
}
function pbRunInfo(t, k, v) {
  const R = PB_RUNS[k], src = pbSrc(t), by = (offTend(t).by || {})[R.pk], st = pbStatHTML(src, 'play' + k);
  return clSec('How it works', `<p class="pb-p">${esc(R.note)}</p>`) + clSec('The rules', `<ul class="pb-rules">${R.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`)
    + clSec('In his book', `<p class="pb-p"><b>${pbPc(v)}</b> ${R.of || 'of his runs'}${by && C(by) ? `. Brought in by ${coachNameLink(C(by))}` : ''}.</p>${v < PK_MIN ? '<div class="cl-foot">Under 5%: he has it, but it is not part of what his players have to learn.</div>' : ''}`)
    + (st ? clSec('This season', `<p class="pb-p">${st}</p><div class="cl-foot">Calls · success rate · EPA a play. ${esc(src.lbl)}.</div>`) : '');
}
function pbJobsHTML(cov, t) { const jobs = {}; pbCovLayer(cov, PB_REF(), { jobs }); const who = pbWhoDef(t.id), name = { CW: 'Weak corner', CS: 'Strong corner', N: 'Nickel', W: 'Will linebacker', M: 'Mike linebacker', SS: 'Strong safety', FS: 'Free safety', LE: 'Weak end', DT1: 'Tackle', DT2: 'Tackle', RE: 'Strong end' };
  return `<table class="cl-tbl cl-kv pb-jobs"><tbody>${['CW', 'N', 'W', 'M', 'SS', 'CS', 'FS', 'LE', 'DT1', 'DT2', 'RE'].filter(k => jobs[k]).map(k => { const e = who[k];
    return `<tr><th class="l">${name[k]}</th><td class="l">${esc(jobs[k])}</td><td class="l cl-name">${e && e.p && e.p.a ? playerLink(e.p) : ''}</td></tr>`; }).join('')}</tbody></table>`; }
function pbCovInfo(t, k, v) {
  const pk = defTend(t).pk, src = pbSrc(t), st = pbStatHTML(src, 'cov' + k, 1), all = Object.keys(CONCEPTS).map(c => [c, CONCEPTS[c].vs[k] || 0]).sort((a, b) => b[1] - a[1]);
  const mine = new Set(Object.values(conceptBook(T(state.userTid))).flatMap(o => Object.keys(o)));
  const list = l => l.map(([c]) => `<span class="${mine.has(c) ? 'pb-mine' : ''}" title="${mine.has(c) ? 'In your book' : ''}">${esc(c)}</span>`).join(', ');
  return clSec('What it is', `<p class="pb-p">${esc(COV_NOTE[k] || '')}</p>`) + clSec('Who does what', pbJobsHTML(k, t))
    + clSec('Against the pass game', `<p class="pb-p"><b class="good">Beaten by</b> ${list(all.slice(0, 4))}.</p><p class="pb-p"><b class="bad">Takes away</b> ${list(all.slice(-4).reverse())}.</p><div class="cl-foot">Underlined: concepts in your own book.</div>`)
    + clSec('In his book', `<p class="pb-p"><b>${pbPc(v)}</b> of his coverage calls${pk.by[k] && C(pk.by[k]) ? `. Installed by ${coachNameLink(C(pk.by[k]))}` : ''}.${pk.disg ? ` He disguises the coverage on ${pbPc(pk.disg)} of snaps.` : ''}</p>`)
    + (st ? clSec('This season', `<p class="pb-p">${st}</p><div class="cl-foot">Pass snaps · success rate allowed · EPA a play allowed. ${esc(src.lbl)}.</div>`) : '');
}
function pbPresInfo(t, k, v) {
  const pk = defTend(t).pk, src = pbSrc(t), st = pbStatHTML(src, 'pres' + k, 1);
  return clSec('What it is', `<p class="pb-p">${esc(PRES_NOTE[k] || '')}</p>`) + clSec('Who does what', pbJobsHTML(k, t))
    + clSec('In his book', `<p class="pb-p"><b>${pbPc(v)}</b> of his pass rushes${pk.by[k] && C(pk.by[k]) ? `. Installed by ${coachNameLink(C(pk.by[k]))}` : ''}. Stunts on ${pbPc(pk.stunt || 0)} of rushes.</p>`)
    + (st ? clSec('This season', `<p class="pb-p">${st}</p><div class="cl-foot">Pass snaps · success rate allowed · EPA a play allowed. ${esc(src.lbl)}.</div>`) : '');
}
function pbGameInfo(t, k, v, note, sub) { return clSec('What it is', `<p class="pb-p">${esc(PB_GAMES[k].note)}</p>`) + clSec('In his book', `<p class="pb-p"><b>${pbPc(v)}</b> ${note}. ${esc(sub)}</p>`); }
const PB_KEY = {
  off: [['rt', 'Route'], ['p1', 'First read'], ['bk', 'Block'], ['run', 'Ball carrier'], ['fk', 'Fake, the quarterback'], ['thr', 'The throw']],
  def: [['zd', 'Deep zone'], ['zu', 'Underneath zone'], ['man', 'Man coverage'], ['rush', 'Rush'], ['blz', 'Blitz']],
};
function pbSheet(id, replace) {
  const t = T(pbTid()), all = PB_CH.map(c => c[0]).filter(c => !['over', 'scout', 'who', 'form'].includes(c));
  let items = null, i = -1, ch = null; for (const c of all) { const l = pbItems(t, c).filter(x => !x.act), j = l.findIndex(x => x.id === id); if (j >= 0) { items = l; i = j; ch = c; break; } }
  if (!items) return;
  const it = items[i], def = /^(cov|pres|game):/.test(id); ui.pbOpen = id;
  const vsBar = it.vs ? `<div class="pb-vs"><span>Against</span><button class="${!ui.pbVs ? 'on' : ''}" data-action="pbVs" data-v="">Nothing</button>${Object.keys(SHELLS).map(cv => { const [w, cls] = pbVsWord(CONCEPTS[it.k].vs[cv] || 0);
    return `<button class="${ui.pbVs === cv ? 'on' : ''} ${cls}" data-action="pbVs" data-v="${cv}" title="${esc(SHELLS[cv])}: ${w}">${COV_SHORT[cv]}</button>`; }).join('')}</div>` : '';
  const key = `<div class="pb-key">${PB_KEY[def ? 'def' : 'off'].map(([c, l]) => `<span><i class="k-${c}"></i>${l}</span>`).join('')}${def ? '' : '<span><b class="k-n">1</b>Order of the reads</span>'}</div>`;
  const html = `<div class="pb-sheet club ros" style="${clubVarsCSS(t.id)}">
    <header class="cl-mast rs-mast pb-sh-h" data-abbr="${esc(t.abbr)}"><span class="cl-badge">${esc(t.abbr)}</span>
      <div class="cl-id"><div class="cl-over">${it.call}</div><h1>${esc(it.name)}</h1><div class="cl-men">${esc(t.region + ' ' + t.name)} · ${PB_CH.find(c => c[0] === ch)[1]}${it.fam ? ' · ' + PB_FAM[it.fam][0] : ''}</div></div>
      <div class="cl-rec rs-count"><div class="cl-big">${it.pct}</div><div class="cl-place">${it.pctNote}</div><div class="pb-flip"><button data-action="pbFlip" data-d="-1" title="The page before (←)">‹</button><span>${i + 1} of ${items.length}</span><button data-action="pbFlip" data-d="1" title="The next page (→)">›</button></div></div></header>
    <div class="pb-sh-b"><div class="pb-sh-d">${it.svg({ big: 1, names: 1, vs: it.vs ? ui.pbVs : null })}${vsBar}${key}</div><div class="pb-sh-i">${it.info ? it.info() : ''}</div></div></div>`;
  openModal(html, replace);
}
function pbFlip(d) {
  const t = T(pbTid()), id = ui.pbOpen; if (!id) return;
  for (const c of PB_CH.map(x => x[0])) { const l = pbItems(t, c).filter(x => !x.act), j = l.findIndex(x => x.id === id); if (j >= 0) { pbSheet(l[(j + d + l.length) % l.length].id, true); return; } }
}

// ---------- the chapters ----------
function pbInsBar(tid, side) {
  const t = T(tid), v = installedPct(tid, side), pl = installPlan(tid, side), sz = sysSize(tid, side), big = sz >= (side === 'O' ? 0.95 : 0.5), small = sz <= (side === 'O' ? 0.65 : 0.22);
  return `<div class="pb-ins"><div class="pb-ins-h"><b>${Math.round(v)}%</b> <span>installed · ${esc(teamSchemeLabel(t, side) || '')}</span></div>
    <div class="chm-t" style="height:8px;margin:5px 0"><i style="width:${Math.round(v)}%;background:${gradeColor(v)}"></i>${pl.cap < 99 ? `<b style="left:${Math.round(pl.cap)}%"></b>` : ''}</div>
    <div class="cl-foot">${big ? 'A big system: more answers, more to learn.' : small ? 'A compact system: quick to learn, less in it.' : 'An ordinary-sized system.'} ${pl.cap < 99 ? `Under this coordinator the unit tops out near ${Math.round(pl.cap)}%.` : ''} ${v < 88 ? 'Until it is in, the caller keeps to what the players know: fewer formations, concepts and looks.' : ''}</div></div>`;
}
function pbChem(tid, us) { return `<div class="chm-col">${us.map(u => { const v = u === 'D' ? defChem(tid) : unitChem(tid, u); return `<div class="chm"><span class="chm-l">${u === 'D' ? 'The defense' : CH_NAME[u]}</span><span class="chm-t"><i style="width:${Math.round(v)}%;background:${gradeColor(v)}"></i></span><span class="chm-w">${chemWord(v)}</span></div>`; }).join('')}</div>`; }
function pbOverHTML(t) {
  const tid = t.id, tn = offTend(t), dt = defTend(t), oc = offCaller(t), dc = defCaller(t), dot = greenDot(tid), hc = C(t.hc), pk = dt.pk;
  const caller = (c, label) => c ? `${coachNameLink(c)} <span class="cl-tw">${ROLE_SHORT[c.role] || ''}</span>` : `<span class="muted">${label}</span>`;
  const bars = list => `<div class="pb-bars">${list.map(([l, v, h]) => `<div class="rb" title="${esc(h || '')}"><span class="rb-l">${l}</span><span class="rb-t"><i style="width:${Math.round((v || 0) * 100)}%"></i></span><span class="rb-v">${pbPc(v || 0)}</span></div>`).join('')}</div>`;
  const pkLine = (o, names) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${names[k]} ${pbPc(v)}${pk.by[k] && C(pk.by[k]) ? ` <span class="muted">(${esc(C(pk.by[k]).last)})</span>` : ''}`).join(' · ');
  // the most-called plays, as a share of all his snaps
  const pr = tn.pass || 0.55, top = [];
  for (const c of ['run', 'pass', 'pa', 'scr']) for (const it of pbItems(t, c)) top.push([it, it.id.startsWith('cpt:') ? it.v * pr : PB_RUNS[it.k].of === 'of his passes' ? it.v * pr : it.v * (1 - pr)]);
  top.sort((a, b) => b[1] - a[1]);
  const topList = l => `<ol class="pb-top">${l.map(([it, v]) => `<li data-action="pbPlay" data-k="${esc(it.id)}"><span>${esc(it.name)}</span><em>${esc(it.short || it.call.split(' · ')[1] || '')}</em><b>${pbPc(v)}</b></li>`).join('')}</ol>`;
  const dtop = pk ? [...pbItems(t, 'cov'), ...pbItems(t, 'pres')] : [];
  const offense = clSec('Calls the offense', `<div class="pb-who">${caller(oc, 'Nobody')}<div class="cl-foot">${esc(teamSchemeLabel(t, 'O') || '')}</div></div>`) + clSec('What is installed', pbInsBar(tid, 'O'))
    + clSec('What he calls', `<div class="small pk-plan">${offPkHTML(tn)}</div><div class="cl-foot">What he calls in an ordinary game. A name in brackets is the specialist who brought it. Grey is under 5%: he has it, but it is not part of the book his players learn.</div>`)
    + clSec('Tendencies', bars([['Pass rate', tn.pass, 'Share of dropbacks on neutral downs'], ['Lead back', tn.rb1, 'How much the No. 1 back carries it']])) + clSec('Chemistry', pbChem(tid, ['OL', 'QB']));
  const defense = clSec('Calls the defense', `<div class="pb-who">${caller(dc, 'Nobody')}<div class="cl-foot">${esc(teamSchemeLabel(t, 'D') || '')} · ${esc(dt.front || '')} front${dot ? ` · green dot ${playerLink(dot, true)}` : ''}</div></div>`) + clSec('What is installed', pbInsBar(tid, 'D'))
    + (pk ? clSec('What he calls', `<div class="small pk-plan"><div class="pkl"><b>Coverages</b><br>${pkLine(pk.sh, SHELLS)}</div><div class="pkl"><b>Pressures</b><br>${pkLine(pk.pr, PRESSURES)}</div>${pk.fr && (pk.fr.UNDER || pk.fr.BEAR || pk.fr.BIGN) ? `<div class="pkl"><b>Front, looks and sub packages</b><br>${esc(dt.front)} base${['UNDER', 'BEAR', 'BIGN'].filter(k => pk.fr[k]).map(k => ` · ${PK_NAME[k]}${pk.by[k] && C(pk.by[k]) ? ` <span class="muted">(${esc(C(pk.by[k]).last)})</span>` : ''}`).join('')}</div>` : ''}${pk.disg ? `<div class="pkl">Disguises the coverage on ${pbPc(pk.disg)} of snaps${pk.by.DISG && C(pk.by.DISG) ? ` <span class="muted">(${esc(C(pk.by.DISG).last)})</span>` : ''}</div>` : ''}</div><div class="cl-foot">Names in brackets are packages his specialists installed. The bars below are read off this sheet.</div>`) : '')
    + clSec('Tendencies', bars([['Man coverage', dt.man], ['Two-high shells', dt.high], ['Blitz', dt.blitz], ['Sim pressure', dt.sim], ['Stunts', dt.stunt], ['Base personnel', dt.base, 'Against nickel and dime'], ['Dime', dt.dime, 'How readily the staff goes to six defensive backs: against four wide, and on third and long']]))
    + clSec('Chemistry', pbChem(tid, ['DL', 'LB', 'DB', 'D']));
  const third = clSec('Most called', topList(top.slice(0, 8)), '', 'pb-sec') + (dtop.length ? clSec('On defense', topList(dtop.slice(0, 6).map(it => [it, it.v]))) : '')
    + clSec('Practice', `<p class="pb-p"><b>${Math.round(repAllowance(tid))}</b> reps in a week <span class="muted">(100 is ordinary)</span>. ${hc ? esc(cname(hc)) + ' runs it. ' : ''}The extra, or the shortfall, lands on the second and third team.</p>`)
    + clSec('Kicking', pbChem(tid, ['KB']));
  return `<div class="cl-body pb-over"><div class="cl-col">${offense}</div><div class="cl-col">${defense}</div><div class="cl-col">${third}</div></div>`;
}
function pbScoutHTML(t) {
  const src = pbSrc(t); if (!src) return `<div class="cl-notice"><b>Film</b><span>Self-scout numbers appear once ${esc(t.abbr)} has played a game.</span></div>`;
  const a = src.a, sit = (() => { const rows = Object.keys(SIT_LABEL).map(k => { const r = a['u_sit' + k + 'R'] || 0, p = a['u_sit' + k + 'P'] || 0; return { k, r, p, n: r + p, eR: r ? a['e_sit' + k + 'R'] / r : null, eP: p ? a['e_sit' + k + 'P'] / p : null }; }).filter(x => x.n);
    return table('pbs', [{ k: 'k', l: 'Situation', f: x => SIT_LABEL[x.k] }, { k: 'n', l: 'Plays', f: x => x.n, num: 1 }, { k: 'r', l: 'Run%', f: x => Math.round(100 * x.r / x.n) + '%', num: 1 },
      { k: 'er', l: 'Run EPA', f: x => x.eR === null ? '—' : x.eR.toFixed(2), num: 1 }, { k: 'ep', l: 'Pass EPA', f: x => x.eP === null ? '—' : x.eP.toFixed(2), num: 1 }], rows, { nosort: 1, cls: 'rs-tbl' }); })();
  const st = (id, pre, lab, o) => scoutTable(id, a, pre, lab, o);
  return `<div class="cl-notice"><b>Film</b><span>${esc(src.lbl)}: EPA a play and success rate by call.</span></div>
    <div class="cl-body pb-scout"><div class="cl-col">${clSec('By play', st('pbpl', 'play', PLAY_LABEL, { head: 'Play' }))}${clSec('Situational run and pass', sit)}${clSec('By personnel', st('pbp', 'pers', PERS_LABEL, { head: 'Personnel' }))}${clSec('By play type', st('pbt', 'type', TYPE_LABEL, { head: 'Play type' }))}${clSec('Formations', st('pbf', 'form', FORM_LABEL, { head: 'Formation' }))}${clSec('Tags', st('pbg', 'tag', TAG_LABEL, { head: 'Tag', total: a.plays }))}</div>
      <div class="cl-col">${clSec('Defense by coverage', st('pdc', 'cov', COV_LABEL, { head: 'Coverage', def: 1 }))}${clSec('By pressure', st('pdp', 'pres', PRES_LABEL, { head: 'Rush', def: 1 }))}${clSec('By package', st('pdk', 'pkg', PKG_LABEL, { head: 'Package', def: 1 }))}${clSec('Against the run and the pass', st('pdr', 'vs', { Run: 'vs. Run', Pass: 'vs. Pass' }, { head: 'Facing', def: 1 }))}</div></div>`;
}
function pbWhoHTML(t) {
  const tid = t.id, ot = offTend(t), used = Object.entries(ot.pers || {}).sort((x, y) => y[1] - x[1]).map(x => x[0]).filter(k => PERSONNEL[k]);
  const row = (l, h) => `<div class="pb-pk"><div class="pb-pkl">${l}</div><div class="row small" style="gap:4px">${h}</div></div>`;
  return `<div class="cl-notice"><b>Lineups</b><span>From ${tid === state.userTid ? 'your depth chart (set it on the Depth Chart page)' : 'their depth chart'}.</span></div><div class="cl-body pb-who2"><div class="cl-col">${clSec('Offense', used.map(k => row(PERS_LABEL[k] || k, lineupHTML(lineupFor(tid, k).filter(e => e.slot !== 'QB' && !OL_SLOTS.includes(e.slot))))).join('')
    + row('Offensive line and quarterback', lineupHTML(lineupFor(tid, '11').filter(e => e.slot === 'QB' || OL_SLOTS.includes(e.slot)))))}</div>
    <div class="cl-col">${clSec('Defense', ['BASE', 'NICKEL', 'DIME'].map(k => row(PKG_LABEL[k], lineupHTML(defLineup(tid, k)))).join(''))}</div></div>`;
}
function pbChapterHTML(t, ch) {
  const items = pbItems(t, ch), tn = offTend(t), pl = offPlan(tn), dt = defTend(t);
  if (ch === 'run') return pbH('Runs', items.length, 'Every run he carries, drawn against the front it was drawn up for, as a share of his runs. Grey: under 5%, he has it but his players do not have to learn it. Click one for its page.') + pbGrid(items);
  if (ch === 'pass') return pbH('Pass concepts', items.length, 'The concepts he carries and no others, each drawn from the formation he would throw it from. Red is the first read; the numbers are the order he reads them. A sharp play caller leans on the ones that beat what a defense keeps playing.')
    + ['QUICK', 'DROP', 'DEEP'].map(f => { const l = items.filter(x => x.fam === f); return l.length ? pbH(PB_FAM[f][0], `${pbPc(pbFamShare(pl, f))} of his passes`) + pbGrid(l) : ''; }).join('');
  if (ch === 'pa') return pbH('Off the run game', '', 'Play-action and bootlegs are thrown off a run fake: the linebackers step up and the throws go behind them. The run-pass option is a run with a throw attached.')
    + ['PA', 'BOOT'].map(f => { const l = items.filter(x => x.fam === f); return l.length ? pbH(PB_FAM[f][0], `${pbPc(pbFamShare(pl, f))} of his passes`) + pbGrid(l) : ''; }).join('') + (items.some(x => x.id === 'run:RPO') ? pbH('Run-pass options', '') + pbGrid(items.filter(x => x.id === 'run:RPO')) : '');
  if (ch === 'scr') return pbH('Screens and gadgets', items.length, 'The throws behind the line, and the trick plays. Screens punish a defense that comes; gadgets one that flies to the ball.') + (items.length ? pbGrid(items) : '<p class="rs-note">None in his book.</p>');
  if (ch === 'cov') return pbH('Coverages', items.length, `Every coverage he carries, drawn from his nickel against a two-by-two set. Blue zones are deep, gold zones underneath; red dashes are man coverage.${dt.pk && dt.pk.disg ? ` He disguises the coverage on ${pbPc(dt.pk.disg)} of snaps.` : ''}`) + pbGrid(items);
  if (ch === 'pres') return pbH('Pressures', items.length, `How he rushes the passer, and what plays behind it. Stunts and twists on ${pbPc(dt.stunt || 0)} of rushes (see Fronts).`) + pbGrid(items);
  if (ch === 'form') {
    const pers = pbPers(t), snap = ui.pbForm || 'SG', cur = FORMS[pers] && FORMS[pers][ui.pbFm] ? ui.pbFm : FORM_HOME[pers], ft = formTraits(t);
    return `<section class="pb-field"><div class="pb-fh"><b>On the field</b><span>${esc(PERS_LABEL[pers] || pers)} · ${esc(cur)} · ${FORM_NAMES.find(f => f[0] === snap)[1]}</span><span class="spacer"></span><span class="cl-tw">Orange: lined up away from a spot he is comfortable at. Click a man for his file.</span></div>${pbOffFieldSVG(t.id, pers, cur, snap)}</section>`
      + pbH('Formations', items.length, `How he lines up ${esc(PERS_LABEL[pers] || pers)}, and how often. Pick another grouping or snap above. The strong side is the ${ft.strR >= 0.55 ? 'right more often than the left' : ft.strR <= 0.47 ? 'left more often than the right' : 'right and the left about equally'}.${ft.move ? ' He moves his best receiver around the formation to find a matchup.' : ''}`) + pbGrid(items);
  }
  if (ch === 'front') {
    const pkg = ui.pbPkg || 'NICKEL', lk = looksFor(t.id, pkg), look = lk.list.some(x => x[0] === ui.pbLook) ? ui.pbLook : lk.list.length ? lk.list[0][0] : null, dc = defCaller(t);
    const field = `<section class="pb-field"><div class="pb-fh"><b>On the field</b><span>${PKG_LABEL[pkg]} · ${look ? esc(look) + ' look' : esc(dt.front || '') + ' front'}</span><span class="spacer"></span><span class="cl-tw">The small number by a lineman is his technique. Click a man for his file.</span></div>${pbDefFieldSVG(t.id, pkg, look ? { t: LOOKS[lk.fam][look].t } : null)}</section>`;
    const base = items.filter(x => x.grp === 'BASE'), sub = items.filter(x => x.grp === 'NICKEL'), games = items.filter(x => x.grp === 'games');
    return field + pbH(`${esc(dt.front || '')} base · ${dc ? esc(cname(dc)) + "'s looks" : 'the looks'}`, base.length, 'Where each lineman puts his hand down. The number is his technique: 0 on the center, 1 a shade of him; 2i, 2, 3 inside, on and outside the guard; 4i, 4, 5 the same on the tackle; 7, 6, 9 on the tight end\'s spot. Letters under the line are the gaps. Run looks come out when a run is expected, rush looks on passing downs.') + pbGrid(base)
      + pbH('Nickel and dime', sub.length) + pbGrid(sub) + (games.length ? pbH('Line games', games.length, 'What the line does after the snap. Click one for its page.') + pbGrid(games) : '');
  }
  return '';
}
function pbCount(t, ch) { return ['over', 'scout', 'who'].includes(ch) ? null : ch === 'form' ? formShares(t, pbPers(t)).length : pbItems(t, ch).length; }
function playbookHTML() {
  const u = state.userTid, tid = pbTid(), t = T(tid), mine = tid === u, ch = PB_CH.some(c => c[0] === ui.pbCh) ? ui.pbCh : 'over';
  ensureChem();
  const nx = userMatchup(), opp = nx ? (nx.h === u ? nx.a : nx.h) : null, oc = offCaller(t), dc = defCaller(t), tn = offTend(t), dt = defTend(t), pl = offPlan(tn);
  const opts = state.teams.map(x => `<option value="${x.id}" ${x.id === tid ? 'selected' : ''}>${esc(x.region + ' ' + x.name)}</option>`).join('');
  const when = `${state.season} · ${state.phase === 'REG' ? 'Week ' + Math.min(state.week, SEASON_WEEKS) : esc(PHASE_LABEL[state.phase] || state.phase)}`, rival = !mine && T(u).conf === t.conf && T(u).div === t.div;
  const counts = {}; let n = 0; for (const [k] of PB_CH) { const c = pbCount(t, k); if (c !== null) { counts[k] = c; if (k !== 'form' && k !== 'front') n += c; } }
  const fig = (k, v, s, tt) => `<div${tt ? ` title="${esc(tt)}"` : ''}><div class="k">${k}</div><div class="v">${v}${s ? `<small>${s}</small>` : ''}</div></div>`;
  const zone = (pl.run.IZ || 0) + (pl.run.WZ || 0), gap = (pl.run.POWER || 0) + (pl.run.COUNTER || 0) + (pl.run.DUO || 0);
  const figs = [fig('Offense in', Math.round(installedPct(tid, 'O')) + '%', '', 'How much of the offense the first team knows'), fig('Pass rate', pbPc(tn.pass || 0), '', 'On neutral downs'), fig('Play-action', pbPc(pl.pass.PA || 0), '', 'Of his passes'),
    fig('Run game', zone >= gap ? 'Zone' : 'Gap', pbPc(Math.max(zone, gap)), 'Zone runs against gap runs, of his runs'), fig('Defense in', Math.round(installedPct(tid, 'D')) + '%', '', 'How much of the defense the first team knows'), fig('Man', pbPc(dt.man || 0), '', 'Man coverage, of his coverage calls'),
    fig('Two-high', pbPc(dt.high || 0), '', 'Two safeties deep, of his coverage calls'), fig('Blitz', pbPc(dt.blitz || 0)), fig('Practice', Math.round(repAllowance(tid)), '', 'Reps in a week; 100 is ordinary')];
  const strip = PB_CH.map(([k, l]) => `${PB_SEP[k] ? '<i class="pb-sep"></i>' : ''}<button class="${k === ch ? 'on' : ''}" data-action="pbTab" data-v="${k}">${l}${counts[k] !== undefined ? `<i>${counts[k]}</i>` : ''}</button>`).join('');
  const sel = (l, chg, list, cur) => `<label class="rs-vl"><span>${l}</span><select data-change="${chg}">${list.map(([v, x]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`;
  let ctl = '';
  if (ch === 'form') { const used = Object.entries(tn.pers || {}).sort((x, y) => y[1] - x[1]).map(x => x[0]).filter(k => PERSONNEL[k]), all = [...used, ...Object.keys(PERSONNEL).filter(k => !used.includes(k))];
    ctl = sel('Grouping', 'pbPersSel', all.map(k => [k, `${k === 'JUMBO' ? 'Jumbo' : k + ' personnel'}${used.includes(k) ? ` · ${pbPc((tn.pers[k] || 0) / Object.values(tn.pers).reduce((a, b) => a + b, 0))}` : ' · not his'}`]), pbPers(t)) + sel('Snap', 'pbFormSel', FORM_NAMES, ui.pbForm || 'SG'); }
  if (ch === 'front') ctl = sel('Package', 'pbPkgSel', ['BASE', 'NICKEL', 'DIME', 'GL'].map(k => [k, PKG_LABEL[k]]), ui.pbPkg || 'NICKEL');
  const body = ch === 'over' ? pbOverHTML(t) : ch === 'scout' ? pbScoutHTML(t) : ch === 'who' ? pbWhoHTML(t) : pbChapterHTML(t, ch);
  const links = [opp !== null && opp !== tid ? `<button class="link" data-action="pbTeamSet" data-tid="${opp}">Scout ${esc(T(opp).abbr)}, next up ›</button>` : '', !mine ? `<button class="link" data-action="pbTeamSet" data-tid="${u}">Your book ›</button>` : ''].filter(Boolean).join('');
  return `<div class="club ros pb" style="${clubVarsCSS(tid)}">
    <header class="cl-mast rs-mast" data-abbr="${esc(t.abbr)}">
      <button class="cl-badge" data-action="team" data-tid="${tid}" title="${mine ? 'Home' : 'The club page'}">${esc(t.abbr)}</button>
      <div class="cl-id"><div class="cl-over">${esc(t.conf + ' ' + t.div)} · Playbook · ${when}${mine ? ' · your club' : opp === tid ? ' · next opponent' : rival ? ' · division rival' : ''}</div>
        <div class="rs-name"><h1>${esc(t.region)} <b>${esc(t.name)}</b></h1><span class="rs-caret">▾</span><select data-change="pbTeam" title="Open another club's playbook" aria-label="Club">${opts}</select></div>
        <div class="cl-men"><span class="cl-ml">Offense</span> ${oc ? coachNameLink(oc) : '<span>Vacant</span>'} <span class="pb-sys">${esc(teamSchemeLabel(t, 'O') || '')}</span><i>·</i><span class="cl-ml">Defense</span> ${dc ? coachNameLink(dc) : '<span>Vacant</span>'} <span class="pb-sys">${esc(teamSchemeLabel(t, 'D') || '')}</span></div></div>
      <div class="cl-rec rs-count"><div class="cl-big">${n}</div><div class="cl-place">Plays in the book</div>${links ? `<div class="cl-place pb-links">${links}</div>` : ''}</div>
    </header>
    <div class="cl-ledger" style="--n:9">${figs.join('')}</div>
    <div class="rs-bar"><nav class="rs-pos pb-strip">${strip}</nav><span class="spacer"></span>${ctl}</div>
    <div class="rs-scroll">${body}<div class="rs-foot"><span>View only: the play callers run their own systems. This is what they carry and how often they call it.</span>${mine ? '' : `<span>${esc(t.abbr)}'s book as your staff reads it.</span>`}</div></div></div>`;
}

// ---------- actions ----------
if (typeof actions !== 'undefined') Object.assign(actions, {
  pbTab: d => { ui.pbCh = d.v; $('#app').dataset.view = ''; render(); },
  pbTeamSet: d => { ui.pbTid = +d.tid === state.userTid ? null : +d.tid; $('#app').dataset.view = ''; modalStack = []; closeModal(); render(); },
  pbPlay: d => { ui.pbVs = null; pbSheet(d.k); },
  pbFlip: d => pbFlip(+d.d),
  pbVs: d => { ui.pbVs = d.v || null; if (ui.pbOpen) pbSheet(ui.pbOpen, true); },
  pbFm: d => { ui.pbFm = d.k; render(); pbShowField(); },
  pbLook: d => { ui.pbLook = d.k; if (d.pkg === 'BASE') ui.pbPkg = 'BASE'; else if (ui.pbPkg !== 'NICKEL' && ui.pbPkg !== 'DIME') ui.pbPkg = 'NICKEL'; render(); pbShowField(); },
  clubBook: d => { const tid = +d.tid; ui.pbTid = tid === state.userTid ? null : tid; view = 'playbook'; modalStack = []; closeModal(); $('#app').dataset.view = ''; render(); window.scrollTo(0, 0); },
});
if (typeof changes !== 'undefined') Object.assign(changes, {
  pbTeam: v => { ui.pbTid = +v === state.userTid ? null : +v; $('#app').dataset.view = ''; },
  pbPersSel: v => { ui.pbPers = v; ui.pbPkg = { '10': 'DIME', '11': 'NICKEL', '12': 'BASE', '13': 'BASE', '21': 'BASE', '22': 'BASE', JUMBO: 'GL' }[v] || ui.pbPkg; ui.pbFm = null; },
  pbFormSel: v => { ui.pbForm = v; },
  pbPkgSel: v => { ui.pbPkg = v; },
});
function pbShowField() { const f = document.querySelector('.pb-field'); if (f && f.getBoundingClientRect().top < 0) f.scrollIntoView({ block: 'start' }); }
if (typeof document !== 'undefined') document.addEventListener('keydown', e => {
  if (!state || (e.target.closest && e.target.closest('input, select, textarea'))) return;
  const sheet = document.querySelector('#modal:not(.hidden) .pb-sheet');
  if (sheet && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !modalStack.length) { e.preventDefault(); pbFlip(e.key === 'ArrowRight' ? 1 : -1); return; }
  if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('pb-card')) { e.preventDefault(); e.target.click(); }
});
