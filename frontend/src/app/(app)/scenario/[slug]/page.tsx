import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ScenarioReader } from '@/components/scenarios/scenario-reader';
import { getCurrentUser, can } from '@/lib/auth';
import { getCriteriaFields, getOptionsForFields } from '@/lib/data/criteria';
import { getScenarioBundle } from '@/lib/data/scenario';
import { buildCriteriaLookup, resolveChips } from '@/lib/data/criteria-lookup';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const bundle = await getScenarioBundle(params.slug);
  return { title: bundle?.scenario.title ?? 'Scenario' };
}

export default async function ScenarioPage({
  params,
}: {
  params: { slug: string };
}) {
  const bundle = await getScenarioBundle(params.slug);
  if (!bundle) notFound();

  const user = await getCurrentUser();
  const fields = await getCriteriaFields('scenarios');
  const optionsByField = await getOptionsForFields(fields.map((f) => f.id));
  const lookup = buildCriteriaLookup(fields, optionsByField);

  const chips = resolveChips(
    bundle.scenario,
    bundle.criteriaValues,
    lookup,
    new Map(
      Object.entries(bundle.accountNames).map(([id, name]) => [id, name]),
    ),
  );

  // Is this scenario favourited by the current user?
  let isFavorite = false;
  if (user) {
    const supabase = createClient();
    const { data } = await supabase
      .from('pb_favorites')
      .select('scenario_id')
      .eq('user_id', user.id)
      .eq('scenario_id', bundle.scenario.id)
      .maybeSingle();
    isFavorite = Boolean(data);
  }

  const canEdit =
    can(user, 'edit_any_scenario') ||
    (can(user, 'edit_own_scenario') && bundle.scenario.created_by === user?.id);

  return (
    <ScenarioReader
      scenario={bundle.scenario}
      authorName={bundle.authorName}
      chips={chips}
      sections={bundle.sections}
      tickets={bundle.tickets}
      attachments={bundle.attachments}
      related={bundle.related}
      flowchart={bundle.flowchart}
      nodeTypes={bundle.nodeTypes}
      outcomes={bundle.outcomes}
      accountNames={bundle.accountNames}
      categoryName={bundle.categoryName}
      canEdit={canEdit}
      isFavorite={isFavorite}
      ticketUrlTemplate={bundle.ticketUrlTemplate}
      userId={user?.id ?? ''}
      siblingScenarios={bundle.siblingScenarios}
      nextScenario={bundle.nextScenario}
    />
  );
}
