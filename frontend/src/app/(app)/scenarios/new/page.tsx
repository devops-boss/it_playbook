import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getEditorData } from '@/lib/data/editor';
import { ScenarioEditor } from '@/components/editor/scenario-editor';

export const dynamic = 'force-dynamic';

export default async function NewScenarioPage({
  searchParams,
}: {
  searchParams?: { account_id?: string; category_id?: string; title?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const canCreate =
    user.isSuperAdmin ||
    user.permissions.global.has('create_scenarios') ||
    user.permissions.global.has('edit_any_scenario');

  if (!canCreate) redirect('/');

  const data = await getEditorData(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-3 bg-card/30">
        <h1 className="text-sm font-bold tracking-tight text-foreground">New Playbook Scenario</h1>
        <p className="text-2xs text-muted-foreground">
          Define the playbook title, problem category, target client account(s) or All Accounts (Global), and troubleshooting procedures.
        </p>
      </div>
      <ScenarioEditor
        scenario={null}
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
        initialAccountId={searchParams?.account_id ?? null}
        initialCategoryId={searchParams?.category_id ?? null}
        initialTitle={searchParams?.title ?? null}
      />
    </div>
  );
}
