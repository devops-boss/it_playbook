import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getAdminData } from '@/lib/data/admin';
import { SettingsPanel, StructurePanel, SynonymsPanel } from '@/components/admin/settings-panel';
import { ConfigPanel } from '@/components/admin/config-panel';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (
    !user.isSuperAdmin &&
    !user.permissions.global.has('manage_criteria')
  ) {
    redirect('/');
  }

  const data = await getAdminData();

  return (
    <div className="px-4 py-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-sm font-semibold">Settings</h1>
          <p className="text-2xs text-muted-foreground">
            Application behaviour, structure and search synonyms. Every change
            here is written to the audit log.
          </p>
        </div>

        <SettingsPanel settings={data.settings} />

        <SynonymsPanel synonyms={data.synonyms} />

        <StructurePanel
          sections={data.sections}
          nodeTypes={data.nodeTypes}
          outcomes={data.outcomes}
          tags={data.tags}
        />

        <ConfigPanel auditLog={data.auditLog} />
      </div>
    </div>
  );
}
