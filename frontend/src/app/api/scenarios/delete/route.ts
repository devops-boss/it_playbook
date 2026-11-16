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
    const id = body.id;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify ownership or admin permission
    const { data: existing, error: fetchErr } = await supabase
      .from('pb_scenarios')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const canDelete =
      user.isSuperAdmin ||
      user.permissions.global.has('edit_any_scenario') ||
      existing.created_by === user.id;

    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { error: delErr } = await supabase
      .from('pb_scenarios')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (delErr) throw delErr;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('API delete error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to delete scenario' },
      { status: 500 },
    );
  }
}
