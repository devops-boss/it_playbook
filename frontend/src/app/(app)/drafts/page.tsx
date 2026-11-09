import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IconFileText, IconPlus, IconEdit, IconClock } from '@tabler/icons-react';
import { formatRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function MyDraftsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = createClient();
  const { data: drafts } = await supabase
    .from('pb_scenarios')
    .select(`
      id,
      title,
      slug,
      summary,
      quick_fix,
      status,
      updated_at,
      account_id,
      category_id,
      pb_accounts ( name ),
      pb_categories ( name )
    `)
    .eq('status', 'draft')
    .eq('created_by', user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  const draftList = drafts ?? [];

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">My Drafts</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Unpublished scenarios and troubleshooting guides you are currently writing.
            </p>
          </div>
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
            <Link href="/scenarios/new">
              <IconPlus className="h-3.5 w-3.5" />
              New Scenario
            </Link>
          </Button>
        </div>

        {draftList.length === 0 ? (
          <EmptyState
            icon={IconFileText}
            title="No unpublished drafts"
            description="When you start creating or drafting a new incident scenario, it will be saved here until published."
          />
        ) : (
          <div className="grid gap-3">
            {draftList.map((draft) => {
              const account = (draft as any).pb_accounts?.name;
              const category = (draft as any).pb_categories?.name;

              return (
                <Card key={draft.id} className="transition-all hover:border-primary/50">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="min-w-0 flex-1 pr-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/scenarios/${draft.id}/edit`}
                          className="font-semibold text-sm hover:text-primary transition-colors truncate"
                        >
                          {draft.title || 'Untitled Draft'}
                        </Link>
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-muted/40">
                          Draft
                        </Badge>
                      </div>

                      {draft.summary && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                          {draft.summary}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
                        {category && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                            {category}
                          </span>
                        )}
                        {account && <span>• {account}</span>}
                        <span className="flex items-center gap-1">
                          <IconClock className="h-3 w-3" />
                          Updated {formatRelative(draft.updated_at)}
                        </span>
                      </div>
                    </div>

                    <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs">
                      <Link href={`/scenarios/${draft.id}/edit`}>
                        <IconEdit className="h-3.5 w-3.5" />
                        Edit Draft
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
