'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconBookmark,
  IconBookmarkFilled,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconFlame,
  IconFolder,
  IconGitFork,
  IconHistory,
  IconLoader2,
  IconPhoto,
  IconPrinter,
  IconShare,
  IconThumbDown,
  IconThumbUp,
  IconTrash,
  IconUser,
  IconWorld,
  IconX,
} from '@tabler/icons-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FlowchartViewer, FlowchartPrintView } from '@/components/flowchart/flowchart-viewer';
import { createClient } from '@/lib/supabase/client';
import { cn, chipStyle, formatDate, formatRelative } from '@/lib/utils';
import { htmlToText } from '@/lib/sanitize';
import type { ResolvedChip } from '@/lib/data/criteria-lookup';
import type {
  Attachment,
  NodeType,
  Outcome,
  SampleTicket,
  Scenario,
  SectionDefinition,
} from '@/types/database';

export interface ScenarioReaderProps {
  scenario: Scenario;
  chips: ResolvedChip[];
  sections: SectionDefinition[];
  tickets: SampleTicket[];
  attachments: Attachment[];
  related: { slug: string; title: string; relation_type: string }[];
  flowchart: { nodes: any[]; edges: any[] } | null;
  nodeTypes: NodeType[];
  outcomes: Outcome[];
  accountNames: Record<string, string>;
  categoryName: string | null;
  canEdit: boolean;
  isFavorite: boolean;
  ticketUrlTemplate: string | null;
  userId: string;
  siblingScenarios?: { id: string; slug: string; title: string }[];
  nextScenario?: { id: string; slug: string; title: string } | null;
  authorName?: string | null;
  authorPhotoUrl?: string | null;
}

type ReadingMode = 'quick' | 'full';

