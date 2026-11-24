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

    if (
      !currentUser.isSuperAdmin &&
      !currentUser.permissions.global.has('manage_users') &&
      !currentUser.permissions.global.has('manage_roles')
    ) {
      return NextResponse.json(
        { error: 'Permission denied: Only Super Admins can update users' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const userId = body.userId ? String(body.userId).trim() : '';
    const displayName = body.displayName ? String(body.displayName).trim() : '';
    const email = body.email ? String(body.email).trim().toLowerCase() : '';

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 },
      );
    }

    if (!displayName) {
      return NextResponse.json(
        { error: 'Display name cannot be empty' },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // 1. Try GoTrue Admin API to update email & metadata
    try {
      await admin.auth.admin.updateUserById(userId, {
        email,
        user_metadata: { display_name: displayName },
      });
    } catch (authErr: any) {
      console.warn('[API admin/users/update] GoTrue Admin API update warning:', authErr?.message);
    }

    // 2. Call admin_update_user RPC
    const { data: rpcRes, error: rpcErr } = await admin.rpc('admin_update_user', {
      p_user_id: userId,
      p_display_name: displayName,
      p_email: email,
      p_admin_id: currentUser.id,
    });

    if (rpcErr) {
      console.error('[API admin/users/update] RPC Error:', rpcErr);
      // Fallback: direct table updates
      await admin
        .from('pb_user_profiles')
        .update({ display_name: displayName, email, updated_at: new Date().toISOString() })
        .eq('id', userId);

      await admin
        .from('pb_user_presence')
        .update({ display_name: displayName, email, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    }

    if (rpcRes && typeof rpcRes === 'object') {
      const resObj = rpcRes as any;
      if (resObj.success === false) {
        return NextResponse.json(
          { error: resObj.error || 'Failed to update user' },
          { status: 400 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        display_name: displayName,
        email,
      },
    });
  } catch (err: any) {
    console.error('[API admin/users/update] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error updating user' },
      { status: 500 },
    );
  }
}
