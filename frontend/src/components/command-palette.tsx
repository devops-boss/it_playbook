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
        className="gap-0 overflow-hidden p-0 sm:max-w-xl sm:rounded-2xl rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-background/95 dark:bg-slate-900/95 shadow-2xl backdrop-blur-xl transition-all"
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
          {/* Header without internal blue border; uniform aesthetic */}
          <div className="relative flex items-center gap-3 border-b border-border/60 dark:border-slate-800/80 px-4 py-3 bg-muted/20">
            <IconSearch className="h-4 w-4 shrink-0 text-muted-foreground/80" />
            <Command.Input
              value={term}
              onValueChange={setTerm}
              placeholder="Search scenarios, symptoms, tickets, or jump to..."
              className="h-7 w-full bg-transparent text-sm placeholder:text-muted-foreground outline-none border-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {loading ? (
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            ) : term ? (
              <button
                type="button"
                onClick={() => setTerm('')}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
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

          <Command.List className="scrollbar-thin max-h-[420px] overflow-y-auto p-2">
            <Command.Empty className="px-4 py-10 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground mb-2.5">
                <IconSearch className="h-5 w-5 opacity-70" />
              </div>
              <p className="text-xs font-medium text-foreground">
                {term.trim().length < 2
                  ? 'Type at least two characters to search.'
                  : `No scenarios match "${term}".`}
              </p>
              <p className="text-2xs text-muted-foreground mt-0.5">
                {term.trim().length < 2
                  ? 'Search by title, symptom, error code, or keyword.'
                  : 'Try adjusting your search query or navigate using options below.'}
              </p>
            </Command.Empty>

            {term.trim().length >= 2 && results.length > 0 && (
              <Command.Group
                heading="Scenarios"
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {results.map((result) => (
                  <Command.Item
                    key={result.id}
                    value={`scenario-${result.id}-${result.slug}`}
                    onSelect={() => goScenario(result.slug)}
                    className="group flex cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2 text-xs transition-colors duration-150 data-[selected=true]:bg-accent/80 hover:bg-accent/50"
                  >
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-data-[selected=true]:text-primary transition-colors">
                      <IconFileText className="h-3.5 w-3.5" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground group-data-[selected=true]:text-primary">
                        {result.title}
                      </span>
                      {result.summary && (
                        <span className="block truncate text-2xs text-muted-foreground mt-0.5">
                          {truncate(result.summary, 85)}
                        </span>
                      )}
                    </span>
                    {result.occurrence_count > 0 && (
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-2xs tabular-nums text-muted-foreground font-mono">
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
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                <Command.Item
                  value="action-full-search"
                  onSelect={goSearch}
                  className="group flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-colors duration-150 data-[selected=true]:bg-accent/80 hover:bg-accent/50"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted text-primary group-data-[selected=true]:bg-primary/10 transition-colors">
                      <IconSearch className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-medium text-foreground group-data-[selected=true]:text-primary">
                      See all results for &ldquo;{term}&rdquo;
                    </span>
                  </div>
                  <IconChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-60 group-data-[selected=true]:opacity-100 group-data-[selected=true]:translate-x-0.5 transition-all" />
                </Command.Item>
              </Command.Group>
            )}

            {term.trim().length < 2 && (
              <>
                <Command.Group
                  heading="Navigate"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
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
                    className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
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
                    className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
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

          <div className="flex items-center justify-between border-t border-border/60 dark:border-slate-800/80 px-4 py-2.5 text-2xs text-muted-foreground bg-muted/20">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{criteriaFields.length} criteria active</span>
            </span>
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px] shadow-2xs">↑↓</kbd>
                <span>navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px] shadow-2xs">↵</kbd>
                <span>open</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px] shadow-2xs">esc</kbd>
                <span>close</span>
              </span>
            </div>
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
        'group flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-colors duration-150 data-[selected=true]:bg-accent/80 hover:bg-accent/50',
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground group-data-[selected=true]:text-primary transition-colors">
          {icon}
        </span>
        <span className="truncate font-medium text-foreground group-data-[selected=true]:text-primary">
          {label}
        </span>
      </div>
      <IconChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
    </Command.Item>
  );
}
