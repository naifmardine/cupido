'use strict';
// ---------------------------------------------------------------------------
// stats.js — módulo estatístico vanilla (zero dependência) pro Cupido.
// Correlação (Pearson/point-biserial), regressão linear (OLS) e logística
// (IRLS + ridge), intervalo de Wilson, Cramér's V. p-values via beta
// incompleta (t) e normal (z). Pensado pra N pequeno: robusto, sem quebrar.
// Ver framing: vault/projects/cupido/decisions/2026-07-04-cupido-regressao-objecao-ux-framing.md
// ---------------------------------------------------------------------------

const sum = (a) => a.reduce((s, v) => s + v, 0);
const mean = (a) => (a.length ? sum(a) / a.length : 0);
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// ---- álgebra linear (matrizes pequenas) ----
function transpose(M) {
  const r = M.length, c = M[0].length, T = Array.from({ length: c }, () => new Array(r));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j][i] = M[i][j];
  return T;
}
function matmul(A, B) {
  const n = A.length, m = B[0].length, k = B.length;
  const C = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) for (let l = 0; l < k; l++) { const a = A[i][l]; for (let j = 0; j < m; j++) C[i][j] += a * B[l][j]; }
  return C;
}
function matvec(A, v) { return A.map((row) => dot(row, v)); }
// inversa via Gauss-Jordan com pivotamento parcial; null se singular
function invert(M) {
  const n = M.length;
  const A = M.map((row, i) => row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    for (let j = 0; j < 2 * n; j++) A[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[col][j];
    }
  }
  return A.map((row) => row.slice(n));
}

// ---- distribuições / p-values ----
function gammln(xx) {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = xx, y = xx, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) { y++; ser += cof[j] / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-9, FPMIN = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
// beta incompleta regularizada I_x(a,b)
function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammln(a + b) - gammln(a) - gammln(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}
// p-value bicaudal de um t com df graus de liberdade
function tTwoTail(t, df) {
  if (!isFinite(t) || df <= 0) return 1;
  const at = Math.abs(t);
  return betai(df / 2, 0.5, df / (df + at * at));
}
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function normalCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
// p-value bicaudal de um z
function zTwoTail(z) { return 2 * (1 - normalCdf(Math.abs(z))); }
// p-value de um qui-quadrado (df) — via gamma incompleta pela série/continuada
function chi2Tail(x2, df) {
  if (x2 <= 0 || df <= 0) return 1;
  return 1 - gammp(df / 2, x2 / 2);
}
function gammp(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) { // série
    let ap = a, sum1 = 1 / a, del = sum1;
    for (let n = 0; n < 200; n++) { ap++; del *= x / ap; sum1 += del; if (Math.abs(del) < Math.abs(sum1) * 1e-10) break; }
    return sum1 * Math.exp(-x + a * Math.log(x) - gammln(a));
  }
  // fração continuada (gammq) → 1 - gammq
  const FPMIN = 1e-30;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  const gammq = Math.exp(-x + a * Math.log(x) - gammln(a)) * h;
  return 1 - gammq;
}

// ---- correlação ----
function pearson(x, y) {
  const n = x.length;
  if (n < 3) return { r: 0, p: 1, n, df: Math.max(0, n - 2) };
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return { r: 0, p: 1, n, df: n - 2 };
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  const df = n - 2;
  const t = r * Math.sqrt(df / Math.max(1e-12, 1 - r * r));
  return { r, p: tTwoTail(t, df), n, df, t };
}
// point-biserial = Pearson com y binário (0/1); mesma matemática
const pointBiserial = (x, yBin) => pearson(x, yBin);

