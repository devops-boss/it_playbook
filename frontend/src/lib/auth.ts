import { createClient } from '@/lib/supabase/server';
import { throwOnFirstError, toUpstreamError } from '@/lib/api-error';
import type { Account } from '@/types/database';

/** A permission the current user holds, optionally scoped to an account. */
export interface PermissionSet {
  /** Permission names granted globally (account_id IS NULL). */
  global: Set<string>;
  /** Permission names granted per account. */
  byAccount: Map<string, Set<string>>;
}

export interface CurrentUser {
  id: string;
  email: string | null;
  displayName: string;
  photoUrl: string | null;
  isSuperAdmin: boolean;
  permissions: PermissionSet;
  /** Accounts the user has been granted access to. */
  accountIds: string[];
  roleNames: string[];
}

/**
 * Load the signed-in user together with their roles, permissions and the
 * accounts they can reach.
 *
 * The service-role key is never used: everything is read through the
 * anon key with the user's own session, so RLS applies.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [rolesResult, permResult, accountResult, profileResult] = await Promise.all([
    supabase
      .from('pb_user_roles')
      .select('role_id, pb_roles!inner(name, is_system)')
      .eq('user_id', user.id),
    supabase.from('pb_role_permissions').select('role_id, permission_name, allowed, account_id'),
    supabase.from('pb_user_accounts').select('account_id').eq('user_id', user.id),
    supabase.from('pb_user_profiles').select('*').eq('id', user.id).maybeSingle(),
  ]);

  // These four decide what the person is allowed to see and do, so a failed
  // read must not be mistaken for "no roles" and "no permissions".
  throwOnFirstError([rolesResult, permResult, accountResult, profileResult]);

  const rolesRows = rolesResult.data ?? [];
  const permRows = permResult.data ?? [];
  const accountRows = accountResult.data ?? [];
  const profile = profileResult.data;

  const roleIds = new Set(rolesRows.map((r) => r.role_id as string));
  const roleNames = rolesRows
    .map((r) => {
      const role = r.pb_roles as unknown as { name?: string } | { name?: string }[] | null;
      if (!role) return null;
      if (Array.isArray(role)) return role[0]?.name ?? null;
      return role.name ?? null;
    })
    .filter((n): n is string => Boolean(n));

  const global = new Set<string>();
  const byAccount = new Map<string, Set<string>>();
  for (const p of permRows) {
    if (!p.allowed) continue;
    if (!roleIds.has(p.role_id as string)) continue;
    if (p.account_id) {
      const set = byAccount.get(p.account_id as string) ?? new Set<string>();
      set.add(p.permission_name);
      byAccount.set(p.account_id as string, set);
    } else {
      global.add(p.permission_name);
    }
  }

  const accountIds = accountRows.map((a) => a.account_id as string);

  return {
    id: user.id,
    email: user.email ?? null,
    displayName:
      (profile as { display_name?: string | null } | null)?.display_name ??
      user.email?.split('@')[0] ??
      'User',
    photoUrl: (profile as { photo_url?: string | null } | null)?.photo_url ?? null,
    isSuperAdmin:
      roleNames.includes('Admin') ||
      roleNames.includes('Super Admin') ||
      (profile as { role?: string | null } | null)?.role === 'Admin',
    permissions: { global, byAccount },
    accountIds,
    roleNames,
  };
}

/** Does the user hold a permission (globally or for the given account)? */
export function can(
  user: CurrentUser | null,
  permission: string,
  accountId?: string | null,
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (user.permissions.global.has(permission)) return true;
  if (accountId) {
    return user.permissions.byAccount.get(accountId)?.has(permission) ?? false;
  }
  return false;
}

/** Accounts visible to the user, filtered by their access grants. */
export async function getAccessibleAccounts(user: CurrentUser | null): Promise<Account[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('pb_accounts').select('*').order('name');
  if (error) throw toUpstreamError(error);

  const accounts = (data ?? []) as Account[];
  if (!user || user.isSuperAdmin || user.accountIds.length === 0) return accounts;

  // Super Admin sees everything; everyone else sees their assigned accounts
  // plus global accounts.
  return accounts.filter(
    (a) => a.is_global || user.accountIds.includes(a.id),
  );
}
