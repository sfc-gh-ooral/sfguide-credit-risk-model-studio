// Seeded, deterministic synthetic credit portfolio. sql/setup.sql ports these exact formulas, so the
// live tables match the bundled sample row for row. Every random draw is u(id, k): an integer hash
// that uses only exact integer arithmetic (no Math.random, no platform-specific RNG).
//
// Month index m: 0 = 2023-01 ... 44 = 2026-09 (the as-of month).

export const P = 2147483647; // 2^31 - 1
export const AS_OF = 44;
export const N_BORROWERS = 200000;
export const N_LOANS = 230000;
export const DRIFT_START = 24; // 2025-01: utilization drift begins (story 1)
export const EW_COUNT = 150; // story 3

// (a * b) mod P for 0 <= a, b < 2^31, exact in doubles by splitting a into 16-bit halves.
function mulmod(a, b) {
  const ah = Math.floor(a / 65536), al = a % 65536;
  return ((((ah * b) % P) * 65536) % P + (al * b) % P) % P;
}

// SQL: CRS_U(id, k) in sql/setup.sql
export function u(id, k) {
  const x = (id * 2654435761 + k * 40503 + 12345) % P; // id * 2654435761 < 2^53 for id < 2^20
  const y = (mulmod(x, x) + 7 * k + 1) % P;
  const z = (mulmod(y, y) + id) % P;
  return z / P;
}
// Approximately standard normal (Irwin-Hall with 3 draws); arithmetic only.
export const n3 = (id, k) => (u(id, k) + u(id, k + 1) + u(id, k + 2) - 1.5) * 2;

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const round = (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; };
export const sigmoid = (z) => 1 / (1 + Math.exp(-z));

