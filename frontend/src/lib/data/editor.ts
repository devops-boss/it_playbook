import { createClient } from '@/lib/supabase/server';
import { throwOnFirstError, toUpstreamError } from '@/lib/api-error';
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

/** Everything the scenario editor needs, loaded in parallel. */
export interface EditorData {
  fields: CriteriaField[];
  optionsByField: Record<string, CriteriaOption[]>;
  categories: Category[];
  accounts: Account[];
  sections: SectionDefinition[];
  nodeTypes: NodeType[];
  outcomes: Outcome[];
  templates: ScenarioTemplate[];
  tickets: SampleTicket[];
  scenarios: Pick<Scenario, 'id' | 'slug' | 'title'>[];
}

export async function getEditorData(
  scenarioId: string | null,
): Promise<EditorData> {
  const supabase = createClient();

  const [
    fields,
    options,
    categories,
    accounts,
    sections,
    nodeTypes,
    outcomes,
    templates,
    tickets,
    scenarios,
  ] = await Promise.all([
    supabase
      .from('pb_criteria_fields')
      .select('*')
      .in('applies_to', ['scenarios', 'both'])
      .order('sort_order'),
    supabase
      .from('pb_criteria_options')
      .select('*')
      .order('sort_order'),
    supabase.from('pb_categories').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('pb_accounts').select('*').order('name'),
    supabase
      .from('pb_section_definitions')
      .select('*')
      .in('applies_to', ['scenarios', 'both'])
      .order('sort_order'),
    supabase.from('pb_node_types').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('pb_outcomes').select('*').eq('is_active', true).order('sort_order'),
    supabase
      .from('pb_templates')
      .select('*')
      .eq('is_active', true)
      .order('name'),
    scenarioId
      ? supabase
          .from('pb_sample_tickets')
          .select('*')
          .eq('scenario_id', scenarioId)
          .order('ticket_date', { ascending: false })
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase
      .from('pb_scenarios')
      .select('id, slug, title')
      .is('deleted_at', null)
      .order('title')
      .limit(500),
  ]);

  // The editor is built from all of these; a missing one would leave a
  // dropdown empty with nothing to say why.
  throwOnFirstError([
    fields,
    options,
    categories,
    accounts,
    sections,
    nodeTypes,
    outcomes,
    templates,
    tickets,
    scenarios,
  ]);

  const optionsByField: Record<string, CriteriaOption[]> = {};
  for (const option of options.data ?? []) {
    const fieldId = option.field_id as string;
    const list = optionsByField[fieldId] ?? [];
    list.push(option as CriteriaOption);
    optionsByField[fieldId] = list;
  }

  return {
    fields: (fields.data ?? []) as CriteriaField[],
    optionsByField,
    categories: (categories.data ?? []) as Category[],
    accounts: (accounts.data ?? []) as Account[],
    sections: (sections.data ?? []) as SectionDefinition[],
    nodeTypes: (nodeTypes.data ?? []) as NodeType[],
    outcomes: (outcomes.data ?? []) as Outcome[],
    templates: (templates.data ?? []) as ScenarioTemplate[],
    tickets: (tickets.data ?? []) as SampleTicket[],
    scenarios: (scenarios.data ?? []) as Pick<Scenario, 'id' | 'slug' | 'title'>[],
  };
}

/** A single scenario for the editor. */
export async function getScenarioForEdit(
  idOrSlug: string,
): Promise<Scenario | null> {
  const supabase = createClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  let query = supabase.from('pb_scenarios').select('*').is('deleted_at', null);
  query = isUuid ? query.eq('id', idOrSlug) : query.eq('slug', idOrSlug);
  const { data, error } = await query.maybeSingle();
  if (error) throw toUpstreamError(error);
  return (data as Scenario) ?? null;
}
