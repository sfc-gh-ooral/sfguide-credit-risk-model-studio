# Credit Risk Model Studio

**Build, validate, monitor, and act on a consumer-loan default model in Snowflake, without moving borrower data to laptops.**

Data scientists at consumer lenders often extract loan and bureau data to local notebooks. That creates copies of personal data, slows deployment, and makes it harder to show model risk management (MRM) reviewers what trained the model. This pack keeps the whole lifecycle in one account, on synthetic data:

- features in the Feature Store
- training with Snowflake ML
- champion and challenger versions in the Model Registry
- drift tracking with ML Observability
- reason codes from model explainability
- an AI-drafted model card
- an early-warning queue that portfolio managers can act on

**Try it in your browser:** [hosted example](https://sfc-gh-ooral.github.io/sfguide-credit-risk-model-studio/try/) (Sample mode, synthetic data) · **Guide:** [landing page](https://sfc-gh-ooral.github.io/sfguide-credit-risk-model-studio/)

> Synthetic data and an illustrative model. This is not a validated credit model and not regulatory, model risk management, fair lending, or lending advice. Fairness checks are illustrative.

## What you get

| Screen | Who it's for | What it shows | Snowflake capability |
|---|---|---|---|
| Portfolio | Portfolio risk manager | Balance, DPD buckets, vintage loss curves, illustrative expected loss, drift alert | Snowflake SQL, Model Registry batch scores |
| Early warning | Portfolio risk manager | Performing accounts ranked by 3-month change in default probability, SHAP reason codes, drill-down, and outreach / watchlist / dismiss with a note | `model.run`, `explain` (Preview), app write-back table |
| Model workbench | Data scientist | Sweep runs, champion vs. challenger AUC / KS / Gini, calibration, feature importance | Snowflake ML (XGBoost in a warehouse), Feature Store, Model Registry |
| Model card | Model validator | Lineage, version history, fairness by segment, AI-drafted documentation, approval that promotes the challenger | Model Registry aliases, AI_COMPLETE, Task |
| Monitoring | Model validator | PSI and characteristic stability by feature and month, distribution shift, drift check | ML Observability (model monitor), Snowflake SQL |

**Story:** a drift alert fires, and the validator reviews the PSI. The challenger, trained on recent vintages, wins out of time. The validator approves it, which moves the `CHAMPION` alias. The early-warning queue then refreshes with the new champion's reason codes.

A **Sample / Live** switch in the header always shows the data source. A **View as** switch (data scientist, model validator, portfolio risk manager) changes which actions the UI enables. It's app-level only, not a Snowflake role or policy.

## Prerequisites

- **For Sample mode:** Node.js 20 or later. No Snowflake account needed.
- **For Live mode:**
  - A Snowflake account in a region with Cortex AI (AI_COMPLETE), or with cross-region inference enabled. Every feature used is listed for Standard Edition in Snowflake's edition matrix. This pack was tested on a single account and has not been tested on a Standard Edition account.
  - A role that can create a role and grant `EXECUTE TASK` and `SNOWFLAKE.CORTEX_USER` (ACCOUNTADMIN, or USERADMIN + SECURITYADMIN), plus SYSADMIN.
- **Tested with:** snowflake-ml-python 2.8.0, xgboost 3.2.0, and Python 3.11 in the warehouse; Snowflake CLI 3.11; Next.js 16; November 2026.
- **Preview features:** Model explainability (`explain`, Shapley values) is a Preview feature. Everything else used here is generally available.

## Quick start: Sample mode (no account)

```bash
git clone https://github.com/sfc-gh-ooral/sfguide-credit-risk-model-studio.git
cd sfguide-credit-risk-model-studio
npm install
npm run dev
```

Open <http://localhost:3000>. The app runs on the bundled synthetic data in `data/sample/`. Every simulated AI or compute action waits a few seconds, shows the steps the live path performs, and labels its output **Sample AI response** or **Sample result**. Decisions are saved in your browser only. When the story is complete, **Replay** in the story bar resets it.

## Live mode: deploy to your account

1. **Create the objects and train the models.** Open `sql/setup.sql` in a Snowsight SQL worksheet and **Run All**. It needs no edits and takes about 15 to 20 minutes on an XSMALL warehouse, mostly training and scoring. You can also run it with the Snowflake CLI: `snow sql -f sql/setup.sql`. The last three queries print quick checks (active loans, utilization PSI by month, out-of-time AUC).
2. **Create a key pair** outside the repository, and register the public key on your user:
   ```bash
   mkdir -p ~/.snowflake/keys
   openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out ~/.snowflake/keys/credit_risk_key.p8 -nocrypt
   openssl rsa -in ~/.snowflake/keys/credit_risk_key.p8 -pubout
   ```
   Then run `ALTER USER <YOUR_USER> SET RSA_PUBLIC_KEY_2 = '<public key body without header lines>';`.
3. **Configure the app.** Copy `.env.example` to `.env.local` (git-ignored) and set `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USERNAME`, and `SNOWFLAKE_PRIVATE_KEY_PATH`. The app never asks for credentials in the browser.
4. **Run it:** `npm run dev`. The header switches to **Live**. Every screen now queries `CREDIT_RISK_STUDIO`. If a live call fails, the app shows the error; it never falls back to sample data.
5. **Optional: refresh the bundled sample from your run.** Before promoting V2, run `npm run capture-live` (with the app running; set `BASE` if it isn't on port 3000). It copies your live model metrics, sweep runs, and reason codes into `data/sample/`.

**Replay the story in Live mode.** Promotion moves the `CHAMPION` alias to V2 and re-scores. To put V1 back and re-score, call `curl -X DELETE http://localhost:3000/api/promote`. It records the reversal in `APP.MODEL_APPROVALS` and takes a few minutes.

### What setup creates

Everything is created by `sql/setup.sql` and removed by `sql/cleanup.sql`. Nothing that already exists is changed.

| Object | Name | Notes |
|---|---|---|
| Role | `CREDIT_RISK_STUDIO_ROLE` | Least-privilege role. After the one-time grants, setup and the app run as this role. Granted to you and to SYSADMIN |
| Warehouse | `CREDIT_RISK_STUDIO_WH` | XSMALL, `AUTO_SUSPEND = 60`, starts suspended |
| Database | `CREDIT_RISK_STUDIO` | Schemas `RAW`, `FEATURES`, `ML`, `APP` |
| Tables (RAW) | `BORROWERS`, `LOANS`, `BUREAU_SNAPSHOTS_MONTHLY`, `PAYMENTS_MONTHLY`, `DEFAULTS`, `LOANS_GEN` | Seeded synthetic data. 200,000 borrowers, 230,000 loans, 3.9M monthly rows each. `CRS_*` SQL functions are the generator |
| Feature Store (FEATURES) | Entity `LOAN`; feature views `LOAN_ATTRIBUTES` v1 and `LOAN_BEHAVIOR` v1 | Snowflake-managed feature views on Dynamic Tables, daily refresh |
| Model (ML) | `CREDIT_DEFAULT_MODEL` | V1 (`CHAMPION`) and V2 (`CHALLENGER`), XGBoost, with explainability |
| Procedures (ML) | `TRAIN_MODELS`, `SCORE_PORTFOLIO`, `BUILD_MONITOR_DATA` | Python, run in the warehouse |
| Task (ML) | `SCORE_PORTFOLIO_TASK` | Weekly batch scoring. Created suspended; the app runs it once with `EXECUTE TASK` when a validator promotes V2 |
| Model monitor (ML) | `CREDIT_DEFAULT_V1_MONITOR` | ML Observability on V1, with a baseline and a `FILE_TYPE` segment. Refreshes daily |
| Tables (ML) | `EXPERIMENT_RUNS`, `MODEL_EVAL`, `SCORES`, `MONITOR_SOURCE`, `MONITOR_BASELINE`; view `TRAINING_SPINE` | Training, scoring, and monitoring outputs |
| App (APP) | Views `PORTFOLIO_ACTIVE`, `EW_QUEUE`, `EXPECTED_LOSS`; tables `PSI_BINS`, `PSI_BY_MONTH`, `PSI_DISTRIBUTIONS`, `VINTAGE_CURVES`, `BOOK_TREND`, `EW_ACTIONS`, `MODEL_APPROVALS` | Read by the app; the last two are app write-back |

### Least privilege

`sql/setup.sql` uses ACCOUNTADMIN only for four account-level statements: create the role, grant it to you, grant `SNOWFLAKE.CORTEX_USER`, and grant `EXECUTE TASK`. SYSADMIN then creates the warehouse, database, and schemas, and grants `CREDIT_RISK_STUDIO_ROLE` only usage and the specific `CREATE` privileges it needs in those four schemas. Everything else, from data generation through the app's queries and write-backs, runs as `CREDIT_RISK_STUDIO_ROLE`.

### Expected cost and time

- **Setup:** about 15 to 20 minutes on XSMALL. Most of it is the three-run XGBoost sweep per version and scoring roughly 180,000 accounts twice.
- **Each promotion or replay:** one scoring run of a few minutes.
- **Ongoing:** the Feature Store's Dynamic Tables and the model monitor refresh daily on the same XSMALL warehouse, a few minutes per day. The scoring task is suspended. Run `sql/cleanup.sql` when you're done to stop all of it.
- **AI_COMPLETE:** each model-card draft is one call of about 1,500 input tokens.

Check your own usage in Snowsight. Credit prices vary by edition and region.

## Cleanup

Run `sql/cleanup.sql` in a worksheet. It drops the database (including the feature views' dynamic tables, the model and its versions, the monitor, procedures, and the task), the warehouse, and the role.

## How the data and stories work

`scripts/gen-core.mjs` defines every row with a seeded integer hash. `sql/setup.sql` ports the same formulas to SQL, so live tables match the bundled sample row for row: 216,870 active loans and $4,177,438,082.71 in balance, both ways. See [`data/README.md`](data/README.md) for the planted stories. On this synthetic data set:

1. **Utilization drift:** PSI for revolving utilization crosses 0.25 in 2026-06 and reaches 0.34 by 2026-09 (fixed-bin SQL PSI). The model monitor's own PSI shows the same trend (0.35 for 2026-09).
2. **New-to-credit underprediction:** the champion predicts 6.7% vs. 11.2% observed for new-to-credit borrowers out of time. The challenger narrows the gap to 8.0%.
3. **Early-warning accounts:** 150 planted performing loans whose utilization spikes and payments fall short in the last three months. In the live run they hold most of the top of the queue; exact counts are in [`data/README.md`](data/README.md).

The challenger (V2) adds months on bureau and trains on vintages through 2025-03. Out of time it scores AUC 0.733 vs. 0.724 for the champion (V1), on this synthetic data set.

## Build it with Cortex Code

The training code in `ML.TRAIN_MODELS` (and `notebooks/credit_risk_training.ipynb`) came from prompts like these in Cortex Code:

- "Register a LOAN entity and two Snowflake-managed feature views in the Feature Store: static loan terms, and monthly bureau and payment behavior with 3- and 6-month windows. Show me the feature DataFrames before registering."
- "Build a point-in-time training set at months 3 and 9 on book with a 12-month 90+ DPD label. Train XGBoost with a small sweep, compare on an out-of-time vintage window, and log the best run to the Model Registry with metrics, explainability, and a CHAMPION alias."
- "Score the performing book with `model.run` for every aliased version, and store the top three positive SHAP contributions from `explain` as reason codes."
- "Create a model monitor on the champion with its training sample as the baseline, and compute fixed-bin PSI by feature and month in SQL for the app."

`notebooks/credit_risk_training.ipynb` carries the same code for a Snowflake Notebook on Container Runtime. In this pack, the tested live path is the stored procedure; the notebook is provided for teams that prefer to iterate there.

## Customize with Cortex Code

- "Point the Feature Store at my bureau and payment tables. Propose entity keys and show the feature views before creating anything."
- "Train a challenger with LightGBM, compare it to the champion, and draft the MRM documentation differences."
- "Schedule weekly scoring and monitoring with a least-privilege role."

## Known limitations

- **Illustrative model.** The model and its data are synthetic and deliberately simple. Fairness checks compare predicted and observed rates by file type only. They aren't a fair-lending analysis, and file type isn't a protected class.
- **Reason codes vs. adverse action.** SHAP reason codes explain the score for early-warning triage. They aren't adverse-action reasons.
- **Explainability is Preview.** `explain` must be enabled when a version is logged (`enable_explainability`, warehouse target platform). It can't be added to an existing version.
- **PSI comes from two sources.** The monitoring screen uses fixed-bin SQL PSI, so Sample and Live match exactly and every feature is shown. The **Run drift check** button returns the model monitor's own PSI (`MODEL_MONITOR_DRIFT_METRIC`), which bins differently and reads slightly higher. The monitor needs its first refresh after setup.
- **Synchronous promotion.** Promotion waits for the scoring task in the request, which takes a few minutes in Live mode. A production app would run it asynchronously.
- **Personas are UI-only.** "View as" doesn't change Snowflake permissions. Live mode always runs as `CREDIT_RISK_STUDIO_ROLE`.
- **Notebook.** The Container Runtime notebook isn't part of the tested setup path.

## Repository layout

```text
app/                 Next.js app (App Router); app/api/ holds the live-mode routes
components/          UI components (header, Sample/Live switch, staged AI progress, story bar)
lib/                 credit-data.ts (client interface), mock-source.ts (bundled data), live-queries.ts + snowflake.ts (live, bind variables only)
data/                Synthetic sample data and the planted-story notes
scripts/             Seeded generator, live capture, hosted export, screenshot capture
sql/                 setup.sql and cleanup.sql
notebooks/           Training notebook (Container Runtime)
docs/                GitHub Pages landing page, screenshots, and the hosted example (docs/try/)
```

To rebuild the hosted example after UI changes, run `npm run build:example`. It writes a static export with `basePath /sfguide-credit-risk-model-studio/try` to `docs/try/`.

## License and disclaimer

Apache 2.0, see [LICENSE](LICENSE). This is an illustrative example provided as-is. It isn't an official Snowflake product and isn't supported by Snowflake Support. It contains no customer data. Review and test before any production use.

Owner: Oz Oral · Last reviewed: November 2026
