import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { photoUrl } = body;

    if (!photoUrl || typeof photoUrl !== 'string') {
      return NextResponse.json({ error: 'photoUrl is required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Update pb_user_profiles
    const { error: profileError } = await admin
      .from('pb_user_profiles')
      .update({ photo_url: photoUrl })
      .eq('id', user.id);

    if (profileError) {
      console.error('Error updating user profile photo:', profileError);
      return NextResponse.json({ error: 'Failed to update profile photo' }, { status: 500 });
    }

    // 2. Also update pb_user_presence if row exists
    try {
      await admin
        .from('pb_user_presence')
        .update({ photo_url: photoUrl })
        .eq('user_id', user.id);
    } catch {}

    return NextResponse.json({ success: true, photoUrl });
  } catch (err: any) {
    console.error('Error in profile-picture API:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    await admin
      .from('pb_user_profiles')
      .update({ photo_url: null })
      .eq('id', user.id);

    try {
      await admin
        .from('pb_user_presence')
        .update({ photo_url: null })
        .eq('user_id', user.id);
    } catch {}

    return NextResponse.json({ success: true, photoUrl: null });
  } catch (err: any) {
    console.error('Error removing profile photo:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
