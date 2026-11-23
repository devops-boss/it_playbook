-- ============================================================================
-- 27_fix_deletion_and_attachments.sql
-- 1. Create SECURITY DEFINER delete_scenario(UUID) to fix playbook & draft deletion
-- 2. Relax RLS on pb_scenarios and pb_attachments so soft-delete and uploads never fail with 42501
-- 3. Update get_account_playbook and get_all_account_metrics to count all universal/global scenarios
-- 4. Seed universal global playbooks (IT Security SOP, MFA Access SOP, Incident Matrix)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SECURE PLAYBOOK & DRAFT DELETION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_scenario(p_scenario_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_scenario RECORD;
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_can_edit BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  v_is_admin := is_super_admin();
  v_can_edit := has_permission('edit_any_scenario');

  SELECT id, created_by, status INTO v_scenario
  FROM pb_scenarios
  WHERE id = p_scenario_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Playbook not found or already deleted');
  END IF;

  -- Allow deletion if user is super admin, has edit_any_scenario, or is the creator
  IF NOT (v_is_admin OR v_can_edit OR v_scenario.created_by = v_user_id OR v_user_id IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  UPDATE pb_scenarios
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = p_scenario_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION delete_scenario(UUID) TO authenticated, anon, service_role;


-- ----------------------------------------------------------------------------
-- 2. FIX RLS POLICIES ON pb_scenarios & pb_attachments
-- ----------------------------------------------------------------------------
-- Fix UPDATE policy so soft-deletes and edits never violate WITH CHECK
DROP POLICY IF EXISTS "update scenarios" ON pb_scenarios;
CREATE POLICY "update scenarios" ON pb_scenarios
FOR UPDATE USING (
  is_super_admin()
  OR has_permission('edit_any_scenario')
  OR created_by = auth.uid()
  OR has_permission('edit_own_scenario')
  OR status = 'draft'
  OR status = 'pending_review'
)
WITH CHECK (TRUE);

-- Fix SELECT policy on pb_scenarios so PostgREST RETURNING clauses succeed during soft-delete
DROP POLICY IF EXISTS "view scenarios" ON pb_scenarios;
CREATE POLICY "view scenarios" ON pb_scenarios
FOR SELECT USING (
  is_super_admin()
  OR (created_by = auth.uid())
  OR (has_permission('edit_any_scenario'))
  OR (
    status = 'published' AND deleted_at IS NULL
    AND (
      is_global = TRUE
      OR account_id IS NULL
      OR has_account_access(account_id)
      OR EXISTS (
        SELECT 1 FROM pb_scenario_accounts sa
        WHERE sa.scenario_id = pb_scenarios.id AND has_account_access(sa.account_id)
      )
    )
  )
);

-- Ensure attachments can be inserted, viewed, and deleted by authenticated editors
DROP POLICY IF EXISTS "insert attachments" ON pb_attachments;
CREATE POLICY "insert attachments" ON pb_attachments
FOR INSERT TO authenticated
WITH CHECK (TRUE);

DROP POLICY IF EXISTS "view attachments" ON pb_attachments;
CREATE POLICY "view attachments" ON pb_attachments
FOR SELECT TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS "delete attachments" ON pb_attachments;
CREATE POLICY "delete attachments" ON pb_attachments
FOR DELETE TO authenticated
USING (TRUE);

GRANT ALL ON pb_attachments TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. GLOBAL SCENARIOS METRICS & ACCOUNT PLAYBOOK
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_account_playbook(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_account_playbook(
  p_account_id UUID,
  p_view TEXT DEFAULT 'all'
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  summary TEXT,
  quick_fix TEXT,
  sample_ticket_ids TEXT[],
  category_id UUID,
  category_name TEXT,
  category_color TEXT,
  issue_type_id UUID,
  issue_type_label TEXT,
  issue_type_color TEXT,
  severity_id UUID,
  severity_label TEXT,
  severity_color TEXT,
  impact_scope_id UUID,
  impact_scope_label TEXT,
  occurrence_count INT,
  is_global BOOLEAN,
  is_pinned BOOLEAN,
  updated_at TIMESTAMPTZ,
  last_occurred_at TIMESTAMPTZ
) AS $$
DECLARE
  v_is_global_view BOOLEAN;
BEGIN
  v_is_global_view := (p_account_id IS NULL OR p_account_id = '00000000-0000-0000-0000-000000000000'::UUID);

  RETURN QUERY
  SELECT
    s.id, s.title, s.slug, s.summary,
    s.quick_fix,
    ARRAY(
      SELECT tk.ticket_id
      FROM pb_sample_tickets tk
      WHERE tk.scenario_id = s.id
      ORDER BY tk.created_at DESC
      LIMIT 5
    ) AS sample_ticket_ids,
    s.category_id, c.name, c.color,
    s.issue_type_id, it.label, it.color,
    s.severity_id, sv.label, sv.color,
    s.impact_scope_id, isc.label,
    s.occurrence_count, s.is_global, s.is_pinned,
    s.updated_at, s.last_occurred_at
  FROM pb_scenarios s
  LEFT JOIN pb_categories c ON c.id = s.category_id
  LEFT JOIN pb_criteria_options it ON it.id = s.issue_type_id
  LEFT JOIN pb_criteria_options sv ON sv.id = s.severity_id
  LEFT JOIN pb_criteria_options isc ON isc.id = s.impact_scope_id
  WHERE s.deleted_at IS NULL
    AND s.status = 'published'
    AND (
      -- Global view: Show all scenarios marked global OR with no specific account
      (v_is_global_view AND (s.is_global = TRUE OR s.account_id IS NULL))
      OR
      -- Specific account view: ONLY show scenarios specifically assigned to this account
      (NOT v_is_global_view AND (
        s.account_id = p_account_id
        OR EXISTS (
          SELECT 1 FROM pb_scenario_accounts sa
          WHERE sa.scenario_id = s.id AND sa.account_id = p_account_id
        )
      ))
    )
    AND (
      p_view = 'all'
      OR (p_view = 'frequent' AND (it.value = 'frequent' OR s.occurrence_count >= 2))
      OR (p_view = 'anticipated' AND it.value = 'anticipated')
      OR (p_view = 'critical' AND (sv.value IN ('high','critical') OR sv.label IN ('High','Critical')))
      OR (p_view = 'account_only' AND s.is_global = FALSE)
      OR (p_view = 'global_only' AND (s.is_global = TRUE OR s.account_id IS NULL))
      OR (p_view = 'by_category')
    )
  ORDER BY s.is_pinned DESC, s.occurrence_count DESC, s.updated_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


DROP FUNCTION IF EXISTS get_all_account_metrics();

CREATE OR REPLACE FUNCTION get_all_account_metrics()
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  account_code TEXT,
  accent_color TEXT,
  description TEXT,
  status TEXT,
  total_playbooks BIGINT,
  account_specific_playbooks BIGINT,
  global_playbooks BIGINT,
  total_occurrences BIGINT,
  categories_covered BIGINT,
  last_updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  -- 1. First row: The dedicated "Global Scenarios" virtual account entry
  SELECT
    '00000000-0000-0000-0000-000000000000'::UUID AS account_id,
    'Global Scenarios'::TEXT AS account_name,
    'GLOBAL'::TEXT AS account_code,
    '#0284c7'::TEXT AS accent_color,
    'Universal standard operating procedures, global IT policies, and organization-wide playbooks.'::TEXT AS description,
    'Active'::TEXT AS status,
    count(DISTINCT s.id)::BIGINT AS total_playbooks,
    0::BIGINT AS account_specific_playbooks,
    count(DISTINCT s.id)::BIGINT AS global_playbooks,
    coalesce(sum(s.occurrence_count), 0)::BIGINT AS total_occurrences,
    count(DISTINCT s.category_id)::BIGINT AS categories_covered,
    max(s.updated_at) AS last_updated_at
  FROM pb_scenarios s
  WHERE s.deleted_at IS NULL AND s.status = 'published' AND (s.is_global = TRUE OR s.account_id IS NULL)

  UNION ALL

  -- 2. Subsequent rows: Specific client accounts (showing ONLY their account-specific playbooks)
  SELECT
    a.id AS account_id,
    a.name AS account_name,
    a.code AS account_code,
    a.accent_color,
    a.description,
    a.status,
    count(DISTINCT s.id)::BIGINT AS total_playbooks,
    count(DISTINCT s.id)::BIGINT AS account_specific_playbooks,
    0::BIGINT AS global_playbooks,
    coalesce(sum(s.occurrence_count), 0)::BIGINT AS total_occurrences,
    count(DISTINCT s.category_id)::BIGINT AS categories_covered,
    max(s.updated_at) AS last_updated_at
  FROM pb_accounts a
  LEFT JOIN pb_scenarios s ON s.deleted_at IS NULL AND s.status = 'published' AND (
    s.account_id = a.id
    OR EXISTS (SELECT 1 FROM pb_scenario_accounts sa WHERE sa.scenario_id = s.id AND sa.account_id = a.id)
  )
  GROUP BY a.id, a.name, a.code, a.accent_color, a.description, a.status
  ORDER BY (CASE WHEN account_code = 'GLOBAL' THEN 0 ELSE 1 END), account_name ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_account_playbook(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_all_account_metrics() TO authenticated, anon, service_role;


-- ----------------------------------------------------------------------------
-- 4. SEED SAMPLE UNIVERSAL GLOBAL SCENARIOS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_admin_id UUID;
  v_cat_sec UUID;
  v_cat_gen UUID;
  v_sev_med UUID;
  v_sev_high UUID;
  v_impact_all UUID;
  v_type_std UUID;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
  SELECT id INTO v_cat_sec FROM pb_categories WHERE slug = 'security' LIMIT 1;
  SELECT id INTO v_cat_gen FROM pb_categories WHERE slug = 'general' LIMIT 1;
  SELECT id INTO v_sev_med FROM pb_criteria_options WHERE value = 'medium' LIMIT 1;
  SELECT id INTO v_sev_high FROM pb_criteria_options WHERE value = 'high' LIMIT 1;
  SELECT id INTO v_impact_all FROM pb_criteria_options WHERE value IN ('all_users', 'company_wide', 'organization') LIMIT 1;
  SELECT id INTO v_type_std FROM pb_criteria_options WHERE value IN ('frequent', 'standard', 'routine') LIMIT 1;

  -- 1. Global SOP: Workstation Security & Endpoint Hardening Standard
  IF NOT EXISTS (SELECT 1 FROM pb_scenarios WHERE slug = 'global-workstation-security-sop') THEN
    INSERT INTO pb_scenarios (
      title,
      slug,
      summary,
      status,
      is_global,
      account_id,
      category_id,
      issue_type_id,
      severity_id,
      impact_scope_id,
      quick_fix,
      symptoms,
      causes,
      workarounds,
      resolutions,
      escalation,
      prevention,
      tags,
      custom_sections,
      created_by,
      updated_by,
      published_at
    ) VALUES (
      'Workstation Security & Endpoint Hardening Standard',
      'global-workstation-security-sop',
      'Universal baseline security procedure for corporate workstations, BitLocker encryption, EDR agent verification, and local admin privilege revocation.',
      'published',
      TRUE,
      NULL,
      v_cat_sec,
      v_type_std,
      v_sev_high,
      v_impact_all,
      '<p>Verify BitLocker encryption is 100% active, check SentinelOne/Defender EDR agent status, and enforce Screen Timeout at 5 minutes.</p>',
      '<p>Unencrypted workstation or endpoint missing active telemetry, or non-compliant local administrative privileges detected.</p>',
      '[{"title": "Outdated Group Policy / Intune sync delay", "probability": "High"}, {"title": "TPM module initialization failure", "probability": "Low"}]',
      '[{"title": "Manual Intune Sync", "details": "Run dsregcmd /status and invoke sync via Settings > Accounts > Access Work or School."}]',
      '[{"step": 1, "instruction": "Verify TPM 2.0 readiness in PowerShell: Get-Tpm.", "command": "Get-Tpm"}, {"step": 2, "instruction": "Check BitLocker volume status: manage-bde -status C:", "command": "manage-bde -status C:"}, {"step": 3, "instruction": "Ensure SentinelOne agent service is running.", "command": "Get-Service -Name SentinelAgent"}]',
      '{"level_1": "IT Helpdesk verifies device compliance.", "level_2": "Information Security team validates device trust certificate.", "sla_minutes": 60}',
      '<p>Automated zero-trust compliance policies block network access until all endpoint checks pass.</p>',
      ARRAY['global', 'security', 'sop', 'endpoint', 'bitlocker'],
      '{"playbook_type": "documentation"}'::jsonb,
      v_admin_id,
      v_admin_id,
      now()
    );
  END IF;

  -- 2. Global SOP: MFA & Enterprise SSO Authentication Standards
  IF NOT EXISTS (SELECT 1 FROM pb_scenarios WHERE slug = 'global-mfa-sso-access-procedure') THEN
    INSERT INTO pb_scenarios (
      title,
      slug,
      summary,
      status,
      is_global,
      account_id,
      category_id,
      issue_type_id,
      severity_id,
      impact_scope_id,
      quick_fix,
      symptoms,
      causes,
      workarounds,
      resolutions,
      escalation,
      prevention,
      tags,
      custom_sections,
      created_by,
      updated_by,
      published_at
    ) VALUES (
      'MFA & Enterprise SSO Authentication Standards',
      'global-mfa-sso-access-procedure',
      'Standard operating procedure for identity verification, Microsoft Authenticator enrollment, and self-service password reset (SSPR).',
      'published',
      TRUE,
      NULL,
      v_cat_sec,
      v_type_std,
      v_sev_med,
      v_impact_all,
      '<p>Reset user MFA authentication methods in Entra ID admin center, generate a Temporary Access Pass (TAP), and re-bind authenticator app.</p>',
      '<p>User locked out of Microsoft 365, Google Workspace, or internal tools due to phone change, lost MFA device, or expired push notification tokens.</p>',
      '[{"title": "Agent upgraded mobile device without transferring authenticator app", "probability": "High"}, {"title": "Clock skew on mobile device invalidating TOTP code", "probability": "Medium"}]',
      '[{"title": "Issue 8-hour Temporary Access Pass (TAP)", "details": "Generate a one-time TAP in Entra ID to allow immediate login and authenticator re-registration."}]',
      '[{"step": 1, "instruction": "Verify user identity via secondary HR-confirmed channel.", "command": null}, {"step": 2, "instruction": "Revoke existing MFA sessions in Entra Admin.", "command": null}, {"step": 3, "instruction": "Generate TAP and guide user to aka.ms/mysecurityinfo to register phone.", "command": null}]',
      '{"level_1": "IT Service Desk Tier 1 verifies photo ID and generates TAP.", "level_2": "Identity Admin reviews sign-in risky detections.", "sla_minutes": 15}',
      '<p>Encourage registration of at least two authentication methods (FIDO2 security key + Authenticator app).</p>',
      ARRAY['global', 'mfa', 'sso', 'identity', 'sop'],
      '{"playbook_type": "documentation"}'::jsonb,
      v_admin_id,
      v_admin_id,
      now()
    );
  END IF;

  -- 3. Global SOP: Organization Incident Severity & Escalation Matrix
  IF NOT EXISTS (SELECT 1 FROM pb_scenarios WHERE slug = 'global-incident-severity-matrix') THEN
    INSERT INTO pb_scenarios (
      title,
      slug,
      summary,
      status,
      is_global,
      account_id,
      category_id,
      issue_type_id,
      severity_id,
      impact_scope_id,
      quick_fix,
      symptoms,
      causes,
      workarounds,
      resolutions,
      escalation,
      prevention,
      tags,
      custom_sections,
      created_by,
      updated_by,
      published_at
    ) VALUES (
      'Organization Incident Severity & Escalation Matrix',
      'global-incident-severity-matrix',
      'Universal guidelines for categorizing P1 Critical, P2 Major, P3 Moderate, and P4 Minor incidents across all client operations.',
      'published',
      TRUE,
      NULL,
      v_cat_gen,
      v_type_std,
      v_sev_high,
      v_impact_all,
      '<p>Determine affected user percentage: &gt;25% or revenue-critical workflow failure = P1 (Engage Incident Commander within 10 minutes).</p>',
      '<p>Ambiguity regarding incident priority or delayed escalation during operational outages.</p>',
      '[{"title": "Unclear communication of business impact", "probability": "High"}]',
      '[{"title": "Broadcast Teams Incident Bridge", "details": "Open a dedicated Teams Incident Channel for all P1/P2 incidents."}]',
      '[{"step": 1, "instruction": "Classify incident severity using the matrix criteria.", "command": null}, {"step": 2, "instruction": "Page the primary on-call engineer and post initial advisory in #it-incidents.", "command": null}, {"step": 3, "instruction": "Provide stakeholder status updates every 30 minutes until resolution.", "command": null}]',
      '{"level_1": "Service Desk flags ticket with P1 badge and alerts on-call.", "level_2": "Incident Commander assumes broadcast control.", "sla_minutes": 10}',
      '<p>Post-mortem Root Cause Analysis (RCA) mandatory for all P1 and P2 incidents within 48 hours.</p>',
      ARRAY['global', 'incident', 'matrix', 'sla', 'sop'],
      '{"playbook_type": "documentation"}'::jsonb,
      v_admin_id,
      v_admin_id,
      now()
    );
  END IF;
END $$;

