'use client';

import * as React from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  IconChevronDown,
  IconMenu2,
  IconMoon,
  IconSearch,
  IconSun,
} from '@tabler/icons-react';
import { useAppStore } from '@/lib/store/app-store';
import { useTheme } from './theme-provider';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

export function TopBar({ user, onOpenPalette }: TopBarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
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

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-3 sm:px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
      {/* Left: Sidebar Toggle & Brand */}
      <div className="flex items-center gap-2.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <IconMenu2 className="h-4 w-4" />
        </Button>

        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm font-semibold tracking-tight hover:opacity-90 transition-opacity"
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
      </div>

      {/* Center: Command Palette Quick Search Trigger */}
      <div className="flex-1 flex justify-center max-w-xl mx-2 sm:mx-6">
        <button
          type="button"
          onClick={onOpenPalette}
          className="group flex h-9 w-full items-center gap-2.5 rounded-xl border border-input/60 bg-muted/30 hover:bg-muted/70 px-3 text-xs text-muted-foreground transition-all duration-150 hover:border-border hover:shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <IconSearch className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
          <span className="hidden flex-1 text-left sm:inline truncate">
            Search scenarios, runbooks, error codes...
          </span>
          <span className="inline sm:hidden flex-1 text-left truncate">
            Search playbook...
          </span>
          <kbd className="hidden shrink-0 rounded-md border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px] sm:inline shadow-2xs">
            Ctrl K
          </kbd>
        </button>
      </div>

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
