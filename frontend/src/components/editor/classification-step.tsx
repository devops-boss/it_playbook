'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  IconAlertCircle,
  IconBuildingSkyscraper,
  IconCheck,
  IconChevronDown,
  IconFolders,
  IconGlobe,
  IconPlus,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from './rich-text-editor';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type {
  Account,
  Category,
  CriteriaField,
  CriteriaOption,
} from '@/types/database';

export interface ClassificationValue {
  /** System criteria stored as columns on the scenario row. */
  system: Record<string, string | null>;
  /** Custom criteria, keyed by field id. */
  custom: Record<string, string[]>;
}

interface ClassificationStepProps {
  fields: CriteriaField[];
  optionsByField: Record<string, CriteriaOption[]>;
  categories: Category[];
  accounts: Account[];
  value: ClassificationValue;
  onChange: (value: ClassificationValue) => void;
  title?: string;
  onTitleChange?: (title: string) => void;
  summary?: string;
  onSummaryChange?: (summary: string) => void;
  quickFix?: string;
  onQuickFixChange?: (quickFix: string) => void;
  tags?: string[];
  onTagsChange?: (tags: string[]) => void;
  /** Whether the scenario applies universally to all accounts */
  isGlobal?: boolean;
  /** Callback to update is_global */
  onToggleGlobal?: (isGlobal: boolean) => void;
  /** Multiple selected account IDs */
  selectedAccountIds?: string[];
  /** Callback for multi-account selection */
  onSelectedAccountIdsChange?: (accountIds: string[]) => void;
  /** The account the scenario belongs to (locks the account field). */
  lockedAccountId?: string | null;
}

const SYSTEM_KEY_TO_COLUMN: Record<string, string> = {
  account: 'account_id',
  category: 'category_id',
  issue_type: 'issue_type_id',
  severity: 'severity_id',
  impact_scope: 'impact_scope_id',
};

const EXCLUDED_KEYS = new Set([
  'site',
  'platform',
  'vendor',
  'work_setup',
  'frequency',
  'account',
  'category',
]);

/**
 * Clean, organized, enterprise-grade Playbook Setup & Scope.
 */
