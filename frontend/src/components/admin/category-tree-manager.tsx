'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconEye,
  IconEyeOff,
  IconFolder,
  IconGripVertical,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { cn, slugify } from '@/lib/utils';
import type { Category } from '@/types/database';

interface CategoryTreeManagerProps {
  categories: Category[];
}

/**
 * The category tree manager.
 *
 * Categories can be renamed, re-ordered, re-parented by drag and drop,
 * deactivated and merged. Renames keep the slug, so existing links and
 * saved filters keep working.
 */
export function CategoryTreeManager({ categories }: CategoryTreeManagerProps) {
  const router = useRouter();
  const [tree, setTree] = React.useState(categories);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [creatingUnder, setCreatingUnder] = React.useState<Category | null>(null);
  const [mergeSource, setMergeSource] = React.useState<Category | null>(null);
  const [mergeTargetId, setMergeTargetId] = React.useState('');
  const [impact, setImpact] = React.useState<{
    scenario_count: number;
    account_count: number;
  } | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => setTree(categories), [categories]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const childrenOf = React.useCallback(
    (parentId: string | null) =>
      tree
        .filter((c) => c.parent_id === parentId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [tree],
  );

  const refreshImpact = async (category: Category) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_config_impact', {
      p_config_type: 'category',
      p_config_id: category.id,
    });
    // Showing "0" because the read failed would be read as "this category
    // affects nothing", which is the opposite of what a failure means.
    if (error) {
      setImpact(null);
      toast.error(`Could not work out the impact of this change: ${error.message}`);
      return;
    }
    if (data && data.length > 0) {
      setImpact({
        scenario_count: Number(data[0].scenario_count),
        account_count: Number(data[0].account_count),
      });
    } else {
      setImpact({ scenario_count: 0, account_count: 0 });
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const draggedId = String(active.id);
    const overId = String(over.id);

    if (draggedId === overId) return;

    // Dropping onto a node makes it the new parent; dropping onto the root
    // area clears the parent.
    const newParentId = overId === 'root' ? null : overId;
    const dragged = tree.find((c) => c.id === draggedId);
    if (!dragged) return;

    // Refuse to drop a category into its own subtree.
    if (overId && isDescendant(tree, overId, draggedId)) {
      toast.error('A category cannot be moved inside itself.');
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from('pb_categories')
      .update({ parent_id: newParentId })
      .eq('id', draggedId);
    if (error) {
      toast.error(error.message);
      return;
    }

    setTree((prev) =>
      prev.map((c) => (c.id === draggedId ? { ...c, parent_id: newParentId } : c)),
    );
    toast.success(`${dragged.name} moved`);
  };

  const toggleActive = async (category: Category) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('pb_categories')
      .update({ is_active: !category.is_active })
      .eq('id', category.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTree((prev) =>
      prev.map((c) => (c.id === category.id ? { ...c, is_active: !c.is_active } : c)),
    );
  };

  const deleteCategory = async (category: Category) => {
    const supabase = createClient();
    await refreshImpact(category);

    const { count } = await supabase
      .from('pb_scenarios')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', category.id)
      .is('deleted_at', null);

    if ((count ?? 0) > 0) {
      toast.error(
        `${category.name} is used by ${count} scenario${count === 1 ? '' : 's'}. ` +
          'Deactivate or merge it instead of deleting.',
      );
      return;
    }

    const { error } = await supabase
      .from('pb_categories')
      .delete()
      .eq('id', category.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTree((prev) => prev.filter((c) => c.id !== category.id));
    toast.success(`${category.name} deleted`);
  };

  const merge = async () => {
    if (!mergeSource || !mergeTargetId) return;
    const supabase = createClient();
    const { data, error } = await supabase.rpc('merge_categories', {
      p_source_id: mergeSource.id,
      p_target_id: mergeTargetId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(data ?? 'Categories merged');
    setMergeSource(null);
    setMergeTargetId('');
    router.refresh();
  };

  const renderNode = (category: Category, depth: number): React.ReactNode => {
    const children = childrenOf(category.id);
    const isOpen = expanded.has(category.id);
    const isActive = activeId === category.id;

    return (
      <React.Fragment key={category.id}>
        <div
          className={cn(
            'group flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 transition-colors',
            'hover:border-border hover:bg-accent/40',
            !category.is_active && 'opacity-50',
          )}
          style={{ marginLeft: depth * 20 }}
        >
          <DragHandle id={category.id} />

          {children.length > 0 ? (
            <button
              type="button"
              className="flex h-4 w-4 shrink-0 items-center justify-center"
              onClick={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(category.id)) next.delete(category.id);
                  else next.add(category.id);
                  return next;
                })
              }
              aria-label={isOpen ? `Collapse ${category.name}` : `Expand ${category.name}`}
            >
              {isOpen ? (
                <IconChevronDown className="h-3 w-3" />
              ) : (
                <IconChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: category.color ?? '#94a3b8' }}
            aria-hidden
          />

          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {category.name}
          </span>

          <span className="shrink-0 font-mono text-2xs text-muted-foreground/60">
            {category.slug}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                aria-label={`Actions for ${category.name}`}
              >
                <IconDots className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(category)}>
                <IconPencil className="h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCreatingUnder(category)}>
                <IconPlus className="h-3.5 w-3.5" />
                Add subcategory
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setMergeSource(category)}>
                <IconFolder className="h-3.5 w-3.5" />
                Merge into…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toggleActive(category)}>
                {category.is_active ? (
                  <>
                    <IconEyeOff className="h-3.5 w-3.5" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <IconEye className="h-3.5 w-3.5" />
                    Activate
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => deleteCategory(category)}
                className="text-destructive"
              >
                <IconTrash className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isOpen && children.map((child) => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-base font-semibold tracking-tight">Categories</h1>
        <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
          The category tree drives the sidebar, the category pages and the default
          coverage-matrix axis. Drag a category onto another to nest it; its slug
          stays stable so links keep working after a rename.
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <Card>
          <CardContent className="p-2">
            <RootDropZone />
            {childrenOf(null).map((category) => renderNode(category, 0))}
          </CardContent>
        </Card>

        <DragOverlay>
          {activeId && (
            <div className="rounded-md border bg-card px-2 py-1 text-xs font-medium shadow-lg">
              {tree.find((c) => c.id === activeId)?.name}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <CategoryDialog
        open={editing !== null || creatingUnder !== null}
        category={editing}
        parentId={creatingUnder?.id ?? null}
        onClose={() => {
          setEditing(null);
          setCreatingUnder(null);
        }}
        onSaved={() => router.refresh()}
      />

      <Dialog
        open={mergeSource !== null}
        onOpenChange={(o) => !o && setMergeSource(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Merge category</DialogTitle>
            <DialogDescription>
              Move every scenario and child category from{' '}
              <strong>{mergeSource?.name}</strong> into another category. The
              source is deactivated afterwards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="merge-target">Merge into</Label>
            <select
              id="merge-target"
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-xs"
            >
              <option value="">Choose a category…</option>
              {tree
                .filter((c) => c.id !== mergeSource?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setMergeSource(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!mergeTargetId}
              onClick={merge}
            >
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'flex h-4 w-3 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing',
        isDragging && 'opacity-30',
      )}
      aria-label="Drag to move"
    >
      <IconGripVertical className="h-3 w-3" />
    </button>
  );
}

function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'root' });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mb-1 rounded-md border border-dashed px-2 py-1.5 text-2xs text-muted-foreground transition-colors',
        isOver ? 'border-primary bg-primary/5 text-primary' : 'border-border',
      )}
    >
      Top level - drop here to un-nest
    </div>
  );
}

