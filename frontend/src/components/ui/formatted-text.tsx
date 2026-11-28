'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export function formatMarkdownToHtml(raw: string): string {
  if (!raw) return '';
  let out = raw;

  // Convert markdown bold: **text** -> <strong>text</strong>
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-foreground print:text-black">$1</strong>');

  // Convert markdown italic: *text* (when not preceded or followed by *) -> <em>text</em>
  out = out.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em class="italic">$1</em>');

  // Convert underline markdown: __text__ -> <u>text</u>
  out = out.replace(/(?<!_)__([^_]+?)__(?!_)/g, '<u class="underline underline-offset-2">$1</u>');

  // Convert strikethrough: ~~text~~ -> <del>$1</del>
  out = out.replace(/~~(.+?)~~/g, '<del class="line-through text-muted-foreground print:text-slate-600">$1</del>');

  // Convert inline code: `code` -> <code>code</code>
  out = out.replace(/`([^`]+?)`/g, '<code class="font-mono bg-muted/60 dark:bg-muted/40 px-1 py-0.5 rounded text-[11px] print:bg-slate-100 print:text-black">$1</code>');

  // Convert linebreaks: \n -> <br />
  out = out.replace(/\n/g, '<br />');

  return out;
}

export function hasFormatting(text?: string | null): boolean {
  if (!text) return false;
  return /\*\*|\*|<u>|__|\`|~~|<b>|<i>|<strong>|<em>/.test(text);
}

export function FormattedText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text) return null;

  const html = React.useMemo(() => formatMarkdownToHtml(text), [text]);

  return (
    <span
      className={cn('inline-block leading-relaxed', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

