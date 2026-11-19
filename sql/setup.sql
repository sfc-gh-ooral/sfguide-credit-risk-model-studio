-- ============================================================================
-- Credit Risk Model Studio: Snowflake setup
-- Synthetic data and an illustrative default model only. Not a validated credit
-- model, and not regulatory, model risk management, or lending advice.
-- ============================================================================
-- Run top to bottom in a Snowsight SQL worksheet. No edits or find-and-replace.
-- Takes about 15 to 25 minutes on an XSMALL warehouse, most of it model training
-- and scoring.
--
-- Requires: a role that can create roles and grant account privileges
-- (ACCOUNTADMIN, or USERADMIN + SECURITYADMIN) and SYSADMIN. Cortex AI
-- (AI_COMPLETE) in your region or with cross-region inference enabled.
-- Model explainability (`explain`) is a Preview feature.
--
-- Creates (sql/cleanup.sql drops all of it); changes nothing that already exists:
--   role       CREDIT_RISK_STUDIO_ROLE   least-privilege pipeline + app role
--   warehouse  CREDIT_RISK_STUDIO_WH     XSMALL, AUTO_SUSPEND = 60
--   database   CREDIT_RISK_STUDIO        schemas RAW, FEATURES, ML, APP
--   RAW        BORROWERS, LOANS, BUREAU_SNAPSHOTS_MONTHLY, PAYMENTS_MONTHLY,
--              DEFAULTS, generator functions CRS_*
--   FEATURES   Feature Store: entity LOAN, feature views LOAN_ATTRIBUTES and
--              LOAN_BEHAVIOR (Dynamic Tables)
--   ML         model CREDIT_DEFAULT_MODEL (V1 alias CHAMPION, V2 alias CHALLENGER),
--              procedures TRAIN_MODELS / SCORE_PORTFOLIO / BUILD_MONITOR_DATA,
--              task SCORE_PORTFOLIO_TASK, model monitor CREDIT_DEFAULT_V1_MONITOR,
--              tables EXPERIMENT_RUNS, MODEL_EVAL, SCORES, MONITOR_SOURCE,
--              MONITOR_BASELINE, TRAINING_SPINE (view)
--   APP        views for the app, tables EW_ACTIONS and MODEL_APPROVALS
-- ============================================================================

-- --------------------------------------------------------------------------
-- 0. Account-level: one least-privilege role for the pipeline and the app
-- --------------------------------------------------------------------------
USE ROLE ACCOUNTADMIN;
CREATE ROLE IF NOT EXISTS CREDIT_RISK_STUDIO_ROLE
  COMMENT = 'Credit Risk Model Studio example: owns only objects in CREDIT_RISK_STUDIO';
GRANT ROLE CREDIT_RISK_STUDIO_ROLE TO ROLE SYSADMIN;
SET my_user = CURRENT_USER();
GRANT ROLE CREDIT_RISK_STUDIO_ROLE TO USER IDENTIFIER($my_user);
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE CREDIT_RISK_STUDIO_ROLE; -- AI_COMPLETE
GRANT EXECUTE TASK ON ACCOUNT TO ROLE CREDIT_RISK_STUDIO_ROLE;           -- run the scoring task

-- --------------------------------------------------------------------------
-- 1. Warehouse, database, schemas (SYSADMIN), with schema-scoped grants only
-- --------------------------------------------------------------------------
USE ROLE SYSADMIN;
CREATE WAREHOUSE IF NOT EXISTS CREDIT_RISK_STUDIO_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Credit Risk Model Studio example';
CREATE DATABASE IF NOT EXISTS CREDIT_RISK_STUDIO COMMENT = 'Credit Risk Model Studio example (synthetic data)';
CREATE SCHEMA IF NOT EXISTS CREDIT_RISK_STUDIO.RAW;
CREATE SCHEMA IF NOT EXISTS CREDIT_RISK_STUDIO.FEATURES;
CREATE SCHEMA IF NOT EXISTS CREDIT_RISK_STUDIO.ML;
CREATE SCHEMA IF NOT EXISTS CREDIT_RISK_STUDIO.APP;

GRANT USAGE, OPERATE ON WAREHOUSE CREDIT_RISK_STUDIO_WH TO ROLE CREDIT_RISK_STUDIO_ROLE;
GRANT USAGE ON DATABASE CREDIT_RISK_STUDIO TO ROLE CREDIT_RISK_STUDIO_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW, CREATE FUNCTION ON SCHEMA CREDIT_RISK_STUDIO.RAW TO ROLE CREDIT_RISK_STUDIO_ROLE;
-- The Feature Store needs to create dynamic tables, views, and tags in its schema.
GRANT USAGE, CREATE TABLE, CREATE VIEW, CREATE DYNAMIC TABLE, CREATE TAG, CREATE TASK
  ON SCHEMA CREDIT_RISK_STUDIO.FEATURES TO ROLE CREDIT_RISK_STUDIO_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW, CREATE MODEL, CREATE MODEL MONITOR, CREATE PROCEDURE, CREATE TASK, CREATE STAGE
  ON SCHEMA CREDIT_RISK_STUDIO.ML TO ROLE CREDIT_RISK_STUDIO_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA CREDIT_RISK_STUDIO.APP TO ROLE CREDIT_RISK_STUDIO_ROLE;

-- Everything below runs as the least-privilege role.
USE ROLE CREDIT_RISK_STUDIO_ROLE;
USE WAREHOUSE CREDIT_RISK_STUDIO_WH;
USE SCHEMA CREDIT_RISK_STUDIO.RAW;

-- --------------------------------------------------------------------------
-- 2. Seeded generator. Same formulas as scripts/gen-core.mjs, so the tables
--    match the app's bundled sample row for row. u(id, k) is an integer hash.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION CRS_X(ID NUMBER, K NUMBER) RETURNS NUMBER AS
  'MOD(ID * 2654435761 + K * 40503 + 12345, 2147483647)';
CREATE OR REPLACE FUNCTION CRS_Y(ID NUMBER, K NUMBER) RETURNS NUMBER AS
  'MOD(CRS_X(ID, K) * CRS_X(ID, K) + 7 * K + 1, 2147483647)';
CREATE OR REPLACE FUNCTION CRS_U(ID NUMBER, K NUMBER) RETURNS FLOAT AS
  'MOD(CRS_Y(ID, K) * CRS_Y(ID, K) + ID, 2147483647)::FLOAT / 2147483647';
CREATE OR REPLACE FUNCTION CRS_N3(ID NUMBER, K NUMBER) RETURNS FLOAT AS
  '(CRS_U(ID, K) + CRS_U(ID, K + 1) + CRS_U(ID, K + 2) - 1.5) * 2';

