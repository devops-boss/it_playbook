'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { IconHistory, IconRestore } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { formatRelative } from '@/lib/utils';

interface VersionRow {
  id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  change_note: string | null;
  created_at: string;
  changed_by: string | null;
}

interface VersionHistoryDrawerProps {
  scenarioId: string;
  onClose: () => void;
  onRestored: () => void;
}

/**
 * Version history with restore.
 *
 * Every save creates a version row, so an author can always get back to an
 * earlier state of a scenario.
 */
export function VersionHistoryDrawer({
  scenarioId,
  onClose,
  onRestored,
}: VersionHistoryDrawerProps) {
  const [versions, setVersions] = React.useState<VersionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [restoring, setRestoring] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pb_versions')
      .select('*')
      .eq('scenario_id', scenarioId)
      .order('version_number', { ascending: false })
      .limit(50);
    setLoading(false);
    // An empty history and a history that could not be read look the same,
    // and one of them hides the way back.
    if (error) {
      setVersions([]);
      toast.error(`Could not load the version history: ${error.message}`);
      return;
    }
    setVersions((data ?? []) as VersionRow[]);
  }, [scenarioId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const restore = async (version: VersionRow) => {
    setRestoring(version.id);
    const supabase = createClient();

    const snapshot = version.snapshot ?? {};
    const { error } = await supabase
      .from('pb_scenarios')
      .update({
        title: (snapshot.title as string) ?? null,
        summary: (snapshot.summary as string) ?? null,
        quick_fix: (snapshot.quick_fix as string) ?? null,
        symptoms: (snapshot.symptoms as string) ?? null,
        causes: (snapshot.causes as string) ?? null,
        workarounds: (snapshot.workarounds as string) ?? null,
        resolutions: (snapshot.resolutions as string) ?? null,
        escalation: (snapshot.escalation as string) ?? null,
        prevention: (snapshot.prevention as string) ?? null,
        custom_sections: (snapshot.custom_sections as Record<string, string>) ?? {},
        tags: (snapshot.tags as string[]) ?? [],
      })
      .eq('id', scenarioId);

    setRestoring(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Restored version ${version.version_number}`);
    onRestored();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <IconHistory className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Version history</h2>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-2xs"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="text-2xs text-muted-foreground">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="text-2xs text-muted-foreground">
              No versions recorded yet. A version is captured on every save.
            </p>
          ) : (
            <ol className="space-y-2">
              {versions.map((version) => (
                <li key={version.id}>
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          v{version.version_number}
                        </Badge>
                        <span className="text-2xs text-muted-foreground">
                          {formatRelative(version.created_at)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-auto h-6 gap-1 text-2xs"
                          onClick={() => restore(version)}
                          disabled={restoring === version.id}
                        >
                          <IconRestore className="h-3 w-3" />
                          Restore
                        </Button>
                      </div>
                      {version.change_note && (
                        <p className="mt-1.5 text-2xs text-muted-foreground">
                          {version.change_note}
                        </p>
                      )}
                      <p className="mt-1 text-2xs font-medium">
                        {(version.snapshot?.title as string) ?? 'Untitled'}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
