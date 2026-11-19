// Shapes shared by Sample mode (bundled JSON in data/sample/) and Live mode (API routes on Snowflake).

export interface Portfolio {
  asOf: string;
  kpis: { activeLoans: number; balance: number; dpd30Rate: number; expectedLoss: number; elRate: number };
  dpdBuckets: { bucket: string; loans: number; balance: number }[];
  byProduct: { product: string; loans: number; balance: number }[];
  vintages: { vintage: string; loans: number; curve: { mob: number; cumDefaultRate: number }[] }[];
  trend: { month: string; avgUtilization: number; avgFico: number; balance: number; dpd30Rate: number }[];
}

export interface Reason { feature: string; value: number; contribution: number }
export interface ModelScore { pdPrev: number; pd: number; reasons: Reason[] }
export interface TimelinePoint { month: string; fico: number; utilization: number; dpd: number; scheduled: number; paid: number; inquiries: number }
export interface QueueAccount {
  accountId: string; loanId: number; borrowerName: string; state: string; product: string; fileType: string;
  vintage: string; balance: number; apr: number; planted: boolean;
  v1: ModelScore; v2: ModelScore; timeline: TimelinePoint[];
}
export interface Queue { source: 'provisional' | 'live-capture' | 'live'; asOf: string; accounts: QueueAccount[] }

export interface Metrics { auc: number; ks: number; gini: number; n?: number; defaultRate?: number }
export interface Evaluation extends Metrics {
  calibration: { decile: number; predicted: number; observed: number }[];
  fairness: { segment: string; n: number; observed: number; predicted: number; auc: number }[];
}
export interface ModelVersion {
  version: string; alias: string; algorithm: string; trainingWindow: string; features: string[]; trainRows: number;
  bestRun?: string; train?: Metrics; oot: Evaluation; importance: { feature: string; importance: number }[]; featureViews?: string[];
}
export interface ExperimentRun { runId: string; version: string; params: Record<string, number>; auc: number; ks: number; gini: number; logged: boolean }
export interface Models {
  source: 'provisional' | 'live-capture' | 'live';
  modelName: string; versions: ModelVersion[]; ootWindow: string; runs?: ExperimentRun[];
}

export interface Monitoring {
  baseline: string; threshold: number;
  psi: ({ month: string } & Record<string, number | string>)[];
  distributions: Record<string, { bin: string; baseline: number; current: number }[]>;
  monitorPsi?: { month: string; psi: number }[]; // from MODEL_MONITOR_DRIFT_METRIC (live only)
}

export type EwAction = 'OUTREACH' | 'WATCHLIST' | 'DISMISS';
export interface ActionRecord { accountId: string; action: EwAction; note: string; persona: string; actedAt: string }

export type Persona = 'scientist' | 'validator' | 'manager';
export const PERSONAS: Record<Persona, { label: string; short: string; blurb: string }> = {
  scientist: { label: 'Data scientist', short: 'DS', blurb: 'Features, training, comparison, registration' },
  validator: { label: 'Model validator', short: 'MRM', blurb: 'Lineage, performance, fairness, drift, approval' },
  manager: { label: 'Portfolio risk manager', short: 'PM', blurb: 'Early-warning queue and segment trends' },
};