CREATE OR REPLACE TABLE BORROWERS AS
WITH ids AS (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS BID FROM TABLE(GENERATOR(ROWCOUNT => 200000))),
f AS (SELECT BID, CRS_U(BID, 1001) AS UF, CRS_U(BID, 1002) AS UM, CRS_U(BID, 1007) AS UT FROM ids)
SELECT
  BID AS BORROWER_ID,
  ARRAY_CONSTRUCT('Avery','Jordan','Maya','Elena','Marcus','Priya','Daniel','Sofia','Noah','Grace','Omar','Lena',
    'Caleb','Hana','Isaac','Nora','Theo','Amara','Lucas','Iris','Mateo','Zoe','Ethan','Leila','Owen','Ruby','Samir',
    'Clara','Felix','Naomi','Julian','Esme')[FLOOR(CRS_U(BID, 1003) * 32)::INT]::STRING || ' ' ||
  ARRAY_CONSTRUCT('Whitfield','Okafor','Lindqvist','Moreau','Castellano','Nakamura','Brennan','Haddad','Sorensen',
    'Delgado','Achebe','Varga','Holloway','Kovacs','Rahman','Fairbanks','Ortega','Petrov','Calloway','Mbeki','Tanaka',
    'Ellison','Quintero','Abernathy','Novak','Ashford','Ferraro','Lindgren','Osei','Pemberton','Valdez','Whitaker')[FLOOR(CRS_U(BID, 1004) * 32)::INT]::STRING AS FULL_NAME,
  ARRAY_CONSTRUCT('CA','TX','FL','NY','IL','PA','OH','GA','NC','MI','AZ','WA','CO','TN','MN','VA')[FLOOR(CRS_U(BID, 1005) * 16)::INT]::STRING AS STATE,
  ARRAY_CONSTRUCT('<40K','40-75K','75-120K','120K+')[FLOOR(CRS_U(BID, 1006) * 4)::INT]::STRING AS INCOME_BAND,
  CASE WHEN UF < 0.12 THEN 'NEW_TO_CREDIT' WHEN UF < 0.30 THEN 'THIN' ELSE 'THICK' END AS FILE_TYPE,
  CASE WHEN UF < 0.12 THEN 2 + FLOOR(UM * 11) WHEN UF < 0.30 THEN 12 + FLOOR(UM * 37) ELSE 48 + FLOOR(UM * 253) END::INT AS MONTHS_ON_BUREAU_2023_01,
  CASE WHEN UF < 0.12 THEN 1 + FLOOR(UT * 2) WHEN UF < 0.30 THEN 2 + FLOOR(UT * 3) ELSE 4 + FLOOR(UT * 14) END::INT AS TRADELINES_2023_01
FROM f;

-- LOANS_GEN keeps the generator's working columns; LOANS is the clean app-facing table.
CREATE OR REPLACE TABLE LOANS_GEN AS
WITH ids AS (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS LID FROM TABLE(GENERATOR(ROWCOUNT => 230000))),
a AS (
  SELECT LID,
    IFF(LID <= 200000, LID, (LID - 200000) * 6) AS BORROWER_ID,
    IFF(LID >= 2000 AND MOD(LID - 2000, 1501) = 0 AND (LID - 2000) / 1501 < 150, (LID - 2000) / 1501, -1)::INT AS EW,
    CRS_U(LID, 1) < 0.42 AS IS_AUTO
  FROM ids),
b AS (
  SELECT a.*, br.FILE_TYPE, br.MONTHS_ON_BUREAU_2023_01, br.TRADELINES_2023_01,
    IFF(EW >= 0, 30 + MOD(EW, 9), FLOOR(42 * SQRT(CRS_U(LID, 2))))::INT AS OM,
    ROUND(LEAST(840, GREATEST(540,
      IFF(br.FILE_TYPE = 'NEW_TO_CREDIT', 690, IFF(br.FILE_TYPE = 'THIN', 698, 712)) + 52 * CRS_N3(LID, 3)))) AS FICO0,
    ROUND(0.10 + 0.34 * CRS_U(LID, 6), 3) AS DTI,
    IFF(IS_AUTO, 100 * ROUND((12000 + 48000 * CRS_U(LID, 7)) / 100), 100 * ROUND((3000 + 37000 * CRS_U(LID, 7)) / 100)) AS AMOUNT,
    IFF(IS_AUTO, ARRAY_CONSTRUCT(48, 60, 72), ARRAY_CONSTRUCT(36, 48, 60))[FLOOR(CRS_U(LID, 8) * 3)::INT]::INT AS TERM,
    IFF(IS_AUTO, ROUND(0.70 + 0.50 * CRS_U(LID, 10), 3), NULL) AS LTV
  FROM a JOIN BORROWERS br ON br.BORROWER_ID = a.BORROWER_ID),
c AS (
  SELECT b.*,
    ROUND(LEAST(0.299, GREATEST(0.049, 0.29 - ((FICO0 - 540) / 300) * 0.21 + 0.02 * (CRS_U(LID, 9) - 0.5) + IFF(IS_AUTO, -0.02, 0))), 4) AS APR,
    ROUND(LEAST(0.98, GREATEST(0.01, 0.12 + 0.50 * CRS_U(LID, 11) - (FICO0 - 700) / 1200
      + IFF(OM >= 24, 0.13 * LEAST(1, (OM - 24 + 1) / 12::FLOAT), 0))), 3) AS UTIL0
  FROM b),
d AS (
  SELECT c.*,
    -2.55 - (FICO0 - 700) / 70 + IFF(OM >= 24, 4.4, 1.6) * (UTIL0 - 0.40) + 1.6 * (DTI - 0.27) + IFF(IS_AUTO, -0.25, 0)
      + IFF(FILE_TYPE = 'NEW_TO_CREDIT', 1.15, IFF(FILE_TYPE = 'THIN', 0.30, 0)) + 0.9 * CRS_N3(LID, 14) AS Z
  FROM c)
SELECT d.*,
  IFF(EW < 0 AND CRS_U(LID, 12) < 1 / (1 + EXP(-Z)), OM + 7 + FLOOR(CRS_U(LID, 13) * 24), NULL)::INT AS DM
FROM d;

CREATE OR REPLACE TABLE LOANS AS
SELECT LID AS LOAN_ID, 'LN-' || LPAD(LID, 6, '0') AS ACCOUNT_ID, BORROWER_ID,
  IFF(IS_AUTO, 'AUTO', 'PERSONAL') AS PRODUCT, DATEADD(MONTH, OM, '2023-01-01'::DATE) AS ORIGINATION_MONTH,
  AMOUNT::NUMBER(12, 2) AS LOAN_AMOUNT, TERM AS TERM_MONTHS, APR::NUMBER(6, 4) AS APR, FICO0::INT AS ORIGINATION_FICO,
  DTI::NUMBER(6, 3) AS DTI, LTV::NUMBER(6, 3) AS LTV
FROM LOANS_GEN;

