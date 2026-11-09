'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  IconCheck,
  IconDeviceFloppy,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/lib/supabase/client';
import { checkContrast, cn } from '@/lib/utils';

interface SettingsPanelProps {
  settings: Record<string, unknown>;
}

const DEFAULT_SETTINGS = {
  app_name: 'IT Operations Playbook',
  app_logo: '/logo.png',
  accent_color: '#2563eb',
  default_theme: 'light',
  stale_threshold_days: 180,
  inactivity_timeout_minutes: 60,
  pinned_items_count: 10,
  upload_max_size: 10485760,
  announcement_banner: '',
  ticket_url_template: '',
};

/**
 * The application settings.
 *
 * Everything here is a JSONB key/value pair, so adding a new setting needs
 * no migration and no code change.
 */
export function SettingsPanel({ settings }: SettingsPanelProps) {
  const [values, setValues] = React.useState<Record<string, unknown>>({
    ...DEFAULT_SETTINGS,
    ...settings,
  });
  const [saving, setSaving] = React.useState(false);

  const update = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('pb_settings')
      .update({ settings: values })
      .eq('scope', 'global');

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Settings saved');
  };

  const accent = String(values.accent_color ?? '#2563eb');
  const contrast = checkContrast('#ffffff', accent);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium">Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="set-name" className="text-xs">
              Application name
            </Label>
            <Input
              id="set-name"
              value={String(values.app_name ?? '')}
              onChange={(e) => update('app_name', e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-logo" className="text-xs">
              Logo path
            </Label>
            <Input
              id="set-logo"
              value={String(values.app_logo ?? '')}
              onChange={(e) => update('app_logo', e.target.value)}
              className="h-8 font-mono text-2xs"
            />
            <p className="text-2xs text-muted-foreground">
              A path served from the app&apos;s own public folder, so nothing is
              fetched from a CDN at runtime.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-accent" className="text-xs">
              Accent colour
            </Label>
            <div className="flex items-center gap-2">
              <input
                id="set-accent"
                type="color"
                value={accent}
                onChange={(e) => update('accent_color', e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border bg-background p-0.5"
              />
              <Input
                value={accent}
                onChange={(e) => update('accent_color', e.target.value)}
                className="h-8 w-32 font-mono text-xs"
              />
              <Badge
                variant={contrast.passesAA ? 'secondary' : 'destructive'}
                className="h-5 px-1.5 text-[10px]"
              >
                {contrast.passesAA ? (
                  <>
                    <IconCheck className="h-2.5 w-2.5" />
                    {contrast.ratio}:1 {contrast.level}
                  </>
                ) : (
                  `${contrast.ratio}:1 - too low`
                )}
              </Badge>
            </div>
            {!contrast.passesAA && (
              <p className="text-2xs text-destructive">
                White text on this colour fails WCAG AA. Pick a darker shade.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Default theme</Label>
            <div className="flex gap-1.5">
              {(['light', 'dark', 'system'] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => update('default_theme', theme)}
                  className={cn(
                    'chip-interactive',
                    values.default_theme === theme && 'ring-1 ring-primary',
                  )}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium">Behaviour</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3.5">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-stale" className="text-xs">
                Mark scenarios stale after (days)
              </Label>
              <Input
                id="set-stale"
                type="number"
                min={1}
                value={String(values.stale_threshold_days ?? 180)}
                onChange={(e) =>
                  update('stale_threshold_days', Number(e.target.value))
                }
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-inactivity" className="text-xs">
                Inactivity sign-out (minutes)
              </Label>
              <Input
                id="set-inactivity"
                type="number"
                min={5}
                max={1440}
                value={String(values.inactivity_timeout_minutes ?? 60)}
                onChange={(e) =>
                  update('inactivity_timeout_minutes', Number(e.target.value))
                }
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-pinned" className="text-xs">
                Pinned items shown
              </Label>
              <Input
                id="set-pinned"
                type="number"
                min={1}
                value={String(values.pinned_items_count ?? 10)}
                onChange={(e) =>
                  update('pinned_items_count', Number(e.target.value))
                }
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-upload" className="text-xs">
              Maximum upload size (bytes)
            </Label>
            <Input
              id="set-upload"
              type="number"
              min={1024}
              value={String(values.upload_max_size ?? 10485760)}
              onChange={(e) => update('upload_max_size', Number(e.target.value))}
              className="h-8 text-xs"
            />
            <p className="text-2xs text-muted-foreground">
              {Math.round(
                (Number(values.upload_max_size ?? 10485760) / 1024 / 1024) * 10,
              ) / 10}{' '}
              MB
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-ticket" className="text-xs">
              Ticket URL template
            </Label>
            <Input
              id="set-ticket"
              value={String(values.ticket_url_template ?? '')}
              onChange={(e) => update('ticket_url_template', e.target.value)}
              placeholder="https://tickets.internal/ticket/{ticket_id}"
              className="h-8 font-mono text-2xs"
            />
            <p className="text-2xs text-muted-foreground">
              <code className="rounded bg-muted px-1">{'{ticket_id}'}</code> is
              replaced with the reference shown on the sample ticket.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-banner" className="text-xs">
              Announcement banner
            </Label>
            <Input
              id="set-banner"
              value={String(values.announcement_banner ?? '')}
              onChange={(e) => update('announcement_banner', e.target.value)}
              placeholder="Leave empty to show no banner"
              className="h-8 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium">
            Allowed upload types
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3.5">
          <UploadTypes
            values={String((values.upload_types as string[]) ?? '')}
            onChange={(list) => update('upload_types', list)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={save} disabled={saving}>
          <IconDeviceFloppy className="h-3.5 w-3.5" />
          Save settings
        </Button>
      </div>
    </div>
  );
}

/** Comma-separated list of allowed upload MIME types / extensions. */
function UploadTypes({
  values,
  onChange,
}: {
  values: string;
  onChange: (list: string[]) => void;
}) {
  const list = values
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const [draft, setDraft] = React.useState('');

  const add = () => {
    if (!draft.trim()) return;
    onChange([...new Set([...list, draft.trim()])]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {list.map((type) => (
          <span key={type} className="chip bg-muted text-muted-foreground">
            {type}
            <button
              type="button"
              onClick={() => onChange(list.filter((t) => t !== type))}
              aria-label={`Remove ${type}`}
              className="hover:text-destructive"
            >
              ×
            </button>
          </span>
        ))}
        {list.length === 0 && (
          <p className="text-2xs text-muted-foreground">
            No types configured - all uploads are currently allowed.
          </p>
        )}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="image/png, application/pdf…"
          className="h-8 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-2xs"
          onClick={add}
        >
          <IconPlus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/** Section definitions, node types, outcomes and tags in one admin card. */
export function StructurePanel({
  sections,
  nodeTypes,
  outcomes,
  tags,
}: {
  sections: any[];
  nodeTypes: any[];
  outcomes: any[];
  tags: any[];
}) {
  const [sectionList, setSectionList] = React.useState(sections);
  const [nodeTypeList, setNodeTypeList] = React.useState(nodeTypes);
  const [outcomeList, setOutcomeList] = React.useState(outcomes);
  const [tagList, setTagList] = React.useState(tags);
  const [saving, setSaving] = React.useState<string | null>(null);

  const saveAll = async (which: string) => {
    setSaving(which);
    const supabase = createClient();
    let error = null;

    if (which === 'sections') {
      for (const section of sectionList) {
        const { error: e } = await supabase
          .from('pb_section_definitions')
          .update({
            label: section.label,
            sort_order: section.sort_order,
            is_active: section.is_active,
            help_text: section.help_text,
          })
          .eq('id', section.id);
        if (e) error = e;
      }
    } else if (which === 'node_types') {
      for (const type of nodeTypeList) {
        const { error: e } = await supabase
          .from('pb_node_types')
          .update({
            label: type.label,
            color: type.color,
            is_active: type.is_active,
            sort_order: type.sort_order,
          })
          .eq('id', type.id);
        if (e) error = e;
      }
    } else if (which === 'outcomes') {
      for (const outcome of outcomeList) {
        const { error: e } = await supabase
          .from('pb_outcomes')
          .update({
            label: outcome.label,
            color: outcome.color,
            is_active: outcome.is_active,
            sort_order: outcome.sort_order,
          })
          .eq('id', outcome.id);
        if (e) error = e;
      }
    } else if (which === 'tags') {
      for (const tag of tagList) {
        const { error: e } = await supabase
          .from('pb_tags')
          .update({ name: tag.name, color: tag.color, is_active: tag.is_active })
          .eq('id', tag.id);
        if (e) error = e;
      }
    }

    setSaving(null);
    if (error) toast.error(error.message);
    else toast.success('Saved');
  };

  return (
    <div className="space-y-4">
      <StructureCard
        title="Scenario sections"
        description="Add a section and it appears in the editor, the reader and the completeness checklist."
        rows={sectionList}
        setRows={setSectionList}
        columns={[
          { key: 'label', label: 'Label', type: 'text' },
          { key: 'sort_order', label: 'Order', type: 'number' },
          { key: 'is_active', label: 'Active', type: 'boolean' },
        ]}
        onSave={() => saveAll('sections')}
        saving={saving === 'sections'}
      />

      <StructureCard
        title="Flowchart node types"
        description="The steps an author can place in a troubleshooting flowchart."
        rows={nodeTypeList}
        setRows={setNodeTypeList}
        columns={[
          { key: 'label', label: 'Label', type: 'text' },
          { key: 'color', label: 'Colour', type: 'color' },
          { key: 'sort_order', label: 'Order', type: 'number' },
          { key: 'is_active', label: 'Active', type: 'boolean' },
        ]}
        onSave={() => saveAll('node_types')}
        saving={saving === 'node_types'}
      />

      <StructureCard
        title="Outcomes"
        description="What happened when a ticket was handled. Attached to sample tickets."
        rows={outcomeList}
        setRows={setOutcomeList}
        columns={[
          { key: 'label', label: 'Label', type: 'text' },
          { key: 'color', label: 'Colour', type: 'color' },
          { key: 'sort_order', label: 'Order', type: 'number' },
          { key: 'is_active', label: 'Active', type: 'boolean' },
        ]}
        onSave={() => saveAll('outcomes')}
        saving={saving === 'outcomes'}
      />

      <StructureCard
        title="Tags"
        description="Free-text tags used across scenarios."
        rows={tagList}
        setRows={setTagList}
        columns={[
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'color', label: 'Colour', type: 'color' },
          { key: 'is_active', label: 'Active', type: 'boolean' },
        ]}
        onSave={() => saveAll('tags')}
        saving={saving === 'tags'}
      />
    </div>
  );
}

interface StructureCardProps {
  title: string;
  description: string;
  rows: any[];
  setRows: (rows: any[]) => void;
  columns: { key: string; label: string; type: 'text' | 'number' | 'boolean' | 'color' }[];
  onSave: () => void;
  saving: boolean;
}

function StructureCard({
  title,
  description,
  rows,
  setRows,
  columns,
  onSave,
  saving,
}: StructureCardProps) {
  const update = (index: number, key: string, value: unknown) => {
    const next = [...rows];
    next[index] = { ...next[index], [key]: value };
    setRows(next);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium">{title}</CardTitle>
        <p className="text-2xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-3.5">
        <div className="space-y-1.5">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5"
            >
              {columns.map((column) => (
                <React.Fragment key={column.key}>
                  {column.type === 'boolean' ? (
                    <label className="flex items-center gap-1.5 text-2xs">
                      <input
                        type="checkbox"
                        checked={Boolean(row[column.key])}
                        onChange={(e) =>
                          update(index, column.key, e.target.checked)
                        }
                        className="h-3 w-3 rounded border"
                      />
                      {column.label}
                    </label>
                  ) : column.type === 'color' ? (
                    <input
                      type="color"
                      value={row[column.key] ?? '#64748b'}
                      onChange={(e) => update(index, column.key, e.target.value)}
                      className="h-6 w-8 cursor-pointer rounded border bg-background p-0.5"
                      aria-label={column.label}
                    />
                  ) : (
                    <Input
                      value={String(row[column.key] ?? '')}
                      type={column.type}
                      onChange={(e) =>
                        update(
                          index,
                          column.key,
                          column.type === 'number'
                            ? Number(e.target.value)
                            : e.target.value,
                        )
                      }
                      className="h-7 w-28 text-2xs"
                      aria-label={column.label}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
        <Separator className="my-3" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-2xs"
          onClick={onSave}
          disabled={saving}
        >
          <IconDeviceFloppy className="h-3 w-3" />
          Save {title.toLowerCase()}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Search synonyms: a term and the words that should also match it. */
export function SynonymsPanel({ synonyms }: { synonyms: any[] }) {
  const [list, setList] = React.useState(synonyms);
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    const supabase = createClient();
    for (const row of list) {
      await supabase
        .from('pb_synonyms')
        .update({ term: row.term, alternatives: row.alternatives })
        .eq('id', row.id);
    }
    setSaving(false);
    toast.success('Synonyms saved');
  };

  const update = (index: number, patch: Record<string, unknown>) => {
    const next = [...list];
    next[index] = { ...next[index], ...patch };
    setList(next);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium">Search synonyms</CardTitle>
        <p className="text-2xs text-muted-foreground">
          When someone searches for a term, these alternatives are also matched.
          Typo tolerance is handled separately by the database.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 p-3.5">
        {list.map((row, index) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2">
            <Input
              value={row.term}
              onChange={(e) => update(index, { term: e.target.value })}
              className="h-7 w-40 text-2xs"
              aria-label="Term"
            />
            <span className="text-2xs text-muted-foreground">matches</span>
            <Input
              value={(row.alternatives ?? []).join(', ')}
              onChange={(e) =>
                update(index, {
                  alternatives: e.target.value
                    .split(',')
                    .map((v: string) => v.trim())
                    .filter(Boolean),
                })
              }
              className="h-7 flex-1 text-2xs"
              aria-label="Alternatives"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setList(list.filter((_, i) => i !== index))}
              aria-label="Remove synonym"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-2xs"
            onClick={() =>
              setList([
                ...list,
                { id: `new-${Date.now()}`, term: '', alternatives: [] },
              ])
            }
          >
            <IconPlus className="h-3 w-3" />
            Add synonym
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 text-2xs"
            onClick={save}
            disabled={saving}
          >
            <IconDeviceFloppy className="h-3 w-3" />
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
