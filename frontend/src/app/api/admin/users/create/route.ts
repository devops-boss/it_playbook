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

    if (
      !currentUser.isSuperAdmin &&
      !currentUser.permissions.global.has('manage_users') &&
      !currentUser.permissions.global.has('manage_roles')
    ) {
      return NextResponse.json(
        { error: 'Permission denied: Only Super Admins can create users' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const email = body.email ? String(body.email).trim().toLowerCase() : '';
    const displayName = body.displayName ? String(body.displayName).trim() : '';
    const roleId = body.roleId ? String(body.roleId) : null;
    const password = body.password ? String(body.password) : 'hbkPmen_KuZ~JjwV4ZqB';

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const serverClient = createClient();

    // 1. Try GoTrue Admin API first so tokens and credentials initialize cleanly
    let authUserId: string | null = null;
    try {
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName || email.split('@')[0] },
      });

      if (!authErr && authData?.user) {
        authUserId = authData.user.id;
      }
    } catch {}

    // 2. Call admin_create_user RPC for guaranteed profile, role, account & identity setup
    const rpcPayload = {
      p_email: email,
      p_display_name: displayName || email.split('@')[0],
      p_role_id: roleId,
      p_password: password,
      p_admin_id: currentUser.id,
    };

    let rpcRes: any = null;
    let rpcErr: any = null;

    try {
      const res = await admin.rpc('admin_create_user', rpcPayload);
      rpcRes = res.data;
      rpcErr = res.error;
    } catch (e) {
      rpcErr = e;
    }

    if (rpcErr || !rpcRes) {
      try {
        const res = await serverClient.rpc('admin_create_user', rpcPayload);
        if (!res.error && res.data) {
          rpcRes = res.data;
          rpcErr = null;
        }
      } catch {}
    }

    if (rpcErr) {
      console.error('[API admin/users/create] RPC Error:', rpcErr);
      // Fallback: If RPC wasn't run yet, perform manual upsert with clients
      if (authUserId) {
        await admin.from('pb_user_profiles').upsert({
          id: authUserId,
          email,
          display_name: displayName || email.split('@')[0],
          is_active: true,
        }).catch(() => {});

        if (roleId) {
          await admin.from('pb_user_roles').insert({
            user_id: authUserId,
            role_id: roleId,
          }).catch(() => {});
        }

        const { data: accounts } = await admin.from('pb_accounts').select('id');
        if (accounts && accounts.length > 0) {
          const accInserts = accounts.map((a) => ({ user_id: authUserId, account_id: a.id }));
          await admin.from('pb_user_accounts').upsert(accInserts, { onConflict: 'user_id,account_id' }).catch(() => {});
        }

        return NextResponse.json({
          success: true,
          user: {
            id: authUserId,
            email,
            display_name: displayName || email.split('@')[0],
            is_active: true,
            last_login_at: null,
            role_ids: roleId ? [roleId] : [],
            account_ids: accounts?.map((a) => a.id) || [],
          },
        });
      }

      return NextResponse.json(
        { error: rpcErr?.message || 'Failed to create user' },
        { status: 500 },
      );
    }

    if (rpcRes && typeof rpcRes === 'object') {
      const resObj = rpcRes as any;
      if (resObj.success === false) {
        return NextResponse.json(
          { error: resObj.error || 'Failed to create user' },
          { status: 400 },
        );
      }

      // Fetch all accounts to return complete user object for UI
      const { data: accounts } = await admin.from('pb_accounts').select('id');
      const accountIds = (accounts || []).map((a) => a.id);

      return NextResponse.json({
        success: true,
        user: {
          id: resObj.user_id,
          email: resObj.email,
          display_name: resObj.display_name,
          is_active: true,
          last_login_at: null,
          role_ids: resObj.role_id ? [resObj.role_id] : [],
          account_ids: accountIds,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[API admin/users/create] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error creating user' },
      { status: 500 },
    );
  }
}