export function ScenarioReader({
  scenario,
  chips,
  sections,
  tickets,
  attachments,
  related,
  flowchart,
  nodeTypes,
  outcomes,
  accountNames,
  categoryName,
  canEdit,
  isFavorite,
  ticketUrlTemplate,
  userId,
  siblingScenarios = [],
  nextScenario,
  authorName,
  authorPhotoUrl,
}: ScenarioReaderProps) {
  const router = useRouter();
  const [mode, setModeState] = React.useState<ReadingMode>('quick');
  const [favorite, setFavorite] = React.useState(isFavorite);
  const [helpful, setHelpful] = React.useState<boolean | null>(null);
  const [activeSection, setActiveSection] = React.useState<string>('');
  const [zoomedImage, setZoomedImage] = React.useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = React.useState<Set<number>>(new Set());
  const contentRef = React.useRef<HTMLDivElement>(null);

  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const handleDelete = async () => {
    if (!scenario?.id || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/scenarios/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: scenario.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to delete playbook');
      }
      toast.success('Playbook deleted successfully');
      setShowDeleteModal(false);
      router.push('/');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Error deleting playbook');
      setDeleting(false);
    }
  };

  // Restore saved reading mode preference from localStorage
  React.useEffect(() => {
    try {
      const savedMode = localStorage.getItem('bos_reading_mode') as ReadingMode | null;
      if (savedMode === 'quick' || savedMode === 'full') {
        setModeState(savedMode);
      }
    } catch {
      // LocalStorage unavailable
    }
  }, []);

  // Record view in pb_view_history for Recently Viewed list
  React.useEffect(() => {
    if (!scenario?.id) return;
    fetch('/api/scenarios/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: scenario.id }),
    }).catch((err) => {
      console.debug('View history record note:', err);
    });
  }, [scenario?.id]);

  const setMode = (newMode: ReadingMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem('bos_reading_mode', newMode);
    } catch {
      // LocalStorage unavailable
    }
  };

  // Sections shown in order honoring admin config
  const activeSections = React.useMemo(
    () => sections.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [sections],
  );

  // Quick Fix mode surfaces fix-oriented sections
  const quickSections = React.useMemo(
    () =>
      activeSections.filter((s) =>
        ['quick_fix', 'flowchart', 'resolutions'].includes(s.key),
      ),
    [activeSections],
  );

  const visibleSections = mode === 'quick' ? quickSections : activeSections;

  // Scroll-spy: track which section is currently in view
  React.useEffect(() => {
    if (!contentRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: '-56px 0px -70% 0px', threshold: [0, 1] },
    );

    for (const section of visibleSections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [visibleSections]);

  const toggleFavorite = async () => {
    const next = !favorite;
    setFavorite(next);
    try {
      const res = await fetch('/api/scenarios/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: scenario.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not update favorites');
      }
      setFavorite(data.isFavorite);
      toast.success(data.isFavorite ? 'Scenario added to favorites' : 'Removed from favorites');
      router.refresh();
    } catch (err: any) {
      setFavorite(!next);
      toast.error(err?.message || 'Could not update your favorites.');
    }
  };

  const sendFeedback = async (isHelpful: boolean) => {
    setHelpful(isHelpful);
    const supabase = createClient();
    const { error } = await supabase.from('pb_feedback').insert({
      user_id: userId,
      scenario_id: scenario.id,
      is_helpful: isHelpful,
    });
    if (error) {
      setHelpful(!isHelpful);
      toast.error('Could not record feedback.');
      return;
    }
    toast.success('Thanks! Feedback helps keep this playbook accurate.');
  };

  const copyQuickFix = async () => {
    await navigator.clipboard.writeText(htmlToText(scenario.quick_fix));
    toast.success('Quick fix copied to clipboard');
  };

  // Plain-text formatted copy for HESK ticket replies
  const copyForTicket = async () => {
    const lines: string[] = [];
    lines.push(`Scenario: ${scenario.title}`);
    lines.push('----------------------------------------');

    if (scenario.quick_fix) {
      lines.push('QUICK FIX:');
      lines.push(htmlToText(scenario.quick_fix));
      lines.push('');
    }

    if (scenario.workarounds) {
      lines.push('WORKAROUND:');
      try {
        const parsed = JSON.parse(scenario.workarounds);
        if (Array.isArray(parsed)) {
          parsed.forEach((w) => lines.push(`• ${w.title}: ${w.details || ''}`));
        } else {
          lines.push(htmlToText(scenario.workarounds));
        }
      } catch {
        lines.push(htmlToText(scenario.workarounds));
      }
      lines.push('');
    }

    if (scenario.resolutions) {
      lines.push('RESOLUTION STEPS:');
      try {
        const parsed = JSON.parse(scenario.resolutions);
        if (Array.isArray(parsed)) {
          parsed.forEach((r, idx) => {
            lines.push(`${idx + 1}. ${r.instruction}`);
            if (r.command) lines.push(`   Command: ${r.command}`);
            if (r.imageUrl) lines.push(`   Attachment: ${r.imageUrl}`);
          });
        } else {
          lines.push(htmlToText(scenario.resolutions));
        }
      } catch {
        lines.push(htmlToText(scenario.resolutions));
      }
      lines.push('');
    }

    if (scenario.escalation) {
      try {
        const esc = typeof scenario.escalation === 'string' ? JSON.parse(scenario.escalation) : scenario.escalation;
        if (esc.level_1 || esc.level_2) {
          lines.push('ESCALATION PATH:');
          if (esc.level_1) lines.push(`• Tier 1: ${esc.level_1}`);
          if (esc.level_2) lines.push(`• Tier 2: ${esc.level_2}`);
          if (esc.sla_minutes) lines.push(`• SLA: ${esc.sla_minutes} min`);
        }
      } catch {
        // ignore
      }
    }

    if (tickets.length > 0) {
      lines.push('');
      lines.push(`REFERENCE HESK TICKETS: ${tickets.map((t) => t.ticket_id).join(', ')}`);
    }

    await navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Formatted resolution copied for HESK ticket');
  };

  const shareLink = async () => {
    if (typeof window !== 'undefined') {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Scenario link copied to clipboard');
    }
  };

  const printPage = () => {
    if (typeof window !== 'undefined') {
      try {
        toast.dismiss();
      } catch {}
      if (mode !== 'full') {
        setModeState('full');
        setTimeout(() => {
          try {
            toast.dismiss();
          } catch {}
          window.print();
        }, 150);
      } else {
        window.print();
      }
    }
  };

  const toggleStep = (stepNumber: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) {
        next.delete(stepNumber);
      } else {
        next.add(stepNumber);
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* -------------------------------------------------------------------- */}
      {/* LEFT ZONE: Outline of other scenarios in same account/category with  */}
      {/* Next scenario navigation button                                      */}
      {/* -------------------------------------------------------------------- */}
      <aside className="hidden w-64 shrink-0 border-r xl:block bg-background/50 print:hidden">
        <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <IconFolder className="h-3.5 w-3.5 text-primary" />
              {categoryName || 'Scenarios'}
            </span>
            {siblingScenarios.length > 0 && (
              <Badge variant="outline" className="h-4 px-1 text-[10px]">
                {siblingScenarios.length}
              </Badge>
            )}
          </div>

          {/* Sibling Scenarios list */}
          <nav aria-label="Related scenarios in category" className="space-y-1">
            {siblingScenarios.map((s) => {
              const isCurrent = s.id === scenario.id;
              return (
                <Link
                  key={s.id}
                  href={`/scenario/${s.slug}`}
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                    isCurrent
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      isCurrent ? 'bg-primary' : 'bg-muted-foreground/40 group-hover:bg-foreground',
                    )}
                  />
                  <span className="truncate">{s.title}</span>
                </Link>
              );
            })}
          </nav>

          {/* Next scenario button */}
          {nextScenario && nextScenario.id !== scenario.id && (
            <div className="mt-4 rounded-lg border bg-muted/40 p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Next Scenario
              </span>
              <Link
                href={`/scenario/${nextScenario.slug}`}
                className="mt-1.5 flex items-center justify-between gap-1 text-xs font-medium text-primary hover:underline"
              >
                <span className="truncate">{nextScenario.title}</span>
                <IconArrowRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* -------------------------------------------------------------------- */}
      {/* CENTER ZONE: Header with chips, Quick Fix (#E07E3C), problem + zoom, */}
      {/* flowchart, HESK tracking tickets, causes, workarounds, resolutions,  */}
      {/* escalation, prevention, attachments, related scenarios               */}
      {/* -------------------------------------------------------------------- */}
      <div className="min-w-0 flex-1 animate-fade-in">
        <div className="border-b px-6 py-4 bg-card/40 print:hidden">
          <div className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
            {categoryName && (
              <span className="font-medium text-foreground">{categoryName}</span>
            )}
            {scenario.account_id && accountNames[scenario.account_id] && (
              <>
                <IconChevronRight className="h-3 w-3" />
                <span>{accountNames[scenario.account_id]}</span>
              </>
            )}
            {scenario.is_global && (
              <Badge variant="outline" className="h-4 gap-1 px-1 text-[10px]">
                <IconWorld className="h-2.5 w-2.5" />
                Global
              </Badge>
            )}
          </div>

          <h1 className="mt-1.5 text-2xl font-bold leading-tight tracking-tight">
            {scenario.title}
          </h1>

          {chips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span key={chip.key} className="chip text-2xs" style={chipStyle(chip.color)}>
                  {chip.label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-2xs text-muted-foreground">
            {/* Author and Date Created */}
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              {authorPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={authorPhotoUrl}
                  alt={authorName || 'Author'}
                  className="h-5 w-5 rounded-full object-cover ring-1 ring-border/50 shrink-0"
                  style={{ width: '20px', height: '20px', maxWidth: '20px', maxHeight: '20px' }}
                />
              ) : (
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary ring-1 ring-primary/20"
                  style={{ width: '20px', height: '20px' }}
                >
                  {(authorName || 'IT').slice(0, 2).toUpperCase()}
                </span>
              )}
              <span>Created by {authorName || 'IT Operations Team'}</span>
            </span>
            <span className="flex items-center gap-1">
              <span>on {formatDate(scenario.created_at)}</span>
            </span>
            <span className="text-muted-foreground/50">•</span>
            {scenario.occurrence_count > 0 && (
              <span className="flex items-center gap-1 font-medium text-[#E07E3C]">
                <IconFlame className="h-3.5 w-3.5" />
                Reported {scenario.occurrence_count}×
              </span>
            )}
            {scenario.last_occurred_at && (
              <span className="flex items-center gap-1">
                <IconClock className="h-3.5 w-3.5" />
                Last occurred {formatRelative(scenario.last_occurred_at)}
              </span>
            )}
            <span>Updated {formatRelative(scenario.updated_at)}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">v{scenario.version}</span>
          </div>

          {/* Sample Tickets in Header */}
          {tickets.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 pt-2.5 border-t border-border/50">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                Sample Tickets:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {tickets.map((ticket) => (
                  <TicketBadge
                    key={ticket.id}
                    ticketId={ticket.ticket_id}
                    ticketUrlTemplate={ticketUrlTemplate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Reading Mode Switcher & Quick Header Actions */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-md border bg-muted/40 p-0.5">
              <Button
                variant={mode === 'quick' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-2xs font-medium"
                onClick={() => setMode('quick')}
              >
                <IconBolt className="mr-1 h-3 w-3" />
                Quick Fix Mode
              </Button>
              <Button
                variant={mode === 'full' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-2xs font-medium"
                onClick={() => setMode('full')}
              >
                Full Playbook
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-2xs"
                onClick={printPage}
              >
                <IconPrinter className="h-3.5 w-3.5" />
                Export PDF / Print
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-2xs"
                onClick={copyForTicket}
              >
                <IconCopy className="h-3.5 w-3.5" />
                Copy for Ticket
              </Button>

              {canEdit && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-2xs"
                    onClick={() => router.push(`/scenarios/${scenario.slug}/edit`)}
                  >
                    <IconEdit className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-2xs"
                    onClick={() => router.push(`/scenarios/${scenario.slug}/history`)}
                  >
                    <IconHistory className="h-3.5 w-3.5" />
                    History
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-2xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setShowDeleteModal(true)}
                    title="Delete Playbook"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Center content stream */}
        <div ref={contentRef} className="px-6 py-6 max-w-4xl print:max-w-none print:p-0">
          {/* ==================================================================== */}
          {/* PRINT-ONLY FORMAL DOCUMENTATION HEADER (A4 SOP Format)               */}
          {/* ==================================================================== */}
          <div className="hidden print:block mb-6 pb-2">
            {/* Top Corporate Banner */}
            <div className="flex items-center justify-between pb-3 mb-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="Big Outsource Logo"
                  className="h-9 w-auto object-contain"
                />
                <div>
                  <div className="text-sm font-bold tracking-tight text-[#233B74]">
                    BIG OUTSOURCE
                  </div>
                  <div className="text-[9pt] font-semibold uppercase tracking-wider text-black">
                    IT Operations Playbook • Standard Operating Procedure
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-[#233B74]">
                  DOC REF: SOP-{scenario.slug.toUpperCase()}
                </div>
                <div className="text-[9pt] text-black">
                  Version: v{scenario.version} • Status: {scenario.status.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Document Title in Dark Blue #233B74 */}
            <h1 className="text-xl font-bold tracking-tight text-[#233B74] mb-3">
              {scenario.title}
            </h1>

            {/* Formal Technical Document Metadata Table */}
            <table className="w-full text-left text-xs border border-[#233B74] border-collapse mb-2">
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="p-1.5 font-bold w-1/4 bg-slate-50 text-[#233B74]">Document Title:</td>
                  <td className="p-1.5 w-1/4 text-black">{scenario.title}</td>
                  <td className="p-1.5 font-bold w-1/4 bg-slate-50 text-[#233B74]">Document ID:</td>
                  <td className="p-1.5 w-1/4 font-mono text-black">SOP-{scenario.slug.toUpperCase()}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-1.5 font-bold bg-slate-50 text-[#233B74]">Author / Created By:</td>
                  <td className="p-1.5 text-black">
                    <span>{authorName || 'IT Operations Team'}</span>
                  </td>
                  <td className="p-1.5 font-bold bg-slate-50 text-[#233B74]">Date Created:</td>
                  <td className="p-1.5 text-black">{formatDate(scenario.created_at)}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-1.5 font-bold bg-slate-50 text-[#233B74]">Category:</td>
                  <td className="p-1.5 text-black">{categoryName || 'General IT Operations'}</td>
                  <td className="p-1.5 font-bold bg-slate-50 text-[#233B74]">Last Revised:</td>
                  <td className="p-1.5 text-black">{formatDate(scenario.updated_at)}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-1.5 font-bold bg-slate-50 text-[#233B74]">Scope / Target Account:</td>
                  <td className="p-1.5 text-black">
                    {scenario.is_global
                      ? 'Global IT Operations'
                      : scenario.account_id && accountNames[scenario.account_id]
                      ? accountNames[scenario.account_id]
                      : 'Account Specific'}
                  </td>
                  <td className="p-1.5 font-bold bg-slate-50 text-[#233B74]">Classification:</td>
                  <td className="p-1.5 text-black">Internal IT SOP Documentation</td>
                </tr>
                {tickets.length > 0 && (
                  <tr>
                    <td className="p-1.5 font-bold bg-slate-50 text-[#233B74]">Tracking Tickets:</td>
                    <td colSpan={3} className="p-1.5 font-mono text-black">
                      {tickets.map((t) => t.ticket_id).join(', ')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {visibleSections.map((section) => (
            <ScenarioSection
              key={section.id}
              section={section}
              scenario={scenario}
              tickets={tickets}
              attachments={attachments}
              related={related}
              flowchart={flowchart}
              nodeTypes={nodeTypes}
              outcomes={outcomes}
              ticketUrlTemplate={ticketUrlTemplate}
              onCopyQuickFix={copyQuickFix}
              completedSteps={completedSteps}
              onToggleStep={toggleStep}
              onImageClick={(src) => setZoomedImage(src)}
            />
          ))}

          {visibleSections.length === 0 && (
            <p className="rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
              This scenario has no content configured yet.
            </p>
          )}

          {/* Feedback prompt at bottom of center zone */}
          <div className="mt-10 flex items-center justify-between rounded-xl border bg-card/60 p-4 print:hidden">
            <div>
              <p className="text-xs font-semibold">Did this resolve the ticket issue?</p>
              <p className="text-2xs text-muted-foreground">
                Your feedback helps the Big Outsource IT team refine runbooks.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={helpful === true ? 'default' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-2xs"
                onClick={() => sendFeedback(true)}
              >
                <IconThumbUp className="h-3.5 w-3.5" />
                Yes, Resolved
              </Button>
              <Button
                variant={helpful === false ? 'destructive' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-2xs"
                onClick={() => sendFeedback(false)}
              >
                <IconThumbDown className="h-3.5 w-3.5" />
                No, Escalated
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* RIGHT ZONE: Sticky "On this page" outline with scroll-spy, and       */}
      {/* action toolbar (Copy for ticket, Favorite, Share link, Print)        */}
      {/* -------------------------------------------------------------------- */}
      <aside className="hidden w-56 shrink-0 border-l lg:block bg-background/50 print:hidden">
        <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto p-4 space-y-4">
          <div>
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Actions
            </p>
            <div className="space-y-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full justify-start gap-2 text-2xs font-medium"
                onClick={copyForTicket}
              >
                <IconCopy className="h-3.5 w-3.5 text-primary" />
                Copy for Ticket
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2 text-2xs font-medium"
                onClick={toggleFavorite}
              >
                {favorite ? (
                  <IconBookmarkFilled className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <IconBookmark className="h-3.5 w-3.5" />
                )}
                {favorite ? 'Saved to Favorites' : 'Save to Favorites'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2 text-2xs font-medium"
                onClick={shareLink}
              >
                <IconShare className="h-3.5 w-3.5" />
                Share Link
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2 text-2xs font-medium"
                onClick={printPage}
              >
                <IconPrinter className="h-3.5 w-3.5" />
                Export PDF / Print
              </Button>
            </div>
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              On this page
            </p>
            <nav aria-label="Sections of this scenario">
              <ul className="space-y-0.5 border-l">
                {visibleSections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      data-scroll-active={activeSection === section.id}
                      className={cn(
                        '-ml-px block border-l-2 border-transparent py-1 pl-3 text-xs text-muted-foreground transition-colors',
                        'hover:text-foreground',
                        activeSection === section.id &&
                          'border-primary font-medium text-primary hover:text-primary',
                      )}
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {mode === 'quick' && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 h-7 w-full text-2xs"
              onClick={() => setMode('full')}
            >
              Show Full Details
            </Button>
          )}
        </div>
      </aside>

      {/* Click-to-Zoom Image Modal Lightbox */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <Button
              variant="secondary"
              size="icon"
              className="absolute -top-3 -right-3 h-8 w-8 rounded-full shadow-lg"
              onClick={() => setZoomedImage(null)}
            >
              <IconX className="h-4 w-4" />
            </Button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomedImage}
              alt="Zoomed diagram"
              className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Delete Playbook Confirmation Dialog */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <IconTrash className="h-5 w-5" />
              Delete Playbook
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              Are you sure you want to delete this playbook? This action will permanently remove it from all listings.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/40 p-3 my-2 text-xs">
            <div className="font-semibold text-foreground truncate">{scenario.title}</div>
            <div className="text-muted-foreground mt-0.5 text-[11px]">
              Slug: {scenario.slug}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={deleting}
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? 'Deleting…' : 'Yes, Delete Playbook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Scenario Section Renderer
// ----------------------------------------------------------------------------
function ScenarioSection({
  section,
  scenario,
  tickets,
  attachments,
  related,
  flowchart,
  nodeTypes,
  outcomes,
  ticketUrlTemplate,
  onCopyQuickFix,
  completedSteps,
  onToggleStep,
  onImageClick,
}: {
  section: SectionDefinition;
  scenario: Scenario;
  tickets: SampleTicket[];
  attachments: Attachment[];
  related: { slug: string; title: string; relation_type: string }[];
  flowchart: { nodes: any[]; edges: any[] } | null;
  nodeTypes: NodeType[];
  outcomes: Outcome[];
  ticketUrlTemplate: string | null;
  onCopyQuickFix: () => void;
  completedSteps: Set<number>;
  onToggleStep: (step: number) => void;
  onImageClick: (src: string) => void;
}) {
  const content = sectionContent(section.key, scenario, flowchart, nodeTypes);
  if (!content) return null;

  return (
    <section
      id={section.id}
      className={cn(
        'mb-8 scroll-mt-20',
        section.key === 'attachments' && 'print:hidden',
      )}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-tight uppercase text-muted-foreground flex items-center gap-1.5 print:text-[#233B74] print:font-bold print:border-none print:mt-4 print:mb-2 print:text-base">
          {section.key === 'quick_fix' && <IconBolt className="h-4 w-4 text-[#E07E3C] print:hidden" />}
          {section.label}
        </h2>
        {section.key === 'quick_fix' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-2xs text-[#E07E3C] hover:text-[#E07E3C] print:hidden"
            onClick={onCopyQuickFix}
          >
            <IconCopy className="h-3 w-3" />
            Copy Fix
          </Button>
        )}
      </div>

      {/* QUICK FIX BOX: Prominent #E07E3C on screen, Clean text callout in print without any side bars */}
      {section.key === 'quick_fix' ? (
        <div className="rounded-xl border-2 border-[#E07E3C]/50 bg-[#E07E3C]/10 dark:bg-[#E07E3C]/15 p-4 shadow-sm space-y-3 print:border-none print:bg-transparent print:p-0 print:m-0 print:shadow-none">
          <RichText html={scenario.quick_fix} onImageClick={onImageClick} />
          {tickets.length > 0 && (
            <div className="pt-2.5 border-t border-[#E07E3C]/20 flex flex-wrap items-center gap-2 print:border-none print:pt-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#E07E3C] print:text-[#233B74] print:font-bold">
                Reference Tickets:
              </span>
              <div className="flex flex-wrap gap-1.5 print:hidden">
                {tickets.map((t) => (
                  <TicketBadge
                    key={t.id}
                    ticketId={t.ticket_id}
                    ticketUrlTemplate={ticketUrlTemplate}
                    className="bg-background/90"
                  />
                ))}
              </div>
              <span className="hidden print:inline font-mono text-xs text-black">
                {tickets.map((t) => t.ticket_id).join(', ')}
              </span>
            </div>
          )}
        </div>
      ) : section.key === 'symptoms' ? (
        <div className="rounded-lg border bg-card/60 p-4 print:border-0 print:bg-transparent print:p-0">
          <RichText html={scenario.symptoms} onImageClick={onImageClick} />
        </div>
      ) : section.key === 'flowchart' ? (
        flowchart && flowchart.nodes.length > 0 ? (
          <div>
            <div className="print:hidden">
              <FlowchartViewer
                nodes={flowchart.nodes}
                edges={flowchart.edges}
                nodeTypes={nodeTypes.map((t) => ({
                  key: t.key,
                  label: t.label,
                  color: t.color,
                  icon: t.icon,
                }))}
              />
            </div>
            <div className="hidden print:block">
              <FlowchartPrintView
                nodes={flowchart.nodes}
                edges={flowchart.edges}
                nodeTypes={nodeTypes.map((t) => ({
                  key: t.key,
                  label: t.label,
                  color: t.color,
                  icon: t.icon,
                }))}
              />
            </div>
          </div>
        ) : (
          /* Flowchart Placeholder Area - Hidden in print */
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-5 text-center print:hidden">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconGitFork className="h-5 w-5" />
            </div>
            <h3 className="mt-2 text-xs font-semibold">Troubleshooting Decision Tree</h3>
            <p className="mt-1 text-2xs text-muted-foreground max-w-md mx-auto">
              Interactive decision flow is active for this playbook. Follow the numbered resolution steps and diagnostic commands below.
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 text-2xs font-mono text-muted-foreground">
              <span className="rounded border bg-background px-2 py-0.5">Symptom Check</span>
              <span>→</span>
              <span className="rounded border border-primary/40 bg-primary/5 text-primary px-2 py-0.5 font-medium">Diagnostic</span>
              <span>→</span>
              <span className="rounded border bg-background px-2 py-0.5">Resolution</span>
            </div>
          </div>
        )
      ) : section.key === 'sample_tickets' ? (
        <SampleTicketsList
          tickets={tickets}
          outcomes={outcomes}
          ticketUrlTemplate={ticketUrlTemplate}
        />
      ) : section.key === 'causes' ? (
        <CausesList causesJson={scenario.causes} onImageClick={onImageClick} />
      ) : section.key === 'workarounds' ? (
        <WorkaroundsList workaroundsJson={scenario.workarounds} onImageClick={onImageClick} />
      ) : section.key === 'resolutions' ? (
        <ResolutionsList
          resolutionsJson={scenario.resolutions}
          completedSteps={completedSteps}
          onToggleStep={onToggleStep}
          onImageClick={onImageClick}
        />
      ) : section.key === 'escalation' ? (
        <EscalationList escalationJson={scenario.escalation} onImageClick={onImageClick} />
      ) : section.key === 'prevention' ? (
        <div className="rounded-lg border bg-card/60 p-4 print:border-0 print:bg-transparent print:p-0">
          <RichText html={scenario.prevention} onImageClick={onImageClick} />
        </div>
      ) : section.key === 'attachments' ? (
        <AttachmentsList attachments={attachments} />
      ) : section.key === 'related' ? (
        related.length > 0 ? (
          <div>
            <div className="grid gap-2 sm:grid-cols-2 print:hidden">
              {related.map((rel) => (
                <Link
                  key={rel.slug}
                  href={`/scenario/${rel.slug}`}
                  className="flex items-center justify-between rounded-lg border bg-card p-3 text-xs transition-colors hover:border-primary/50 hover:bg-muted/30"
                >
                  <div>
                    <div className="font-semibold text-foreground">{rel.title}</div>
                    <div className="text-[10px] text-muted-foreground capitalize">
                      {rel.relation_type.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <IconChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
            <ul className="hidden print:block text-xs text-black space-y-1">
              {related.map((rel) => (
                <li key={rel.slug}>
                  • {rel.title} ({rel.relation_type.replace(/_/g, ' ')}) — Ref: SOP-{rel.slug.toUpperCase()}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground print:text-black">No related scenarios linked yet.</p>
        )
      ) : (
        <RichText html={content} onImageClick={onImageClick} />
      )}
    </section>
  );
}

function sectionContent(
  key: string,
  scenario: Scenario,
  flowchart: { nodes: any[]; edges: any[] } | null,
  nodeTypes: NodeType[],
): string | null {
  switch (key) {
    case 'quick_fix':
      return scenario.quick_fix;
    case 'symptoms':
      return scenario.symptoms;
    case 'flowchart':
      return 'flowchart';
    case 'sample_tickets':
      return 'tickets';
    case 'causes':
      return scenario.causes;
    case 'workarounds':
      return scenario.workarounds;
    case 'resolutions':
      return scenario.resolutions;
    case 'escalation':
      return scenario.escalation;
    case 'prevention':
      return scenario.prevention;
    case 'attachments':
      return 'attachments';
    case 'related':
      return 'related';
    default: {
      const custom = scenario.custom_sections as Record<string, string> | null;
      return custom?.[key] ?? null;
    }
  }
}

// ----------------------------------------------------------------------------
// HESK Sample Tickets: ONLY Tracking IDs as Clickable Badge Links with Copy Button
// ----------------------------------------------------------------------------
function TicketBadge({
  ticketId,
  ticketUrlTemplate,
  className,
}: {
  ticketId: string;
  ticketUrlTemplate?: string | null;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(ticketId);
    setCopied(true);
    toast.success(`Copied ticket ID: ${ticketId}`);
    setTimeout(() => setCopied(false), 2000);
  };

  const href = ticketUrlTemplate
    ? ticketUrlTemplate
        .replace('{ticket_id}', encodeURIComponent(ticketId))
        .replace('{ID}', encodeURIComponent(ticketId))
    : null;

  return (
    <div
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-lg border bg-card py-1 pl-2.5 pr-1.5 text-xs font-mono shadow-2xs transition-all hover:border-primary/50',
        className,
      )}
    >
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-primary hover:underline flex items-center gap-1"
          title="Open in HESK"
        >
          {ticketId}
          <IconExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100" />
        </a>
      ) : (
        <span className="font-semibold text-foreground">{ticketId}</span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Copy Tracking ID"
      >
        {copied ? (
          <IconCheck className="h-3 w-3 text-emerald-600" />
        ) : (
          <IconCopy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

function SampleTicketsList({
  tickets,
  ticketUrlTemplate,
}: {
  tickets: SampleTicket[];
  outcomes?: Outcome[];
  ticketUrlTemplate: string | null;
}) {
  if (tickets.length === 0) {
    return (
      <p className="text-xs text-muted-foreground print:text-black">
        No sample tickets recorded yet.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 print:hidden">
        {tickets.map((ticket) => (
          <TicketBadge
            key={ticket.id}
            ticketId={ticket.ticket_id}
            ticketUrlTemplate={ticketUrlTemplate}
          />
        ))}
      </div>
      <p className="hidden print:block text-xs font-mono text-black">
        {tickets.map((t) => t.ticket_id).join(', ')}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Possible Causes: Formatted list with probability badges
// ----------------------------------------------------------------------------
function CausesList({
  causesJson,
  onImageClick,
}: {
  causesJson: string | null;
  onImageClick: (src: string) => void;
}) {
  if (!causesJson) return null;

  let causes: { title: string; probability?: string }[] = [];
  try {
    const parsed = JSON.parse(causesJson);
    if (Array.isArray(parsed)) causes = parsed;
  } catch {
    return <RichText html={causesJson} onImageClick={onImageClick} />;
  }

  if (causes.length === 0) return <RichText html={causesJson} onImageClick={onImageClick} />;

  return (
    <div className="space-y-2 print:space-y-1">
      {causes.map((c, idx) => (
        <div key={idx} className="flex items-center justify-between rounded-lg border bg-card px-3.5 py-2.5 text-xs print:border-0 print:p-0 print:block">
          <span className="font-medium text-foreground print:text-[#233B74] print:font-bold">• {c.title}</span>
          {c.probability && (
            <>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-1.5 py-0.5 print:hidden',
                  c.probability.toLowerCase() === 'high' && 'border-red-500/40 text-red-600 bg-red-500/10',
                  c.probability.toLowerCase() === 'medium' && 'border-amber-500/40 text-amber-600 bg-amber-500/10',
                  c.probability.toLowerCase() === 'low' && 'border-slate-500/40 text-slate-600 bg-slate-500/10',
                )}
              >
                {c.probability} Probability
              </Badge>
              <span className="hidden print:inline text-xs text-black ml-1.5 font-normal">
                ({c.probability} Probability)
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Workarounds: Formatted list
// ----------------------------------------------------------------------------
function WorkaroundsList({
  workaroundsJson,
  onImageClick,
}: {
  workaroundsJson: string | null;
  onImageClick: (src: string) => void;
}) {
  if (!workaroundsJson) return null;

  let workarounds: { title: string; details?: string }[] = [];
  try {
    const parsed = JSON.parse(workaroundsJson);
    if (Array.isArray(parsed)) workarounds = parsed;
  } catch {
    return <RichText html={workaroundsJson} onImageClick={onImageClick} />;
  }

  if (workarounds.length === 0) return <RichText html={workaroundsJson} onImageClick={onImageClick} />;

  return (
    <div className="space-y-2.5 print:space-y-2">
      {workarounds.map((w, idx) => (
        <div key={idx} className="rounded-lg border bg-card p-3 text-xs print:border-0 print:p-0">
          <div className="font-semibold text-foreground print:text-[#233B74] print:font-bold">• {w.title}</div>
          {w.details && <p className="mt-1 text-2xs text-muted-foreground print:text-black print:text-xs leading-relaxed print:pl-3">{w.details}</p>}
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Resolution Steps: Checkable numbered list with copyable command blocks
// ----------------------------------------------------------------------------
function ResolutionsList({
  resolutionsJson,
  completedSteps,
  onToggleStep,
  onImageClick,
}: {
  resolutionsJson: string | null;
  completedSteps: Set<number>;
  onToggleStep: (step: number) => void;
  onImageClick: (src: string) => void;
}) {
  if (!resolutionsJson) return null;

  let steps: {
    step: number;
    instruction: string;
    command?: string | null;
    imageUrl?: string | null;
    imageCaption?: string | null;
  }[] = [];
  try {
    const parsed = JSON.parse(resolutionsJson);
    if (Array.isArray(parsed)) steps = parsed;
  } catch {
    return <RichText html={resolutionsJson} onImageClick={onImageClick} />;
  }

  if (steps.length === 0) return <RichText html={resolutionsJson} onImageClick={onImageClick} />;

  const copyCommand = async (cmd: string) => {
    await navigator.clipboard.writeText(cmd);
    toast.success('Command copied to clipboard');
  };

  return (
    <div className="space-y-3 print:space-y-2">
      {steps.map((s, idx) => {
        const stepNum = s.step ?? idx + 1;
        const isDone = completedSteps.has(stepNum);

        return (
          <div
            key={idx}
            className={cn(
              'rounded-xl border p-4 transition-all print:border-0 print:p-0 print:shadow-none print:mb-3 print:break-inside-avoid',
              isDone ? 'bg-muted/40 border-primary/30 opacity-75' : 'bg-card border-border shadow-sm',
            )}
          >
            <div className="flex items-start gap-3 print:block">
              <button
                type="button"
                onClick={() => onToggleStep(stepNum)}
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors print:hidden',
                  isDone
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40 hover:border-primary',
                )}
                aria-label={`Mark step ${stepNum} complete`}
              >
                {isDone && <IconCheck className="h-3.5 w-3.5 stroke-[3]" />}
              </button>

              <div className="min-w-0 flex-1">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary print:text-[10.5pt] print:font-bold print:text-[#233B74]">
                    Step {stepNum}:{' '}
                  </span>
                  <span className="text-xs leading-relaxed text-foreground print:text-[10pt] print:text-black">
                    {s.instruction}
                  </span>
                </div>

                {s.command && (
                  <div className="mt-2.5 flex items-center justify-between rounded-lg bg-zinc-950 px-3 py-2 font-mono text-2xs text-zinc-200 print:mt-1.5 print:p-2 print:bg-slate-50 print:text-black print:border print:border-slate-300 print:rounded-none">
                    <span className="truncate print:whitespace-pre-wrap print:break-all pr-2 font-mono text-[9pt]">{s.command}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 gap-1 px-1.5 text-[10px] text-zinc-400 hover:text-zinc-100 print:hidden"
                      onClick={() => copyCommand(s.command!)}
                    >
                      <IconCopy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                )}

                {s.imageUrl && (
                  <div className="mt-3 overflow-hidden rounded-lg border bg-muted/20 p-2 max-w-lg print:max-w-none print:border-none print:bg-transparent print:p-0 print:my-3 print:break-inside-avoid">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.imageUrl}
                      alt={s.imageCaption || `Step ${stepNum} screenshot`}
                      className="max-h-64 w-auto rounded object-contain cursor-zoom-in hover:opacity-90 transition-opacity bg-background print:max-h-96 print:w-auto print:rounded-none"
                      onClick={() => onImageClick(s.imageUrl!)}
                    />
                    {s.imageCaption && (
                      <p className="mt-1.5 text-2xs font-medium text-muted-foreground flex items-center gap-1.5 print:text-black print:text-xs print:italic print:mt-1">
                        <IconPhoto className="h-3 w-3 shrink-0 text-primary print:hidden" />
                        <span>Figure: {s.imageCaption}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Escalation Path
// ----------------------------------------------------------------------------
function EscalationList({
  escalationJson,
  onImageClick,
}: {
  escalationJson: string | null;
  onImageClick: (src: string) => void;
}) {
  if (!escalationJson) return null;

  try {
    const esc = JSON.parse(escalationJson);
    return (
      <div className="grid gap-3 sm:grid-cols-2 print:block print:space-y-1">
        {esc.level_1 && (
          <div className="rounded-lg border bg-card p-3.5 text-xs print:border-0 print:p-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground print:text-[#233B74] print:font-bold print:text-xs">
              Tier 1 Support:
            </span>
            <span className="mt-1 text-foreground print:text-black print:text-xs ml-2">{esc.level_1}</span>
          </div>
        )}
        {esc.level_2 && (
          <div className="rounded-lg border bg-card p-3.5 text-xs print:border-0 print:p-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground print:text-[#233B74] print:font-bold print:text-xs">
              Tier 2 / Escalation:
            </span>
            <span className="mt-1 text-foreground print:text-black print:text-xs ml-2">{esc.level_2}</span>
            {esc.sla_minutes && (
              <span className="text-2xs text-muted-foreground print:text-black print:text-xs ml-2">
                (SLA: {esc.sla_minutes} min)
              </span>
            )}
          </div>
        )}
      </div>
    );
  } catch {
    return <RichText html={escalationJson} onImageClick={onImageClick} />;
  }
}

// ----------------------------------------------------------------------------
// Attachments List with Signed URLs (Screen & Print Table)
// ----------------------------------------------------------------------------
function ReaderAttachmentRow({ attachment }: { attachment: Attachment }) {
  const [downloading, setDownloading] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  const getResolvedUrl = async () => {
    let url = attachment.signed_url;
    if (url) {
      if (url.includes('kong:8000')) {
        url = url.replace(/https?:\/\/kong:8000/i, '');
      }
      return url;
    }
    const supabase = createClient();
    const { data: signed } = await supabase.storage
      .from('scenario-attachments')
      .createSignedUrl(attachment.file_path, 3600);
    let signedUrl = signed?.signedUrl;
    if (signedUrl && signedUrl.includes('kong:8000')) {
      signedUrl = signedUrl.replace(/https?:\/\/kong:8000/i, '');
    }
    if (signedUrl) return signedUrl;

    const { data: blob } = await supabase.storage
      .from('scenario-attachments')
      .download(attachment.file_path);
    if (blob) return URL.createObjectURL(blob);
    return null;
  };

  const handlePreview = async () => {
    setPreviewOpen(true);
    if (previewUrl) return;
    setPreviewLoading(true);
    try {
      const url = await getResolvedUrl();
      if (url) setPreviewUrl(url);
    } catch (err) {
      console.error('Preview error:', err);
      toast.error('Could not load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await getResolvedUrl();
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.file_name;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      throw new Error('Download failed');
    } catch (err: any) {
      toast.error(err?.message || 'Could not download attachment');
    } finally {
      setDownloading(false);
    }
  };

  const ext = attachment.file_name.split('.').pop()?.toUpperCase() || 'FILE';

  return (
    <>
      <li className="flex items-center justify-between rounded-lg border bg-card p-2.5 text-xs hover:border-primary/40 transition-colors">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Badge variant="outline" className="text-[10px] h-5 font-mono px-1.5 uppercase shrink-0 bg-muted/50">
            {ext}
          </Badge>
          <span className="truncate font-medium text-foreground">{attachment.file_name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {attachment.file_size && (
            <span className="text-2xs tabular-nums text-muted-foreground mr-1">
              {formatBytes(attachment.file_size)}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePreview}
            className="h-7 gap-1 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            title={`Preview ${attachment.file_name}`}
          >
            <IconEye className="h-3.5 w-3.5" />
            <span>View</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
            className="h-7 gap-1 px-2.5 text-[11px] font-medium hover:bg-primary hover:text-primary-foreground"
          >
            <IconDownload className="h-3.5 w-3.5" />
            <span>{downloading ? 'Downloading...' : 'Download'}</span>
          </Button>
        </div>
      </li>

      {/* Floating Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-hidden">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="outline" className="text-2xs font-mono uppercase px-1.5 py-0.5">
                {ext}
              </Badge>
              <DialogTitle className="truncate text-sm font-semibold">
                {attachment.file_name}
              </DialogTitle>
              {attachment.file_size && (
                <span className="text-2xs text-muted-foreground">
                  ({formatBytes(attachment.file_size)})
                </span>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto py-3 min-h-[350px] flex items-center justify-center bg-muted/10 rounded-lg border">
            {previewLoading ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
                <IconLoader2 className="h-6 w-6 animate-spin text-primary" />
                <span>Loading preview...</span>
              </div>
            ) : !previewUrl ? (
              <div className="text-center p-6 text-muted-foreground text-xs">
                Could not load preview. Click download below to inspect file.
              </div>
            ) : (
              (() => {
                const lowerExt = ext.toLowerCase();
                const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(lowerExt);
                const isPdf = lowerExt === 'pdf';
                const isText = ['txt', 'log', 'csv', 'json', 'yaml', 'yml', 'xml', 'md', 'sh', 'ps1', 'bat'].includes(lowerExt);

                if (isImage) {
                  return (
                    <img
                      src={previewUrl}
                      alt={attachment.file_name}
                      className="max-h-[65vh] max-w-full object-contain rounded shadow-xs"
                    />
                  );
                }
                if (isPdf) {
                  return (
                    <iframe
                      src={previewUrl}
                      title={attachment.file_name}
                      className="w-full h-[65vh] rounded border-0"
                    />
                  );
                }
                if (isText) {
                  return (
                    <iframe
                      src={previewUrl}
                      title={attachment.file_name}
                      className="w-full h-[65vh] rounded border-0 bg-background font-mono text-xs p-2"
                    />
                  );
                }
                return (
                  <div className="flex flex-col items-center gap-3 p-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-foreground">
                      <IconFileText className="h-7 w-7" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{attachment.file_name}</p>
                      <p className="mt-1 text-2xs text-muted-foreground max-w-sm">
                        This file format ({ext}) cannot be rendered directly in the floating preview. Click below to download and view.
                      </p>
                    </div>
                    <Button size="sm" onClick={handleDownload} className="mt-2 h-8 gap-1.5 text-xs font-medium">
                      <IconDownload className="h-3.5 w-3.5" />
                      <span>Download File</span>
                    </Button>
                  </div>
                );
              })()
            )}
          </div>

          <DialogFooter className="border-t pt-3 flex items-center justify-between sm:justify-between w-full">
            <span className="text-2xs text-muted-foreground">Attachment Preview</span>
            <div className="flex items-center gap-2">
              {previewUrl && (
                <Button variant="outline" size="sm" asChild className="h-8 gap-1 text-xs">
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                    <IconExternalLink className="h-3.5 w-3.5" />
                    <span>Open in New Tab</span>
                  </a>
                </Button>
              )}
              <Button size="sm" onClick={handleDownload} className="h-8 gap-1 text-xs">
                <IconDownload className="h-3.5 w-3.5" />
                <span>Download</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AttachmentsList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) {
    return <p className="text-xs text-muted-foreground">No attachments uploaded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Screen Interactive List */}
      <ul className="space-y-1.5 print:hidden">
        {attachments.map((attachment) => (
          <ReaderAttachmentRow key={attachment.id} attachment={attachment} />
        ))}
      </ul>

      {/* Print-Only Structured Table */}
      <div className="hidden print:block border border-zinc-300 rounded overflow-hidden">
        <table className="w-full text-left text-2xs border-collapse">
          <thead>
            <tr className="bg-zinc-100 border-b border-zinc-300 text-zinc-900">
              <th className="p-2 font-semibold w-10">#</th>
              <th className="p-2 font-semibold">Document / File Name</th>
              <th className="p-2 font-semibold">Type</th>
              <th className="p-2 font-semibold text-right">Size</th>
            </tr>
          </thead>
          <tbody>
            {attachments.map((att, idx) => (
              <tr key={att.id} className="border-b border-zinc-200 last:border-b-0">
                <td className="p-2 text-zinc-600">{idx + 1}</td>
                <td className="p-2 font-medium text-zinc-900">{att.file_name}</td>
                <td className="p-2 text-zinc-600">{att.mime_type || 'Attached Document'}</td>
                <td className="p-2 text-right tabular-nums text-zinc-600">
                  {att.file_size ? formatBytes(att.file_size) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ----------------------------------------------------------------------------
// Rich Text Renderer with Click-to-Zoom Hook
// ----------------------------------------------------------------------------
function RichText({
  html,
  onImageClick,
}: {
  html: string | null;
  onImageClick?: (src: string) => void;
}) {
  const [safe, setSafe] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    import('@/lib/sanitize').then(({ sanitizeHtml }) => {
      if (!cancelled) setSafe(sanitizeHtml(html));
    });
    return () => {
      cancelled = true;
    };
  }, [html]);

  React.useEffect(() => {
    if (!containerRef.current || !onImageClick) return;
    const images = containerRef.current.querySelectorAll('img');
    const handlers: { img: HTMLImageElement; handler: () => void }[] = [];

    images.forEach((img) => {
      img.style.cursor = 'zoom-in';
      const handler = () => onImageClick(img.src);
      img.addEventListener('click', handler);
      handlers.push({ img, handler });
    });

    return () => {
      handlers.forEach(({ img, handler }) => img.removeEventListener('click', handler));
    };
  }, [safe, onImageClick]);

  if (!html) {
    return <p className="text-xs text-muted-foreground">Not documented yet.</p>;
  }

  return (
    <div
      ref={containerRef}
      className="prose-scenario"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
