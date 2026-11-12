'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  IconArrowRight,
  IconBook2,
  IconBuildingSkyscraper,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconFilter,
  IconFlame,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconX,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScenarioCard } from '@/components/scenarios/scenario-card';
import { useAppStore } from '@/lib/store/app-store';
import { searchScenarios } from '@/lib/data/criteria-client';
import { buildCriteriaLookup, resolveChips } from '@/lib/data/criteria-lookup';
import { cn } from '@/lib/utils';
import type { ResolvedChip } from '@/lib/data/criteria-lookup';
import type {
  Account,
  Category,
  CriteriaField,
  CriteriaOption,
  ScenarioCriteriaValue,
  SearchResult,
} from '@/types/database';

interface HomeDashboardProps {
  accounts: Account[];
  categories: Category[];
  fields: CriteriaField[];
  optionsByField: Record<string, CriteriaOption[]>;
  recent: SearchResult[];
  recentValues: Record<string, ScenarioCriteriaValue[]>;
  /** Top problems, ranked by occurrence count. */
  frequent: SearchResult[];
  frequentValues: Record<string, ScenarioCriteriaValue[]>;
  /** Accounts with their counts, for the account tiles. */
  accountCounts: Record<string, number>;
  userName: string;
}

export function HomeDashboard({
  accounts,
  categories,
  fields,
  optionsByField,
  recent,
  recentValues,
  frequent,
  frequentValues,
  accountCounts,
  userName,
}: HomeDashboardProps) {
  const router = useRouter();
  const setQuery = useAppStore((s) => s.setQuery);
  const selectedAccountIds = useAppStore((s) => s.selectedAccountIds);
  const setSelectedAccountIds = useAppStore((s) => s.setSelectedAccountIds);
  const [term, setTerm] = React.useState('');

  // Scoped scenarios when filtering by account from top bar
  const [scopedRecent, setScopedRecent] = React.useState<SearchResult[]>(recent);
  const [scopedFrequent, setScopedFrequent] = React.useState<SearchResult[]>(frequent);
  const [loadingScope, setLoadingScope] = React.useState(false);

  React.useEffect(() => {
    if (selectedAccountIds.length === 0) {
      setScopedRecent(recent);
      setScopedFrequent(frequent);
      return;
    }

    let active = true;
    setLoadingScope(true);

    Promise.all([
      searchScenarios({ sort: 'newest', pageSize: 6, accountIds: selectedAccountIds }),
      searchScenarios({ sort: 'frequency', pageSize: 6, accountIds: selectedAccountIds }),
    ])
      .then(([newestRes, freqRes]) => {
        if (!active) return;
        setScopedRecent(newestRes.results);
        setScopedFrequent(freqRes.results);
      })
      .catch((err) => {
        console.error('Failed to filter scenarios for selected accounts', err);
      })
      .finally(() => {
        if (active) setLoadingScope(false);
      });

    return () => {
      active = false;
    };
  }, [selectedAccountIds, recent, frequent]);

  // Account organizer states
  const [accountSearch, setAccountSearch] = React.useState('');
  const [accountFilter, setAccountFilter] = React.useState<'all' | 'has_playbooks' | 'active'>('all');
  const [accountSort, setAccountSort] = React.useState<'scenarios' | 'name' | 'code'>('name');
  const [showAllAccounts, setShowAllAccounts] = React.useState(false);

  const lookup = React.useMemo(
    () => buildCriteriaLookup(fields, optionsByField, categories),
    [fields, optionsByField, categories],
  );

  const accountNames = React.useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  const chipsFor = React.useCallback(
    (result: SearchResult, values: Record<string, ScenarioCriteriaValue[]>) => {
      const chips: ResolvedChip[] = resolveChips(
        {
          account_id: result.account_id,
          category_id: result.category_id,
          issue_type_id: result.issue_type_id,
          severity_id: result.severity_id,
          impact_scope_id: result.impact_scope_id,
        },
        values[result.id] ?? [],
        lookup,
        accountNames,
      );
      return chips;
    },
    [lookup, accountNames],
  );

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(term);
    router.push(term.trim() ? `/search?q=${encodeURIComponent(term.trim())}` : '/search');
  };

  const topCategories = React.useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories],
  );

  // Filtered and sorted accounts for the organizer
  const filteredAccounts = React.useMemo(() => {
    let list = [...accounts];

    if (accountFilter === 'has_playbooks') {
      list = list.filter((a) => (accountCounts[a.id] ?? 0) > 0);
    } else if (accountFilter === 'active') {
      list = list.filter((a) => a.status === 'Active');
    }

    if (accountSearch.trim()) {
      const q = accountSearch.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)),
      );
    }

    list.sort((a, b) => {
      if (accountSort === 'scenarios') {
        const countA = accountCounts[a.id] ?? 0;
        const countB = accountCounts[b.id] ?? 0;
        if (countB !== countA) return countB - countA;
        return a.name.localeCompare(b.name);
      }
      if (accountSort === 'code') {
        return a.code.localeCompare(b.code);
      }
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [accounts, accountCounts, accountFilter, accountSearch, accountSort]);

  const activeCount = React.useMemo(
    () => accounts.filter((a) => a.status === 'Active').length,
    [accounts],
  );

  const withPlaybooksCount = React.useMemo(
    () => accounts.filter((a) => (accountCounts[a.id] ?? 0) > 0).length,
    [accounts, accountCounts],
  );

  // Initial display limit if not searching
  const isFiltering = Boolean(accountSearch.trim() || accountFilter !== 'all');
  const displayedAccounts = isFiltering || showAllAccounts ? filteredAccounts : filteredAccounts.slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* Top Hero */}
      <section className="mb-8 animate-fade-in-up">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {greeting()}, {userName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Big Outsource IT Operations Playbook.
          </p>
        </div>

        <form onSubmit={submitSearch} className="mt-5 flex max-w-2xl gap-2.5 items-center">
          <div className="relative flex-1">
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search symptoms, error messages, ticket IDs..."
              className="h-10 px-3.5 pr-8 rounded-lg bg-background"
              aria-label="Search the playbook"
            />
            {term && (
              <button
                type="button"
                onClick={() => setTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                aria-label="Clear search"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            type="submit"
            className="h-10 px-5 rounded-lg bg-[#233B74] hover:bg-[#1b2e5c] text-white font-medium shadow-xs transition-all duration-150 active:scale-[0.98] shrink-0"
          >
            Search
          </Button>
        </form>

        {selectedAccountIds.length > 0 && (
          <div className="mt-3 flex max-w-2xl items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-2 text-xs text-primary animate-fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <IconFilter className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">
                Active account scope:{' '}
                <strong className="font-semibold text-foreground">
                  {accounts
                    .filter((a) => selectedAccountIds.includes(a.id))
                    .map((a) => a.name)
                    .join(', ') || `${selectedAccountIds.length} accounts`}
                </strong>
                {' '}&mdash; showing tailored playbooks &amp; diagnostics.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAccountIds([])}
              className="inline-flex shrink-0 items-center gap-1 font-medium hover:underline cursor-pointer text-muted-foreground hover:text-foreground text-2xs"
            >
              <IconX className="h-3 w-3" />
              <span>Show all</span>
            </button>
          </div>
        )}

        <p className="mt-2 text-2xs text-muted-foreground">
          Press <kbd className="rounded border px-1 font-mono">Ctrl K</kbd> anywhere
          for the command palette.
        </p>
      </section>

      {/* Account Organizer */}
      {accounts.length > 0 && (
        <section className="mb-8 rounded-2xl border bg-card/60 p-4 sm:p-5 shadow-xs animate-fade-in-up">
          {/* Organizer Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3.5">
            <div>
              <div className="flex items-center gap-2">
                <IconBuildingSkyscraper className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  Client Accounts Organizer
                </h2>
                <Badge variant="secondary" className="h-5 px-2 text-[10px] font-mono">
                  {filteredAccounts.length} / {accounts.length}
                </Badge>
              </div>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                Filter and browse client-specific runbooks and procedures.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-2xs text-muted-foreground hover:text-foreground" asChild>
                <Link href="/accounts" className="flex items-center gap-1">
                  <span>Full Directory</span>
                  <IconArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Organizer Filters & Search Bar */}
          <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAccountFilter('all')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  accountFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                All ({accounts.length})
              </button>
              <button
                type="button"
                onClick={() => setAccountFilter('has_playbooks')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  accountFilter === 'has_playbooks'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                With Playbooks ({withPlaybooksCount})
              </button>
              <button
                type="button"
                onClick={() => setAccountFilter('active')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  accountFilter === 'active'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Active ({activeCount})
              </button>
            </div>

            {/* Search Input & Sort */}
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-48">
                <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Filter accounts..."
                  className="h-8 pl-8 pr-7 text-xs"
                />
                {accountSearch && (
                  <button
                    type="button"
                    onClick={() => setAccountSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <IconX className="h-3 w-3" />
                  </button>
                )}
              </div>

              <select
                value={accountSort}
                onChange={(e) => setAccountSort(e.target.value as any)}
                className="h-8 rounded-md border bg-background px-2 text-2xs text-muted-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                aria-label="Sort accounts by"
              >
                <option value="name">Name (A–Z)</option>
                <option value="scenarios">Most Playbooks</option>
                <option value="code">Code (A–Z)</option>
              </select>
            </div>
          </div>

          {/* Accounts Grid */}
          {displayedAccounts.length === 0 ? (
            <div className="my-6 rounded-xl border border-dashed p-6 text-center">
              <p className="text-xs font-medium text-foreground">No accounts found</p>
              <p className="mt-1 text-2xs text-muted-foreground">
                No accounts match the current filter "{accountSearch || accountFilter}".
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-7 text-2xs"
                onClick={() => {
                  setAccountSearch('');
                  setAccountFilter('all');
                }}
              >
                Reset Filter
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {displayedAccounts.map((account) => {
                  const count = accountCounts[account.id] ?? 0;
                  const isScoped = selectedAccountIds.includes(account.id);
                  return (
                    <Link
                      key={account.id}
                      href={`/accounts/${account.code}`}
                      className={cn(
                        'group flex items-center gap-3 rounded-xl border bg-card p-3 shadow-2xs card-hover hover:border-primary/50',
                        isScoped && 'border-primary/80 ring-1 ring-primary/30 bg-primary/[0.03]',
                      )}
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold font-mono tracking-tight shadow-2xs"
                        style={{
                          backgroundColor: `${account.accent_color ?? '#64748b'}1a`,
                          color: account.accent_color ?? '#64748b',
                        }}
                      >
                        {account.code.slice(0, 3).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                            {account.name}
                          </span>
                          {account.status !== 'Active' && (
                            <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
                              {account.status}
                            </Badge>
                          )}
                          {isScoped && (
                            <Badge variant="default" className="h-4 px-1.5 text-[9px] font-semibold bg-primary text-primary-foreground">
                              Scoped
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
                          <span className={cn('font-medium', count > 0 ? 'text-primary' : 'text-muted-foreground/60')}>
                            {count} {count === 1 ? 'playbook' : 'playbooks'}
                          </span>
                          {account.is_global && (
                            <>
                              <span>&bull;</span>
                              <span>Global</span>
                            </>
                          )}
                        </span>
                      </span>
                      <IconArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  );
                })}
              </div>

              {/* Show more toggle if not filtering */}
              {!isFiltering && filteredAccounts.length > 6 && (
                <div className="mt-3.5 pt-3 border-t text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-2xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setShowAllAccounts((v) => !v)}
                  >
                    {showAllAccounts ? (
                      <>
                        <IconChevronUp className="h-3.5 w-3.5" />
                        <span>Show Less</span>
                      </>
                    ) : (
                      <>
                        <IconChevronDown className="h-3.5 w-3.5" />
                        <span>Show All {filteredAccounts.length} Accounts ({filteredAccounts.length - 6} more)</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 animate-fade-in-up">
        {/* Frequent problems */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <IconFlame className="h-4 w-4 text-muted-foreground" />
              Most frequent problems
            </h2>
            <Button variant="ghost" size="sm" className="h-7 text-2xs" asChild>
              <Link href="/search?sort=frequency">View all</Link>
            </Button>
          </div>
          <div className="space-y-2">
            {scopedFrequent.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                {selectedAccountIds.length > 0
                  ? 'No frequent playbooks found for the selected account(s).'
                  : 'No scenarios published yet.'}
              </p>
            ) : (
              scopedFrequent.map((result) => (
                <ScenarioCard
                  key={result.id}
                  id={result.id}
                  title={result.title}
                  slug={result.slug}
                  summary={result.summary}
                  occurrenceCount={result.occurrence_count}
                  lastOccurredAt={result.last_occurred_at}
                  updatedAt={result.updated_at}
                  isGlobal={result.is_global}
                  status={result.status}
                  chips={chipsFor(result, frequentValues)}
                />
              ))
            )}
          </div>
        </section>

        {/* Recently updated + categories */}
        <div className="space-y-6">
          <section>
            <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <IconClock className="h-4 w-4 text-muted-foreground" />
              Recently updated
            </h2>
            <div className="space-y-2">
              {scopedRecent.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  {selectedAccountIds.length > 0
                    ? 'No recently updated playbooks for the selected account(s).'
                    : 'Nothing has been updated yet.'}
                </p>
              ) : (
                scopedRecent.map((result) => (
                  <ScenarioCard
                    key={result.id}
                    id={result.id}
                    title={result.title}
                    slug={result.slug}
                    summary={result.summary}
                    occurrenceCount={result.occurrence_count}
                    lastOccurredAt={result.last_occurred_at}
                    updatedAt={result.updated_at}
                    isGlobal={result.is_global}
                    status={result.status}
                    chips={chipsFor(result, recentValues)}
                  />
                ))
              )}
            </div>
          </section>

          {topCategories.length > 0 && (
            <section className="rounded-xl border bg-card/60 p-4 shadow-2xs">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
                  <IconBook2 className="h-4 w-4 text-primary" />
                  Browse by category
                </h2>
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono">
                  {topCategories.length} Categories
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {topCategories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/category/${category.slug}`}
                    className="group flex items-center gap-2.5 rounded-lg border bg-background/80 px-3 py-2 text-xs font-medium transition-all hover:border-primary/50 hover:bg-accent/40 shadow-2xs"
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0 transition-transform group-hover:scale-125"
                      style={{ backgroundColor: category.color ?? '#288FC2' }}
                    />
                    <span className="truncate text-foreground group-hover:text-primary transition-colors">
                      {category.name}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
