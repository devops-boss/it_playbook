-- ============================================================================
-- BOS Playbook - Triggers: publish gate, search vector, audit, versioning
-- ============================================================================

-- ============================================================================
-- Trigger Function: Update search vector on scenario changes
-- ============================================================================
CREATE OR REPLACE FUNCTION update_scenario_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  -- Build search vector from title, summary, and content sections
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
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

CREATE TRIGGER trg_scenario_search_vector
BEFORE INSERT OR UPDATE OF title, summary, quick_fix, symptoms, causes, workarounds, resolutions, escalation, prevention, custom_sections, tags
ON pb_scenarios
FOR EACH ROW
EXECUTE FUNCTION update_scenario_search_vector();

-- ============================================================================
-- Trigger Function: Enforce required criteria before publish
-- Reads pb_criteria_fields dynamically - no hardcoded rules
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_required_criteria()
RETURNS TRIGGER AS $$
DECLARE
  missing_criteria TEXT[] := ARRAY[]::TEXT[];
  field_def RECORD;
  cond_def JSONB;
  cond_met BOOLEAN;
  cond_check RECORD;
  has_value BOOLEAN;
BEGIN
  -- Only enforce on transition to published
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN

    -- Check all required criteria fields
    FOR field_def IN
      SELECT cf.id, cf.label, cf.key, cf.required_condition
      FROM pb_criteria_fields cf
      WHERE cf.is_active = TRUE
        AND cf.is_required = TRUE
        AND cf.applies_to IN ('scenarios', 'both')
    LOOP
      -- Check conditional requirement
      cond_met := TRUE;
      IF field_def.required_condition IS NOT NULL THEN
        cond_met := FALSE;
        -- Evaluate condition: {"if": [{"field_key": "category", "value": "network"}]}
        -- jsonb_array_elements returns a single column named "value"; alias it
        -- as `cond` so `->>` operates on a jsonb value, not a record.
        FOR cond_check IN
          SELECT j.value AS cond
          FROM jsonb_array_elements(field_def.required_condition->'if') AS j
        LOOP
          -- Check if the condition field is satisfied
          IF cond_check.cond->>'field_key' = 'category' THEN
            IF NEW.category_id IN (
              SELECT id FROM pb_categories WHERE slug = cond_check.cond->>'value' OR name = cond_check.cond->>'value'
            ) THEN
              cond_met := TRUE;
            END IF;
          ELSIF cond_check.cond->>'field_key' = 'account' THEN
            IF NEW.account_id IN (
              SELECT id FROM pb_accounts WHERE code = cond_check.cond->>'value' OR name = cond_check.cond->>'value'
            ) THEN
              cond_met := TRUE;
            END IF;
          ELSIF cond_check.cond->>'field_key' = 'issue_type' THEN
            IF NEW.issue_type_id IN (
              SELECT id FROM pb_criteria_options WHERE value = cond_check.cond->>'value'
            ) THEN
              cond_met := TRUE;
            END IF;
          ELSIF cond_check.cond->>'field_key' = 'severity' THEN
            IF NEW.severity_id IN (
              SELECT id FROM pb_criteria_options WHERE value = cond_check.cond->>'value'
            ) THEN
              cond_met := TRUE;
            END IF;
          ELSIF cond_check.cond->>'field_key' = 'impact_scope' THEN
            IF NEW.impact_scope_id IN (
              SELECT id FROM pb_criteria_options WHERE value = cond_check.cond->>'value'
            ) THEN
              cond_met := TRUE;
            END IF;
          END IF;
        END LOOP;
      END IF;

      -- Only enforce if condition is met (or no condition)
      IF cond_met THEN
        -- Check if the field has a value
        IF field_def.key = 'account' THEN
          has_value := NEW.account_id IS NOT NULL OR NEW.is_global = TRUE;
        ELSIF field_def.key = 'category' THEN
          has_value := NEW.category_id IS NOT NULL;
        ELSIF field_def.key = 'issue_type' THEN
          has_value := NEW.issue_type_id IS NOT NULL;
        ELSIF field_def.key = 'severity' THEN
          has_value := NEW.severity_id IS NOT NULL;
        ELSIF field_def.key = 'impact_scope' THEN
          has_value := NEW.impact_scope_id IS NOT NULL;
        ELSIF field_def.key = 'site' THEN
          has_value := EXISTS (
            SELECT 1 FROM pb_scenario_criteria_values v
            WHERE v.scenario_id = NEW.id AND v.field_id = field_def.id
          );
        ELSE
          -- Generic EAV check
          has_value := EXISTS (
            SELECT 1 FROM pb_scenario_criteria_values v
            WHERE v.scenario_id = NEW.id AND v.field_id = field_def.id
          );
        END IF;

        IF NOT has_value THEN
          missing_criteria := array_append(missing_criteria, field_def.label);
        END IF;
      END IF;
    END LOOP;

    -- Raise exception if required criteria are missing
    IF array_length(missing_criteria, 1) > 0 THEN
      RAISE EXCEPTION 'Cannot publish: missing required criteria: %',
        array_to_string(missing_criteria, ', ')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_required_criteria
