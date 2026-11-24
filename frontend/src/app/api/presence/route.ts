import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ users: [] });
    }

    const admin = createAdminClient();
    const ninetySecondsAgo = new Date(Date.now() - 90 * 1000).toISOString();

    const { data: presenceRows, error } = await admin
      .from('pb_user_presence')
      .select('user_id, display_name, email, role, photo_url, last_seen_at')
      .gt('last_seen_at', ninetySecondsAgo)
      .order('last_seen_at', { ascending: false });

    if (error) {
      return NextResponse.json({ users: [] });
    }

    const users = (presenceRows || []).map((row) => ({
      id: row.user_id,
      displayName: row.display_name,
      email: row.email,
      role: row.role || 'IT Support',
      photoUrl: row.photo_url,
      onlineAt: row.last_seen_at,
    }));

    return NextResponse.json({ users });
  } catch {
    return NextResponse.json({ users: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Body may be empty
    }

    const admin = createAdminClient();
    const displayName = body.displayName || user.displayName || user.email?.split('@')[0] || 'User';
    const email = body.email || user.email;
    const role =
      body.role ||
      user.roleNames[0] ||
      (user.isSuperAdmin ? 'Super Admin' : 'IT Support');
    const photoUrl = body.photoUrl || user.photoUrl || null;

    // 1. Try calling the RPC
    const { data: rpcRes, error: rpcErr } = await admin.rpc('record_presence_heartbeat', {
      p_user_id: user.id,
      p_display_name: displayName,
      p_email: email,
      p_role: role,
      p_photo_url: photoUrl,
    });

    if (!rpcErr && rpcRes && (rpcRes as any).success) {
      return NextResponse.json({ users: (rpcRes as any).users || [] });
    }

    // 2. Direct database fallback if migration is in progress
    await admin.from('pb_user_presence').upsert({
      user_id: user.id,
      display_name: displayName,
      email,
      role,
      photo_url: photoUrl,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const ninetySecondsAgo = new Date(Date.now() - 90 * 1000).toISOString();
    const { data: rows } = await admin
      .from('pb_user_presence')
      .select('user_id, display_name, email, role, photo_url, last_seen_at')
      .gt('last_seen_at', ninetySecondsAgo)
      .order('last_seen_at', { ascending: false });

    const users = (rows || []).map((row) => ({
      id: row.user_id,
      displayName: row.display_name,
      email: row.email,
      role: row.role || 'IT Support',
      photoUrl: row.photo_url,
      onlineAt: row.last_seen_at,
    }));

    return NextResponse.json({ users });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Presence update failed', users: [] },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (user) {
      const admin = createAdminClient();
      await admin.from('pb_user_presence').delete().eq('user_id', user.id);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false });
  }
}
