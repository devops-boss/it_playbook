-- ============================================================================
-- BOS Playbook - Audit trail and trigger security
--
-- Two problems are fixed here.
--
-- 1. TRIGGERS THAT WRITE TABLES WERE RUNNING AS THE CALLER.
--    A trigger function without SECURITY DEFINER runs with the privileges of
--    the role that made the change, and the row-level policies then apply
--    to what the trigger writes. The tables those triggers write to have no
--    write policy for ordinary users, so the write failed:
--
--      * create_scenario_version inserts a version snapshot into pb_versions.
--        Its only write policy asks for edit_any_scenario, so an editor who
--        may edit their own scenario could not save it at all.
--      * audit_config_change inserts into pb_config_history, which has a
--        select policy only, so an administrator without the Super Admin
--        role could not rename a category.
--      * update_scenario_occurrence updates the scenario row, and the
--        update policy would reject it.
--
--    The fix is to run these triggers as the table owner. They only write
--    derived and audit data, and the change that triggered them has
--    already been authorised by the caller's own policy.
--
-- 2. THERE WAS NO GENERAL AUDIT TRAIL.
--    pb_config_history recorded configuration changes only, and nothing
--    wrote to pb_audit_log at all, so the "full audit log" the
--    specification asks for did not exist. The trigger below records every
--    insert, update and delete on the content and configuration tables.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Run the writing triggers as the table owner
-- ---------------------------------------------------------------------------

ALTER FUNCTION create_scenario_version()   SECURITY DEFINER;
ALTER FUNCTION update_scenario_occurrence() SECURITY DEFINER;
ALTER FUNCTION audit_config_change()        SECURITY DEFINER;
ALTER FUNCTION enforce_required_criteria()  SECURITY DEFINER;

-- Pin the search path so that a function body cannot be hijacked by a
-- hostile object earlier in the path.
ALTER FUNCTION create_scenario_version()    SET search_path = public, pg_temp;
ALTER FUNCTION update_scenario_occurrence() SET search_path = public, pg_temp;
ALTER FUNCTION audit_config_change()        SET search_path = public, pg_temp;
ALTER FUNCTION enforce_required_criteria()  SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2. The general audit trail
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_entity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_entity_type TEXT;
  v_action      TEXT;
  v_id_key      TEXT;
  v_id          UUID;
  v_row         JSONB;
  v_before      JSONB;
  v_after       JSONB;
