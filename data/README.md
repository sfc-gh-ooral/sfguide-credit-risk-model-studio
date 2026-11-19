# Synthetic data

Everything in this pack is synthetic. No real borrowers, lenders, or bureau records were used or scrubbed.

## How it's generated

`scripts/gen-core.mjs` defines every row with a deterministic integer hash, `u(id, k)`, instead of a random number generator. `sql/setup.sql` ports the same formulas to Snowflake SQL (`CRS_U`), so the live tables match the bundled sample row for row. Regenerate the sample with:

```bash
node scripts/generate-data.mjs   # about 10 seconds, writes data/sample/*.json
```

| Table | Rows | Contents |
|---|---|---|
| `BORROWERS` | 200,000 | Synthetic name, state, income band, file type (thick, thin, new-to-credit), months on bureau |
| `LOANS` | 230,000 | Personal and auto loans, 2023-01 to 2026-06 originations: amount, APR, term, origination FICO, DTI, LTV (auto) |
| `BUREAU_SNAPSHOTS_MONTHLY` | 3,935,036 | FICO, revolving utilization, inquiries (6 months), open tradelines |
| `PAYMENTS_MONTHLY` | 3,935,036 | Scheduled and paid amounts, days past due (DPD), balance |
| `DEFAULTS` | 9,222 | First month at 90+ DPD, observed by 2026-09 |

The as-of month is **2026-09**. The model label is **90+ DPD within 12 months** of the observation point (month 3 on book).

## Planted stories

The stories below are planted on purpose. Numbers are from the live Snowflake run (`sql/setup.sql`, November 2026) **on this synthetic data set**. Raw-data numbers are identical in Sample mode.

1. **Utilization drift in recent vintages.** Starting with 2025-01 originations, revolving utilization at origination shifts upward, and its link to default gets stronger. Fixed-bin PSI for `UTILIZATION` against the champion's training sample crosses **0.25 in 2026-06** and reaches **0.34 in 2026-09**. Every other monitored feature stays below 0.01. The model monitor (`CREDIT_DEFAULT_V1_MONITOR`) shows the same trend with its own binning (0.25 in 2026-06, 0.35 in 2026-09). V2 adds months on bureau and trains on vintages through 2025-03. On the 2025-04 to 2025-06 out-of-time vintages it scores AUC **0.733** vs. **0.724** for the champion V1, KS 0.336 vs. 0.329.
2. **New-to-credit underprediction.** New-to-credit borrowers carry risk that FICO doesn't capture. Out of time, the champion predicts **6.7%** vs. **11.2%** observed for that segment (n = 2,735). The challenger narrows the gap (8.0% predicted) but doesn't close it. This is the validator's fairness finding.
3. **150 accounts with rising early-warning scores.** Loan IDs `2000 + 1501 × i`, for i = 0 to 149, are performing loans from the 2025-07 to 2026-03 vintages. In the last three months (2026-07 to 2026-09), utilization spikes, FICO drops, inquiries rise, and payments fall to 30–55% of scheduled; they're 1–29 days past due in the last two months. In the live run, **81 of V1's** and **85 of V2's** top 150 risers are planted accounts (73 and 77 of the top 100). The rest are organic accounts deteriorating toward default.

Default timing: a loan's first 90+ DPD month falls 7 to 30 months after origination, so vintage curves keep rising past the 12-month label window. In the months before default, utilization rises, FICO falls, and short payments become likely. The training spine observes performing loans at months 3 and 9 on book, so the model learns that behavior.

## Sample vs. live model outputs

Raw-data aggregates in `data/sample/` (portfolio, vintages, PSI) are computed exactly from the seeded formulas. Model outputs start as provisional logistic fits from the generator. After a live run, `scripts/capture-live.mjs` replaces `models.json` and `queue.json` with the real Snowflake ML results (XGBoost metrics, SHAP reason codes from `explain`), so Sample mode shows what live mode produced.
