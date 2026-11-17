import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { IconStar } from '@tabler/icons-react';
import {
  getFavoriteScenarios,
  getCriteriaFields,
  getOptionsForFields,
  getCriteriaValuesForScenarios,
  getPlaybookMetaMap,
  getAccounts,
} from '@/lib/data/criteria';
import { buildCriteriaLookup, resolveChips } from '@/lib/data/criteria-lookup';
import { ScenarioCard } from '@/components/scenarios/scenario-card';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let scenarios: any[] = [];
  let fields: any[] = [];
  let accounts: any[] = [];
  let optionsByField: Record<string, any[]> = {};
  let criteriaValues: Record<string, any[]> = {};
  let metaMap: Record<string, any> = {};

  try {
    const [scens, flds, accs] = await Promise.all([
      getFavoriteScenarios(user.id),
      getCriteriaFields('scenarios').catch(() => []),
      getAccounts().catch(() => []),
    ]);

    scenarios = scens;
    fields = flds;
    accounts = accs;

    const scenarioIds = scenarios.map((s) => s.id);
    if (scenarioIds.length > 0) {
      const [opts, crits, metas] = await Promise.all([
        getOptionsForFields(fields.map((f) => f.id)).catch(() => ({})),
        getCriteriaValuesForScenarios(scenarioIds).catch(() => ({})),
        getPlaybookMetaMap(scenarioIds).catch(() => ({})),
      ]);
      optionsByField = opts;
      criteriaValues = crits;
      metaMap = metas;
    }
  } catch (err) {
    console.error('Error fetching favorites data:', err);
  }

  const lookup = buildCriteriaLookup(fields, optionsByField);
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Favorites</h1>
              {scenarios.length > 0 && (
                <Badge variant="secondary" className="text-2xs h-5 px-1.5 font-semibold">
                  {scenarios.length} {scenarios.length === 1 ? 'playbook' : 'playbooks'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Bookmarked troubleshooting playbooks and quick fix scenarios for fast reference.
            </p>
          </div>
        </div>

        {scenarios.length === 0 ? (
          <EmptyState
            icon={IconStar}
            title="No favorite scenarios saved yet"
            description="Star any scenario while reading to add it here for one-click access during live support tickets."
          />
        ) : (
          <div className="grid gap-3">
            {scenarios.map((scen) => {
              const chips = resolveChips(
                scen,
                criteriaValues[scen.id] ?? [],
                lookup,
                accountMap,
              );
              const isDoc = Boolean(metaMap[scen.id]?.isDocumentation);
              const accountName = scen.is_global
                ? 'All Accounts (Global)'
                : scen.account_id
                  ? accountMap.get(scen.account_id) ?? null
                  : null;

              return (
                <ScenarioCard
                  key={scen.id}
                  id={scen.id}
                  title={scen.title}
                  slug={scen.slug}
                  summary={scen.summary}
                  quickFix={scen.quick_fix}
                  occurrenceCount={scen.occurrence_count}
                  lastOccurredAt={scen.last_occurred_at}
                  updatedAt={scen.updated_at}
                  isGlobal={scen.is_global}
                  status={scen.status}
                  accountName={accountName}
                  chips={chips}
                  isDocumentation={isDoc}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
