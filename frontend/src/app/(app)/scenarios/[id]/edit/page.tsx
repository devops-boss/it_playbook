import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getEditorData, getScenarioForEdit } from '@/lib/data/editor';
import { ScenarioEditor } from '@/components/editor/scenario-editor';

export const dynamic = 'force-dynamic';

export default async function EditScenarioPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const scenario = await getScenarioForEdit(params.id);
  if (!scenario) notFound();

  const canEdit =
    user.isSuperAdmin ||
    user.permissions.global.has('edit_any_scenario') ||
    (user.permissions.global.has('edit_own_scenario') &&
      scenario.created_by === user.id);

  if (!canEdit) redirect('/');

  const data = await getEditorData(scenario.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-3 bg-card/30">
        <h1 className="text-sm font-bold tracking-tight text-foreground">Edit Playbook Scenario</h1>
        <p className="text-2xs text-muted-foreground">
          Update the playbook title, problem category, target account(s) or All Accounts (Global), and resolution flow.
        </p>
      </div>
      <ScenarioEditor
        scenario={scenario}
        fields={data.fields}
        optionsByField={data.optionsByField}
        categories={data.categories}
        accounts={data.accounts}
        sections={data.sections}
        nodeTypes={data.nodeTypes}
        outcomes={data.outcomes}
        templates={data.templates}
        tickets={data.tickets}
        allScenarios={data.scenarios}
        userId={user.id}
      />
    </div>
  );
}
