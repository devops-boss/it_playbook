'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUpRight,
  IconCheck,
  IconDownload,
  IconFileText,
  IconHelpCircle,
  IconListDetails,
  IconMaximize,
  IconPhoneCall,
  IconPlayerPlay,
  IconPrinter,
  IconRefresh,
  IconRoute,
  IconSettings,
  IconSquare,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from '@tabler/icons-react';
import { toPng } from 'html-to-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FlowNode } from '@/types/database';

export interface FlowchartViewerProps {
  nodes: FlowNode[];
  edges: { id: string; source: string; target: string; label?: string; data?: { branch?: 'yes' | 'no' } }[];
  nodeTypes: { key: string; label: string; color: string | null; icon: string | null }[];
  linkedScenarios?: Record<string, string>;
}

type ViewerMode = 'guided' | 'diagram' | 'text';

const BRAND_PALETTE: Record<string, { color: string; label: string }> = {
  start: { color: '#10b981', label: 'Start' },
  action: { color: '#233B74', label: 'Action' },
  decision: { color: '#E07E3C', label: 'Decision' },
  workaround: { color: '#288FC2', label: 'Workaround' },
  resolution: { color: '#10b981', label: 'Resolution' },
  escalate: { color: '#dc2626', label: 'Escalate' },
  end: { color: '#64748b', label: 'End' },
};

