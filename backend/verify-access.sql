-- ============================================================================
-- BOS Playbook - Account access in search
--
-- search_scenarios is SECURITY DEFINER, so it reads the scenario table as
-- its owner rather than under the caller's row-level policies. It has to
-- apply the same restriction itself, or a user could read the content of
-- an account they have no access to simply by searching for it.
--
-- This script proves the three cases:
--
--   * a direct database connection (no JWT) sees everything,
--   * an authenticated user sees only the accounts they are granted,
--   * the service role sees everything.
--
-- It is meant to be run against a seeded database.
-- ============================================================================
\pset border 2

INSERT INTO auth.users (id, email)
VALUES ('44444444-4444-4444-4444-444444444444', 'limited@test.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pb_user_roles (user_id, role_id)
SELECT '44444444-4444-4444-4444-444444444444', id FROM pb_roles WHERE name = 'IT Agent'
ON CONFLICT DO NOTHING;

INSERT INTO pb_user_accounts (user_id, account_id)
SELECT '44444444-4444-4444-4444-444444444444', id FROM pb_accounts WHERE code = 'NWL'
ON CONFLICT DO NOTHING;

\echo '=== trusted connection (no JWT) sees every scenario ==='
SELECT count(*) AS total FROM search_scenarios(NULL);

\echo ''
\echo '=== an authenticated user granted NWL only ==='
SET request.jwt.claim.role = 'authenticated';
SET request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

SELECT count(*) AS visible FROM search_scenarios(NULL);

\echo ''
\echo '--- of which, the ones that belong to NWL (must be all of them) ---'
SELECT count(*) AS nwl_visible FROM search_scenarios(NULL)
WHERE title IN (
  SELECT s.title FROM pb_scenarios s JOIN pb_accounts a ON a.id = s.account_id WHERE a.code = 'NWL'
);

\echo ''
\echo '--- scenarios that belong to HLC alone (must be zero) ---'
SELECT count(*) AS hlc_only_visible FROM search_scenarios(NULL)
WHERE title IN (
  SELECT s.title
  FROM pb_scenarios s
  JOIN pb_accounts a ON a.id = s.account_id
  WHERE a.code = 'HLC'
    AND NOT EXISTS (
      SELECT 1 FROM pb_scenario_accounts sa
      JOIN pb_accounts a2 ON a2.id = sa.account_id
      WHERE sa.scenario_id = s.id AND a2.code = 'NWL'
    )
);

\echo ''
\echo '--- a scenario that HLC owns but NWL also uses is legitimately visible ---'
SELECT count(*) AS shared_with_nwl FROM search_scenarios(NULL)
WHERE title IN (
  SELECT s.title
  FROM pb_scenarios s
  JOIN pb_accounts a ON a.id = s.account_id
  JOIN pb_scenario_accounts sa ON sa.scenario_id = s.id
  JOIN pb_accounts a2 ON a2.id = sa.account_id
  WHERE a.code = 'HLC' AND a2.code = 'NWL'
);

\echo ''
\echo '--- the global scenarios stay visible: they apply to every account ---'
SELECT count(*) AS global_visible FROM search_scenarios(NULL)
WHERE title IN (SELECT title FROM pb_scenarios WHERE is_global);

\echo ''
\echo '=== the service role sees everything ==='
SET request.jwt.claim.role = 'service_role';
SELECT count(*) AS service_visible FROM search_scenarios(NULL);

\echo ''
\echo '=== a search cannot reach across the account boundary either ==='
SET request.jwt.claim.role = 'authenticated';
SET request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
SELECT title FROM search_scenarios('softphone') ORDER BY title;
