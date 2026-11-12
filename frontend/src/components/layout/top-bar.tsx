'use client';

import * as React from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  IconCheck,
  IconChevronDown,
  IconMenu2,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
  IconX,
} from '@tabler/icons-react';
import { useAppStore } from '@/lib/store/app-store';
import { useTheme } from './theme-provider';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Account } from '@/types/database';
import { OnlinePresence } from './online-presence';

interface TopBarProps {
  accounts: Account[];
  user: {
    displayName: string;
    email: string | null;
    photoUrl: string | null;
    isSuperAdmin: boolean;
    roleNames: string[];
  };
  onOpenPalette: () => void;
}

const MATCH_MODES = [
  { value: 'any', label: 'Any selected account', hint: 'Matches scenarios in at least one' },
  { value: 'all', label: 'Common to ALL selected', hint: 'Matches only if present in every one' },
  { value: 'only', label: 'Unique to one account', hint: 'Matches only scenarios tied to a single account' },
] as const;

export function TopBar({ accounts, user, onOpenPalette }: TopBarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [accountFilter, setAccountFilter] = React.useState('');
  const selectedAccountIds = useAppStore((s) => s.selectedAccountIds);
  const accountMatch = useAppStore((s) => s.accountMatch);
  const setAccountMatch = useAppStore((s) => s.setAccountMatch);
  const toggleAccount = useAppStore((s) => s.toggleAccount);
  const setSelectedAccountIds = useAppStore((s) => s.setSelectedAccountIds);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';

    // Support circular reveal animation via View Transitions API
    if (
      typeof document !== 'undefined' &&
      'startViewTransition' in document &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );

      const transition = (
        document as unknown as {
          startViewTransition: (cb: () => void) => { ready: Promise<void> };
        }
      ).startViewTransition(() => {
        flushSync(() => {
          setTheme(nextTheme);
        });
      });

      transition.ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 420,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      });
    } else {
      // Smooth CSS transition fallback
      document.documentElement.classList.add('theme-transitioning');
      setTheme(nextTheme);
      window.setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning');
      }, 350);
    }
  };

  const activeAccounts = accounts.filter((a) => selectedAccountIds.includes(a.id));
  const filteredAccounts = accounts.filter(
    (a) =>
      !accountFilter.trim() ||
      a.name.toLowerCase().includes(accountFilter.toLowerCase()) ||
      a.code.toLowerCase().includes(accountFilter.toLowerCase()),
  );

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <IconMenu2 className="h-4 w-4" />
      </Button>

      <Link
        href="/"
        className="flex shrink-0 items-center gap-2.5 rounded-md px-1.5 py-1 text-sm font-semibold tracking-tight hover:opacity-90 transition-opacity"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Company Logo"
          className="h-7 w-auto max-w-[130px] object-contain shrink-0"
        />
        <div className="flex flex-col">
          <span className="hidden sm:inline font-bold tracking-tight text-foreground leading-tight text-xs">
            IT Operations Playbook
          </span>
          <span className="hidden sm:inline text-[9px] font-medium text-muted-foreground leading-none">
            Big Outsource
          </span>
        </div>
      </Link>

      {/* Account context - always visible, per the "context always visible" principle */}
      <div className="ml-2 hidden min-w-0 md:flex">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 max-w-[280px] gap-2 px-2.5 text-xs font-normal"
            >
              <span className="truncate">
                {activeAccounts.length === 0
                  ? 'All accounts'
                  : activeAccounts.length === 1
                    ? activeAccounts[0].name
                    : `${activeAccounts.length} accounts`}
              </span>
              {activeAccounts.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {activeAccounts.length}
                </Badge>
              )}
              <IconChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-0">
            <div className="border-b px-3 py-2">
              <p className="text-xs font-medium">Account scope</p>
              <p className="text-2xs text-muted-foreground">
                Select one or more accounts to scope every view.
              </p>
            </div>

            <div className="border-b p-1.5">
              <input
                type="text"
                placeholder={accounts.length > 0 ? `Search ${accounts.length} accounts...` : 'Search accounts...'}
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="w-full rounded border bg-transparent px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="max-h-64 overflow-y-auto p-1">
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent',
                  selectedAccountIds.length === 0 && 'bg-accent/60',
                )}
                onClick={() => setSelectedAccountIds([])}
              >
                <IconCheck
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    selectedAccountIds.length === 0 ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="font-medium">All accounts</span>
              </button>

              {filteredAccounts.map((account) => (
                <label
                  key={account.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
                >
                  <Checkbox
                    checked={selectedAccountIds.includes(account.id)}
                    onCheckedChange={() => toggleAccount(account.id)}
                    aria-label={account.name}
                  />
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: account.accent_color ?? '#94a3b8' }}
                    aria-hidden
                  />
                  <span className="truncate">{account.name}</span>
                  {account.status !== 'Active' && (
                    <Badge variant="outline" className="ml-auto h-4 px-1 text-[10px]">
                      {account.status}
                    </Badge>
                  )}
                </label>
              ))}
            </div>

            {selectedAccountIds.length > 1 && (
              <div className="border-t p-2">
                <p className="mb-1.5 px-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  Match mode
                </p>
                <div className="space-y-0.5">
                  {MATCH_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setAccountMatch(mode.value)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent',
                        accountMatch === mode.value && 'bg-accent/60',
                      )}
                    >
                      <IconCheck
                        className={cn(
                          'mt-0.5 h-3.5 w-3.5 shrink-0',
                          accountMatch === mode.value ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span>
                        <span className="block font-medium">{mode.label}</span>
                        <span className="block text-2xs text-muted-foreground">
                          {mode.hint}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="group ml-auto flex h-8 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted sm:max-w-md"
      >
        <IconSearch className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden flex-1 text-left sm:inline">
          Search scenarios, tickets, accounts...
        </span>
        <kbd className="hidden shrink-0 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          Ctrl K
        </kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        <OnlinePresence currentUser={user} />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-90"
          aria-label={
            theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
          }
          onClick={toggleTheme}
        >
          {theme === 'dark' ? (
            <IconSun className="h-4 w-4 transition-transform duration-200 rotate-0 hover:rotate-45 text-amber-400" />
          ) : (
            <IconMoon className="h-4 w-4 transition-transform duration-200 rotate-0 hover:-rotate-12 text-[#233B74]" />
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-2 px-1.5 text-xs font-normal"
            >
              {user.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photoUrl}
                  alt=""
                  className="h-5 w-5 rounded-full"
                />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {user.displayName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <IconChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
              <span className="text-xs font-medium">{user.displayName}</span>
              <span className="text-2xs font-normal text-muted-foreground">
                {user.email}
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                {user.roleNames.map((r) => (
                  <Badge key={r} variant="secondary" className="h-4 px-1.5 text-[10px]">
                    {r}
                  </Badge>
                ))}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {user.isSuperAdmin && (
              <DropdownMenuItem onSelect={() => router.push('/admin/settings')}>
                Admin Console
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => router.push('/favorites')}>
              Saved Playbooks
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/recent')}>
              Recent Activity
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  const supabase = createClient();
                  await supabase.auth.signOut();
                } catch {
                  // Ignore if already signed out
                }
                try {
                  await fetch('/api/auth/signout', { method: 'POST' });
                } catch {
                  // Ignore
                }
                window.location.href = '/login';
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
