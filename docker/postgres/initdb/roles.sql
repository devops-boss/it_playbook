-- ============================================================================
-- BOS Playbook - the passwords of the service roles
--
-- The other services in the stack connect to the database with their own
-- role: GoTrue as supabase_auth_admin, PostgREST as authenticator, the
-- storage service as supabase_storage_admin. They all use the password of
-- the Postgres superuser, which is kept in .env.
--
-- The list is checked against the roles that actually exist. The set of
-- roles differs between versions of the Supabase image, and a script that
-- mentions a role that is not there stops the whole database from being
-- initialised.
-- ============================================================================

\set pgpass `echo "$POSTGRES_PASSWORD"`

-- The password is put in with \gexec rather than inside a DO block,
-- because psql does not substitute a variable inside a dollar quoted
-- string.
SELECT format('ALTER ROLE %I WITH PASSWORD %L', rolname, :'pgpass')
FROM pg_roles
WHERE rolname IN (
  'authenticator',
  'pgbouncer',
  'supabase_auth_admin',
  'supabase_storage_admin',
  'supabase_functions_admin'
)
\gexec
