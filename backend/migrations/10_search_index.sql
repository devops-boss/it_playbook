-- ============================================================================
-- BOS Playbook - Search index, typo tolerance and access-aware search
--
-- Migration 10 made the fuzzy matcher CORRECT. It did so by scanning a text
-- array of tokens for every scenario on every query, which cannot scale:
-- with a few hundred scenarios and a hundred tokens each, every keystroke
-- costs hundreds of thousands of trigram comparisons.
--
-- This migration replaces the array scan with a real inverted index and
-- tightens the matching rules:
--
-- 1. A TOKEN TABLE.
--    pb_scenario_tokens holds one row per distinct searchable token of a
--    scenario, with a flag saying whether the token also occurs in the
--    title. A GIN trigram index over the token column lets the planner find
--    the candidate tokens for a misspelled query term without touching the
--    scenario table.
--
-- 2. EVERY TERM MUST MATCH, AND ONE TERM MUST MATCH STRONGLY.
--    Requiring every term to match stopped "vpn conect" from returning every
--    scenario that merely mentions "connect". Requiring that at least one
--    term matches strongly (similarity 0.50 or better) when the query has
--    more than one term stops the opposite failure: a scenario that happens
--    to contain a loosely similar word riding in on a single weak match.
--    Measured against the seeded corpus, "widfi droping" scored 0.375 and
--    0.444 against the Softphone scenario but 0.375 and 0.700 against the
--    Wi-Fi scenario, so the strong-term rule keeps the right one.
--
-- 3. TYPO MATCHES ARE RANKED BY HOW CLOSE THEY ARE.
--    The rank now adds the summed similarity of the fuzzy matches, with
--    extra weight when the match landed in the title, so a scenario whose
--    title is the typo target comes first.
--
-- 4. THE RESULT SET RESPECTS ACCOUNT ACCESS.
--    search_scenarios is SECURITY DEFINER, so it reads pb_scenarios without
--    the caller's row-level policies. It now applies the same account
--    restriction that the RLS policies apply, so a user cannot read the
--    content of an account they have no access to through search.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The token index
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pb_scenario_tokens (
  scenario_id UUID NOT NULL REFERENCES pb_scenarios(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  in_title   BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (scenario_id, token)
);

COMMENT ON TABLE pb_scenario_tokens IS
  'One row per distinct searchable token of a scenario, flagged when the token also occurs in the title. Maintained by trigger. Backs typo-tolerant search.';
COMMENT ON COLUMN pb_scenario_tokens.in_title IS
  'TRUE when the token also occurs in the scenario title. Used to weight relevance towards titles.';

-- The trigram index is what makes typo tolerance affordable: the candidate
-- tokens for a misspelled term are found with an index scan, not a scan of
-- every token of every scenario.
CREATE INDEX IF NOT EXISTS idx_pb_scenario_tokens_token_trgm
  ON pb_scenario_tokens USING GIN (token gin_trgm_ops);

-- A plain index for exact token lookups (smaller and faster than trigrams
-- for equality).
CREATE INDEX IF NOT EXISTS idx_pb_scenario_tokens_token
  ON pb_scenario_tokens (token);

ALTER TABLE pb_scenario_tokens ENABLE ROW LEVEL SECURITY;

-- A user may read the tokens of the scenarios they may read. The
-- subquery inherits the SELECT policy of pb_scenarios, so the restriction
-- is applied by the parent table rather than duplicated here.
DROP POLICY IF EXISTS "view scenario tokens" ON pb_scenario_tokens;

CREATE POLICY "view scenario tokens" ON pb_scenario_tokens
FOR SELECT USING (
  EXISTS (SELECT 1 FROM pb_scenarios s WHERE s.id = pb_scenario_tokens.scenario_id)
);

-- Writes are deliberately not granted: only the trigger below maintains the
-- table, and it runs as the table owner.

-- ---------------------------------------------------------------------------
-- 2. Keeping the token index in step with the scenario
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_scenario_search_tokens()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_title_tokens TEXT[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM pb_scenario_tokens WHERE scenario_id = OLD.id;
    RETURN OLD;
  END IF;

  -- The tokens of the title, used to flag the title hits.
  v_title_tokens := ARRAY(
    SELECT x
    FROM unnest(string_to_array(coalesce(NEW.search_title, ''), ' ')) AS x
    WHERE length(x) >= 3
  );

  DELETE FROM pb_scenario_tokens WHERE scenario_id = NEW.id;

  INSERT INTO pb_scenario_tokens (scenario_id, token, in_title)
  SELECT NEW.id,
         t.token,
         (t.token = ANY (v_title_tokens))
  FROM (
    SELECT DISTINCT x AS token
    FROM unnest(string_to_array(coalesce(NEW.search_text, ''), ' ')) AS x
    WHERE length(x) >= 3
  ) t
  ON CONFLICT (scenario_id, token) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_scenario_search_tokens() IS
  'Maintains pb_scenario_tokens from the normalised projections of a scenario. SECURITY DEFINER because the table has no write policy for ordinary users.';

DROP TRIGGER IF EXISTS trg_sync_scenario_tokens ON pb_scenarios;

CREATE TRIGGER trg_sync_scenario_tokens
AFTER INSERT OR DELETE OR UPDATE OF title, summary, quick_fix, symptoms, causes, workarounds, resolutions, escalation, prevention, custom_sections, tags
ON pb_scenarios
FOR EACH ROW
EXECUTE FUNCTION sync_scenario_search_tokens();

-- The token array on pb_scenarios is superseded by the token table.
ALTER TABLE pb_scenarios DROP COLUMN IF EXISTS search_tokens;

-- The trigger that builds the projections no longer sets the dropped column.
CREATE OR REPLACE FUNCTION update_scenario_search_vector()
RETURNS TRIGGER AS $$
DECLARE
  v_body  TEXT;
  v_title TEXT;
  v_plain TEXT;
BEGIN
  -- The body of the scenario: every field a reader can search.
  v_body :=
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.summary, '') || ' ' ||
    coalesce(NEW.quick_fix, '') || ' ' ||
    coalesce(NEW.symptoms, '') || ' ' ||
    coalesce(NEW.causes, '') || ' ' ||
    coalesce(NEW.workarounds, '') || ' ' ||
    coalesce(NEW.resolutions, '') || ' ' ||
    coalesce(NEW.escalation, '') || ' ' ||
    coalesce(NEW.prevention, '') || ' ' ||
    coalesce(NEW.custom_sections::text, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '');

  -- Normalisation, in three steps:
  --   a. drop HTML tags, so markup never becomes part of a token
  --   b. drop hyphens and underscores, so "Wi-Fi" becomes "wifi"
  --   c. turn every other non-alphanumeric run into a single space
  v_plain := regexp_replace(regexp_replace(lower(v_body), '<[^>]*>', ' ', 'g'), '[-_]', '', 'g');
  v_plain := btrim(regexp_replace(v_plain, '[^a-z0-9]+', ' ', 'g'));

  NEW.search_text := v_plain;

  -- The same normalisation for the title alone, so relevance scoring can
  -- prefer a match that landed in the title over one in the body.
  v_title := regexp_replace(regexp_replace(lower(coalesce(NEW.title, '')), '<[^>]*>', ' ', 'g'), '[-_]', '', 'g');
  NEW.search_title := btrim(regexp_replace(v_title, '[^a-z0-9]+', ' ', 'g'));

  -- The search vector keeps the raw fields so the original wording is still
  -- searchable, and additionally carries the normalised title so that a
  -- query for "wifi" matches a title written as "Wi-Fi".
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.search_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.quick_fix, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.symptoms, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.causes, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.workarounds, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.resolutions, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.escalation, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(NEW.prevention, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(NEW.custom_sections::text, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'B');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rebuild the projections and the token index for every row that already
-- exists. The update fires the trigger, which recomputes search_text and
-- then rewrites the tokens.
UPDATE pb_scenarios SET title = title;

-- ---------------------------------------------------------------------------
-- 3. How similar is a query term to a document token?
-- ---------------------------------------------------------------------------
--
-- The score is zero unless the comparison is plausible:
--
--   * A term of three characters or fewer must match exactly. Trigram
--     similarity on three-character words is meaningless - the trigrams of
--     "teh" and "the" do not overlap at all - and a loose short match
--     drags in unrelated documents. "vpn" against "vdi" already scores 0.14.
--
--   * A longer term may differ in length by at most three characters, so a
--     short word cannot match a much longer one. "down" scores 0.40 against
--     "dropdown" and 0.36 against "downloads"; the cap is what rejects both.
--
-- Otherwise the score is the trigram similarity, which was measured against
-- the seeded corpus: real typos score 0.33-0.70 ("audoi"/"audio" 0.33,
-- "widfi"/"wifi" 0.38, "intrenet"/"internet" 0.38, "softphne"/"softphone"
-- 0.58) while unrelated words score 0.25 or less.
CREATE OR REPLACE FUNCTION pb_fuzzy_term_similarity(p_term TEXT, p_token TEXT)
RETURNS REAL
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN length(p_term) < 4 THEN
      CASE WHEN p_term = p_token THEN 1.0::real ELSE 0.0::real END
    WHEN abs(length(p_token) - length(p_term)) > 3 THEN
      0.0::real
    ELSE
      similarity(p_term, p_token)::real
  END
$$;

COMMENT ON FUNCTION pb_fuzzy_term_similarity(TEXT, TEXT) IS
  'Similarity of a query term to a document token, zeroed when the comparison is implausible. Short terms must match exactly; longer terms are capped to a three character length difference.';

-- Kept for callers that want a yes/no answer.
CREATE OR REPLACE FUNCTION pb_fuzzy_term_matches(p_term TEXT, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT pb_fuzzy_term_similarity(p_term, p_token) >= 0.30
$$;

COMMENT ON FUNCTION pb_fuzzy_term_matches(TEXT, TEXT) IS
  'Word-level typo tolerance. Short terms must match exactly; longer terms match on trigram similarity with a length-difference cap.';

-- ---------------------------------------------------------------------------
-- 4. Which connections may see every account?
-- ---------------------------------------------------------------------------
--
-- The RLS policies on pb_scenarios restrict what each user can read, but
-- search_scenarios is SECURITY DEFINER, so it reads the table as its owner
-- and would otherwise return scenarios for accounts the caller has no
-- access to.
--
-- Two callers are trusted with everything:
--
--   * A connection with no JWT context at all. That is a direct database
--     connection: psql, a migration, a backup, a maintenance script.
--   * The service role. It is the administrator credential used by
--     server-side code and jobs. It is never used in the browser.
--
-- Everything else - the browser, through the anon or authenticated role -
-- is restricted to the accounts the user may see.
CREATE OR REPLACE FUNCTION pb_trusted_context()
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT
    current_setting('request.jwt.claim.role', true) IS NULL
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
$$;

COMMENT ON FUNCTION pb_trusted_context() IS
  'TRUE for a direct database connection or a service-role request. Those callers are not restricted by per-user account access.';

-- ---------------------------------------------------------------------------
-- 5. The search function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION search_scenarios(
  p_query TEXT DEFAULT NULL,
  p_account_ids UUID[] DEFAULT NULL,
  p_account_match TEXT DEFAULT 'any', -- any | all | only
  p_category_ids UUID[] DEFAULT NULL,
  p_issue_type_ids UUID[] DEFAULT NULL,
  p_severity_ids UUID[] DEFAULT NULL,
  p_impact_scope_ids UUID[] DEFAULT NULL,
  p_custom_filters JSONB DEFAULT '{}'::jsonb,
  p_sort TEXT DEFAULT 'relevance',
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  summary TEXT,
  status TEXT,
  is_global BOOLEAN,
  account_id UUID,
  category_id UUID,
  issue_type_id UUID,
  severity_id UUID,
  impact_scope_id UUID,
  occurrence_count INT,
  last_occurred_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  rank REAL,
  total_count BIGINT
) AS $$
DECLARE
  v_tsquery      tsquery;
  v_tsquery_text TEXT;
  v_terms        TEXT[] := ARRAY[]::TEXT[];
  v_fuzzy_terms  TEXT[] := ARRAY[]::TEXT[];
  v_term         TEXT;
  v_group        TEXT;
  v_has_query    BOOLEAN;
  v_trusted      BOOLEAN;
  v_allowed_accounts UUID[];
BEGIN
  -- Is there a text query at all? A query made only of stopwords still
  -- counts as a query: it must not silently turn into "return everything".
  v_has_query := p_query IS NOT NULL AND btrim(p_query) <> '';

  -- ---- Which accounts may the caller see? -------------------------------
  --
  -- This is worked out once, not once per scenario. Asking
  -- has_account_access() for every row of the table turns a search into
  -- thousands of lookups against the user tables.
  v_trusted := pb_trusted_context() OR is_super_admin();

  IF v_trusted THEN
    -- A trusted caller sees every account, so the list is left empty and
    -- the filter below is skipped.
    v_allowed_accounts := ARRAY[]::UUID[];
  ELSE
    v_allowed_accounts := ARRAY(
      SELECT a.id FROM pb_accounts a WHERE has_account_access(a.id)
    );
  END IF;

  -- ---- Build the tsquery, with synonym expansion -----------------------
  --
  -- Each whitespace-separated term becomes a group. If the term is listed
  -- in pb_synonyms, its alternatives are OR-ed in, so "vpn" also matches
  -- "virtual private network", "remote access" and "tunnel". The groups
  -- are AND-ed together.
  --
  -- The query text is assembled in a loop rather than with nested
  -- aggregates, because Postgres does not allow an aggregate inside an
  -- aggregate, and a STABLE function cannot create a temp table.
  --
  -- websearch_to_tsquery returns an EMPTY tsquery for a stopword such as
  -- "down", so every candidate is filtered for emptiness before it is
  -- aggregated. Without that filter the result could end in a bare "|"
  -- and fail to cast to tsquery.
  IF v_has_query THEN
    v_terms := regexp_split_to_array(btrim(p_query), '\s+');

    v_tsquery_text := '';

    FOREACH v_term IN ARRAY v_terms LOOP
      IF v_term = '' THEN
        CONTINUE;
      END IF;

      -- The term itself, plus any synonyms an admin has registered for it.
      SELECT coalesce(
        string_agg(g, ' | ' ORDER BY g),
        ''
      )
      INTO v_group
      FROM (
        SELECT websearch_to_tsquery('english', alt)::text AS g
        FROM (
          SELECT v_term AS alt
          UNION ALL
          SELECT unnest(sy.alternatives)
          FROM pb_synonyms sy
          WHERE lower(sy.term) = lower(v_term)
        ) alts
        WHERE websearch_to_tsquery('english', alt)::text <> ''
      ) groups;

      IF v_group <> '' THEN
        IF v_tsquery_text <> '' THEN
          v_tsquery_text := v_tsquery_text || ' & ';
        END IF;
        v_tsquery_text := v_tsquery_text || '(' || v_group || ')';
      END IF;
    END LOOP;

    IF v_tsquery_text <> '' THEN
      v_tsquery := v_tsquery_text::tsquery;
    ELSE
      v_tsquery := NULL;
    END IF;

    -- The terms used for typo matching. These are normalised the same way
    -- the document tokens are, so "wi-fi" in a query meets "wifi" in the
    -- corpus.
    --
    -- Terms shorter than four characters are only kept when they are not
    -- English stopwords, so that "the" and "for" do not have to be found
    -- in every document, while "vpn" and "crm" still are.
    --
    -- A term that looks like a ticket reference is left out: ticket ids
    -- are looked up exactly, and matching them loosely would let
    -- "INC-48115" find every other "INC-48xxx" ticket.
    v_fuzzy_terms := ARRAY(
      SELECT DISTINCT lower(regexp_replace(regexp_replace(t, '[-_]', '', 'g'), '[^a-z0-9]+', '', 'g'))
      FROM unnest(v_terms) t
      WHERE length(regexp_replace(regexp_replace(t, '[-_]', '', 'g'), '[^a-z0-9]+', '', 'g')) >= 3
        AND (
          length(regexp_replace(regexp_replace(t, '[-_]', '', 'g'), '[^a-z0-9]+', '', 'g')) > 3
          OR to_tsvector('english', t) <> ''
        )
        AND t !~ '^[A-Za-z]{2,5}[-_][0-9]{3,}$'
    );
  END IF;

  RETURN QUERY
  WITH
  -- ---- Typo-tolerant matching ------------------------------------------
  --
  -- The candidate tokens for each query term are found with the trigram
  -- index. The best similarity per scenario and term is then kept, so the
  -- rules below can be expressed as simple counts.
  fuzzy AS MATERIALIZED (
    SELECT
      st.scenario_id,
      t.term,
      max(pb_fuzzy_term_similarity(t.term, st.token)) AS best_sim,
      max(CASE WHEN st.in_title
               THEN pb_fuzzy_term_similarity(t.term, st.token)
               ELSE 0.0::real END) AS title_sim
    FROM unnest(v_fuzzy_terms) AS t(term)
    JOIN pb_scenario_tokens st ON st.token % t.term
    GROUP BY st.scenario_id, t.term
  ),
  fuzzy_ok AS MATERIALIZED (
    SELECT
      f.scenario_id,
      sum(f.best_sim)::real  AS score,
      sum(f.title_sim)::real AS title_score
    FROM fuzzy f
    GROUP BY f.scenario_id
    -- Every term of the query must find a token. Requiring all of them is
    -- what stops "vpn conect" from matching a scenario that merely contains
    -- the word "connect" somewhere in its resolutions.
    HAVING count(*) FILTER (WHERE f.best_sim >= 0.30) = cardinality(v_fuzzy_terms)
       -- And when the query has more than one term, at least one of them
       -- must match strongly. A single weak match is not enough to carry a
       -- scenario into the results: "widfi droping" scores 0.375 and 0.444
       -- against the Softphone scenario but 0.375 and 0.700 against the
       -- Wi-Fi scenario, and only the latter is the one being asked for.
       AND (
         cardinality(v_fuzzy_terms) = 1
         OR count(*) FILTER (WHERE f.best_sim >= 0.50) >= 1
       )
  ),
  -- ---- The candidate set ------------------------------------------------
  --
  -- The rows that can match are worked out first, and the result set is
  -- then drawn from that set. The reason is the full text path: written
  -- as one large OR together with the other paths, the planner cannot use
  -- the search vector index and compares the search vector of every row
  -- instead. Measured against three thousand scenarios, moving the full
  -- text match into its own branch cut the search from 197ms to 86ms.
  candidates AS MATERIALIZED (
    -- Full text search. A query made only of stopwords has a NULL
    -- tsquery, so this branch contributes nothing and the query does not
    -- silently turn into "return everything".
    SELECT s.id
    FROM pb_scenarios s
    WHERE v_has_query
      AND s.deleted_at IS NULL
      AND s.status = 'published'
      AND s.search_vector @@ v_tsquery

    UNION

    -- Typo tolerance, as computed above.
    SELECT fk.scenario_id
    FROM fuzzy_ok fk

    UNION

    -- Sample ticket ids, so "INC-48115" finds the scenario. Only a term
    -- that looks like a ticket reference is tried here, so an ordinary
    -- word does not make the whole ticket table be scanned. The trigram
    -- fallback is deliberately strict as well: ticket ids in the same
    -- series share most of their trigrams, so a loose threshold would
    -- match every neighbouring reference.
    SELECT st.scenario_id
    FROM pb_sample_tickets st
    WHERE v_has_query
      AND EXISTS (
        SELECT 1
        FROM unnest(v_terms) AS t(term)
        WHERE t.term ~ '^[A-Za-z]{2,5}[-_]?[0-9]{3,}$'
          AND (
            st.ticket_id ILIKE '%' || t.term || '%'
            OR similarity(st.ticket_id, t.term) > 0.5
          )
      )
  ),
  filtered AS (
    SELECT
      s.id,
      s.title,
      s.slug,
      s.summary,
      s.status,
      s.is_global,
      s.account_id,
      s.category_id,
      s.issue_type_id,
      s.severity_id,
      s.impact_scope_id,
      s.occurrence_count,
      s.last_occurred_at,
      s.updated_at,
      (
        CASE
          WHEN v_tsquery IS NOT NULL AND s.search_vector @@ v_tsquery
            THEN ts_rank(s.search_vector, v_tsquery)
          ELSE 0
        END
        +
        -- Fuzzy matches are ranked by how close the whole query came, with
        -- extra weight for a match that landed in the title, so a scenario
        -- whose title is the typo target comes first.
        CASE
          WHEN fk.scenario_id IS NOT NULL
            THEN 0.5 * fk.score + 0.25 * fk.title_score
          ELSE 0
        END
      )::real AS rank
    FROM pb_scenarios s
    LEFT JOIN fuzzy_ok fk ON fk.scenario_id = s.id
    WHERE s.deleted_at IS NULL
      AND s.status = 'published'

      -- ---- Account access -----------------------------------------------
      --
      -- The same restriction the row-level policies apply, because this
      -- function reads the scenario table as its owner. The list of
      -- accounts the caller may see was worked out once, above.
      AND (
        v_trusted
        OR s.is_global
        OR s.account_id IS NULL
        OR s.account_id = ANY(v_allowed_accounts)
        OR EXISTS (
          SELECT 1
          FROM pb_scenario_accounts sa
          WHERE sa.scenario_id = s.id AND sa.account_id = ANY(v_allowed_accounts)
        )
      )

      -- ---- Text match ---------------------------------------------------
      --
      -- A row qualifies when it is in the candidate set worked out above:
      -- the full-text query matches it, every term of the query
      -- fuzzy-matches a token of it, or a sample ticket id matches it.
      --
      -- The test is a semi join against the candidate set rather than a
      -- set of ORs over the scenario row. That is what lets the full text
      -- branch use the search vector index on its own, instead of forcing
      -- the planner to compare the search vector of every row.
      AND (
        NOT v_has_query
        OR s.id IN (SELECT c.id FROM candidates c)
      )

      -- ---- Account filter with match mode ------------------------------
      --
      -- A scenario "applies to" an account when its primary account is that
      -- account, when it is linked to it through pb_scenario_accounts, or
      -- when it is global (a global scenario applies everywhere).
      AND (
        p_account_ids IS NULL
        OR cardinality(p_account_ids) = 0
        OR (
          CASE p_account_match
            WHEN 'all' THEN (
              -- Common to ALL selected accounts: there must be no selected
              -- account this scenario does not apply to.
              NOT EXISTS (
                SELECT 1
                FROM unnest(p_account_ids) AS sel(acct_id)
                WHERE NOT (
                  s.is_global
                  OR s.account_id = sel.acct_id
                  OR EXISTS (
                    SELECT 1
                    FROM pb_scenario_accounts sa
                    WHERE sa.scenario_id = s.id AND sa.account_id = sel.acct_id
                  )
                )
              )
            )
            WHEN 'only' THEN (
              -- Unique to exactly one of the selected accounts.
              (
                SELECT count(DISTINCT sa.account_id)
                FROM pb_scenario_accounts sa
                WHERE sa.scenario_id = s.id AND sa.account_id = ANY(p_account_ids)
              ) + (
                CASE WHEN s.account_id = ANY(p_account_ids)
                       AND NOT EXISTS (
                         SELECT 1
                         FROM pb_scenario_accounts sa
                         WHERE sa.scenario_id = s.id AND sa.account_id = ANY(p_account_ids)
                       )
                     THEN 1 ELSE 0 END
              ) = 1
            )
            ELSE (
              -- Any selected account
              s.account_id = ANY(p_account_ids)
              OR s.is_global = TRUE
              OR EXISTS (
                SELECT 1
                FROM pb_scenario_accounts sa
                WHERE sa.scenario_id = s.id AND sa.account_id = ANY(p_account_ids)
              )
            )
          END
        )
      )

      -- Category filter
      AND (p_category_ids IS NULL OR cardinality(p_category_ids) = 0 OR s.category_id IN (SELECT unnest(p_category_ids)))

      -- Issue type filter
      AND (p_issue_type_ids IS NULL OR cardinality(p_issue_type_ids) = 0 OR s.issue_type_id IN (SELECT unnest(p_issue_type_ids)))

      -- Severity filter
      AND (p_severity_ids IS NULL OR cardinality(p_severity_ids) = 0 OR s.severity_id IN (SELECT unnest(p_severity_ids)))

      -- Impact scope filter
      AND (p_impact_scope_ids IS NULL OR cardinality(p_impact_scope_ids) = 0 OR s.impact_scope_id IN (SELECT unnest(p_impact_scope_ids)))

      -- Custom criteria filters (EAV).
      -- Shape: {"<field_id>": ["<option_id>", ...]}. A bare scalar is also
      -- accepted and treated as a single-element list.
      --
      -- Semantics: within one field the values are OR-ed (match any);
      -- across different fields they are AND-ed (must satisfy all).
      AND (
        p_custom_filters IS NULL
        OR p_custom_filters = '{}'::jsonb
        OR NOT EXISTS (
          -- One subquery per field: fails if this field has no matching value
          -- jsonb_each yields columns (key, value) -- alias them explicitly.
          SELECT 1
          FROM jsonb_each(p_custom_filters) AS f(key, value)
          WHERE NOT EXISTS (
            SELECT 1
            FROM pb_scenario_criteria_values v
            WHERE v.scenario_id = s.id
              AND v.field_id = f.key::uuid
              AND (
                v.option_id::text IN (
                  SELECT jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(f.value) = 'array'
                         THEN f.value
                         ELSE jsonb_build_array(f.value) END
                  )
                )
                OR v.value_text IN (
                  SELECT jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(f.value) = 'array'
                         THEN f.value
                         ELSE jsonb_build_array(f.value) END
                  )
                )
              )
          )
        )
      )
  )
  SELECT
    f.id, f.title, f.slug, f.summary, f.status, f.is_global,
    f.account_id, f.category_id, f.issue_type_id, f.severity_id,
    f.impact_scope_id, f.occurrence_count, f.last_occurred_at,
    f.updated_at, f.rank,
    (SELECT COUNT(*) FROM filtered) AS total_count
  FROM filtered f
  -- Each ORDER BY key is a CASE that yields NULL for non-applicable sorts;
  -- NULLS LAST keeps them below the active sort key.
  ORDER BY
    CASE WHEN p_sort = 'frequency' THEN f.occurrence_count END DESC NULLS LAST,
    CASE WHEN p_sort = 'newest'    THEN f.updated_at       END DESC NULLS LAST,
    CASE WHEN p_sort = 'oldest'    THEN f.updated_at       END ASC  NULLS LAST,
    CASE WHEN p_sort = 'title'     THEN f.title            END ASC  NULLS LAST,
    CASE WHEN p_sort <> 'title' AND p_sort <> 'oldest' AND p_sort <> 'newest' AND p_sort <> 'frequency'
         THEN f.rank END DESC NULLS LAST,
    f.occurrence_count DESC,
    f.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- The token table is read by the search function only.
GRANT SELECT ON pb_scenario_tokens TO authenticated, service_role;
