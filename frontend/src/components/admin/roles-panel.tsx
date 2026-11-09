'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  IconCheck,
  IconDeviceFloppy,
  IconPlus,
  IconShieldCheck,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
}

/**
 * User administration.
 *
 * There is no public signup: an admin creates the user in Supabase Auth and
 * assigns roles and account access here.
 */
export function UsersPanel({ users, roles, accounts }: UsersPanelProps) {
  const [list, setList] = React.useState(users);
  const [email, setEmail] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);

  const createUser = async () => {
    if (!email.trim()) {
      toast.error('An email address is required.');
      return;
    }
    setCreating(true);
    const supabase = createClient();

    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim(),
      email_confirm: true,
      user_metadata: { display_name: displayName.trim() || email.split('@')[0] },
    });

    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      await supabase.from('pb_user_profiles').upsert({
        id: userId,
        display_name: displayName.trim() || email.split('@')[0],
        is_active: true,
      });
      await supabase.from('pb_user_roles').insert({
        user_id: userId,
        role_id: roles[0]?.id,
      });
    }

    setEmail('');
    setDisplayName('');
    toast.success('User created');
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="user-email" className="text-xs">
                Email
              </Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-name" className="text-xs">
                Display name
              </Label>
              <Input
                id="user-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={createUser}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create user'}
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
    </div>
  );
}
