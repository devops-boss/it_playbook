import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      id: scenarioIdParam,
      payload,
      account_ids = [],
      is_global = false,
      custom_criteria = {},
      flowchart = null,
    } = body;

    if (!payload?.title || !payload.title.trim()) {
      return NextResponse.json({ error: 'A playbook title is required.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    let scenarioId = scenarioIdParam;
    let scenarioSlug = '';

    if (!scenarioId) {
      // Insert new scenario
      const { data, error } = await supabase
        .from('pb_scenarios')
        .insert({
          ...payload,
          created_by: user.id,
          updated_by: user.id,
          version: 1,
        })
        .select('id, slug')
        .single();

      if (error) throw error;
      scenarioId = data.id;
      scenarioSlug = data.slug;
    } else {
      // Update existing scenario
      const { data, error } = await supabase
        .from('pb_scenarios')
        .update({
          ...payload,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', scenarioId)
        .select('id, slug')
        .single();

      if (error) throw error;
      if (data?.slug) scenarioSlug = data.slug;
    }

    // Sync multi-account relations (pb_scenario_accounts)
    await supabase.from('pb_scenario_accounts').delete().eq('scenario_id', scenarioId);

    if (!is_global && Array.isArray(account_ids) && account_ids.length > 0) {
      const accRows = account_ids.map((accId: string) => ({
        scenario_id: scenarioId,
        account_id: accId,
      }));
      await supabase.from('pb_scenario_accounts').insert(accRows);
    }

    // Sync custom criteria (pb_scenario_criteria_values)
    if (custom_criteria && typeof custom_criteria === 'object') {
      for (const [fieldId, values] of Object.entries(custom_criteria)) {
        await supabase
          .from('pb_scenario_criteria_values')
          .delete()
          .eq('scenario_id', scenarioId)
          .eq('field_id', fieldId);

        if (Array.isArray(values)) {
          for (const value of values) {
            const isOption =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
            await supabase.from('pb_scenario_criteria_values').insert({
              scenario_id: scenarioId,
              field_id: fieldId,
              option_id: isOption ? value : null,
              value_text: isOption ? null : value,
            });
          }
        }
      }
    }

    // Sync flowchart
    if (flowchart && Array.isArray(flowchart.nodes) && flowchart.nodes.length > 0) {
      await supabase.from('pb_flowcharts').upsert(
        {
          scenario_id: scenarioId,
          nodes: flowchart.nodes,
          edges: flowchart.edges ?? [],
        },
        { onConflict: 'scenario_id' },
      );
    }

    return NextResponse.json({
      success: true,
      id: scenarioId,
      slug: scenarioSlug,
    });
  } catch (err: any) {
    console.error('API save error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to save scenario' },
      { status: 500 },
    );
  }
}

