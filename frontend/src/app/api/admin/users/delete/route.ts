import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!currentUser.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Permission denied: Only Super Admins can delete users' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const targetUserId = body.userId;

    if (!targetUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (targetUserId === currentUser.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own user account' },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // 1. Try calling the SECURITY DEFINER RPC
    const { data: rpcRes, error: rpcErr } = await admin.rpc('delete_user_account', {
      p_target_user_id: targetUserId,
      p_admin_id: currentUser.id,
    });

    if (!rpcErr && rpcRes) {
      if (typeof rpcRes === 'object' && (rpcRes as any).success === false) {
        return NextResponse.json(
          { error: (rpcRes as any).error || 'Failed to delete user account' },
          { status: 400 },
        );
      }
    }

    // 2. Also ensure GoTrue removes the user from auth.users via Admin API
    try {
      await admin.auth.admin.deleteUser(targetUserId);
    } catch {
      // Ignored if RPC already deleted or user was already gone
    }

    // 3. Clean up profile and relations as fallback if RPC was not yet run
    if (rpcErr) {
      await admin.from('pb_user_roles').delete().eq('user_id', targetUserId);
      await admin.from('pb_user_accounts').delete().eq('user_id', targetUserId);
      await admin.from('pb_user_presence').delete().eq('user_id', targetUserId);
      await admin.from('pb_user_profiles').delete().eq('id', targetUserId);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('User deletion error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to delete user' },
      { status: 500 },
    );
  }
}

