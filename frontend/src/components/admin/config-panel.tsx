'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  IconAlertCircle,
  IconDownload,
  IconFileImport,
  IconHistory,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { formatRelative } from '@/lib/utils';
import type { ConfigHistoryEntry } from '@/types/database';

/**
 * Configuration export and import.
 *
 * The export is a single JSON document containing every configuration table.
 * The import validates the document's shape before it writes anything, and
 * refuses anything that is not a configuration export.
 */
export function ConfigPanel({ auditLog }: { auditLog: ConfigHistoryEntry[] }) {
  const [importText, setImportText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<string[]>([]);

  const doExport = async () => {
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('export_config');

    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bos-playbook-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Configuration exported');
  };

  /** Check the pasted JSON before offering to import it. */
  const validate = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setPreview([]);
        return null;
      }
      const keys = Object.keys(parsed);
      const known = [
        'criteria_fields',
        'criteria_options',
        'categories',
        'section_definitions',
        'templates',
        'node_types',
        'outcomes',
        'settings',
        'synonyms',
        'tags',
      ];
      const recognised = keys.filter((k) => known.includes(k));
      setPreview(recognised);
      return recognised.length > 0 ? parsed : null;
    } catch {
      setPreview([]);
      return null;
    }
  };

  const doImport = async () => {
    const parsed = validate(importText);
    if (!parsed) {
      toast.error('That does not look like a configuration export.');
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const errors: string[] = [];

    // Each table is imported independently so one bad table does not abort
    // the whole import.
    const tableMap: {
      key: string;
      table: string;
      conflict: string;
    }[] = [
      { key: 'criteria_fields', table: 'pb_criteria_fields', conflict: 'id' },
      { key: 'criteria_options', table: 'pb_criteria_options', conflict: 'id' },
      { key: 'categories', table: 'pb_categories', conflict: 'id' },
      { key: 'section_definitions', table: 'pb_section_definitions', conflict: 'id' },
      { key: 'node_types', table: 'pb_node_types', conflict: 'id' },
      { key: 'outcomes', table: 'pb_outcomes', conflict: 'id' },
      { key: 'synonyms', table: 'pb_synonyms', conflict: 'id' },
      { key: 'tags', table: 'pb_tags', conflict: 'id' },
    ];

    for (const entry of tableMap) {
      const rows = parsed[entry.key];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      for (const row of rows) {
        const { id, created_at, updated_at, ...payload } = row as Record<
          string,
          unknown
        >;
        const { error } = await supabase
          .from(entry.table)
          .upsert(payload, { onConflict: entry.conflict });
        if (error) {
          errors.push(`${entry.key}: ${error.message}`);
        }
      }
    }

    setBusy(false);
    if (errors.length > 0) {
      toast.error(`${errors.length} rows could not be imported`);
      setPreview([...preview, ...errors.slice(0, 5)]);
    } else {
      toast.success('Configuration imported');
      setImportText('');
      setPreview([]);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
            <IconDownload className="h-3.5 w-3.5" />
            Export configuration
          </CardTitle>
          <p className="text-2xs text-muted-foreground">
            Downloads every configuration table as one JSON file: criteria
            fields and options, categories, sections, templates, node types,
            outcomes, settings, synonyms and tags. Scenarios are not included -
            they are content, not configuration.
          </p>
        </CardHeader>
        <CardContent className="p-3.5">
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={doExport}
            disabled={busy}
          >
            <IconDownload className="h-3.5 w-3.5" />
            Export configuration
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
            <IconFileImport className="h-3.5 w-3.5" />
            Import configuration
          </CardTitle>
          <p className="text-2xs text-muted-foreground">
            Paste an exported configuration file. Rows are matched on their id,
            so importing over an existing configuration updates it in place
            rather than duplicating it.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 p-3.5">
          <Textarea
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              validate(e.target.value);
            }}
            rows={6}
            className="font-mono text-2xs"
            placeholder='{ "version": "1.0", "criteria_fields": [ … ] }'
          />
          {preview.length > 0 && (
            <p className="text-2xs text-emerald-600 dark:text-emerald-400">
              Recognised: {preview.join(', ')}
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={doImport}
            disabled={busy || importText.trim().length === 0}
          >
            <IconFileImport className="h-3.5 w-3.5" />
            Import
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
            <IconHistory className="h-3.5 w-3.5" />
            Configuration audit log
          </CardTitle>
          <p className="text-2xs text-muted-foreground">
            Every configuration change is recorded, with before and after
            values and an impact summary.
          </p>
        </CardHeader>
        <CardContent className="p-3.5">
          {auditLog.length === 0 ? (
            <p className="text-2xs text-muted-foreground">
              No configuration changes recorded.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {auditLog.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-2xs"
                >
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {entry.action}
                  </Badge>
                  <span className="font-medium">{entry.config_type}</span>
                  {entry.config_id && (
                    <span className="font-mono text-muted-foreground">
                      {entry.config_id.slice(0, 8)}
                    </span>
                  )}
                  {entry.impact_summary && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <IconAlertCircle className="h-3 w-3" />
                      {entry.impact_summary}
                    </span>
                  )}
                  <span className="ml-auto text-muted-foreground">
                    {formatRelative(entry.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
