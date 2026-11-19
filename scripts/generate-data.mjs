// Generates the bundled Sample-mode data in data/sample/ from the seeded formulas in gen-core.mjs.
//   node scripts/generate-data.mjs
// Raw-data aggregates (portfolio, vintages, PSI) are exact and match sql/setup.sql. Model outputs
// (runs, metrics, scores, reason codes) are provisional logistic fits until scripts/capture-live.mjs
// overwrites data/sample/models.json and queue.json with the results of the live Snowflake ML run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  AS_OF, N_LOANS, PSI_EDGES, FEATURES, loan, lastMonth, month, features, defaultedWithin12, binOf,
  monthLabel, quarterLabel, round, sigmoid,
} from './gen-core.mjs';

const t0 = Date.now();
const OUT = 'data/sample';
mkdirSync(OUT, { recursive: true });

const CHAMP_FEATURES = FEATURES.filter((f) => f !== 'MONTHS_ON_BUREAU');
const CHALL_FEATURES = FEATURES;
const MON_START = 33; // monitoring window 2025-10 .. 2026-09

const train = []; // observation rows at om + 3 for vintages with a full 12-month outcome window
const score41 = new Map(), score44 = new Map();
const port = { loans: 0, balance: 0, byProduct: {}, dpd: { Current: [0, 0], '1-29': [0, 0], '30-59': [0, 0], '60-89': [0, 0], '90+': [0, 0] } };
const vint = {}; // quarter -> { n, defaultsAtMob: number[] }
const mon = {}; // t -> feature -> bins[]
const bookTrend = {}; // t -> { n, util, fico, bal, dpd30 }

const dpdBucket = (d) => (d === 0 ? 'Current' : d < 30 ? '1-29' : d < 60 ? '30-59' : d < 90 ? '60-89' : '90+');

