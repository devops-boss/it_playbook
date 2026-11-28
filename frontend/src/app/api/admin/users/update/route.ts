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

    if (!currentUser.isSuperAdmin || !currentUser.roleNames.includes('Super Admin')) {
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
    const serverClient = createClient();

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
    const rpcPayload = {
      p_user_id: userId,
      p_display_name: displayName,
      p_email: email,
      p_admin_id: currentUser.id,
    };

    let rpcRes: any = null;
    let rpcErr: any = null;

    try {
      const res = await admin.rpc('admin_update_user', rpcPayload);
      rpcRes = res.data;
      rpcErr = res.error;
    } catch (e) {
      rpcErr = e;
    }

    if (rpcErr || !rpcRes) {
      try {
        const res = await serverClient.rpc('admin_update_user', rpcPayload);
        if (!res.error && res.data) {
          rpcRes = res.data;
          rpcErr = null;
        }
      } catch {}
    }

    if (rpcErr) {
      console.error('[API admin/users/update] RPC Error:', rpcErr);
      // Fallback: direct table updates
      try {
        await admin
          .from('pb_user_profiles')
          .update({ display_name: displayName, email, updated_at: new Date().toISOString() })
          .eq('id', userId);
      } catch {}

      try {
        await serverClient
          .from('pb_user_profiles')
          .update({ display_name: displayName, email, updated_at: new Date().toISOString() })
          .eq('id', userId);
      } catch {}

      try {
        await admin
          .from('pb_user_presence')
          .update({ display_name: displayName, email, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } catch {}

      try {
        await serverClient
          .from('pb_user_presence')
          .update({ display_name: displayName, email, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } catch {}
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

