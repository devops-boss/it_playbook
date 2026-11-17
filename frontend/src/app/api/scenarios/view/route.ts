import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const scenarioId = body.scenario_id;

    if (!scenarioId) {
      return NextResponse.json({ success: false, error: 'scenario_id is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from('pb_view_history').insert({
      user_id: user.id,
      scenario_id: scenarioId,
      viewed_at: new Date().toISOString(),
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('API view error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to record view history' },
      { status: 500 },
    );
  }
}

