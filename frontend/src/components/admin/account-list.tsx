'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  IconArchive,
  IconArrowRight,
  IconEdit,
  IconPlus,
  IconSearch,
  IconTrash,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import type { Account, Category } from '@/types/database';

interface AccountListProps {
  accounts: Account[];
  categories: Category[];
  /** Scenario counts per account. */
  counts: Record<string, number>;
}

export function AccountList({ accounts, counts }: AccountListProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [targetAccount, setTargetAccount] = React.useState<Account | null>(null);
  const [actionType, setActionType] = React.useState<'archive' | 'delete' | null>(null);
  const [processing, setProcessing] = React.useState(false);

  const filtered = accounts.filter(
    (a) =>
      !search.trim() ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.code.toLowerCase().includes(search.toLowerCase()) ||
      (a.description && a.description.toLowerCase().includes(search.toLowerCase())),
  );

  const handleConfirmAction = async () => {
    if (!targetAccount || !actionType) return;
    setProcessing(true);
    const supabase = createClient();

    try {
      if (actionType === 'archive') {
        const { error } = await supabase
          .from('pb_accounts')
          .update({ status: 'Archived' })
          .eq('id', targetAccount.id);

        if (error) throw error;
        toast.success(`${targetAccount.name} archived successfully.`);
      } else if (actionType === 'delete') {
        const scenarioCount = counts[targetAccount.id] ?? 0;
        if (scenarioCount > 0) {
          toast.error(
            `Cannot delete ${targetAccount.name}: It is linked to ${scenarioCount} scenario(s). Accounts with scenarios can only be archived.`,
          );
          setProcessing(false);
          return;
        }

        const { error } = await supabase
          .from('pb_accounts')
          .delete()
          .eq('id', targetAccount.id);

        if (error) throw error;
        toast.success(`${targetAccount.name} deleted.`);
      }

      setTargetAccount(null);
      setActionType(null);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setProcessing(false);
    }
  };

  const selectedCount = targetAccount ? (counts[targetAccount.id] ?? 0) : 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Accounts</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage client accounts, brand colors, ticketing templates, and active status.
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => router.push('/admin/accounts/new')}
        >
          <IconPlus className="h-3.5 w-3.5" />
          New account
        </Button>
      </div>

      {/* Search Bar */}
      <div className="mb-4 relative">
        <IconSearch className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Filter by account name, code, or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((account) => {
          const scenarioCount = counts[account.id] ?? 0;
          return (
            <Card key={account.id}>
              <CardContent className="flex items-center gap-3 p-3.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                  style={{
                    backgroundColor: `${account.accent_color ?? '#64748b'}1a`,
                    color: account.accent_color ?? '#64748b',
                  }}
                >
                  {account.code.slice(0, 4).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/accounts/${account.code}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {account.name}
                    </Link>
                    <Badge
                      variant={account.status === 'Active' ? 'secondary' : 'outline'}
                      className="h-4 px-1.5 text-[10px]"
                    >
                      {account.status}
                    </Badge>
                    {account.is_global && (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                        Global
                      </Badge>
                    )}
                  </div>
                  {account.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {account.description}
                    </p>
                  )}
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {scenarioCount} scenarios
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => router.push(`/admin/accounts/${account.id}/edit`)}
                    aria-label={`Edit ${account.name}`}
                  >
                    <IconEdit className="h-3.5 w-3.5" />
                  </Button>

                  {account.status !== 'Archived' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                      onClick={() => {
                        setTargetAccount(account);
                        setActionType('archive');
                      }}
                      aria-label={`Archive ${account.name}`}
                      title="Archive account"
                    >
                      <IconArchive className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setTargetAccount(account);
                      setActionType('delete');
                    }}
                    aria-label={`Delete ${account.name}`}
                    title="Delete account"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </Button>

                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                    <Link href={`/accounts/${account.code}`} aria-label={`Open ${account.name}`}>
                      <IconArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg">
            No accounts match your search.
          </div>
        )}
      </div>

      {/* Impact Preview Confirmation Dialog */}
      <Dialog
        open={Boolean(targetAccount && actionType)}
        onOpenChange={(open) => {
          if (!open) {
            setTargetAccount(null);
            setActionType(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <IconAlertTriangle className="h-4 w-4 text-amber-500" />
              {actionType === 'archive'
                ? `Archive ${targetAccount?.name}`
                : `Delete ${targetAccount?.name}`}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5">
              Impact Preview for <strong className="text-foreground">{targetAccount?.name}</strong>:
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Linked scenarios:</span>
              <span className="font-semibold text-foreground">{selectedCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account code:</span>
              <span className="font-mono text-foreground">{targetAccount?.code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current status:</span>
              <span className="text-foreground">{targetAccount?.status}</span>
            </div>
          </div>

          {actionType === 'delete' && selectedCount > 0 ? (
            <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
              <strong>Action Blocked:</strong> Accounts that have scenarios can only be archived, never deleted. Please archive this account instead.
            </div>
          ) : actionType === 'archive' ? (
            <p className="text-xs text-muted-foreground">
              Archiving hides this account from active incident scenario creation and daily navigation, but keeps all {selectedCount} existing playbooks and scenarios intact.
            </p>
          ) : (
            <p className="text-xs text-destructive">
              This account has 0 scenarios and will be permanently deleted. This cannot be undone.
            </p>
          )}

          <DialogFooter className="mt-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTargetAccount(null);
                setActionType(null);
              }}
              disabled={processing}
            >
              Cancel
            </Button>
            {actionType === 'delete' && selectedCount > 0 ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => setActionType('archive')}
              >
                Switch to Archive
              </Button>
            ) : (
              <Button
                variant={actionType === 'delete' ? 'destructive' : 'default'}
                size="sm"
                onClick={handleConfirmAction}
                disabled={processing}
              >
                {processing
                  ? 'Processing...'
                  : actionType === 'archive'
                    ? 'Confirm Archive'
                    : 'Confirm Permanent Delete'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
