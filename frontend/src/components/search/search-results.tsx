'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  IconBolt,
  IconBook2,
  IconCheck,
  IconFilter,
  IconFlame,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTicket,
  IconX,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ActiveFilterChips,
  FilterRail,
} from '@/components/filters/filter-rail';
import { ScenarioCard } from '@/components/scenarios/scenario-card';
import { useAppStore } from '@/lib/store/app-store';
import {
  getFacetCounts,
  getOptionsForFields,
  getCriteriaValuesForScenarios,
  getPlaybookMetaMap,
  searchScenarios,
} from '@/lib/data/criteria-client';
import type { PlaybookMeta } from '@/lib/data/criteria-core';
import { buildCriteriaLookup, resolveChips } from '@/lib/data/criteria-lookup';
import type { ResolvedChip } from '@/lib/data/criteria-lookup';
import { cn } from '@/lib/utils';
import type {
  Account,
  Category,
  CriteriaField,
  CriteriaOption,
  FacetCount,
  ScenarioCriteriaValue,
  SearchResult,
  SortOption,
} from '@/types/database';

interface SearchResultsProps {
  fields: CriteriaField[];
  accounts: Account[];
  categories?: Category[];
  initialQuery: string;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Best match' },
  { value: 'frequency', label: 'Most frequent' },
  { value: 'newest', label: 'Recently updated' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title A-Z' },
];

/**
 * Section 12 Instant Search Surface.
 *
 * Provides:
 * 1. Debounced live search querying title, quick_fix, symptoms, resolution steps,
 *    and HESK tracking ticket IDs (e.g. 'BOS-49281' or '49281').
 * 2. Multi-faceted criteria & account filter bar.
 * 3. Result cards displaying Quick Fix snippets, HESK tracking badges, and match highlights.
 * 4. Rich No Results empty state with guidance and direct scenario creation.
 */
export function SearchResults({ fields, accounts, categories = [], initialQuery }: SearchResultsProps) {
  const router = useRouter();
  const filters = useAppStore((s) => s.filters);
  const setQuery = useAppStore((s) => s.setQuery);
  const setSort = useAppStore((s) => s.setSort);
  const setPage = useAppStore((s) => s.setPage);
  const setCategoryIds = useAppStore((s) => s.setCategoryIds);
  const setIssueTypeIds = useAppStore((s) => s.setIssueTypeIds);
  const setSeverityIds = useAppStore((s) => s.setSeverityIds);
  const setImpactScopeIds = useAppStore((s) => s.setImpactScopeIds);
  const setCustomFilter = useAppStore((s) => s.setCustomFilter);
  const resetFilters = useAppStore((s) => s.resetFilters);

  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [total, setTotal] = React.useState(0);
  const [facets, setFacets] = React.useState<FacetCount[]>([]);
  const [optionsByField, setOptionsByField] = React.useState<
    Record<string, CriteriaOption[]>
  >({});
  const [criteriaValues, setCriteriaValues] = React.useState<
    Record<string, ScenarioCriteriaValue[]>
  >({});
  const [metaMap, setMetaMap] = React.useState<Record<string, PlaybookMeta>>({});
  const [loading, setLoading] = React.useState(true);
  const [searchTimeMs, setSearchTimeMs] = React.useState<number | null>(null);
  const [railOpen, setRailOpen] = React.useState(false);

  // Seed the query from the URL on first load.
  const initialised = React.useRef(false);
  React.useEffect(() => {
    if (!initialised.current && initialQuery) {
      initialised.current = true;
      setQuery(initialQuery);
    }
  }, [initialQuery, setQuery]);

  // Load option lists for every facet field.
  React.useEffect(() => {
    const fieldIds = fields.filter((f) => f.show_as_facet).map((f) => f.id);
    if (fieldIds.length === 0) return;
    getOptionsForFields(fieldIds)
      .then(setOptionsByField)
      .catch(() => setOptionsByField({}));
  }, [fields]);

  // Run the search whenever the filters change.
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const run = async () => {
      const startTime = performance.now();
      try {
        const [{ results: rows, total: count }, facetRows] = await Promise.all([
          searchScenarios(filters),
          getFacetCounts(),
        ]);
        if (cancelled) return;
        setResults(rows);
        setTotal(count);
        setFacets(facetRows);
        setSearchTimeMs(Math.round(performance.now() - startTime));

        // Custom criteria and playbook metadata for visible rows
        const [values, meta] = await Promise.all([
          getCriteriaValuesForScenarios(rows.map((r) => r.id)),
          getPlaybookMetaMap(rows.map((r) => r.id)),
        ]);
        if (!cancelled) {
          setCriteriaValues(values);
          setMetaMap(meta);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setTotal(0);
          setSearchTimeMs(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(run, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters]);

  // Mirror the filter state into the URL.
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (filters.query.trim()) params.set('q', filters.query.trim());
    if (filters.accountIds.length) params.set('accounts', filters.accountIds.join(','));
    if (filters.accountMatch !== 'any') params.set('match', filters.accountMatch);
    if (filters.categoryIds.length) params.set('categories', filters.categoryIds.join(','));
    if (filters.issueTypeIds.length) params.set('types', filters.issueTypeIds.join(','));
    if (filters.severityIds.length) params.set('severity', filters.severityIds.join(','));
    if (filters.impactScopeIds.length) params.set('scope', filters.impactScopeIds.join(','));
    const custom = Object.entries(filters.custom).filter(([, v]) => v.length > 0);
    if (custom.length) {
      params.set(
        'custom',
        JSON.stringify(Object.fromEntries(custom)),
      );
    }
    if (filters.sort !== 'relevance') params.set('sort', filters.sort);
    if (filters.page > 1) params.set('page', String(filters.page));

    const qs = params.toString();
    router.replace(qs ? `/search?${qs}` : '/search', { scroll: false });
  }, [filters, router]);

  const lookup = React.useMemo(
    () => buildCriteriaLookup(fields, optionsByField, categories),
    [fields, optionsByField, categories],
  );

  const accountNames = React.useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  // Chips for each result, resolved from its system + custom criteria.
  const chipsByScenario = React.useMemo(() => {
    const map = new Map<string, ResolvedChip[]>();
    for (const result of results) {
      const chips = resolveChips(
        {
          account_id: result.account_id,
          category_id: result.category_id,
          issue_type_id: result.issue_type_id,
          severity_id: result.severity_id,
          impact_scope_id: result.impact_scope_id,
        },
        criteriaValues[result.id] ?? [],
        lookup,
        accountNames,
      );
      map.set(result.id, chips);
    }
    return map;
  }, [results, criteriaValues, lookup, accountNames]);

  const handleChipClick = React.useCallback(
    (fieldKey: string, optionId: string | null) => {
      if (!optionId) return;
      switch (fieldKey) {
        case 'category':
          setCategoryIds(
            filters.categoryIds.includes(optionId)
              ? filters.categoryIds.filter((id) => id !== optionId)
              : [...filters.categoryIds, optionId],
          );
          break;
        case 'issue_type':
          setIssueTypeIds(
            filters.issueTypeIds.includes(optionId)
              ? filters.issueTypeIds.filter((id) => id !== optionId)
              : [...filters.issueTypeIds, optionId],
          );
          break;
        case 'severity':
          setSeverityIds(
            filters.severityIds.includes(optionId)
              ? filters.severityIds.filter((id) => id !== optionId)
              : [...filters.severityIds, optionId],
          );
          break;
        case 'impact_scope':
          setImpactScopeIds(
            filters.impactScopeIds.includes(optionId)
              ? filters.impactScopeIds.filter((id) => id !== optionId)
              : [...filters.impactScopeIds, optionId],
          );
          break;
        default: {
          const field = fields.find((f) => f.key === fieldKey);
          if (!field) return;
          const current = filters.custom[field.id] ?? [];
          setCustomFilter(
            field.id,
            current.includes(optionId)
              ? current
              : [...current, optionId],
          );
        }
      }
    },
    [
      filters,
      fields,
      setCategoryIds,
      setIssueTypeIds,
      setSeverityIds,
      setImpactScopeIds,
      setCustomFilter,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  return (
    <div className="flex min-h-0 flex-1">
      {/* Filter rail - desktop */}
      <aside className="hidden w-64 shrink-0 border-r bg-card/40 lg:block">
        <div className="sticky top-14 h-[calc(100vh-3.5rem)]">
          <FilterRail
            fields={fields}
            optionsByField={optionsByField}
            facets={facets}
            accounts={accounts}
            categories={categories}
          />
        </div>
      </aside>

      {/* Filter rail - mobile drawer */}
      {railOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setRailOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-80 border-r bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Search Filters
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setRailOpen(false)}
                aria-label="Close filters"
              >
                <IconX className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-[calc(100vh-4rem)]">
              <FilterRail
                fields={fields}
                optionsByField={optionsByField}
                facets={facets}
                accounts={accounts}
                categories={categories}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Search Results Surface */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Search Header Controls */}
        <div className="border-b bg-card/30 px-4 py-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, symptom, HESK ticket (e.g. BOS-49281 or 49281), quick fix..."
                className="h-10 pl-9 pr-8 text-xs font-medium"
                aria-label="Search scenarios"
              />
              {filters.query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Clear search"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1.5 lg:hidden text-xs"
              onClick={() => setRailOpen(true)}
            >
              <IconFilter className="h-3.5 w-3.5 text-primary" />
              Filters
            </Button>

            <Select
              value={filters.sort}
              onValueChange={(v) => setSort(v as SortOption)}
            >
              <SelectTrigger className="h-10 w-44 text-xs font-medium" aria-label="Sort results">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Active Filter Chips & Feedback Bar */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
            <ActiveFilterChips
              fields={fields}
              optionsByField={optionsByField}
              accounts={accounts}
              categories={categories}
            />
            <div className="ml-auto shrink-0 flex items-center gap-2 text-2xs text-muted-foreground tabular-nums">
              {searchTimeMs !== null && !loading && (
                <span className="text-muted-foreground/70 hidden sm:inline">
                  {searchTimeMs}ms ·
                </span>
              )}
              <span className="font-semibold text-foreground">
                {loading ? 'Searching…' : `${total} result${total === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 px-4 py-4">
          {loading && results.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              query={filters.query}
              onClear={() => {
                resetFilters();
                setQuery('');
              }}
            />
          ) : (
            (() => {
              const docResults = results.filter((r) => metaMap[r.id]?.isDocumentation);
              const scenarioResults = results.filter((r) => !metaMap[r.id]?.isDocumentation);

              // If both types exist, render segregated sections with Documentation on top
              if (docResults.length > 0 && scenarioResults.length > 0) {
                return (
                  <div className="space-y-6">
                    {/* Documentation & SOP Guides (ON TOP) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-border/80">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            <IconBook2 className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                            Documentation & Setup Guides
                          </span>
                          <Badge
                            variant="outline"
                            className="h-4 px-1.5 text-[10px] font-mono border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5"
                          >
                            {docResults.length}
                          </Badge>
                        </div>
                        <span className="text-2xs text-muted-foreground">Internal Knowledge Base / SOPs</span>
                      </div>

                      <div className="space-y-2.5">
                        {docResults.map((result) => (
                          <ScenarioCard
                            key={result.id}
                            id={result.id}
                            title={result.title}
                            slug={result.slug}
                            summary={result.summary}
                            quickFix={result.quick_fix}
                            sampleTicketIds={result.sample_ticket_ids}
                            searchQuery={filters.query}
                            accountName={result.account_id ? accountNames.get(result.account_id) : null}
                            occurrenceCount={result.occurrence_count}
                            lastOccurredAt={result.last_occurred_at}
                            updatedAt={result.updated_at}
                            isGlobal={result.is_global}
                            status={result.status}
                            isDocumentation={true}
                            chips={chipsByScenario.get(result.id) ?? []}
                            onChipClick={(chip) => handleChipClick(chip.fieldKey, chip.optionId)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Troubleshooting Scenarios (BELOW) */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between pb-2 border-b border-border/80">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <IconFlame className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                            Troubleshooting Scenarios
                          </span>
                          <Badge
                            variant="outline"
                            className="h-4 px-1.5 text-[10px] font-mono border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                          >
                            {scenarioResults.length}
                          </Badge>
                        </div>
                        <span className="text-2xs text-muted-foreground">Incident diagnosis & fixes</span>
                      </div>

                      <div className="space-y-2.5">
                        {scenarioResults.map((result) => (
                          <ScenarioCard
                            key={result.id}
                            id={result.id}
                            title={result.title}
                            slug={result.slug}
                            summary={result.summary}
                            quickFix={result.quick_fix}
                            sampleTicketIds={result.sample_ticket_ids}
                            searchQuery={filters.query}
                            accountName={result.account_id ? accountNames.get(result.account_id) : null}
                            occurrenceCount={result.occurrence_count}
                            lastOccurredAt={result.last_occurred_at}
                            updatedAt={result.updated_at}
                            isGlobal={result.is_global}
                            status={result.status}
                            isDocumentation={false}
                            chips={chipsByScenario.get(result.id) ?? []}
                            onChipClick={(chip) => handleChipClick(chip.fieldKey, chip.optionId)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {results.map((result) => (
                    <ScenarioCard
                      key={result.id}
                      id={result.id}
                      title={result.title}
                      slug={result.slug}
                      summary={result.summary}
                      quickFix={result.quick_fix}
                      sampleTicketIds={result.sample_ticket_ids}
                      searchQuery={filters.query}
                      accountName={result.account_id ? accountNames.get(result.account_id) : null}
                      occurrenceCount={result.occurrence_count}
                      lastOccurredAt={result.last_occurred_at}
                      updatedAt={result.updated_at}
                      isGlobal={result.is_global}
                      status={result.status}
                      isDocumentation={Boolean(metaMap[result.id]?.isDocumentation)}
                      chips={chipsByScenario.get(result.id) ?? []}
                      onChipClick={(chip) => handleChipClick(chip.fieldKey, chip.optionId)}
                    />
                  ))}
                </div>
              );
            })()
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-1 pb-6">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-medium"
                disabled={filters.page <= 1}
                onClick={() => setPage(filters.page - 1)}
              >
                Previous
              </Button>
              <span className="px-3 text-2xs tabular-nums text-muted-foreground font-medium">
                Page {filters.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-medium"
                disabled={filters.page >= totalPages}
                onClick={() => setPage(filters.page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Section 12 Rich No Results State.
 */
function EmptyState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="mx-auto my-8 max-w-lg rounded-2xl border border-dashed bg-card/60 p-8 text-center shadow-xs">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <IconSearch className="h-6 w-6" />
      </div>

      <h3 className="mt-4 text-base font-bold text-foreground">
        {query ? `No playbooks found matching "${query}"` : 'No playbooks match these active filters'}
      </h3>

      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
        We couldn't find any published troubleshooting procedures matching your exact criteria.
      </p>

      {/* Helpful suggestions box */}
      <div className="mt-5 rounded-xl border bg-muted/30 p-4 text-left">
        <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Suggestions to broaden your search:
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>Check the spelling of your search terms (e.g. <em>VPN</em>, <em>Teams</em>, <em>WAN</em>).</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#E07E3C]" />
            <span>Search directly by <strong>HESK Tracking ID</strong> (e.g. <code className="rounded bg-muted px-1 py-0.5 font-mono text-2xs">BOS-49281</code> or numeric <code className="rounded bg-muted px-1 py-0.5 font-mono text-2xs">49281</code>).</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#288FC2]" />
            <span>Remove or loosen some of the active facet filters in the sidebar.</span>
          </li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-xs"
          onClick={onClear}
        >
          <IconRefresh className="h-3.5 w-3.5" />
          Clear all filters
        </Button>

        <Button
          asChild
          size="sm"
          className="h-9 gap-1.5 bg-[#233B74] text-xs font-semibold text-white hover:bg-[#233B74]/90"
        >
          <Link href={`/scenarios/new${query ? `?title=${encodeURIComponent(query)}` : ''}`}>
            <IconPlus className="h-3.5 w-3.5" />
            Create a scenario for this topic
          </Link>
        </Button>
      </div>
    </div>
  );
}
