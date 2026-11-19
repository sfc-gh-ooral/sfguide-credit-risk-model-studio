export const fmtUsd = (x: number, digits = 0) =>
  x.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits });
export const fmtUsdShort = (x: number) => {
  const a = Math.abs(x);
  if (a >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(x / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(x / 1e3).toFixed(0)}K`;
  return `$${x.toFixed(0)}`;
};
export const fmtPct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
export const fmtPts = (x: number, digits = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)} pts`;
export const fmtInt = (x: number) => x.toLocaleString('en-US');

export const FEATURE_LABELS: Record<string, string> = {
  FICO: 'FICO score', UTILIZATION: 'Revolving utilization', INQUIRIES_6M: 'Inquiries (6 mo)', TRADELINES: 'Open tradelines',
  DTI: 'Debt-to-income', APR: 'APR', LOAN_AMOUNT: 'Loan amount', TERM_MONTHS: 'Term', IS_AUTO: 'Auto loan',
  MONTHS_ON_BOOK: 'Months on book', MAX_DPD_6M: 'Max DPD (6 mo)', PAY_RATIO_3M: 'Paid vs. scheduled (3 mo)',
  MONTHS_ON_BUREAU: 'Months on bureau',
};
export const featureLabel = (f: string) => FEATURE_LABELS[f] ?? f;

export function featureValue(f: string, v: number): string {
  if (f === 'UTILIZATION' || f === 'DTI' || f === 'APR' || f === 'PAY_RATIO_3M') return fmtPct(v, 0);
  if (f === 'LOAN_AMOUNT') return fmtUsdShort(v);
  if (f === 'IS_AUTO') return v ? 'Yes' : 'No';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export const FILE_TYPE_LABELS: Record<string, string> = { THICK: 'Thick file', THIN: 'Thin file', NEW_TO_CREDIT: 'New to credit' };