// ---- regressão linear OLS (múltipla) ----
// rows: array de vetores de features (SEM intercepto); y: vetor resposta
function linreg(rows, y) {
  const n = rows.length;
  if (n < 2) return null;
  const X = rows.map((r) => [1, ...r]);
  const k = X[0].length;
  if (n <= k) return null; // graus de liberdade insuficientes
  const Xt = transpose(X);
  const inv = invert(matmul(Xt, X));
  if (!inv) return null;
  const b = matvec(inv, matvec(Xt, y));
  const yhat = X.map((row) => dot(row, b));
  const resid = y.map((yi, i) => yi - yhat[i]);
  const sse = sum(resid.map((e) => e * e));
  const ybar = mean(y);
  const sst = sum(y.map((yi) => (yi - ybar) ** 2));
  const df = n - k;
  const sigma2 = sse / df;
  const r2 = sst > 0 ? 1 - sse / sst : 0;
  const adjR2 = sst > 0 && n - k > 0 ? 1 - (1 - r2) * (n - 1) / (n - k) : r2;
  const se = inv.map((row, i) => Math.sqrt(Math.max(0, sigma2 * inv[i][i])));
  const t = b.map((bi, i) => (se[i] > 0 ? bi / se[i] : 0));
  const p = t.map((ti) => tTwoTail(ti, df));
  return { coef: b, se, t, p, r2, adjR2, n, df, k };
}

// ---- regressão logística (IRLS + ridge) ----
// rows: features SEM intercepto; y: 0/1. Ridge estabiliza N pequeno/separação.
function logreg(rows, y, opts) {
  const n = rows.length;
  if (n < 2) return null;
  const X = rows.map((r) => [1, ...r]);
  const k = X[0].length;
  const lambda = opts && opts.ridge != null ? opts.ridge : 1e-3;
  const buildXtWX = (W) => {
    const M = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { const xa = X[i][a] * W[i]; for (let c = 0; c < k; c++) M[a][c] += xa * X[i][c]; }
    for (let a = 0; a < k; a++) M[a][a] += lambda;
    return M;
  };
  let b = new Array(k).fill(0);
  let converged = false;
  for (let iter = 0; iter < 60; iter++) {
    const p = X.map((row) => sigmoid(dot(row, b)));
    const W = p.map((pi) => Math.max(pi * (1 - pi), 1e-6));
    const g = new Array(k).fill(0);
    for (let a = 0; a < k; a++) { let s = 0; for (let i = 0; i < n; i++) s += X[i][a] * (y[i] - p[i]); g[a] = s - lambda * b[a]; }
    const inv = invert(buildXtWX(W));
    if (!inv) break;
    const step = matvec(inv, g);
    let maxstep = 0;
    for (let a = 0; a < k; a++) { b[a] += step[a]; maxstep = Math.max(maxstep, Math.abs(step[a])); }
    if (maxstep < 1e-7) { converged = true; break; }
  }
  const p = X.map((row) => sigmoid(dot(row, b)));
  const W = p.map((pi) => Math.max(pi * (1 - pi), 1e-6));
  const inv = invert(buildXtWX(W));
  const se = inv ? inv.map((row, i) => Math.sqrt(Math.max(0, inv[i][i]))) : b.map(() => NaN);
  const z = b.map((bi, i) => (se[i] > 0 ? bi / se[i] : 0));
  const pval = z.map((zi) => zTwoTail(zi));
  const oddsRatio = b.map((bi) => Math.exp(bi));
  const ll = sum(y.map((yi, i) => yi * Math.log(Math.max(p[i], 1e-12)) + (1 - yi) * Math.log(Math.max(1 - p[i], 1e-12))));
  const ybar = mean(y);
  const ll0 = sum(y.map((yi) => yi * Math.log(Math.max(ybar, 1e-12)) + (1 - yi) * Math.log(Math.max(1 - ybar, 1e-12))));
  const mcfaddenR2 = ll0 !== 0 ? Math.max(0, Math.min(1, 1 - ll / ll0)) : 0;
  return { coef: b, se, z, p: pval, oddsRatio, mcfaddenR2, ll, ll0, n, k, converged };
}

// probabilidade prevista pra um vetor de features (com coef incluindo intercepto)
function logregPredict(coef, features) { return sigmoid(coef[0] + dot(coef.slice(1), features)); }