CREATE OR REPLACE TABLE LOAN_MONTHS_GEN AS
WITH months AS (SELECT (ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1)::INT AS M FROM TABLE(GENERATOR(ROWCOUNT => 45))),
lm AS (
  SELECT g.*, m.M, m.M - g.OM AS MOB, 100 + m.M * 10 AS K,
    IFF(g.EW >= 0 AND m.M >= 42, m.M - 41, 0) AS EW_ON,
    IFF(g.DM IS NOT NULL AND m.M >= g.DM - 3, m.M - g.DM + 4, 0) AS PRE
  FROM LOANS_GEN g JOIN months m
    ON m.M BETWEEN g.OM AND LEAST(44, g.OM + g.TERM - 1, COALESCE(g.DM + 1, 999))),
dp AS (
  SELECT lm.*,
    CASE WHEN DM IS NOT NULL AND M >= DM - 2 THEN LEAST(120, 30 * (M - DM + 3))
         WHEN EW_ON >= 2 OR (PRE > 0 AND CRS_U(LID, K + 7) < 0.55) OR CRS_U(LID, K) < 0.022 THEN 15 ELSE 0 END AS DPD,
    ROUND((AMOUNT / TERM) * (1 + APR / 2), 2) AS SCHED
  FROM lm)
SELECT LID, M, MOB, DPD, SCHED,
  ROUND(LEAST(850, GREATEST(480, FICO0 + 11 * CRS_N3(LID, K + 1) - 14 * PRE - 22 * EW_ON)))::INT AS FICO,
  ROUND(LEAST(1.2, GREATEST(0, UTIL0 + 0.0008 * MOB + 0.06 * (CRS_U(LID, K + 4) - 0.5) + 0.05 * PRE + 0.17 * EW_ON)), 3) AS UTIL,
  (FLOOR(CRS_U(LID, K + 5) * 3) + IFF(PRE > 0, 1, 0) + IFF(EW_ON > 0, 2, 0))::INT AS INQ6,
  (TRADELINES_2023_01 + FLOOR(M / 12) + IFF(PRE > 2, 1, 0))::INT AS TRADELINES,
  CASE WHEN DPD >= 30 THEN 0 WHEN DPD = 15 THEN ROUND(SCHED * 0.5, 2)
       WHEN EW_ON > 0 THEN ROUND(SCHED * (0.30 + 0.25 * CRS_U(LID, K + 6)), 2) ELSE SCHED END AS PAID,
  ROUND(AMOUNT * (1 - MOB::FLOAT / TERM), 2) AS BALANCE,
  MONTHS_ON_BUREAU_2023_01 + M AS MONTHS_ON_BUREAU
FROM dp;

CREATE OR REPLACE TABLE BUREAU_SNAPSHOTS_MONTHLY AS
SELECT l.BORROWER_ID, g.LID AS LOAN_ID, DATEADD(MONTH, g.M, '2023-01-01'::DATE) AS SNAPSHOT_MONTH,
  g.FICO, g.UTIL::NUMBER(6, 3) AS REVOLVING_UTILIZATION, g.INQ6 AS INQUIRIES_6M, g.TRADELINES AS OPEN_TRADELINES,
  g.MONTHS_ON_BUREAU
FROM LOAN_MONTHS_GEN g JOIN LOANS_GEN l ON l.LID = g.LID;

CREATE OR REPLACE TABLE PAYMENTS_MONTHLY AS
SELECT LID AS LOAN_ID, DATEADD(MONTH, M, '2023-01-01'::DATE) AS STATEMENT_MONTH, MOB AS MONTHS_ON_BOOK,
  SCHED::NUMBER(12, 2) AS SCHEDULED_AMOUNT, PAID::NUMBER(12, 2) AS PAID_AMOUNT, DPD AS DAYS_PAST_DUE, BALANCE::NUMBER(12, 2) AS BALANCE
FROM LOAN_MONTHS_GEN;

CREATE OR REPLACE TABLE DEFAULTS AS
SELECT LID AS LOAN_ID, DATEADD(MONTH, DM, '2023-01-01'::DATE) AS DEFAULT_MONTH
FROM LOANS_GEN WHERE DM IS NOT NULL AND DM <= 44;

ALTER TABLE BUREAU_SNAPSHOTS_MONTHLY SET CHANGE_TRACKING = TRUE;
ALTER TABLE PAYMENTS_MONTHLY SET CHANGE_TRACKING = TRUE;
ALTER TABLE LOANS SET CHANGE_TRACKING = TRUE;
DROP TABLE LOAN_MONTHS_GEN; -- working table; LOANS_GEN stays for the data checks in README

-- --------------------------------------------------------------------------
-- 3. Training spine: performing loans observed at months 3 and 9 on book,
--    labeled 90+ DPD within the next 12 months (only with a full window)
-- --------------------------------------------------------------------------
USE SCHEMA CREDIT_RISK_STUDIO.ML;
CREATE OR REPLACE VIEW TRAINING_SPINE AS
SELECT l.LOAN_ID, DATEADD(MONTH, o.OFFSET_MONTHS, l.ORIGINATION_MONTH) AS OBS_DATE, o.OFFSET_MONTHS,
  DATEDIFF(MONTH, '2023-01-01'::DATE, l.ORIGINATION_MONTH) AS VINTAGE_INDEX, b.FILE_TYPE,
  IFF(d.DEFAULT_MONTH > DATEADD(MONTH, o.OFFSET_MONTHS, l.ORIGINATION_MONTH)
      AND d.DEFAULT_MONTH <= DATEADD(MONTH, o.OFFSET_MONTHS + 12, l.ORIGINATION_MONTH), 1, 0) AS DEFAULTED_12M
FROM CREDIT_RISK_STUDIO.RAW.LOANS l
CROSS JOIN (SELECT 3 AS OFFSET_MONTHS UNION ALL SELECT 9) o
JOIN CREDIT_RISK_STUDIO.RAW.BORROWERS b ON b.BORROWER_ID = l.BORROWER_ID
LEFT JOIN CREDIT_RISK_STUDIO.RAW.DEFAULTS d ON d.LOAN_ID = l.LOAN_ID
WHERE DATEADD(MONTH, o.OFFSET_MONTHS + 12, l.ORIGINATION_MONTH) <= '2026-09-01'::DATE
  AND (d.DEFAULT_MONTH IS NULL OR d.DEFAULT_MONTH > DATEADD(MONTH, o.OFFSET_MONTHS, l.ORIGINATION_MONTH))
  AND EXISTS (SELECT 1 FROM CREDIT_RISK_STUDIO.RAW.PAYMENTS_MONTHLY p
              WHERE p.LOAN_ID = l.LOAN_ID AND p.STATEMENT_MONTH = DATEADD(MONTH, o.OFFSET_MONTHS, l.ORIGINATION_MONTH));