for (let lid = 1; lid <= N_LOANS; lid++) {
  const L = loan(lid);
  const last = lastMonth(L);
  const months = [];
  for (let m = L.om; m <= last; m++) months.push(month(L, m));

  const q = quarterLabel(L.om);
  vint[q] ??= { n: 0, mobs: new Array(25).fill(0), maxMob: AS_OF - L.om };
  vint[q].n++;
  vint[q].maxMob = Math.min(vint[q].maxMob, AS_OF - L.om);
  if (L.dm != null && L.dm <= AS_OF && L.dm - L.om <= 24) vint[q].mobs[L.dm - L.om]++;

  for (const off of [3, 9]) { // SQL: ML.TRAINING_SPINE
    const obs = L.om + off;
    if (obs + 12 <= AS_OF && last >= obs && (L.dm == null || L.dm > obs)) {
      train.push({ lid, om: L.om, obs: off, fileType: L.borrower.fileType, product: L.product, x: features(L, months, obs), y: defaultedWithin12(L, obs) ? 1 : 0 });
    }
  }

  for (let t = MON_START; t <= AS_OF; t++) {
    if (t < L.om + 3 || t > last || (L.dm != null && t >= L.dm)) continue; // performing book only
    const f = features(L, months, t);
    mon[t] ??= Object.fromEntries(Object.keys(PSI_EDGES).map((k) => [k, new Array(PSI_EDGES[k].length + 1).fill(0)]));
    for (const k of Object.keys(PSI_EDGES)) mon[t][k][binOf(PSI_EDGES[k], f[k])]++;
    const mt = months[t - L.om];
    bookTrend[t] ??= { n: 0, util: 0, fico: 0, bal: 0, dpd30: 0 };
    Object.assign(bookTrend[t], { n: bookTrend[t].n + 1, util: bookTrend[t].util + mt.util, fico: bookTrend[t].fico + mt.fico, bal: bookTrend[t].bal + mt.balance, dpd30: bookTrend[t].dpd30 + (mt.dpd >= 30 ? 1 : 0) });
    if (t === 41) score41.set(lid, f);
    if (t === AS_OF) score44.set(lid, { f, L });
  }

  if (last === AS_OF && (L.dm == null || L.dm + 1 > AS_OF)) {
    const mt = months[AS_OF - L.om];
    port.loans++; port.balance += mt.balance;
    port.byProduct[L.product] ??= [0, 0]; port.byProduct[L.product][0]++; port.byProduct[L.product][1] += mt.balance;
    const b = port.dpd[dpdBucket(mt.dpd)]; b[0]++; b[1] += mt.balance;
  }
}
console.log(`pass 1: ${train.length} training rows, ${score44.size} scored at ${monthLabel(AS_OF)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// ---------------------------------------------------------------- provisional models (logistic, IRLS)
function fit(rows, cols) {
  const n = rows.length, p = cols.length + 1;
  const mu = cols.map((c) => rows.reduce((s, r) => s + r.x[c], 0) / n);
  const sd = cols.map((c, j) => Math.sqrt(rows.reduce((s, r) => s + (r.x[c] - mu[j]) ** 2, 0) / n) || 1);
  const X = rows.map((r) => [1, ...cols.map((c, j) => (r.x[c] - mu[j]) / sd[j])]);
  let w = new Array(p).fill(0);
  for (let it = 0; it < 10; it++) {
    const H = Array.from({ length: p }, () => new Array(p).fill(0)), g = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      const pr = sigmoid(X[i].reduce((s, v, j) => s + v * w[j], 0)), wt = pr * (1 - pr), e = rows[i].y - pr;
      for (let a = 0; a < p; a++) { g[a] += X[i][a] * e; for (let b = a; b < p; b++) H[a][b] += wt * X[i][a] * X[i][b]; }
    }
    for (let a = 0; a < p; a++) { H[a][a] += 1e-6; for (let b = 0; b < a; b++) H[a][b] = H[b][a]; }
    const step = solve(H, g);
    w = w.map((v, j) => v + step[j]);
  }
  const predict = (x) => sigmoid(w[0] + cols.reduce((s, c, j) => s + w[j + 1] * (x[c] - mu[j]) / sd[j], 0));
  const contrib = (x) => cols.map((c, j) => ({ feature: c, value: x[c], contribution: w[j + 1] * (x[c] - mu[j]) / sd[j] }));
  const importance = cols.map((c, j) => ({ feature: c, importance: Math.abs(w[j + 1]) })).sort((a, b) => b.importance - a.importance);
  const tot = importance.reduce((s, r) => s + r.importance, 0);
  importance.forEach((r) => { r.importance = round(r.importance / tot, 4); });
  return { predict, contrib, importance };
}
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function metrics(ys, ps) {
  const idx = ps.map((p, i) => i).sort((a, b) => ps[b] - ps[a]);
  const P1 = ys.reduce((s, y) => s + y, 0), N0 = ys.length - P1;
  let tp = 0, fp = 0, auc = 0, ks = 0;
  for (const i of idx) { if (ys[i]) tp++; else { fp++; auc += tp; } ks = Math.max(ks, Math.abs(tp / P1 - fp / N0)); }
  auc /= P1 * N0;
  return { auc: round(auc, 4), ks: round(ks, 4), gini: round(2 * auc - 1, 4), n: ys.length, defaultRate: round(P1 / ys.length, 4) };
}
function calibration(ys, ps) {
  const idx = ps.map((p, i) => i).sort((a, b) => ps[a] - ps[b]);
  return Array.from({ length: 10 }, (_, d) => {
    const s = idx.slice(Math.floor((d * idx.length) / 10), Math.floor(((d + 1) * idx.length) / 10));
    return { decile: d + 1, predicted: round(s.reduce((a, i) => a + ps[i], 0) / s.length, 4), observed: round(s.reduce((a, i) => a + ys[i], 0) / s.length, 4) };
  });
}

const champTrain = train.filter((r) => r.om <= 20);
const challTrain = train.filter((r) => r.om <= 26);
const oot = train.filter((r) => r.om >= 27); // 2025-04 .. 2025-06 vintages, inside the drift window
const champ = fit(champTrain, CHAMP_FEATURES);
const chall = fit(challTrain, CHALL_FEATURES);

function evaluate(model, rows) {
  const ys = rows.map((r) => r.y), ps = rows.map((r) => model.predict(r.x));
  const fairness = ['THICK', 'THIN', 'NEW_TO_CREDIT'].map((seg) => {
    const ii = rows.map((r, i) => (r.fileType === seg ? i : -1)).filter((i) => i >= 0);
    const m = metrics(ii.map((i) => ys[i]), ii.map((i) => ps[i]));
    return { segment: seg, n: ii.length, observed: m.defaultRate, predicted: round(ii.reduce((s, i) => s + ps[i], 0) / ii.length, 4), auc: m.auc };
  });
  return { ...metrics(ys, ps), calibration: calibration(ys, ps), fairness };
}
const champTrainEval = evaluate(champ, champTrain);
const champOot = evaluate(champ, oot), challOot = evaluate(chall, oot);
console.log(`champion OOT AUC ${champOot.auc}, challenger OOT AUC ${challOot.auc}`);

// ---------------------------------------------------------------- monitoring (PSI vs champion training sample)
const baseline = Object.fromEntries(Object.keys(PSI_EDGES).map((k) => [k, new Array(PSI_EDGES[k].length + 1).fill(0)]));
for (const r of champTrain) for (const k of Object.keys(PSI_EDGES)) baseline[k][binOf(PSI_EDGES[k], r.x[k])]++;
const psi = (base, cur) => {
  const bn = base.reduce((a, b) => a + b, 0), cn = cur.reduce((a, b) => a + b, 0);
  return base.reduce((s, b, i) => { const e = Math.max(b / bn, 1e-4), a = Math.max(cur[i] / cn, 1e-4); return s + (a - e) * Math.log(a / e); }, 0);
};
const psiSeries = [];
for (let t = MON_START; t <= AS_OF; t++) {
  const row = { month: monthLabel(t) };
  for (const k of Object.keys(PSI_EDGES)) row[k] = round(psi(baseline[k], mon[t][k]), 4);
  psiSeries.push(row);
}
const distributions = Object.fromEntries(Object.keys(PSI_EDGES).map((k) => {
  const bn = baseline[k].reduce((a, b) => a + b, 0), cn = mon[AS_OF][k].reduce((a, b) => a + b, 0);
  const labels = ['<' + PSI_EDGES[k][0], ...PSI_EDGES[k].map((e, i) => (i + 1 < PSI_EDGES[k].length ? `${e}–${PSI_EDGES[k][i + 1]}` : `≥${e}`))];
  return [k, labels.map((label, i) => ({ bin: label, baseline: round(baseline[k][i] / bn, 4), current: round(mon[AS_OF][k][i] / cn, 4) }))];
}));

// ---------------------------------------------------------------- early-warning queue
const LGD = { PERSONAL: 0.85, AUTO: 0.45 };
let el = 0;
const scored = [];
for (const [lid, { f, L }] of score44) {
  const pdC = champ.predict(f), pdN = chall.predict(f);
  const prev = score41.get(lid);
  if (!prev || f.MAX_DPD_6M >= 30) continue; // early warning covers performing accounts; 30+ DPD is collections
  el += pdC * LGD[L.product] * round(L.amount * (1 - (AS_OF - L.om) / L.term), 2); // SQL: APP.EXPECTED_LOSS
  scored.push({ lid, L, f, prev, champ: [champ.predict(prev), pdC], chall: [chall.predict(prev), pdN] });
}
const reasons = (model, x) => model.contrib(x).filter((c) => c.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 3)
  .map((c) => ({ feature: c.feature, value: c.value, contribution: round(c.contribution, 3) }));
// Union of each model's top 200 by score change (SQL: ML.SCORES rows with REASONS for either version).
const top1 = [...scored].sort((a, b) => (b.champ[1] - b.champ[0]) - (a.champ[1] - a.champ[0])).slice(0, 200);
const top2 = [...scored].sort((a, b) => (b.chall[1] - b.chall[0]) - (a.chall[1] - a.chall[0])).slice(0, 200);
const in1 = new Set(top1.map((s) => s.lid)), in2 = new Set(top2.map((s) => s.lid));
const union = [...new Map([...top2, ...top1].map((s) => [s.lid, s])).values()];
const queueRows = union.map((s) => {
  const months = []; for (let m = s.L.om; m <= AS_OF; m++) months.push(month(s.L, m));
  return {
    accountId: `LN-${String(s.lid).padStart(6, '0')}`, loanId: s.lid, borrowerName: s.L.borrower.name, state: s.L.borrower.state,
    product: s.L.product, fileType: s.L.borrower.fileType, vintage: monthLabel(s.L.om), balance: round(months.at(-1).balance, 2), apr: s.L.apr,
    planted: s.L.ew >= 0,
    v1: { pdPrev: round(s.champ[0], 4), pd: round(s.champ[1], 4), reasons: in1.has(s.lid) ? reasons(champ, s.f) : [] },
    v2: { pdPrev: round(s.chall[0], 4), pd: round(s.chall[1], 4), reasons: in2.has(s.lid) ? reasons(chall, s.f) : [] },
    timeline: months.slice(-12).map((m) => ({ month: monthLabel(m.m), fico: m.fico, utilization: m.util, dpd: m.dpd, scheduled: m.sched, paid: m.paid, inquiries: m.inq6 })),
  };
});
console.log(`queue: ${queueRows.length} accounts; planted in V1 top 150: ${top1.slice(0, 150).filter((s) => s.L.ew >= 0).length}, V2 top 150: ${top2.slice(0, 150).filter((s) => s.L.ew >= 0).length}`);

// ---------------------------------------------------------------- write
const pct = (a, b) => round(a / b, 4);
const portfolio = {
  asOf: monthLabel(AS_OF),
  kpis: {
    activeLoans: port.loans, balance: round(port.balance, 2), dpd30Rate: pct(port.dpd['30-59'][1] + port.dpd['60-89'][1] + port.dpd['90+'][1], port.balance),
    expectedLoss: round(el, 2), elRate: pct(el, port.balance),
  },
  dpdBuckets: Object.entries(port.dpd).map(([bucket, [n, bal]]) => ({ bucket, loans: n, balance: round(bal, 2) })),
  byProduct: Object.entries(port.byProduct).map(([product, [n, bal]]) => ({ product, loans: n, balance: round(bal, 2) })),
  vintages: Object.entries(vint).sort().map(([q, v]) => {
    let cum = 0;
    return { vintage: q, loans: v.n, curve: v.mobs.map((d, mob) => { cum += d; return mob <= v.maxMob && mob >= 3 ? { mob, cumDefaultRate: round(cum / v.n, 4) } : null; }).filter(Boolean) };
  }),
  trend: Object.entries(bookTrend).map(([t, b]) => ({ month: monthLabel(+t), avgUtilization: round(b.util / b.n, 4), avgFico: round(b.fico / b.n, 1), balance: round(b.bal, 2), dpd30Rate: round(b.dpd30 / b.n, 4) })),
};
const models = {
  source: 'provisional',
  modelName: 'CREDIT_DEFAULT_MODEL',
  versions: [
    { version: 'V1', alias: 'CHAMPION', algorithm: 'XGBoost classifier', trainingWindow: '2023-01 to 2024-09 vintages', features: CHAMP_FEATURES, trainRows: champTrain.length, train: { auc: champTrainEval.auc, ks: champTrainEval.ks, gini: champTrainEval.gini }, oot: champOot, importance: champ.importance },
    { version: 'V2', alias: 'CHALLENGER', algorithm: 'XGBoost classifier', trainingWindow: '2023-01 to 2025-03 vintages', features: CHALL_FEATURES, trainRows: challTrain.length, oot: challOot, importance: chall.importance },
  ],
  ootWindow: '2025-04 to 2025-06 vintages (12-month outcome observed)',
  runs: [
    { runId: 'V1-run1', version: 'V1', params: { provisional_logistic: 1 }, auc: champOot.auc, ks: champOot.ks, gini: champOot.gini, logged: true },
    { runId: 'V2-run1', version: 'V2', params: { provisional_logistic: 1 }, auc: challOot.auc, ks: challOot.ks, gini: challOot.gini, logged: true },
  ],
};
const monitoring = { baseline: 'Champion training sample (2023-01 to 2024-09 vintages, observed at months 3 and 9)', threshold: 0.25, psi: psiSeries, distributions };


writeFileSync(`${OUT}/monitoring.json`, JSON.stringify(monitoring));
// Model outputs captured from a live run (scripts/capture-live.mjs) are kept unless --provisional is passed.
// That includes portfolio.json, whose expected loss depends on the champion's scores.
const captured = existsSync(`${OUT}/models.json`) && JSON.parse(readFileSync(`${OUT}/models.json`, 'utf8')).source === 'live-capture';
if (!captured || process.argv.includes('--provisional')) {
  writeFileSync(`${OUT}/portfolio.json`, JSON.stringify(portfolio));
  writeFileSync(`${OUT}/models.json`, JSON.stringify(models));
  writeFileSync(`${OUT}/queue.json`, JSON.stringify({ source: 'provisional', asOf: monthLabel(AS_OF), accounts: queueRows }));
} else {
  console.log('kept live-captured portfolio.json, models.json, and queue.json (pass --provisional to overwrite)');
}
console.log(JSON.stringify({ kpis: portfolio.kpis, psiLatest: psiSeries.at(-1), champOot: { auc: champOot.auc, fairness: champOot.fairness }, challOot: { auc: challOot.auc, fairness: challOot.fairness }, trainRate: champTrainEval.defaultRate }, null, 1));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
