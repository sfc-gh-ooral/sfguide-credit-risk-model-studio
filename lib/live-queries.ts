// Live-mode queries against the objects sql/setup.sql creates. Server-only. Every value that comes
// from the request is passed as a bind variable; SQL text is never assembled from user input.
import { COMPLETE_MODEL, executeQuery } from './snowflake';
import type { ActionRecord, EwAction, ExperimentRun, Models, ModelVersion, Monitoring, Portfolio, Queue, QueueAccount, Reason } from './types';

const DB = 'CREDIT_RISK_STUDIO';
const MODEL = `${DB}.ML.CREDIT_DEFAULT_MODEL`;
const AS_OF = '2026-09-01';

// Same fixed bins as scripts/gen-core.mjs (PSI_EDGES) and APP.PSI_BINS.
export const PSI_EDGES: Record<string, number[]> = {
  UTILIZATION: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], FICO: [600, 640, 670, 690, 710, 730, 750, 770, 800],
  INQUIRIES_6M: [1, 2, 3, 4], DTI: [0.15, 0.2, 0.25, 0.3, 0.35, 0.4], PAY_RATIO_3M: [0.6, 0.8, 0.95, 0.999], APR: [0.08, 0.12, 0.16, 0.2, 0.24],
};
const binLabels = (e: number[]) => ['<' + e[0], ...e.map((x, i) => (i + 1 < e.length ? `${x}–${e[i + 1]}` : `≥${x}`))];

const json = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;
const num = (v: unknown) => Number(v);

// ---------------------------------------------------------------- portfolio
export async function getPortfolio(): Promise<Portfolio> {
  const [buckets, products, vint, trend, el] = await Promise.all([
    executeQuery<{ DPD_BUCKET: string; LOANS: number; BALANCE: number }>(
      `SELECT DPD_BUCKET, COUNT(*) AS LOANS, SUM(BALANCE) AS BALANCE FROM ${DB}.APP.PORTFOLIO_ACTIVE GROUP BY 1`),
    executeQuery<{ PRODUCT: string; LOANS: number; BALANCE: number }>(
      `SELECT PRODUCT, COUNT(*) AS LOANS, SUM(BALANCE) AS BALANCE FROM ${DB}.APP.PORTFOLIO_ACTIVE GROUP BY 1 ORDER BY 1 DESC`),
    executeQuery<{ VINTAGE: string; LOANS: number; MOB: number; CUM_DEFAULT_RATE: number }>(
      `SELECT VINTAGE, LOANS, MOB, CUM_DEFAULT_RATE FROM ${DB}.APP.VINTAGE_CURVES ORDER BY VINTAGE, MOB`),
    executeQuery<{ MONTH: string; AVG_UTILIZATION: number; AVG_FICO: number; BALANCE: number; DPD30_RATE: number }>(
      `SELECT MONTH, AVG_UTILIZATION, AVG_FICO, BALANCE, DPD30_RATE FROM ${DB}.APP.BOOK_TREND ORDER BY MONTH`),
    executeQuery<{ EXPECTED_LOSS: number }>(`SELECT SUM(EXPECTED_LOSS) AS EXPECTED_LOSS FROM ${DB}.APP.EXPECTED_LOSS`),
  ]);
  const order = ['Current', '1-29', '30-59', '60-89', '90+'];
  const dpdBuckets = order.map((b) => {
    const r = buckets.rows.find((x) => x.DPD_BUCKET === b);
    return { bucket: b, loans: num(r?.LOANS ?? 0), balance: num(r?.BALANCE ?? 0) };
  });
  const balance = dpdBuckets.reduce((s, b) => s + b.balance, 0);
  const late = dpdBuckets.filter((b) => ['30-59', '60-89', '90+'].includes(b.bucket)).reduce((s, b) => s + b.balance, 0);
  const expectedLoss = num(el.rows[0]?.EXPECTED_LOSS ?? 0);
  const vintages = new Map<string, Portfolio['vintages'][number]>();
  for (const r of vint.rows) {
    if (!vintages.has(r.VINTAGE)) vintages.set(r.VINTAGE, { vintage: r.VINTAGE, loans: num(r.LOANS), curve: [] });
    vintages.get(r.VINTAGE)!.curve.push({ mob: num(r.MOB), cumDefaultRate: num(r.CUM_DEFAULT_RATE) });
  }
  return {
    asOf: '2026-09',
    kpis: { activeLoans: dpdBuckets.reduce((s, b) => s + b.loans, 0), balance, dpd30Rate: late / balance, expectedLoss, elRate: expectedLoss / balance },
    dpdBuckets,
    byProduct: products.rows.map((r) => ({ product: r.PRODUCT, loans: num(r.LOANS), balance: num(r.BALANCE) })),
    vintages: [...vintages.values()],
    trend: trend.rows.map((r) => ({ month: r.MONTH, avgUtilization: num(r.AVG_UTILIZATION), avgFico: num(r.AVG_FICO), balance: num(r.BALANCE), dpd30Rate: num(r.DPD30_RATE) })),
  };
}

