'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { IconChevronDown, IconFilter, IconX } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/lib/store/app-store';
import { cn, chipStyle } from '@/lib/utils';
import type {
  CriteriaField,
  CriteriaOption,
  FacetCount,
  FilterState,
} from '@/types/database';

interface FilterRailProps {
  fields: CriteriaField[];
  optionsByField: Record<string, CriteriaOption[]>;
  facets: FacetCount[];
  accounts: { id: string; name: string; accent_color: string | null }[];
  categories?: { id: string; name: string; color: string | null }[];
  /** Hide the account section (the top bar already controls account scope). */
  hideAccounts?: boolean;
  onFacetChange?: () => void;
}

const SYSTEM_FIELD_KEYS: Record<string, string> = {
  account: 'accountIds',
  category: 'categoryIds',
  issue_type: 'issueTypeIds',
  severity: 'severityIds',
  impact_scope: 'impactScopeIds',
};

/**
 * The faceted filter rail.
 *
 * The list of sections is generated from the criteria field definitions -
 * adding a custom field in the admin UI adds a facet here automatically.
 * Counts come from `get_facet_counts` and update as filters change.
 */
export function FilterRail({
  fields,
  optionsByField,
  facets,
  accounts,
  categories = [],
  hideAccounts = false,
  onFacetChange,
}: FilterRailProps) {
  const filters = useAppStore((s) => s.filters);
  const setCategoryIds = useAppStore((s) => s.setCategoryIds);
  const setIssueTypeIds = useAppStore((s) => s.setIssueTypeIds);
  const setSeverityIds = useAppStore((s) => s.setSeverityIds);
  const setImpactScopeIds = useAppStore((s) => s.setImpactScopeIds);
  const setCustomFilter = useAppStore((s) => s.setCustomFilter);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const router = useRouter();

  // Facet counts keyed by option id.
  const countByOption = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const facet of facets) {
      map.set(facet.option_id, Number(facet.count));
    }
    return map;
  }, [facets]);

  const selectedFor = React.useCallback(
    (field: CriteriaField): string[] => {
      if (field.key === 'category') return filters.categoryIds;
      if (field.key === 'issue_type') return filters.issueTypeIds;
      if (field.key === 'severity') return filters.severityIds;
      if (field.key === 'impact_scope') return filters.impactScopeIds;
      return filters.custom[field.id] ?? [];
    },
    [filters],
  );

  const toggleOption = React.useCallback(
    (field: CriteriaField, optionId: string) => {
      const current = selectedFor(field);
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];

      switch (field.key) {
        case 'category':
          setCategoryIds(next);
          break;
        case 'issue_type':
          setIssueTypeIds(next);
          break;
        case 'severity':
          setSeverityIds(next);
          break;
        case 'impact_scope':
          setImpactScopeIds(next);
          break;
        default:
          setCustomFilter(field.id, next);
      }
      onFacetChange?.();
    },
    [selectedFor, setCategoryIds, setIssueTypeIds, setSeverityIds, setImpactScopeIds, setCustomFilter, onFacetChange],
  );

  const visibleFields = fields.filter((f) => f.show_as_facet && f.is_active);

  const activeCount =
    visibleFields.reduce((n, f) => n + (selectedFor(f).length > 0 ? 1 : 0), 0) +
    (filters.query.trim() ? 1 : 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <IconFilter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {activeCount}
            </Badge>
          )}
        </div>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-2xs"
            onClick={() => {
              resetFilters();
              onFacetChange?.();
            }}
          >
            Clear all
          </Button>
        )}
      </div>

      <Separator />

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {visibleFields.map((field) => {
          const isAccountField = field.key === 'account';
          const isCategoryField = field.key === 'category';

          if (isAccountField && hideAccounts) return null;

          const options = optionsByField[field.id] ?? [];
          if (!isAccountField && !isCategoryField && options.length === 0) return null;
          if (isCategoryField && categories.length === 0 && options.length === 0) return null;

          const selected = selectedFor(field);
          const fieldFacets = facets.filter((f) => f.field_id === field.id);

          return (
            <FacetSection
              key={field.id}
              field={field}
              options={options}
              selected={selected}
              countByOption={countByOption}
              facetCounts={fieldFacets}
              accounts={accounts}
              categories={categories}
              onToggle={(optionId) => toggleOption(field, optionId)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface FacetSectionProps {
  field: CriteriaField;
  options: CriteriaOption[];
  selected: string[];
  countByOption: Map<string, number>;
  facetCounts: FacetCount[];
  accounts: { id: string; name: string; accent_color: string | null }[];
  categories?: { id: string; name: string; color: string | null }[];
  onToggle: (optionId: string) => void;
}

function FacetSection({
  field,
  options,
  selected,
  countByOption,
  facetCounts,
  accounts,
  categories = [],
  onToggle,
}: FacetSectionProps) {
  const [open, setOpen] = React.useState(true);

  // For account and category fields, options come from accounts/categories.
  const isAccountField = field.key === 'account';
  const isCategoryField = field.key === 'category';

  const items = isAccountField
    ? accounts.map((a) => ({
        id: a.id,
        label: a.name,
        color: a.accent_color,
        count: countByOption.get(a.id) ?? 0,
      }))
    : isCategoryField && categories.length > 0
    ? categories.map((c) => ({
        id: c.id,
        label: c.name,
        color: c.color,
        count: countByOption.get(c.id) ?? 0,
      }))
    : options.map((option) => ({
        id: option.id,
        label: option.label,
        color: option.color,
        count: countByOption.get(option.id) ?? 0,
      }));

  // Sort by count descending, then label.
  const sorted = [...items].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <IconChevronDown
          className={cn('h-3 w-3 shrink-0 transition-transform', !open && '-rotate-90')}
        />
        <span className="flex-1 truncate">{field.label}</span>
        {selected.length > 0 && (
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {selected.length}
          </Badge>
        )}
      </button>

      {open && (
        <ul className="max-h-72 space-y-0.5 overflow-y-auto px-2 pb-2 scrollbar-thin">
          {sorted.map((item) => {
            const isSelected = selected.includes(item.id);
            return (
              <li key={item.id}>
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs transition-colors',
                    isSelected ? 'text-foreground' : 'text-muted-foreground',
                    'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggle(item.id)}
                    aria-label={item.label}
                    className="h-3.5 w-3.5"
                  />
                  {item.color && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span
                    className={cn(
                      'shrink-0 tabular-nums text-2xs',
                      item.count === 0 ? 'text-muted-foreground/50' : 'text-muted-foreground',
                    )}
                  >
                    {item.count}
                  </span>
                </label>
              </li>
            );
          })}
          {sorted.length === 0 && (
            <li className="px-1.5 py-1 text-2xs text-muted-foreground">
              No options configured
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export interface ActiveFilterChip {
  key: string;
  label: string;
  color?: string | null;
  /** The store key to clear when the chip is removed. */
  removeKey: string;
}

/**
 * Build the list of removable chips for the current filter state.
 *
 * Every criteria field contributes its selected options, so custom fields
 * appear here without any extra code.
 */
export function buildActiveFilterChips(
  filters: FilterState,
  fields: CriteriaField[],
  optionsByField: Record<string, CriteriaOption[]>,
  accounts: { id: string; name: string; accent_color: string | null }[],
  categories: { id: string; name: string; color: string | null }[] = [],
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  if (filters.query.trim()) {
    chips.push({ key: 'query', label: `"${filters.query.trim()}"`, removeKey: 'query' });
  }

  for (const field of fields) {
    let selected: string[] = [];
    let removeKey = `custom:${field.id}`;

    switch (field.key) {
      case 'account':
        selected = filters.accountIds;
        removeKey = 'accountIds';
        break;
      case 'category':
        selected = filters.categoryIds;
        removeKey = 'categoryIds';
        break;
      case 'issue_type':
        selected = filters.issueTypeIds;
        removeKey = 'issueTypeIds';
        break;
      case 'severity':
        selected = filters.severityIds;
        removeKey = 'severityIds';
        break;
      case 'impact_scope':
        selected = filters.impactScopeIds;
        removeKey = 'impactScopeIds';
        break;
      default:
        selected = filters.custom[field.id] ?? [];
    }

    if (selected.length === 0) continue;

    for (const optionId of selected) {
      if (field.key === 'account') {
        const account = accountById.get(optionId);
        chips.push({
          key: `account:${optionId}`,
          label: account?.name ?? optionId,
          color: account?.accent_color,
          removeKey: 'accountIds',
        });
        continue;
      }

      if (field.key === 'category') {
        const cat = categoryById.get(optionId);
        chips.push({
          key: `category:${optionId}`,
          label: cat?.name ?? optionId,
          color: cat?.color,
          removeKey: 'categoryIds',
        });
        continue;
      }

      const option = (optionsByField[field.id] ?? []).find((o) => o.id === optionId);
      chips.push({
        key: `${field.id}:${optionId}`,
        label: option?.label ?? optionId,
        color: option?.color,
        removeKey,
      });
    }
  }

  return chips;
}

export function ActiveFilterChips({
  fields,
  optionsByField,
  accounts,
  categories = [],
  onChange,
}: {
  fields: CriteriaField[];
  optionsByField: Record<string, CriteriaOption[]>;
  accounts: { id: string; name: string; accent_color: string | null }[];
  categories?: { id: string; name: string; color: string | null }[];
  onChange?: () => void;
}) {
  const filters = useAppStore((s) => s.filters);
  const removeFilter = useAppStore((s) => s.removeFilter);

  const chips = React.useMemo(
    () => buildActiveFilterChips(filters, fields, optionsByField, accounts, categories),
    [filters, fields, optionsByField, accounts, categories],
  );

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => {
            removeFilter(chip.removeKey);
            onChange?.();
          }}
          className="chip-interactive"
          style={chipStyle(chip.color)}
          title={`Remove filter: ${chip.label}`}
        >
          {chip.label}
          <IconX className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}
