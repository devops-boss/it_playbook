'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  IconAlertTriangle,
  IconChartBar,
  IconClock,
  IconFileText,
  IconSearch,
  IconThumbUp,
  IconUsers,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatRelative } from '@/lib/utils';
import type { AnalyticsData } from '@/lib/data/admin';

/**
 * The analytics dashboard.
 *
 * It answers the questions a knowledge-base owner actually has: what do
 * people search for, what do they fail to find, what is out of date, and
 * where are the documentation gaps.
 */
export function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  return (
    <div className="space-y-4">
      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={IconFileText}
          label="Published scenarios"
          value={data.publishedScenarios}
          hint={`${data.draftScenarios} in draft or awaiting review`}
        />
        <StatCard
          icon={IconChartBar}
          label="Total scenarios"
          value={data.totalScenarios}
          hint="including unpublished"
        />
        <StatCard
          icon={IconUsers}
          label="Users"
          value={data.totalUsers}
          hint="with an account profile"
        />
        <StatCard
          icon={IconAlertTriangle}
          label="Documentation gaps"
          value={data.documentationGaps.length}
          hint="empty cells in the coverage matrix"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <IconSearch className="h-3.5 w-3.5" />
              Top searches
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5">
            {data.topSearches.length === 0 ? (
              <EmptyNote>No searches recorded yet.</EmptyNote>
            ) : (
              <ol className="space-y-1">
                {data.topSearches.map((search) => (
                  <li
                    key={search.query}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">{search.query}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {search.count}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <IconAlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Searches that found nothing
            </CardTitle>
            <p className="text-2xs text-muted-foreground">
              These are gaps in the knowledge base, not gaps in the search.
            </p>
          </CardHeader>
          <CardContent className="p-3.5">
            {data.zeroResultSearches.length === 0 ? (
              <EmptyNote>Every search found something.</EmptyNote>
            ) : (
              <ol className="space-y-1">
                {data.zeroResultSearches.map((search) => (
                  <li
                    key={search.query}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">{search.query}</span>
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      {search.count}×
                    </Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <IconThumbUp className="h-3.5 w-3.5" />
              Most helpful scenarios
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5">
            {data.mostHelpful.length === 0 ? (
              <EmptyNote>No feedback recorded yet.</EmptyNote>
            ) : (
              <ol className="space-y-1">
                {data.mostHelpful.map((scenario) => (
                  <li key={scenario.id} className="flex items-center gap-2 text-xs">
                    <Link
                      href={`/scenario/${scenario.slug}`}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {scenario.title}
                    </Link>
                    <span className="flex items-center gap-1 text-2xs">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {scenario.helpful}
                      </span>
                      {scenario.unhelpful > 0 && (
                        <span className="text-muted-foreground">
                          / {scenario.unhelpful}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <IconChartBar className="h-3.5 w-3.5" />
              Most frequent problems
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5">
            {data.mostFrequent.length === 0 ? (
              <EmptyNote>No occurrence data yet.</EmptyNote>
            ) : (
              <ol className="space-y-1">
                {data.mostFrequent.map((scenario) => (
                  <li key={scenario.id} className="flex items-center gap-2 text-xs">
                    <Link
                      href={`/scenario/${scenario.slug}`}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {scenario.title}
                    </Link>
                    {scenario.account_name && (
                      <span className="text-2xs text-muted-foreground">
                        {scenario.account_name}
                      </span>
                    )}
                    <span className="tabular-nums text-muted-foreground">
                      {scenario.occurrence_count}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Scenarios per account</CardTitle>
          </CardHeader>
          <CardContent className="p-3.5">
            <BarList
              rows={data.scenariosPerAccount.map((r) => ({
                label: r.account_name,
                value: r.count,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">
              Scenarios per category
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5">
            <BarList
              rows={data.scenariosPerCategory.map((r) => ({
                label: r.category_name,
                value: r.count,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
            <IconClock className="h-3.5 w-3.5" />
            Stale scenarios
          </CardTitle>
          <p className="text-2xs text-muted-foreground">
            Published but not updated recently. The threshold is configurable in
            Settings.
          </p>
        </CardHeader>
        <CardContent className="p-3.5">
          {data.staleScenarios.length === 0 ? (
            <EmptyNote>Everything published is up to date.</EmptyNote>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="py-1 text-left font-medium">Scenario</th>
                  <th className="py-1 text-left font-medium">Account</th>
                  <th className="py-1 text-right font-medium">Days</th>
                </tr>
              </thead>
              <tbody>
                {data.staleScenarios.map((scenario) => (
                  <tr key={scenario.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">
                      <Link
                        href={`/scenario/${scenario.slug}`}
                        className="hover:underline"
                      >
                        {scenario.title}
                      </Link>
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      {scenario.account_name ?? 'Global'}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-amber-600">
                      {scenario.days}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium">Documentation gaps</CardTitle>
          <p className="text-2xs text-muted-foreground">
            Category and account combinations with no scenarios written yet.
          </p>
        </CardHeader>
        <CardContent className="p-3.5">
          {data.documentationGaps.length === 0 ? (
            <EmptyNote>
              Every category is covered for every account. Nice work.
            </EmptyNote>
          ) : (
            <ul className="space-y-1">
              {data.documentationGaps.map((gap, index) => (
                <li key={index} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">
                    {gap.row_label} → {gap.col_label}
                  </span>
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                    0
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium">
            Recent configuration changes
          </CardTitle>
          <p className="text-2xs text-muted-foreground">
            Every configuration change is written to the audit log.
          </p>
        </CardHeader>
        <CardContent className="p-3.5">
          {data.recentConfigChanges.length === 0 ? (
            <EmptyNote>No configuration changes recorded.</EmptyNote>
          ) : (
            <ol className="space-y-1.5">
              {data.recentConfigChanges.map((change) => (
                <li key={change.id} className="flex items-center gap-2 text-xs">
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {change.action}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">
                    {change.config_type}
                    {change.config_id ? ` · ${change.config_id.slice(0, 8)}` : ''}
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {formatRelative(change.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-2xs font-medium uppercase tracking-wider">
            {label}
          </span>
        </div>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-2xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  if (rows.length === 0) return <EmptyNote>No data yet.</EmptyNote>;
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="w-40 shrink-0 truncate text-2xs">{row.label}</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-2xs tabular-nums text-muted-foreground">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      className={cn(
        'rounded-md border border-dashed p-3 text-center text-2xs text-muted-foreground',
      )}
    >
      {children}
    </p>
  );
}
