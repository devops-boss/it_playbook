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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

const MATCH_MODES = [
  { value: 'any', label: 'Any selected account', hint: 'Matches scenarios in at least one' },
  { value: 'all', label: 'Common to ALL selected', hint: 'Matches only if present in every one' },
  { value: 'only', label: 'Unique to one account', hint: 'Matches only scenarios tied to a single account' },
] as const;

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
  const toggleAccount = useAppStore((s) => s.toggleAccount);
  const accountMatch = useAppStore((s) => s.accountMatch);
  const setAccountMatch = useAppStore((s) => s.setAccountMatch);

  const [term, setTerm] = React.useState('');

  // Account organizer states
  const [accountSearch, setAccountSearch] = React.useState('');
  const [scopeSearch, setScopeSearch] = React.useState('');
  const [accountFilter, setAccountFilter] = React.useState<'all' | 'scoped' | 'has_playbooks' | 'active'>('all');
  const [accountSort, setAccountSort] = React.useState<'scenarios' | 'name' | 'code'>('scenarios');
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

  // Filtered accounts for the scope selector popover
  const filteredScopeAccounts = React.useMemo(() => {
    if (!scopeSearch.trim()) return accounts;
    const q = scopeSearch.toLowerCase().trim();
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q),
    );
  }, [accounts, scopeSearch]);

  // Filtered and sorted accounts for the organizer
  const filteredAccounts = React.useMemo(() => {
    let list = [...accounts];

    if (accountFilter === 'scoped') {
      list = list.filter((a) => selectedAccountIds.includes(a.id));
    } else if (accountFilter === 'has_playbooks') {
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
  }, [accounts, accountCounts, accountFilter, accountSearch, accountSort, selectedAccountIds]);

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

        <form
          onSubmit={submitSearch}
          className="mt-6 relative flex items-center w-full max-w-2xl rounded-2xl border border-border/80 dark:border-slate-800 bg-background/90 dark:bg-slate-900/90 shadow-sm backdrop-blur-md transition-all duration-200 focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10 focus-within:shadow-md hover:border-border dark:hover:border-slate-700 p-1.5"
        >
          <div className="pointer-events-none pl-3 pr-2 text-muted-foreground/70">
            <IconSearch className="h-4.5 w-4.5" />
          </div>
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search symptoms, error codes, ticket IDs (e.g. VPN, 0x80070005, HESK-1042)..."
            className="h-10 w-full flex-1 bg-transparent px-2 text-sm text-foreground outline-none border-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
            aria-label="Search the playbook"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors mr-1 rounded-lg hover:bg-muted"
              aria-label="Clear search"
            >
              <IconX className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center gap-1.5 pr-2">
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/50 px-2 py-1 text-[11px] font-mono text-muted-foreground shadow-2xs">
              <span className="text-[10px]">↵</span> Enter
            </kbd>
          </div>
        </form>

        {/* Quick Search Tags & Hints */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70 mr-0.5">
            Frequent:
          </span>
          {['Network Outage', 'VPN Access', 'Password Reset', 'Printer Offline', 'EDR Sensor'].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setTerm(tag);
                setQuery(tag);
                router.push(`/search?q=${encodeURIComponent(tag)}`);
              }}
              className="inline-flex items-center rounded-lg border border-border/60 bg-card/60 px-2.5 py-0.5 text-2xs font-medium text-foreground/80 hover:bg-accent hover:text-foreground transition-all duration-150 active:scale-95"
            >
              {tag}
            </button>
          ))}
          <span className="mx-1 text-border/80">&bull;</span>
          <span className="text-2xs">
            Press <kbd className="rounded border border-border/60 bg-muted/40 px-1 py-0.2 font-mono">Ctrl K</kbd> anywhere
          </span>
        </div>
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
                Filter, scope, and browse client-specific runbooks and procedures.
              </p>
            </div>

            {/* Scope / Filter Controller seamlessly incorporated */}
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-8 gap-2 px-3 text-xs font-medium rounded-xl transition-all shadow-2xs',
                      selectedAccountIds.length > 0
                        ? 'border-primary/50 bg-primary/10 text-primary font-semibold ring-1 ring-primary/20'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          selectedAccountIds.length > 0 ? 'bg-primary' : 'bg-muted-foreground/40',
                        )}
                      />
                      <span>
                        Scope:{' '}
                        {selectedAccountIds.length === 0
                          ? 'All Accounts'
                          : selectedAccountIds.length === 1
                            ? accounts.find((a) => a.id === selectedAccountIds[0])?.name ?? '1 Account'
                            : `${selectedAccountIds.length} Accounts`}
                      </span>
                    </span>
                    <IconChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0 rounded-2xl shadow-xl">
                  <div className="border-b px-3.5 py-2.5">
                    <p className="text-xs font-semibold text-foreground">Playbook Account Scope</p>
                    <p className="text-2xs text-muted-foreground mt-0.5">
                      Scope every search, scenario, and criteria view to selected clients.
                    </p>
                  </div>

                  <div className="border-b p-2">
                    <div className="relative">
                      <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder={accounts.length > 0 ? `Search ${accounts.length} accounts...` : 'Search accounts...'}
                        value={scopeSearch}
                        onChange={(e) => setScopeSearch(e.target.value)}
                        className="w-full rounded-lg border bg-transparent pl-8 pr-2 py-1.5 text-xs placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto p-1.5 scrollbar-thin">
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                        selectedAccountIds.length === 0 && 'bg-accent/80 font-medium text-foreground',
                      )}
                      onClick={() => setSelectedAccountIds([])}
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>All Accounts (Unrestricted)</span>
                      </span>
                      {selectedAccountIds.length === 0 && (
                        <IconCheck className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>

                    <div className="my-1 border-t" />

                    {filteredScopeAccounts.map((account) => (
                      <label
                        key={account.id}
                        className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            checked={selectedAccountIds.includes(account.id)}
                            onCheckedChange={() => toggleAccount(account.id)}
                            aria-label={account.name}
                          />
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: account.accent_color ?? '#94a3b8' }}
                            aria-hidden
                          />
                          <span className="truncate font-medium text-foreground">{account.name}</span>
                        </div>
                        {account.status !== 'Active' && (
                          <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase ml-1">
                            {account.status}
                          </Badge>
                        )}
                      </label>
                    ))}
                  </div>

                  {selectedAccountIds.length > 1 && (
                    <div className="border-t p-2 bg-muted/20">
                      <p className="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Match Mode
                      </p>
                      <div className="space-y-0.5">
                        {MATCH_MODES.map((mode) => (
                          <button
                            key={mode.value}
                            type="button"
                            onClick={() => setAccountMatch(mode.value)}
                            className={cn(
                              'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                              accountMatch === mode.value && 'bg-accent/80 font-medium',
                            )}
                          >
                            <IconCheck
                              className={cn(
                                'mt-0.5 h-3.5 w-3.5 shrink-0 text-primary',
                                accountMatch === mode.value ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span>
                              <span className="block font-medium">{mode.label}</span>
                              <span className="block text-2xs text-muted-foreground">
                                {mode.hint}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedAccountIds.length > 0 && (
                    <div className="border-t p-1.5 bg-muted/30 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedAccountIds([])}
                        className="text-2xs text-primary font-medium hover:underline py-0.5"
                      >
                        Reset to All Accounts
                      </button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground rounded-xl" asChild>
                <Link href="/accounts" className="flex items-center gap-1.5">
                  <span>Directory</span>
                  <IconArrowRight className="h-3.5 w-3.5" />
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
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                  accountFilter === 'all'
                    ? 'bg-[#233B74] text-white shadow-xs'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                All Accounts ({accounts.length})
              </button>
              {selectedAccountIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAccountFilter('scoped')}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${
                    accountFilter === 'scoped'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span>Scoped ({selectedAccountIds.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setAccountFilter('has_playbooks')}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                  accountFilter === 'has_playbooks'
                    ? 'bg-[#233B74] text-white shadow-xs'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                With Playbooks ({withPlaybooksCount})
              </button>
              <button
                type="button"
                onClick={() => setAccountFilter('active')}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                  accountFilter === 'active'
                    ? 'bg-[#233B74] text-white shadow-xs'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Active Status ({activeCount})
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
                  className="h-8 pl-8 pr-7 text-xs rounded-xl"
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
                className="h-8 rounded-xl border bg-background px-2.5 text-2xs text-muted-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                aria-label="Sort accounts by"
              >
                <option value="scenarios">Most Playbooks</option>
                <option value="name">Name (A–Z)</option>
                <option value="code">Code (A–Z)</option>
              </select>
            </div>
          </div>

          {/* Accounts Grid */}
          {displayedAccounts.length === 0 ? (
            <div className="my-6 rounded-2xl border border-dashed p-6 text-center">
              <p className="text-xs font-medium text-foreground">No accounts found</p>
              <p className="mt-1 text-2xs text-muted-foreground">
                No accounts match the current filter "{accountSearch || accountFilter}".
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-7 text-2xs rounded-xl"
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
                    <div
                      key={account.id}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-2xl border bg-card/80 p-3.5 shadow-2xs card-hover transition-all duration-200',
                        isScoped
                          ? 'border-primary/50 ring-2 ring-primary/10 bg-primary/5'
                          : 'hover:border-primary/40',
                      )}
                    >
                      <Link
                        href={`/accounts/${account.code}`}
                        className="flex items-center gap-3 min-w-0 flex-1"
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold font-mono tracking-tight shadow-2xs transition-transform duration-200 group-hover:scale-105"
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
                      </Link>

                      {/* 1-click Scope toggle button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleAccount(account.id);
                        }}
                        title={isScoped ? 'Remove from active scope' : 'Add to active scope'}
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all duration-150',
                          isScoped
                            ? 'border-primary/50 bg-primary text-primary-foreground shadow-2xs'
                            : 'border-border/60 text-muted-foreground/50 hover:border-border hover:bg-muted hover:text-foreground opacity-60 group-hover:opacity-100',
                        )}
                        aria-label={isScoped ? `Remove ${account.name} from scope` : `Add ${account.name} to scope`}
                      >
                        <IconCheck className={cn('h-3.5 w-3.5', isScoped ? 'opacity-100' : 'opacity-40')} />
                      </button>

                      <Link
                        href={`/accounts/${account.code}`}
                        className="text-muted-foreground/40 group-hover:text-primary transition-colors"
                        aria-label={`View ${account.name} runbooks`}
                      >
                        <IconArrowRight className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>

              {/* Show more toggle if not filtering */}
              {!isFiltering && filteredAccounts.length > 6 && (
                <div className="mt-3.5 pt-3 border-t text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground rounded-xl"
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
            {frequent.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                No scenarios published yet.
              </p>
            ) : (
              frequent.map((result) => (
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
              {recent.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  Nothing has been updated yet.
                </p>
              ) : (
                recent.map((result) => (
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
