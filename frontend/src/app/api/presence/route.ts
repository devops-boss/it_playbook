import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function getActiveCutoff(): string {
  // 5 minutes active window (300,000 ms)
  return new Date(Date.now() - 5 * 60 * 1000).toISOString();
}

export async function GET() {
  try {
    const admin = createAdminClient();
    const serverClient = createClient();
    const cutoff = getActiveCutoff();

    let rows: any[] | null = null;

    // Try admin client first, then server client
    try {
      const { data, error } = await admin
        .from('pb_user_presence')
        .select('user_id, display_name, email, role, photo_url, last_seen_at')
        .gt('last_seen_at', cutoff)
        .order('last_seen_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        rows = data;
      }
    } catch {}

    if (!rows) {
      try {
        const { data, error } = await serverClient
          .from('pb_user_presence')
          .select('user_id, display_name, email, role, photo_url, last_seen_at')
          .gt('last_seen_at', cutoff)
          .order('last_seen_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          rows = data;
        }
      } catch {}
    }

    const users = (rows || []).map((row) => ({
      id: row.user_id,
      displayName: row.display_name || 'User',
      email: row.email,
      role: row.role || 'IT Support',
      photoUrl: row.photo_url,
      onlineAt: row.last_seen_at,
    }));

    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    console.error('[API Presence GET Error]:', err);
    return NextResponse.json({ success: false, users: [], error: err?.message });
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Body may be empty
    }

    // Resolve user: try getCurrentUser(), then fallback to supabase.auth.getUser(), then body
    let userId = body.userId;
    let userEmail = body.email;
    let displayName = body.displayName;
    let role = body.role || 'IT Support';
    let photoUrl = body.photoUrl || null;

    try {
      const user = await getCurrentUser();
      if (user) {
        userId = userId || user.id;
        userEmail = userEmail || user.email;
        displayName = displayName || user.displayName;
        if (user.roleNames && user.roleNames.length > 0) {
          role = user.roleNames[0];
        } else if (user.isSuperAdmin) {
          role = 'Super Admin';
        }
        photoUrl = photoUrl || user.photoUrl;
      }
    } catch {
      // Fallback: raw auth check
      try {
        const serverClient = createClient();
        const { data } = await serverClient.auth.getUser();
        if (data?.user) {
          userId = userId || data.user.id;
          userEmail = userEmail || data.user.email;
          displayName = displayName || data.user.user_metadata?.display_name;
        }
      } catch {}
    }

    // Must have at least user identifier
    if (!userId && !userEmail) {
      return NextResponse.json({ error: 'Unauthorized: No active user session' }, { status: 401 });
    }

    userId = String(userId || userEmail);
    displayName = displayName || (userEmail ? userEmail.split('@')[0] : 'User');

    const admin = createAdminClient();
    const serverClient = createClient();

    // 1. Try calling the RPC record_presence_heartbeat
    try {
      const { data: rpcRes, error: rpcErr } = await admin.rpc('record_presence_heartbeat', {
        p_user_id: userId,
        p_display_name: displayName,
        p_email: userEmail,
        p_role: role,
        p_photo_url: photoUrl,
      });

      if (!rpcErr && rpcRes && (rpcRes as any).success && Array.isArray((rpcRes as any).users)) {
        return NextResponse.json({ success: true, users: (rpcRes as any).users });
      }
    } catch {}

    // 2. Direct database table upsert fallback
    const presenceRecord = {
      user_id: userId,
      display_name: displayName,
      email: userEmail,
      role,
      photo_url: photoUrl,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let upserted = false;
    try {
      const { error: upsertErr } = await admin
        .from('pb_user_presence')
        .upsert(presenceRecord, { onConflict: 'user_id' });
      if (!upsertErr) upserted = true;
    } catch {}

    if (!upserted) {
      try {
        await serverClient
          .from('pb_user_presence')
          .upsert(presenceRecord, { onConflict: 'user_id' });
      } catch {}
    }

    // 3. Query all users active within 5 minutes
    const cutoff = getActiveCutoff();
    let rows: any[] | null = null;

    try {
      const { data } = await admin
        .from('pb_user_presence')
        .select('user_id, display_name, email, role, photo_url, last_seen_at')
        .gt('last_seen_at', cutoff)
        .order('last_seen_at', { ascending: false });

      if (Array.isArray(data) && data.length > 0) {
        rows = data;
      }
    } catch {}

    if (!rows) {
      try {
        const { data } = await serverClient
          .from('pb_user_presence')
          .select('user_id, display_name, email, role, photo_url, last_seen_at')
          .gt('last_seen_at', cutoff)
          .order('last_seen_at', { ascending: false });

        if (Array.isArray(data)) {
          rows = data;
        }
      } catch {}
    }

    const users = (rows || []).map((row) => ({
      id: row.user_id,
      displayName: row.display_name || 'User',
      email: row.email,
      role: row.role || 'IT Support',
      photoUrl: row.photo_url,
      onlineAt: row.last_seen_at,
    }));

    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    console.error('[API Presence POST Error]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Presence update failed', users: [] },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    let userId = body.userId;
    try {
      const user = await getCurrentUser();
      if (user) userId = user.id;
    } catch {}

    if (userId) {
      const admin = createAdminClient();
      const serverClient = createClient();
      await admin.from('pb_user_presence').delete().eq('user_id', String(userId)).catch(() => {});
      await serverClient.from('pb_user_presence').delete().eq('user_id', String(userId)).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false });
  }
}