CREATE TABLE IF NOT EXISTS EXPERIMENT_RUNS (RUN_ID STRING, MODEL_VERSION STRING, PARAMS VARIANT, AUC FLOAT, KS FLOAT, GINI FLOAT, LOGGED BOOLEAN, CREATED_AT TIMESTAMP_NTZ);
CREATE TABLE IF NOT EXISTS MODEL_EVAL (MODEL_VERSION STRING, PAYLOAD VARIANT, CREATED_AT TIMESTAMP_NTZ);

-- --------------------------------------------------------------------------
-- 4. Feature Store + training + Model Registry (Snowflake ML, in a warehouse)
-- --------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE TRAIN_MODELS()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python', 'xgboost', 'scikit-learn', 'pandas', 'numpy')
HANDLER = 'run'
AS
$$
import json, numpy as np, pandas as pd, xgboost as xgb
from sklearn.metrics import roc_auc_score, roc_curve
from snowflake.ml.feature_store import FeatureStore, Entity, FeatureView, CreationMode
from snowflake.ml.registry import Registry
from snowflake.ml.model import task

DB, WH = 'CREDIT_RISK_STUDIO', 'CREDIT_RISK_STUDIO_WH'
CHAMP = ['FICO', 'UTILIZATION', 'INQUIRIES_6M', 'TRADELINES', 'DTI', 'APR', 'LOAN_AMOUNT', 'TERM_MONTHS',
         'IS_AUTO', 'MONTHS_ON_BOOK', 'MAX_DPD_6M', 'PAY_RATIO_3M']
CHALL = CHAMP + ['MONTHS_ON_BUREAU']

def metrics(y, p):
    fpr, tpr, _ = roc_curve(y, p)
    auc = roc_auc_score(y, p)
    return {'auc': round(float(auc), 4), 'ks': round(float(np.max(tpr - fpr)), 4), 'gini': round(float(2 * auc - 1), 4),
            'n': int(len(y)), 'defaultRate': round(float(np.mean(y)), 4)}

def evaluate(y, p, seg):
    out = metrics(y, p)
    order = np.argsort(p); deciles = np.array_split(order, 10)
    out['calibration'] = [{'decile': i + 1, 'predicted': round(float(p[d].mean()), 4), 'observed': round(float(y[d].mean()), 4)} for i, d in enumerate(deciles)]
    out['fairness'] = []
    for s in ['THICK', 'THIN', 'NEW_TO_CREDIT']:
        m = seg == s
        out['fairness'].append({'segment': s, 'n': int(m.sum()), 'observed': round(float(y[m].mean()), 4),
                                'predicted': round(float(p[m].mean()), 4), 'auc': round(float(roc_auc_score(y[m], p[m])), 4)})
    return out

