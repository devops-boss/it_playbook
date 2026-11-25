import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ count: 0 });
    }

    const supabase = createClient();
    const { count, error } = await supabase
      .from('pb_scenarios')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft')
      .eq('created_by', user.id)
      .is('deleted_at', null);

    if (error) {
      console.warn('Error fetching drafts count:', error);
      return NextResponse.json({ count: 0 });
    }

    return NextResponse.json({ count: count ?? 0 });
  } catch (err: any) {
    console.error('API drafts/count error:', err);
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}

