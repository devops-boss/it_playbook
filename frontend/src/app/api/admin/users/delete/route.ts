import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
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
    const serverClient = createClient();

    // 1. Try calling the SECURITY DEFINER RPC
    const rpcPayload = {
      p_target_user_id: targetUserId,
      p_admin_id: currentUser.id,
    };

    let rpcRes: any = null;
    let rpcErr: any = null;

    try {
      const res = await admin.rpc('delete_user_account', rpcPayload);
      rpcRes = res.data;
      rpcErr = res.error;
    } catch (e) {
      rpcErr = e;
    }

    if (rpcErr || !rpcRes) {
      try {
        const res = await serverClient.rpc('delete_user_account', rpcPayload);
        if (!res.error && res.data) {
          rpcRes = res.data;
          rpcErr = null;
        }
      } catch {}
    }

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
      await admin.from('pb_user_roles').delete().eq('user_id', targetUserId).catch(() => {});
      await serverClient.from('pb_user_roles').delete().eq('user_id', targetUserId).catch(() => {});
      await admin.from('pb_user_accounts').delete().eq('user_id', targetUserId).catch(() => {});
      await serverClient.from('pb_user_accounts').delete().eq('user_id', targetUserId).catch(() => {});
      await admin.from('pb_user_presence').delete().eq('user_id', targetUserId).catch(() => {});
      await serverClient.from('pb_user_presence').delete().eq('user_id', targetUserId).catch(() => {});
      await admin.from('pb_user_profiles').delete().eq('id', targetUserId).catch(() => {});
      await serverClient.from('pb_user_profiles').delete().eq('id', targetUserId).catch(() => {});
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