def run(session):
    fs = FeatureStore(session=session, database=DB, name='FEATURES', default_warehouse=WH,
                      creation_mode=CreationMode.CREATE_IF_NOT_EXIST)
    loan = Entity(name='LOAN', join_keys=['LOAN_ID'], desc='A consumer loan (personal or auto)')
    fs.register_entity(loan)

    attrs_df = session.sql("""
        SELECT LOAN_ID, DTI::FLOAT AS DTI, APR::FLOAT AS APR, LOAN_AMOUNT::FLOAT AS LOAN_AMOUNT,
               TERM_MONTHS::FLOAT AS TERM_MONTHS, IFF(PRODUCT = 'AUTO', 1, 0)::FLOAT AS IS_AUTO
        FROM CREDIT_RISK_STUDIO.RAW.LOANS""")
    behavior_df = session.sql("""
        SELECT p.LOAN_ID, p.STATEMENT_MONTH AS OBS_DATE,
               b.FICO::FLOAT AS FICO, b.REVOLVING_UTILIZATION::FLOAT AS UTILIZATION, b.INQUIRIES_6M::FLOAT AS INQUIRIES_6M,
               b.OPEN_TRADELINES::FLOAT AS TRADELINES, p.MONTHS_ON_BOOK::FLOAT AS MONTHS_ON_BOOK,
               b.MONTHS_ON_BUREAU::FLOAT AS MONTHS_ON_BUREAU,
               MAX(p.DAYS_PAST_DUE) OVER (PARTITION BY p.LOAN_ID ORDER BY p.STATEMENT_MONTH ROWS BETWEEN 5 PRECEDING AND CURRENT ROW)::FLOAT AS MAX_DPD_6M,
               ROUND(SUM(p.PAID_AMOUNT) OVER (PARTITION BY p.LOAN_ID ORDER BY p.STATEMENT_MONTH ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
                   / SUM(p.SCHEDULED_AMOUNT) OVER (PARTITION BY p.LOAN_ID ORDER BY p.STATEMENT_MONTH ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 4)::FLOAT AS PAY_RATIO_3M
        FROM CREDIT_RISK_STUDIO.RAW.PAYMENTS_MONTHLY p
        JOIN CREDIT_RISK_STUDIO.RAW.BUREAU_SNAPSHOTS_MONTHLY b ON b.LOAN_ID = p.LOAN_ID AND b.SNAPSHOT_MONTH = p.STATEMENT_MONTH""")
    fv_attr = fs.register_feature_view(
        FeatureView(name='LOAN_ATTRIBUTES', entities=[loan], feature_df=attrs_df, refresh_freq='1 day',
                    desc='Static loan terms at origination'), version='1', block=True, overwrite=True)
    fv_beh = fs.register_feature_view(
        FeatureView(name='LOAN_BEHAVIOR', entities=[loan], feature_df=behavior_df, timestamp_col='OBS_DATE', refresh_freq='1 day',
                    desc='Monthly bureau and payment behavior with 3- and 6-month windows'), version='1', block=True, overwrite=True)

    spine = session.table('CREDIT_RISK_STUDIO.ML.TRAINING_SPINE')
    ts = fs.generate_training_set(spine_df=spine, features=[fv_attr, fv_beh], spine_timestamp_col='OBS_DATE',
                                  spine_label_cols=['DEFAULTED_12M']).to_pandas()
    ts = ts.sort_values('LOAN_ID').reset_index(drop=True)
    oot = ts[ts.VINTAGE_INDEX >= 27]
    session.sql('TRUNCATE TABLE CREDIT_RISK_STUDIO.ML.EXPERIMENT_RUNS').collect()
    session.sql('TRUNCATE TABLE CREDIT_RISK_STUDIO.ML.MODEL_EVAL').collect()

    reg = Registry(session=session, database_name=DB, schema_name='ML')
    # Re-runs start clean: the monitor depends on the model version, so drop it first.
    session.sql('DROP MODEL MONITOR IF EXISTS CREDIT_RISK_STUDIO.ML.CREDIT_DEFAULT_V1_MONITOR').collect()
    try:
        reg.delete_model('CREDIT_DEFAULT_MODEL')
    except Exception:
        pass
    results = {}
    specs = [('V1', 'CHAMPION', CHAMP, ts[ts.VINTAGE_INDEX <= 20], '2023-01 to 2024-09 vintages'),
             ('V2', 'CHALLENGER', CHALL, ts[ts.VINTAGE_INDEX <= 26], '2023-01 to 2025-03 vintages')]
    for version, alias, cols, train, window in specs:
        # Small hyperparameter sweep; every run is recorded, the best OOT run is logged to the registry.
        best = None
        for i, (depth, lr, n) in enumerate([(3, 0.08, 250), (4, 0.06, 300), (5, 0.05, 300)]):
            clf = xgb.XGBClassifier(max_depth=depth, learning_rate=lr, n_estimators=n, subsample=0.8, colsample_bytree=0.8,
                                    min_child_weight=20, random_state=7, n_jobs=1, eval_metric='auc')
            clf.fit(train[cols].astype('float64'), train.DEFAULTED_12M)
            m = metrics(oot.DEFAULTED_12M.values, clf.predict_proba(oot[cols].astype('float64'))[:, 1])
            run_id = f'{version}-run{i + 1}'
            session.sql('INSERT INTO CREDIT_RISK_STUDIO.ML.EXPERIMENT_RUNS SELECT ?, ?, PARSE_JSON(?), ?, ?, ?, FALSE, CURRENT_TIMESTAMP()::TIMESTAMP_NTZ',
                        params=[run_id, version, json.dumps({'max_depth': depth, 'learning_rate': lr, 'n_estimators': n}), m['auc'], m['ks'], m['gini']]).collect()
            if best is None or m['auc'] > best[1]['auc']:
                best = (clf, m, run_id)
        clf, _, run_id = best
        session.sql('UPDATE CREDIT_RISK_STUDIO.ML.EXPERIMENT_RUNS SET LOGGED = TRUE WHERE RUN_ID = ?', params=[run_id]).collect()
        X = train[cols].astype('float64')
        p_tr = clf.predict_proba(X)[:, 1]
        p_oot = clf.predict_proba(oot[cols].astype('float64'))[:, 1]
        ev = evaluate(oot.DEFAULTED_12M.values, p_oot, oot.FILE_TYPE.values)
        imp = clf.get_booster().get_score(importance_type='gain')
        tot = sum(imp.values())
        importance = sorted([{'feature': k, 'importance': round(v / tot, 4)} for k, v in imp.items()], key=lambda r: -r['importance'])
        mv = reg.log_model(clf, model_name='CREDIT_DEFAULT_MODEL', version_name=version,
                           sample_input_data=X.sample(1000, random_state=7),  # background data for explain (Preview)
                           task=task.Task.TABULAR_BINARY_CLASSIFICATION,
                           conda_dependencies=['xgboost'],
                           target_platforms=['WAREHOUSE'],              # explain runs only in a warehouse
                           options={'enable_explainability': True},     # set explicitly; can't be added after logging
                           comment=f'{alias.title()}: XGBoost trained on {window}',
                           metrics={'oot_auc': ev['auc'], 'oot_ks': ev['ks'], 'oot_gini': ev['gini'], 'train_rows': int(len(train))})
        session.sql(f'ALTER MODEL CREDIT_RISK_STUDIO.ML.CREDIT_DEFAULT_MODEL VERSION {version} SET ALIAS = {alias}').collect()
        payload = {'version': version, 'alias': alias, 'algorithm': 'XGBoost classifier', 'trainingWindow': window,
                   'features': cols, 'trainRows': int(len(train)), 'bestRun': run_id,
                   'train': metrics(train.DEFAULTED_12M.values, p_tr), 'oot': ev, 'importance': importance,
                   'featureViews': ['FEATURES.LOAN_ATTRIBUTES$1', 'FEATURES.LOAN_BEHAVIOR$1']}
        session.sql('INSERT INTO CREDIT_RISK_STUDIO.ML.MODEL_EVAL SELECT ?, PARSE_JSON(?), CURRENT_TIMESTAMP()::TIMESTAMP_NTZ',
                    params=[version, json.dumps(payload)]).collect()
        results[version] = {'alias': alias, 'oot_auc': ev['auc'], 'run': run_id}
    session.sql('ALTER MODEL CREDIT_RISK_STUDIO.ML.CREDIT_DEFAULT_MODEL SET DEFAULT_VERSION = V1').collect()
    return results
$$;

-- --------------------------------------------------------------------------
-- 5. Batch scoring with model.run (champion and challenger), plus SHAP reason
--    codes from explain (Preview) for the early-warning queue
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS SCORES (LOAN_ID NUMBER, MODEL_VERSION STRING, ALIAS STRING, PD_PREV FLOAT, PD FLOAT, PD_CHANGE FLOAT,
  REASONS VARIANT, SCORED_AT TIMESTAMP_NTZ);

CREATE OR REPLACE PROCEDURE SCORE_PORTFOLIO()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python', 'pandas', 'numpy')
HANDLER = 'run'
AS
$$
import json, pandas as pd
from snowflake.ml.registry import Registry