// ---------------------------------------------------------------- early-warning queue
export async function getQueue(): Promise<Queue> {
  const [scores, timeline] = await Promise.all([
    executeQuery<Record<string, unknown>>(`SELECT * FROM ${DB}.APP.EW_QUEUE`),
    executeQuery<Record<string, unknown>>(
      `SELECT p.LOAN_ID, TO_CHAR(p.STATEMENT_MONTH, 'YYYY-MM') AS MONTH, b.FICO, b.REVOLVING_UTILIZATION, p.DAYS_PAST_DUE,
              p.SCHEDULED_AMOUNT, p.PAID_AMOUNT, b.INQUIRIES_6M
       FROM ${DB}.RAW.PAYMENTS_MONTHLY p
       JOIN ${DB}.RAW.BUREAU_SNAPSHOTS_MONTHLY b ON b.LOAN_ID = p.LOAN_ID AND b.SNAPSHOT_MONTH = p.STATEMENT_MONTH
       WHERE p.LOAN_ID IN (SELECT LOAN_ID FROM ${DB}.APP.EW_QUEUE) AND p.STATEMENT_MONTH >= DATEADD(MONTH, -11, ?::DATE)
       ORDER BY p.LOAN_ID, p.STATEMENT_MONTH`, [AS_OF]),
  ]);
  // The scoring procedure writes one row per account per scored version (V1, V2).
  const all = await executeQuery<{ LOAN_ID: number; MODEL_VERSION: string; PD_PREV: number; PD: number }>(
    `SELECT s.LOAN_ID, s.MODEL_VERSION, s.PD_PREV, s.PD FROM ${DB}.ML.SCORES s WHERE s.LOAN_ID IN (SELECT LOAN_ID FROM ${DB}.APP.EW_QUEUE)`);
  const byLoan = new Map<number, QueueAccount>();
  for (const r of all.rows) {
    const id = num(r.LOAN_ID);
    if (!byLoan.has(id)) byLoan.set(id, { v1: { pdPrev: 0, pd: 0, reasons: [] }, v2: { pdPrev: 0, pd: 0, reasons: [] }, timeline: [] } as unknown as QueueAccount);
    byLoan.get(id)![r.MODEL_VERSION === 'V2' ? 'v2' : 'v1'] = { pdPrev: num(r.PD_PREV), pd: num(r.PD), reasons: [] };
  }
  for (const r of scores.rows) {
    const a = byLoan.get(num(r.LOAN_ID));
    if (!a) continue;
    Object.assign(a, {
      accountId: String(r.ACCOUNT_ID), loanId: num(r.LOAN_ID), borrowerName: String(r.BORROWER_NAME), state: String(r.STATE),
      product: String(r.PRODUCT), fileType: String(r.FILE_TYPE), vintage: String(r.VINTAGE), balance: num(r.BALANCE), apr: num(r.APR),
      planted: Boolean(r.PLANTED),
    });
    a[r.MODEL_VERSION === 'V2' ? 'v2' : 'v1'].reasons = json<Reason[]>(r.REASONS);
  }
  for (const r of timeline.rows) {
    const a = byLoan.get(num(r.LOAN_ID));
    if (!a) continue;
    a.timeline.push({ month: String(r.MONTH), fico: num(r.FICO), utilization: num(r.REVOLVING_UTILIZATION), dpd: num(r.DAYS_PAST_DUE),
      scheduled: num(r.SCHEDULED_AMOUNT), paid: num(r.PAID_AMOUNT), inquiries: num(r.INQUIRIES_6M) });
  }
  return { source: 'live', asOf: '2026-09', accounts: [...byLoan.values()].filter((a) => a.accountId) };
}

