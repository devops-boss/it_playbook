'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  IconArchive,
  IconDeviceFloppy,
  IconEdit,
  IconEye,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { cn, formatRelative } from '@/lib/utils';
import type { CriteriaField, Scenario, ScenarioStatus } from '@/types/database';

interface ScenarioAdminListProps {
  scenarios: Scenario[];
  fields: CriteriaField[];
  accounts: { id: string; name: string }[];
}

/**
 * The admin scenario list.
 *
 * Beyond listing, it does the two things that get tedious fast: bulk
 * criteria edits and status changes across many scenarios at once.
 */
export function ScenarioAdminList({
  scenarios,
  fields,
  accounts,
}: ScenarioAdminListProps) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [bulkField, setBulkField] = React.useState<string>('');
  const [bulkValue, setBulkValue] = React.useState<string>('');
  const [busy, setBusy] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return scenarios.filter((scenario) => {
      if (statusFilter !== 'all' && scenario.status !== statusFilter) return false;
      if (!q) return true;
      return (
        scenario.title.toLowerCase().includes(q) ||
        (scenario.summary ?? '').toLowerCase().includes(q)
      );
    });
  }, [scenarios, query, statusFilter]);

  const allSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkUpdate = async () => {
    if (selected.size === 0) return;
    if (!bulkField || !bulkValue) {
      toast.error('Pick a criterion and a value first.');
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const ids = Array.from(selected);

    const { error } = await supabase.rpc('bulk_update_scenario_criteria', {
      p_scenario_ids: ids,
      p_updates: { [bulkField]: bulkValue },
    });

    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      `Updated ${ids.length} ${ids.length === 1 ? 'scenario' : 'scenarios'}`,
    );
    setSelected(new Set());
    router.refresh();
  };

  const setStatus = async (status: ScenarioStatus) => {
    if (selected.size === 0) return;
    setBusy(true);
    const supabase = createClient();
    const ids = Array.from(selected);

    // A failure here - a row the policies refuse, a rate limit - must not be
    // reported as a success, or the list will show the old state with a
    // message saying it changed.
    const failures: string[] = [];
    for (const id of ids) {
      const { error } = await supabase.from('pb_scenarios').update({ status }).eq('id', id);
      if (error) failures.push(error.message);
    }

    setBusy(false);
    if (failures.length > 0) {
      toast.error(
        failures.length === ids.length
          ? `Could not move the scenarios: ${failures[0]}`
          : `${ids.length - failures.length} of ${ids.length} scenarios moved; the rest failed.`,
      );
      setSelected(new Set());
      router.refresh();
      return;
    }

    toast.success(`${ids.length} scenario(s) moved to ${status.replace('_', ' ')}`);
    setSelected(new Set());
    router.refresh();
  };

  const archive = async (id: string) => {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('pb_scenarios')
      .update({ status: 'archived' })
      .eq('id', id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Scenario archived');
      router.refresh();
    }
  };

  const bulkFieldLabel =
    fields.find((f) => f.id === bulkField)?.label ?? 'criterion';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter scenarios…"
          className="h-8 w-56 text-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending_review">Pending review</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => router.push('/scenarios/new')}
        >
          <IconPlus className="h-3.5 w-3.5" />
          New scenario
        </Button>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <Card className="border-primary/40">
          <CardContent className="p-3">
            <p className="mb-2 text-xs font-medium">
              {selected.size} scenario{selected.size === 1 ? '' : 's'} selected
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <p className="text-2xs text-muted-foreground">Criterion</p>
                <Select value={bulkField} onValueChange={setBulkField}>
                  <SelectTrigger className="h-8 w-48 text-xs">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-2xs text-muted-foreground">Value (id)</p>
                <Input
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder="Option id or value"
                  className="h-8 w-48 font-mono text-2xs"
                />
              </div>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={bulkUpdate}
                disabled={busy}
              >
                <IconDeviceFloppy className="h-3.5 w-3.5" />
                Set {bulkFieldLabel}
              </Button>

              <div className="ml-auto flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setStatus('published')}
                  disabled={busy}
                >
                  Publish
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setStatus('archived')}
                  disabled={busy}
                >
                  <IconArchive className="h-3.5 w-3.5" />
                  Archive
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setStatus('draft')}
                  disabled={busy}
                >
                  Move to draft
                </Button>
              </div>
            </div>
            <p className="mt-2 text-2xs text-muted-foreground">
              Bulk edits are written to the audit log with the list of affected
              scenarios.
            </p>
          </CardContent>
        </Card>
      )}

      {/* The list */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="h-3 w-3 rounded border"
                  />
                </th>
                <th className="px-2 py-2 text-left font-medium">Title</th>
                <th className="px-2 py-2 text-left font-medium">Account</th>
                <th className="px-2 py-2 text-left font-medium">Status</th>
                <th className="px-2 py-2 text-right font-medium">Occurrences</th>
                <th className="px-2 py-2 text-right font-medium">Updated</th>
                <th className="w-24 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((scenario) => {
                const account = accounts.find((a) => a.id === scenario.account_id);
                return (
                  <tr key={scenario.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(scenario.id)}
                        onChange={() => toggleOne(scenario.id)}
                        aria-label={`Select ${scenario.title}`}
                        className="h-3 w-3 rounded border"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-1.5">
                        {scenario.is_global && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">
                            Global
                          </Badge>
                        )}
                        <Link
                          href={`/scenario/${scenario.slug}`}
                          className="truncate font-medium hover:underline"
                        >
                          {scenario.title}
                        </Link>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {account?.name ?? 'Global'}
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge status={scenario.status} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {scenario.occurrence_count}
                    </td>
                    <td className="px-2 py-2 text-right text-muted-foreground">
                      {formatRelative(scenario.updated_at)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          asChild
                        >
                          <Link
                            href={`/scenarios/${scenario.id}/edit`}
                            aria-label={`Edit ${scenario.title}`}
                          >
                            <IconEdit className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          asChild
                        >
                          <Link
                            href={`/scenario/${scenario.slug}`}
                            aria-label={`Preview ${scenario.title}`}
                          >
                            <IconEye className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        {scenario.status !== 'archived' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => archive(scenario.id)}
                            disabled={busy}
                            aria-label={`Archive ${scenario.title}`}
                          >
                            <IconArchive className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">
                    No scenarios match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

export function StatusBadge({ status }: { status: ScenarioStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-4 px-1.5 text-[10px]',
        status === 'published' &&
          'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
        status === 'pending_review' &&
          'border-amber-500/40 text-amber-700 dark:text-amber-400',
        status === 'archived' && 'text-muted-foreground',
      )}
    >
      {status.replace('_', ' ')}
    </Badge>
  );
}
