'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  IconBook2,
  IconClock,
  IconEdit,
  IconFileText,
  IconLock,
  IconPlus,
  IconTrash,
  IconWorld,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import { formatRelative } from '@/lib/utils';

export interface DraftItemData {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: string;
  updated_at: string;
  created_at: string;
  created_by: string;
  account_id: string | null;
  category_id: string | null;
  is_global: boolean;
  tags?: string[] | null;
  custom_sections?: any;
  accountName?: string | null;
  categoryName?: string | null;
}

interface DraftsListProps {
  myDrafts: DraftItemData[];
  teamDrafts: DraftItemData[];
  canSeeAllDrafts: boolean;
  currentUserId: string;
}

export function DraftsList({
  myDrafts: initialMyDrafts,
  teamDrafts: initialTeamDrafts,
  canSeeAllDrafts,
  currentUserId,
}: DraftsListProps) {
  const [activeTab, setActiveTab] = React.useState<'my' | 'all'>('my');
  const [myDrafts, setMyDrafts] = React.useState<DraftItemData[]>(initialMyDrafts);
  const [teamDrafts, setTeamDrafts] = React.useState<DraftItemData[]>(initialTeamDrafts);
  const [draftToDelete, setDraftToDelete] = React.useState<DraftItemData | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const currentList = activeTab === 'my' ? myDrafts : teamDrafts;

  const confirmDelete = async () => {
    if (!draftToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/scenarios/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draftToDelete.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove draft');
      }

      toast.success('Draft removed');
      setMyDrafts((prev) => prev.filter((d) => d.id !== draftToDelete.id));
      setTeamDrafts((prev) => prev.filter((d) => d.id !== draftToDelete.id));
      setDraftToDelete(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove draft.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Tabs & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">My Drafts</h1>
            <Badge variant="secondary" className="text-2xs h-5 px-1.5 font-semibold">
              {myDrafts.length} {myDrafts.length === 1 ? 'draft' : 'drafts'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Unpublished scenarios and troubleshooting guides you are currently drafting.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canSeeAllDrafts && (
            <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('my')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  activeTab === 'my'
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                My Drafts ({myDrafts.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All Team Drafts ({teamDrafts.length})
              </button>
            </div>
          )}

          <Button asChild size="sm" className="h-8 gap-1.5 text-xs bg-[#233B74] hover:bg-[#1b2e5c] text-white">
            <Link href="/scenarios/new">
              <IconPlus className="h-3.5 w-3.5" />
              New Playbook
            </Link>
          </Button>
        </div>
      </div>

      {/* Privacy note */}
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-2xs text-muted-foreground">
        <IconLock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span>
          Drafts are private to you (and workspace administrators) until you choose to publish them to the live knowledge base.
        </span>
      </div>

      {/* Drafts List */}
      {currentList.length === 0 ? (
        <EmptyState
          icon={IconFileText}
          title={activeTab === 'my' ? 'No unpublished drafts' : 'No team drafts found'}
          description={
            activeTab === 'my'
              ? 'When you start drafting a playbook or documentation guide, it will be saved here until published.'
              : 'There are no drafts created by team members waiting for review.'
          }
          actionLabel="Create New Playbook"
          onAction={() => {
            window.location.href = '/scenarios/new';
          }}
        />
      ) : (
        <div className="grid gap-3">
          {currentList.map((draft) => {
            const rawType = (draft.custom_sections as any)?.playbook_type;
            const isDoc =
              rawType === 'documentation' ||
              rawType === 'sop' ||
              draft.tags?.includes('documentation') ||
              draft.tags?.includes('sop');

            return (
              <Card
                key={draft.id}
                className="transition-all hover:border-primary/50 group border-border/70"
              >
                <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/scenarios/${draft.id}/edit`}
                        className="font-semibold text-sm hover:text-primary transition-colors truncate text-foreground"
                      >
                        {draft.title || 'Untitled Draft'}
                      </Link>
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-muted/40 font-medium">
                        Draft
                      </Badge>
                      {isDoc ? (
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 border-blue-500/20"
                        >
                          <IconBook2 className="h-2.5 w-2.5" />
                          Documentation / SOP
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium"
                        >
                          Troubleshooting Scenario
                        </Badge>
                      )}
                    </div>

                    {draft.summary ? (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {draft.summary}
                      </p>
                    ) : (
                      <p className="text-2xs text-muted-foreground italic">
                        No description provided yet.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground pt-0.5">
                      {draft.categoryName && (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                          {draft.categoryName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        {draft.is_global ? (
                          <>
                            <IconWorld className="h-3 w-3 text-sky-500" />
                            <span>All Accounts (Global)</span>
                          </>
                        ) : draft.accountName ? (
                          <span>• {draft.accountName}</span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-1">
                        <IconClock className="h-3 w-3" />
                        Updated {formatRelative(draft.updated_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs font-medium"
                    >
                      <Link href={`/scenarios/${draft.id}/edit`}>
                        <IconEdit className="h-3.5 w-3.5" />
                        Edit Draft
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDraftToDelete(draft)}
                      title="Discard Draft"
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirmation Dialog: Delete Draft */}
      <Dialog open={Boolean(draftToDelete)} onOpenChange={(open) => !open && setDraftToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard Draft</DialogTitle>
            <DialogDescription>
              Are you sure you want to discard{' '}
              <span className="font-semibold text-foreground">
                "{draftToDelete?.title || 'Untitled Draft'}"
              </span>
              ? This draft will be removed from your drafts list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDraftToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Discarding...' : 'Discard Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

