import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert a hex color to HSL components for CSS custom properties.
 * Admins can change the accent color in Settings; we convert it at runtime
 * so no rebuild is needed.
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  switch (max) {
    case r:
      h = ((g - b) / d) % 6;
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  return {
    h,
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Relative luminance per WCAG 2.1. Used to validate that admin-chosen
 * colors (accent, severity, category) meet AA contrast.
 */
export function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;

  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const r = channel(parseInt(full.slice(0, 2), 16));
  const g = channel(parseInt(full.slice(2, 4), 16));
  const b = channel(parseInt(full.slice(4, 6), 16));

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colors (1 to 21). */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastLevel = 'AAA' | 'AA' | 'AA Large' | 'Fail';

/** WCAG contrast check used by the admin color pickers. */
export function checkContrast(foreground: string, background: string): {
  ratio: number;
  level: ContrastLevel;
  passesAA: boolean;
} {
  const ratio = contrastRatio(foreground, background);
  let level: ContrastLevel;
  if (ratio >= 7) level = 'AAA';
  else if (ratio >= 4.5) level = 'AA';
  else if (ratio >= 3) level = 'AA Large';
  else level = 'Fail';

  return { ratio: Math.round(ratio * 100) / 100, level, passesAA: ratio >= 4.5 };
}

/** Pick a readable foreground (dark or light) for a given background. */
export function readableForeground(background: string): string {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#ffffff')
    ? '#000000'
    : '#ffffff';
}

/** Build an inline style for a criteria chip using the option's color. */
export function chipStyle(color?: string | null): React.CSSProperties {
  if (!color) return {};
  const bg = `${color}1a`; // ~10% alpha
  return {
    backgroundColor: bg,
    borderColor: `${color}40`,
    color,
  };
}

export function formatDate(date?: string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelative(date?: string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);

  if (days < 1) {
    const hours = Math.floor(diffMs / 3_600_000);
    if (hours < 1) {
      const minutes = Math.floor(diffMs / 60_000);
      return minutes <= 1 ? 'just now' : `${minutes}m ago`;
    }
    return hours < 24 ? `${hours}h ago` : 'yesterday';
  }
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Truncate for card previews. */
export function truncate(text: string | null | undefined, length = 140): string {
  if (!text) return '';
  const stripped = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (stripped.length <= length) return stripped;
  return `${stripped.slice(0, length).trimEnd()}…`;
}

/** Slugify for URLs and option values. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Stable, human-readable label from a JSON-ish criteria value. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Build a tree from a flat list with a parent_id. */
export interface TreeNode<T> {
  node: T;
  children: TreeNode<T>[];
}

export function buildTree<T extends { id: string; parent_id: string | null }>(
  items: T[],
  parentId: string | null = null,
): TreeNode<T>[] {
  return items
    .filter((item) => item.parent_id === parentId)
    .map((node) => ({
      node,
      children: buildTree(items, node.id),
    }));
}

/** Depth-first flatten of a tree, yielding a path of ancestors. */
export function flattenTree<T extends { id: string; parent_id: string | null }>(
  items: T[],
): { item: T; depth: number; parentId: string | null }[] {
  const result: { item: T; depth: number; parentId: string | null }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const item of items.filter((i) => i.parent_id === parentId)) {
      result.push({ item, depth, parentId });
      walk(item.id, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}

/** Debounce a function (used for search-as-you-type). */
export function debounce<T extends (...args: never[]) => void>(fn: T, delay = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Stable JSON stringify for URL state and saved filters. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

/**
 * Checks if a playbook / scenario is classified as Documentation / SOP.
 */
export function isDocumentationPlaybook(item?: {
  tags?: string[] | null;
  custom_sections?: unknown;
  playbook_type?: string | null;
} | null): boolean {
  if (!item) return false;
  if (item.playbook_type === 'documentation' || item.playbook_type === 'sop') return true;
  if (Array.isArray(item.tags) && (item.tags.includes('documentation') || item.tags.includes('sop'))) {
    return true;
  }
  const cs = item.custom_sections;
  if (cs && typeof cs === 'object') {
    const pt = (cs as Record<string, unknown>).playbook_type;
    if (pt === 'documentation' || pt === 'sop') return true;
  }
  return false;
}