// ---------------------------------------------------------------- models
async function aliases(): Promise<Record<string, string[]>> {
  const { rows } = await executeQuery<Record<string, unknown>>(`SHOW VERSIONS IN MODEL ${MODEL}`);
  return Object.fromEntries(rows.map((r) => [String(r.name), json<string[]>(r.aliases ?? '[]')]));
}
export async function getModels(): Promise<Models> {
  const [evals, runs, al] = await Promise.all([
    executeQuery<{ MODEL_VERSION: string; PAYLOAD: unknown }>(`SELECT MODEL_VERSION, PAYLOAD FROM ${DB}.ML.MODEL_EVAL ORDER BY MODEL_VERSION`),
    executeQuery<Record<string, unknown>>(`SELECT RUN_ID, MODEL_VERSION, PARAMS, AUC, KS, GINI, LOGGED FROM ${DB}.ML.EXPERIMENT_RUNS ORDER BY RUN_ID`),
    aliases(),
  ]);
  const versions = evals.rows.map((r) => {
    const p = json<ModelVersion>(r.PAYLOAD);
    // Original aliases from training; the UI derives current ones from the promotion status.
    return { ...p, alias: r.MODEL_VERSION === 'V1' ? 'CHAMPION' : 'CHALLENGER', currentAliases: al[r.MODEL_VERSION] ?? [] };
  });
  const out: ExperimentRun[] = runs.rows.map((r) => ({
    runId: String(r.RUN_ID), version: String(r.MODEL_VERSION), params: json<Record<string, number>>(r.PARAMS),
    auc: num(r.AUC), ks: num(r.KS), gini: num(r.GINI), logged: Boolean(r.LOGGED),
  }));
  return { source: 'live', modelName: 'CREDIT_DEFAULT_MODEL', versions, ootWindow: '2025-04 to 2025-06 vintages (12-month outcome observed)', runs: out };
}

// ---------------------------------------------------------------- monitoring
export async function getMonitoring(): Promise<Monitoring> {
  const [psi, dist] = await Promise.all([
    executeQuery<{ MONTH: string; FEATURE: string; PSI: number }>(`SELECT MONTH, FEATURE, PSI FROM ${DB}.APP.PSI_BY_MONTH ORDER BY MONTH`),
    executeQuery<{ FEATURE: string; BIN: number; PERIOD: string; SHARE: number }>(`SELECT FEATURE, BIN, PERIOD, SHARE FROM ${DB}.APP.PSI_DISTRIBUTIONS`),
  ]);
  const months = new Map<string, Monitoring['psi'][number]>();
  for (const r of psi.rows) {
    if (!months.has(r.MONTH)) months.set(r.MONTH, { month: r.MONTH });
    months.get(r.MONTH)![r.FEATURE] = num(r.PSI);
  }
  const distributions: Monitoring['distributions'] = {};
  for (const [f, edges] of Object.entries(PSI_EDGES)) {
    distributions[f] = binLabels(edges).map((bin, i) => {
      const pick = (period: string) => num(dist.rows.find((r) => r.FEATURE === f && num(r.BIN) === i && r.PERIOD === period)?.SHARE ?? 0);
      return { bin, baseline: pick('BASELINE'), current: pick('CURRENT') };
    });
  }
  return {
    baseline: 'Champion training sample (2023-01 to 2024-09 vintages, observed at months 3 and 9)', threshold: 0.25,
    psi: [...months.values()], distributions,
  };
}

