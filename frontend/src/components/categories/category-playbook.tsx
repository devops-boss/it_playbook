'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconBook2, IconCheck, IconChevronRight, IconFlame, IconWorld } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScenarioCard } from '@/components/scenarios/scenario-card';
import { useAppStore } from '@/lib/store/app-store';
import { getPlaybookMetaMap } from '@/lib/data/criteria-client';
import { cn, chipStyle } from '@/lib/utils';
import type { Account, Category, CategoryPlaybookRow } from '@/types/database';

interface CategoryPlaybookProps {
  category: Category;
  ancestors: { id: string; name: string; slug: string }[];
  children: Category[];
  rows: CategoryPlaybookRow[];
  accounts: Account[];
  accountMatch: 'any' | 'all' | 'only';
  selectedAccountIds: string[];
  includeSubcategories: boolean;
}

/**
 * The category playbook: every scenario in a category, across accounts.
 *
 * The account multi-select with Any / All / Only match modes is what makes
 * the overlap view possible - "common to all accounts" versus "unique to
 * one account".
 */
export function CategoryPlaybook({
  category,
  ancestors,
  children,
  rows,
  accounts,
  accountMatch,
  selectedAccountIds,
  includeSubcategories,
}: CategoryPlaybookProps) {
  const router = useRouter();
  const setAccountMatch = useAppStore((s) => s.setAccountMatch);
  const toggleAccount = useAppStore((s) => s.toggleAccount);
  const setSelectedAccountIds = useAppStore((s) => s.setSelectedAccountIds);

  const [metaMap, setMetaMap] = React.useState<Record<string, { isDocumentation: boolean }>>({});

  React.useEffect(() => {
    if (rows.length === 0) return;
    getPlaybookMetaMap(rows.map((r) => r.id))
      .then(setMetaMap)
      .catch(() => {});
  }, [rows]);

  const updateUrl = React.useCallback(
    (changes: Record<string, string | undefined>) => {
      const params = new URLSearchParams();
      if (selectedAccountIds.length) params.set('accounts', selectedAccountIds.join(','));
      if (accountMatch !== 'any') params.set('match', accountMatch);
      if (!includeSubcategories) params.set('subcategories', '0');
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      const qs = params.toString();
      router.replace(`/category/${category.slug}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [selectedAccountIds, accountMatch, includeSubcategories, category.slug, router],
  );

  const accountById = React.useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  // Group by account so the overlap view reads clearly.
  const grouped = React.useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; rows: CategoryPlaybookRow[] }>();
    for (const row of rows) {
      const key = row.account_id ?? 'global';
      const entry = map.get(key) ?? {
        name: row.account_name ?? 'Global',
        color: row.account_color,
        rows: [],
      };
      entry.rows.push(row);
      map.set(key, entry);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'global') return 1;
      if (b[0] === 'global') return -1;
      return a[1].name.localeCompare(b[1].name);
    });
  }, [rows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-4">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-1.5">
          <ol className="flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
            <li>
              <Link href="/" className="hover:text-foreground">
                Home
              </Link>
            </li>
            {ancestors.map((ancestor) => (
              <li key={ancestor.id} className="flex items-center gap-1">
                <IconChevronRight className="h-3 w-3" />
                <Link href={`/category/${ancestor.slug}`} className="hover:text-foreground">
                  {ancestor.name}
                </Link>
              </li>
            ))}
            <li className="flex items-center gap-1">
              <IconChevronRight className="h-3 w-3" />
              <span className="font-medium text-foreground">{category.name}</span>
            </li>
          </ol>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              {category.color && (
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: category.color }}
                  aria-hidden
                />
              )}
              {category.name}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rows.length} scenario{rows.length === 1 ? '' : 's'} across{' '}
              {grouped.length} account{grouped.length === 1 ? '' : 's'}
              {includeSubcategories && children.length > 0 && ' (including subcategories)'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Account multi-select with overlap modes */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  {selectedAccountIds.length === 0
                    ? 'All accounts'
                    : `${selectedAccountIds.length} account${selectedAccountIds.length === 1 ? '' : 's'}`}
                  <IconChevronRight className="h-3.5 w-3.5 rotate-90 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="border-b px-3 py-2">
                  <p className="text-xs font-medium">Accounts</p>
                  <p className="text-2xs text-muted-foreground">
                    Select accounts to compare their coverage.
                  </p>
                </div>
                <div className="max-h-56 overflow-y-auto p-1">
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent',
                      selectedAccountIds.length === 0 && 'bg-accent/60',
                    )}
                    onClick={() => {
                      setSelectedAccountIds([]);
                      setTimeout(() => updateUrl({ accounts: undefined }), 0);
                    }}
                  >
                    <IconCheck
                      className={cn(
                        'h-3.5 w-3.5',
                        selectedAccountIds.length === 0 ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    All accounts
                  </button>
                  {accounts.map((account) => (
                    <label
                      key={account.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
                    >
                      <Checkbox
                        checked={selectedAccountIds.includes(account.id)}
                        onCheckedChange={() => {
                          toggleAccount(account.id);
                          setTimeout(() => updateUrl({}), 0);
                        }}
                      />
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: account.accent_color ?? '#94a3b8' }}
                        aria-hidden
                      />
                      <span className="truncate">{account.name}</span>
                    </label>
                  ))}
                </div>

                {selectedAccountIds.length > 1 && (
                  <div className="border-t p-2">
                    <p className="mb-1.5 px-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                      Overlap
                    </p>
                    <div className="space-y-0.5">
                      {(
                        [
                          ['any', 'Any selected account', 'In at least one of them'],
                          ['all', 'Common to ALL selected', 'Present in every one of them'],
                          ['only', 'Unique to one account', 'Tied to exactly one of them'],
                        ] as const
                      ).map(([value, label, hint]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setAccountMatch(value);
                            setTimeout(() => updateUrl({ match: value }), 0);
                          }}
                          className={cn(
                            'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent',
                            accountMatch === value && 'bg-accent/60',
                          )}
                        >
                          <IconCheck
                            className={cn(
                              'mt-0.5 h-3.5 w-3.5 shrink-0',
                              accountMatch === value ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span>
                            <span className="block font-medium">{label}</span>
                            <span className="block text-2xs text-muted-foreground">
                              {hint}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {children.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-2xs text-muted-foreground">Subcategories:</span>
            {children.map((child) => (
              <Link
                key={child.id}
                href={`/category/${child.slug}`}
                className="chip-interactive"
                style={
                  child.color
                    ? {
                        backgroundColor: `${child.color}1a`,
                        borderColor: `${child.color}40`,
                        color: child.color,
                      }
                    : undefined
                }
              >
                {child.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <p className="text-sm font-medium">No scenarios here yet</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {selectedAccountIds.length > 1 && accountMatch === 'all'
                ? 'No scenario is documented for every one of the selected accounts.'
                : 'Nothing has been documented in this category for the selected accounts.'}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([key, group]) => {
              const docRows = group.rows.filter((r) => metaMap[r.id]?.isDocumentation);
              const scenarioRows = group.rows.filter((r) => !metaMap[r.id]?.isDocumentation);

              return (
                <section key={key}>
                  <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                    {key === 'global' ? (
                      <IconWorld className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: group.color ?? '#94a3b8' }}
                        aria-hidden
                      />
                    )}
                    {group.name}
                    <span className="text-2xs font-normal tabular-nums text-muted-foreground">
                      {group.rows.length}
                    </span>
                  </h2>

                  {docRows.length > 0 && scenarioRows.length > 0 ? (
                    <div className="space-y-4">
                      {/* Documentation Section (On Top) */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-2xs font-semibold text-blue-600 dark:text-blue-400">
                          <IconBook2 className="h-3 w-3" />
                          <span>Documentation & Setup Guides ({docRows.length})</span>
                        </div>
                        <div className="space-y-2">
                          {docRows.map((row) => (
                            <ScenarioCard
                              key={row.id}
                              id={row.id}
                              title={row.title}
                              slug={row.slug}
                              summary={row.summary}
                              occurrenceCount={row.occurrence_count}
                              lastOccurredAt={null}
                              updatedAt={row.updated_at}
                              isGlobal={row.is_global}
                              status="published"
                              isDocumentation={true}
                              chips={rowChips(row)}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Troubleshooting Section (Below) */}
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-1.5 text-2xs font-semibold text-amber-600 dark:text-amber-400">
                          <IconFlame className="h-3 w-3" />
                          <span>Troubleshooting Scenarios ({scenarioRows.length})</span>
                        </div>
                        <div className="space-y-2">
                          {scenarioRows.map((row) => (
                            <ScenarioCard
                              key={row.id}
                              id={row.id}
                              title={row.title}
                              slug={row.slug}
                              summary={row.summary}
                              occurrenceCount={row.occurrence_count}
                              lastOccurredAt={null}
                              updatedAt={row.updated_at}
                              isGlobal={row.is_global}
                              status="published"
                              isDocumentation={false}
                              chips={rowChips(row)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {group.rows.map((row) => (
                        <ScenarioCard
                          key={row.id}
                          id={row.id}
                          title={row.title}
                          slug={row.slug}
                          summary={row.summary}
                          occurrenceCount={row.occurrence_count}
                          lastOccurredAt={null}
                          updatedAt={row.updated_at}
                          isGlobal={row.is_global}
                          status="published"
                          isDocumentation={Boolean(metaMap[row.id]?.isDocumentation)}
                          chips={rowChips(row)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function rowChips(row: CategoryPlaybookRow) {
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

  if (row.account_id && row.account_name) {
    chips.push({
      key: `account:${row.account_id}`,
      fieldId: row.account_id,
      fieldKey: 'account',
      fieldLabel: 'Account',
      optionId: row.account_id,
      label: row.account_name,
      color: row.account_color,
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
      color: null,
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
      color: null,
      isFreeText: false,
    });
  }
  return chips;
}
