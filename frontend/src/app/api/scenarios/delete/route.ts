import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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

    const supabase = createClient();

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

    // Try executing the SECURITY DEFINER RPC to bypass PostgREST RETURNING RLS check
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('delete_scenario', {
      p_scenario_id: id,
    });

    if (!rpcErr && rpcRes) {
      if (typeof rpcRes === 'object' && (rpcRes as any).success === false) {
        return NextResponse.json(
          { error: (rpcRes as any).error || 'Failed to delete playbook' },
          { status: 403 },
        );
      }
      try {
        revalidatePath('/', 'layout');
      } catch {}
      return NextResponse.json({ success: true });
    }

    // Fallback: direct update if RPC is pending migration
    const { error: delErr } = await supabase
      .from('pb_scenarios')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (delErr) throw delErr;

    try {
      revalidatePath('/', 'layout');
    } catch {}
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('API delete error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to delete scenario' },
      { status: 500 },
    );
  }
}

