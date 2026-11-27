'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  IconAlertCircle,
  IconArchive,
  IconArrowLeft,
  IconBook2,
  IconCheck,
  IconCopy,
  IconDeviceFloppy,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconFlame,
  IconHistory,
  IconLoader2,
  IconPaperclip,
  IconPhoto,
  IconPlus,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from './rich-text-editor';
import { ClassificationStep, type ClassificationValue } from './classification-step';
import { VersionHistoryDrawer } from './version-history-drawer';
import { FlowchartEditor } from '../flowchart/flowchart-editor';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type {
  Account,
  Category,
  CriteriaField,
  CriteriaOption,
  NodeType,
  Outcome,
  SampleTicket,
  Scenario,
  SectionDefinition,
} from '@/types/database';

interface ScenarioEditorProps {
  scenario: Scenario | null;
  fields: CriteriaField[];
  optionsByField: Record<string, CriteriaOption[]>;
  categories: Category[];
  accounts: Account[];
  sections: SectionDefinition[];
  nodeTypes: NodeType[];
  outcomes: Outcome[];
  tickets: SampleTicket[];
  userId: string;
  allScenarios?: Pick<Scenario, 'id' | 'slug' | 'title'>[];
  initialAccountId?: string | null;
  initialCategoryId?: string | null;
  initialTitle?: string | null;
}

interface EditorState {
  title: string;
  summary: string;
  quick_fix: string;
  symptoms: string;
  causes: string;
  workarounds: string;
  resolutions: string;
  escalation: string;
  prevention: string;
  custom_sections: Record<string, string>;
  status: Scenario['status'];
  is_global: boolean;
  account_ids: string[];
  tags: string[];
}

const EMPTY_STATE: EditorState = {
  title: '',
  summary: '',
  quick_fix: '',
  symptoms: '',
  causes: '',
  workarounds: '',
  resolutions: '',
  escalation: '',
  prevention: '',
  custom_sections: {},
  status: 'draft',
  is_global: false,
  account_ids: [],
  tags: [],
};

