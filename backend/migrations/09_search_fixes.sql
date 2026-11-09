-- ============================================================================
-- BOS Playbook - Search correctness, typo tolerance and account match modes
--
-- This migration replaces the search implementation wholesale. It fixes six
-- defects that the seeded demo content exposed.
--
-- 1. TYPO TOLERANCE WAS MEASURED AGAINST RAW HTML.
--    The content sections store rich text as HTML, so splitting the raw text
--    on whitespace produced tokens like "registration.</li></ul>",
--    "intranet," and "teams:". Those tokens never match a plausible query.
--    The fix: the trigger maintains a normalised plain-text projection of
--    every searchable field (search_text) plus a token array
--    (search_tokens). Typo matching runs against those, not the raw HTML.
--
-- 2. HYPHENS SPLIT WORDS IN TWO.
--    "Wi-Fi" tokenised to "wi" and "fi", so a query for "widfi" could not
--    find it no matter how high the similarity threshold was. The
--    normalisation removes hyphens and underscores before splitting, so
--    "Wi-Fi" becomes "wifi" and "widfi" matches it at similarity 0.375.
--
-- 3. SHORT QUERY TERMS WERE SKIPPED ENTIRELY.
--    The old rule only required query terms longer than three characters to
--    match. A search for "vpn conect" therefore only constrained on
--    "conect" and returned every scenario containing the word "connect" -
--    five results, four of them wrong. The new rule requires every term to
--    match, and terms of three characters or fewer must match exactly.
--
-- 4. THE 'all' ACCOUNT MATCH MODE WAS STILL WRONG.
--    "Common to ALL selected accounts" returned 9 scenarios where only 7
--    apply to both accounts. The old branch asked whether the scenario was
--    missing from a list that was itself built wrongly. The new branch asks
--    the direct question: is there any selected account this scenario does
--    not apply to?
--
-- 5. SYNONYM EXPANSION DROPPED STOPWORDS AND COULD PRODUCE INVALID SQL.
--    websearch_to_tsquery returns an empty tsquery for a stopword such as
--    "down". The old code aggregated those empty results into the tsquery
--    text, which could yield a trailing "|" and an invalid query. Empty
--    groups are now filtered out before the query is assembled.
--
-- 6. THE SEARCH VECTOR DID NOT CONTAIN THE HYPHENATED FORM OF A TITLE.
--    to_tsvector splits "Wi-Fi" into "wi" and "fi", so a user typing
--    "wifi" did not find the Wi-Fi scenario at all. The normalised title is
--    now indexed into the search vector as well.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalised, searchable projections
-- ---------------------------------------------------------------------------

ALTER TABLE pb_scenarios
  ADD COLUMN IF NOT EXISTS search_text   TEXT,
  ADD COLUMN IF NOT EXISTS search_title  TEXT,
  ADD COLUMN IF NOT EXISTS search_tokens TEXT[];

COMMENT ON COLUMN pb_scenarios.search_text IS
  'Normalised plain text of every searchable field: HTML stripped, lowercased, hyphens removed, punctuation collapsed to spaces. Maintained by the trigger. Used for typo-tolerant matching.';
COMMENT ON COLUMN pb_scenarios.search_tokens IS
  'Tokens of search_text (length >= 3), distinct and sorted. Used for word-level typo matching.';
COMMENT ON COLUMN pb_scenarios.search_title IS
  'Normalised form of the title. Used for relevance scoring of fuzzy matches.';

-- GIN index for exact token containment lookups.
CREATE INDEX IF NOT EXISTS idx_pb_scenarios_search_tokens
  ON pb_scenarios USING GIN(search_tokens);

