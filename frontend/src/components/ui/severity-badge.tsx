import * as React from 'react';
import { cn } from '@/lib/utils';

export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low' | string;

export interface SeverityBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  level: SeverityLevel;
  label?: string;
  dotOnly?: boolean;
}

export function SeverityBadge({
  level,
  label,
  dotOnly = false,
  className,
  ...props
}: SeverityBadgeProps) {
  const normalized = (level || '').toLowerCase().trim();

  let colorClasses = 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300';
  let dotColor = 'bg-slate-400';

  if (normalized.includes('critical') || normalized === 'p1') {
    colorClasses = 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
    dotColor = 'bg-red-500';
  } else if (normalized.includes('high') || normalized === 'p2') {
    colorClasses = 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300';
    dotColor = 'bg-orange-500';
  } else if (normalized.includes('med') || normalized === 'p3') {
    colorClasses = 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300';
    dotColor = 'bg-amber-500';
  } else if (normalized.includes('low') || normalized === 'p4') {
    colorClasses = 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
    dotColor = 'bg-blue-500';
  }

  if (dotOnly) {
    return (
      <span
        className={cn('inline-block h-2 w-2 rounded-full', dotColor, className)}
        title={label ?? level}
        {...props}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide',
        colorClasses,
        className,
      )}
      {...props}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} aria-hidden="true" />
      <span>{label ?? level}</span>
    </span>
  );
}