def run(session):
    # Performing book (under 30 DPD over 6 months), observed at 2026-06 and 2026-09.
    feats = session.sql("""
        SELECT f.*, a.DTI, a.APR, a.LOAN_AMOUNT, a.TERM_MONTHS, a.IS_AUTO
        FROM CREDIT_RISK_STUDIO.FEATURES."LOAN_BEHAVIOR$1" f
        JOIN CREDIT_RISK_STUDIO.FEATURES."LOAN_ATTRIBUTES$1" a ON a.LOAN_ID = f.LOAN_ID
        JOIN CREDIT_RISK_STUDIO.RAW.LOANS l ON l.LOAN_ID = f.LOAN_ID
        LEFT JOIN CREDIT_RISK_STUDIO.RAW.DEFAULTS d ON d.LOAN_ID = f.LOAN_ID
        WHERE f.OBS_DATE IN ('2026-06-01', '2026-09-01')
          AND f.OBS_DATE >= DATEADD(MONTH, 3, l.ORIGINATION_MONTH)
          AND (d.DEFAULT_MONTH IS NULL OR f.OBS_DATE < d.DEFAULT_MONTH)
          AND f.LOAN_ID IN (SELECT LOAN_ID FROM CREDIT_RISK_STUDIO.RAW.PAYMENTS_MONTHLY WHERE STATEMENT_MONTH = '2026-09-01')
    """).to_pandas()
    feats['OBS_DATE'] = feats['OBS_DATE'].astype(str)
    now = feats[(feats.OBS_DATE == '2026-09-01') & (feats.MAX_DPD_6M < 30)].set_index('LOAN_ID')
    prev = feats[feats.OBS_DATE == '2026-06-01'].set_index('LOAN_ID')
    now = now[now.index.isin(prev.index)]
    prev = prev.loc[now.index]
    reg = Registry(session=session, database_name='CREDIT_RISK_STUDIO', schema_name='ML')
    model = reg.get_model('CREDIT_DEFAULT_MODEL')
    session.sql('TRUNCATE TABLE CREDIT_RISK_STUDIO.ML.SCORES').collect()
    out = {}
    # After a promotion, V2 holds CHAMPION and V1 holds PREVIOUS_CHAMPION; score whichever aliases exist.
    for alias in ['CHAMPION', 'CHALLENGER', 'PREVIOUS_CHAMPION']:
        try:
            mv = model.version(alias)
        except Exception:
            continue
        cols = [f.name for f in mv.show_functions()[0]['signature'].inputs]  # model input columns, in order
        pd_now = mv.run(now[cols].reset_index(drop=True), function_name='predict_proba')['output_feature_1'].values
        pd_prev = mv.run(prev[cols].reset_index(drop=True), function_name='predict_proba')['output_feature_1'].values
        df = pd.DataFrame({'LOAN_ID': now.index.values, 'PD_PREV': pd_prev, 'PD': pd_now})
        df['PD_CHANGE'] = df.PD - df.PD_PREV
        top = df.sort_values('PD_CHANGE', ascending=False).head(200)
        x_top = now.loc[top.LOAN_ID.values, cols].reset_index(drop=True)
        shap = mv.run(x_top, function_name='explain')
        reasons = []
        for i in range(len(x_top)):
            contrib = [(c, float(x_top.iloc[i][c]), float(shap.iloc[i][f'{c}_explanation'])) for c in cols]
            pos = sorted([r for r in contrib if r[2] > 0], key=lambda r: -r[2])[:3]
            reasons.append(json.dumps([{'feature': f, 'value': v, 'contribution': round(s, 3)} for f, v, s in pos]))
        df['REASONS'] = None
        df.loc[top.index, 'REASONS'] = reasons
        df['MODEL_VERSION'] = mv.version_name
        df['ALIAS'] = alias
        session.write_pandas(df[['LOAN_ID', 'MODEL_VERSION', 'ALIAS', 'PD_PREV', 'PD', 'PD_CHANGE', 'REASONS']],
                             'SCORES_STAGE', database='CREDIT_RISK_STUDIO', schema='ML', auto_create_table=True, overwrite=True)
        session.sql("""INSERT INTO CREDIT_RISK_STUDIO.ML.SCORES
                       SELECT LOAN_ID, MODEL_VERSION, ALIAS, PD_PREV, PD, PD_CHANGE, TRY_PARSE_JSON(REASONS), CURRENT_TIMESTAMP()::TIMESTAMP_NTZ
                       FROM CREDIT_RISK_STUDIO.ML.SCORES_STAGE""").collect()
        out[alias] = {'version': mv.version_name, 'scored': int(len(df))}
    session.sql('DROP TABLE IF EXISTS CREDIT_RISK_STUDIO.ML.SCORES_STAGE').collect()
    return out
$$;

-- --------------------------------------------------------------------------
-- 6. ML Observability inputs: champion predictions on the monitoring window
--    (2025-10 to 2026-09) and on its training sample (the drift baseline)
-- --------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE BUILD_MONITOR_DATA()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python', 'pandas')
HANDLER = 'run'
AS
$$
from snowflake.ml.registry import Registry

def run(session):
    mv = Registry(session=session, database_name='CREDIT_RISK_STUDIO', schema_name='ML').get_model('CREDIT_DEFAULT_MODEL').version('V1')
    cols = [f.name for f in mv.show_functions()[0]['signature'].inputs]
    base_sql = """
        SELECT x.LOAN_ID, x.OBS_DATE::TIMESTAMP_NTZ AS OBS_TS, b.FILE_TYPE, {cols}
        FROM (SELECT f.*, a.DTI, a.APR, a.LOAN_AMOUNT, a.TERM_MONTHS, a.IS_AUTO
              FROM CREDIT_RISK_STUDIO.FEATURES."LOAN_BEHAVIOR$1" f
              JOIN CREDIT_RISK_STUDIO.FEATURES."LOAN_ATTRIBUTES$1" a ON a.LOAN_ID = f.LOAN_ID) x
        JOIN CREDIT_RISK_STUDIO.RAW.LOANS l ON l.LOAN_ID = x.LOAN_ID
        JOIN CREDIT_RISK_STUDIO.RAW.BORROWERS b ON b.BORROWER_ID = l.BORROWER_ID
        LEFT JOIN CREDIT_RISK_STUDIO.RAW.DEFAULTS d ON d.LOAN_ID = x.LOAN_ID
        WHERE {where}"""
    sel = ', '.join(f'x.{c}' for c in cols)
    current = session.sql(base_sql.format(cols=sel, where="""x.OBS_DATE BETWEEN '2025-10-01' AND '2026-09-01'
          AND x.OBS_DATE >= DATEADD(MONTH, 3, l.ORIGINATION_MONTH) AND (d.DEFAULT_MONTH IS NULL OR x.OBS_DATE < d.DEFAULT_MONTH)"""))
    # Baseline = the champion's training sample (TRAINING_SPINE rows from 2023-01 to 2024-09 vintages).
    baseline = session.sql(base_sql.format(cols=sel, where="""(x.LOAN_ID, x.OBS_DATE) IN (SELECT LOAN_ID, OBS_DATE FROM CREDIT_RISK_STUDIO.ML.TRAINING_SPINE WHERE VINTAGE_INDEX <= 20)"""))
    for df, name in [(current, 'MONITOR_SOURCE'), (baseline, 'MONITOR_BASELINE')]:
        scored = mv.run(df, function_name='predict_proba')
        scored.select('LOAN_ID', 'OBS_TS', 'FILE_TYPE', *cols, scored['"output_feature_1"'].cast('FLOAT').alias('PD')) \
              .write.save_as_table(f'CREDIT_RISK_STUDIO.ML.{name}', mode='overwrite')
    return {'source': session.table('CREDIT_RISK_STUDIO.ML.MONITOR_SOURCE').count(),
            'baseline': session.table('CREDIT_RISK_STUDIO.ML.MONITOR_BASELINE').count()}
$$;

CALL TRAIN_MODELS();
CALL SCORE_PORTFOLIO();
CALL BUILD_MONITOR_DATA();

-- Weekly batch scoring. Created suspended (no recurring cost); the app runs it
-- once with EXECUTE TASK after a validator promotes the challenger.
CREATE OR REPLACE TASK SCORE_PORTFOLIO_TASK
  WAREHOUSE = CREDIT_RISK_STUDIO_WH
  SCHEDULE = 'USING CRON 0 6 * * 1 UTC'
  COMMENT = 'Weekly champion/challenger batch scoring with model.run'