export const monthLabel = (m) => `${2023 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
export const quarterLabel = (m) => `${2023 + Math.floor(m / 12)}-Q${Math.floor((m % 12) / 3) + 1}`;

export const FIRST = ['Avery', 'Jordan', 'Maya', 'Elena', 'Marcus', 'Priya', 'Daniel', 'Sofia', 'Noah', 'Grace', 'Omar', 'Lena',
  'Caleb', 'Hana', 'Isaac', 'Nora', 'Theo', 'Amara', 'Lucas', 'Iris', 'Mateo', 'Zoe', 'Ethan', 'Leila', 'Owen', 'Ruby', 'Samir',
  'Clara', 'Felix', 'Naomi', 'Julian', 'Esme'];
export const LAST = ['Whitfield', 'Okafor', 'Lindqvist', 'Moreau', 'Castellano', 'Nakamura', 'Brennan', 'Haddad', 'Sorensen',
  'Delgado', 'Achebe', 'Varga', 'Holloway', 'Kovacs', 'Rahman', 'Fairbanks', 'Ortega', 'Petrov', 'Calloway', 'Mbeki', 'Tanaka',
  'Ellison', 'Quintero', 'Abernathy', 'Novak', 'Ashford', 'Ferraro', 'Lindgren', 'Osei', 'Pemberton', 'Valdez', 'Whitaker'];
export const STATES = ['CA', 'TX', 'FL', 'NY', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI', 'AZ', 'WA', 'CO', 'TN', 'MN', 'VA'];
const INCOME = ['<40K', '40-75K', '75-120K', '120K+'];

// SQL: BORROWERS
export function borrower(bid) {
  const f = u(bid, 1001);
  const fileType = f < 0.12 ? 'NEW_TO_CREDIT' : f < 0.30 ? 'THIN' : 'THICK';
  const mob0 = fileType === 'NEW_TO_CREDIT' ? 2 + Math.floor(u(bid, 1002) * 11)
    : fileType === 'THIN' ? 12 + Math.floor(u(bid, 1002) * 37) : 48 + Math.floor(u(bid, 1002) * 253);
  return {
    borrowerId: bid,
    name: `${FIRST[Math.floor(u(bid, 1003) * FIRST.length)]} ${LAST[Math.floor(u(bid, 1004) * LAST.length)]}`,
    state: STATES[Math.floor(u(bid, 1005) * STATES.length)],
    incomeBand: INCOME[Math.floor(u(bid, 1006) * INCOME.length)],
    fileType,
    monthsOnBureau0: mob0, // at 2023-01
    tradelines0: fileType === 'NEW_TO_CREDIT' ? 1 + Math.floor(u(bid, 1007) * 2)
      : fileType === 'THIN' ? 2 + Math.floor(u(bid, 1007) * 3) : 4 + Math.floor(u(bid, 1007) * 14),
  };
}

export const borrowerOf = (lid) => (lid <= N_BORROWERS ? lid : (lid - N_BORROWERS) * 6);
const EW_BASE = 2000, EW_STEP = 1501;
export const ewIndex = (lid) => (lid >= EW_BASE && (lid - EW_BASE) % EW_STEP === 0 && (lid - EW_BASE) / EW_STEP < EW_COUNT
  ? (lid - EW_BASE) / EW_STEP : -1);

// SQL: LOANS (+ hidden generation columns kept out of the app-facing tables)
export function loan(lid) {
  const b = borrower(borrowerOf(lid));
  const ew = ewIndex(lid);
  const auto = u(lid, 1) < 0.42;
  const om = ew >= 0 ? 30 + (ew % 9) : Math.floor(42 * Math.sqrt(u(lid, 2)));
  const ntc = b.fileType === 'NEW_TO_CREDIT';
  const fico0 = Math.round(clamp((ntc ? 690 : b.fileType === 'THIN' ? 698 : 712) + 52 * n3(lid, 3), 540, 840));
  const dti = round(0.10 + 0.34 * u(lid, 6), 3);
  const amount = auto ? 100 * Math.round((12000 + 48000 * u(lid, 7)) / 100) : 100 * Math.round((3000 + 37000 * u(lid, 7)) / 100);
  const term = auto ? [48, 60, 72][Math.floor(u(lid, 8) * 3)] : [36, 48, 60][Math.floor(u(lid, 8) * 3)];
  const apr = round(clamp(0.29 - ((fico0 - 540) / 300) * 0.21 + 0.02 * (u(lid, 9) - 0.5) + (auto ? -0.02 : 0), 0.049, 0.299), 4);
  const ltv = auto ? round(0.70 + 0.50 * u(lid, 10), 3) : null;
  const drift = om >= DRIFT_START ? 0.13 * Math.min(1, (om - DRIFT_START + 1) / 12) : 0; // story 1
  const util0 = round(clamp(0.12 + 0.50 * u(lid, 11) - (fico0 - 700) / 1200 + drift, 0.01, 0.98), 3);
  // Latent default risk. The utilization effect strengthens in drifted vintages, and new-to-credit borrowers
  // carry extra risk that FICO alone does not capture (story 2).
  const utilBeta = om >= DRIFT_START ? 4.4 : 1.6;
  const z = -2.55 - (fico0 - 700) / 70 + utilBeta * (util0 - 0.40) + 1.6 * (dti - 0.27) + (auto ? -0.25 : 0)
    + (ntc ? 1.15 : b.fileType === 'THIN' ? 0.30 : 0) + 0.9 * n3(lid, 14);
  const defaults = ew < 0 && u(lid, 12) < sigmoid(z);
  // First 90+ DPD month: 7 to 30 months on book (uniform). Training labels only see months 4 to 15.
  const dm = defaults ? om + 7 + Math.floor(u(lid, 13) * 24) : null;
  return { loanId: lid, borrower: b, ew, product: auto ? 'AUTO' : 'PERSONAL', om, fico0, dti, amount, term, apr, ltv, util0, dm };
}

// SQL: BUREAU_SNAPSHOTS_MONTHLY and PAYMENTS_MONTHLY rows for months om..last.
export function lastMonth(L) {
  const maturity = L.om + L.term - 1;
  return Math.min(AS_OF, maturity, L.dm != null ? L.dm + 1 : Infinity); // charged off the month after 90+
}
export function month(L, m) {
  const mob = m - L.om;
  const k = 100 + m * 10;
  const id = L.loanId;
  const ewOn = L.ew >= 0 && m >= 42 ? m - 41 : 0;
  const pre = L.dm != null && m >= L.dm - 3 ? m - L.dm + 4 : 0; // deterioration ramp before default
  let dpd = 0;
  if (L.dm != null && m >= L.dm - 2) dpd = Math.min(120, 30 * (m - L.dm + 3));
  else if (ewOn >= 2 || (pre > 0 && u(id, k + 7) < 0.55) || u(id, k) < 0.022) dpd = 15; // short pays cluster before default
  const fico = Math.round(clamp(L.fico0 + 11 * n3(id, k + 1) - 14 * pre - 22 * ewOn, 480, 850));
  const util = round(clamp(L.util0 + 0.0008 * mob + 0.06 * (u(id, k + 4) - 0.5) + 0.05 * pre + 0.17 * ewOn, 0, 1.2), 3);
  const inq6 = Math.floor(u(id, k + 5) * 3) + (pre > 0 ? 1 : 0) + (ewOn > 0 ? 2 : 0);
  const tradelines = L.borrower.tradelines0 + Math.floor((m + 0) / 12) + (pre > 2 ? 1 : 0);
  const sched = round((L.amount / L.term) * (1 + L.apr / 2), 2);
  const paid = dpd >= 30 ? 0 : dpd === 15 ? round(sched * 0.5, 2)
    : ewOn > 0 ? round(sched * (0.30 + 0.25 * u(id, k + 6)), 2) : sched;
  const balance = round(L.amount * (1 - mob / L.term), 2);
  return { m, mob, dpd, fico, util, inq6, tradelines, sched, paid, balance, monthsOnBureau: L.borrower.monthsOnBureau0 + m };
}

// Model features at observation month t (SQL: FEATURES feature views). Requires months t-5..t.
export const FEATURES = ['FICO', 'UTILIZATION', 'INQUIRIES_6M', 'TRADELINES', 'DTI', 'APR', 'LOAN_AMOUNT', 'TERM_MONTHS',
  'IS_AUTO', 'MONTHS_ON_BOOK', 'MAX_DPD_6M', 'PAY_RATIO_3M', 'MONTHS_ON_BUREAU'];
export function features(L, months, t) {
  const at = months[t - L.om];
  let maxDpd = 0, paid = 0, sched = 0;
  for (let m = Math.max(L.om, t - 5); m <= t; m++) maxDpd = Math.max(maxDpd, months[m - L.om].dpd);
  for (let m = Math.max(L.om, t - 2); m <= t; m++) { paid += months[m - L.om].paid; sched += months[m - L.om].sched; }
  return {
    FICO: at.fico, UTILIZATION: at.util, INQUIRIES_6M: at.inq6, TRADELINES: at.tradelines, DTI: L.dti, APR: L.apr,
    LOAN_AMOUNT: L.amount, TERM_MONTHS: L.term, IS_AUTO: L.product === 'AUTO' ? 1 : 0, MONTHS_ON_BOOK: at.mob,
    MAX_DPD_6M: maxDpd, PAY_RATIO_3M: round(sched > 0 ? paid / sched : 1, 4), MONTHS_ON_BUREAU: at.monthsOnBureau,
  };
}
export const defaultedWithin12 = (L, t) => L.dm != null && L.dm > t && L.dm <= t + 12;

// Fixed PSI bin edges (not data-driven, so SQL and JS bin identically). SQL: PSI_BINS table.
export const PSI_EDGES = {
  UTILIZATION: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
  FICO: [600, 640, 670, 690, 710, 730, 750, 770, 800],
  INQUIRIES_6M: [1, 2, 3, 4],
  DTI: [0.15, 0.2, 0.25, 0.3, 0.35, 0.4],
  PAY_RATIO_3M: [0.6, 0.8, 0.95, 0.999],
  APR: [0.08, 0.12, 0.16, 0.2, 0.24],
};
export const binOf = (edges, x) => { let i = 0; while (i < edges.length && x >= edges[i]) i++; return i; };
