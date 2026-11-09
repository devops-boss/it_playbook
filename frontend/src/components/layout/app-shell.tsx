'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store/app-store';
import { cn } from '@/lib/utils';
import { TopBar } from './top-bar';
import { Sidebar } from './sidebar';
import { CommandPalette } from '@/components/command-palette';
import type { Account, Category, CriteriaField } from '@/types/database';

interface AppShellProps {
  children: React.ReactNode;
  accounts: Account[];
  categories: Category[];
  criteriaFields: CriteriaField[];
  user: {
    id: string;
    displayName: string;
    email: string | null;
    photoUrl: string | null;
    isSuperAdmin: boolean;
    roleNames: string[];
    permissions: string[];
  };
}

export function AppShell({
  children,
  accounts,
  categories,
  criteriaFields,
  user,
}: AppShellProps) {
  const setAccounts = useAppStore((s) => s.setAccounts);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    setAccounts(accounts);
  }, [accounts, setAccounts]);

  // Global Ctrl+K / Cmd+K opens the command palette.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar
        accounts={accounts}
        user={user}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar accounts={accounts} categories={categories} user={user} />
        <main
          className="min-w-0 flex-1 print:w-full print:max-w-none print:p-0 print:m-0"
          data-pathname={pathname}
          id="main-content"
        >
          {children}
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        accounts={accounts}
        categories={categories}
        criteriaFields={criteriaFields}
      />
    </div>
  );
}
