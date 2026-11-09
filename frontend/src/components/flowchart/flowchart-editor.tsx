'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowRight,
  IconArrowUpRight,
  IconCheck,
  IconHelpCircle,
  IconLayoutGrid,
  IconPlayerPlay,
  IconPlus,
  IconSettings,
  IconSquare,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { FlowEdge, FlowNode, NodeType } from '@/types/database';

interface FlowchartEditorProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  nodeTypes: NodeType[];
  onChange: (next: { nodes: FlowNode[]; edges: FlowEdge[] }) => void;
}

interface EditorNodeData {
  label: string;
  nodeType: string;
  description?: string;
  imageUrl?: string;
  scenarioLink?: string;
  borderColor?: string;
  backgroundColor?: string;
  [key: string]: unknown;
}

type EditorNode = Node<EditorNodeData>;
type EditorEdge = Edge<{ branch?: 'yes' | 'no' }>;

const GRID = 20;

export const BOS_BRAND_NODE_TYPES: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  start: { label: 'Start', color: '#10b981', icon: 'player-play' },
  action: { label: 'Action', color: '#233B74', icon: 'settings' },
  decision: { label: 'Decision', color: '#E07E3C', icon: 'help-circle' },
  workaround: { label: 'Workaround', color: '#288FC2', icon: 'alert-triangle' },
  resolution: { label: 'Resolution', color: '#10b981', icon: 'check-circle' },
  escalate: { label: 'Escalate', color: '#dc2626', icon: 'arrow-up-right' },
  end: { label: 'End', color: '#64748b', icon: 'square' },
};

function getNodeIcon(type: string, className = 'h-3.5 w-3.5') {
  switch (type) {
    case 'start':
      return <IconPlayerPlay className={className} />;
    case 'action':
      return <IconSettings className={className} />;
    case 'decision':
      return <IconHelpCircle className={className} />;
    case 'workaround':
      return <IconAlertTriangle className={className} />;
    case 'resolution':
      return <IconCheck className={className} />;
    case 'escalate':
      return <IconArrowUpRight className={className} />;
    case 'end':
      return <IconSquare className={className} />;
    default:
      return <IconSettings className={className} />;
  }
}

function edgeLabel(edge: { label?: string | React.ReactNode }): string {
  return typeof edge.label === 'string' ? edge.label : '';
}

/**
 * Section 11 Flowchart Editor with Drag & Drop Palette, Snap to Grid,
 * Auto-layout, Undo/Redo, Decision Yes/No handles, and Guided Mode Test Run.
 */