BEGIN
  -- A friendlier name than the table name.
  v_entity_type := CASE TG_TABLE_NAME
    WHEN 'pb_scenarios'           THEN 'scenario'
    WHEN 'pb_playbooks'           THEN 'playbook'
    WHEN 'pb_playbook_items'      THEN 'playbook_item'
    WHEN 'pb_accounts'            THEN 'account'
    WHEN 'pb_categories'          THEN 'category'
    WHEN 'pb_criteria_fields'     THEN 'criteria_field'
    WHEN 'pb_criteria_options'    THEN 'criteria_option'
    WHEN 'pb_templates'           THEN 'template'
    WHEN 'pb_node_types'          THEN 'node_type'
    WHEN 'pb_outcomes'            THEN 'outcome'
    WHEN 'pb_settings'            THEN 'setting'
    WHEN 'pb_user_roles'          THEN 'user_role'
    WHEN 'pb_user_accounts'       THEN 'user_account'
    WHEN 'pb_scenario_accounts'   THEN 'scenario_account'
    WHEN 'pb_scenario_criteria_values' THEN 'scenario_criteria_value'
    WHEN 'pb_related_scenarios'   THEN 'related_scenario'
    ELSE regexp_replace(TG_TABLE_NAME, '^pb_', '')
  END;

  -- The column that identifies the row. The link tables have a composite
  -- primary key and no id of their own.
  v_id_key := CASE TG_TABLE_NAME
    WHEN 'pb_user_roles'        THEN 'user_id'
    WHEN 'pb_user_accounts'     THEN 'user_id'
    WHEN 'pb_scenario_accounts' THEN 'scenario_id'
    WHEN 'pb_related_scenarios' THEN 'scenario_id'
    ELSE 'id'
  END;

  v_action := lower(TG_OP);

  IF TG_OP = 'INSERT' THEN
    v_row   := to_jsonb(NEW);
    v_after := v_row;
  ELSIF TG_OP = 'DELETE' THEN
    v_row   := to_jsonb(OLD);
    v_before := v_row;
  ELSE
    -- The bookkeeping columns change on every write, including writes that
    -- change nothing else. Ignoring them means the log records real
    -- changes rather than noise.
    v_before := to_jsonb(OLD) - 'occurrence_count' - 'last_occurred_at'
                            - 'updated_at' - 'version' - 'created_at';
    v_after  := to_jsonb(NEW) - 'occurrence_count' - 'last_occurred_at'
                            - 'updated_at' - 'version' - 'created_at';

    -- Nothing worth recording.
    IF v_before = v_after THEN
      RETURN NEW;
    END IF;

    -- A status change is the interesting part of a workflow transition, so
    -- it is recorded as the action: published, archived, draft.
    IF (v_before ? 'status') AND (v_after ? 'status')
       AND v_before->>'status' IS DISTINCT FROM v_after->>'status' THEN
      v_action := v_after->>'status';
    END IF;

    v_row := to_jsonb(NEW);
  END IF;

  v_id := NULLIF(v_row ->> v_id_key, '')::uuid;

  INSERT INTO pb_audit_log (user_id, action, entity_type, entity_id, changes)
  VALUES (
    auth.uid(),
    v_action,
    v_entity_type,
    v_id,
    jsonb_strip_nulls(jsonb_build_object('before', v_before, 'after', v_after))
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION audit_entity_change() IS
  'Writes one row to pb_audit_log for every insert, update or delete on the audited tables.';

DROP TRIGGER IF EXISTS trg_audit_scenarios           ON pb_scenarios;
DROP TRIGGER IF EXISTS trg_audit_playbooks           ON pb_playbooks;
DROP TRIGGER IF EXISTS trg_audit_playbook_items      ON pb_playbook_items;
DROP TRIGGER IF EXISTS trg_audit_accounts_audit      ON pb_accounts;
DROP TRIGGER IF EXISTS trg_audit_categories_audit    ON pb_categories;
DROP TRIGGER IF EXISTS trg_audit_criteria_fields_a   ON pb_criteria_fields;
DROP TRIGGER IF EXISTS trg_audit_criteria_options_a  ON pb_criteria_options;
DROP TRIGGER IF EXISTS trg_audit_templates_audit     ON pb_templates;
DROP TRIGGER IF EXISTS trg_audit_node_types_audit   ON pb_node_types;
DROP TRIGGER IF EXISTS trg_audit_outcomes_audit     ON pb_outcomes;
DROP TRIGGER IF EXISTS trg_audit_settings_audit     ON pb_settings;
DROP TRIGGER IF EXISTS trg_audit_user_roles         ON pb_user_roles;
DROP TRIGGER IF EXISTS trg_audit_user_accounts      ON pb_user_accounts;
DROP TRIGGER IF EXISTS trg_audit_scenario_accounts   ON pb_scenario_accounts;
DROP TRIGGER IF EXISTS trg_audit_scenario_criteria   ON pb_scenario_criteria_values;
DROP TRIGGER IF EXISTS trg_audit_related_scenarios   ON pb_related_scenarios;

CREATE TRIGGER trg_audit_scenarios
AFTER INSERT OR UPDATE OR DELETE ON pb_scenarios
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_playbooks
AFTER INSERT OR UPDATE OR DELETE ON pb_playbooks
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_playbook_items
AFTER INSERT OR UPDATE OR DELETE ON pb_playbook_items
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_accounts_audit
AFTER INSERT OR UPDATE OR DELETE ON pb_accounts
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_categories_audit
AFTER INSERT OR UPDATE OR DELETE ON pb_categories
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_criteria_fields_a
AFTER INSERT OR UPDATE OR DELETE ON pb_criteria_fields
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_criteria_options_a
AFTER INSERT OR UPDATE OR DELETE ON pb_criteria_options
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_templates_audit
AFTER INSERT OR UPDATE OR DELETE ON pb_templates
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_node_types_audit
AFTER INSERT OR UPDATE OR DELETE ON pb_node_types
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_outcomes_audit
AFTER INSERT OR UPDATE OR DELETE ON pb_outcomes
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_settings_audit
AFTER INSERT OR UPDATE OR DELETE ON pb_settings
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON pb_user_roles
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_user_accounts
AFTER INSERT OR UPDATE OR DELETE ON pb_user_accounts
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_scenario_accounts
AFTER INSERT OR UPDATE OR DELETE ON pb_scenario_accounts
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_scenario_criteria
AFTER INSERT OR UPDATE OR DELETE ON pb_scenario_criteria_values
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

CREATE TRIGGER trg_audit_related_scenarios
AFTER INSERT OR UPDATE OR DELETE ON pb_related_scenarios
FOR EACH ROW EXECUTE FUNCTION audit_entity_change();

-- The audit log is written by triggers, so it needs no write policy for
-- ordinary users. Administrators read it through the existing policy.
GRANT SELECT ON pb_audit_log TO authenticated, service_role;