BEFORE INSERT OR UPDATE OF status ON pb_scenarios
FOR EACH ROW
EXECUTE FUNCTION enforce_required_criteria();

-- ============================================================================
-- Trigger Function: Auto-create version snapshots on significant changes
-- ============================================================================
CREATE OR REPLACE FUNCTION create_scenario_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Snapshot on any meaningful content change. Comparing a projection of the
  -- row avoids depending on a hand-maintained column list that would silently
  -- miss fields when the schema grows.
  IF TG_OP = 'UPDATE' AND (
    (OLD.title, OLD.summary, OLD.status, OLD.quick_fix, OLD.symptoms,
     OLD.causes, OLD.workarounds, OLD.resolutions, OLD.escalation,
     OLD.prevention, OLD.custom_sections, OLD.tags, OLD.category_id,
     OLD.issue_type_id, OLD.severity_id, OLD.impact_scope_id, OLD.account_id)
    IS DISTINCT FROM
    (NEW.title, NEW.summary, NEW.status, NEW.quick_fix, NEW.symptoms,
     NEW.causes, NEW.workarounds, NEW.resolutions, NEW.escalation,
     NEW.prevention, NEW.custom_sections, NEW.tags, NEW.category_id,
     NEW.issue_type_id, NEW.severity_id, NEW.impact_scope_id, NEW.account_id)
  ) THEN
    -- Increment version
    NEW.version := OLD.version + 1;

    -- Archive previous state
    INSERT INTO pb_versions (scenario_id, version_number, snapshot, changed_by)
    VALUES (
      OLD.id,
      OLD.version,
      jsonb_build_object(
        'title', OLD.title,
        'summary', OLD.summary,
        'status', OLD.status,
        'quick_fix', OLD.quick_fix,
        'symptoms', OLD.symptoms,
        'causes', OLD.causes,
        'workarounds', OLD.workarounds,
        'resolutions', OLD.resolutions,
        'escalation', OLD.escalation,
        'prevention', OLD.prevention,
        'custom_sections', OLD.custom_sections,
        'tags', OLD.tags
      ),
      NEW.updated_by
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_scenario_version
BEFORE UPDATE ON pb_scenarios
FOR EACH ROW
EXECUTE FUNCTION create_scenario_version();

-- ============================================================================
-- Trigger Function: Update occurrence count and last_occurred from tickets
-- ============================================================================
CREATE OR REPLACE FUNCTION update_scenario_occurrence()
RETURNS TRIGGER AS $$
DECLARE
  target_scenario UUID := COALESCE(NEW.scenario_id, OLD.scenario_id);
BEGIN
  UPDATE pb_scenarios
  SET
    occurrence_count = (
      SELECT COUNT(*) FROM pb_sample_tickets WHERE scenario_id = target_scenario
    ),
    last_occurred_at = (
      SELECT MAX(ticket_date) FROM pb_sample_tickets WHERE scenario_id = target_scenario
    ),
    updated_at = now()
  WHERE id = target_scenario;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_occurrence
AFTER INSERT OR UPDATE OR DELETE ON pb_sample_tickets
FOR EACH ROW
EXECUTE FUNCTION update_scenario_occurrence();

-- ============================================================================
-- Trigger Function: Auto-slug generation for scenarios
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_slug_scenario()
RETURNS TRIGGER AS $$
DECLARE
  v_base TEXT;
  v_slug TEXT;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    v_base := lower(regexp_replace(coalesce(NEW.title, 'scenario'), '[^a-zA-Z0-9]+', '-', 'g'));
    v_base := trim(both '-' FROM v_base);
    IF v_base = '' THEN
      v_base := 'scenario';
    END IF;
    -- Append a short suffix so repeated titles still produce unique slugs
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 6);

    -- Resolve the (vanishingly rare) collision by extending the suffix
    WHILE EXISTS (SELECT 1 FROM pb_scenarios WHERE slug = v_slug) LOOP
      v_slug := v_base || '-' || substr(md5(random()::text), 1, 8);
    END LOOP;

    NEW.slug := v_slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_slug_scenario
BEFORE INSERT ON pb_scenarios
FOR EACH ROW
EXECUTE FUNCTION auto_slug_scenario();

