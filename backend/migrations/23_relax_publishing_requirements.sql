-- ============================================================================
-- BOS Playbook - Migration 23: Relax Publishing Requirements (Modular Playbooks)
-- ============================================================================

-- Redefine enforce_required_criteria() so that it ONLY enforces scenario title.
-- Quick fix, resolutions, and system criteria (category, severity, impact, account)
-- are made modular and optional, allowing troubleshooting playbooks and documentation
-- SOPs to be published with whatever sections are ready.

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_enforce_required_criteria ON pb_scenarios;
  DROP FUNCTION IF EXISTS enforce_required_criteria() CASCADE;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE OR REPLACE FUNCTION enforce_required_criteria()
RETURNS TRIGGER AS $$
DECLARE
  missing_items TEXT[] := '{}';
BEGIN
  -- Only enforce on transition to 'published'
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN

    -- Only Title is strictly mandatory across all playbook & documentation types
    IF NEW.title IS NULL OR trim(NEW.title) = '' THEN
      missing_items := array_append(missing_items, 'Title');
    END IF;

    IF cardinality(missing_items) > 0 THEN
      RAISE EXCEPTION 'Cannot publish: % item(s) missing: %',
        cardinality(missing_items),
        array_to_string(missing_items, ', ')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION enforce_required_criteria() SECURITY DEFINER;
ALTER FUNCTION enforce_required_criteria() SET search_path = public, pg_temp;

-- Ensure criteria fields are marked as modular / optional
UPDATE pb_criteria_fields
SET is_required = FALSE
WHERE is_required = TRUE;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_enforce_required_criteria ON pb_scenarios;
CREATE TRIGGER trg_enforce_required_criteria
BEFORE INSERT OR UPDATE OF status ON pb_scenarios
FOR EACH ROW
EXECUTE FUNCTION enforce_required_criteria();


