'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  IconDeviceFloppy,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { slugify } from '@/lib/utils';

interface PlaybookRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  type: 'curated' | 'smart';
  status: string;
  account_id: string | null;
  category_id: string | null;
  smart_filter: Record<string, unknown> | null;
  sort_order: number;
}

interface ScenarioRef {
  id: string;
  title: string;
  slug: string;
  account_name: string | null;
}

interface PlaybookAdminProps {
  playbooks: PlaybookRow[];
  scenarios: ScenarioRef[];
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

/**
 * The playbook builder.
 *
 * A curated playbook is a hand-picked, ordered list of scenarios. A smart
 * playbook is a live criteria filter - its contents are computed every time
 * it is opened, so it never goes stale.
 */
export function PlaybookAdmin({
  playbooks,
  scenarios,
  accounts,
  categories,
}: PlaybookAdminProps) {
  const router = useRouter();
  const [list, setList] = React.useState(playbooks);
  const [editing, setEditing] = React.useState<PlaybookRow | null>(null);
  const [items, setItems] = React.useState<{ id: string; scenario_id: string }[]>(
    [],
  );
  const [loadingItems, setLoadingItems] = React.useState(false);

  const loadItems = async (playbookId: string) => {
    setLoadingItems(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pb_playbook_items')
      .select('id, scenario_id, sort_order')
      .eq('playbook_id', playbookId)
      .order('sort_order');
    setLoadingItems(false);
    // An empty list is indistinguishable from a failed read, and the person
    // would then save that empty order over the real one.
    if (error) {
      toast.error(`Could not load the playbook items: ${error.message}`);
      return;
    }
    setItems((data ?? []) as { id: string; scenario_id: string }[]);
  };

  const createPlaybook = async (type: 'curated' | 'smart') => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pb_playbooks')
      .insert({
        title: `New ${type} playbook`,
        slug: `new-${type}-playbook-${Date.now().toString(36)}`,
        type,
        status: 'draft',
        smart_filter: type === 'smart' ? { accountMatch: 'any' } : null,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }

    const playbook = data as PlaybookRow;
    setList([...list, playbook]);
    setEditing(playbook);
    if (type === 'curated') await loadItems(playbook.id);
  };

  const save = async () => {
    if (!editing) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('pb_playbooks')
      .update({
        title: editing.title,
        slug: slugify(editing.title) || editing.slug,
        description: editing.description,
        type: editing.type,
        status: editing.status,
        account_id: editing.account_id,
        category_id: editing.category_id ?? null,
        smart_filter: editing.smart_filter,
        sort_order: editing.sort_order,
      })
      .eq('id', editing.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    // Persist the curated item order. Each row is written separately, so a
    // failure part way through would leave the order half applied - that has
    // to be reported rather than saved as a success.
    if (editing.type === 'curated') {
      for (let index = 0; index < items.length; index += 1) {
        const { error: orderError } = await supabase
          .from('pb_playbook_items')
          .update({ sort_order: index })
          .eq('id', items[index].id);
        if (orderError) {
          toast.error(`The title was saved, but the new order was not: ${orderError.message}`);
          setEditing(null);
          router.refresh();
          return;
        }
      }
    }

    toast.success('Playbook saved');
    setEditing(null);
    router.refresh();
  };

  const addItem = async (scenarioId: string) => {
    if (!editing) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pb_playbook_items')
      .insert({
        playbook_id: editing.id,
        scenario_id: scenarioId,
        sort_order: items.length,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }
    setItems([...items, data as { id: string; scenario_id: string }]);
  };

  const removeItem = async (itemId: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('pb_playbook_items').delete().eq('id', itemId);
    if (error) {
      toast.error(`Could not remove the item: ${error.message}`);
      return;
    }
    setItems(items.filter((i) => i.id !== itemId));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => createPlaybook('curated')}
        >
          <IconPlus className="h-3.5 w-3.5" />
          New curated playbook
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          onClick={() => createPlaybook('smart')}
        >
          <IconSparkles className="h-3.5 w-3.5" />
          New smart playbook
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((playbook) => (
          <Card
            key={playbook.id}
            className={editing?.id === playbook.id ? 'border-primary' : undefined}
          >
            <CardContent className="p-3.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{playbook.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5">
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      {playbook.type}
                    </Badge>
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                      {playbook.status}
                    </Badge>
                    {playbook.account_id && (
                      <span className="text-2xs text-muted-foreground">
                        {accounts.find((a) => a.id === playbook.account_id)?.name}
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-2xs"
                  onClick={async () => {
                    setEditing(playbook);
                    await loadItems(playbook.id);
                  }}
                >
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && (
          <p className="rounded-md border border-dashed p-6 text-center text-2xs text-muted-foreground">
            No playbooks yet. A curated playbook is a hand-picked course of
            scenarios; a smart playbook is a live filter.
          </p>
        )}
      </div>

      {editing && (
        <Card className="border-primary/50">
          <CardContent className="space-y-3 p-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium">Edit playbook</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setEditing(null)}
                aria-label="Close"
              >
                <IconX className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                  value={editing.type}
                  onValueChange={(value) =>
                    setEditing({ ...editing, type: value as 'curated' | 'smart' })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="curated">Curated</SelectItem>
                    <SelectItem value="smart">Smart</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={editing.status}
                  onValueChange={(value) =>
                    setEditing({ ...editing, status: value })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending_review">Pending review</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Account</Label>
                <Select
                  value={editing.account_id ?? 'none'}
                  onValueChange={(value) =>
                    setEditing({
                      ...editing,
                      account_id: value === 'none' ? null : value,
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All accounts</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={editing.description ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
                rows={2}
                className="text-xs"
              />
            </div>

            <Separator />

            {editing.type === 'curated' ? (
              <div className="space-y-2">
                <p className="text-xs font-medium">Scenarios in this playbook</p>
                {loadingItems ? (
                  <p className="text-2xs text-muted-foreground">Loading…</p>
                ) : items.length === 0 ? (
                  <p className="text-2xs text-muted-foreground">
                    No scenarios added yet. Pick one below.
                  </p>
                ) : (
                  <ol className="space-y-1">
                    {items.map((item, index) => {
                      const scenario = scenarios.find(
                        (s) => s.id === item.scenario_id,
                      );
                      return (
                        <li
                          key={item.id}
                          className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
                        >
                          <span className="w-4 tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {scenario?.title ?? 'Unknown scenario'}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeItem(item.id)}
                            aria-label="Remove from playbook"
                          >
                            <IconTrash className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      );
                    })}
                  </ol>
                )}

                <Select
                  onValueChange={(scenarioId) => {
                    void addItem(scenarioId);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Add a scenario…" />
                  </SelectTrigger>
                  <SelectContent>
                    {scenarios
                      .filter((s) => !items.some((i) => i.scenario_id === s.id))
                      .map((scenario) => (
                        <SelectItem key={scenario.id} value={scenario.id}>
                          {scenario.title}
                          {scenario.account_name
                            ? ` (${scenario.account_name})`
                            : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium">Smart filter</p>
                <p className="text-2xs text-muted-foreground">
                  A smart playbook computes its contents live from this filter,
                  so it never needs updating by hand.
                </p>
                <SmartFilterEditor
                  value={editing.smart_filter ?? {}}
                  onChange={(filter) =>
                    setEditing({ ...editing, smart_filter: filter })
                  }
                  accounts={accounts}
                  categories={categories}
                />
              </div>
            )}

            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={save}>
              <IconDeviceFloppy className="h-3.5 w-3.5" />
              Save playbook
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SmartFilterEditor({
  value,
  onChange,
  accounts,
  categories,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const accountIds = (value.accountIds as string[]) ?? [];
  const categoryIds = (value.categoryIds as string[]) ?? [];

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((v) => v !== id) : [...list, id];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Search text</Label>
        <Input
          value={(value.query as string) ?? ''}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
          placeholder="Optional keyword"
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Accounts</Label>
        <div className="flex flex-wrap gap-1.5">
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  accountIds: toggle(accountIds, account.id),
                })
              }
              className={
                accountIds.includes(account.id)
                  ? 'chip-interactive ring-1 ring-primary'
                  : 'chip-interactive'
              }
            >
              {account.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Categories</Label>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  categoryIds: toggle(categoryIds, category.id),
                })
              }
              className={
                categoryIds.includes(category.id)
                  ? 'chip-interactive ring-1 ring-primary'
                  : 'chip-interactive'
              }
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Account match mode</Label>
        <Select
          value={(value.accountMatch as string) ?? 'any'}
          onValueChange={(mode) => onChange({ ...value, accountMatch: mode })}
        >
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any selected account</SelectItem>
            <SelectItem value="all">Common to all selected</SelectItem>
            <SelectItem value="only">Unique to one account</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