// The model monitor's own PSI for utilization in the latest month (ML Observability).
export async function monitorCheck(): Promise<{ psi: number; month: string }> {
  const { rows } = await executeQuery<{ EVENT_TIMESTAMP: string; METRIC_VALUE: number }>(
    `SELECT EVENT_TIMESTAMP, METRIC_VALUE FROM TABLE(MODEL_MONITOR_DRIFT_METRIC(
       '${DB}.ML.CREDIT_DEFAULT_V1_MONITOR', 'POPULATION_STABILITY_INDEX', 'UTILIZATION', '1 MONTH',
       ?::TIMESTAMP_NTZ, DATEADD(MONTH, 1, ?::TIMESTAMP_NTZ)))`, [AS_OF, AS_OF]);
  if (!rows.length) throw new Error('The model monitor returned no PSI for 2026-09 yet. It refreshes daily; try again after its first refresh.');
  return { psi: num(rows[0].METRIC_VALUE), month: '2026-09' };
}

// ---------------------------------------------------------------- early-warning actions
export async function getActions(): Promise<ActionRecord[]> {
  const { rows } = await executeQuery<Record<string, unknown>>(
    `SELECT ACCOUNT_ID, ACTION, NOTE, PERSONA, TO_CHAR(ACTED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS ACTED_AT FROM ${DB}.APP.EW_ACTIONS
     QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY ACTED_AT DESC) = 1`);
  return rows.map((r) => ({ accountId: String(r.ACCOUNT_ID), action: r.ACTION as EwAction, note: String(r.NOTE ?? ''), persona: String(r.PERSONA), actedAt: new Date(String(r.ACTED_AT)).toISOString() }));
}
export async function addAction(a: ActionRecord) {
  await executeQuery(`INSERT INTO ${DB}.APP.EW_ACTIONS (ACCOUNT_ID, ACTION, NOTE, PERSONA, ACTED_AT) SELECT ?, ?, ?, ?, SYSDATE()`,
    [a.accountId, a.action, a.note, a.persona]);
}

// ---------------------------------------------------------------- promotion
export async function getPromotion() {
  const al = await aliases();
  const promoted = (al.V2 ?? []).map((x) => x.toUpperCase()).includes('CHAMPION');
  if (!promoted) return { promoted: false };
  const { rows } = await executeQuery<Record<string, unknown>>(
    `SELECT NOTE, APPROVER, TO_CHAR(DECIDED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS DECIDED_AT FROM ${DB}.APP.MODEL_APPROVALS WHERE MODEL_VERSION = 'V2' AND DECISION = 'APPROVED' ORDER BY DECIDED_AT DESC LIMIT 1`);
  const r = rows[0];
  return { promoted: true, note: r ? String(r.NOTE) : undefined, approver: r ? String(r.APPROVER) : undefined, at: r ? new Date(String(r.DECIDED_AT)).toISOString() : undefined };
}

async function runScoringTask() {
  const { rows: before } = await executeQuery<{ T: string }>('SELECT CURRENT_TIMESTAMP()::STRING AS T');
  await executeQuery(`EXECUTE TASK ${DB}.ML.SCORE_PORTFOLIO_TASK`);
  // EXECUTE TASK is asynchronous: wait for this run to finish (up to 6 minutes).
  for (let i = 0; i < 72; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const { rows } = await executeQuery<{ STATE: string; ERROR_MESSAGE: string | null }>(
      `SELECT STATE, ERROR_MESSAGE FROM TABLE(${DB}.INFORMATION_SCHEMA.TASK_HISTORY(TASK_NAME => 'SCORE_PORTFOLIO_TASK', SCHEDULED_TIME_RANGE_START => ?::TIMESTAMP_LTZ))
       WHERE STATE IN ('SUCCEEDED', 'FAILED', 'CANCELLED') ORDER BY COMPLETED_TIME DESC LIMIT 1`, [before[0].T]);
    if (rows[0]?.STATE === 'SUCCEEDED') return;
    if (rows[0]) throw new Error(`SCORE_PORTFOLIO_TASK ${rows[0].STATE}: ${rows[0].ERROR_MESSAGE ?? ''}`);
  }
  throw new Error('SCORE_PORTFOLIO_TASK did not finish within 6 minutes. Check TASK_HISTORY.');
}

