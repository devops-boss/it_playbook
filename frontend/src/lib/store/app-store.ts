'use client';

import * as React from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Account, FilterState, SortOption } from '@/types/database';
import { DEFAULT_FILTERS } from '@/lib/data/criteria-core';

interface AppState {
  /** Accounts the user has selected in the top-bar switcher. */
  selectedAccountIds: string[];
  accountMatch: 'any' | 'all' | 'only';
  /** Filters applied to the current results view. */
  filters: FilterState;
  /** The accounts available to the current user. */
  accounts: Account[];
  /** Whether archived accounts are shown in pickers. */
  showArchived: boolean;
  sidebarCollapsed: boolean;

  setAccounts: (accounts: Account[]) => void;
  setSelectedAccountIds: (ids: string[]) => void;
  toggleAccount: (id: string) => void;
  setAccountMatch: (mode: 'any' | 'all' | 'only') => void;
  setShowArchived: (show: boolean) => void;
  toggleSidebar: () => void;

  setQuery: (query: string) => void;
  setCategoryIds: (ids: string[]) => void;
  setIssueTypeIds: (ids: string[]) => void;
  setSeverityIds: (ids: string[]) => void;
  setImpactScopeIds: (ids: string[]) => void;
  setCustomFilter: (fieldId: string, optionIds: string[]) => void;
  setSort: (sort: SortOption) => void;
  setPage: (page: number) => void;
  resetFilters: () => void;
  removeFilter: (key: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      selectedAccountIds: [],
      accountMatch: 'any',
      filters: { ...DEFAULT_FILTERS },
      accounts: [],
      showArchived: false,
      sidebarCollapsed: false,

      setAccounts: (accounts) => set({ accounts }),

      setSelectedAccountIds: (ids) =>
        set((state) => ({
          selectedAccountIds: ids,
          filters: { ...state.filters, accountIds: ids, page: 1 },
        })),

      toggleAccount: (id) => {
        const current = get().selectedAccountIds;
        const next = current.includes(id)
          ? current.filter((a) => a !== id)
          : [...current, id];
        set((state) => ({
          selectedAccountIds: next,
          filters: { ...state.filters, accountIds: next, page: 1 },
        }));
      },

      setAccountMatch: (mode) =>
        set((state) => ({
          accountMatch: mode,
          filters: { ...state.filters, accountMatch: mode, page: 1 },
        })),

      setShowArchived: (showArchived) => set({ showArchived }),

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setQuery: (query) =>
        set((state) => ({
          filters: { ...state.filters, query, page: 1 },
        })),

      setCategoryIds: (categoryIds) =>
        set((state) => ({
          filters: { ...state.filters, categoryIds, page: 1 },
        })),

      setIssueTypeIds: (issueTypeIds) =>
        set((state) => ({
          filters: { ...state.filters, issueTypeIds, page: 1 },
        })),

      setSeverityIds: (severityIds) =>
        set((state) => ({
          filters: { ...state.filters, severityIds, page: 1 },
        })),

      setImpactScopeIds: (impactScopeIds) =>
        set((state) => ({
          filters: { ...state.filters, impactScopeIds, page: 1 },
        })),

      setCustomFilter: (fieldId, optionIds) =>
        set((state) => {
          const custom = { ...state.filters.custom };
          if (optionIds.length === 0) {
            delete custom[fieldId];
          } else {
            custom[fieldId] = optionIds;
          }
          return { filters: { ...state.filters, custom, page: 1 } };
        }),

      setSort: (sort) =>
        set((state) => ({ filters: { ...state.filters, sort, page: 1 } })),

      setPage: (page) => set((state) => ({ filters: { ...state.filters, page } })),

      resetFilters: () =>
        set((state) => ({
          filters: { ...DEFAULT_FILTERS, accountIds: state.filters.accountIds },
          selectedAccountIds: state.filters.accountIds,
        })),

      removeFilter: (key) =>
        set((state) => {
          const filters = { ...state.filters };
          switch (key) {
            case 'query':
              filters.query = '';
              break;
            case 'categoryIds':
              filters.categoryIds = [];
              break;
            case 'issueTypeIds':
              filters.issueTypeIds = [];
              break;
            case 'severityIds':
              filters.severityIds = [];
              break;
            case 'impactScopeIds':
              filters.impactScopeIds = [];
              break;
            case 'accountIds':
              filters.accountIds = [];
              break;
            default:
              if (key.startsWith('custom:')) {
                const fieldId = key.replace('custom:', '');
                const custom = { ...filters.custom };
                delete custom[fieldId];
                filters.custom = custom;
              }
          }
          filters.page = 1;
          return { filters };
        }),
    }),
    {
      name: 'bos-playbook-state',
      storage: createJSONStorage(() => localStorage),
      // Only persist the account selection and theme preference.
      partialize: (state) => ({
        selectedAccountIds: state.selectedAccountIds,
        accountMatch: state.accountMatch,
        showArchived: state.showArchived,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);

/** Count of currently active filters, for the badge on the filter button. */
export function useActiveFilterCount() {
  const filters = useAppStore((s) => s.filters);
  return React.useMemo(() => {
    let count = 0;
    if (filters.query.trim()) count++;
    if (filters.categoryIds.length) count++;
    if (filters.issueTypeIds.length) count++;
    if (filters.severityIds.length) count++;
    if (filters.impactScopeIds.length) count++;
    if (filters.accountIds.length) count++;
    count += Object.values(filters.custom).filter((v) => v.length > 0).length;
    return count;
  }, [filters]);
}