// ---- intervalo de Wilson (proporção) ----
function wilson(k, n, z) {
  z = z || 1.959964; // 95%
  if (n === 0) return { p: 0, lo: 0, hi: 0, n: 0 };
  const phat = k / n, z2 = z * z, denom = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt(phat * (1 - phat) / n + z2 / (4 * n * n));
  return { p: phat, lo: Math.max(0, center - margin), hi: Math.min(1, center + margin), n };
}

// ---- Cramér's V (associação categórica) ----
function cramersV(table) {
  const rows = table.length; if (!rows) return { v: 0, chi2: 0, n: 0, p: 1 };
  const cols = table[0].length;
  const rowSum = table.map((r) => sum(r));
  const colSum = table[0].map((_, j) => sum(table.map((r) => r[j])));
  const N = sum(rowSum);
  if (N === 0) return { v: 0, chi2: 0, n: 0, p: 1 };
  let chi2 = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const e = rowSum[i] * colSum[j] / N;
    if (e > 0) chi2 += (table[i][j] - e) ** 2 / e;
  }
  const kk = Math.min(rows - 1, cols - 1);
  const v = kk > 0 ? Math.sqrt(chi2 / (N * kk)) : 0;
  const df = (rows - 1) * (cols - 1);
  return { v, chi2, n: N, df, p: chi2Tail(chi2, df) };
}

module.exports = {
  mean, sum, pearson, pointBiserial, linreg, logreg, logregPredict,
  wilson, cramersV, normalCdf, tTwoTail, zTwoTail, chi2Tail, betai, invert,
};

// ---- self-test (node stats.js) ----
if (require.main === module) {
  const approx = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-3);
  let fails = 0;
  const check = (name, cond, got) => { if (!cond) { fails++; console.log('FAIL', name, '=>', got); } else console.log('ok  ', name); };

  // Pearson: correlação perfeita
  let pr = pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
  check('pearson r=1', approx(pr.r, 1), pr.r);
  // Pearson conhecido: x=[1,2,3,4,5], y=[2,1,4,3,6] -> r=10/sqrt(148)≈0.822
  pr = pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 6]);
  check('pearson r≈0.822', approx(pr.r, 0.822, 0.005), pr.r);
  // betai/tTwoTail sanity: t=2.776, df=4 -> p≈0.05 (valor crítico t 0.025,4)
  check('tTwoTail t=2.776 df=4 ≈0.05', approx(tTwoTail(2.776, 4), 0.05, 0.005), tTwoTail(2.776, 4));
  // normalCdf
  check('normalCdf(1.96)≈0.975', approx(normalCdf(1.959964), 0.975, 0.002), normalCdf(1.959964));
  // OLS: y = 2 + 3x exato
  let lr = linreg([[1], [2], [3], [4]].map((r) => r), [5, 8, 11, 14]);
  check('linreg intercept≈2', approx(lr.coef[0], 2, 1e-6), lr.coef[0]);
  check('linreg slope≈3', approx(lr.coef[1], 3, 1e-6), lr.coef[1]);
  check('linreg R²≈1', approx(lr.r2, 1, 1e-6), lr.r2);
  // Wilson: 8/10
  const w = wilson(8, 10);
  check('wilson 8/10 lo≈0.49', approx(w.lo, 0.49, 0.02), w.lo);
  check('wilson 8/10 hi≈0.94', approx(w.hi, 0.94, 0.02), w.hi);
  // Logística: separável-ish x -> y, coeficiente positivo e converge
  const lg = logreg([[-2], [-1], [0], [1], [2], [3]].map((r) => r), [0, 0, 0, 1, 1, 1]);
  check('logreg slope>0', lg.coef[1] > 0, lg.coef[1]);
  check('logreg converged', lg.converged === true, lg.converged);
  check('logreg mcfadden>0.3', lg.mcfaddenR2 > 0.3, lg.mcfaddenR2);
  // Cramér's V: associação perfeita 2x2
  const cv = cramersV([[10, 0], [0, 10]]);
  check("cramersV perfeito≈1", approx(cv.v, 1, 1e-6), cv.v);
  console.log(fails === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${fails} FALHA(S)`);
  process.exit(fails === 0 ? 0 : 1);
}