async function setAliases(champion: 'V1' | 'V2') {
  const other = champion === 'V2' ? 'V1' : 'V2';
  // A version holds at most one alias, so clear both before reassigning.
  await executeQuery(`ALTER MODEL ${MODEL} VERSION V1 UNSET ALIAS`);
  await executeQuery(`ALTER MODEL ${MODEL} VERSION V2 UNSET ALIAS`);
  await executeQuery(`ALTER MODEL ${MODEL} VERSION ${champion} SET ALIAS = CHAMPION`);
  await executeQuery(`ALTER MODEL ${MODEL} VERSION ${other} SET ALIAS = ${champion === 'V2' ? 'PREVIOUS_CHAMPION' : 'CHALLENGER'}`);
  await executeQuery(`ALTER MODEL ${MODEL} SET DEFAULT_VERSION = ${champion}`);
}

export async function promote(note: string, approver: string) {
  await executeQuery(`INSERT INTO ${DB}.APP.MODEL_APPROVALS (MODEL_VERSION, DECISION, NOTE, APPROVER, DECIDED_AT) SELECT 'V2', 'APPROVED', ?, ?, SYSDATE()`, [note, approver]);
  await setAliases('V2');
  await runScoringTask();
}

// Puts V1 back as champion (README "Replay the story"); records the reversal.
export async function revertPromotion() {
  await executeQuery(`INSERT INTO ${DB}.APP.MODEL_APPROVALS (MODEL_VERSION, DECISION, NOTE, APPROVER, DECIDED_AT) SELECT 'V2', 'REVERTED', 'Reset for replay', 'example reset', SYSDATE()`);
  await setAliases('V1');
  await runScoringTask();
}

// ---------------------------------------------------------------- AI_COMPLETE model documentation
const SECTION_ASK: Record<string, string> = {
  purpose: 'Write the "Purpose and scope" section: intended use, population and training data, and what is out of scope.',
  performance: 'Write the "Performance and limitations" section: out-of-time discrimination, calibration, the segment fairness finding, and drift limitations.',
  changes: 'Write the "Changes from V1 to V2" section for the validator: training window, features, performance differences, the segment gap, and a recommended validator action with a condition.',
};
export async function draftSection(section: string, version: string): Promise<{ text: string; model: string }> {
  const ask = SECTION_ASK[section];
  if (!ask || !['V1', 'V2'].includes(version)) throw new Error('Unknown section or version.');
  const [evals, psi] = await Promise.all([
    executeQuery<{ MODEL_VERSION: string; PAYLOAD: unknown }>(`SELECT MODEL_VERSION, PAYLOAD FROM ${DB}.ML.MODEL_EVAL ORDER BY MODEL_VERSION`),
    executeQuery<{ FEATURE: string; PSI: number }>(`SELECT FEATURE, PSI FROM ${DB}.APP.PSI_BY_MONTH WHERE MONTH = '2026-09'`),
  ]);
  const facts = evals.rows.map((r) => {
    const p = json<ModelVersion>(r.PAYLOAD);
    return { version: p.version, trainingWindow: p.trainingWindow, features: p.features, trainRows: p.trainRows, oot: { auc: p.oot.auc, ks: p.oot.ks, gini: p.oot.gini, fairness: p.oot.fairness },
      topFeatures: p.importance.slice(0, 5) };
  });
  const prompt = `You are drafting a model risk management (MRM) model card for a synthetic consumer-loan default model (illustrative, not a validated credit model).
Model: CREDIT_DEFAULT_MODEL, an XGBoost classifier predicting 90+ days past due within 12 months, observed at month 3 on book. Out-of-time sample: 2025-04 to 2025-06 vintages.
Focus version: ${version}. Facts (JSON): ${JSON.stringify({ versions: facts, psi2026_09: psi.rows })}
${ask}
Use only the facts given; do not invent numbers. Write AUC differences as decimals (e.g., 0.009), default rates as percentages, and never use basis points. Write 3 or 4 short paragraphs, each starting with a bold lead-in like **Training window.** Plain text with **bold** only, no headings or lists. Under 220 words.`;
  const { rows } = await executeQuery<{ TEXT: string }>('SELECT AI_COMPLETE(?, ?) AS TEXT', [COMPLETE_MODEL, prompt]);
  return { text: String(rows[0]?.TEXT ?? '').trim(), model: COMPLETE_MODEL };
}
