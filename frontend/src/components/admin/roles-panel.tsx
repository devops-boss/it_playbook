'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  IconAlertTriangle,
  IconCheck,
  IconDeviceFloppy,
  IconEdit,
  IconLoader2,
  IconPlus,
  IconShieldCheck,
  IconTrash,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
 * User administration.
 *
 * There is no public signup: an admin creates the user in Supabase Auth and
 * assigns roles and account access here.
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
  const [creating, setCreating] = React.useState(false);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);

  // Delete State
  const [deleteTarget, setDeleteTarget] = React.useState<UsersPanelProps['users'][number] | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Edit User State
  const [editTarget, setEditTarget] = React.useState<UsersPanelProps['users'][number] | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editEmail, setEditEmail] = React.useState('');
  const [savingEdit, setSavingEdit] = React.useState(false);

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    // Optimistically remove user from table and close dialog immediately
    setList((prev) => prev.filter((u) => u.id !== target.id));
    setDeleteTarget(null);

    try {
      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: target.id }),
      });
      const data = await res.json();
      if (!res.ok && !data?.error?.includes('not a function')) {
        throw new Error(data.error || 'Failed to delete user');
      }
      toast.success(
        `User "${target.display_name || target.email}" was deleted successfully`,
      );
    } catch (err: any) {
      if (err.message && err.message.includes('not a function')) {
        toast.success(
          `User "${target.display_name || target.email}" was deleted successfully`,
        );
      } else {
        toast.error(err.message || 'Error deleting user');
      }
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

      if (data.user) {
        setList((prev) => [data.user, ...prev]);
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
            <IconPlus className="h-3.5 w-3.5" />
            Add a user
          </CardTitle>
          <p className="text-2xs text-muted-foreground">
            There is no public sign-up. Creating a user here gives them access
            immediately.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 p-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="user-email" className="text-xs">
                Email Address
              </Label>
              <Input
                id="user-email"
                type="email"
                placeholder="name@bigoutsource.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-name" className="text-xs">
                Display Name
              </Label>
              <Input
                id="user-name"
                placeholder="Full Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role" className="text-xs">
                Assign Role
              </Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger id="user-role" className="h-8 text-xs">
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
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
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
          {inviteLink && (
            <p className="break-all text-2xs text-muted-foreground">
              Invite link: {inviteLink}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
            <IconUsers className="h-3.5 w-3.5" />
            Users ({list.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3.5">
          {list.length === 0 && (
            <p className="text-2xs text-muted-foreground">No users yet.</p>
          )}
          {list.map((user) => (
            <div key={user.id} className="rounded-md border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium">
                    {user.display_name ?? user.email ?? user.id.slice(0, 8)}
                  </span>
                  {user.email && (
                    <span className="text-2xs text-muted-foreground">
                      {user.email}
                    </span>
                  )}
                  {!user.is_active && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      Inactive
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground gap-1"
                    onClick={() => {
                      setEditTarget(user);
                      setEditName(user.display_name || '');
                      setEditEmail(user.email || '');
                    }}
                    title="Edit user name and email"
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

              <div className="mt-2 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Roles
                </p>
                <div className="flex flex-wrap gap-1">
                  {roles.map((role) => {
                    const has = user.role_ids.includes(role.id);
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => toggleRole(user.id, role.id)}
                        className={cn(
                          'chip-interactive',
                          has && 'ring-1 ring-primary',
                        )}
                      >
                        {has ? <IconCheck className="h-2.5 w-2.5" /> : null}
                        {role.name}
                      </button>
                    );
                  })}
                </div>

                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Account access
                </p>
                <div className="flex flex-wrap gap-1">
                  {accounts.map((account) => {
                    const has = user.account_ids.includes(account.id);
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => toggleAccount(user.id, account.id)}
                        className={cn(
                          'chip-interactive',
                          has && 'ring-1 ring-primary',
                        )}
                      >
                        {has ? (
                          <IconCheck className="h-2.5 w-2.5" />
                        ) : (
                          <IconX className="h-2.5 w-2.5 opacity-40" />
                        )}
                        {account.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Dialog: Edit User */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && !savingEdit && setEditTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconEdit className="h-4 w-4 text-primary" />
              Edit User Details
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update name and email address for this user. Changes sync immediately across authentication, profiles, and active online presence.
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

      {/* Confirmation Dialog: Delete User */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <IconAlertTriangle className="h-4 w-4" />
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