function CategoryDialog({
  open,
  category,
  parentId,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: Category | null;
  parentId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState('#64748b');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (category) {
      setName(category.name);
      setColor(category.color ?? '#64748b');
    } else {
      setName('');
      setColor('#64748b');
    }
  }, [category, open]);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const supabase = createClient();

    try {
      if (category) {
        // The slug is intentionally preserved so links and saved filters
        // keep working after a rename.
        const { error } = await supabase
          .from('pb_categories')
          .update({ name: name.trim(), color })
          .eq('id', category.id);
        if (error) throw error;
        toast.success('Category renamed - existing links still work');
      } else {
        const { error } = await supabase.from('pb_categories').insert({
          name: name.trim(),
          slug: `${slugify(name)}-${Date.now().toString(36).slice(-4)}`,
          parent_id: parentId,
          color,
          sort_order: 999,
          is_active: true,
          is_global: true,
        });
        if (error) throw error;
        toast.success('Category created');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{category ? 'Rename category' : 'New category'}</DialogTitle>
          <DialogDescription>
            {category
              ? 'The URL slug stays the same, so bookmarks and saved filters keep working.'
              : parentId
                ? 'This will be nested under the selected category.'
                : 'This will be a top-level category.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wireless"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-color">Colour</Label>
            <div className="flex items-center gap-2">
              <input
                id="cat-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded-md border bg-transparent"
              />
              <span className="font-mono text-2xs text-muted-foreground">{color}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={!name.trim() || saving}>
            {saving ? 'Saving…' : category ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Is `candidateId` a descendant of `ancestorId`? */
function isDescendant(
  tree: Category[],
  candidateId: string,
  ancestorId: string,
): boolean {
  let current = tree.find((c) => c.id === candidateId);
  while (current?.parent_id) {
    if (current.parent_id === ancestorId) return true;
    current = tree.find((c) => c.id === current!.parent_id);
  }
  return false;
}
