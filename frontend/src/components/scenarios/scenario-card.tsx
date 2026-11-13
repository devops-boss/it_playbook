'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  IconBolt,
  IconBook2,
  IconBuildingSkyscraper,
  IconCheck,
  IconClock,
  IconCopy,
  IconFlame,
  IconGlobe,
  IconTicket,
  IconWorld,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { cn, chipStyle, formatRelative, truncate } from '@/lib/utils';
import type { ResolvedChip } from '@/lib/data/criteria-lookup';

export interface ScenarioCardProps {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  quickFix?: string | null;
  sampleTicketIds?: string[] | null;
  searchQuery?: string;
  occurrenceCount: number;
  lastOccurredAt: string | null;
  updatedAt: string;
  isGlobal: boolean;
  status: string;
  accountName?: string | null;
  chips: ResolvedChip[];
  onChipClick?: (chip: ResolvedChip) => void;
  className?: string;
  isDocumentation?: boolean;
}

function stripHtml(html?: string | null): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function highlightMatch(text: string, query?: string): React.ReactNode {
  if (!query || !query.trim()) return text;
  const terms = query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter((t) => t.length > 1);
  if (terms.length === 0) return text;

  try {
    const regex = new RegExp(`(${terms.join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark
          key={i}
          className="rounded bg-amber-200/80 px-0.5 font-bold text-amber-950 dark:bg-amber-900/60 dark:text-amber-200"
        >
          {part}
        </mark>
      ) : (
        part
      ),
    );
  } catch {
    return text;
  }
}

/**
 * Section 12 Enhanced Scenario Card.
 *
 * Displays:
 * 1. Title with keyword match highlighting.
 * 2. Account & Global badges.
 * 3. Quick Fix preview snippet styled with #E07E3C Big Outsource orange callout.
 * 4. HESK sample ticket badges with match highlights.
 * 5. Interactive criteria chips.
 * 6. Occurrence count, last occurred time, and last updated timestamp.
 */
export function ScenarioCard({
  title,
  slug,
  summary,
  quickFix,
  sampleTicketIds,
  searchQuery,
  occurrenceCount,
  lastOccurredAt,
  updatedAt,
  isGlobal,
  status,
  accountName,
  chips,
  onChipClick,
  className,
  isDocumentation,
}: ScenarioCardProps) {
  const cleanQuickFix = stripHtml(quickFix);

  return (
    <article
      className={cn(
        'group relative rounded-xl border bg-card p-4 card-hover hover:border-primary/50 hover:bg-accent/10',
        isDocumentation && 'hover:border-blue-500/50 hover:bg-blue-500/[0.03]',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Header Row: Title & Status / Scope Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-sm font-bold tracking-tight text-foreground hover:text-primary">
              <Link
                href={`/scenario/${slug}`}
                className="after:absolute after:inset-0 after:content-['']"
              >
                {highlightMatch(title, searchQuery)}
              </Link>
            </h3>

            {isDocumentation && (
              <Badge
                variant="outline"
                className="h-4 shrink-0 gap-1 px-1.5 text-[10px] text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/10 font-semibold"
                title="Documentation & SOP Guide"
              >
                <IconBook2 className="h-2.5 w-2.5" />
                Documentation
              </Badge>
            )}

            {isGlobal ? (
              <Badge
                variant="outline"
                className="h-4 shrink-0 gap-1 px-1.5 text-[10px] text-muted-foreground border-border/80"
                title={
                  isDocumentation
                    ? 'General Knowledge Base (Internal / Universal)'
                    : 'Applies to all accounts (Global Scenario)'
                }
              >
                {isDocumentation ? (
                  <IconGlobe className="h-2.5 w-2.5 text-blue-500" />
                ) : (
                  <IconWorld className="h-2.5 w-2.5 text-primary" />
                )}
                {isDocumentation ? 'General Knowledge Base' : 'Global Scenario'}
              </Badge>
            ) : accountName ? (
              <Badge
                variant="outline"
                className="h-4 shrink-0 gap-1 px-1.5 text-[10px] text-primary border-primary/30 bg-primary/5 font-medium"
              >
                <IconBuildingSkyscraper className="h-2.5 w-2.5" />
                {accountName}
              </Badge>
            ) : null}

            {status !== 'published' && (
              <Badge
                variant="secondary"
                className="h-4 shrink-0 px-1.5 text-[10px] font-medium capitalize"
              >
                {status.replace('_', ' ')}
              </Badge>
            )}
          </div>

          {/* Summary */}
          {summary && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {highlightMatch(truncate(summary, 200), searchQuery)}
            </p>
          )}

          {/* Quick Fix Preview Snippet (BOS Orange Accent Box) */}
          {cleanQuickFix && (
            <div className="relative z-10 mt-2.5 rounded-lg border border-[#E07E3C]/40 bg-[#E07E3C]/10 p-2.5 text-xs text-foreground">
              <div className="flex items-center gap-1.5 font-bold text-[#E07E3C]">
                <IconBolt className="h-3.5 w-3.5 shrink-0" />
                <span>Quick Fix</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-2xs leading-relaxed text-foreground/80">
                {highlightMatch(truncate(cleanQuickFix, 160), searchQuery)}
              </p>
            </div>
          )}

          {/* HESK Ticket Tracking IDs */}
          {sampleTicketIds && sampleTicketIds.length > 0 && (
            <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                HESK Tracking:
              </span>
              {sampleTicketIds.map((ticketId) => {
                const isMatch =
                  searchQuery &&
                  (ticketId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (searchQuery.match(/^\d{3,}$/) && ticketId.includes(searchQuery)));

                return (
                  <button
                    key={ticketId}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigator.clipboard.writeText(ticketId);
                      toast.success(`Copied ticket ID: ${ticketId}`);
                    }}
                    title="Click to copy tracking ID"
                    className="inline-flex items-center"
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        'h-4 gap-1 px-1.5 font-mono text-[10px] transition-colors cursor-pointer hover:border-primary/50',
                        isMatch
                          ? 'border-amber-500/80 bg-amber-500/15 font-bold text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/40'
                          : 'border-border/80 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <IconTicket className="h-2.5 w-2.5" />
                      <span>{ticketId}</span>
                      <IconCopy className="h-2 w-2 opacity-50 hover:opacity-100" />
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}

          {/* Criteria Chips */}
          {chips.length > 0 && (
            <div className="relative z-10 mt-2.5 flex flex-wrap gap-1">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChipClick?.(chip);
                  }}
                  className="chip-interactive"
                  style={chipStyle(chip.color)}
                  title={`Filter by ${chip.fieldLabel}: ${chip.label}`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {/* Footer Metadata */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-2xs text-muted-foreground">
            {occurrenceCount > 0 && (
              <span className="flex items-center gap-1 font-medium" title="Times this issue was reported">
                <IconFlame className="h-3 w-3 text-orange-500" />
                {occurrenceCount} {occurrenceCount === 1 ? 'incident' : 'incidents'}
              </span>
            )}
            {lastOccurredAt && (
              <span className="flex items-center gap-1" title="Last reported incident">
                <IconClock className="h-3 w-3" />
                Last occurred {formatRelative(lastOccurredAt)}
              </span>
            )}
            <span>Updated {formatRelative(updatedAt)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
