import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ count: 0 });
    }

    const supabase = createClient();
    const { data } = await supabase
      .from('pb_scenarios')
      .select('id')
      .eq('status', 'draft')
      .eq('created_by', user.id)
      .is('deleted_at', null);

    let count = data?.length ?? 0;

    if (count === 0) {
      // Fallback with admin client to prevent any RLS or session edge cases
      const admin = createAdminClient();
      const { data: adminData } = await admin
        .from('pb_scenarios')
        .select('id')
        .eq('status', 'draft')
        .eq('created_by', user.id)
        .is('deleted_at', null);
      count = adminData?.length ?? 0;
    }

    return NextResponse.json({ count });
  } catch (err: any) {
    console.error('API drafts/count error:', err);
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}

