'use strict';
// ---------- random / math helpers ----------
function rand() { return Math.random(); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function gauss(mu = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function weightedPick(items, weights) {
  let t = 0;
  for (const w of weights) t += w;
  let r = Math.random() * t;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function expRand(mean) { return -Math.log(1 - Math.random()) * mean; }
function logistic(x) { return 1 / (1 + Math.exp(-x)); }
function logit(p) { return Math.log(p / (1 - p)); }
function adjP(p, shift) { return logistic(logit(p) + shift); }
function sum(a) { let s = 0; for (const x of a) s += x; return s; }
function avg(a) { return a.length ? sum(a) / a.length : 0; }
function round1(x) { return Math.round(x * 10) / 10; }
function round2(x) { return Math.round(x * 100) / 100; }

// ---------- formatting ----------
function fmtMoney(m) { return '$' + (m >= 10 ? m.toFixed(1) : m.toFixed(2)) + 'M'; }
function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }
function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function passerRating(c, a, y, td, i) {
  if (!a) return 0;
  const f = x => clamp(x, 0, 2.375);
  const A = f((c / a - 0.3) * 5), B = f((y / a - 3) * 0.25), C = f((td / a) * 20), D = f(2.375 - (i / a) * 25);
  return ((A + B + C + D) / 6) * 100;
}
