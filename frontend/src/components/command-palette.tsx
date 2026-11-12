'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  IconCategory,
  IconChevronRight,
  IconFileText,
  IconLayoutDashboard,
  IconMatrix,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconX,
} from '@tabler/icons-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { searchScenarios } from '@/lib/data/criteria-client';
import { useAppStore } from '@/lib/store/app-store';
import { cn, truncate } from '@/lib/utils';
import type { Account, Category, CriteriaField, SearchResult } from '@/types/database';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  categories: Category[];
  criteriaFields: CriteriaField[];
}

/**
 * Ctrl+K command palette.
 *
 * Searches scenarios live (through the same RPC the search page uses) and
 * also offers navigation targets. Pressing Enter on a scenario opens it.
 */
export function CommandPalette({
  open,
  onOpenChange,
  accounts,
  categories,
  criteriaFields,
}: CommandPaletteProps) {
  const router = useRouter();
  const setQuery = useAppStore((s) => s.setQuery);
  const selectedAccountIds = useAppStore((s) => s.selectedAccountIds);

  const [term, setTerm] = React.useState('');
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setTerm('');
      setResults([]);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const { results: rows } = await searchScenarios({
          query: trimmed,
          accountIds: selectedAccountIds,
          pageSize: 8,
        });
        if (!cancelled) setResults(rows);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, open, selectedAccountIds]);

  const goScenario = React.useCallback(
    (slug: string) => {
      onOpenChange(false);
      router.push(`/scenario/${slug}`);
    },
    [onOpenChange, router],
  );

  const goSearch = React.useCallback(() => {
    setQuery(term);
    onOpenChange(false);
    router.push('/search');
  }, [setQuery, term, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-xl sm:rounded-2xl rounded-2xl border shadow-2xl bg-card"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search scenarios and jump to any part of the playbook.
        </DialogDescription>

        <Command
          shouldFilter={false}
          className="flex flex-col overflow-hidden"
          loop
        >
          <div className="flex items-center gap-3 border-b px-4 py-3 bg-muted/20">
            <IconSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={term}
              onValueChange={setTerm}
              placeholder="Search scenarios, tickets, or jump to..."
              className="h-6 w-full bg-transparent text-sm placeholder:text-muted-foreground outline-none border-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            />
            {loading ? (
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            ) : term ? (
              <button
                type="button"
                onClick={() => setTerm('')}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear input"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center rounded border border-border/70 bg-background/80 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground shadow-2xs">
                ESC
              </kbd>
            )}
          </div>

          <Command.List className="scrollbar-thin max-h-[420px] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-8 text-center text-xs text-muted-foreground">
              {term.trim().length < 2
                ? 'Type at least two characters to search.'
                : `No scenarios match "${term}".`}
            </Command.Empty>

            {term.trim().length >= 2 && results.length > 0 && (
              <Command.Group
                heading="Scenarios"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {results.map((result) => (
                  <Command.Item
                    key={result.id}
                    value={`scenario-${result.id}-${result.slug}`}
                    onSelect={() => goScenario(result.slug)}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs data-[selected=true]:bg-accent"
                  >
                    <IconFileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{result.title}</span>
                      {result.summary && (
                        <span className="block truncate text-2xs text-muted-foreground">
                          {truncate(result.summary, 80)}
                        </span>
                      )}
                    </span>
                    {result.occurrence_count > 0 && (
                      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                        {result.occurrence_count}×
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {term.trim().length >= 2 && (
              <Command.Group
                heading="Actions"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                <Command.Item
                  value="action-full-search"
                  onSelect={goSearch}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs data-[selected=true]:bg-accent"
                >
                  <IconChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  See all results for "{term}"
                </Command.Item>
              </Command.Group>
            )}

            {term.trim().length < 2 && (
              <>
                <Command.Group
                  heading="Navigate"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  <PaletteLink
                    icon={<IconPlus className="h-3.5 w-3.5 text-[#E07E3C]" />}
                    label="Create new playbook"
                    onSelect={() => {
                      onOpenChange(false);
                      router.push('/scenarios/new');
                    }}
                  />
                  <PaletteLink
                    icon={<IconLayoutDashboard className="h-3.5 w-3.5" />}
                    label="Home"
                    onSelect={() => {
                      onOpenChange(false);
                      router.push('/');
                    }}
                  />
                  <PaletteLink
                    icon={<IconSparkles className="h-3.5 w-3.5" />}
                    label="Search all scenarios"
                    onSelect={() => {
                      onOpenChange(false);
                      router.push('/search');
                    }}
                  />
                  <PaletteLink
                    icon={<IconMatrix className="h-3.5 w-3.5" />}
                    label="Coverage matrix"
                    onSelect={() => {
                      onOpenChange(false);
                      router.push('/coverage');
                    }}
                  />
                </Command.Group>

                {accounts.length > 0 && (
                  <Command.Group
                    heading="Accounts"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {accounts.map((account) => (
                      <PaletteLink
                        key={account.id}
                        icon={
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: account.accent_color ?? '#94a3b8',
                            }}
                          />
                        }
                        label={account.name}
                        onSelect={() => {
                          onOpenChange(false);
                          router.push(`/accounts/${account.code}`);
                        }}
                      />
                    ))}
                  </Command.Group>
                )}

                {categories.length > 0 && (
                  <Command.Group
                    heading="Categories"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {categories.slice(0, 8).map((category) => (
                      <PaletteLink
                        key={category.id}
                        icon={<IconCategory className="h-3.5 w-3.5" />}
                        label={category.name}
                        onSelect={() => {
                          onOpenChange(false);
                          router.push(`/category/${category.slug}`);
                        }}
                      />
                    ))}
                  </Command.Group>
                )}
              </>
            )}
          </Command.List>

          <div className="flex items-center justify-between border-t px-4 py-2 text-2xs text-muted-foreground bg-muted/20">
            <span>
              {criteriaFields.length} criteria fields active
            </span>
            <span className="flex items-center gap-3">
              <span>
                <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px]">↵</kbd> open
              </span>
              <span>
                <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px]">esc</kbd> close
              </span>
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function PaletteLink({
  icon,
  label,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={`link-${label}`}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs data-[selected=true]:bg-accent',
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </Command.Item>
  );
}
