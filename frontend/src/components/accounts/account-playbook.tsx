'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  IconArrowLeft,
  IconBolt,
  IconBook,
  IconBuildingSkyscraper,
  IconCategory,
  IconClock,
  IconFlame,
  IconPlus,
  IconSearch,
  IconWorld,
  IconX,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScenarioCard } from '@/components/scenarios/scenario-card';
import { cn, formatRelative } from '@/lib/utils';
import type { Account, AccountMetrics, AccountPlaybookRow } from '@/types/database';

interface AccountPlaybookProps {
  account: Account;
  metrics: AccountMetrics | null;
  tabs: { key: string; label: string; hidden?: boolean }[];
  views: Record<string, AccountPlaybookRow[]>;
}

export function AccountPlaybook({
  account,
  metrics,
  tabs,
  views,
}: AccountPlaybookProps) {
  const visibleTabs = tabs.filter((t) => !t.hidden);
  const [active, setActive] = React.useState(visibleTabs[0]?.key ?? 'all');
  const [searchTerm, setSearchTerm] = React.useState('');

  const rawRows = views[active] ?? [];

  // Filter rows by search term if provided
  const rows = React.useMemo(() => {
    if (!searchTerm.trim()) return rawRows;
    const term = searchTerm.toLowerCase();
    return rawRows.filter(
      (r) =>
        r.title.toLowerCase().includes(term) ||
        (r.summary && r.summary.toLowerCase().includes(term)) ||
        (r.category_name && r.category_name.toLowerCase().includes(term)) ||
        (r.sample_ticket_ids && r.sample_ticket_ids.some((t) => t.toLowerCase().includes(term))),
    );
  }, [rawRows, searchTerm]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Account Header */}
      <div className="border-b bg-card/40 px-6 py-5 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold shadow-xs"
              style={{
                backgroundColor: `${account.accent_color ?? '#233B74'}20`,
                color: account.accent_color ?? '#233B74',
                border: `2px solid ${account.accent_color ?? '#233B74'}50`,
              }}
            >
              {account.code.slice(0, 3).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-bold tracking-tight text-foreground">
                  {account.name}
                </h1>
                <Badge variant="outline" className="font-mono text-xs font-semibold">
                  {account.code}
                </Badge>
                <Badge
                  variant="secondary"
                  className={cn(
                    'h-5 px-2 text-[10px] font-semibold capitalize',
                    account.status === 'Active'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {account.status}
                </Badge>
              </div>
              {account.description && (
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {account.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="h-9 gap-1.5 bg-[#233B74] text-xs font-semibold text-white hover:bg-[#233B74]/90"
            >
              <Link href={`/scenarios/new?account_id=${account.id}`}>
                <IconPlus className="h-4 w-4" />
                New Playbook
              </Link>
            </Button>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        {metrics && (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            <div className="rounded-xl border bg-background/80 p-3">
              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <IconBook className="h-3.5 w-3.5 text-primary" />
                Total Playbooks
              </div>
              <p className="mt-1 text-xl font-bold tracking-tight text-foreground">
                {metrics.total_playbooks}
              </p>
            </div>

            <div className="rounded-xl border bg-background/80 p-3">
              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <IconBuildingSkyscraper className="h-3.5 w-3.5 text-[#288FC2]" />
                Dedicated
              </div>
              <p className="mt-1 text-xl font-bold tracking-tight text-[#288FC2]">
                {metrics.account_specific_playbooks}
              </p>
            </div>

            <div className="rounded-xl border bg-background/80 p-3">
              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <IconWorld className="h-3.5 w-3.5 text-emerald-600" />
                Global SOPs
              </div>
              <p className="mt-1 text-xl font-bold tracking-tight text-emerald-600">
                {metrics.global_playbooks}
              </p>
            </div>

            <div className="rounded-xl border bg-background/80 p-3">
              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <IconFlame className="h-3.5 w-3.5 text-orange-500" />
                Incidents Logged
              </div>
              <p className="mt-1 text-xl font-bold tracking-tight text-foreground">
                {metrics.total_occurrences}
              </p>
            </div>

            <div className="rounded-xl border bg-background/80 p-3 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <IconCategory className="h-3.5 w-3.5 text-[#E07E3C]" />
                Categories
              </div>
              <p className="mt-1 text-xl font-bold tracking-tight text-foreground">
                {metrics.categories_covered}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs & Search Filter Header */}
      <Tabs
        value={active}
        onValueChange={setActive}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex flex-col gap-3 border-b bg-card/20 px-6 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="h-9 justify-start gap-1 bg-transparent p-0">
            {visibleTabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="h-8 rounded-lg px-3 text-xs font-semibold data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
              >
                {tab.label}
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.2 text-[10px] tabular-nums text-muted-foreground">
                  {(views[tab.key] ?? []).length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Inline Search */}
          <div className="relative w-full sm:w-64">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Filter ${account.name} playbooks...`}
              className="h-8 pl-8 pr-7 text-xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {rows.length === 0 ? (
            <EmptyTab
              tab={visibleTabs.find((t) => t.key === active)?.label ?? 'This view'}
              accountName={account.name}
              accountId={account.id}
            />
          ) : active === 'by_category' ? (
            <ByCategoryView rows={rows} />
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <ScenarioCard
                  key={row.id}
                  id={row.id}
                  title={row.title}
                  slug={row.slug}
                  summary={row.summary}
                  quickFix={row.quick_fix}
                  sampleTicketIds={row.sample_ticket_ids}
                  searchQuery={searchTerm}
                  accountName={row.is_global ? null : account.name}
                  occurrenceCount={row.occurrence_count}
                  lastOccurredAt={row.last_occurred_at}
                  updatedAt={row.updated_at}
                  isGlobal={row.is_global}
                  status="published"
                  chips={rowChips(row)}
                />
              ))}
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}

function rowChips(row: AccountPlaybookRow) {
  const chips: {
    key: string;
    fieldId: string;
    fieldKey: string;
    fieldLabel: string;
    optionId: string | null;
    label: string;
    color: string | null;
    isFreeText: boolean;
  }[] = [];

  if (row.category_id) {
    chips.push({
      key: `category:${row.category_id}`,
      fieldId: row.category_id,
      fieldKey: 'category',
      fieldLabel: 'Category',
      optionId: row.category_id,
      label: row.category_name ?? 'Category',
      color: row.category_color,
      isFreeText: false,
    });
  }
  if (row.issue_type_id) {
    chips.push({
      key: `issue_type:${row.issue_type_id}`,
      fieldId: row.issue_type_id,
      fieldKey: 'issue_type',
      fieldLabel: 'Issue Type',
      optionId: row.issue_type_id,
      label: row.issue_type_label ?? 'Issue type',
      color: row.issue_type_color,
      isFreeText: false,
    });
  }
  if (row.severity_id) {
    chips.push({
      key: `severity:${row.severity_id}`,
      fieldId: row.severity_id,
      fieldKey: 'severity',
      fieldLabel: 'Severity',
      optionId: row.severity_id,
      label: row.severity_label ?? 'Severity',
      color: row.severity_color,
      isFreeText: false,
    });
  }
  return chips;
}

/** The "By category" tab groups scenarios under their category */
function ByCategoryView({ rows }: { rows: AccountPlaybookRow[] }) {
  const grouped = React.useMemo(() => {
    const map = new Map<
      string,
      { name: string; color: string | null; rows: AccountPlaybookRow[] }
    >();
    for (const row of rows) {
      const key = row.category_id ?? 'uncategorised';
      const entry = map.get(key) ?? {
        name: row.category_name ?? 'Uncategorised',
        color: row.category_color,
        rows: [],
      };
      entry.rows.push(row);
      map.set(key, entry);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    );
  }, [rows]);

  return (
    <div className="space-y-6">
      {grouped.map(([key, group]) => (
        <section key={key} className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: group.color ?? '#233B74' }}
              aria-hidden
            />
            <h3 className="text-sm font-bold text-foreground">
              {group.name}
            </h3>
            <Badge variant="secondary" className="h-5 px-1.5 text-2xs tabular-nums">
              {group.rows.length} {group.rows.length === 1 ? 'playbook' : 'playbooks'}
            </Badge>
          </div>
          <div className="space-y-3">
            {group.rows.map((row) => (
              <ScenarioCard
                key={row.id}
                id={row.id}
                title={row.title}
                slug={row.slug}
                summary={row.summary}
                quickFix={row.quick_fix}
                sampleTicketIds={row.sample_ticket_ids}
                occurrenceCount={row.occurrence_count}
                lastOccurredAt={row.last_occurred_at}
                updatedAt={row.updated_at}
                isGlobal={row.is_global}
                status="published"
                chips={rowChips(row)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EmptyTab({
  tab,
  accountName,
  accountId,
}: {
  tab: string;
  accountName: string;
  accountId: string;
}) {
  return (
    <div className="mx-auto my-12 max-w-md rounded-2xl border border-dashed p-8 text-center">
      <IconCategory className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
      <h3 className="text-sm font-bold text-foreground">
        No playbooks found in {tab.toLowerCase()}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        There are currently no published troubleshooting procedures for {accountName} under this view.
      </p>
      <div className="mt-4">
        <Button
          asChild
          size="sm"
          className="h-8 gap-1.5 bg-[#233B74] text-xs font-semibold text-white hover:bg-[#233B74]/90"
        >
          <Link href={`/scenarios/new?account_id=${accountId}`}>
            <IconPlus className="h-3.5 w-3.5" />
            Create First Playbook
          </Link>
        </Button>
      </div>
    </div>
  );
}
