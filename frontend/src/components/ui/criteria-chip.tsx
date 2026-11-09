import * as React from 'react';
import { IconX } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

export interface CriteriaChipProps {
  label: string;
  fieldLabel?: string;
  color?: string | null;
  active?: boolean;
  interactive?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function CriteriaChip({
  label,
  fieldLabel,
  color,
  active = false,
  interactive = true,
  onSelect,
  onRemove,
  className,
}: CriteriaChipProps) {
  const content = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-2xs font-medium transition-all select-none',
        interactive && 'cursor-pointer hover:border-primary/50 hover:bg-accent/80',
        active
          ? 'border-primary/40 bg-primary/10 text-primary font-semibold ring-1 ring-primary/20'
          : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
        className,
      )}
      onClick={interactive ? onSelect : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect?.();
        }
      }}
    >
      {color && (
        <span
          className="h-2 w-2 shrink-0 rounded-full ring-1 ring-border/50"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}
      {fieldLabel && (
        <span className="text-[10px] font-normal uppercase tracking-wider opacity-60">
          {fieldLabel}:
        </span>
      )}
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 -mr-1 rounded-sm p-0.5 hover:bg-primary/20 text-muted-foreground hover:text-foreground focus:outline-none"
          aria-label={`Remove filter ${label}`}
        >
          <IconX className="h-3 w-3" />
        </button>
      )}
    </span>
  );

  return content;
}