export function FlowchartEditor(props: FlowchartEditorProps) {
  return (
    <ReactFlowProvider>
      <FlowchartEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function FlowchartEditorInner({
  nodes,
  edges,
  nodeTypes,
  onChange,
}: FlowchartEditorProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showTest, setShowTest] = React.useState(false);
  const [showValidation, setShowValidation] = React.useState(false);
  const [history, setHistory] = React.useState<
    { nodes: EditorNode[]; edges: EditorEdge[] }[]
  >([]);
  const [future, setFuture] = React.useState<
    { nodes: EditorNode[]; edges: EditorEdge[] }[]
  >([]);

  // Build complete nodeTypes map merging props with BOS brand defaults
  const typeByKey = React.useMemo(() => {
    const map = new Map<string, { label: string; color: string; icon: string }>();
    for (const [k, v] of Object.entries(BOS_BRAND_NODE_TYPES)) {
      map.set(k, v);
    }
    for (const t of nodeTypes) {
      if (t.key) {
        map.set(t.key, {
          label: t.label || BOS_BRAND_NODE_TYPES[t.key]?.label || t.key,
          color: t.color || BOS_BRAND_NODE_TYPES[t.key]?.color || '#233B74',
          icon: t.icon || BOS_BRAND_NODE_TYPES[t.key]?.icon || 'settings',
        });
      }
    }
    return map;
  }, [nodeTypes]);

  const rfNodes = React.useMemo<EditorNode[]>(
    () =>
      nodes.map((n) => {
        const typeInfo = typeByKey.get(n.data.nodeType);
        const color = typeInfo?.color ?? '#233B74';
        return {
          id: n.id,
          type: 'flowNode',
          position: n.position,
          data: {
            label: n.data.label,
            nodeType: n.data.nodeType,
            description: n.data.description,
            imageUrl: n.data.imageUrl,
            scenarioLink: n.data.scenarioLink,
            borderColor: color,
            backgroundColor: `${color}15`,
          },
          style: n.style,
        };
      }),
    [nodes, typeByKey],
  );

  const rfEdges = React.useMemo<EditorEdge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        data: e.data,
        animated: edgeLabel(e).toLowerCase() === 'yes',
      })),
    [edges],
  );

  const commit = React.useCallback(
    (nextNodes: EditorNode[], nextEdges: EditorEdge[]) => {
      setHistory((h) => [...h.slice(-49), { nodes: rfNodes, edges: rfEdges }]);
      setFuture([]);
      onChange({
        nodes: nextNodes.map((n) => ({
          id: n.id,
          type: 'flowNode',
          position: n.position,
          data: {
            label: n.data.label,
            nodeType: n.data.nodeType,
            description: n.data.description,
            imageUrl: n.data.imageUrl,
            scenarioLink: n.data.scenarioLink,
            borderColor: n.data.borderColor,
            backgroundColor: n.data.backgroundColor,
          },
          style: n.style,
        })) as FlowNode[],
        edges: nextEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: edgeLabel(e) || undefined,
          data: e.data,
        })) as FlowEdge[],
      });
    },
    [rfNodes, rfEdges, onChange],
  );

  const undo = React.useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const previous = h[h.length - 1];
      setFuture((f) => [...f, { nodes: rfNodes, edges: rfEdges }]);
      onChange({
        nodes: previous.nodes.map(toFlowNode),
        edges: previous.edges.map(toFlowEdge),
      });
      return h.slice(0, -1);
    });
  }, [rfNodes, rfEdges, onChange]);

  const redo = React.useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      setHistory((h) => [...h, { nodes: rfNodes, edges: rfEdges }]);
      onChange({
        nodes: next.nodes.map(toFlowNode),
        edges: next.edges.map(toFlowEdge),
      });
      return f.slice(0, -1);
    });
  }, [rfNodes, rfEdges, onChange]);

  // Global Keyboard Shortcuts (Ctrl+Z / Ctrl+Y)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const [localNodes, setLocalNodes] = React.useState(rfNodes);
  const [localEdges, setLocalEdges] = React.useState(rfEdges);

  React.useEffect(() => {
    setLocalNodes(rfNodes);
  }, [rfNodes]);
  React.useEffect(() => {
    setLocalEdges(rfEdges);
  }, [rfEdges]);

  const onNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      const meaningful = changes.filter(
        (c) => c.type !== 'select' && c.type !== 'dimensions',
      );
      if (meaningful.length === 0) {
        setLocalNodes((n) => applyNodeChanges(changes, n));
        return;
      }
      const next = applyNodeChanges(meaningful, localNodes);
      setLocalNodes(next);
      commit(next, localEdges);
    },
    [localNodes, localEdges, commit],
  );

  const onEdgesChange = React.useCallback(
    (changes: EdgeChange[]) => {
      const meaningful = changes.filter((c) => c.type !== 'select');
      if (meaningful.length === 0) {
        setLocalEdges((e) => applyEdgeChanges(changes, e));
        return;
      }
      const next = applyEdgeChanges(meaningful, localEdges);
      setLocalEdges(next);
      commit(localNodes, next);
    },
    [localNodes, localEdges, commit],
  );

  const onConnect = React.useCallback(
    (connection: Connection) => {
      const isYes = connection.sourceHandle === 'yes';
      const isNo = connection.sourceHandle === 'no';
      const label = isNo ? 'No' : isYes ? 'Yes' : undefined;

      const next = addEdge(
        {
          ...connection,
          id: `e-${connection.source}-${connection.target}-${Date.now().toString(36)}`,
          label,
          data: label
            ? { branch: label.toLowerCase() as 'yes' | 'no' }
            : undefined,
          animated: isYes,
        },
        localEdges,
      ) as EditorEdge[];
      setLocalEdges(next);
      commit(localNodes, next);
    },
    [localNodes, localEdges, commit],
  );

  const addNode = React.useCallback(
    (nodeTypeKey: string, position?: { x: number; y: number }) => {
      const type = typeByKey.get(nodeTypeKey);
      const color = type?.color ?? '#233B74';
      const id = `n-${nodeTypeKey}-${Date.now().toString(36)}`;
      const next: EditorNode = {
        id,
        type: 'flowNode',
        position: position ?? { x: 120, y: 120 },
        data: {
          label: type?.label ?? 'New step',
          nodeType: nodeTypeKey,
          description: '',
          borderColor: color,
          backgroundColor: `${color}15`,
        },
      };
      const nextNodes = [...localNodes, next];
      setLocalNodes(nextNodes);
      commit(nextNodes, localEdges);
      setSelectedId(id);
    },
    [localNodes, localEdges, typeByKey, commit],
  );

  const updateSelected = (patch: Partial<EditorNodeData>) => {
    if (!selectedId) return;
    const next = localNodes.map((n) =>
      n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n,
    );
    setLocalNodes(next);
    commit(next, localEdges);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    const nextNodes = localNodes.filter((n) => n.id !== selectedId);
    const nextEdges = localEdges.filter(
      (e) => e.source !== selectedId && e.target !== selectedId,
    );
    setLocalNodes(nextNodes);
    setLocalEdges(nextEdges);
    commit(nextNodes, nextEdges);
    setSelectedId(null);
  };

  const autoLayout = () => {
    const { positions } = layerLayout(localNodes, localEdges);
    const next = localNodes.map((n) => ({
      ...n,
      position: positions.get(n.id) ?? n.position,
    }));
    setLocalNodes(next);
    commit(next, localEdges);
    toast.success('Flowchart auto-laid out');
  };

  const validation = validateGraph(localNodes, localEdges);
  const selected = localNodes.find((n) => n.id === selectedId);

  return (
    <div className="flex h-[720px] xl:h-[780px] 2xl:h-[840px] min-h-[620px] w-full overflow-hidden rounded-xl border bg-card shadow-xs">
      {/* Palette */}
      <div className="w-48 shrink-0 overflow-y-auto border-r bg-muted/20 p-3">
        <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Step Palette
        </p>
        <div className="space-y-1.5">
          {Array.from(typeByKey.entries()).map(([key, type]) => (
            <button
              key={key}
              type="button"
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData('application/flow-node-type', key)
              }
              onClick={() => addNode(key)}
              className="flex w-full items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left text-xs font-medium transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-2xs active:scale-[0.98]"
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white"
                style={{ backgroundColor: type.color }}
              >
                {getNodeIcon(key, 'h-3 w-3')}
              </span>
              <span className="truncate">{type.label}</span>
              <IconPlus className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/60" />
            </button>
          ))}
        </div>

        <p className="mb-2 mt-5 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Tools
        </p>
        <div className="space-y-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full justify-start gap-2 text-xs"
            onClick={autoLayout}
          >
            <IconLayoutGrid className="h-3.5 w-3.5 text-[#288FC2]" />
            Auto-layout
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 w-full justify-start gap-2 text-xs',
              validation.problems.length > 0 && 'border-amber-500/50 text-amber-700 dark:text-amber-400',
            )}
            onClick={() => setShowValidation((v) => !v)}
          >
            <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
            Validation ({validation.problems.length === 0 ? 'Passed' : `${validation.problems.length} issues`})
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full justify-start gap-2 text-xs bg-primary/5 hover:bg-primary/10 text-primary border-primary/30"
            onClick={() => setShowTest(true)}
          >
            <IconPlayerPlay className="h-3.5 w-3.5" />
            Test run
          </Button>
        </div>

        <div className="mt-4 border-t pt-3 space-y-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start gap-2 text-2xs text-muted-foreground"
            onClick={undo}
            disabled={history.length === 0}
            title="Undo (Ctrl+Z)"
          >
            <IconArrowBackUp className="h-3.5 w-3.5" />
            Undo <span className="ml-auto text-2xs opacity-50">Ctrl+Z</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start gap-2 text-2xs text-muted-foreground"
            onClick={redo}
            disabled={future.length === 0}
            title="Redo (Ctrl+Y)"
          >
            <IconArrowForwardUp className="h-3.5 w-3.5" />
            Redo <span className="ml-auto text-2xs opacity-50">Ctrl+Y</span>
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={localNodes}
          edges={localEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_e, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={{ flowNode: FlowNodeCard }}
          snapToGrid
          snapGrid={[GRID, GRID]}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          fitView
          proOptions={{ hideAttribution: true }}
          onDrop={(event) => {
            event.preventDefault();
            const key = event.dataTransfer.getData('application/flow-node-type');
            if (!key) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            addNode(key, {
              x: Math.round((event.clientX - bounds.left - 90) / GRID) * GRID,
              y: Math.round((event.clientY - bounds.top - 35) / GRID) * GRID,
            });
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>

        {/* Validation Overlay */}
        {showValidation && (
          <div className="absolute left-3 top-3 z-10 max-w-sm rounded-xl border bg-background/95 p-3.5 shadow-lg backdrop-blur-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold text-foreground">
                Flowchart Validation
              </p>
              <button
                type="button"
                onClick={() => setShowValidation(false)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </div>
            {validation.problems.length === 0 ? (
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                All validation checks passed. Flowchart is ready to publish.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {validation.problems.map((problem, i) => (
                  <li key={i} className="flex gap-2 text-2xs leading-snug">
                    <IconAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-muted-foreground">{problem}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Inspector */}
      <div className="w-72 lg:w-80 shrink-0 overflow-y-auto border-l bg-muted/10 p-4">
        {selected ? (
          <div className="space-y-4">
            <div>
              <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                Step Properties
              </p>
              <Badge
                variant="outline"
                className="mt-1.5 h-6 gap-1 px-2 text-xs font-semibold"
                style={{
                  backgroundColor: `${typeByKey.get(selected.data.nodeType)?.color ?? '#233B74'}15`,
                  borderColor: `${typeByKey.get(selected.data.nodeType)?.color ?? '#233B74'}40`,
                  color: typeByKey.get(selected.data.nodeType)?.color ?? '#233B74',
                }}
              >
                {getNodeIcon(selected.data.nodeType, 'h-3 w-3')}
                {typeByKey.get(selected.data.nodeType)?.label ?? selected.data.nodeType}
              </Badge>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Title</Label>
              <Input
                value={selected.data.label}
                onChange={(e) => updateSelected({ label: e.target.value })}
                className="h-8 text-xs font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Instructions</Label>
              <Textarea
                value={selected.data.description ?? ''}
                onChange={(e) => updateSelected({ description: e.target.value })}
                rows={4}
                className="text-xs leading-relaxed"
                placeholder="What diagnostic check or action should the engineer take?"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Step Type</Label>
              <select
                value={selected.data.nodeType}
                onChange={(e) => {
                  const newType = e.target.value;
                  const typeInfo = typeByKey.get(newType);
                  const color = typeInfo?.color ?? '#233B74';
                  updateSelected({
                    nodeType: newType,
                    borderColor: color,
                    backgroundColor: `${color}15`,
                  });
                }}
                className="h-8 w-full rounded-md border bg-background px-2.5 text-xs font-medium"
              >
                {Array.from(typeByKey.entries()).map(([key, t]) => (
                  <option key={key} value={key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Image URL (optional)</Label>
              <Input
                value={selected.data.imageUrl ?? ''}
                onChange={(e) => updateSelected({ imageUrl: e.target.value })}
                className="h-8 text-xs font-mono"
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Linked Scenario Slug (optional)</Label>
              <Input
                value={selected.data.scenarioLink ?? ''}
                onChange={(e) => updateSelected({ scenarioLink: e.target.value })}
                className="h-8 text-xs font-mono"
                placeholder="internet-down-isp-failover"
              />
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={removeSelected}
              >
                <IconTrash className="h-3.5 w-3.5" />
                Delete step
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs text-muted-foreground">
            <p className="font-bold uppercase tracking-wider text-foreground">
              Canvas Guide
            </p>
            <p>
              Drag any step type from the palette on the left directly onto the canvas.
            </p>
            <p>
              Connect steps by dragging from a source handle on the right to the target handle on the left of another step.
            </p>
            <div className="rounded-lg border border-[#E07E3C]/30 bg-[#E07E3C]/10 p-2.5 text-2xs text-[#E07E3C] dark:text-orange-400">
              <span className="font-bold">Decision Steps:</span> Decision nodes feature dedicated <span className="font-semibold text-emerald-600">Yes</span> (top) and <span className="font-semibold text-red-600">No</span> (bottom) handles. Both branches must be connected.
            </div>
          </div>
        )}
      </div>

      {/* Guided Mode Test Run Dialog */}
      {showTest && (
        <TestRunDialog
          nodes={localNodes}
          edges={localEdges}
          typeByKey={typeByKey}
          onClose={() => setShowTest(false)}
        />
      )}
    </div>
  );
}

/**
 * Canvas Node representation with Big Outsource brand styling and Yes/No handles.
 */
function FlowNodeCard({ data, selected }: NodeProps<EditorNodeData>) {
  const isDecision = data.nodeType === 'decision';
  const isStart = data.nodeType === 'start';
  const isTerminal = ['end', 'resolution', 'escalate'].includes(data.nodeType);

  return (
    <div
      className={cn(
        'relative w-[190px] rounded-lg border-2 bg-background p-2.5 text-left shadow-sm transition-all',
        selected && 'ring-2 ring-primary ring-offset-2',
      )}
      style={{
        borderColor: data.borderColor ?? '#233B74',
        backgroundColor: data.backgroundColor ?? '#ffffff',
      }}
    >
      {/* Node Header */}
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-white"
          style={{ backgroundColor: data.borderColor ?? '#233B74' }}
        >
          {getNodeIcon(data.nodeType, 'h-2.5 w-2.5')}
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: data.borderColor ?? '#233B74' }}
        >
          {data.nodeType}
        </span>
      </div>

      {/* Title */}
      <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
        {data.label}
      </p>

      {/* Description */}
      {data.description && (
        <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted-foreground">
          {data.description}
        </p>
      )}

      {/* Target Handle (Left) - for all except Start */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="!h-2.5 !w-2.5 !bg-slate-400"
        />
      )}

      {/* Source Handles (Right) */}
      {isDecision ? (
        <>
          {/* Yes Handle */}
          <Handle
            type="source"
            position={Position.Right}
            id="yes"
            style={{ top: '35%' }}
            className="!h-2.5 !w-2.5 !bg-emerald-500"
          />
          <span className="pointer-events-none absolute right-3 top-[26%] text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
            Yes
          </span>

          {/* No Handle */}
          <Handle
            type="source"
            position={Position.Right}
            id="no"
            style={{ top: '70%' }}
            className="!h-2.5 !w-2.5 !bg-red-500"
          />
          <span className="pointer-events-none absolute right-3 top-[61%] text-[9px] font-bold text-red-600 dark:text-red-400">
            No
          </span>
        </>
      ) : (
        /* Standard Source Handle */
        !isTerminal && (
          <Handle
            type="source"
            position={Position.Right}
            id="output"
            className="!h-2.5 !w-2.5 !bg-slate-400"
          />
        )
      )}
    </div>
  );
}

/**
 * Interactive Guided Mode Preview dialog for testing flowchart before publishing.
 */
function TestRunDialog({
  nodes,
  edges,
  typeByKey,
  onClose,
}: {
  nodes: EditorNode[];
  edges: EditorEdge[];
  typeByKey: Map<string, { label: string; color: string; icon: string }>;
  onClose: () => void;
}) {
  const startNode = nodes.find((n) => n.data.nodeType === 'start') || nodes[0];
  const [path, setPath] = React.useState<string[]>(startNode ? [startNode.id] : []);

  const nodeById = React.useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  const currentId = path[path.length - 1];
  const current = currentId ? nodeById.get(currentId) : undefined;
  const branches = current
    ? edges.filter((e) => e.source === current.id)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between border-b pb-2.5">
          <div className="flex items-center gap-2">
            <IconPlayerPlay className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">Guided Mode Test Run</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={onClose}
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>

        {path.length > 1 && (
          <div className="mb-3 flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">Path:</span>
            {path.map((id, index) => (
              <React.Fragment key={id}>
                <span>{nodeById.get(id)?.data.label}</span>
                {index < path.length - 1 && <span>›</span>}
              </React.Fragment>
            ))}
          </div>
        )}

        {current ? (
          <div className="space-y-4">
            <Badge
              variant="outline"
              className="h-6 gap-1 px-2 text-xs font-semibold capitalize"
              style={{
                backgroundColor: `${typeByKey.get(current.data.nodeType)?.color ?? '#233B74'}15`,
                borderColor: `${typeByKey.get(current.data.nodeType)?.color ?? '#233B74'}40`,
                color: typeByKey.get(current.data.nodeType)?.color ?? '#233B74',
              }}
            >
              {getNodeIcon(current.data.nodeType, 'h-3 w-3')}
              {typeByKey.get(current.data.nodeType)?.label ?? current.data.nodeType}
            </Badge>

            <div>
              <h4 className="text-base font-bold text-foreground">
                {current.data.label}
              </h4>
              {current.data.description && (
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {current.data.description}
                </p>
              )}
            </div>

            <div className="pt-2">
              {branches.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Choose Branch:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {branches.map((edge) => {
                      const isYes =
                        edgeLabel(edge).toLowerCase() === 'yes' ||
                        edge.data?.branch === 'yes';
                      return (
                        <Button
                          key={edge.id}
                          variant={isYes ? 'default' : 'outline'}
                          className={cn(
                            'h-10 justify-between px-3 text-xs font-semibold',
                            isYes && 'bg-emerald-600 hover:bg-emerald-700 text-white',
                          )}
                          onClick={() => setPath((p) => [...p, edge.target])}
                        >
                          <span>{edgeLabel(edge) || 'Next Step'}</span>
                          <IconArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
                  Terminal Step. Flowchart test completed.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              {path.length > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-2xs"
                  onClick={() => setPath((p) => p.slice(0, -1))}
                >
                  Back
                </Button>
              ) : <div />}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-2xs"
                onClick={() => setPath([startNode.id])}
              >
                Reset
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Flowchart is empty.</p>
        )}
      </div>
    </div>
  );
}

/** Hierarchical Auto-layout */
function layerLayout(
  nodes: EditorNode[],
  edges: EditorEdge[],
): { positions: Map<string, { x: number; y: number }>; height: number } {
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  }

  const depths = new Map<string, number>();
  const roots = nodes.filter((n) => !incoming.has(n.id));
  const queue = roots.map((r) => ({ id: r.id, depth: 0 }));
  const seen = new Set<string>();

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    depths.set(item.id, item.depth);
    for (const edge of edges.filter((e) => e.source === item.id)) {
      queue.push({ id: edge.target, depth: item.depth + 1 });
    }
  }
  for (const node of nodes) {
    if (!depths.has(node.id)) depths.set(node.id, 0);
  }

  const byDepth = new Map<number, EditorNode[]>();
  for (const node of nodes) {
    const depth = depths.get(node.id) ?? 0;
    const list = byDepth.get(depth) ?? [];
    list.push(node);
    byDepth.set(depth, list);
  }

  const width = 1000;
  const levelHeight = 140;
  const positions = new Map<string, { x: number; y: number }>();

  for (const [depth, list] of byDepth) {
    const spacing = width / (list.length + 1);
    list.forEach((node, index) => {
      positions.set(node.id, {
        x: Math.round((spacing * (index + 1) - 95) / GRID) * GRID,
        y: Math.round((40 + depth * levelHeight) / GRID) * GRID,
      });
    });
  }

  const maxDepth = Math.max(0, ...Array.from(depths.values()));
  return { positions, height: 40 + (maxDepth + 1) * levelHeight };
}

/** Structural validation */
function validateGraph(
  nodes: EditorNode[],
  edges: EditorEdge[],
): { problems: string[] } {
  const problems: string[] = [];

  if (nodes.length === 0) {
    problems.push('The flowchart is empty.');
    return { problems };
  }

  const startCount = nodes.filter((n) => n.data.nodeType === 'start').length;
  if (startCount === 0) {
    problems.push('Exactly one Start step is required.');
  } else if (startCount > 1) {
    problems.push(`Multiple Start steps found (${startCount}). Exactly one is allowed.`);
  }

  const terminalCount = nodes.filter((n) =>
    ['end', 'resolution', 'escalate'].includes(n.data.nodeType),
  ).length;
  if (terminalCount === 0) {
    problems.push('At least one terminal step (End, Resolution, or Escalate) is required.');
  }

  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  const orphans = nodes.filter((n) => !connected.has(n.id) && nodes.length > 1);
  for (const orphan of orphans) {
    problems.push(`Step "${orphan.data.label}" is disconnected from the flowchart.`);
  }

  for (const node of nodes.filter((n) => n.data.nodeType === 'decision')) {
    const outgoing = edges.filter((e) => e.source === node.id);
    const labels = outgoing.map((e) => edgeLabel(e).toLowerCase());
    const branches = outgoing.map((e) => (e.data?.branch || '').toLowerCase());
    const hasYes = labels.includes('yes') || branches.includes('yes');
    const hasNo = labels.includes('no') || branches.includes('no');
    if (!hasYes || !hasNo) {
      problems.push(
        `Decision step "${node.data.label}" must have both Yes and No branches connected.`,
      );
    }
  }

  return { problems };
}

function toFlowNode(node: EditorNode): FlowNode {
  return {
    id: node.id,
    type: 'flowNode',
    position: node.position,
    data: {
      label: node.data.label,
      nodeType: node.data.nodeType,
      description: node.data.description,
      imageUrl: node.data.imageUrl,
      scenarioLink: node.data.scenarioLink,
      borderColor: node.data.borderColor,
      backgroundColor: node.data.backgroundColor,
    },
    style: node.style as Record<string, unknown> | undefined,
  };
}

function toFlowEdge(edge: EditorEdge): FlowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edgeLabel(edge) || undefined,
    data: edge.data,
  };
}
