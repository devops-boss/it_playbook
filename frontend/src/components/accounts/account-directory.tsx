'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  IconArrowRight,
  IconBook,
  IconBuildingSkyscraper,
  IconCategory,
  IconClock,
  IconFlame,
  IconSearch,
  IconWorld,
  IconX,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AccountMetrics } from '@/types/database';

interface AccountDirectoryProps {
  accounts: AccountMetrics[];
}

export function AccountDirectory({ accounts }: AccountDirectoryProps) {
  const [search, setSearch] = React.useState('');
  const [filterMode, setFilterMode] = React.useState<'all' | 'has_playbooks'>('all');

  const filtered = React.useMemo(() => {
    let list = accounts;
    if (filterMode === 'has_playbooks') {
      list = list.filter((a) => a.total_playbooks > 0);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.account_name.toLowerCase().includes(q) ||
          a.account_code.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [accounts, search, filterMode]);

  return (
    <div className="p-6 space-y-6">
      {/* Directory Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Client Accounts Directory
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Browse troubleshooting procedures, incident history, and coverage across all client operations.
          </p>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={accounts.length > 0 ? `Search ${accounts.length} accounts...` : 'Search accounts...'}
              className="h-9 pl-9 pr-7 text-xs font-medium"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Account Cards Grid */}
      {filtered.length === 0 ? (
        <div className="my-12 rounded-2xl border border-dashed p-10 text-center">
          <IconBuildingSkyscraper className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <h3 className="text-sm font-bold text-foreground">No accounts found</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            No client accounts match "{search}".
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 h-8 text-xs"
            onClick={() => setSearch('')}
          >
            Clear Search
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((acc) => {
            const color = acc.accent_color ?? '#233B74';

            return (
              <Link
                key={acc.account_id}
                href={`/accounts/${acc.account_code}`}
                className="group block"
              >
                <Card className="h-full rounded-xl border transition-all duration-200 hover:border-primary/50 hover:bg-accent/15 hover:shadow-xs">
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-xs"
                          style={{ backgroundColor: color }}
                        >
                          {acc.account_code.slice(0, 3).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <CardTitle className="truncate text-xs font-bold group-hover:text-primary transition-colors">
                              {acc.account_name}
                            </CardTitle>
                            <Badge
                              variant="outline"
                              className="h-4 px-1 text-[9px] font-mono font-semibold"
                            >
                              {acc.account_code}
                            </Badge>
                          </div>
                          {acc.description && (
                            <CardDescription className="mt-0.5 line-clamp-1 text-[11px]">
                              {acc.description}
                            </CardDescription>
                          )}
                        </div>
                      </div>

                      <IconArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-primary" />
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 pt-0">
                    <div className="mt-2 grid grid-cols-3 gap-2 border-t pt-3 text-center">
                      <div className="rounded-md bg-muted/30 p-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                          Playbooks
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-foreground">
                          {acc.total_playbooks}
                        </p>
                      </div>

                      <div className="rounded-md bg-muted/30 p-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                          Dedicated
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-[#288FC2]">
                          {acc.account_specific_playbooks}
                        </p>
                      </div>

                      <div className="rounded-md bg-muted/30 p-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                          Incidents
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-orange-500">
                          {acc.total_occurrences}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