export function ClassificationStep({
  fields,
  optionsByField,
  categories,
  accounts,
  value,
  onChange,
  title,
  onTitleChange,
  summary,
  onSummaryChange,
  quickFix,
  onQuickFixChange,
  tags = [],
  onTagsChange,
  isGlobal = false,
  onToggleGlobal,
  selectedAccountIds = [],
  onSelectedAccountIdsChange,
}: ClassificationStepProps) {
  const [newCategory, setNewCategory] = React.useState('');
  const [accountSearch, setAccountSearch] = React.useState('');
  const [categorySearch, setCategorySearch] = React.useState('');
  const [showCreateCategory, setShowCreateCategory] = React.useState(false);
  const [newTagInput, setNewTagInput] = React.useState('');
  const [accountDropdownOpen, setAccountDropdownOpen] = React.useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = React.useState(false);

  // System triage fields
  const issueTypeField = fields.find((f) => f.key === 'issue_type');
  const severityField = fields.find((f) => f.key === 'severity');
  const impactScopeField = fields.find((f) => f.key === 'impact_scope');

  const issueTypeOptions =
    (issueTypeField ? optionsByField[issueTypeField.id] : [])?.filter((o) => o.is_active) ?? [];
  const severityOptions =
    (severityField ? optionsByField[severityField.id] : [])?.filter((o) => o.is_active) ?? [];
  const impactScopeOptions =
    (impactScopeField ? optionsByField[impactScopeField.id] : [])?.filter((o) => o.is_active) ?? [];

  // Custom fields beyond standard ones (if any exist)
  const customFields = React.useMemo(
    () =>
      fields
        .filter(
          (f) =>
            f.is_active &&
            !EXCLUDED_KEYS.has(f.key) &&
            !['issue_type', 'severity', 'impact_scope'].includes(f.key),
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [fields],
  );

  const getSystemValue = (key: string) => value.system[key] ?? null;
  const getCustomValue = (fieldId: string) => value.custom[fieldId] ?? [];

  const setSystemValue = (key: string, optionId: string | null) => {
    onChange({ ...value, system: { ...value.system, [key]: optionId } });
  };

  const setFreeText = (fieldId: string, text: string) => {
    const custom = { ...value.custom };
    if (!text.trim()) delete custom[fieldId];
    else custom[fieldId] = [text.trim()];
    onChange({ ...value, custom });
  };

  const createCategory = async (customName?: string) => {
    const name = (customName ?? newCategory).trim();
    if (!name) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from('pb_categories')
      .insert({
        name,
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36).slice(-4)}`,
        color: '#288FC2',
        sort_order: 999,
        is_active: true,
        is_global: true,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }

    setSystemValue('category', data.id);
    setNewCategory('');
    setShowCreateCategory(false);
    setCategoryDropdownOpen(false);
    toast.success(`Category "${name}" created and assigned`);
  };

  // Completeness checklist
  const missing = React.useMemo(() => {
    const list: { label: string; key: string }[] = [];

    if (title !== undefined && (!title || !title.trim())) {
      list.push({ label: 'Title', key: 'title' });
    }

    const hasAccount = isGlobal || selectedAccountIds.length > 0 || Boolean(getSystemValue('account'));
    if (!hasAccount) {
      list.push({ label: 'Account Scope', key: 'account' });
    }

    if (!getSystemValue('category')) {
      list.push({ label: 'Category', key: 'category' });
    }

    if (quickFix !== undefined && (!quickFix || !quickFix.trim())) {
      list.push({ label: 'Quick Fix', key: 'quick_fix' });
    }

    if (summary !== undefined && (!summary || !summary.trim())) {
      list.push({ label: 'Summary', key: 'summary' });
    }

    return list;
  }, [value, isGlobal, selectedAccountIds, title, quickFix, summary]);

  // Filtered accounts based on search
  const filteredAccounts = React.useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q),
    );
  }, [accounts, accountSearch]);

  // Categorize categories into root and grouped subcategories
  const { rootCategories, subcategoriesByParent, allMatchingCategories } = React.useMemo(() => {
    const root = categories.filter((c) => !c.parent_id);
    const subByParent: Record<string, Category[]> = {};
    for (const c of categories) {
      if (c.parent_id) {
        (subByParent[c.parent_id] ??= []).push(c);
      }
    }

    const q = categorySearch.trim().toLowerCase();
    const matching = q
      ? categories.filter((c) => {
          if (c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)) return true;
          if (c.parent_id) {
            const parent = categories.find((p) => p.id === c.parent_id);
            if (parent?.name.toLowerCase().includes(q)) return true;
          }
          return false;
        })
      : categories;

    return {
      rootCategories: root,
      subcategoriesByParent: subByParent,
      allMatchingCategories: matching,
    };
  }, [categories, categorySearch]);

  const selectedCategory = categories.find((c) => c.id === getSystemValue('category'));
  const selectedCategoryParent = selectedCategory?.parent_id
    ? categories.find((p) => p.id === selectedCategory.parent_id)
    : null;

  const handleToggleAccount = (accountId: string) => {
    onToggleGlobal?.(false);
    const current = [...selectedAccountIds];
    const next = current.includes(accountId)
      ? current.filter((id) => id !== accountId)
      : [...current, accountId];

    onSelectedAccountIdsChange?.(next);
    setSystemValue('account', next[0] ?? null);
  };

  const handleSelectAllAccounts = () => {
    onToggleGlobal?.(true);
    onSelectedAccountIdsChange?.([]);
    setSystemValue('account', null);
  };

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Card 1: Primary Playbook Information & Scope                      */}
      {/* ------------------------------------------------------------------ */}
      <Card className="border border-border/70 shadow-xs">
        <CardHeader className="pb-3 pt-4 px-4 sm:px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              General Setup & Scope
            </CardTitle>
            <span className="text-2xs text-muted-foreground font-mono">Step 1 of 10</span>
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-5 pb-5 pt-0 space-y-4">
          {/* Playbook Title */}
          {onTitleChange && (
            <div className="space-y-1.5">
              <Label htmlFor="sc-title" className="text-xs font-semibold text-foreground">
                Playbook Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sc-title"
                value={title ?? ''}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="e.g. Internet Down - Primary ISP Failover Procedure"
                className="h-9 text-xs sm:text-sm font-medium tracking-tight bg-background"
              />
            </div>
          )}

          {/* 2-Column: Account Scope (Left) & Problem Category (Right) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Account Scope */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <IconBuildingSkyscraper className="h-3.5 w-3.5 text-muted-foreground" />
                Applicable Account(s) <span className="text-destructive">*</span>
              </Label>
              {renderAccountControl()}
            </div>

            {/* Problem Category */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <IconFolders className="h-3.5 w-3.5 text-muted-foreground" />
                Problem Category <span className="text-destructive">*</span>
              </Label>
              {renderCategoryControl()}
            </div>
          </div>

          {/* 3-Column: Issue Type, Severity, Impact Scope */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border/50">
            {/* Issue Type */}
            <div className="space-y-1.5">
              <Label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Issue Type
              </Label>
              <Select
                value={getSystemValue('issue_type') ?? '__none__'}
                onValueChange={(val) => setSystemValue('issue_type', val === '__none__' ? null : val)}
              >
                <SelectTrigger className="h-9 text-xs bg-background">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs text-muted-foreground">
                    None / Unspecified
                  </SelectItem>
                  {issueTypeOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: opt.color ?? '#64748b' }}
                        />
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Severity */}
            <div className="space-y-1.5">
              <Label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Severity
              </Label>
              <Select
                value={getSystemValue('severity') ?? '__none__'}
                onValueChange={(val) => setSystemValue('severity', val === '__none__' ? null : val)}
              >
                <SelectTrigger className="h-9 text-xs bg-background">
                  <SelectValue placeholder="Select severity..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs text-muted-foreground">
                    None / Unspecified
                  </SelectItem>
                  {severityOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: opt.color ?? '#64748b' }}
                        />
                        <span className="font-medium">{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Impact Scope */}
            <div className="space-y-1.5">
              <Label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                Impact Scope
              </Label>
              <Select
                value={getSystemValue('impact_scope') ?? '__none__'}
                onValueChange={(val) => setSystemValue('impact_scope', val === '__none__' ? null : val)}
              >
                <SelectTrigger className="h-9 text-xs bg-background">
                  <SelectValue placeholder="Select impact..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs text-muted-foreground">
                    None / Unspecified
                  </SelectItem>
                  {impactScopeOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: opt.color ?? '#64748b' }}
                        />
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Any remaining custom fields (if configured in settings) */}
          {customFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
              {customFields.map((field) => (
                <div key={field.id} className="space-y-1">
                  <Label className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {field.label}
                  </Label>
                  <Input
                    value={getCustomValue(field.id)[0] ?? ''}
                    onChange={(e) => setFreeText(field.id, e.target.value)}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    className="h-8 text-xs bg-background"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Card 2: Quick Fix & Triage Summary                                */}
      {/* ------------------------------------------------------------------ */}
      {(onQuickFixChange || onSummaryChange) && (
        <Card className="border border-border/70 shadow-xs">
          <CardHeader className="pb-2.5 pt-4 px-4 sm:px-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#E07E3C]" />
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Quick Fix & Triage Summary
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] text-[#E07E3C] border-[#E07E3C]/30 bg-[#E07E3C]/5 font-medium">
                Quick Mode Action
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-5 pb-5 pt-0 space-y-4">
            {onQuickFixChange && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sc-quickfix" className="text-xs font-semibold text-foreground">
                    Quick Fix (Immediate Action) <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-[11px] text-muted-foreground">The first action or command to attempt</span>
                </div>
                <RichTextEditor
                  value={quickFix ?? ''}
                  onChange={(v) => onQuickFixChange(v)}
                  placeholder="e.g. Switch router gateway to secondary failover line (WAN2) and power cycle fiber ONT..."
                  minHeight={90}
                />
              </div>
            )}

            {onSummaryChange && (
              <div className="space-y-1.5">
                <Label htmlFor="sc-summary" className="text-xs font-semibold text-foreground">
                  Summary / One-liner <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="sc-summary"
                  value={summary ?? ''}
                  onChange={(e) => onSummaryChange(e.target.value)}
                  placeholder="One-sentence description shown in search results and ticket quick matching."
                  rows={2}
                  className="text-xs bg-background resize-none"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Card 3: Keywords & Search Tags                                    */}
      {/* ------------------------------------------------------------------ */}
      {onTagsChange && (
        <Card className="border border-border/70 shadow-xs">
          <CardHeader className="pb-2.5 pt-4 px-4 sm:px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Keywords & Search Tags
              </CardTitle>
              <span className="text-2xs text-muted-foreground">Helps technicians find this playbook in search</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-5 pb-5 pt-0 space-y-2.5">
            <div className="flex flex-wrap gap-1.5 min-h-6">
              {(tags ?? []).map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 text-2xs py-0.5 px-2 font-normal">
                  {tag}
                  <button
                    type="button"
                    onClick={() => onTagsChange((tags ?? []).filter((t) => t !== tag))}
                    className="hover:text-destructive ml-0.5 opacity-70 hover:opacity-100"
                  >
                    ×
                  </button>
                </Badge>
              ))}
              {(tags ?? []).length === 0 && (
                <span className="text-2xs text-muted-foreground italic">No search tags added yet.</span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTagInput.trim()) {
                    e.preventDefault();
                    onTagsChange([...new Set([...(tags ?? []), newTagInput.trim().toLowerCase()])]);
                    setNewTagInput('');
                  }
                }}
                placeholder="Add keyword (e.g. wifi, vpn, cisco, failover) and press Enter..."
                className="h-8 text-xs flex-1 bg-background"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 text-xs shrink-0"
                onClick={() => {
                  if (!newTagInput.trim()) return;
                  onTagsChange([...new Set([...(tags ?? []), newTagInput.trim().toLowerCase()])]);
                  setNewTagInput('');
                }}
              >
                Add Tag
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Bottom Status Notice                                              */}
      {/* ------------------------------------------------------------------ */}
      {missing.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3.5 py-2 text-xs text-amber-800 dark:text-amber-400">
          <IconAlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="text-2xs">
            Required before publishing: <strong>{missing.map((m) => m.label).join(', ')}</strong>
          </span>
        </div>
      )}
    </div>
  );

  function renderAccountControl() {
    return (
      <div className="space-y-1.5">
        <Popover open={accountDropdownOpen} onOpenChange={setAccountDropdownOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between h-9 px-3 text-xs font-normal border-input bg-background hover:bg-accent/40"
            >
              <div className="flex items-center gap-2 truncate">
                {isGlobal ? (
                  <>
                    <IconGlobe className="h-3.5 w-3.5 text-[#288FC2] shrink-0" />
                    <span className="font-semibold text-[#288FC2] dark:text-[#56b0e8] truncate">
                      All 26 Accounts (Global SOP)
                    </span>
                  </>
                ) : selectedAccountIds.length > 0 ? (
                  <>
                    <IconBuildingSkyscraper className="h-3.5 w-3.5 text-[#233B74] shrink-0" />
                    <span className="font-semibold text-foreground truncate">
                      {selectedAccountIds.length === 1 ? (
                        (() => {
                          const acct = accounts.find((a) => a.id === selectedAccountIds[0]);
                          return acct ? `[${acct.code}] ${acct.name}` : '1 Account Selected';
                        })()
                      ) : (
                        `${selectedAccountIds.length} Accounts Selected`
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <IconBuildingSkyscraper className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Select target account(s)...</span>
                  </>
                )}
              </div>
              <IconChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1.5" />
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-[340px] sm:w-[420px] p-0 shadow-lg" align="start">
            {/* Search Input */}
            <div className="flex items-center gap-2 border-b p-2">
              <IconSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
              <Input
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Search accounts by name or code..."
                className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 px-1"
              />
              {accountSearch && (
                <button
                  type="button"
                  onClick={() => setAccountSearch('')}
                  className="text-muted-foreground hover:text-foreground mr-1"
                >
                  <IconX className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Option 1: Applicable to All Accounts */}
            <div className="p-1.5 border-b bg-muted/20">
              <label className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer transition-colors">
                <Checkbox
                  checked={isGlobal}
                  onCheckedChange={handleSelectAllAccounts}
                />
                <IconGlobe className="h-3.5 w-3.5 text-[#288FC2] shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-foreground">
                    Applicable to All Accounts (Global SOP)
                  </span>
                </div>
              </label>
            </div>

            {/* Option 2: Account Multi-Selection List */}
            <div className="p-1.5">
              <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                <span>Client Accounts ({accounts.length})</span>
                {selectedAccountIds.length > 0 && !isGlobal && (
                  <button
                    type="button"
                    onClick={() => onSelectedAccountIdsChange?.([])}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Deselect all ({selectedAccountIds.length})
                  </button>
                )}
              </div>

              <div className="max-h-52 overflow-y-auto space-y-0.5 p-0.5 pr-1.5">
                {filteredAccounts.map((account) => {
                  const isChecked = !isGlobal && selectedAccountIds.includes(account.id);
                  return (
                    <label
                      key={account.id}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-xs transition-colors',
                        isChecked && 'bg-accent/60 font-medium',
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleToggleAccount(account.id)}
                      />
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: account.accent_color ?? '#64748b' }}
                      />
                      <span className="font-mono text-[10px] text-muted-foreground uppercase shrink-0">
                        [{account.code}]
                      </span>
                      <span className="truncate flex-1 text-foreground">{account.name}</span>
                    </label>
                  );
                })}

                {filteredAccounts.length === 0 && (
                  <p className="p-3 text-center text-2xs text-muted-foreground">
                    No accounts match &ldquo;{accountSearch}&rdquo;.
                  </p>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Selected Account Chips */}
        {isGlobal ? (
          <div className="flex items-center gap-1.5 pt-0.5 text-2xs text-[#288FC2] font-medium">
            <IconGlobe className="h-3.5 w-3.5 shrink-0" />
            <span>Universal: Available across all client accounts</span>
          </div>
        ) : selectedAccountIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {selectedAccountIds.map((accId) => {
              const acct = accounts.find((a) => a.id === accId);
              if (!acct) return null;
              return (
                <Badge
                  key={acct.id}
                  variant="outline"
                  className="gap-1 py-0 px-1.5 text-[11px] font-medium h-5"
                  style={{
                    borderColor: `${acct.accent_color ?? '#233B74'}50`,
                    backgroundColor: `${acct.accent_color ?? '#233B74'}10`,
                    color: acct.accent_color ?? '#233B74',
                  }}
                >
                  <span>[{acct.code}] {acct.name}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleAccount(acct.id)}
                    className="hover:text-destructive ml-0.5"
                  >
                    <IconX className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  function renderCategoryControl() {
    return (
      <div className="space-y-1.5">
        <Popover open={categoryDropdownOpen} onOpenChange={setCategoryDropdownOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between h-9 px-3 text-xs font-normal border-input bg-background hover:bg-accent/40"
            >
              <div className="flex items-center gap-2 truncate">
                <IconFolders className="h-3.5 w-3.5 text-primary shrink-0" />
                {selectedCategory ? (
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: selectedCategory.color ?? '#288FC2' }}
                    />
                    {selectedCategoryParent && (
                      <span className="text-muted-foreground text-xs">
                        {selectedCategoryParent.name} &gt;
                      </span>
                    )}
                    <span className="font-semibold text-foreground">
                      {selectedCategory.name}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Select category...</span>
                )}
              </div>
              <IconChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1.5" />
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-[340px] sm:w-[420px] p-0 shadow-lg" align="start">
            {/* Category Search Input */}
            <div className="flex items-center gap-2 border-b p-2">
              <IconSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
              <Input
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Search categories (e.g. VPN, Teams, Wi-Fi)..."
                className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 px-1"
              />
              {categorySearch && (
                <button
                  type="button"
                  onClick={() => setCategorySearch('')}
                  className="text-muted-foreground hover:text-foreground mr-1"
                >
                  <IconX className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Category List */}
            <div className="max-h-56 overflow-y-auto p-1.5 pr-2">
              {categorySearch.trim() ? (
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase px-2">
                    Matching ({allMatchingCategories.length})
                  </span>
                  {allMatchingCategories.map((cat) => {
                    const isSelected = getSystemValue('category') === cat.id;
                    const parent = cat.parent_id
                      ? categories.find((p) => p.id === cat.parent_id)
                      : null;

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSystemValue('category', cat.id);
                          setCategoryDropdownOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent text-left text-xs transition-colors',
                          isSelected && 'bg-primary/10 text-primary font-semibold',
                        )}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color ?? '#64748b' }}
                          />
                          {parent && (
                            <span className="text-[10px] text-muted-foreground">
                              {parent.name} &gt;
                            </span>
                          )}
                          <span className="truncate">{cat.name}</span>
                        </div>
                        {isSelected && <IconCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}

                  {allMatchingCategories.length === 0 && (
                    <div className="p-3 text-center text-2xs text-muted-foreground">
                      No category matches &ldquo;{categorySearch}&rdquo;.
                    </div>
                  )}
                </div>
              ) : (
                rootCategories.map((root) => {
                  const isRootSelected = getSystemValue('category') === root.id;
                  const subcategories = subcategoriesByParent[root.id] ?? [];

                  return (
                    <div key={root.id} className="mb-1.5 last:mb-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSystemValue('category', root.id);
                          setCategoryDropdownOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center justify-between px-2 py-1 rounded hover:bg-accent text-left text-xs font-semibold transition-colors',
                          isRootSelected && 'bg-primary/10 text-primary',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: root.color ?? '#233B74' }}
                          />
                          <span>{root.name}</span>
                        </div>
                        {isRootSelected && <IconCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </button>

                      {subcategories.length > 0 && (
                        <div className="ml-3 mt-0.5 space-y-0.5 border-l-2 border-border/50 pl-2">
                          {subcategories.map((sub) => {
                            const isSubSelected = getSystemValue('category') === sub.id;
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => {
                                  setSystemValue('category', sub.id);
                                  setCategoryDropdownOpen(false);
                                }}
                                className={cn(
                                  'w-full flex items-center justify-between px-2 py-1 rounded hover:bg-accent text-left text-xs transition-colors',
                                  isSubSelected && 'bg-primary/10 text-primary font-semibold',
                                )}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: sub.color ?? root.color ?? '#64748b' }}
                                  />
                                  <span className="truncate">{sub.name}</span>
                                </div>
                                {isSubSelected && <IconCheck className="h-3 w-3 text-primary shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom: Inline Add Category */}
            <div className="p-2 border-t bg-muted/20">
              {!showCreateCategory ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 gap-1 text-2xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCreateCategory(true)}
                >
                  <IconPlus className="h-3 w-3" />
                  Add new category
                </Button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void createCategory();
                      }
                    }}
                    placeholder="New category name..."
                    className="h-7 text-xs bg-background"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 shrink-0 text-2xs"
                    onClick={() => void createCategory()}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-2xs"
                    onClick={() => setShowCreateCategory(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Selected Category Breadcrumb */}
        {selectedCategory && (
          <div className="flex items-center gap-1.5 pt-0.5 text-2xs text-muted-foreground">
            <span>Category:</span>
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: selectedCategory.color ?? '#288FC2' }}
              />
              {selectedCategoryParent ? `${selectedCategoryParent.name} > ` : ''}
              {selectedCategory.name}
            </span>
          </div>
        )}
      </div>
    );
  }
}