export function ScenarioEditor(props: ScenarioEditorProps) {
  const router = useRouter();
  const {
    scenario,
    fields,
    optionsByField,
    categories,
    accounts,
    sections,
    nodeTypes,
    outcomes,
    tickets,
    userId,
    allScenarios = [],
    initialAccountId = null,
    initialCategoryId = null,
    initialTitle = null,
  } = props;

  const isGlobalInitial =
    initialAccountId === '00000000-0000-0000-0000-000000000000' ||
    initialAccountId?.toUpperCase() === 'GLOBAL';

  const [state, setState] = React.useState<EditorState>(() => ({
    ...EMPTY_STATE,
    title: initialTitle ?? '',
    is_global: isGlobalInitial,
    account_ids: isGlobalInitial || !initialAccountId ? [] : [initialAccountId],
  }));
  const [classification, setClassification] = React.useState<ClassificationValue>(() => ({
    system: {
      account: isGlobalInitial || !initialAccountId ? null : initialAccountId,
      category: initialCategoryId ?? null,
    },
    custom: {},
  }));
  const [step, setStepState] = React.useState<number>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('step');
      const n = parseInt(p ?? '', 10);
      if (!isNaN(n) && n >= 0) return n;
    }
    return 0;
  });

  const setStep = React.useCallback((nextStep: number | ((prev: number) => number)) => {
    setStepState((prev) => {
      const target = typeof nextStep === 'function' ? nextStep(prev) : nextStep;
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('step', String(target));
        window.history.replaceState(null, '', url.toString());
      }
      return target;
    });
  }, []);

  const [saving, setSaving] = React.useState(false);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [currentScenarioId, setCurrentScenarioId] = React.useState<string | null>(scenario?.id ?? null);
  const [currentScenarioSlug, setCurrentScenarioSlug] = React.useState<string | null>(scenario?.slug ?? null);
  const [sampleTickets, setSampleTickets] = React.useState<SampleTicket[]>(tickets ?? []);
  const [relatedScenarios, setRelatedScenarios] = React.useState<{ id: string; title: string; slug: string }[]>([]);

  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const targetScenarioIdForDelete = currentScenarioId || scenario?.id;

  const handleDelete = async () => {
    if (!targetScenarioIdForDelete || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/scenarios/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetScenarioIdForDelete }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to delete playbook');
      }
      toast.success('Playbook deleted successfully');
      hasEditsRef.current = false;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('drafts-updated'));
      }
      setShowDeleteModal(false);
      router.push('/');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Error deleting playbook');
      setDeleting(false);
    }
  };
  const [flowchart, setFlowchart] = React.useState<{
    nodes: any[];
    edges: any[];
  }>({ nodes: [], edges: [] });
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [newTag, setNewTag] = React.useState('');
  const [playbookType, setPlaybookType] = React.useState<'scenario' | 'documentation'>(() => {
    const raw = (scenario?.custom_sections as any)?.playbook_type;
    if (raw === 'documentation' || raw === 'sop') return 'documentation';
    if (scenario?.tags?.includes('documentation') || scenario?.tags?.includes('sop')) return 'documentation';
    return 'scenario';
  });
  const [confirmPublishOpen, setConfirmPublishOpen] = React.useState(false);
  const [confirmDraftOpen, setConfirmDraftOpen] = React.useState(false);

  // Unsaved changes & navigation intercept states
  const [leaveConfirmOpen, setLeaveConfirmOpen] = React.useState(false);
  const [pendingDestination, setPendingDestination] = React.useState<string | null>(null);
  const initialSnapshotRef = React.useRef<string | null>(null);
  const isLoadedRef = React.useRef(!scenario);

  const getContentSnapshot = React.useCallback(
    (
      st: EditorState,
      fc: any,
      cls?: { system: Record<string, string | null>; custom: Record<string, string[]> },
      tks?: SampleTicket[],
      rels?: { id: string }[],
    ) => {
      return JSON.stringify({
        title: (st.title || '').trim(),
        summary: (st.summary || '').trim(),
        quick_fix: (st.quick_fix || '').trim(),
        symptoms: (st.symptoms || '').trim(),
        causes: (st.causes || '').trim(),
        workarounds: (st.workarounds || '').trim(),
        resolutions: (st.resolutions || '').trim(),
        escalation: (st.escalation || '').trim(),
        prevention: (st.prevention || '').trim(),
        custom_sections: st.custom_sections || {},
        tags: st.tags || [],
        account_ids: st.account_ids || [],
        nodes: fc?.nodes?.length ?? 0,
        edges: fc?.edges?.length ?? 0,
        category: cls?.system?.category ?? null,
        tickets: (tks ?? []).map((t) => t.ticket_id).sort().join(','),
        related: (rels ?? []).map((r) => r.id).sort().join(','),
      });
    },
    [],
  );

  const handlePlaybookTypeChange = (type: 'scenario' | 'documentation') => {
    setPlaybookType(type);
    if (type === 'documentation') {
      setState((prev) => ({
        ...prev,
        is_global: true,
        account_id: null,
        account_ids: [],
        custom_sections: {
          ...prev.custom_sections,
          playbook_type: 'documentation',
        },
        tags: prev.tags.includes('documentation') ? prev.tags : [...prev.tags, 'documentation'],
      }));
      setClassification((prev) => ({
        ...prev,
        system: { ...prev.system, account: null },
      }));
    } else {
      setState((prev) => ({
        ...prev,
        custom_sections: {
          ...prev.custom_sections,
          playbook_type: 'scenario',
        },
        tags: prev.tags.filter((t) => t !== 'documentation' && t !== 'sop'),
      }));
    }
  };

  // Seed form once on mount to prevent clobbering active user typing/dragging
  const initialSeededIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (scenario) {
      if (initialSeededIdRef.current === scenario.id) return;
      initialSeededIdRef.current = scenario.id;
      setState({
        title: scenario.title,
        summary: scenario.summary ?? '',
        quick_fix: scenario.quick_fix ?? '',
        symptoms: scenario.symptoms ?? '',
        causes: scenario.causes ?? '',
        workarounds: scenario.workarounds ?? '',
        resolutions: scenario.resolutions ?? '',
        escalation: scenario.escalation ?? '',
        prevention: scenario.prevention ?? '',
        custom_sections: (scenario.custom_sections ?? {}) as Record<string, string>,
        status: scenario.status,
        is_global: scenario.is_global,
        account_ids: scenario.account_id ? [scenario.account_id] : [],
        tags: scenario.tags ?? [],
      });
      setClassification({
        system: {
          account: scenario.account_id,
          category: scenario.category_id,
          issue_type: scenario.issue_type_id,
          severity: scenario.severity_id,
          impact_scope: scenario.impact_scope_id,
        },
        custom: {},
      });
    } else {
      if (initialSeededIdRef.current === '__new__') return;
      initialSeededIdRef.current = '__new__';
      if (initialTitle) {
        setState((prev) => ({ ...prev, title: initialTitle }));
      }
      if (initialAccountId) {
        if (isGlobalInitial) {
          setState((prev) => ({
            ...prev,
            is_global: true,
            account_ids: [],
          }));
          setClassification((prev) => ({
            ...prev,
            system: {
              ...prev.system,
              account: null,
              ...(initialCategoryId ? { category: initialCategoryId } : {}),
            },
          }));
        } else {
          setState((prev) => ({
            ...prev,
            is_global: false,
            account_ids: [initialAccountId],
          }));
          setClassification((prev) => ({
            ...prev,
            system: {
              ...prev.system,
              account: initialAccountId,
              ...(initialCategoryId ? { category: initialCategoryId } : {}),
            },
          }));
        }
      } else if (initialCategoryId) {
        setClassification((prev) => ({
          ...prev,
          system: {
            ...prev.system,
            category: initialCategoryId,
          },
        }));
      }
      if (!isLoadedRef.current) {
        isLoadedRef.current = true;
        initialSnapshotRef.current = getContentSnapshot(
          {
            ...state,
            title: initialTitle ?? '',
            account_ids: initialAccountId ? (isGlobalInitial ? [] : [initialAccountId]) : [],
            is_global: isGlobalInitial,
          },
          { nodes: [], edges: [] },
        );
      }
    }
  }, [scenario, initialAccountId, initialCategoryId, initialTitle, isGlobalInitial, getContentSnapshot]);

  // Load custom criteria values, flowchart, and scenario accounts ONCE on mount
  const initialLoadedExtraIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!scenario) return;
    if (initialLoadedExtraIdRef.current === scenario.id) return;
    initialLoadedExtraIdRef.current = scenario.id;
    let cancelled = false;

    const load = async () => {
      const supabase = createClient();
      const [values, flow, accountsRes, ticketsRes, relatedRes] = await Promise.all([
        supabase
          .from('pb_scenario_criteria_values')
          .select('*')
          .eq('scenario_id', scenario.id),
        supabase
          .from('pb_flowcharts')
          .select('*')
          .eq('scenario_id', scenario.id)
          .maybeSingle(),
        supabase
          .from('pb_scenario_accounts')
          .select('account_id')
          .eq('scenario_id', scenario.id),
        supabase
          .from('pb_sample_tickets')
          .select('*')
          .eq('scenario_id', scenario.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('pb_related_scenarios')
          .select('related_scenario_id')
          .eq('scenario_id', scenario.id),
      ]);
      if (cancelled) return;

      const custom: Record<string, string[]> = {};
      for (const value of values.data ?? []) {
        const id = value.option_id ?? value.value_text ?? '';
        if (!id) continue;
        custom[value.field_id] = [...(custom[value.field_id] ?? []), id];
      }
      setClassification((prev) => ({ ...prev, custom }));
      setFlowchart({
        nodes: (flow.data as any)?.nodes ?? [],
        edges: (flow.data as any)?.edges ?? [],
      });

      const linkedAccountIds = (accountsRes.data ?? []).map((r: any) => r.account_id);
      if (linkedAccountIds.length > 0) {
        setState((prev) => ({ ...prev, account_ids: linkedAccountIds }));
      } else if (scenario.account_id) {
        setState((prev) => ({ ...prev, account_ids: [scenario.account_id!] }));
      }

      let loadedTickets: SampleTicket[] = tickets ?? [];
      if (ticketsRes.data && ticketsRes.data.length > 0) {
        loadedTickets = ticketsRes.data as SampleTicket[];
        setSampleTickets(loadedTickets);
      }

      let loadedRelated: { id: string; title: string; slug: string }[] = [];
      if (relatedRes.data && relatedRes.data.length > 0) {
        const relIds = new Set(relatedRes.data.map((r: any) => r.related_scenario_id));
        loadedRelated = allScenarios.filter((s) => relIds.has(s.id));
        setRelatedScenarios(loadedRelated);
      }

      isLoadedRef.current = true;
      initialSnapshotRef.current = getContentSnapshot(
        {
          ...state,
          account_ids: linkedAccountIds.length > 0 ? linkedAccountIds : (scenario.account_id ? [scenario.account_id] : []),
        },
        flow.data ?? { nodes: [], edges: [] },
        classification,
        loadedTickets,
        loadedRelated,
      );
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [scenario?.id]);

  const update = (patch: Partial<EditorState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  const hasUserEditedOrAddedText = React.useMemo(() => {
    if (!isLoadedRef.current) return false;

    const hasAnyContent = Boolean(
      (state.title && state.title.trim().length > 0 && state.title !== (initialTitle ?? '')) ||
      (state.summary && state.summary.trim().length > 0) ||
      (state.quick_fix && state.quick_fix.trim().length > 0) ||
      (state.symptoms && state.symptoms.trim().length > 0) ||
      (state.causes && state.causes.trim().length > 0) ||
      (state.workarounds && state.workarounds.trim().length > 0) ||
      (state.resolutions && state.resolutions.trim().length > 0) ||
      (state.escalation && state.escalation.trim().length > 0) ||
      (state.prevention && state.prevention.trim().length > 0) ||
      (state.tags && state.tags.length > 0) ||
      (state.account_ids && state.account_ids.length > 0) ||
      classification.system.category ||
      classification.system.issue_type ||
      (flowchart?.nodes && flowchart.nodes.length > 0) ||
      (sampleTickets && sampleTickets.length > 0) ||
      (relatedScenarios && relatedScenarios.length > 0) ||
      (state.custom_sections &&
        Object.values(state.custom_sections).some(
          (v) => typeof v === 'string' && v.trim().length > 0 && v !== 'scenario' && v !== 'documentation',
        ))
    );

    // If completely empty and pristine: don't ask
    if (!hasAnyContent) return false;

    // For brand new unsaved scenario: if user entered anything: prompt before leaving
    if (!scenario) return true;

    // For drafts, ensure user always has confirmation before leaving on all steps
    if (state.status === 'draft') return true;

    // For existing published scenario: compare with initial snapshot
    if (!initialSnapshotRef.current) return false;
    const currentSnapshot = getContentSnapshot(state, flowchart, classification, sampleTickets, relatedScenarios);
    return currentSnapshot !== initialSnapshotRef.current;
  }, [scenario, state, flowchart, classification, sampleTickets, relatedScenarios, initialTitle, getContentSnapshot]);

  const hasEditsRef = React.useRef(hasUserEditedOrAddedText);
  React.useEffect(() => {
    hasEditsRef.current = hasUserEditedOrAddedText;
  }, [hasUserEditedOrAddedText]);

  // Click interceptor for links across app (sidebar, top bar, logo, breadcrumbs, etc.)
  React.useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      if (!hasEditsRef.current) return;

      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;

      const rawHref = anchor.getAttribute('href');
      if (!rawHref) return;

      if (rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      try {
        const destUrl = new URL(anchor.href, window.location.href);
        if (
          destUrl.origin === window.location.origin &&
          destUrl.pathname === window.location.pathname &&
          destUrl.search === window.location.search
        ) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        setPendingDestination(destUrl.pathname + destUrl.search + destUrl.hash);
        setLeaveConfirmOpen(true);
      } catch {}
    };

    window.addEventListener('click', handleAnchorClick, true);
    return () => {
      window.removeEventListener('click', handleAnchorClick, true);
    };
  }, []);

  // Handle browser back button and tab close
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasEditsRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const handlePopState = (e: PopStateEvent) => {
      if (hasEditsRef.current) {
        window.history.pushState(null, '', window.location.href);
        setPendingDestination('__BACK__');
        setLeaveConfirmOpen(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleSaveDraftAndLeave = async () => {
    setSaving(true);
    try {
      const fallbackTitle = state.title.trim() || 'Untitled Draft';
      const res = await persist(false, 'draft', {
        silent: true,
        defaultTitle: fallbackTitle,
      });

      if (res && res.id) {
        toast.success('Playbook saved as draft');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('drafts-updated'));
        }
        hasEditsRef.current = false;
        setLeaveConfirmOpen(false);

        if (pendingDestination === '__BACK__') {
          window.history.back();
        } else if (pendingDestination) {
          window.location.href = pendingDestination;
        }
      } else {
        toast.error('Failed to save draft. Please try again.');
        setSaving(false);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error saving draft');
      setSaving(false);
    }
  };

  const handleDiscardAndLeave = () => {
    hasEditsRef.current = false;
    setLeaveConfirmOpen(false);

    if (pendingDestination === '__BACK__') {
      window.history.back();
    } else if (pendingDestination) {
      window.location.href = pendingDestination;
    }
  };

  const handleCancelLeave = () => {
    setLeaveConfirmOpen(false);
    setPendingDestination(null);
  };

  // Steps - Adapting for Troubleshooting Scenario vs Documentation / SOP
  const steps = React.useMemo(() => {
    if (playbookType === 'documentation') {
      const docBase = [
        { key: 'classification', label: '1. Document Setup & Scope' },
        { key: 'problem', label: '2. Overview & Prerequisites' },
        { key: 'resolutions', label: '3. Step-by-Step Setup Guide' },
        { key: 'flowchart', label: '4. Architecture / Diagram' },
        { key: 'workarounds', label: '5. Notes & Verification' },
        { key: 'attachments', label: '6. Attachments & Files' },
        { key: 'related', label: '7. Related Documentation' },
      ];
      return [...docBase, { key: 'review', label: 'Review & Publish' }];
    }

    const base = [
      { key: 'classification', label: '1. Playbook Setup & Scope' },
      { key: 'problem', label: '2. Problem & Symptoms' },
      { key: 'flowchart', label: '3. Flowchart' },
      { key: 'tickets', label: '4. Sample Tickets' },
      { key: 'causes', label: '5. Causes' },
      { key: 'workarounds', label: '6. Workarounds' },
      { key: 'resolutions', label: '7. Resolutions' },
      { key: 'escalation', label: '8. Escalation' },
      { key: 'attachments', label: '9. Attachments' },
      { key: 'related', label: '10. Related Scenarios' },
    ];

    const custom = sections
      .filter((s) => s.is_active && !BASE_SECTION_KEYS.has(s.key))
      .map((s, idx) => ({ key: s.key, label: `${11 + idx}. ${s.label}` }));

    return [...base, ...custom, { key: 'review', label: 'Review & Publish' }];
  }, [sections, playbookType]);

  const activeStep = steps[step];

  // Completeness checklist - ONLY Title is strictly required to publish; other parts are modular & optional
  const checklist = React.useMemo(() => {
    const isDoc = playbookType === 'documentation';
    return [
      { key: 'title', label: 'Title', done: state.title.trim().length > 0, required: true },
      {
        key: 'summary',
        label: isDoc ? 'Document Summary' : 'Summary',
        done: state.summary.trim().length > 0,
        required: false,
      },
      {
        key: 'quick_fix',
        label: isDoc ? 'Quick Reference Notes' : 'Quick fix',
        done: state.quick_fix.trim().length > 0,
        required: false,
      },
      {
        key: 'symptoms',
        label: isDoc ? 'Overview & Prerequisites' : 'Problem description',
        done: state.symptoms.trim().length > 0,
        required: false,
      },
      {
        key: 'resolutions',
        label: isDoc ? 'Step-by-step Setup Guide' : 'Resolution steps',
        done: (() => {
          if (!state.resolutions || !state.resolutions.trim()) return false;
          try {
            const parsed = JSON.parse(state.resolutions);
            return Array.isArray(parsed) ? parsed.length > 0 : true;
          } catch {
            return state.resolutions.trim().length > 0;
          }
        })(),
        required: false,
      },
    ];
  }, [state, playbookType]);

  const canPublish = Boolean(state.title && state.title.trim().length > 0);
  const incomplete = checklist.filter((i) => !i.done);

  // Autosave
  const autosaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    const activeId = currentScenarioId || scenario?.id;
    if (!activeId) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaveState('saving');
    autosaveTimer.current = setTimeout(() => {
      void persist(false, undefined, { silent: true }).finally(() => setSaveState('saved'));
    }, 4000);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, classification, flowchart, sampleTickets, relatedScenarios]);

  // Save / Persist
  const persist = React.useCallback(
    async (
      showToast = true,
      overrideStatus?: Scenario['status'],
      options?: {
        silent?: boolean;
        navigateOnCreate?: boolean;
        defaultTitle?: string;
        extraTickets?: string[];
        extraRelatedIds?: string[];
      }
    ): Promise<{ success: boolean; id?: string; slug?: string } | false> => {
      let titleToSave = state.title.trim();
      if (!titleToSave && options?.defaultTitle) {
        titleToSave = options.defaultTitle;
      }
      if (!titleToSave && !showToast) {
        titleToSave = playbookType === 'documentation' ? 'Untitled Documentation & SOP' : 'Untitled Playbook';
      }

      if (!titleToSave) {
        if (showToast) toast.error('A playbook title is required.');
        return false;
      }

      // If we auto-generated a title, reflect it in local state
      if (!state.title.trim() && titleToSave) {
        setState((prev) => ({ ...prev, title: titleToSave }));
      }

      setSaving(true);
      const supabase = createClient();

      const targetStatus = overrideStatus ?? state.status;
      const isGlobalEffective =
        playbookType === 'documentation'
          ? true
          : (state.is_global || (state.account_ids.length === 0 && !classification.system.account));

      // Modular fallback values when publishing to satisfy DB constraints even on unmigrated instances
      let quickFixValue = state.quick_fix?.trim() || null;
      let resolutionsValue = state.resolutions?.trim() || null;
      let categoryId = classification.system.category ?? null;
      let issueTypeId = classification.system.issue_type ?? null;
      let severityId = classification.system.severity ?? null;
      let impactScopeId = classification.system.impact_scope ?? null;

      if (targetStatus === 'published') {
        if (!quickFixValue) {
          quickFixValue =
            playbookType === 'documentation'
              ? 'Documentation & SOP standard procedure.'
              : 'Standard troubleshooting procedure.';
        }
        if (!resolutionsValue || resolutionsValue === '[]') {
          resolutionsValue = JSON.stringify([
            {
              step: 1,
              instruction:
                playbookType === 'documentation'
                  ? 'Refer to documentation details and procedural guidelines.'
                  : 'Refer to playbook steps and incident troubleshooting guidelines.',
            },
          ]);
        }
        // Fallbacks for criteria fields if unmigrated database trigger is still active
        if (!categoryId && categories?.length > 0) {
          const defaultCat =
            categories.find((c) => c.slug === 'general' || c.name.toLowerCase().includes('general')) ||
            categories[0];
          categoryId = defaultCat.id;
        }
        if (!issueTypeId && fields) {
          const f = fields.find((x) => x.key === 'issue_type');
          if (f && optionsByField?.[f.id]?.length > 0) {
            issueTypeId = optionsByField[f.id][0].id;
          }
        }
        if (!severityId && fields) {
          const f = fields.find((x) => x.key === 'severity');
          if (f && optionsByField?.[f.id]?.length > 0) {
            const defSev =
              optionsByField[f.id].find(
                (o) => o.value?.toLowerCase() === 'low' || o.value?.toLowerCase() === 'medium',
              ) || optionsByField[f.id][0];
            severityId = defSev.id;
          }
        }
        if (!impactScopeId && fields) {
          const f = fields.find((x) => x.key === 'impact_scope');
          if (f && optionsByField?.[f.id]?.length > 0) {
            impactScopeId = optionsByField[f.id][0].id;
          }
        }
      }

      const effectiveId = currentScenarioId || scenario?.id;

      const payload: Record<string, unknown> = {
        title: titleToSave,
        summary: state.summary.trim() || null,
        quick_fix: quickFixValue,
        symptoms: state.symptoms || null,
        causes: state.causes || null,
        workarounds: state.workarounds || null,
        resolutions: resolutionsValue,
        escalation: state.escalation || null,
        prevention: state.prevention || null,
        custom_sections: {
          ...state.custom_sections,
          playbook_type: playbookType,
        },
        status: targetStatus,
        is_global: isGlobalEffective,
        tags: state.tags,
        account_id: isGlobalEffective ? null : (state.account_ids[0] ?? classification.system.account ?? null),
        category_id: categoryId,
        issue_type_id: issueTypeId,
        severity_id: severityId,
        impact_scope_id: impactScopeId,
        updated_by: userId,
      };

      try {
        const response = await fetch('/api/scenarios/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: effectiveId,
            payload,
            account_ids: state.account_ids,
            is_global: isGlobalEffective,
            custom_criteria: classification.custom,
            flowchart: flowchart.nodes.length > 0 ? flowchart : null,
            tickets: options?.extraTickets ?? sampleTickets.map((t) => t.ticket_id),
            related_scenario_ids: options?.extraRelatedIds ?? relatedScenarios.map((r) => r.id),
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to save scenario');
        }

        const scenarioId = data.id;
        const scenarioSlug = data.slug;

        setCurrentScenarioId(scenarioId);
        if (scenarioSlug) {
          setCurrentScenarioSlug(scenarioSlug);
        }

        if (!scenario?.id && scenarioSlug && typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/scenarios/${scenarioSlug}/edit?step=${step}`);
        }

        if (showToast && targetStatus !== 'published') {
          toast.success('Scenario draft created');
          if (options?.navigateOnCreate && !scenario?.id) {
            router.push(`/scenarios/${data.id}/edit`);
          }
        } else if (showToast) {
          toast.success('Changes saved');
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('drafts-updated'));
        }
        initialSnapshotRef.current = getContentSnapshot(
          state,
          flowchart,
          classification,
          sampleTickets,
          relatedScenarios,
        );
        hasEditsRef.current = false;

        return { success: true, id: scenarioId, slug: scenarioSlug };
      } catch (err: any) {
        console.error('Error saving scenario:', err);
        const message =
          err?.message ||
          err?.error_description ||
          (typeof err === 'string' ? err : 'Could not save.');
        if (showToast || targetStatus === 'published') {
          toast.error(message);
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      state,
      classification,
      flowchart,
      scenario,
      currentScenarioId,
      userId,
      router,
      playbookType,
      categories,
      fields,
      optionsByField,
      sampleTickets,
      relatedScenarios,
      step,
      getContentSnapshot,
    ],
  );

  const publish = async () => {
    if (!state.title || !state.title.trim()) {
      toast.error('Please enter a Playbook Title before publishing.');
      return;
    }

    setSaving(true);
    setState((prev) => ({ ...prev, status: 'published' }));

    const res = await persist(false, 'published');
    if (res && (res.slug || res.id)) {
      hasEditsRef.current = false;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('drafts-updated'));
      }
      const targetSlug = res.slug || res.id;
      toast.success(
        playbookType === 'documentation'
          ? 'Documentation published successfully! Redirecting...'
          : 'Playbook published successfully! Redirecting...',
      );
      setConfirmPublishOpen(false);
      // Automatically redirect to the published scenario page
      window.location.href = `/scenario/${targetSlug}`;
    } else {
      setSaving(false);
    }
  };

  const duplicateScenario = async () => {
    if (!scenario) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: newId, error } = await supabase.rpc('duplicate_scenario', {
        p_scenario_id: scenario.id,
      });
      if (error) throw error;
      toast.success('Scenario duplicated as draft');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('drafts-updated'));
      }
      router.push(`/scenarios/${newId}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not duplicate.');
    } finally {
      setSaving(false);
    }
  };

  const archiveScenario = async () => {
    if (!scenario) return;
    if (!window.confirm('Are you sure you want to archive this scenario? It will be hidden from search results.')) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('archive_scenario', {
        p_scenario_id: scenario.id,
      });
      if (error) throw error;
      setState((prev) => ({ ...prev, status: 'archived' }));
      toast.success('Scenario archived');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not archive.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* ------------------------------------------------------------------ */}
      {/* LEFT STEP NAVIGATOR: Classification, Basics, Problem, Flowchart,   */}
      {/* Tickets, Causes, Workarounds, Resolutions, Escalation, Attachments, */}
      {/* Related, Review                                                    */}
      {/* ------------------------------------------------------------------ */}
      <aside className="hidden w-56 shrink-0 border-r md:block bg-background/50">
        <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto p-3">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Steps
          </p>
          <nav aria-label="Editor steps">
            <ul className="space-y-0.5">
              {steps.map((s, index) => {
                const isActive = step === index;
                const done = isStepDone(s.key, state, classification, flowchart);

                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => setStep(index)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <span className="truncate">{s.label}</span>
                      {done ? (
                        <IconCheck className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-primary-foreground' : 'text-emerald-500')} />
                      ) : (
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', isActive ? 'bg-primary-foreground' : 'bg-muted-foreground/30')} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* CENTER WORKSPACE                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="min-w-0 flex-1">
        {/* Top Editor Toolbar */}
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-2xs"
            onClick={() => router.push(scenario ? `/scenario/${scenario.slug}` : '/drafts')}
          >
            <IconArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>

          <Separator orientation="vertical" className="h-5" />

          {/* Current Format Pill (Informative badge, not duplicate buttons) */}
          <Badge
            variant="outline"
            className={cn(
              'h-6 gap-1 px-2 text-2xs font-semibold select-none',
              playbookType === 'documentation'
                ? 'text-blue-700 dark:text-blue-300 border-blue-500/30 bg-blue-500/10'
                : 'text-amber-800 dark:text-amber-300 border-amber-500/30 bg-amber-500/10',
            )}
          >
            {playbookType === 'documentation' ? (
              <>
                <IconBook2 className="h-3 w-3 text-blue-500" />
                <span>Documentation &amp; SOP</span>
              </>
            ) : (
              <>
                <IconFlame className="h-3 w-3 text-amber-500" />
                <span>Troubleshooting Scenario</span>
              </>
            )}
          </Badge>

          <Separator orientation="vertical" className="h-5 hidden sm:block" />

          <span className="text-xs font-semibold truncate max-w-xs hidden md:inline">
            {state.title || (playbookType === 'documentation' ? 'Untitled documentation' : 'Untitled scenario')}
          </span>

          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            {state.status.replace('_', ' ')}
          </Badge>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-2xs text-muted-foreground mr-1">
              {saveState === 'saving' && (
                <>
                  <IconLoader2 className="h-3 w-3 animate-spin text-primary" />
                  Saving…
                </>
              )}
              {saveState === 'saved' && (
                <>
                  <IconCheck className="h-3 w-3 text-emerald-600" />
                  Autosaved
                </>
              )}
            </span>

            {scenario && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-2xs"
                onClick={() => window.open(`/scenario/${scenario.slug}`, '_blank')}
                title="Preview scenario"
              >
                <IconEye className="h-3.5 w-3.5" />
                Preview
              </Button>
            )}

            {scenario && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-2xs"
                  onClick={duplicateScenario}
                  title="Duplicate scenario as draft"
                >
                  <IconCopy className="h-3.5 w-3.5" />
                  Duplicate
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-2xs"
                  onClick={() => setHistoryOpen(true)}
                >
                  <IconHistory className="h-3.5 w-3.5" />
                  History
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-2xs text-muted-foreground hover:text-destructive"
                  onClick={archiveScenario}
                  title="Archive scenario"
                >
                  <IconArchive className="h-3.5 w-3.5" />
                  Archive
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-2xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setShowDeleteModal(true)}
                  title="Delete playbook"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-2xs"
              onClick={() => setConfirmDraftOpen(true)}
              disabled={saving}
            >
              <IconDeviceFloppy className="h-3.5 w-3.5" />
              Save Draft
            </Button>

            <Button
              size="sm"
              className="h-7 gap-1.5 text-2xs font-semibold bg-[#233B74] hover:bg-[#1b2e5c] text-white"
              onClick={() => {
                if (!state.title || !state.title.trim()) {
                  toast.error('Please enter a Playbook Title before publishing.');
                  return;
                }
                setConfirmPublishOpen(true);
              }}
              disabled={!state.title || !state.title.trim() || saving}
              title={!state.title || !state.title.trim() ? 'Enter a title to publish' : undefined}
            >
              <IconCheck className="h-3.5 w-3.5" />
              Publish Playbook
            </Button>
          </div>
        </div>

        {/* Step Content */}
        <div className={cn('py-6', activeStep.key === 'flowchart' ? 'px-4 sm:px-6 w-full' : 'px-6')}>
          <div
            className={cn(
              'mx-auto space-y-4 transition-all duration-200',
              activeStep.key === 'flowchart' ? 'w-full max-w-none' : 'max-w-3xl',
            )}
          >
            {activeStep.key === 'classification' && (
              <ClassificationStep
                fields={fields}
                optionsByField={optionsByField}
                categories={categories}
                accounts={accounts}
                value={classification}
                onChange={setClassification}
                title={state.title}
                onTitleChange={(t) => update({ title: t })}
                summary={state.summary}
                onSummaryChange={(s) => update({ summary: s })}
                quickFix={state.quick_fix}
                onQuickFixChange={(qf) => update({ quick_fix: qf })}
                tags={state.tags}
                onTagsChange={(tags) => update({ tags })}
                isGlobal={state.is_global}
                onToggleGlobal={(global) => {
                  update({
                    is_global: global,
                    ...(global ? { account_ids: [] } : {}),
                  });
                  if (global) {
                    setClassification((prev) => ({
                      ...prev,
                      system: { ...prev.system, account: null },
                    }));
                  }
                }}
                selectedAccountIds={state.account_ids}
                onSelectedAccountIdsChange={(accountIds) => {
                  update({ account_ids: accountIds });
                  setClassification((prev) => ({
                    ...prev,
                    system: { ...prev.system, account: accountIds[0] ?? null },
                  }));
                }}
                lockedAccountId={scenario?.account_id ?? null}
                playbookType={playbookType}
                onPlaybookTypeChange={handlePlaybookTypeChange}
              />
            )}

            {activeStep.key === 'problem' && (
              <RichSection
                title={
                  playbookType === 'documentation'
                    ? 'Overview & Prerequisites'
                    : 'Problem description & symptoms'
                }
                help={
                  playbookType === 'documentation'
                    ? 'Summary of the setup, environment requirements, prerequisites, and system specifications. Images can be pasted straight in.'
                    : 'What the user reported and what was actually observed. Images can be pasted straight in.'
                }
                value={state.symptoms}
                onChange={(v) => update({ symptoms: v })}
              />
            )}

            {activeStep.key === 'flowchart' && (
              <Card className="w-full border-border/80 shadow-xs">
                <CardContent className="p-4 sm:p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {playbookType === 'documentation'
                          ? 'Architecture & System Flow Diagram'
                          : 'Troubleshooting Flowchart (Decision Tree)'}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {playbookType === 'documentation'
                          ? 'Visual diagram editor for architecture, system topology, data flow, or procedure workflow.'
                          : 'Visual node editor for decision trees, branching diagnostic paths, and resolutions.'}
                      </p>
                    </div>
                  </div>
                  <FlowchartEditor
                    nodes={flowchart.nodes}
                    edges={flowchart.edges}
                    nodeTypes={nodeTypes}
                    onChange={(next) => setFlowchart(next)}
                  />
                </CardContent>
              </Card>
            )}

            {activeStep.key === 'tickets' && (
              <TicketsStep
                scenarioId={currentScenarioId || scenario?.id || null}
                tickets={sampleTickets}
                onTicketsChange={setSampleTickets}
                outcomes={outcomes}
                onRequireSave={async (newTicketId?: string, overrideList?: string[]) => {
                  const ticketsToSend = overrideList ?? (newTicketId
                    ? Array.from(new Set([...sampleTickets.map((t) => t.ticket_id), newTicketId]))
                    : sampleTickets.map((t) => t.ticket_id));
                  const res = await persist(false, undefined, { silent: true, extraTickets: ticketsToSend });
                  return res ? (res.id || currentScenarioId) : null;
                }}
              />
            )}

            {activeStep.key === 'causes' && (
              <RichSection
                title="Possible causes"
                help="What is actually causing the problem, and how to tell them apart."
                value={state.causes}
                onChange={(v) => update({ causes: v })}
              />
            )}

            {activeStep.key === 'workarounds' && (
              <RichSection
                title={
                  playbookType === 'documentation'
                    ? 'Configuration Notes & Verification'
                    : 'Workarounds'
                }
                help={
                  playbookType === 'documentation'
                    ? 'Important configuration caveats, testing/verification commands, post-setup checklist, and operational notes.'
                    : 'Temporary solutions while permanent fix is being executed.'
                }
                value={state.workarounds}
                onChange={(v) => update({ workarounds: v })}
              />
            )}

            {activeStep.key === 'resolutions' && (
              <ResolutionsStep
                value={state.resolutions}
                onChange={(v) => update({ resolutions: v })}
                playbookType={playbookType}
              />
            )}

            {activeStep.key === 'escalation' && (
              <div className="space-y-4">
                <RichSection
                  title="Escalation path"
                  help="Who to contact, in what order, and what details to hand off."
                  value={state.escalation}
                  onChange={(v) => update({ escalation: v })}
                />
                <RichSection
                  title="Prevention & notes"
                  help="Proactive steps to stop it happening again, and operational best practices."
                  value={state.prevention}
                  onChange={(v) => update({ prevention: v })}
                />
              </div>
            )}

            {activeStep.key === 'attachments' && (
              <AttachmentsStep
                scenarioId={currentScenarioId || scenario?.id || null}
                onRequireSave={async () => {
                  const res = await persist(false, undefined, { silent: true });
                  return res ? (res.id || currentScenarioId) : null;
                }}
              />
            )}

            {activeStep.key === 'related' && (
              <RelatedScenariosStep
                scenarioId={currentScenarioId || scenario?.id || null}
                relatedList={relatedScenarios}
                onRelatedChange={setRelatedScenarios}
                allScenarios={allScenarios}
                playbookType={playbookType}
                onRequireSave={async (newRelId?: string, overrideList?: string[]) => {
                  const relToSend = overrideList ?? (newRelId
                    ? Array.from(new Set([...relatedScenarios.map((r) => r.id), newRelId]))
                    : relatedScenarios.map((r) => r.id));
                  const res = await persist(false, undefined, { silent: true, extraRelatedIds: relToSend });
                  return res ? (res.id || currentScenarioId) : null;
                }}
              />
            )}

            {sections
              .filter((s) => s.is_active && !BASE_SECTION_KEYS.has(s.key))
              .map((section) =>
                activeStep.key === section.key ? (
                  <RichSection
                    key={section.id}
                    title={section.label}
                    help={section.help_text ?? undefined}
                    value={state.custom_sections[section.key] ?? ''}
                    onChange={(v) =>
                      update({
                        custom_sections: {
                          ...state.custom_sections,
                          [section.key]: v,
                        },
                      })
                    }
                  />
                ) : null,
              )}

            {activeStep.key === 'review' && (
              <ReviewStep
                state={state}
                classification={classification}
                fields={fields}
                optionsByField={optionsByField}
                accounts={accounts}
                categories={categories}
                checklist={checklist}
                playbookType={playbookType}
                onEditStep={(index) => setStep(index)}
                onPublish={() => {
                  if (!state.title || !state.title.trim()) {
                    toast.error('Please enter a Playbook Title before publishing.');
                    return;
                  }
                  setConfirmPublishOpen(true);
                }}
              />
            )}

            {/* Bottom Step navigation buttons */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                Previous Step
              </Button>
              <span className="text-2xs tabular-nums text-muted-foreground">
                Step {step + 1} of {steps.length} — {activeStep.label}
              </span>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                disabled={step === steps.length - 1}
              >
                Next Step
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog: Publish Playbook */}
      <Dialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Publication</DialogTitle>
            <DialogDescription>
              Are you sure you want to publish this {playbookType === 'documentation' ? 'documentation guide' : 'playbook'}?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2 text-xs">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <p className="font-semibold text-foreground text-sm">
                {state.title || 'Untitled'}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">
                  {playbookType === 'documentation' ? 'Documentation / SOP' : 'Troubleshooting Scenario'}
                </Badge>
                <span>&bull;</span>
                <span>
                  {state.is_global || state.account_ids.length === 0
                    ? 'General / Universal Knowledge Base'
                    : `${state.account_ids.length} Selected Accounts`}
                </span>
              </div>
            </div>
            <p className="text-muted-foreground text-2xs">
              Once published, this playbook will be immediately live and searchable by team members in the knowledge base.
            </p>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmPublishOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#233B74] hover:bg-[#1b2e5c] text-white font-medium"
              onClick={async () => {
                await publish();
              }}
              disabled={saving}
            >
              {saving ? (
                <>
                  <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Publishing...
                </>
              ) : (
                'Confirm & Publish'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog: Save Draft */}
      <Dialog open={confirmDraftOpen} onOpenChange={setConfirmDraftOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as Draft?</DialogTitle>
            <DialogDescription>
              Your changes will be saved as a draft. You can continue editing or publish it at any time.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-xs">
            <p className="font-medium text-foreground">
              {state.title || 'Untitled Draft'}
            </p>
            <p className="text-muted-foreground text-2xs mt-1">
              Drafts are private to creators and administrators until published.
            </p>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmDraftOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                setSaving(true);
                const res = await persist(false, 'draft');
                if (res && res.id) {
                  hasEditsRef.current = false;
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('drafts-updated'));
                  }
                  toast.success('Draft saved successfully! Redirecting to My Drafts...');
                  setConfirmDraftOpen(false);
                  window.location.href = '/drafts';
                } else {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              {saving ? (
                <>
                  <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Confirm & Save Draft'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog: Save as Draft on Navigation */}
      <Dialog
        open={leaveConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setLeaveConfirmOpen(false);
            setPendingDestination(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <IconDeviceFloppy className="h-4.5 w-4.5 text-primary" />
              Save as Draft?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              You have unsaved changes in this playbook. Would you like to save it as a draft before leaving?
            </DialogDescription>
          </DialogHeader>

          <div className="py-2.5 px-3 rounded-md bg-muted/40 border border-border/60 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground truncate max-w-[260px]">
                {state.title.trim() || 'Untitled Playbook Draft'}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-semibold border border-amber-500/30">
                Draft
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Drafts are private to you and can be resumed or published at any time from My Drafts.
            </p>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDiscardAndLeave}
              disabled={saving}
              className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Discard &amp; Leave
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancelLeave}
              disabled={saving}
              className="text-xs"
            >
              Keep Editing
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveDraftAndLeave}
              disabled={saving}
              className="gap-1.5 text-xs font-semibold bg-[#233B74] hover:bg-[#1b2e5c] text-white"
            >
              {saving ? (
                <>
                  <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving Draft...
                </>
              ) : (
                <>
                  <IconDeviceFloppy className="h-3.5 w-3.5" />
                  Save as Draft
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version history */}
      {historyOpen && scenario && (
        <VersionHistoryDrawer
          scenarioId={scenario.id}
          onClose={() => setHistoryOpen(false)}
          onRestored={() => router.refresh()}
        />
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
              Are you sure you want to delete this playbook? This action will permanently remove it from all active listings.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/40 p-3 my-2 text-xs">
            <div className="font-semibold text-foreground truncate">{state.title || scenario?.title || 'Untitled Playbook'}</div>
            {scenario?.slug && (
              <div className="text-muted-foreground mt-0.5 text-[11px]">
                Slug: {scenario.slug}
              </div>
            )}
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

const BASE_SECTION_KEYS = new Set([
  'header',
  'quick_fix',
  'symptoms',
  'flowchart',
  'sample_tickets',
  'causes',
  'workarounds',
  'resolutions',
  'escalation',
  'attachments',
  'related',
]);

function isStepDone(
  key: string,
  state: EditorState,
  classification: ClassificationValue,
  flowchart: { nodes: any[]; edges: any[] },
): boolean {
  switch (key) {
    case 'classification':
      return Boolean(
        state.title.trim().length > 0 &&
          (state.is_global || state.account_ids.length > 0 || classification.system.account) &&
          classification.system.category,
      );
    case 'problem':
      return state.symptoms.trim().length > 0;
    case 'flowchart':
      return flowchart.nodes.length > 0;
    case 'causes':
      return state.causes.trim().length > 0;
    case 'workarounds':
      return state.workarounds.trim().length > 0;
    case 'resolutions':
      return state.resolutions.trim().length > 0;
    default:
      return true;
  }
}

function RichSection({
  title,
  help,
  value,
  onChange,
}: {
  title: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div>
          <h3 className="text-xs font-semibold">{title}</h3>
          {help && <p className="mt-0.5 text-2xs text-muted-foreground">{help}</p>}
        </div>
        <RichTextEditor value={value} onChange={onChange} minHeight={150} />
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Resolution Steps Builder: Ordered list with commands & copy button
// ----------------------------------------------------------------------------
interface ResolutionStepItem {
  step: number;
  instruction: string;
  command?: string;
  imageUrl?: string;
  imageCaption?: string;
}

function ResolutionsStep({
  value,
  onChange,
  playbookType = 'scenario',
}: {
  value: string;
  onChange: (value: string) => void;
  playbookType?: 'scenario' | 'documentation';
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [activeUploadIndex, setActiveUploadIndex] = React.useState<number | null>(null);
  const [uploading, setUploading] = React.useState(false);

  const [items, setItems] = React.useState<ResolutionStepItem[]>(() => {
    if (!value || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not json
    }
    return [];
  });

  const [useRichText, setUseRichText] = React.useState(items.length === 0 && Boolean(value.trim()));

  React.useEffect(() => {
    if (!value || !value.trim()) {
      setItems([]);
      return;
    }
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        setItems(parsed);
        setUseRichText(false);
        return;
      }
    } catch {
      // not json
    }
    setUseRichText(true);
  }, [value]);

  const sync = (next: ResolutionStepItem[]) => {
    setItems(next);
    onChange(JSON.stringify(next));
  };

  const addStep = () => {
    const next = [...items, { step: items.length + 1, instruction: '', command: '' }];
    sync(next);
  };

  const updateStep = (index: number, patch: Partial<ResolutionStepItem>) => {
    const next = items.map((it, idx) => (idx === index ? { ...it, ...patch } : it));
    sync(next);
  };

  const removeStep = (index: number) => {
    const next = items.filter((_, idx) => idx !== index).map((it, idx) => ({ ...it, step: idx + 1 }));
    sync(next);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    sync(next.map((it, idx) => ({ ...it, step: idx + 1 })));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || activeUploadIndex === null) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files can be attached.');
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `resolution-steps/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from('scenario-attachments')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;

      const { data: signedData } = await supabase.storage
        .from('scenario-attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      const imageUrl =
        signedData?.signedUrl || supabase.storage.from('scenario-attachments').getPublicUrl(path).data.publicUrl;

      const currentItem = items[activeUploadIndex];
      updateStep(activeUploadIndex, {
        imageUrl,
        imageCaption: currentItem?.imageCaption || file.name,
      });
      toast.success('Step image attached successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the image.');
    } finally {
      setUploading(false);
      setActiveUploadIndex(null);
      if (e.target) e.target.value = '';
    }
  };

  if (useRichText) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold">
                {playbookType === 'documentation'
                  ? 'Documentation Content (Rich Text Mode)'
                  : 'Resolutions (Rich Text Mode)'}
              </h3>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                Free-form rich text editor.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-2xs"
              onClick={() => {
                setUseRichText(false);
                addStep();
              }}
            >
              Switch to Step Builder
            </Button>
          </div>
          <RichTextEditor value={value} onChange={onChange} minHeight={160} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {/* Hidden File Input for Step Image Attachments */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold">
              {playbookType === 'documentation'
                ? 'Step-by-Step Setup Guide'
                : 'Resolution Steps'}
            </h3>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {playbookType === 'documentation'
                ? 'Add ordered setup instructions, configuration steps, terminal commands, and screenshots.'
                : 'Add ordered troubleshooting steps with optional terminal commands and screenshot attachments. Checkable during live calls.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-2xs"
              onClick={() => setUseRichText(true)}
            >
              Switch to Rich Text
            </Button>
            <Button size="sm" className="h-7 gap-1 text-2xs" onClick={addStep}>
              <IconPlus className="h-3.5 w-3.5" />
              {playbookType === 'documentation' ? 'Add Setup Step' : 'Add Step'}
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-xs text-muted-foreground">
              {playbookType === 'documentation'
                ? 'No setup procedure steps added yet.'
                : 'No resolution steps added yet.'}
            </p>
            <Button size="sm" variant="outline" className="mt-2 h-7 gap-1 text-2xs" onClick={addStep}>
              <IconPlus className="h-3 w-3" />
              {playbookType === 'documentation' ? 'Add Setup Step 1' : 'Add Step 1'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((it, idx) => (
              <div key={idx} className="rounded-lg border bg-card p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold uppercase tracking-wider text-primary">
                    Step {idx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-xs"
                      onClick={() => moveStep(idx, 'up')}
                      disabled={idx === 0}
                      title="Move up"
                    >
                      ▲
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-xs"
                      onClick={() => moveStep(idx, 'down')}
                      disabled={idx === items.length - 1}
                      title="Move down"
                    >
                      ▼
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                      onClick={() => removeStep(idx)}
                      title="Delete step"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-2xs font-medium">
                    {playbookType === 'documentation' ? 'Step Instruction / Procedure Details' : 'Instruction'}
                  </Label>
                  <Textarea
                    value={it.instruction}
                    onChange={(e) => updateStep(idx, { instruction: e.target.value })}
                    placeholder={
                      playbookType === 'documentation'
                        ? 'Describe the setup step, configuration change, or procedure...'
                        : 'e.g. Switch edge router to secondary failover line.'
                    }
                    rows={2}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-2xs font-medium">
                    {playbookType === 'documentation' ? 'Terminal Command / Script (optional)' : 'CLI / PowerShell Command (optional)'}
                  </Label>
                  <Input
                    value={it.command ?? ''}
                    onChange={(e) => updateStep(idx, { command: e.target.value })}
                    placeholder={
                      playbookType === 'documentation'
                        ? 'e.g. sudo apt install -y nginx && sudo systemctl enable --now nginx'
                        : 'e.g. sudo ip route replace default via 192.168.100.1'
                    }
                    className="h-7 font-mono text-2xs"
                  />
                </div>

                {/* Step Image Attachment */}
                <div className="pt-1">
                  {it.imageUrl ? (
                    <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.imageUrl}
                        alt={it.imageCaption || `Step ${idx + 1} preview`}
                        className="h-16 w-24 shrink-0 rounded border bg-background object-cover"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label className="text-[10px] font-medium text-muted-foreground">
                          Attachment Caption / Description
                        </Label>
                        <Input
                          value={it.imageCaption ?? ''}
                          onChange={(e) => updateStep(idx, { imageCaption: e.target.value })}
                          placeholder="e.g. Confirm IP address in adapter settings"
                          className="h-7 text-2xs"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-destructive hover:bg-destructive/10"
                        title="Remove image"
                        onClick={() =>
                          updateStep(idx, { imageUrl: undefined, imageCaption: undefined })
                        }
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-2xs text-muted-foreground hover:text-foreground"
                      disabled={uploading}
                      onClick={() => {
                        setActiveUploadIndex(idx);
                        fileInputRef.current?.click();
                      }}
                    >
                      {uploading && activeUploadIndex === idx ? (
                        <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <IconPhoto className="h-3.5 w-3.5" />
                      )}
                      Attach Screenshot / Image
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Sample Tickets Step (HESK Tracking IDs)
// ----------------------------------------------------------------------------
function TicketsStep({
  scenarioId,
  tickets,
  onTicketsChange,
  outcomes,
  onRequireSave,
}: {
  scenarioId: string | null;
  tickets: SampleTicket[];
  onTicketsChange: React.Dispatch<React.SetStateAction<SampleTicket[]>>;
  outcomes?: Outcome[];
  onRequireSave: (newTicketId?: string, overrideList?: string[]) => Promise<any>;
}) {
  const [ticketId, setTicketId] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // If scenarioId exists and local tickets are empty, fetch from database on mount
  React.useEffect(() => {
    if (!scenarioId || tickets.length > 0) return;
    const supabase = createClient();
    supabase
      .from('pb_sample_tickets')
      .select('*')
      .eq('scenario_id', scenarioId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          onTicketsChange(data as SampleTicket[]);
        }
      });
  }, [scenarioId, tickets.length, onTicketsChange]);

  const copyTicket = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(`Copied ticket ID: ${text}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const add = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = ticketId.trim();
    if (!cleanId) {
      toast.error('Please enter a ticket tracking ID (e.g. BOS-49281).');
      return;
    }

    setSaving(true);
    const newTicket: SampleTicket = {
      id: crypto.randomUUID(),
      scenario_id: scenarioId || '',
      ticket_id: cleanId,
      created_at: new Date().toISOString(),
    };
    const updated = [newTicket, ...tickets.filter((t) => t.ticket_id.toUpperCase() !== cleanId.toUpperCase())];
    onTicketsChange(updated);
    setTicketId('');

    try {
      await onRequireSave(cleanId, updated.map((t) => t.ticket_id));
      toast.success(`Sample ticket "${cleanId}" added`);
    } catch (err: any) {
      console.warn('Error syncing sample ticket:', err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const updated = tickets.filter((t) => t.id !== id);
    onTicketsChange(updated);
    try {
      await onRequireSave(undefined, updated.map((t) => t.ticket_id));
      toast.success('Sample ticket removed');
    } catch (err: any) {
      console.warn('Error removing ticket:', err);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3.5 p-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Sample Ticket</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add HESK tracking IDs associated with this issue. Only the tracking ID is recorded.
            </p>
          </div>

          <form onSubmit={add} className="flex items-center gap-2 max-w-md">
            <div className="relative flex-1">
              <Input
                id="tk-id"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                placeholder="Enter Tracking ID (e.g. BOS-49281)"
                className="h-9 font-mono text-xs uppercase"
                disabled={saving}
                autoFocus
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="h-9 text-xs gap-1.5 font-medium shrink-0"
              disabled={saving || !ticketId.trim()}
            >
              <IconPlus className="h-3.5 w-3.5" />
              Add Ticket
            </Button>
          </form>
        </CardContent>
      </Card>

      {tickets.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recorded Tickets ({tickets.length})
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {tickets.map((ticket) => {
                const isCopied = copiedId === ticket.id;
                return (
                  <div
                    key={ticket.id}
                    className="group inline-flex items-center gap-1.5 rounded-lg border bg-card py-1.5 pl-3 pr-1.5 text-xs shadow-xs transition-all hover:border-primary/50"
                  >
                    <span className="font-mono font-semibold text-foreground tracking-wide">
                      {ticket.ticket_id}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => copyTicket(ticket.id, ticket.ticket_id)}
                      title="Copy Tracking ID"
                    >
                      {isCopied ? (
                        <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <IconCopy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                      onClick={() => remove(ticket.id)}
                      title="Remove Ticket"
                    >
                      <IconTrash className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Attachments Step - High-Performance Multi-File Concurrent Upload
// ----------------------------------------------------------------------------
function AttachmentsStep({
  scenarioId,
  onRequireSave,
}: {
  scenarioId: string | null;
  onRequireSave: () => Promise<any>;
}) {
  const [activeScenarioId, setActiveScenarioId] = React.useState<string | null>(scenarioId);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<{ current: number; total: number } | null>(null);
  const [files, setFiles] = React.useState<any[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [previewAttachment, setPreviewAttachment] = React.useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  React.useEffect(() => {
    if (scenarioId) setActiveScenarioId(scenarioId);
  }, [scenarioId]);

  React.useEffect(() => {
    const idToFetch = activeScenarioId || scenarioId;
    if (!idToFetch) return;
    const supabase = createClient();
    supabase
      .from('pb_attachments')
      .select('*')
      .eq('scenario_id', idToFetch)
      .order('created_at', { ascending: false })
      .then(({ data }) => setFiles(data ?? []));
  }, [activeScenarioId, scenarioId]);

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handlePreview = async (attachment: any) => {
    setPreviewAttachment(attachment);
    setPreviewLoading(true);
    try {
      const supabase = createClient();
      const { data: signed } = await supabase.storage
        .from('scenario-attachments')
        .createSignedUrl(attachment.file_path, 3600);

      let url = signed?.signedUrl;
      if (url && url.includes('kong:8000')) {
        url = url.replace(/https?:\/\/kong:8000/i, '');
      }

      if (url) {
        setPreviewUrl(url);
      } else {
        const { data: blob } = await supabase.storage
          .from('scenario-attachments')
          .download(attachment.file_path);
        if (blob) {
          setPreviewUrl(URL.createObjectURL(blob));
        }
      }
    } catch (err) {
      console.error('Preview error:', err);
      toast.error('Could not load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const uploadBatch = async (selectedFiles: FileList | File[]) => {
    const fileList = Array.from(selectedFiles);
    if (fileList.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: fileList.length });
    let targetScenarioId = activeScenarioId || scenarioId;

    if (!targetScenarioId) {
      const saved = await onRequireSave();
      if (!saved) {
        setUploading(false);
        setUploadProgress(null);
        return;
      }
      if (typeof saved === 'string') {
        targetScenarioId = saved;
      } else if (typeof saved === 'object' && (saved as any)?.id) {
        targetScenarioId = (saved as any).id;
      }
      if (targetScenarioId) {
        setActiveScenarioId(targetScenarioId);
      }
    }

    const safeFolder = targetScenarioId || 'general';
    const supabase = createClient();
    let completed = 0;
    const newAttachments: any[] = [];
    const errors: string[] = [];

    // Parallel upload up to 4 concurrent streams for optimum network throughput
    const chunks: File[][] = [];
    for (let i = 0; i < fileList.length; i += 4) {
      chunks.push(fileList.slice(i, i + 4));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (file) => {
          try {
            const path = `${safeFolder}/${crypto.randomUUID()}-${file.name}`;
            const { error: storageError } = await supabase.storage
              .from('scenario-attachments')
              .upload(path, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || 'application/octet-stream',
              });

            if (storageError) {
              errors.push(`${file.name}: ${storageError.message}`);
              return;
            }

            if (targetScenarioId) {
              const { data: inserted, error: insertError } = await supabase
                .from('pb_attachments')
                .insert({
                  scenario_id: targetScenarioId,
                  file_name: file.name,
                  file_path: path,
                  file_size: file.size,
                  mime_type: file.type || 'application/octet-stream',
                })
                .select('*')
                .single();

              if (insertError) {
                errors.push(`${file.name}: ${insertError.message}`);
              } else if (inserted) {
                newAttachments.push(inserted);
              }
            }
          } catch (err: any) {
            errors.push(`${file.name}: ${err?.message || 'Upload failed'}`);
          } finally {
            completed++;
            setUploadProgress({ current: completed, total: fileList.length });
          }
        })
      );
    }

    if (newAttachments.length > 0) {
      setFiles((prev) => [...newAttachments, ...prev]);
      toast.success(
        `Uploaded ${newAttachments.length} file${newAttachments.length === 1 ? '' : 's'}`
      );
    }

    if (errors.length > 0) {
      toast.error(`Some files failed: ${errors.slice(0, 3).join('; ')}`);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploading(false);
    setUploadProgress(null);
  };

  const handleDownload = async (attachment: any) => {
    try {
      const supabase = createClient();
      const { data: signed } = await supabase.storage
        .from('scenario-attachments')
        .createSignedUrl(attachment.file_path, 3600);

      let url = signed?.signedUrl;
      if (url) {
        if (url.includes('kong:8000')) {
          url = url.replace(/https?:\/\/kong:8000/i, '');
        }
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.file_name;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // Fallback: direct blob download
      const { data: blob, error: dlErr } = await supabase.storage
        .from('scenario-attachments')
        .download(attachment.file_path);

      if (dlErr || !blob) throw dlErr || new Error('Could not download file');

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = attachment.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download attachment');
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="text-xs font-semibold">Attachments & SOP Files</h3>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Multi-file upload supported. Store diagnostic scripts, logs, network traces, configuration files, and SOP documents up to 100MB per file.
          </p>
        </div>

        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.length) {
              void uploadBatch(e.dataTransfer.files);
            }
          }}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40',
            uploading && 'pointer-events-none opacity-60'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void uploadBatch(e.target.files);
              }
            }}
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
            {uploading ? (
              <IconLoader2 className="h-5 w-5 animate-spin" />
            ) : (
              <IconUpload className="h-5 w-5" />
            )}
          </div>
          <p className="text-xs font-medium text-foreground">
            {uploading
              ? `Uploading ${uploadProgress?.current ?? 0} of ${uploadProgress?.total ?? 0} files...`
              : 'Click or drag files here to upload'}
          </p>
          <p className="mt-1 text-2xs text-muted-foreground">
            Upload multiple files at once. Supports all file types: PNG, JPG, PDF, TXT, LOG, CSV, PCAP, DOCX, XLSX, scripts, archives, and all formats (Max 100MB per file)
          </p>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Uploaded Files ({files.length})
            </h4>
            <ul className="space-y-1.5 max-h-60 overflow-y-auto">
              {files.map((attachment) => {
                const ext = attachment.file_name.split('.').pop()?.toUpperCase() || 'FILE';
                return (
                  <li
                    key={attachment.id}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-xs hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge variant="outline" className="text-[10px] h-5 font-mono px-1.5 uppercase shrink-0 bg-muted/50">
                        {ext}
                      </Badge>
                      <span className="truncate font-medium text-foreground">
                        {attachment.file_name}
                      </span>
                      <span className="text-2xs text-muted-foreground shrink-0">
                        ({formatSize(attachment.file_size)})
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                        title={`Preview ${attachment.file_name}`}
                        onClick={() => handlePreview(attachment)}
                      >
                        <IconEye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                        title={`Download ${attachment.file_name}`}
                        onClick={() => handleDownload(attachment)}
                      >
                        <IconDownload className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:bg-destructive/10"
                        title={`Delete ${attachment.file_name}`}
                        onClick={async () => {
                          const supabase = createClient();
                          await supabase.from('pb_attachments').delete().eq('id', attachment.id);
                          await supabase.storage.from('scenario-attachments').remove([attachment.file_path]);
                          setFiles((prev) => prev.filter((f) => f.id !== attachment.id));
                          toast.success('Attachment deleted');
                        }}
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Floating Attachment Preview Dialog */}
        <Dialog
          open={Boolean(previewAttachment)}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewAttachment(null);
              setPreviewUrl(null);
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-hidden">
            <DialogHeader className="border-b pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-2xs font-mono uppercase px-1.5 py-0.5">
                    {previewAttachment?.file_name.split('.').pop()?.toUpperCase() || 'FILE'}
                  </Badge>
                  <DialogTitle className="truncate text-sm font-semibold">
                    {previewAttachment?.file_name}
                  </DialogTitle>
                  {previewAttachment?.file_size && (
                    <span className="text-2xs text-muted-foreground">
                      ({formatSize(previewAttachment.file_size)})
                    </span>
                  )}
                </div>
              </div>
            </DialogHeader>

            {/* Floating Preview Area */}
            <div className="flex-1 overflow-auto py-3 min-h-[350px] flex items-center justify-center bg-muted/10 rounded-lg border">
              {previewLoading ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
                  <IconLoader2 className="h-6 w-6 animate-spin text-primary" />
                  <span>Loading preview...</span>
                </div>
              ) : !previewUrl ? (
                <div className="text-center p-6 text-muted-foreground text-xs">
                  Could not load preview. Use the download button below to inspect the file.
                </div>
              ) : (
                (() => {
                  const ext = previewAttachment?.file_name.split('.').pop()?.toLowerCase() || '';
                  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
                  const isPdf = ext === 'pdf';
                  const isText = ['txt', 'log', 'csv', 'json', 'yaml', 'yml', 'xml', 'md', 'sh', 'ps1', 'bat'].includes(ext);

                  if (isImage) {
                    return (
                      <img
                        src={previewUrl}
                        alt={previewAttachment?.file_name}
                        className="max-h-[65vh] max-w-full object-contain rounded shadow-xs"
                      />
                    );
                  }

                  if (isPdf) {
                    return (
                      <iframe
                        src={previewUrl}
                        title={previewAttachment?.file_name}
                        className="w-full h-[65vh] rounded border-0"
                      />
                    );
                  }

                  if (isText) {
                    return (
                      <iframe
                        src={previewUrl}
                        title={previewAttachment?.file_name}
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
                        <p className="text-xs font-semibold text-foreground">
                          {previewAttachment?.file_name}
                        </p>
                        <p className="mt-1 text-2xs text-muted-foreground max-w-sm">
                          This file format ({ext.toUpperCase()}) cannot be rendered directly in the floating preview. Click below to download and open it in your local software.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleDownload(previewAttachment)}
                        className="mt-2 h-8 gap-1.5 text-xs font-medium"
                      >
                        <IconDownload className="h-3.5 w-3.5" />
                        <span>Download File</span>
                      </Button>
                    </div>
                  );
                })()
              )}
            </div>

            <DialogFooter className="border-t pt-3 flex items-center justify-between sm:justify-between w-full">
              <span className="text-2xs text-muted-foreground">
                Attachment Preview
              </span>
              <div className="flex items-center gap-2">
                {previewUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="h-8 gap-1 text-xs"
                  >
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                      <IconExternalLink className="h-3.5 w-3.5" />
                      <span>Open in New Tab</span>
                    </a>
                  </Button>
                )}
                {previewAttachment && (
                  <Button
                    size="sm"
                    onClick={() => handleDownload(previewAttachment)}
                    className="h-8 gap-1 text-xs"
                  >
                    <IconDownload className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Related Scenarios Picker Step
// ----------------------------------------------------------------------------
function RelatedScenariosStep({
  scenarioId,
  relatedList,
  onRelatedChange,
  allScenarios,
  playbookType = 'scenario',
  onRequireSave,
}: {
  scenarioId: string | null;
  relatedList: { id: string; title: string; slug: string }[];
  onRelatedChange: React.Dispatch<React.SetStateAction<{ id: string; title: string; slug: string }[]>>;
  allScenarios: Pick<Scenario, 'id' | 'slug' | 'title'>[];
  playbookType?: 'scenario' | 'documentation';
  onRequireSave: (targetIdToAdd?: string, overrideList?: string[]) => Promise<any>;
}) {
  const [selectedId, setSelectedId] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!scenarioId || relatedList.length > 0) return;
    const supabase = createClient();
    supabase
      .from('pb_related_scenarios')
      .select('related_scenario_id')
      .eq('scenario_id', scenarioId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const ids = new Set((data ?? []).map((r) => r.related_scenario_id));
          const matches = allScenarios.filter((s) => ids.has(s.id));
          onRelatedChange(matches);
        }
      });
  }, [scenarioId, relatedList.length, allScenarios, onRelatedChange]);

  const addRelated = async (targetIdToAdd?: string) => {
    const idToAdd = targetIdToAdd || selectedId;
    if (!idToAdd) return;

    const matched = allScenarios.find((s) => s.id === idToAdd);
    if (!matched) return;

    setLoading(true);
    const updated = [...relatedList.filter((r) => r.id !== idToAdd), matched];
    onRelatedChange(updated);
    setSelectedId('');

    try {
      await onRequireSave(idToAdd, updated.map((r) => r.id));
      toast.success('Related scenario linked');
    } catch (err) {
      console.warn('DB related sync error:', err);
    } finally {
      setLoading(false);
    }
  };

  const removeRelated = async (relId: string) => {
    const updated = relatedList.filter((r) => r.id !== relId);
    onRelatedChange(updated);
    try {
      await onRequireSave(undefined, updated.map((r) => r.id));
      toast.success('Link removed');
    } catch (err) {
      console.warn('DB related removal error:', err);
    }
  };

  const availableScenarios = allScenarios.filter(
    (s) => s.id !== scenarioId && !relatedList.some((r) => r.id === s.id),
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="text-xs font-semibold">
            {playbookType === 'documentation' ? 'Related Documentation & SOPs' : 'Related Scenarios'}
          </h3>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {playbookType === 'documentation'
              ? 'Link other relevant setup guides, architecture documents, or IT procedures.'
              : 'Link other playbooks relevant to this problem (e.g. Wi-Fi issues related to VPN failures).'}
          </p>
        </div>

        {relatedList.length > 0 ? (
          <div className="space-y-1.5">
            {relatedList.map((rel) => (
              <div
                key={rel.id}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-xs"
              >
                <span className="font-medium text-foreground truncate">{rel.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                  onClick={() => removeRelated(rel.id)}
                  title="Remove link"
                >
                  <IconTrash className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No related scenarios linked yet.</p>
        )}

        <div className="flex gap-2 items-center">
          <select
            value={selectedId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedId(val);
              if (val) {
                void addRelated(val);
              }
            }}
            className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
            disabled={loading}
          >
            <option value="">
              {playbookType === 'documentation'
                ? 'Select a related setup guide or document to link...'
                : 'Select a related scenario to link...'}
            </option>
            {availableScenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            className="h-8 gap-1 text-2xs shrink-0"
            onClick={() => addRelated()}
            disabled={!selectedId || loading}
          >
            <IconPlus className="h-3 w-3" />
            Link
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Review Step & Completeness Checklist
// ----------------------------------------------------------------------------
function ReviewStep({
  state,
  classification,
  fields,
  optionsByField,
  accounts,
  categories,
  checklist,
  playbookType = 'scenario',
  onEditStep,
  onPublish,
}: {
  state: EditorState;
  classification: ClassificationValue;
  fields: CriteriaField[];
  optionsByField: Record<string, CriteriaOption[]>;
  accounts: Account[];
  categories: Category[];
  checklist: { key: string; label: string; done: boolean; required?: boolean }[];
  playbookType?: 'scenario' | 'documentation';
  onEditStep: (index: number) => void;
  onPublish: () => void;
}) {
  const requiredMissing = checklist.filter((i) => i.required && !i.done);
  const isDoc = playbookType === 'documentation';

  return (
    <div className="space-y-4">
      {requiredMissing.length > 0 ? (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <IconAlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Title Required Before Publishing
                </p>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                  Please provide a title in the first step. Other sections are modular and optional.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-2xs border-amber-600/30 text-amber-900 hover:bg-amber-500/20"
                  onClick={() => onEditStep(0)}
                >
                  Go to Step 1 (Classification & Title)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-500/50 bg-emerald-500/10">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <IconCheck className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Ready to Publish!
                </p>
                <p className="text-2xs text-muted-foreground">
                  {isDoc
                    ? 'Your documentation guide is ready. Click below to review and publish to the knowledge base.'
                    : 'Your playbook is ready. Click below to review and publish to the knowledge base.'}
                </p>
              </div>
            </div>
            <Button size="sm" className="h-8 font-semibold text-xs shrink-0" onClick={onPublish}>
              Publish Playbook
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold">Completeness Overview (Modular)</h3>
              <p className="text-2xs text-muted-foreground">
                Only the title is required. Other sections are optional and can be updated anytime.
              </p>
            </div>
          </div>
          <ul className="space-y-1.5 pt-1">
            {checklist.map((item) => (
              <li key={item.key} className="flex items-center justify-between text-xs py-1 border-b last:border-b-0">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full text-2xs',
                      item.done
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : item.required
                        ? 'bg-amber-500/15 text-amber-600'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {item.done ? (
                      <IconCheck className="h-2.5 w-2.5" />
                    ) : item.required ? (
                      <IconAlertCircle className="h-2.5 w-2.5" />
                    ) : (
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                    )}
                  </span>
                  <span className={cn(item.done ? 'text-foreground' : 'text-muted-foreground')}>
                    {item.label}
                  </span>
                </span>
                <Badge
                  variant={item.done ? 'outline' : item.required ? 'destructive' : 'secondary'}
                  className="h-4 text-[10px]"
                >
                  {item.done ? 'Completed' : item.required ? 'Required (Empty)' : 'Optional'}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-xs font-semibold">Classification & Scope Summary</h3>
          <dl className="space-y-1.5 text-xs">
            {fields
              .filter(
                (f) =>
                  f.is_active &&
                  !['site', 'platform', 'vendor', 'work_setup', 'frequency'].includes(f.key),
              )
              .map((field) => {
                let display = '—';
                if (field.key === 'account') {
                  if (state.account_ids && state.account_ids.length > 0) {
                    const matched = accounts.filter((a) => state.account_ids.includes(a.id));
                    display = matched.length > 0
                      ? matched.map((a) => `${a.name} (${a.code})`).join(', ')
                      : 'Specific accounts';
                  } else if (classification.system.account) {
                    const acct = accounts.find((a) => a.id === classification.system.account);
                    display = acct ? `${acct.name} (${acct.code})` : 'General Knowledge Base';
                  } else {
                    display = 'General Knowledge Base (Not account-specific)';
                  }
                } else if (field.key === 'category') {
                  const cat = categories.find((c) => c.id === classification.system.category);
                  display = cat ? cat.name : '—';
                } else if (['issue_type', 'severity', 'impact_scope'].includes(field.key)) {
                  const id = classification.system[field.key];
                  display =
                    (optionsByField[field.id] ?? []).find((o) => o.id === id)?.label ?? '—';
                } else {
                  const values = classification.custom[field.id] ?? [];
                  display =
                    values
                      .map(
                        (v) =>
                          (optionsByField[field.id] ?? []).find((o) => o.id === v)?.label ?? v,
                      )
                      .join(', ') || '—';
                }

                return (
                  <div key={field.id} className="flex gap-2">
                    <dt className="w-40 shrink-0 text-muted-foreground">{field.label}</dt>
                    <dd className="min-w-0 flex-1 font-medium text-foreground">{display}</dd>
                  </div>
                );
              })}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
