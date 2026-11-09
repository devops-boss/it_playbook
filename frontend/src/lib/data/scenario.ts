import { createClient } from '@/lib/supabase/server';
import { throwOnFirstError, toUpstreamError } from '@/lib/api-error';
import type {
  Attachment,
  NodeType,
  Outcome,
  SampleTicket,
  Scenario,
  ScenarioCriteriaValue,
  SectionDefinition,
} from '@/types/database';

/** Everything the scenario reader needs, loaded in parallel. */
export interface ScenarioBundle {
  scenario: Scenario;
  authorName: string | null;
  sections: SectionDefinition[];
  tickets: SampleTicket[];
  attachments: Attachment[];
  related: { slug: string; title: string; relation_type: string }[];
  criteriaValues: ScenarioCriteriaValue[];
  flowchart: { nodes: any[]; edges: any[] } | null;
  nodeTypes: NodeType[];
  outcomes: Outcome[];
  accountNames: Record<string, string>;
  categoryName: string | null;
  ticketUrlTemplate: string | null;
  siblingScenarios: { id: string; slug: string; title: string }[];
  nextScenario: { id: string; slug: string; title: string } | null;
}

export async function getScenarioBundle(slug: string): Promise<ScenarioBundle | null> {
  const supabase = createClient();

  const { data: scenario, error } = await supabase
    .from('pb_scenarios')
    .select('*')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw toUpstreamError(error);
  if (!scenario) return null;

  const [
    sections,
    tickets,
    attachments,
    relatedRows,
    criteriaValues,
    flowchart,
    nodeTypes,
    outcomes,
    accounts,
    categories,
    settings,
    authorProfile,
  ] = await Promise.all([
    supabase
      .from('pb_section_definitions')
      .select('*')
      .in('applies_to', ['scenarios', 'both'])
      .order('sort_order'),
    supabase
      .from('pb_sample_tickets')
      .select('*')
      .eq('scenario_id', scenario.id)
      .order('ticket_date', { ascending: false }),
    supabase.from('pb_attachments').select('*').eq('scenario_id', scenario.id),
    supabase
      .from('pb_related_scenarios')
      .select('relation_type, related_scenario_id')
      .eq('scenario_id', scenario.id),
    supabase
      .from('pb_scenario_criteria_values')
      .select('*')
      .eq('scenario_id', scenario.id),
    supabase.from('pb_flowcharts').select('*').eq('scenario_id', scenario.id).maybeSingle(),
    supabase.from('pb_node_types').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('pb_outcomes').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('pb_accounts').select('id, name, ticket_url_template'),
    supabase.from('pb_categories').select('id, name'),
    supabase.from('pb_settings').select('*').eq('scope', 'global').maybeSingle(),
    scenario.created_by
      ? supabase
          .from('pb_user_profiles')
          .select('display_name, email')
          .eq('id', scenario.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  throwOnFirstError([
    sections,
    tickets,
    attachments,
    relatedRows,
    criteriaValues,
    flowchart,
    nodeTypes,
    outcomes,
    accounts,
    categories,
    settings,
  ]);

  // Resolve the related scenarios to slugs and titles.
  const relatedIds = (relatedRows.data ?? []).map((r) => r.related_scenario_id as string);
  let related: ScenarioBundle['related'] = [];
  if (relatedIds.length > 0) {
    const { data: relatedScenarios, error: relatedError } = await supabase
      .from('pb_scenarios')
      .select('id, slug, title')
      .in('id', relatedIds);
    if (relatedError) throw toUpstreamError(relatedError);
    const byId = new Map(
      (relatedScenarios ?? []).map((s) => [s.id as string, s]),
    );
    related = (relatedRows.data ?? []).map((r) => {
      const target = byId.get(r.related_scenario_id as string);
      return {
        slug: target?.slug ?? '',
        title: target?.title ?? 'Scenario',
        relation_type: r.relation_type ?? 'related',
      };
    });
  }

  // Load sibling scenarios in the same category or account for Left Rail navigation
  let siblingScenarios: { id: string; slug: string; title: string }[] = [];
  let siblingQuery = supabase
    .from('pb_scenarios')
    .select('id, slug, title')
    .is('deleted_at', null)
    .eq('status', 'published');

  if (scenario.category_id) {
    siblingQuery = siblingQuery.eq('category_id', scenario.category_id);
  } else if (scenario.account_id) {
    siblingQuery = siblingQuery.eq('account_id', scenario.account_id);
  }

  const { data: siblings } = await siblingQuery.order('title').limit(20);
  siblingScenarios = (siblings ?? []) as { id: string; slug: string; title: string }[];

  // Fallback if category has only this scenario
  if (siblingScenarios.length <= 1) {
    const { data: popular } = await supabase
      .from('pb_scenarios')
      .select('id, slug, title')
      .is('deleted_at', null)
      .eq('status', 'published')
      .order('title')
      .limit(10);
    siblingScenarios = (popular ?? []) as { id: string; slug: string; title: string }[];
  }

  const currentIndex = siblingScenarios.findIndex((s) => s.id === scenario.id);
  const nextScenario =
    currentIndex >= 0 && currentIndex < siblingScenarios.length - 1
      ? siblingScenarios[currentIndex + 1]
      : currentIndex > 0
        ? siblingScenarios[0]
        : null;

  // Resolve signed URLs for attachments
  const attachmentsWithUrls: Attachment[] = await Promise.all(
    ((attachments.data ?? []) as Attachment[]).map(async (att) => {
      try {
        const { data: signed } = await supabase.storage
          .from('scenario-attachments')
          .createSignedUrl(att.file_path, 3600);
        return { ...att, signed_url: signed?.signedUrl ?? null };
      } catch {
        return { ...att, signed_url: null };
      }
    }),
  );

  const accountNames: Record<string, string> = {};
  for (const a of accounts.data ?? []) {
    accountNames[a.id as string] = a.name as string;
  }

  const categoryName =
    (categories.data ?? []).find((c) => c.id === scenario.category_id)?.name ?? null;

  const globalSettings = (settings.data?.settings ?? {}) as Record<string, unknown>;
  const accountMatch = (accounts.data ?? []).find((a) => a.id === scenario.account_id);
  const ticketUrlTemplate =
    (accountMatch?.ticket_url_template as string | null) ||
    (globalSettings.ticket_url_template as string | undefined) ||
    (globalSettings.ticketUrlTemplate as string | undefined) ||
    'https://ticketing.bigoutsource.com/ticket/{ticket_id}';

  const authorName =
    authorProfile?.data?.display_name ||
    (authorProfile?.data?.email ? authorProfile.data.email.split('@')[0] : null);

  return {
    scenario: scenario as Scenario,
    authorName,
    sections: (sections.data ?? []) as SectionDefinition[],
    tickets: (tickets.data ?? []) as SampleTicket[],
    attachments: attachmentsWithUrls,
    related,
    criteriaValues: (criteriaValues.data ?? []) as ScenarioCriteriaValue[],
    flowchart: (flowchart.data as any) ?? null,
    nodeTypes: (nodeTypes.data ?? []) as NodeType[],
    outcomes: (outcomes.data ?? []) as Outcome[],
    accountNames,
    categoryName,
    ticketUrlTemplate,
    siblingScenarios,
    nextScenario,
  };
}

/** The section definitions for a given applies_to value. */
export async function getSectionDefinitions(
  appliesTo: 'scenarios' | 'playbooks' | 'both' = 'scenarios',
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('pb_section_definitions')
    .select('*')
    .in('applies_to', [appliesTo, 'both'])
    .order('sort_order');
  if (error) throw toUpstreamError(error);
  return data ?? [];
}

/** The global app settings (accent colour, templates, thresholds). */
export async function getGlobalSettings() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('pb_settings')
    .select('*')
    .eq('scope', 'global')
    .maybeSingle();
  if (error) throw toUpstreamError(error);
  return (data?.settings ?? {}) as Record<string, unknown>;
}
