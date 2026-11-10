'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  IconAlertCircle,
  IconArchive,
  IconArrowLeft,
  IconBookmark,
  IconCheck,
  IconCopy,
  IconDeviceFloppy,
  IconEye,
  IconHistory,
  IconList,
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
  ScenarioTemplate,
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
  templates: ScenarioTemplate[];
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
    templates,
    tickets,
    userId,
    allScenarios = [],
    initialAccountId = null,
    initialCategoryId = null,
    initialTitle = null,
  } = props;

  const [state, setState] = React.useState<EditorState>(() => ({
    ...EMPTY_STATE,
    title: initialTitle ?? '',
    account_ids: initialAccountId ? [initialAccountId] : [],
  }));
  const [classification, setClassification] = React.useState<ClassificationValue>(() => ({
    system: {
      account: initialAccountId ?? null,
      category: initialCategoryId ?? null,
    },
    custom: {},
  }));
  const [step, setStep] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [flowchart, setFlowchart] = React.useState<{
    nodes: any[];
    edges: any[];
  }>({ nodes: [], edges: [] });
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false);
  const [templateName, setTemplateName] = React.useState('');
  const [templateDesc, setTemplateDesc] = React.useState('');
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [newTag, setNewTag] = React.useState('');

  // Seed form
  React.useEffect(() => {
    if (scenario) {
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
      if (initialTitle) {
        setState((prev) => ({ ...prev, title: initialTitle }));
      }
      if (initialAccountId) {
        setState((prev) => ({
          ...prev,
          account_ids: [initialAccountId],
        }));
      }
      if (initialAccountId || initialCategoryId) {
        setClassification((prev) => ({
          ...prev,
          system: {
            ...prev.system,
            ...(initialAccountId ? { account: initialAccountId } : {}),
            ...(initialCategoryId ? { category: initialCategoryId } : {}),
          },
        }));
      }
    }
  }, [scenario, initialAccountId, initialCategoryId, initialTitle]);

  // Load custom criteria values, flowchart, and scenario accounts
  React.useEffect(() => {
    if (!scenario) return;
    let cancelled = false;

    const load = async () => {
      const supabase = createClient();
      const [values, flow, accountsRes] = await Promise.all([
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
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [scenario]);

  const update = (patch: Partial<EditorState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  // Steps - Unified setup step 1, removing redundant basics step 2
  const steps = React.useMemo(() => {
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

    return [...base, ...custom, { key: 'review', label: 'Review' }];
  }, [sections]);

  const activeStep = steps[step];

  // Completeness checklist
  const checklist = React.useMemo(() => {
    const items: { key: string; label: string; done: boolean }[] = [
      { key: 'title', label: 'Title', done: state.title.trim().length > 0 },
      { key: 'summary', label: 'Summary', done: state.summary.trim().length > 0 },
      { key: 'quick_fix', label: 'Quick fix', done: state.quick_fix.trim().length > 0 },
      { key: 'symptoms', label: 'Problem description', done: state.symptoms.trim().length > 0 },
      {
        key: 'resolutions',
        label: 'Resolution steps',
        done: (() => {
          if (!state.resolutions || !state.resolutions.trim()) return false;
          try {
            const parsed = JSON.parse(state.resolutions);
            return Array.isArray(parsed) ? parsed.length > 0 : true;
          } catch {
            return state.resolutions.trim().length > 0;
          }
        })(),
      },
    ];

    const requiredFields = fields.filter(
      (f) =>
        f.is_required &&
        f.is_active &&
        !['site', 'platform', 'vendor', 'work_setup', 'frequency'].includes(f.key),
    );
    for (const field of requiredFields) {
      if (field.key === 'account') {
        items.push({
          key: 'account',
          label: field.label,
          done: Boolean(state.is_global || state.account_ids.length > 0 || classification.system.account),
        });
      } else if (field.key === 'category') {
        items.push({
          key: 'category',
          label: field.label,
          done: Boolean(classification.system.category),
        });
      } else if (['issue_type', 'severity', 'impact_scope'].includes(field.key)) {
        items.push({
          key: field.key,
          label: field.label,
          done: Boolean(classification.system[field.key]),
        });
      } else {
        items.push({
          key: field.id,
          label: field.label,
          done: (classification.custom[field.id] ?? []).length > 0,
        });
      }
    }

    return items;
  }, [state, fields, classification]);

  const incomplete = checklist.filter((i) => !i.done);

  // Autosave every 2.5s
  const autosaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!scenario) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaveState('saving');
    autosaveTimer.current = setTimeout(() => {
      void persist(false).finally(() => setSaveState('saved'));
    }, 2500);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, classification, flowchart]);

  // Save / Persist
  // Save / Persist
  const persist = React.useCallback(
    async (
      showToast = true,
      overrideStatus?: Scenario['status'],
    ): Promise<{ success: boolean; id?: string; slug?: string } | false> => {
      if (!state.title.trim()) {
        if (showToast) toast.error('A scenario title is required.');
        return false;
      }

      setSaving(true);
      const supabase = createClient();

      const targetStatus = overrideStatus ?? state.status;

      const payload: Record<string, unknown> = {
        title: state.title.trim(),
        summary: state.summary.trim() || null,
        quick_fix: state.quick_fix || null,
        symptoms: state.symptoms || null,
        causes: state.causes || null,
        workarounds: state.workarounds || null,
        resolutions: state.resolutions || null,
        escalation: state.escalation || null,
        prevention: state.prevention || null,
        custom_sections: state.custom_sections,
        status: targetStatus,
        is_global: state.is_global,
        tags: state.tags,
        account_id: state.is_global ? null : (state.account_ids[0] ?? classification.system.account ?? null),
        category_id: classification.system.category ?? null,
        issue_type_id: classification.system.issue_type ?? null,
        severity_id: classification.system.severity ?? null,
        impact_scope_id: classification.system.impact_scope ?? null,
        updated_by: userId,
      };

      try {
        let scenarioId = scenario?.id;
        let scenarioSlug = scenario?.slug;

        if (!scenarioId) {
          const { data, error } = await supabase
            .from('pb_scenarios')
            .insert({
              ...payload,
              created_by: userId,
              version: 1,
            })
            .select('id, slug')
            .single();
          if (error) throw error;
          scenarioId = data.id;
          scenarioSlug = data.slug;
          if (showToast && targetStatus !== 'published') {
            toast.success('Scenario draft created');
            router.push(`/scenarios/${data.id}/edit`);
          }
        } else {
          const { data, error } = await supabase
            .from('pb_scenarios')
            .update(payload)
            .eq('id', scenarioId)
            .select('id, slug')
            .single();
          if (error) throw error;
          if (data?.slug) scenarioSlug = data.slug;
        }

        // Sync multi-account relations (pb_scenario_accounts)
        const { error: delAccError } = await supabase
          .from('pb_scenario_accounts')
          .delete()
          .eq('scenario_id', scenarioId);
        if (delAccError) throw delAccError;

        if (!state.is_global && state.account_ids.length > 0) {
          const accRows = state.account_ids.map((accId) => ({
            scenario_id: scenarioId,
            account_id: accId,
          }));
          const { error: insAccError } = await supabase
            .from('pb_scenario_accounts')
            .insert(accRows);
          if (insAccError) throw insAccError;
        }

        // Custom criteria (EAV)
        for (const [fieldId, values] of Object.entries(classification.custom)) {
          const { error: deleteError } = await supabase
            .from('pb_scenario_criteria_values')
            .delete()
            .eq('scenario_id', scenarioId)
            .eq('field_id', fieldId);
          if (deleteError) throw deleteError;

          for (const value of values) {
            const isOption = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              value,
            );
            const { error: insertError } = await supabase
              .from('pb_scenario_criteria_values')
              .insert({
                scenario_id: scenarioId,
                field_id: fieldId,
                option_id: isOption ? value : null,
                value_text: isOption ? null : value,
              });
            if (insertError) throw insertError;
          }
        }

        // Flowchart
        if (flowchart.nodes.length > 0) {
          const { error } = await supabase.from('pb_flowcharts').upsert(
            {
              scenario_id: scenarioId,
              nodes: flowchart.nodes,
              edges: flowchart.edges,
            },
            { onConflict: 'scenario_id' },
          );
          if (error) throw error;
        }

        if (showToast) toast.success('Changes saved');
        router.refresh();
        return { success: true, id: scenarioId, slug: scenarioSlug };
      } catch (err) {
        if (showToast) {
          toast.error(err instanceof Error ? err.message : 'Could not save.');
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [state, classification, flowchart, scenario, userId, router],
  );

  const publish = async () => {
    if (incomplete.length > 0) {
      toast.error(
        `Cannot publish: ${incomplete.length} required ${incomplete.length === 1 ? 'item is' : 'items are'} missing. Check the Review step.`,
      );
      return;
    }

    setState((prev) => ({ ...prev, status: 'published' }));

    const res = await persist(false, 'published');
    if (res && res.slug) {
      toast.success('Scenario published successfully!');
      router.push(`/scenario/${res.slug}`);
      router.refresh();
    } else if (res && res.id) {
      toast.success('Scenario published successfully!');
      router.push(`/scenario/${res.id}`);
      router.refresh();
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

  const saveAsTemplateAction = async () => {
    if (!templateName.trim()) {
      toast.error('Template name is required.');
      return;
    }
    try {
      const supabase = createClient();
      const { error } = await supabase.from('pb_templates').insert({
        name: templateName.trim(),
        key: `custom-template-${Date.now().toString(36)}`,
        description: templateDesc.trim() || null,
        criteria_defaults: {
          category: classification.system.category,
          issue_type: classification.system.issue_type,
          severity: classification.system.severity,
          impact_scope: classification.system.impact_scope,
        },
        sections_content: {
          quick_fix: state.quick_fix,
          symptoms: state.symptoms,
          causes: state.causes,
          workarounds: state.workarounds,
          resolutions: state.resolutions,
          escalation: state.escalation,
          prevention: state.prevention,
        },
        is_global: true,
        is_active: true,
      });
      if (error) throw error;
      toast.success(`Template "${templateName}" saved!`);
      setSaveTemplateOpen(false);
      setTemplateName('');
      setTemplateDesc('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save template.');
    }
  };

  const applyTemplate = (template: ScenarioTemplate) => {
    const defaults = (template.criteria_defaults ?? {}) as Record<string, unknown>;
    const content = (template.sections_content ?? {}) as Record<string, string>;

    setState((prev) => ({
      ...prev,
      ...content,
      custom_sections: { ...prev.custom_sections, ...content },
    }));

    if (defaults.category) {
      const match = categories.find(
        (c) => c.id === defaults.category || c.slug === defaults.category,
      );
      if (match) {
        setClassification((prev) => ({
          ...prev,
          system: { ...prev.system, category: match.id },
        }));
      }
    }

    setTemplateOpen(false);
    toast.success(`Applied template "${template.name}"`);
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
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2.5 backdrop-blur">
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

          <span className="text-xs font-semibold truncate max-w-xs">
            {state.title || 'Untitled scenario'}
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

            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-2xs"
              onClick={() => setTemplateOpen(true)}
            >
              <IconList className="h-3.5 w-3.5" />
              Templates
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-2xs"
              onClick={() => setSaveTemplateOpen(true)}
              title="Save as template"
            >
              <IconBookmark className="h-3.5 w-3.5" />
              Save As Template
            </Button>

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
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-2xs"
              onClick={() => persist(true)}
              disabled={saving}
            >
              <IconDeviceFloppy className="h-3.5 w-3.5" />
              Save Draft
            </Button>

            <Button
              size="sm"
              className="h-7 gap-1.5 text-2xs font-semibold"
              onClick={publish}
              disabled={incomplete.length > 0}
              title={
                incomplete.length > 0
                  ? `${incomplete.length} required items missing`
                  : undefined
              }
            >
              Publish Directly
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
              />
            )}

            {activeStep.key === 'problem' && (
              <RichSection
                title="Problem description & symptoms"
                help="What the user reported and what was actually observed. Images can be pasted straight in."
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
                        Troubleshooting Flowchart (Decision Tree)
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Visual node editor for decision trees, branching diagnostic paths, and resolutions.
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
                scenarioId={scenario?.id ?? null}
                tickets={tickets}
                outcomes={outcomes}
                onRequireSave={async () => Boolean(await persist(false))}
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
                title="Workarounds"
                help="Temporary solutions while permanent fix is being executed."
                value={state.workarounds}
                onChange={(v) => update({ workarounds: v })}
              />
            )}

            {activeStep.key === 'resolutions' && (
              <ResolutionsStep
                value={state.resolutions}
                onChange={(v) => update({ resolutions: v })}
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
                scenarioId={scenario?.id ?? null}
                onRequireSave={async () => Boolean(await persist(false))}
              />
            )}

            {activeStep.key === 'related' && (
              <RelatedScenariosStep
                scenarioId={scenario?.id ?? null}
                allScenarios={allScenarios}
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
                onEditStep={(index) => setStep(index)}
                onPublish={publish}
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

      {/* Start from Template Dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Start from a template</DialogTitle>
            <DialogDescription>
              A template pre-fills standard criteria and section headings for common incident patterns.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {templates.length === 0 ? (
              <p className="text-xs text-muted-foreground">No templates configured yet.</p>
            ) : (
              templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  <p className="text-xs font-semibold text-foreground">{template.name}</p>
                  {template.description && (
                    <p className="mt-1 text-2xs text-muted-foreground leading-relaxed">
                      {template.description}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save as Template Dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Scenario as Template</DialogTitle>
            <DialogDescription>
              Create a reusable blueprint from this scenario's classification and section structure.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Fiber Link Drop Failover"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={templateDesc}
                onChange={(e) => setTemplateDesc(e.target.value)}
                placeholder="Brief summary of when to use this template..."
                rows={2}
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveAsTemplateAction}>
              Save Template
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
}: {
  value: string;
  onChange: (value: string) => void;
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
              <h3 className="text-xs font-semibold">Resolutions (Rich Text Mode)</h3>
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
            <h3 className="text-xs font-semibold">Resolution Steps *</h3>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Add ordered troubleshooting steps with optional terminal commands and screenshot attachments. Checkable during live calls.
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
              Add Step
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-xs text-muted-foreground">No resolution steps added yet.</p>
            <Button size="sm" variant="outline" className="mt-2 h-7 gap-1 text-2xs" onClick={addStep}>
              <IconPlus className="h-3 w-3" />
              Add Step 1
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
                  <Label className="text-2xs font-medium">Instruction *</Label>
                  <Textarea
                    value={it.instruction}
                    onChange={(e) => updateStep(idx, { instruction: e.target.value })}
                    placeholder="e.g. Switch edge router to secondary failover line."
                    rows={2}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-2xs font-medium">CLI / PowerShell Command (optional)</Label>
                  <Input
                    value={it.command ?? ''}
                    onChange={(e) => updateStep(idx, { command: e.target.value })}
                    placeholder="e.g. sudo ip route replace default via 192.168.100.1"
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
  onRequireSave,
}: {
  scenarioId: string | null;
  tickets: SampleTicket[];
  outcomes?: Outcome[];
  onRequireSave: () => Promise<boolean>;
}) {
  const [ticketId, setTicketId] = React.useState('');
  const [ticketList, setTicketList] = React.useState<SampleTicket[]>(tickets);
  const [saving, setSaving] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTicketList(tickets);
  }, [tickets]);

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
    let targetScenarioId = scenarioId;

    if (!targetScenarioId) {
      const saved = await onRequireSave();
      if (!saved) {
        setSaving(false);
        return;
      }
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from('pb_sample_tickets')
      .insert({
        scenario_id: targetScenarioId,
        ticket_id: cleanId,
      })
      .select()
      .single();

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    setTicketList((prev) => [data as SampleTicket, ...prev]);
    setTicketId('');
    toast.success(`Sample ticket "${cleanId}" added`);
  };

  const remove = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('pb_sample_tickets').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTicketList((prev) => prev.filter((t) => t.id !== id));
    toast.success('Sample ticket removed');
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

      {ticketList.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recorded Tickets ({ticketList.length})
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {ticketList.map((ticket) => {
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
  onRequireSave: () => Promise<boolean>;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<{ current: number; total: number } | null>(null);
  const [files, setFiles] = React.useState<any[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!scenarioId) return;
    const supabase = createClient();
    supabase
      .from('pb_attachments')
      .select('*')
      .eq('scenario_id', scenarioId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setFiles(data ?? []));
  }, [scenarioId]);

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const uploadBatch = async (selectedFiles: FileList | File[]) => {
    const fileList = Array.from(selectedFiles);
    if (fileList.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: fileList.length });
    let targetScenarioId = scenarioId;

    if (!targetScenarioId) {
      const saved = await onRequireSave();
      if (!saved) {
        setUploading(false);
        setUploadProgress(null);
        return;
      }
    }

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
            const path = `${targetScenarioId}/${crypto.randomUUID()}-${file.name}`;
            const { error: storageError } = await supabase.storage
              .from('scenario-attachments')
              .upload(path, file, { cacheControl: '3600', upsert: false });

            if (storageError) {
              errors.push(`${file.name}: ${storageError.message}`);
              return;
            }

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

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="text-xs font-semibold">Attachments & SOP Files</h3>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Multi-file upload supported. Store diagnostic scripts, logs, network traces, and SOP documents up to 100MB per file.
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
            Upload multiple files at once. Supports PNG, JPG, PDF, TXT, LOG, PCAP, MP4 (Max 100MB per file)
          </p>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Uploaded Files ({files.length})
            </h4>
            <ul className="space-y-1.5 max-h-60 overflow-y-auto">
              {files.map((attachment) => (
                <li
                  key={attachment.id}
                  className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-xs hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <IconPaperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium text-foreground">
                      {attachment.file_name}
                    </span>
                    <span className="text-2xs text-muted-foreground shrink-0">
                      ({formatSize(attachment.file_size)})
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:bg-destructive/10 shrink-0 ml-2"
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
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Related Scenarios Picker Step
// ----------------------------------------------------------------------------
function RelatedScenariosStep({
  scenarioId,
  allScenarios,
}: {
  scenarioId: string | null;
  allScenarios: Pick<Scenario, 'id' | 'slug' | 'title'>[];
}) {
  const [selectedId, setSelectedId] = React.useState('');
  const [relatedList, setRelatedList] = React.useState<{ id: string; title: string; slug: string }[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!scenarioId) return;
    const supabase = createClient();
    supabase
      .from('pb_related_scenarios')
      .select('related_scenario_id')
      .eq('scenario_id', scenarioId)
      .then(({ data }) => {
        const ids = (data ?? []).map((r) => r.related_scenario_id);
        const matches = allScenarios.filter((s) => ids.includes(s.id));
        setRelatedList(matches);
      });
  }, [scenarioId, allScenarios]);

  const addRelated = async () => {
    if (!scenarioId) {
      toast.error('Save the scenario draft first before linking related scenarios.');
      return;
    }
    if (!selectedId) return;

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from('pb_related_scenarios').insert({
      scenario_id: scenarioId,
      related_scenario_id: selectedId,
      relation_type: 'related',
    });

    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    const matched = allScenarios.find((s) => s.id === selectedId);
    if (matched) setRelatedList((prev) => [...prev, matched]);
    setSelectedId('');
    toast.success('Related scenario linked');
  };

  const removeRelated = async (relId: string) => {
    if (!scenarioId) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('pb_related_scenarios')
      .delete()
      .eq('scenario_id', scenarioId)
      .eq('related_scenario_id', relId);

    if (error) {
      toast.error(error.message);
      return;
    }
    setRelatedList((prev) => prev.filter((r) => r.id !== relId));
    toast.success('Link removed');
  };

  const availableScenarios = allScenarios.filter(
    (s) => s.id !== scenarioId && !relatedList.some((r) => r.id === s.id),
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="text-xs font-semibold">Related Scenarios</h3>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Link other playbooks relevant to this problem (e.g. Wi-Fi issues related to VPN failures).
          </p>
        </div>

        {relatedList.length > 0 && (
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
                >
                  <IconTrash className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">Select a related scenario to link...</option>
            {availableScenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            className="h-8 gap-1 text-2xs"
            onClick={addRelated}
            disabled={!selectedId || loading || !scenarioId}
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
  onEditStep,
  onPublish,
}: {
  state: EditorState;
  classification: ClassificationValue;
  fields: CriteriaField[];
  optionsByField: Record<string, CriteriaOption[]>;
  accounts: Account[];
  categories: Category[];
  checklist: { key: string; label: string; done: boolean }[];
  onEditStep: (index: number) => void;
  onPublish: () => void;
}) {
  const incomplete = checklist.filter((i) => !i.done);

  return (
    <div className="space-y-4">
      {incomplete.length > 0 ? (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <IconAlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Publishing Blocked: {incomplete.length} required item{incomplete.length === 1 ? ' is' : 's are'} missing
                </p>
                <ul className="mt-1.5 space-y-1">
                  {incomplete.map((item) => (
                    <li key={item.key} className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                      {item.label}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-2xs text-muted-foreground">
                  The database trigger will reject publishing until all required items above are filled.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-500/50 bg-emerald-500/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <IconCheck className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Ready to Publish!
                </p>
                <p className="text-2xs text-muted-foreground">
                  All required classification criteria, Quick Fix, and resolution steps are complete.
                </p>
              </div>
            </div>
            <Button size="sm" className="h-8 font-semibold text-xs" onClick={onPublish}>
              Publish Directly
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-xs font-semibold">Completeness Checklist</h3>
          <ul className="space-y-1.5">
            {checklist.map((item) => (
              <li key={item.key} className="flex items-center justify-between text-xs py-1 border-b last:border-b-0">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full',
                      item.done
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-500/15 text-amber-600',
                    )}
                  >
                    {item.done ? (
                      <IconCheck className="h-2.5 w-2.5" />
                    ) : (
                      <IconAlertCircle className="h-2.5 w-2.5" />
                    )}
                  </span>
                  {item.label}
                </span>
                <Badge variant={item.done ? 'outline' : 'secondary'} className="h-4 text-[10px]">
                  {item.done ? 'Completed' : 'Missing'}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-xs font-semibold">Classification Summary</h3>
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
                  if (state.is_global) {
                    display = 'Global (All Accounts)';
                  } else if (state.account_ids && state.account_ids.length > 0) {
                    const matched = accounts.filter((a) => state.account_ids.includes(a.id));
                    display = matched.map((a) => `${a.name} (${a.code})`).join(', ');
                  } else {
                    const acct = accounts.find((a) => a.id === classification.system.account);
                    display = acct ? `${acct.name} (${acct.code})` : '—';
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