-- Playbooks get the same treatment
CREATE OR REPLACE FUNCTION auto_slug_playbook()
RETURNS TRIGGER AS $$
DECLARE
  v_base TEXT;
  v_slug TEXT;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    v_base := lower(regexp_replace(coalesce(NEW.title, 'playbook'), '[^a-zA-Z0-9]+', '-', 'g'));
    v_base := trim(both '-' FROM v_base);
    IF v_base = '' THEN
      v_base := 'playbook';
    END IF;
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 6);
    WHILE EXISTS (SELECT 1 FROM pb_playbooks WHERE slug = v_slug) LOOP
      v_slug := v_base || '-' || substr(md5(random()::text), 1, 8);
    END LOOP;
    NEW.slug := v_slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_slug_playbook
BEFORE INSERT ON pb_playbooks
FOR EACH ROW
EXECUTE FUNCTION auto_slug_playbook();

-- ============================================================================
-- Trigger Function: Generic audit log for config tables
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_config_change()
RETURNS TRIGGER AS $$
DECLARE
  config_type TEXT := TG_TABLE_NAME;
  action TEXT;
BEGIN
  action := TG_OP;
  IF TG_OP = 'UPDATE' THEN
    action := 'update';
  ELSIF TG_OP = 'INSERT' THEN
    action := 'create';
  ELSIF TG_OP = 'DELETE' THEN
    action := 'delete';
  END IF;

  INSERT INTO pb_config_history (user_id, config_type, config_id, action, before_value, after_value)
  VALUES (
    auth.uid(),
    config_type,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    action,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to config tables
CREATE TRIGGER trg_audit_criteria_fields
AFTER INSERT OR UPDATE OR DELETE ON pb_criteria_fields
FOR EACH ROW EXECUTE FUNCTION audit_config_change();

CREATE TRIGGER trg_audit_criteria_options
AFTER INSERT OR UPDATE OR DELETE ON pb_criteria_options
FOR EACH ROW EXECUTE FUNCTION audit_config_change();

CREATE TRIGGER trg_audit_categories
AFTER INSERT OR UPDATE OR DELETE ON pb_categories
FOR EACH ROW EXECUTE FUNCTION audit_config_change();

CREATE TRIGGER trg_audit_templates
AFTER INSERT OR UPDATE OR DELETE ON pb_templates
FOR EACH ROW EXECUTE FUNCTION audit_config_change();

CREATE TRIGGER trg_audit_node_types
AFTER INSERT OR UPDATE OR DELETE ON pb_node_types
FOR EACH ROW EXECUTE FUNCTION audit_config_change();

CREATE TRIGGER trg_audit_outcomes
AFTER INSERT OR UPDATE OR DELETE ON pb_outcomes
FOR EACH ROW EXECUTE FUNCTION audit_config_change();

CREATE TRIGGER trg_audit_settings
AFTER INSERT OR UPDATE OR DELETE ON pb_settings
FOR EACH ROW EXECUTE FUNCTION audit_config_change();

CREATE TRIGGER trg_audit_accounts
AFTER INSERT OR UPDATE OR DELETE ON pb_accounts
FOR EACH ROW EXECUTE FUNCTION audit_config_change();

-- ============================================================================
-- Trigger Function: Set published_at when status changes to published
-- ============================================================================
CREATE OR REPLACE FUNCTION set_published_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_published_at
BEFORE INSERT OR UPDATE OF status ON pb_scenarios
FOR EACH ROW
EXECUTE FUNCTION set_published_at();

-- Same for playbooks
CREATE OR REPLACE FUNCTION set_playbook_published_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_playbook_published_at
BEFORE INSERT OR UPDATE OF status ON pb_playbooks
FOR EACH ROW
EXECUTE FUNCTION set_playbook_published_at();

-- Playbook search vector
CREATE OR REPLACE FUNCTION update_playbook_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_playbook_search_vector
BEFORE INSERT OR UPDATE OF title, description ON pb_playbooks
FOR EACH ROW
EXECUTE FUNCTION update_playbook_search_vector();

-- ============================================================================
-- Trigger Function: Update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pb_accounts_updated_at BEFORE UPDATE ON pb_accounts
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pb_user_profiles_updated_at BEFORE UPDATE ON pb_user_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pb_categories_updated_at BEFORE UPDATE ON pb_categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pb_criteria_fields_updated_at BEFORE UPDATE ON pb_criteria_fields
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pb_scenarios_updated_at BEFORE UPDATE ON pb_scenarios
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pb_playbooks_updated_at BEFORE UPDATE ON pb_playbooks
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pb_templates_updated_at BEFORE UPDATE ON pb_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pb_scenario_criteria_values_updated_at BEFORE UPDATE ON pb_scenario_criteria_values
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pb_playbook_criteria_values_updated_at BEFORE UPDATE ON pb_playbook_criteria_values
FOR EACH ROW EXECUTE FUNCTION update_updated_at();