function getNodeIcon(type: string, className = 'h-4 w-4') {
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

/**
 * Section 11 Flowchart Viewer
 *
 * Provides:
 * 1. Guided Mode (default): Step-by-step interactive workflow, large Yes/No branch buttons,
 *    breadcrumb history, Back navigation, and "This didn't work, escalate" fast jump.
 * 2. Full Diagram Mode: Zoom, pan, SVG connections with branded node styling.
 * 3. Text List Alternative: Accessible screen-reader optimized sequential guide.
 * 4. Export: High-resolution PNG and printable PDF export.
 */
export function FlowchartViewer({
  nodes,
  edges,
  nodeTypes,
  linkedScenarios,
}: FlowchartViewerProps) {
  const [mode, setMode] = React.useState<ViewerMode>('guided');
  const [path, setPath] = React.useState<string[]>([]);
  const [isExporting, setIsExporting] = React.useState(false);

  // Find the starting node (node of type 'start', or the first root with no incoming edges, or nodes[0])
  const startNodeId = React.useMemo(() => {
    if (nodes.length === 0) return null;
    const startNode = nodes.find((n) => n.data.nodeType === 'start');
    if (startNode) return startNode.id;
    const targets = new Set(edges.map((e) => e.target));
    const root = nodes.find((n) => !targets.has(n.id));
    return root ? root.id : nodes[0].id;
  }, [nodes, edges]);

  const [currentId, setCurrentId] = React.useState<string | null>(startNodeId);

  // Keep currentId in sync if initial node changes
  React.useEffect(() => {
    if (!currentId && startNodeId) {
      setCurrentId(startNodeId);
    }
  }, [startNodeId, currentId]);

  const nodeById = React.useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  const typeByKey = React.useMemo(() => {
    const map = new Map<string, { label: string; color: string }>();
    for (const [k, v] of Object.entries(BRAND_PALETTE)) {
      map.set(k, v);
    }
    for (const t of nodeTypes) {
      if (t.key) {
        map.set(t.key, {
          label: t.label || BRAND_PALETTE[t.key]?.label || t.key,
          color: t.color || BRAND_PALETTE[t.key]?.color || '#233B74',
        });
      }
    }
    return map;
  }, [nodeTypes]);

  // Outgoing edges from a given node
  const outgoing = React.useCallback(
    (nodeId: string) => edges.filter((e) => e.source === nodeId),
    [edges],
  );

  const current = currentId ? nodeById.get(currentId) : undefined;

  // Navigate forward to a step
  const goTo = (nodeId: string) => {
    if (currentId) {
      setPath((p) => [...p, currentId]);
    }
    setCurrentId(nodeId);
  };

  // Step backward in breadcrumb history
  const goBack = () => {
    setPath((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setCurrentId(prev);
      return p.slice(0, -1);
    });
  };

  // Reset Guided Mode to the beginning
  const reset = () => {
    setPath([]);
    setCurrentId(startNodeId);
  };

  // "This didn't work, escalate" action
  const handleEscalate = () => {
    const escNode = nodes.find((n) => n.data.nodeType === 'escalate');
    if (escNode) {
      if (currentId) {
        setPath((p) => [...p, currentId]);
      }
      setCurrentId(escNode.id);
      toast.info('Jumped to Escalation procedure');
    } else {
      toast.warning('No explicit escalation node found. Contact Tier 2 IT Lead.');
    }
  };

  // Export diagram as PNG using html-to-image
  const handleExportPng = async () => {
    try {
      setIsExporting(true);
      const container = document.getElementById('bos-flowchart-export-container');
      if (!container) {
        toast.error('Diagram container not found');
        return;
      }
      const dataUrl = await toPng(container, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `troubleshooting-flowchart-${Date.now().toString(36)}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Flowchart exported to PNG');
    } catch (err) {
      toast.error('Failed to export PNG');
    } finally {
      setIsExporting(false);
    }
  };

  // Print / PDF export
  const handlePrint = () => {
    window.print();
  };

  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
        <IconRoute className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
        No troubleshooting flowchart has been configured for this scenario yet.
      </div>
    );
  }

  const branches = current ? outgoing(current.id) : [];
  const hasEscalateNode = nodes.some((n) => n.data.nodeType === 'escalate');
  const isCurrentEscalate = current?.data.nodeType === 'escalate';

  return (
    <div className="space-y-3">
      {/* View Switcher & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="inline-flex rounded-lg border bg-muted/40 p-1">
          <Button
            variant={mode === 'guided' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-7 gap-1.5 px-3 text-xs font-medium',
              mode === 'guided' && 'bg-background shadow-xs font-semibold text-primary',
            )}
            onClick={() => setMode('guided')}
          >
            <IconRoute className="h-3.5 w-3.5 text-[#288FC2]" />
            Guided Mode
          </Button>
          <Button
            variant={mode === 'diagram' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-7 gap-1.5 px-3 text-xs font-medium',
              mode === 'diagram' && 'bg-background shadow-xs font-semibold text-primary',
            )}
            onClick={() => setMode('diagram')}
          >
            <IconMaximize className="h-3.5 w-3.5 text-[#233B74] dark:text-blue-400" />
            Full Diagram
          </Button>
          <Button
            variant={mode === 'text' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-7 gap-1.5 px-3 text-xs font-medium',
              mode === 'text' && 'bg-background shadow-xs font-semibold text-primary',
            )}
            onClick={() => setMode('text')}
          >
            <IconListDetails className="h-3.5 w-3.5 text-[#E07E3C]" />
            Text List
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          {mode === 'guided' && path.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-2xs text-muted-foreground hover:text-foreground"
              onClick={reset}
            >
              <IconRefresh className="h-3 w-3" />
              Start Over
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-2xs"
            onClick={handleExportPng}
            disabled={isExporting}
            title="Download PNG image"
          >
            <IconDownload className="h-3 w-3" />
            {isExporting ? 'Exporting...' : 'PNG'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-2xs"
            onClick={handlePrint}
            title="Print or Save as PDF"
          >
            <IconPrinter className="h-3 w-3" />
            PDF / Print
          </Button>
        </div>
      </div>

      {/* 1. GUIDED MODE */}
      {mode === 'guided' && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          {/* Breadcrumb Trail */}
          {path.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-4 py-2 text-2xs">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground/70">
                Path:
              </span>
              {path.map((id, index) => {
                const node = nodeById.get(id);
                if (!node) return null;
                const nodeTypeInfo = typeByKey.get(node.data.nodeType);
                return (
                  <React.Fragment key={`${id}-${index}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setPath(path.slice(0, index));
                        setCurrentId(id);
                      }}
                      className="group inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: nodeTypeInfo?.color ?? '#233B74' }}
                      />
                      <span className="max-w-[140px] truncate">{node.data.label}</span>
                    </button>
                    <span className="text-muted-foreground/40">›</span>
                  </React.Fragment>
                );
              })}
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                {current?.data.label}
              </span>
            </div>
          )}

          {/* Current Step Card */}
          <div className="p-6">
            {current ? (
              <div className="space-y-4">
                {/* Node Type Badge */}
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className="h-6 gap-1.5 px-2.5 text-xs font-semibold capitalize"
                    style={{
                      borderColor: `${typeByKey.get(current.data.nodeType)?.color ?? '#233B74'}50`,
                      backgroundColor: `${typeByKey.get(current.data.nodeType)?.color ?? '#233B74'}15`,
                      color: typeByKey.get(current.data.nodeType)?.color ?? '#233B74',
                    }}
                  >
                    {getNodeIcon(current.data.nodeType, 'h-3.5 w-3.5')}
                    {typeByKey.get(current.data.nodeType)?.label ?? current.data.nodeType}
                  </Badge>

                  {path.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-2xs text-muted-foreground hover:text-foreground"
                      onClick={goBack}
                    >
                      <IconArrowLeft className="h-3 w-3" />
                      Back
                    </Button>
                  )}
                </div>

                {/* Step Title */}
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-foreground">
                    {current.data.label}
                  </h3>
                  {current.data.description && (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {current.data.description}
                    </p>
                  )}
                </div>

                {/* Optional Step Image */}
                {current.data.imageUrl && (
                  <div className="overflow-hidden rounded-lg border bg-muted/20 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={current.data.imageUrl}
                      alt={current.data.label}
                      className="max-h-72 w-full rounded object-contain"
                    />
                  </div>
                )}

                {/* Optional Linked Scenario */}
                {current.data.scenarioLink && (
                  <div className="rounded-lg border border-[#288FC2]/30 bg-[#288FC2]/10 p-3">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-[#288FC2]">
                      Related Procedure
                    </p>
                    <Link
                      href={`/scenario/${current.data.scenarioLink}`}
                      className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
                    >
                      {linkedScenarios?.[current.data.scenarioLink] ?? current.data.scenarioLink}
                      <IconArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}

                {/* Action / Decision Branches */}
                <div className="pt-2">
                  {current.data.nodeType === 'decision' ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Select Outcome:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {branches.map((edge) => {
                          const isYes =
                            (edge.label || '').toLowerCase() === 'yes' ||
                            edge.data?.branch === 'yes';
                          return (
                            <Button
                              key={edge.id}
                              size="lg"
                              variant={isYes ? 'default' : 'outline'}
                              className={cn(
                                'h-12 w-full justify-between px-4 text-sm font-semibold transition-all',
                                isYes
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                                  : 'border-orange-500/50 hover:bg-orange-50 dark:hover:bg-orange-950/20 text-orange-700 dark:text-orange-400',
                              )}
                              onClick={() => goTo(edge.target)}
                            >
                              <span className="flex items-center gap-2">
                                {isYes ? (
                                  <IconCheck className="h-5 w-5" />
                                ) : (
                                  <IconAlertTriangle className="h-5 w-5" />
                                )}
                                <span>{edge.label || (isYes ? 'Yes' : 'No')}</span>
                              </span>
                              <IconArrowRight className="h-4 w-4 opacity-70" />
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ) : branches.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {branches.map((edge) => (
                          <Button
                            key={edge.id}
                            size="default"
                            className="h-10 gap-2 bg-[#233B74] px-5 text-xs font-semibold text-white hover:bg-[#233B74]/90"
                            onClick={() => goTo(edge.target)}
                          >
                            <span>{edge.label || 'Next Step'}</span>
                            <IconArrowRight className="h-4 w-4" />
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Terminal States */
                    <div className="rounded-xl border p-4 text-center">
                      {current.data.nodeType === 'resolution' ? (
                        <div className="space-y-2 text-emerald-600 dark:text-emerald-400">
                          <IconCheck className="mx-auto h-8 w-8" />
                          <h4 className="text-sm font-bold">Issue Successfully Resolved</h4>
                          <p className="text-xs text-muted-foreground">
                            Remember to log the outcome and update the HESK tracking ticket.
                          </p>
                        </div>
                      ) : current.data.nodeType === 'escalate' ? (
                        <div className="space-y-2 text-red-600 dark:text-red-400">
                          <IconPhoneCall className="mx-auto h-8 w-8" />
                          <h4 className="text-sm font-bold">Escalate Issue Immediately</h4>
                          <p className="text-xs text-muted-foreground">
                            Initiate standard emergency escalation to ISP NOC or Tier 2 operations.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1 text-muted-foreground">
                          <IconSquare className="mx-auto h-6 w-6" />
                          <p className="text-xs font-medium">End of Troubleshooting Workflow</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Fast Escalation Shortcut Button */}
                {hasEscalateNode && !isCurrentEscalate && (
                  <div className="border-t pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-2 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/20"
                      onClick={handleEscalate}
                    >
                      <IconAlertTriangle className="h-4 w-4" />
                      This didn't work, escalate
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No step selected.</p>
            )}
          </div>
        </div>
      )}

      {/* 2. FULL DIAGRAM MODE */}
      {mode === 'diagram' && (
        <FlowDiagramView
          nodes={nodes}
          edges={edges}
          typeByKey={typeByKey}
          onSelectNode={(id) => {
            setCurrentId(id);
            setMode('guided');
          }}
        />
      )}

      {/* 3. ACCESSIBLE TEXT LIST MODE */}
      {mode === 'text' && (
        <FlowchartTextListView
          nodes={nodes}
          edges={edges}
          typeByKey={typeByKey}
          onJumpTo={(id) => {
            setCurrentId(id);
            setMode('guided');
          }}
        />
      )}
    </div>
  );
}

/**
 * Full diagram SVG rendering with zoom & pan controls.
 */
function FlowDiagramView({
  nodes,
  edges,
  typeByKey,
  onSelectNode,
}: {
  nodes: FlowNode[];
  edges: { id: string; source: string; target: string; label?: string }[];
  typeByKey: Map<string, { label: string; color: string }>;
  onSelectNode: (id: string) => void;
}) {
  const [zoom, setZoom] = React.useState(1);

  const layout = React.useMemo(() => {
    const width = 960;
    const levelHeight = 140;
    const depths = new Map<string, number>();
    const positions = new Map<string, { x: number; y: number }>();

    const incoming = new Map<string, string[]>();
    for (const edge of edges) {
      const list = incoming.get(edge.target) ?? [];
      list.push(edge.source);
      incoming.set(edge.target, list);
    }

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

    const byDepth = new Map<number, string[]>();
    for (const node of nodes) {
      const depth = depths.get(node.id) ?? 0;
      const list = byDepth.get(depth) ?? [];
      list.push(node.id);
      byDepth.set(depth, list);
    }

    for (const [depth, ids] of byDepth) {
      ids.forEach((id, index) => {
        const spacing = width / (ids.length + 1);
        positions.set(id, {
          x: spacing * (index + 1) - 100,
          y: 40 + depth * levelHeight,
        });
      });
    }

    const maxDepth = Math.max(0, ...Array.from(depths.values()));
    return {
      positions,
      width,
      height: 60 + (maxDepth + 1) * levelHeight,
    };
  }, [nodes, edges]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
        <span className="text-2xs font-medium text-muted-foreground">
          {nodes.length} Steps · {edges.length} Branches · Click any step to open in Guided Mode
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
            title="Zoom Out"
          >
            <IconZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="w-12 text-center text-2xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom((z) => Math.min(2, Number((z + 0.15).toFixed(2))))}
            title="Zoom In"
          >
            <IconZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom(1)}
            title="Reset Zoom"
          >
            <IconZoomReset className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        id="bos-flowchart-export-container"
        className="overflow-auto bg-background p-4"
        style={{ minHeight: '440px' }}
      >
        <svg
          width={layout.width * zoom}
          height={layout.height * zoom}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="mx-auto"
          role="img"
          aria-label="Troubleshooting Flowchart Diagram"
        >
          <defs>
            <marker
              id="bos-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge) => {
            const from = layout.positions.get(edge.source);
            const to = layout.positions.get(edge.target);
            if (!from || !to) return null;

            const x1 = from.x + 100;
            const y1 = from.y + 35;
            const x2 = to.x + 100;
            const y2 = to.y + 35;
            const midY = (y1 + y2) / 2;

            const isYes = (edge.label || '').toLowerCase() === 'yes';
            const isNo = (edge.label || '').toLowerCase() === 'no';

            return (
              <g key={edge.id}>
                <path
                  d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                  fill="none"
                  stroke={isYes ? '#10b981' : isNo ? '#E07E3C' : '#94a3b8'}
                  strokeWidth={2}
                  markerEnd="url(#bos-arrow)"
                />
                {edge.label && (
                  <g transform={`translate(${(x1 + x2) / 2}, ${midY})`}>
                    <rect
                      x={-20}
                      y={-10}
                      width={40}
                      height={20}
                      rx={4}
                      fill={isYes ? '#10b981' : isNo ? '#E07E3C' : '#64748b'}
                      className="shadow-xs"
                    />
                    <text
                      x={0}
                      y={4}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize={11}
                      fontWeight="bold"
                    >
                      {edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const pos = layout.positions.get(node.id);
            if (!pos) return null;
            const typeInfo = typeByKey.get(node.data.nodeType);
            const color = typeInfo?.color ?? '#233B74';

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => onSelectNode(node.id)}
                className="cursor-pointer transition-transform hover:opacity-90"
              >
                <rect
                  width={200}
                  height={70}
                  rx={8}
                  fill="#ffffff"
                  stroke={color}
                  strokeWidth={2}
                  className="dark:fill-slate-900"
                />
                <rect
                  width={200}
                  height={20}
                  rx={6}
                  fill={`${color}20`}
                />
                <text
                  x={10}
                  y={14}
                  fill={color}
                  fontSize={10}
                  fontWeight="bold"
                >
                  {(typeInfo?.label ?? node.data.nodeType).toUpperCase()}
                </text>
                <text
                  x={100}
                  y={42}
                  textAnchor="middle"
                  fill="#1e293b"
                  fontSize={11}
                  fontWeight="600"
                  className="dark:fill-slate-100"
                >
                  {node.data.label.length > 25
                    ? `${node.data.label.slice(0, 24)}…`
                    : node.data.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/**
 * Accessible text list view alternative for screen readers and quick scannability.
 */
function FlowchartTextListView({
  nodes,
  edges,
  typeByKey,
  onJumpTo,
}: {
  nodes: FlowNode[];
  edges: { id: string; source: string; target: string; label?: string }[];
  typeByKey: Map<string, { label: string; color: string }>;
  onJumpTo: (id: string) => void;
}) {
  const outgoing = (nodeId: string) => edges.filter((e) => e.source === nodeId);

  return (
    <div className="rounded-xl border bg-card p-6 shadow-xs">
      <div className="mb-4 border-b pb-3">
        <h3 className="text-sm font-bold text-foreground">
          Step-by-Step Troubleshooting Procedure (Text Alternative)
        </h3>
        <p className="mt-1 text-2xs text-muted-foreground">
          Accessible sequential view of all diagnosis and resolution branches.
        </p>
      </div>

      <nav aria-label="Troubleshooting steps">
        <ol className="space-y-4">
          {nodes.map((node, index) => {
            const typeInfo = typeByKey.get(node.data.nodeType);
            const branches = outgoing(node.id);

            return (
              <li
                key={node.id}
                className="rounded-lg border bg-background p-3.5 transition-colors hover:border-primary/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-2xs font-bold text-muted-foreground">
                      {index + 1}
                    </span>
                    <Badge
                      variant="outline"
                      className="h-5 px-1.5 text-[10px] font-semibold"
                      style={{
                        borderColor: `${typeInfo?.color ?? '#233B74'}50`,
                        backgroundColor: `${typeInfo?.color ?? '#233B74'}15`,
                        color: typeInfo?.color ?? '#233B74',
                      }}
                    >
                      {typeInfo?.label ?? node.data.nodeType}
                    </Badge>
                    <span className="text-xs font-bold text-foreground">
                      {node.data.label}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-2xs text-primary"
                    onClick={() => onJumpTo(node.id)}
                  >
                    Open in Guided Mode
                  </Button>
                </div>

                {node.data.description && (
                  <p className="mt-2 pl-7 text-xs text-muted-foreground">
                    {node.data.description}
                  </p>
                )}

                {branches.length > 0 && (
                  <div className="mt-2.5 pl-7">
                    <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Next Branch:
                    </p>
                    <ul className="mt-1 space-y-1">
                      {branches.map((b) => {
                        const targetNode = nodes.find((n) => n.id === b.target);
                        return (
                          <li
                            key={b.id}
                            className="flex items-center gap-2 text-2xs text-muted-foreground"
                          >
                            <span className="font-semibold text-foreground">
                              [{b.label || 'Continue'}]:
                            </span>
                            <span>{targetNode?.data.label ?? b.target}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