AS CALL CREDIT_RISK_STUDIO.ML.SCORE_PORTFOLIO();

CREATE OR REPLACE MODEL MONITOR CREDIT_DEFAULT_V1_MONITOR WITH
  MODEL = CREDIT_DEFAULT_MODEL
  VERSION = 'V1'
  FUNCTION = 'predict_proba'
  SOURCE = MONITOR_SOURCE
  BASELINE = MONITOR_BASELINE
  WAREHOUSE = CREDIT_RISK_STUDIO_WH
  REFRESH_INTERVAL = '1 day'
  AGGREGATION_WINDOW = '1 day'
  TIMESTAMP_COLUMN = OBS_TS
  ID_COLUMNS = ('LOAN_ID')
  PREDICTION_SCORE_COLUMNS = ('PD')
  SEGMENT_COLUMNS = ('FILE_TYPE');

-- --------------------------------------------------------------------------
-- 7. App views and write-back tables
-- --------------------------------------------------------------------------
USE SCHEMA CREDIT_RISK_STUDIO.APP;

CREATE TABLE IF NOT EXISTS EW_ACTIONS (ACCOUNT_ID STRING, ACTION STRING, NOTE STRING, PERSONA STRING, ACTED_AT TIMESTAMP_NTZ COMMENT 'UTC');
CREATE TABLE IF NOT EXISTS MODEL_APPROVALS (MODEL_VERSION STRING, DECISION STRING, NOTE STRING, APPROVER STRING, DECIDED_AT TIMESTAMP_NTZ COMMENT 'UTC');