-- Trigram index over the normalised text, for the typo-tolerant path.
CREATE INDEX IF NOT EXISTS idx_pb_scenarios_search_text_trgm
  ON pb_scenarios USING GIN(search_text gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. Trigger that maintains the projections
-- ---------------------------------------------------------------------------

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

  NEW.search_tokens := ARRAY(
    SELECT DISTINCT w
    FROM unnest(string_to_array(v_plain, ' ')) AS w
    WHERE length(w) >= 3
    ORDER BY w
  );

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

-- Rebuild the projections for every row that already exists.
UPDATE pb_scenarios SET title = title;

-- ---------------------------------------------------------------------------
-- 3. Word-level typo matching
-- ---------------------------------------------------------------------------

-- Does a query term match a single document token?
--
-- Terms of three characters or fewer must match exactly. Trigram
-- similarity on three-character words is too noisy to be useful: "vpn"
-- against "vdi" already scores 0.14, and the real risk is a short term
-- dragging in unrelated documents.
--
-- Longer terms match on trigram similarity. The threshold is 0.30, which
-- was measured against the seeded content: real typos score 0.33-0.70
-- ("audoi"/"audio" 0.33, "widfi"/"wifi" 0.38, "intrenet"/"internet" 0.39,
-- "softphne"/"softphone" 0.58) while unrelated words score 0.21 or less.
--
-- The length difference is capped at three characters so that a short word
-- cannot match a much longer one: "down" scores 0.40 against "dropdown"
-- and 0.36 against "downloads", and the cap is what rejects both.
CREATE OR REPLACE FUNCTION pb_fuzzy_term_matches(p_term TEXT, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN length(p_term) < 4 THEN p_term = p_token
    ELSE similarity(p_term, p_token) >= 0.30
         AND abs(length(p_token) - length(p_term)) <= 3
  END
$$;

COMMENT ON FUNCTION pb_fuzzy_term_matches(TEXT, TEXT) IS
  'Word-level typo tolerance. Short terms must match exactly; longer terms match on trigram similarity with a length-difference cap.';

-- ---------------------------------------------------------------------------
-- 4. The search function
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
  v_terms        TEXT[];
  v_fuzzy_terms  TEXT[];
  v_term         TEXT;
  v_group        TEXT;
  v_has_query    BOOLEAN;
BEGIN
  -- Is there a text query at all? A query made only of stopwords still
  -- counts as a query: it must not silently turn into "return everything".
  v_has_query := p_query IS NOT NULL AND btrim(p_query) <> '';

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
    v_fuzzy_terms := ARRAY(
      SELECT lower(regexp_replace(regexp_replace(t, '[-_]', '', 'g'), '[^a-z0-9]+', '', 'g'))
      FROM unnest(v_terms) t
      WHERE length(regexp_replace(regexp_replace(t, '[-_]', '', 'g'), '[^a-z0-9]+', '', 'g')) >= 3
        AND (
          length(regexp_replace(regexp_replace(t, '[-_]', '', 'g'), '[^a-z0-9]+', '', 'g')) > 3
          OR to_tsvector('english', t) <> ''
        )
    );
  ELSE
    v_tsquery := NULL;
    v_fuzzy_terms := ARRAY[]::TEXT[];
  END IF;

  RETURN QUERY
  WITH filtered AS (
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
        -- Fuzzy matches are ranked by how close the whole query comes to the
        -- normalised title, so a scenario whose title is the typo target
        -- comes first.
        CASE
          WHEN v_has_query AND cardinality(v_fuzzy_terms) > 0
            THEN 0.5 * word_similarity(btrim(p_query), coalesce(s.search_title, ''))
          ELSE 0
        END
      )::real AS rank
    FROM pb_scenarios s
    WHERE s.deleted_at IS NULL
      AND s.status = 'published'

      -- ---- Text match --------------------------------------------------
      --
      -- A row qualifies when the full-text query matches, when every term
      -- of the query fuzzy-matches a token of the document, or when a
      -- sample ticket id matches.
      AND (
        NOT v_has_query
        -- Full-text search. The tsquery may be NULL (a query made only of
        -- stopwords), in which case the comparison yields NULL and this
        -- branch contributes nothing.
        OR s.search_vector @@ v_tsquery
        -- Typo tolerance. EVERY term must find a token. Requiring all of
        -- them is what stops "intrenet down" from matching a scenario that
        -- merely contains the word "down" somewhere in its resolutions.
        OR (
          cardinality(v_fuzzy_terms) > 0
          AND NOT EXISTS (
            SELECT 1
            FROM unnest(v_fuzzy_terms) AS t(term)
            WHERE NOT EXISTS (
              SELECT 1
              FROM unnest(coalesce(s.search_tokens, ARRAY[]::TEXT[])) AS d(token)
              WHERE pb_fuzzy_term_matches(t.term, d.token)
            )
          )
        )
        -- Sample ticket ids, so "TKT-9001" finds the scenario.
        OR EXISTS (
          SELECT 1
          FROM pb_sample_tickets st
          WHERE st.scenario_id = s.id
            AND EXISTS (
              SELECT 1
              FROM unnest(v_terms) AS t(term)
              WHERE st.ticket_id ILIKE '%' || t.term || '%'
                 OR similarity(st.ticket_id, t.term) > 0.3
            )
        )
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

-- The account links are looked up once per scenario in the 'all' and
-- 'only' branches, so they need an index.
CREATE INDEX IF NOT EXISTS idx_pb_scenario_accounts_account
  ON pb_scenario_accounts(account_id, scenario_id);

-- A few more synonyms so the shipped demo content is findable by the words
-- people actually type. These are ordinary entries - an admin can add,
-- rename or remove them in the Settings screen.
INSERT INTO pb_synonyms (term, alternatives)
VALUES
  ('vpn', ARRAY['virtual private network', 'remote access', 'tunnel']),
  ('softphone', ARRAY['dialer', 'sip', 'phone client', 'telephony']),
  ('teams', ARRAY['ms teams', 'microsoft teams', 'chat', 'video call']),
  ('crm', ARRAY['customer relationship management', 'salesforce', 'client system']),
  ('vdi', ARRAY['citrix', 'virtual desktop', 'remote desktop', 'rdp'])
ON CONFLICT (term) DO NOTHING;
