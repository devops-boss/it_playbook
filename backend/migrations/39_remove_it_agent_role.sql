-- ============================================================================
-- 39_remove_it_agent_role.sql
-- Remove 'IT Agent' security role and reassign any existing users to 'IT Ops Editor'
-- ============================================================================

DO $$
DECLARE
  v_it_agent_id UUID;
  v_editor_id UUID;
BEGIN
  SELECT id INTO v_it_agent_id FROM pb_roles WHERE name = 'IT Agent';
  SELECT id INTO v_editor_id FROM pb_roles WHERE name = 'IT Ops Editor';

  IF v_it_agent_id IS NOT NULL THEN
    -- 1. Reassign any users who currently hold IT Agent to IT Ops Editor
    IF v_editor_id IS NOT NULL THEN
      UPDATE pb_user_roles
      SET role_id = v_editor_id
      WHERE role_id = v_it_agent_id;

      UPDATE pb_user_profiles
      SET role = 'IT Ops Editor'
      WHERE role = 'IT Agent';
    ELSE
      DELETE FROM pb_user_roles WHERE role_id = v_it_agent_id;
    END IF;

    -- 2. Remove role permissions for IT Agent
    DELETE FROM pb_role_permissions WHERE role_id = v_it_agent_id;

    -- 3. Delete IT Agent role from pb_roles
    DELETE FROM pb_roles WHERE id = v_it_agent_id;
  END IF;
END $$;

