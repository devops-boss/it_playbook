'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronRight,
  IconDots,
  IconGripVertical,
  IconLock,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { cn, slugify } from '@/lib/utils';
import type { Account, CriteriaField, CriteriaOption } from '@/types/database';

interface CriteriaBuilderProps {
  fields: CriteriaField[];
  optionsByField: Record<string, CriteriaOption[]>;
  accounts: Account[];
}

const FIELD_TYPES = [
  { value: 'single-select', label: 'Single select' },
  { value: 'multi-select', label: 'Multi select' },
  { value: 'hierarchical-select', label: 'Hierarchical select' },
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'yes-no', label: 'Yes / No' },
];

const APPLIES_TO = [
  { value: 'scenarios', label: 'Scenarios' },
  { value: 'playbooks', label: 'Playbooks' },
  { value: 'both', label: 'Both' },
];

/**
 * The Criteria Builder.
 *
 * Every field here is DATA. Adding a field creates a facet, an editor
 * control, a filter rail section and a coverage-matrix dimension without
 * any code change - that is the whole point of the criteria system.
 */
export function CriteriaBuilder({ fields, optionsByField, accounts }: CriteriaBuilderProps) {
  const [localFields, setLocalFields] = React.useState(fields);
  const [localOptions, setLocalOptions] = React.useState(optionsByField);
  const [editing, setEditing] = React.useState<CriteriaField | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [optionsFor, setOptionsFor] = React.useState<CriteriaField | null>(null);

  React.useEffect(() => setLocalFields(fields), [fields]);
  React.useEffect(() => setLocalOptions(optionsByField), [optionsByField]);

  const saveField = async (field: Partial<CriteriaField> & { id?: string }) => {
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      label: field.label,
      description: field.description ?? null,
      type: field.type,
      scope: field.scope,
      applies_to: field.applies_to,
      is_required: field.is_required,
      required_condition: field.required_condition ?? null,
      show_as_facet: field.show_as_facet,
      show_on_card: field.show_on_card,
      sort_order: field.sort_order,
      is_active: field.is_active,
    };

    try {
      if (field.id) {
        const { error } = await supabase
          .from('pb_criteria_fields')
          .update(payload)
          .eq('id', field.id);
        if (error) throw error;
        setLocalFields((prev) =>
          prev.map((f) => (f.id === field.id ? { ...f, ...payload } as CriteriaField : f)),
        );
        toast.success('Field updated');
      } else {
        const key = slugify(field.label ?? '');
        const { data, error } = await supabase
          .from('pb_criteria_fields')
          .insert({ ...payload, key })
          .select()
          .single();
        if (error) throw error;
        setLocalFields((prev) => [...prev, data as CriteriaField]);
        toast.success('Field created - it now appears in filters, the editor and the matrix');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the field.');
    }
  };

  const deleteField = async (field: CriteriaField) => {
    if (field.is_system) {
      toast.error('System fields cannot be deleted. You can rename them or mark them inactive.');
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from('pb_criteria_fields')
      .delete()
      .eq('id', field.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLocalFields((prev) => prev.filter((f) => f.id !== field.id));
    toast.success('Field deleted');
  };

  const moveField = async (field: CriteriaField, direction: -1 | 1) => {
    const ordered = [...localFields].sort((a, b) => a.sort_order - b.sort_order);
    const index = ordered.findIndex((f) => f.id === field.id);
    const swapWith = ordered[index + direction];
    if (!swapWith) return;

    const supabase = createClient();
    await supabase
      .from('pb_criteria_fields')
      .update({ sort_order: swapWith.sort_order })
      .eq('id', field.id);
    await supabase
      .from('pb_criteria_fields')
      .update({ sort_order: field.sort_order })
      .eq('id', swapWith.id);

    setLocalFields((prev) =>
      prev.map((f) => {
        if (f.id === field.id) return { ...f, sort_order: swapWith.sort_order };
        if (f.id === swapWith.id) return { ...f, sort_order: field.sort_order };
        return f;
      }),
    );
  };

  const toggleFieldProperty = async (
    field: CriteriaField,
    property: 'show_as_facet' | 'show_on_card' | 'is_required' | 'is_active',
  ) => {
    const next = !field[property];
    const supabase = createClient();
    const { error } = await supabase
      .from('pb_criteria_fields')
      .update({ [property]: next })
      .eq('id', field.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLocalFields((prev) =>
      prev.map((f) => (f.id === field.id ? { ...f, [property]: next } : f)),
    );
  };

  const sorted = [...localFields].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Criteria builder</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Criteria are the structured metadata every scenario is classified by.
            Fields defined here drive the filters, the editor, the coverage matrix
            and the analytics - no code change required.
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreating(true)}>
          <IconPlus className="h-3.5 w-3.5" />
          New field
        </Button>
      </div>

      <div className="space-y-2">
        {sorted.map((field, index) => {
          const options = localOptions[field.id] ?? [];
          const activeOptions = options.filter((o) => o.is_active);

          return (
            <Card key={field.id}>
              <CardContent className="p-0">
                <div className="flex items-start gap-3 p-3.5">
                  <div className="flex flex-col items-center gap-0.5 pt-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => moveField(field, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      <IconChevronRight className="h-3 w-3 rotate-[-90deg]" />
                    </Button>
                    <IconGripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => moveField(field, 1)}
                      disabled={index === sorted.length - 1}
                      aria-label="Move down"
                    >
                      <IconChevronRight className="h-3.5 w-3.3 rotate-90" />
                    </Button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{field.label}</span>
                      {field.is_system && (
                        <Badge variant="outline" className="h-4 gap-1 px-1 text-[10px]">
                          <IconLock className="h-2.5 w-2.5" />
                          System
                        </Badge>
                      )}
                      {field.is_required && (
                        <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                          Required
                        </Badge>
                      )}
                      {field.required_condition && (
                        <Badge
                          variant="outline"
                          className="h-4 gap-1 px-1 text-[10px] text-amber-600"
                        >
                          <IconAlertTriangle className="h-2.5 w-2.5" />
                          Conditional
                        </Badge>
                      )}
                      {!field.is_active && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px]">
                          Inactive
                        </Badge>
                      )}
                      <Badge variant="outline" className="h-4 px-1 font-mono text-[10px]">
                        {field.key}
                      </Badge>
                    </div>

                    {field.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {field.description}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
                      <span>
                        Type: <span className="text-foreground">{field.type}</span>
                      </span>
                      <span>
                        Applies to:{' '}
                        <span className="text-foreground">{field.applies_to}</span>
                      </span>
                      <span>
                        Scope: <span className="text-foreground">{field.scope}</span>
                      </span>
                      {options.length > 0 && (
                        <span>
                          {activeOptions.length} option
                          {activeOptions.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-3">
                      <Toggle
                        label="Facet"
                        checked={field.show_as_facet}
                        onChange={() => toggleFieldProperty(field, 'show_as_facet')}
                      />
                      <Toggle
                        label="Show on card"
                        checked={field.show_on_card}
                        onChange={() => toggleFieldProperty(field, 'show_on_card')}
                      />
                      <Toggle
                        label="Required"
                        checked={field.is_required}
                        onChange={() => toggleFieldProperty(field, 'is_required')}
                      />
                      <Toggle
                        label="Active"
                        checked={field.is_active}
                        onChange={() => toggleFieldProperty(field, 'is_active')}
                      />
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Field actions">
                        <IconDots className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(field)}>
                        <IconPencil className="h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                      {options.length > 0 && (
                        <DropdownMenuItem onSelect={() => setOptionsFor(field)}>
                          Manage options
                        </DropdownMenuItem>
                      )}
                      {!field.is_system && (
                        <DropdownMenuItem
                          onSelect={() => deleteField(field)}
                          className="text-destructive"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <FieldDialog
        open={creating || editing !== null}
        field={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSave={saveField}
      />

      <OptionsDialog
        field={optionsFor}
        options={optionsFor ? (localOptions[optionsFor.id] ?? []) : []}
        onClose={() => setOptionsFor(null)}
        onChange={(next) => {
          if (!optionsFor) return;
          setLocalOptions((prev) => ({ ...prev, [optionsFor.id]: next }));
        }}
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-muted-foreground">
      <Switch checked={checked} onCheckedChange={onChange} className="h-4 w-7" />
      {label}
    </label>
  );
}

function FieldDialog({
  open,
  field,
  onClose,
  onSave,
}: {
  open: boolean;
  field: CriteriaField | null;
  onClose: () => void;
  onSave: (field: Partial<CriteriaField> & { id?: string }) => Promise<void>;
}) {
  const [form, setForm] = React.useState<Partial<CriteriaField>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (field) {
      setForm({ ...field });
    } else {
      setForm({
        label: '',
        description: '',
        type: 'single-select',
        scope: 'global',
        applies_to: 'scenarios',
        is_required: false,
        show_as_facet: true,
        show_on_card: true,
        is_active: true,
        sort_order: 100,
      });
    }
  }, [field, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{field ? 'Edit field' : 'New criteria field'}</DialogTitle>
          <DialogDescription>
            {field?.is_system
              ? 'System fields can be renamed, reordered and made optional, but not deleted.'
              : 'This field will immediately appear in the filters, the scenario editor and the coverage matrix.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={form.label ?? ''}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. ISP / Vendor"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Help text</Label>
            <Textarea
              id="description"
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Shown under the field in the editor"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Select
                value={form.type ?? 'single-select'}
                onValueChange={(v) => setForm({ ...form, type: v as CriteriaField['type'] })}
              >
                <SelectTrigger id="type" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="applies">Applies to</Label>
              <Select
                value={form.applies_to ?? 'scenarios'}
                onValueChange={(v) => setForm({ ...form, applies_to: v as CriteriaField['applies_to'] })}
              >
                <SelectTrigger id="applies" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLIES_TO.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scope">Scope</Label>
            <Select
              value={form.scope ?? 'global'}
              onValueChange={(v) => setForm({ ...form, scope: v as CriteriaField['scope'] })}
            >
              <SelectTrigger id="scope" className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global" className="text-xs">
                  Global - available for every account
                </SelectItem>
                <SelectItem value="account" className="text-xs">
                  Account-specific
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                checked={form.is_required ?? false}
                onCheckedChange={(c) => setForm({ ...form, is_required: c === true })}
              />
              Required to publish
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                checked={form.show_as_facet ?? true}
                onCheckedChange={(c) => setForm({ ...form, show_as_facet: c === true })}
              />
              Show as search facet
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                checked={form.show_on_card ?? true}
                onCheckedChange={(c) => setForm({ ...form, show_on_card: c === true })}
              />
              Show as chip on cards
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                checked={form.is_active ?? true}
                onCheckedChange={(c) => setForm({ ...form, is_active: c === true })}
              />
              Active
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : field ? 'Save changes' : 'Create field'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OptionsDialog({
  field,
  options,
  onClose,
  onChange,
}: {
  field: CriteriaField | null;
  options: CriteriaOption[];
  onClose: () => void;
  onChange: (options: CriteriaOption[]) => void;
}) {
  const [newLabel, setNewLabel] = React.useState('');

  const addOption = async () => {
    if (!field || !newLabel.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pb_criteria_options')
      .insert({
        field_id: field.id,
        label: newLabel.trim(),
        value: slugify(newLabel),
        sort_order: options.length,
        is_active: true,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange([...options, data as CriteriaOption]);
    setNewLabel('');
    toast.success('Option added');
  };

  const renameOption = async (option: CriteriaOption, label: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('pb_criteria_options')
      .update({ label })
      .eq('id', option.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange(options.map((o) => (o.id === option.id ? { ...o, label } : o)));
  };

  const toggleActive = async (option: CriteriaOption) => {
    const supabase = createClient();
    const next = !option.is_active;
    const { error } = await supabase
      .from('pb_criteria_options')
      .update({ is_active: next })
      .eq('id', option.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange(options.map((o) => (o.id === option.id ? { ...o, is_active: next } : o)));
  };

  return (
    <Dialog open={field !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Options for {field?.label}</DialogTitle>
          <DialogDescription>
            Renaming an option keeps existing scenarios linked. Deactivating hides it
            from new entries but leaves it on older ones.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {options.map((option) => (
            <li key={option.id} className="flex items-center gap-2">
              <Input
                defaultValue={option.label}
                className="h-8 flex-1 text-xs"
                onBlur={(e) => {
                  if (e.target.value !== option.label) {
                    void renameOption(option, e.target.value);
                  }
                }}
                aria-label={`Option label for ${option.label}`}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-2xs"
                onClick={() => toggleActive(option)}
              >
                {option.is_active ? 'Active' : 'Inactive'}
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New option"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addOption();
              }
            }}
          />
          <Button size="sm" className="h-8 text-xs" onClick={addOption}>
            <IconPlus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        <DialogFooter>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