-- Fixed PSI bins (same edges as scripts/gen-core.mjs PSI_EDGES), as [LO, HI) ranges
CREATE OR REPLACE TABLE PSI_BINS AS
WITH e AS (
  SELECT f.KEY::STRING AS FEATURE, e.INDEX AS I, e.VALUE::FLOAT AS EDGE FROM TABLE(FLATTEN(PARSE_JSON('{
    "UTILIZATION": [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9], "FICO": [600,640,670,690,710,730,750,770,800],
    "INQUIRIES_6M": [1,2,3,4], "DTI": [0.15,0.2,0.25,0.3,0.35,0.4], "PAY_RATIO_3M": [0.6,0.8,0.95,0.999],
    "APR": [0.08,0.12,0.16,0.2,0.24]}'))) f, TABLE(FLATTEN(f.VALUE)) e)
SELECT FEATURE, I AS BIN, LAG(EDGE, 1, -1e18) OVER (PARTITION BY FEATURE ORDER BY I) AS LO, EDGE AS HI FROM e
UNION ALL
SELECT FEATURE, MAX(I) + 1, MAX(EDGE), 1e18 FROM e GROUP BY FEATURE;

-- PSI per feature per month: monitoring window vs the champion's training sample.
-- (The model monitor computes PSI on the same data with MODEL_MONITOR_DRIFT_METRIC.)
CREATE OR REPLACE TABLE PSI_BY_MONTH AS
WITH obs AS (
  SELECT 'BASE' AS PERIOD, FICO, UTILIZATION, INQUIRIES_6M, DTI, PAY_RATIO_3M, APR FROM CREDIT_RISK_STUDIO.ML.MONITOR_BASELINE
  UNION ALL
  SELECT TO_CHAR(OBS_TS, 'YYYY-MM'), FICO, UTILIZATION, INQUIRIES_6M, DTI, PAY_RATIO_3M, APR FROM CREDIT_RISK_STUDIO.ML.MONITOR_SOURCE),
long AS (SELECT PERIOD, FEATURE, X FROM obs UNPIVOT (X FOR FEATURE IN (FICO, UTILIZATION, INQUIRIES_6M, DTI, PAY_RATIO_3M, APR))),
counts AS (
  SELECT l.PERIOD, l.FEATURE, b.BIN, COUNT(*) AS N
  FROM long l JOIN PSI_BINS b ON b.FEATURE = l.FEATURE AND l.X >= b.LO AND l.X < b.HI
  GROUP BY 1, 2, 3),
grid AS (SELECT p.PERIOD, b.FEATURE, b.BIN FROM (SELECT DISTINCT PERIOD FROM counts) p CROSS JOIN PSI_BINS b),
dist AS (
  SELECT g.PERIOD, g.FEATURE, g.BIN, COALESCE(c.N, 0) AS N,
    GREATEST(COALESCE(c.N, 0) / SUM(COALESCE(c.N, 0)) OVER (PARTITION BY g.PERIOD, g.FEATURE), 1e-4) AS SHARE
  FROM grid g LEFT JOIN counts c USING (PERIOD, FEATURE, BIN))
SELECT c.PERIOD AS MONTH, c.FEATURE, ROUND(SUM((c.SHARE - b.SHARE) * LN(c.SHARE / b.SHARE)), 4) AS PSI
FROM dist c JOIN dist b ON b.PERIOD = 'BASE' AND b.FEATURE = c.FEATURE AND b.BIN = c.BIN
WHERE c.PERIOD <> 'BASE'
GROUP BY 1, 2;

CREATE OR REPLACE TABLE PSI_DISTRIBUTIONS AS
SELECT FEATURE, BIN, PERIOD, N / SUM(N) OVER (PARTITION BY FEATURE, PERIOD) AS SHARE FROM (
  SELECT l.PERIOD, l.FEATURE, b.BIN, COUNT(*) AS N FROM (
    SELECT 'BASELINE' AS PERIOD, FICO, UTILIZATION, INQUIRIES_6M, DTI, PAY_RATIO_3M, APR FROM CREDIT_RISK_STUDIO.ML.MONITOR_BASELINE
    UNION ALL
    SELECT 'CURRENT', FICO, UTILIZATION, INQUIRIES_6M, DTI, PAY_RATIO_3M, APR FROM CREDIT_RISK_STUDIO.ML.MONITOR_SOURCE WHERE OBS_TS = '2026-09-01'
  ) UNPIVOT (X FOR FEATURE IN (FICO, UTILIZATION, INQUIRIES_6M, DTI, PAY_RATIO_3M, APR)) l
  JOIN PSI_BINS b ON b.FEATURE = l.FEATURE AND l.X >= b.LO AND l.X < b.HI GROUP BY 1, 2, 3);

CREATE OR REPLACE VIEW PORTFOLIO_ACTIVE AS
SELECT l.LOAN_ID, l.PRODUCT, p.BALANCE, p.DAYS_PAST_DUE,
  CASE WHEN p.DAYS_PAST_DUE = 0 THEN 'Current' WHEN p.DAYS_PAST_DUE < 30 THEN '1-29' WHEN p.DAYS_PAST_DUE < 60 THEN '30-59'
       WHEN p.DAYS_PAST_DUE < 90 THEN '60-89' ELSE '90+' END AS DPD_BUCKET
FROM CREDIT_RISK_STUDIO.RAW.PAYMENTS_MONTHLY p
JOIN CREDIT_RISK_STUDIO.RAW.LOANS l ON l.LOAN_ID = p.LOAN_ID
LEFT JOIN CREDIT_RISK_STUDIO.RAW.DEFAULTS d ON d.LOAN_ID = p.LOAN_ID
WHERE p.STATEMENT_MONTH = '2026-09-01' AND (d.DEFAULT_MONTH IS NULL OR DATEADD(MONTH, 1, d.DEFAULT_MONTH) > '2026-09-01');

CREATE OR REPLACE TABLE VINTAGE_CURVES AS
WITH v AS (
  SELECT YEAR(l.ORIGINATION_MONTH) || '-Q' || QUARTER(l.ORIGINATION_MONTH) AS VINTAGE, l.ORIGINATION_MONTH,
    DATEDIFF(MONTH, l.ORIGINATION_MONTH, d.DEFAULT_MONTH) AS DEFAULT_MOB
  FROM CREDIT_RISK_STUDIO.RAW.LOANS l LEFT JOIN CREDIT_RISK_STUDIO.RAW.DEFAULTS d ON d.LOAN_ID = l.LOAN_ID),
q AS (SELECT VINTAGE, COUNT(*) AS LOANS, MIN(DATEDIFF(MONTH, ORIGINATION_MONTH, '2026-09-01')) AS MAX_MOB FROM v GROUP BY 1),
dd AS (SELECT VINTAGE, DEFAULT_MOB AS MOB, COUNT(*) AS N FROM v WHERE DEFAULT_MOB IS NOT NULL GROUP BY 1, 2),
m AS (SELECT (ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1)::INT AS MOB FROM TABLE(GENERATOR(ROWCOUNT => 25))),
g AS (SELECT q.VINTAGE, q.LOANS, q.MAX_MOB, m.MOB, COALESCE(dd.N, 0) AS N FROM q CROSS JOIN m LEFT JOIN dd ON dd.VINTAGE = q.VINTAGE AND dd.MOB = m.MOB)
SELECT VINTAGE, LOANS, MOB, CUM_DEFAULT_RATE FROM (
  SELECT VINTAGE, LOANS, MAX_MOB, MOB, ROUND(SUM(N) OVER (PARTITION BY VINTAGE ORDER BY MOB) / LOANS, 4) AS CUM_DEFAULT_RATE FROM g)
WHERE MOB BETWEEN 3 AND MAX_MOB;

-- Monthly trend of the performing book (month 3 on book or later, not yet in default), 2025-10 to 2026-09.
CREATE OR REPLACE TABLE BOOK_TREND AS
SELECT TO_CHAR(p.STATEMENT_MONTH, 'YYYY-MM') AS MONTH, COUNT(*) AS LOANS,
  ROUND(AVG(b.REVOLVING_UTILIZATION), 4) AS AVG_UTILIZATION, ROUND(AVG(b.FICO), 1) AS AVG_FICO,
  ROUND(SUM(p.BALANCE), 2) AS BALANCE, ROUND(AVG(IFF(p.DAYS_PAST_DUE >= 30, 1, 0)), 4) AS DPD30_RATE
FROM CREDIT_RISK_STUDIO.RAW.PAYMENTS_MONTHLY p
JOIN CREDIT_RISK_STUDIO.RAW.BUREAU_SNAPSHOTS_MONTHLY b ON b.LOAN_ID = p.LOAN_ID AND b.SNAPSHOT_MONTH = p.STATEMENT_MONTH
LEFT JOIN CREDIT_RISK_STUDIO.RAW.DEFAULTS d ON d.LOAN_ID = p.LOAN_ID
WHERE p.STATEMENT_MONTH BETWEEN '2025-10-01' AND '2026-09-01' AND p.MONTHS_ON_BOOK >= 3
  AND (d.DEFAULT_MONTH IS NULL OR p.STATEMENT_MONTH < d.DEFAULT_MONTH)
GROUP BY 1;

CREATE OR REPLACE VIEW EW_QUEUE AS
SELECT s.ALIAS, s.MODEL_VERSION, l.ACCOUNT_ID, l.LOAN_ID, b.FULL_NAME AS BORROWER_NAME, b.STATE, l.PRODUCT, b.FILE_TYPE,
  TO_CHAR(l.ORIGINATION_MONTH, 'YYYY-MM') AS VINTAGE, p.BALANCE, l.APR, s.PD_PREV, s.PD, s.PD_CHANGE, s.REASONS, s.SCORED_AT,
  (l.LOAN_ID >= 2000 AND MOD(l.LOAN_ID - 2000, 1501) = 0 AND (l.LOAN_ID - 2000) / 1501 < 150) AS PLANTED
FROM CREDIT_RISK_STUDIO.ML.SCORES s
JOIN CREDIT_RISK_STUDIO.RAW.LOANS l ON l.LOAN_ID = s.LOAN_ID
JOIN CREDIT_RISK_STUDIO.RAW.BORROWERS b ON b.BORROWER_ID = l.BORROWER_ID
JOIN CREDIT_RISK_STUDIO.RAW.PAYMENTS_MONTHLY p ON p.LOAN_ID = l.LOAN_ID AND p.STATEMENT_MONTH = '2026-09-01'
WHERE s.REASONS IS NOT NULL;

-- Illustrative expected loss on the scored performing book: PD (champion) x LGD x EAD (balance).
CREATE OR REPLACE VIEW EXPECTED_LOSS AS
SELECT l.PRODUCT, COUNT(*) AS LOANS, SUM(p.BALANCE) AS EAD,
  SUM(s.PD * IFF(l.PRODUCT = 'AUTO', 0.45, 0.85) * p.BALANCE) AS EXPECTED_LOSS
FROM CREDIT_RISK_STUDIO.ML.SCORES s
JOIN CREDIT_RISK_STUDIO.RAW.LOANS l ON l.LOAN_ID = s.LOAN_ID
JOIN CREDIT_RISK_STUDIO.RAW.PAYMENTS_MONTHLY p ON p.LOAN_ID = l.LOAN_ID AND p.STATEMENT_MONTH = '2026-09-01'
WHERE s.ALIAS = 'CHAMPION'
GROUP BY 1;

-- Quick checks: these match the app's Sample-mode numbers.
SELECT COUNT(*) AS ACTIVE_LOANS, ROUND(SUM(BALANCE), 2) AS BALANCE FROM PORTFOLIO_ACTIVE;
SELECT MONTH, PSI FROM PSI_BY_MONTH WHERE FEATURE = 'UTILIZATION' ORDER BY MONTH;
SELECT MODEL_VERSION, PAYLOAD:oot:auc::FLOAT AS OOT_AUC FROM CREDIT_RISK_STUDIO.ML.MODEL_EVAL;
