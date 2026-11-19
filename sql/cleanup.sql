-- ============================================================================
-- Credit Risk Model Studio: cleanup. Drops everything sql/setup.sql created:
-- the database (tables, views, dynamic tables behind the feature views, the
-- model and its versions, the model monitor, procedures, and the task), the
-- warehouse, and the role. Nothing else is touched.
-- ============================================================================
USE ROLE CREDIT_RISK_STUDIO_ROLE;
ALTER TASK IF EXISTS CREDIT_RISK_STUDIO.ML.SCORE_PORTFOLIO_TASK SUSPEND;
DROP MODEL MONITOR IF EXISTS CREDIT_RISK_STUDIO.ML.CREDIT_DEFAULT_V1_MONITOR;

USE ROLE SYSADMIN;
DROP DATABASE IF EXISTS CREDIT_RISK_STUDIO;
DROP WAREHOUSE IF EXISTS CREDIT_RISK_STUDIO_WH;

USE ROLE ACCOUNTADMIN;
DROP ROLE IF EXISTS CREDIT_RISK_STUDIO_ROLE;
