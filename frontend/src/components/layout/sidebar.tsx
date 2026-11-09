'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconBuilding,
  IconChevronDown,
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconHistory,
  IconLayoutDashboard,
  IconPlus,
  IconSettings,
  IconStar,
  IconUsers,
} from '@tabler/icons-react';
import { useAppStore } from '@/lib/store/app-store';
import { cn } from '@/lib/utils';
import type { Account, Category } from '@/types/database';

interface SidebarProps {
  accounts?: Account[];
  categories: Category[];
  user: {
    isSuperAdmin: boolean;
    roleNames: string[];
    permissions: string[];
  };
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: IconLayoutDashboard, exact: true },
  { href: '/favorites', label: 'Favorites', icon: IconStar },
  { href: '/recent', label: 'Recently Viewed', icon: IconHistory },
  { href: '/drafts', label: 'My Drafts', icon: IconFileText },
];

export function Sidebar({ accounts = [], categories, user }: SidebarProps) {
  const pathname = usePathname();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const [accountsOpen, setAccountsOpen] = React.useState(true);

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  // Users page is Admin only
  const canSeeUsers = user.isSuperAdmin || user.permissions.includes('manage_users');

  return (
    <aside
      className={cn(
        'sticky top-14 z-30 flex h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r bg-background transition-[width] duration-200 print:hidden',
        collapsed ? 'w-12' : 'w-[var(--sidebar-width)]',
      )}
      aria-label="Main navigation"
    >
      <nav className="scrollbar-thin flex-1 overflow-y-auto p-2">
        {/* Create Action */}
        <div className="mb-3">
          <Link
            href="/scenarios/new"
            className={cn(
              'flex items-center gap-2 rounded-lg bg-[#233B74] px-2.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1b2e5c]',
              collapsed && 'justify-center px-0 py-2',
            )}
            title={collapsed ? 'Create New Playbook' : undefined}
          >
            <IconPlus className="h-4 w-4 shrink-0 text-white" />
            {!collapsed && <span className="truncate">New Playbook</span>}
          </Link>
        </div>

        {/* Main Navigation */}
        <ul className="space-y-0.5">
          {MAIN_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                  isActive(item)
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </li>
          ))}
        </ul>

        {/* Accounts List (Data-driven from pb_accounts) */}
        {accounts.length > 0 && (
          <div className="mt-5">
            {!collapsed ? (
              <div className="mb-1 flex items-center justify-between px-2">
                <button
                  type="button"
                  onClick={() => setAccountsOpen((o) => !o)}
                  className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  aria-expanded={accountsOpen}
                >
                  <IconBuilding className="h-3 w-3" />
                  <span>Accounts ({accounts.length})</span>
                  {accountsOpen ? (
                    <IconChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
                  ) : (
                    <IconChevronRight className="h-3 w-3 ml-0.5 opacity-60" />
                  )}
                </button>
                <Link
                  href="/accounts"
                  className="text-2xs text-muted-foreground hover:text-foreground"
                >
                  All
                </Link>
              </div>
            ) : (
              <Link
                href="/accounts"
                className="flex items-center justify-center p-2 text-muted-foreground hover:bg-accent rounded-md"
                title={`Accounts (${accounts.length})`}
              >
                <IconBuilding className="h-4 w-4 shrink-0" />
              </Link>
            )}

            {!collapsed && accountsOpen && (
              <ul className="max-h-48 overflow-y-auto space-y-0.5 pl-1 scrollbar-thin">
                {accounts.map((account) => {
                  const isAcctActive = pathname === `/accounts/${account.code}`;
                  return (
                    <li key={account.id}>
                      <Link
                        href={`/accounts/${account.code}`}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors',
                          isAcctActive
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                        title={account.name}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: account.accent_color ?? '#233B74' }}
                          aria-hidden="true"
                        />
                        <span className="truncate flex-1">{account.name}</span>
                        <span className="text-[10px] font-mono opacity-50 uppercase">
                          {account.code}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Categories Tree (Data-driven from pb_categories) */}
        <div className="mt-5">
          {!collapsed ? (
            <div className="mb-1 flex items-center justify-between px-2">
              <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <IconFolder className="h-3 w-3" />
                Categories
              </span>
              <Link
                href="/admin/categories"
                className="text-2xs text-muted-foreground hover:text-foreground"
              >
                Manage
              </Link>
            </div>
          ) : (
            <Link
              href="/admin/categories"
              className="flex items-center justify-center p-2 text-muted-foreground hover:bg-accent rounded-md"
              title="Categories"
            >
              <IconFolder className="h-4 w-4 shrink-0" />
            </Link>
          )}

          <CategoryTree
            categories={categories}
            collapsed={collapsed}
            pathname={pathname}
          />
        </div>

        {/* Administration / Management Section */}
        <div className="mt-5">
          {!collapsed && (
            <div className="mb-1 px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Management
            </div>
          )}
          <ul className="space-y-0.5">
            <li>
              <Link
                href="/manage"
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                  pathname.startsWith('/manage')
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
                title={collapsed ? 'Manage Playbook' : undefined}
              >
                <IconSettings className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">Manage Playbook</span>}
              </Link>
            </li>

            {/* Users & Roles: STRICTLY ADMIN ONLY */}
            {canSeeUsers && (
              <li>
                <Link
                  href="/admin/users"
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    pathname.startsWith('/admin/users')
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                  title={collapsed ? 'Users & Roles (Admin)' : undefined}
                >
                  <IconUsers className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <span className="truncate flex items-center justify-between flex-1">
                      <span>Users &amp; Roles</span>
                      <span className="text-[9px] bg-primary/20 text-primary px-1 rounded font-semibold uppercase">
                        Admin
                      </span>
                    </span>
                  )}
                </Link>
              </li>
            )}
          </ul>
        </div>
      </nav>

      {/* Collapse/Expand Toggle */}
      <div className="border-t p-2">
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <IconChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <IconChevronRight className="h-4 w-4 shrink-0 rotate-180" />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

interface CategoryTreeProps {
  categories: Category[];
  collapsed: boolean;
  pathname: string;
}

/** Renders the category tree from the flat list, preserving parent/child order. */
function CategoryTree({ categories, collapsed, pathname }: CategoryTreeProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const byParent = React.useMemo(() => {
    const map = new Map<string | null, Category[]>();
    for (const c of categories) {
      const list = map.get(c.parent_id) ?? [];
      list.push(c);
      map.set(c.parent_id, list);
    }
    return map;
  }, [categories]);

  const renderLevel = (parentId: string | null, depth: number): React.ReactNode => {
    const children = byParent.get(parentId);
    if (!children || children.length === 0) return null;

    return (
      <ul className={depth > 0 ? 'ml-3 border-l pl-1' : 'space-y-0.5'}>
        {children.map((category) => {
          const hasChildren = (byParent.get(category.id) ?? []).length > 0;
          const isOpen = expanded.has(category.id);
          const isActive = pathname.includes(`/category/${category.slug}`);

          return (
            <li key={category.id}>
              <div
                className={cn(
                  'group flex items-center gap-1 rounded-md pr-1 text-xs transition-colors',
                  isActive
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    aria-label={isOpen ? `Collapse ${category.name}` : `Expand ${category.name}`}
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(category.id)) next.delete(category.id);
                        else next.add(category.id);
                        return next;
                      })
                    }
                    className="flex h-5 w-4 shrink-0 items-center justify-center"
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

                {!collapsed && (
                  <Link
                    href={`/category/${category.slug}`}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1"
                  >
                    {category.color && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{category.name}</span>
                  </Link>
                )}
              </div>
              {isOpen && !collapsed && renderLevel(category.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  return <>{renderLevel(null, 0)}</>;
}
