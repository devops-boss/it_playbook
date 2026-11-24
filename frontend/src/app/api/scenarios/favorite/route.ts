import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const scenarioId = body.scenario_id;

    if (!scenarioId) {
      return NextResponse.json({ error: 'scenario_id is required' }, { status: 400 });
    }

    const supabase = createClient();

    // Check if already favorited
    const { data: existing, error: checkError } = await supabase
      .from('pb_favorites')
      .select('scenario_id')
      .eq('user_id', user.id)
      .eq('scenario_id', scenarioId)
      .maybeSingle();

    if (checkError) {
      console.error('Check favorite error:', checkError);
      throw checkError;
    }

    if (existing) {
      // Remove from favorites
      const { error: delError } = await supabase
        .from('pb_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('scenario_id', scenarioId);

      if (delError) {
        console.error('Delete favorite error:', delError);
        throw delError;
      }

      try {
        revalidatePath('/', 'layout');
        revalidatePath('/favorites');
      } catch {}

      return NextResponse.json({ success: true, isFavorite: false });
    } else {
      // Add to favorites
      const { error: insError } = await supabase
        .from('pb_favorites')
        .insert({
          user_id: user.id,
          scenario_id: scenarioId,
          created_at: new Date().toISOString(),
        });

      if (insError) {
        console.error('Insert favorite error:', insError);
        throw insError;
      }

      try {
        revalidatePath('/', 'layout');
        revalidatePath('/favorites');
      } catch {}

      return NextResponse.json({ success: true, isFavorite: true });
    }
  } catch (err: any) {
    console.error('API favorite error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to update favorite' },
      { status: 500 },
    );
  }
}

