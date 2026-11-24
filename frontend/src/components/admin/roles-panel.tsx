'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  IconAlertTriangle,
  IconBuilding,
  IconCheck,
  IconDeviceFloppy,
  IconEdit,
  IconFilter,
  IconLoader2,
  IconLock,
  IconPlus,
  IconSearch,
  IconShield,
  IconShieldCheck,
  IconTrash,
  IconUser,
  IconUserCheck,
  IconUserPlus,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { PERMISSION_CATALOG } from '@/lib/data/permissions';
import type { Account, Role, RolePermission } from '@/types/database';

interface RolesPanelProps {
  roles: Role[];
  rolePermissions: RolePermission[];
  accounts: Account[];
}

/**
 * The role and permission matrix.
 *
 * Each cell is a row in `pb_role_permissions`. A role can grant a
 * permission globally or for one specific account, which is how a regional
 * editor can be limited to their own client's content.
 */
export function RolesPanel({ roles, rolePermissions, accounts }: RolesPanelProps) {
  const [permissions, setPermissions] = React.useState(rolePermissions);
  const [saving, setSaving] = React.useState(false);

  const key = (roleId: string, permission: string, accountId: string | null) =>
    `${roleId}:${permission}:${accountId ?? '*'}`;

  const existing = React.useMemo(() => {
    const map = new Map<string, RolePermission>();
    for (const row of permissions) {
      map.set(key(row.role_id, row.permission_name, row.account_id), row);
    }
    return map;
  }, [permissions]);

  const isAllowed = (roleId: string, permission: string, accountId: string | null) => {
    const row = existing.get(key(roleId, permission, accountId));
    return row ? row.allowed : false;
  };

  const toggle = async (
    roleId: string,
    permission: string,
    accountId: string | null,
    next: boolean,
  ) => {
    const k = key(roleId, permission, accountId);
    const supabase = createClient();

    if (existing.has(k)) {
      const { error } = await supabase
        .from('pb_role_permissions')
        .update({ allowed: next })
        .eq('id', existing.get(k)!.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setPermissions(
        permissions.map((row) =>
          key(row.role_id, row.permission_name, row.account_id) === k
            ? { ...row, allowed: next }
            : row,
        ),
      );
    } else {
      const { data, error } = await supabase
        .from('pb_role_permissions')
        .insert({
          role_id: roleId,
          permission_name: permission,
          allowed: next,
          account_id: accountId,
        })
        .select()
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setPermissions([...permissions, data as RolePermission]);
    }
  };

  const groups = React.useMemo(() => {
    const map = new Map<string, typeof PERMISSION_CATALOG[number][]>();
    for (const permission of PERMISSION_CATALOG) {
      const list = map.get(permission.group) ?? [];
      list.push(permission);
      map.set(permission.group, list);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
            <IconShieldCheck className="h-3.5 w-3.5" />
            Permission matrix
          </CardTitle>
          <p className="text-2xs text-muted-foreground">
            Tick a cell to grant that permission. A tick on a role grants it
            everywhere; a tick on an account grants it only there. Both are
            enforced by row level security in the database.
          </p>
        </CardHeader>
        <CardContent className="p-3.5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-2xs">
              <thead>
                <tr>
                  <th className="w-56 border-b px-2 py-1.5 text-left font-medium">
                    Permission
                  </th>
                  {roles.map((role) => (
                    <th
                      key={role.id}
                      className="border-b px-2 py-1.5 text-center font-medium"
                    >
                      {role.name}
                      {role.is_system && (
                        <span className="ml-1 text-[9px] text-muted-foreground">
                          (system)
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(([group, list]) => (
                  <React.Fragment key={group}>
                    <tr>
                      <td
                        colSpan={roles.length + 1}
                        className="bg-muted/40 px-2 py-1 font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {group}
                      </td>
                    </tr>
                    {list.map((permission) => (
                      <tr key={permission.key}>
                        <td className="border-b px-2 py-1.5">{permission.label}</td>
                        {roles.map((role) => (
                          <td
                            key={role.id}
                            className="border-b px-2 py-1.5 text-center"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                toggle(
                                  role.id,
                                  permission.key,
                                  null,
                                  !isAllowed(role.id, permission.key, null),
                                )
                              }
                              aria-label={`${permission.label} for ${role.name}`}
                              aria-pressed={isAllowed(
                                role.id,
                                permission.key,
                                null,
                              )}
                              className={cn(
                                'inline-flex h-4 w-4 items-center justify-center rounded border transition-colors',
                                isAllowed(role.id, permission.key, null)
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-input hover:border-primary/60',
                              )}
                            >
                              {isAllowed(role.id, permission.key, null) && (
                                <IconCheck className="h-3 w-3" />
                              )}
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <Separator className="my-3" />
          <Button
            size="sm"
            className="h-7 gap-1.5 text-2xs"
            onClick={() => {
              setSaving(false);
              toast.success('Permissions are saved as you change them');
            }}
          >
            <IconDeviceFloppy className="h-3 w-3" />
            Permissions save automatically
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium">
            Per-account permission overrides
          </CardTitle>
          <p className="text-2xs text-muted-foreground">
            Grant a role a permission for one client only - useful for regional
            teams who should only edit their own account&apos;s scenarios.
          </p>
        </CardHeader>
        <CardContent className="p-3.5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-2xs">
              <thead>
                <tr>
                  <th className="w-56 border-b px-2 py-1.5 text-left font-medium">
                    Account
                  </th>
                  {roles.map((role) => (
                    <th
                      key={role.id}
                      className="border-b px-2 py-1.5 text-center font-medium"
                    >
                      {role.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="border-b px-2 py-1.5">
                      <span className="flex items-center gap-1.5">
                        {account.accent_color && (
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: account.accent_color }}
                            aria-hidden
                          />
                        )}
                        {account.name}
                      </span>
                    </td>
                    {roles.map((role) => (
                      <td key={role.id} className="border-b px-2 py-1.5 text-center">
                        <span className="text-[10px] text-muted-foreground">
                          {accounts
                            .filter((a) =>
                              isAllowed(role.id, 'edit_any_scenario', a.id),
                            )
                            .length > 0
                            ? 'scoped'
                            : '-'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface UsersPanelProps {
  users: {
    id: string;
    email: string | null;
    display_name: string | null;
    is_active: boolean;
    last_login_at: string | null;
    role_ids: string[];
    account_ids: string[];
  }[];
  roles: Role[];
  accounts: Account[];
  isSuperAdmin?: boolean;
  currentUserId?: string;
}

/**
 * Modern, organized User Administration panel.
 *
 * Provides streamlined user creation, one-click bulk account access,
 * individual account management modal, and clean user lifecycle controls.
 */
export function UsersPanel({
  users,
  roles,
  accounts,
  isSuperAdmin = false,
  currentUserId,
}: UsersPanelProps) {
  const [list, setList] = React.useState(users);
  const [email, setEmail] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [selectedRoleId, setSelectedRoleId] = React.useState<string>(() => roles[0]?.id || '');
  const [grantAllOnCreate, setGrantAllOnCreate] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);

  // User Search & Filter
  const [userSearch, setUserSearch] = React.useState('');

  // Manage Account Access Modal State
  const [managingUser, setManagingUser] = React.useState<UsersPanelProps['users'][number] | null>(null);
  const [modalAccountSearch, setModalAccountSearch] = React.useState('');

  // Delete User State
  const [deleteTarget, setDeleteTarget] = React.useState<UsersPanelProps['users'][number] | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Edit User Details State
  const [editTarget, setEditTarget] = React.useState<UsersPanelProps['users'][number] | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editEmail, setEditEmail] = React.useState('');
  const [savingEdit, setSavingEdit] = React.useState(false);

  // Keep managingUser in sync with list state updates
  const activeManagingUser = React.useMemo(() => {
    if (!managingUser) return null;
    return list.find((u) => u.id === managingUser.id) || managingUser;
  }, [managingUser, list]);

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);

    // Optimistically remove user from table immediately
    setList((prev) => prev.filter((u) => u.id !== target.id));
    setDeleteTarget(null);

    try {
      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: target.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }
      toast.success(
        `User "${target.display_name || target.email}" was deleted successfully`,
      );
    } catch (err: any) {
      toast.error(err.message || 'Error deleting user');
    } finally {
      setDeleting(false);
    }
  };

  const createUser = async () => {
    if (!email.trim() || !email.includes('@')) {
      toast.error('A valid email address is required.');
      return;
    }
    setCreating(true);
    try {
      const chosenRoleId = selectedRoleId || roles[0]?.id;
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim() || email.split('@')[0],
          roleId: chosenRoleId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      let newUser = data.user;
      if (newUser) {
        if (!grantAllOnCreate) {
          // If user explicitly unchecked grant-all, clear accounts
          try {
            const supabase = createClient();
            await supabase.from('pb_user_accounts').delete().eq('user_id', newUser.id);
            newUser = { ...newUser, account_ids: [] };
          } catch {}
        }
        setList((prev) => [newUser, ...prev]);
      }

      const roleName = roles.find((r) => r.id === chosenRoleId)?.name || 'IT Support';
      toast.success(`User "${displayName.trim() || email.trim()}" created with role "${roleName}"`);

      setEmail('');
      setDisplayName('');
    } catch (err: any) {
      toast.error(err.message || 'Error creating user');
    } finally {
      setCreating(false);
    }
  };

  const saveEditUser = async () => {
    if (!editTarget) return;
    if (!editEmail.trim() || !editEmail.includes('@')) {
      toast.error('A valid email address is required');
      return;
    }
    if (!editName.trim()) {
      toast.error('Display name cannot be empty');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editTarget.id,
          displayName: editName.trim(),
          email: editEmail.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      setList((prev) =>
        prev.map((u) =>
          u.id === editTarget.id
            ? { ...u, display_name: editName.trim(), email: editEmail.trim() }
            : u,
        ),
      );

      toast.success(`User updated to "${editName.trim()}" (${editEmail.trim()})`);
      setEditTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Error updating user');
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleRole = async (userId: string, roleId: string) => {
    const supabase = createClient();
    const user = list.find((u) => u.id === userId);
    const has = user?.role_ids.includes(roleId);

    if (has) {
      await supabase
        .from('pb_user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role_id', roleId);
    } else {
      await supabase.from('pb_user_roles').insert({
        user_id: userId,
        role_id: roleId,
      });
    }

    setList(
      list.map((u) =>
        u.id === userId
          ? {
              ...u,
              role_ids: has
                ? u.role_ids.filter((r) => r !== roleId)
                : [...u.role_ids, roleId],
            }
          : u,
      ),
    );
  };

  const toggleAccount = async (userId: string, accountId: string) => {
    const supabase = createClient();
    const user = list.find((u) => u.id === userId);
    const has = user?.account_ids.includes(accountId);

    if (has) {
      await supabase
        .from('pb_user_accounts')
        .delete()
        .eq('user_id', userId)
        .eq('account_id', accountId);
    } else {
      await supabase.from('pb_user_accounts').insert({
        user_id: userId,
        account_id: accountId,
      });
    }

    setList(
      list.map((u) =>
        u.id === userId
          ? {
              ...u,
              account_ids: has
                ? u.account_ids.filter((a) => a !== accountId)
                : [...u.account_ids, accountId],
            }
          : u,
      ),
    );
  };

  const toggleAllAccounts = async (userId: string, grantAll: boolean) => {
    const supabase = createClient();
    try {
      if (grantAll) {
        const inserts = accounts.map((a) => ({
          user_id: userId,
          account_id: a.id,
        }));
        await supabase
          .from('pb_user_accounts')
          .upsert(inserts, { onConflict: 'user_id,account_id' });

        setList((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, account_ids: accounts.map((a) => a.id) }
              : u,
          ),
        );
        toast.success('Granted access to all accounts');
      } else {
        await supabase
          .from('pb_user_accounts')
          .delete()
          .eq('user_id', userId);

        setList((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, account_ids: [] }
              : u,
          ),
        );
        toast.success('Revoked access to all accounts');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update accounts');
    }
  };

  const filteredUsers = React.useMemo(() => {
    if (!userSearch.trim()) return list;
    const q = userSearch.toLowerCase();
    return list.filter((user) => {
      const matchName = user.display_name && user.display_name.toLowerCase().includes(q);
      const matchEmail = user.email && user.email.toLowerCase().includes(q);
      const userRoles = roles.filter((r) => user.role_ids.includes(r.id)).map((r) => r.name.toLowerCase());
      const matchRole = userRoles.some((r) => r.includes(q));
      return matchName || matchEmail || matchRole;
    });
  }, [list, userSearch, roles]);

  const modalFilteredAccounts = React.useMemo(() => {
    if (!modalAccountSearch.trim()) return accounts;
    const q = modalAccountSearch.toLowerCase().trim();
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q)),
    );
  }, [accounts, modalAccountSearch]);

  return (
    <div className="space-y-6">
      {/* 1. Add User Section */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <IconUserPlus className="h-4 w-4 text-primary" />
            Invite or Add Team Member
          </CardTitle>
          <CardDescription className="text-xs">
            Create user credentials with immediate system access, preassigned role, and account authorization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="user-email" className="text-xs font-medium">
                Email Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="user-email"
                type="email"
                placeholder="name@bigoutsource.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8.5 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-name" className="text-xs font-medium">
                Display Name
              </Label>
              <Input
                id="user-name"
                placeholder="Full Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-8.5 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role" className="text-xs font-medium">
                Initial Role
              </Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger id="user-role" className="h-8.5 text-xs">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/50">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={grantAllOnCreate}
                onChange={(e) => setGrantAllOnCreate(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-muted-foreground/40 text-primary accent-primary"
              />
              <span className="text-xs text-muted-foreground">
                Grant access to all client accounts immediately <span className="text-primary font-medium">(Recommended)</span>
              </span>
            </label>

            <Button
              size="sm"
              className="h-8 text-xs font-medium gap-1.5 ml-auto"
              onClick={createUser}
              disabled={creating}
            >
              {creating ? (
                <>
                  <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating user...
                </>
              ) : (
                <>
                  <IconPlus className="h-3.5 w-3.5" />
                  Create user
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2. Team Members Management */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <IconUsers className="h-4 w-4 text-primary" />
                Team Members
                <Badge variant="secondary" className="h-5 px-1.5 text-2xs font-semibold">
                  {list.length}
                </Badge>
              </CardTitle>
              <p className="text-2xs text-muted-foreground mt-0.5">
                Manage roles, toggle security permissions, and scope client account access.
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <IconSearch className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search user, email, or role..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="h-8.5 pl-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {list.length === 0 ? 'No users found.' : `No users match "${userSearch}".`}
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filteredUsers.map((user) => {
                const hasAllAccounts =
                  accounts.length > 0 && accounts.every((a) => user.account_ids.includes(a.id));
                const accountCount = user.account_ids.length;

                // Preview first 2 assigned accounts
                const assignedAccounts = accounts.filter((a) => user.account_ids.includes(a.id));
                const previewAccounts = assignedAccounts.slice(0, 2);
                const remainingAccountsCount = assignedAccounts.length - previewAccounts.length;

                return (
                  <div
                    key={user.id}
                    className="flex flex-col lg:flex-row lg:items-center justify-between p-4 gap-4 transition-colors hover:bg-muted/15"
                  >
                    {/* User Identity */}
                    <div className="flex items-center gap-3 min-w-[220px]">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold ring-1 ring-primary/20">
                        {(user.display_name || user.email || 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground truncate max-w-[180px]">
                            {user.display_name ?? user.email?.split('@')[0]}
                          </span>
                          {user.is_active ? (
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" title="Active" />
                          ) : (
                            <Badge variant="outline" className="h-4 px-1 text-[9px] text-muted-foreground">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        {user.email && (
                          <span className="text-2xs text-muted-foreground truncate max-w-[200px]">
                            {user.email}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Roles Badges */}
                    <div className="flex flex-col gap-1 min-w-[170px]">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Assigned Role
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {roles.map((role) => {
                          const hasRole = user.role_ids.includes(role.id);
                          return (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => toggleRole(user.id, role.id)}
                              className={cn(
                                'inline-flex items-center gap-1 rounded px-2 py-0.5 text-2xs font-medium transition-all cursor-pointer select-none',
                                hasRole
                                  ? 'bg-primary text-primary-foreground shadow-xs'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                              )}
                              title={hasRole ? `Click to remove role ${role.name}` : `Click to assign role ${role.name}`}
                            >
                              {hasRole && <IconCheck className="h-2.5 w-2.5" />}
                              <span>{role.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Account Access Summary & Quick Controls */}
                    <div className="flex flex-col gap-1.5 min-w-[240px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Account Access
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleAllAccounts(user.id, !hasAllAccounts)}
                            className={cn(
                              'text-2xs font-medium hover:underline cursor-pointer select-none',
                              hasAllAccounts
                                ? 'text-muted-foreground hover:text-destructive'
                                : 'text-primary',
                            )}
                          >
                            {hasAllAccounts ? 'Revoke All' : 'Grant All'}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {hasAllAccounts ? (
                          <Badge
                            variant="outline"
                            className="h-6 px-2 text-2xs font-semibold bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                          >
                            ✓ All Accounts ({accounts.length})
                          </Badge>
                        ) : accountCount === 0 ? (
                          <Badge
                            variant="outline"
                            className="h-6 px-2 text-2xs text-muted-foreground bg-muted/40 border-dashed"
                          >
                            No Accounts Assigned
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Badge
                              variant="outline"
                              className="h-6 px-2 text-2xs font-semibold bg-primary/10 text-primary border-primary/30"
                            >
                              {accountCount} of {accounts.length} Accounts
                            </Badge>
                            {previewAccounts.map((a) => (
                              <span
                                key={a.id}
                                className="hidden sm:inline-block rounded px-1.5 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground border border-border/40"
                              >
                                {a.code}
                              </span>
                            ))}
                            {remainingAccountsCount > 0 && (
                              <span className="hidden sm:inline-block text-[10px] text-muted-foreground">
                                +{remainingAccountsCount}
                              </span>
                            )}
                          </div>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-2xs gap-1 border-border/60 hover:border-primary/40"
                          onClick={() => {
                            setManagingUser(user);
                            setModalAccountSearch('');
                          }}
                        >
                          <IconBuilding className="h-3 w-3 text-muted-foreground" />
                          <span>Manage</span>
                        </Button>
                      </div>
                    </div>

                    {/* Actions (Edit / Delete) */}
                    <div className="flex items-center gap-1 lg:justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground gap-1"
                        onClick={() => {
                          setEditTarget(user);
                          setEditName(user.display_name || '');
                          setEditEmail(user.email || '');
                        }}
                        title="Edit name and email"
                      >
                        <IconEdit className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </Button>

                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-2xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
                          onClick={() => setDeleteTarget(user)}
                          disabled={user.id === currentUserId}
                          title={
                            user.id === currentUserId
                              ? 'You cannot delete your own account'
                              : 'Delete user account'
                          }
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Modal Dialog: Manage Account Access */}
      <Dialog
        open={!!activeManagingUser}
        onOpenChange={(open) => !open && setManagingUser(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <IconBuilding className="h-4.5 w-4.5 text-primary" />
              Manage Account Access
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure authorized client accounts for{' '}
              <strong className="text-foreground">
                {activeManagingUser?.display_name || activeManagingUser?.email}
              </strong>
              . This user will only be able to view and execute incident playbooks for selected accounts.
            </DialogDescription>
          </DialogHeader>

          {activeManagingUser && (
            <div className="flex flex-col gap-3 py-2 flex-1 overflow-hidden">
              {/* Search & Bulk Select Toolbar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <div className="relative w-full sm:w-64">
                  <IconSearch className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search accounts..."
                    value={modalAccountSearch}
                    onChange={(e) => setModalAccountSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-2xs font-medium"
                    onClick={() => toggleAllAccounts(activeManagingUser.id, true)}
                  >
                    Select All ({accounts.length})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-2xs font-medium text-destructive hover:bg-destructive/10"
                    onClick={() => toggleAllAccounts(activeManagingUser.id, false)}
                    disabled={activeManagingUser.account_ids.length === 0}
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              {/* Status Header */}
              <div className="flex items-center justify-between text-2xs px-1 text-muted-foreground border-b pb-1.5">
                <span>
                  Authorized for{' '}
                  <strong className="text-foreground">
                    {activeManagingUser.account_ids.length}
                  </strong>{' '}
                  of {accounts.length} client accounts
                </span>
                {activeManagingUser.account_ids.length === accounts.length && (
                  <span className="text-emerald-500 font-semibold flex items-center gap-1">
                    <IconCheck className="h-3 w-3" /> Full Organization Access
                  </span>
                )}
              </div>

              {/* Account Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 overflow-y-auto max-h-[48vh] pr-1 py-1">
                {modalFilteredAccounts.map((account) => {
                  const isAssigned = activeManagingUser.account_ids.includes(account.id);
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => toggleAccount(activeManagingUser.id, account.id)}
                      className={cn(
                        'flex items-center justify-between p-2.5 rounded-lg border text-left transition-all cursor-pointer select-none',
                        isAssigned
                          ? 'border-primary/50 bg-primary/5 text-foreground shadow-xs ring-1 ring-primary/20'
                          : 'border-border/60 bg-card/60 text-muted-foreground hover:border-border hover:bg-muted/30',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                          style={{
                            backgroundColor: account.accent_color ? `${account.accent_color}25` : '#6366f125',
                            color: account.accent_color || '#6366f1',
                          }}
                        >
                          {account.code.slice(0, 3)}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium truncate text-foreground">
                            {account.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {account.code}
                          </span>
                        </div>
                      </div>

                      <div
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          isAssigned
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/30 bg-transparent',
                        )}
                      >
                        {isAssigned && <IconCheck className="h-3 w-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
                {modalFilteredAccounts.length === 0 && (
                  <div className="col-span-full py-8 text-center text-xs text-muted-foreground">
                    No accounts match &quot;{modalAccountSearch}&quot;
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 border-t mt-auto">
            <Button
              type="button"
              size="sm"
              className="text-xs font-semibold px-4"
              onClick={() => setManagingUser(null)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Modal Dialog: Edit User Details */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && !savingEdit && setEditTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <IconEdit className="h-4 w-4 text-primary" />
              Edit Team Member
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update name and email address. Changes take effect across active sessions immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-xs">
                Display Name
              </Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Full Name"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email" className="text-xs">
                Email Address
              </Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="user@bigoutsource.com"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditTarget(null)}
              disabled={savingEdit}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveEditUser}
              disabled={savingEdit}
              className="gap-1.5 text-xs font-semibold"
            >
              {savingEdit ? (
                <>
                  <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <IconCheck className="h-3.5 w-3.5" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Confirmation Dialog: Delete User */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive text-base font-semibold">
              <IconAlertTriangle className="h-4.5 w-4.5" />
              Delete User Account
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-foreground">
                {deleteTarget?.display_name || deleteTarget?.email}
              </strong>{' '}
              ({deleteTarget?.email})? This will immediately revoke all their permissions and system access.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDeleteUser}
              disabled={deleting}
              className="gap-1.5 text-xs font-semibold"
            >
              {deleting ? (
                <>
                  <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <IconTrash className="h-3.5 w-3.5" />
                  Confirm Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
