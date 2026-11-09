'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconDeviceFloppy,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { checkContrast, cn, slugify } from '@/lib/utils';
import type { Account, AccountStatus, Category } from '@/types/database';

interface AccountWizardProps {
  accounts: Account[];
  categories: Category[];
  /** The account being edited, or null when creating a new one. */
  account?: Account | null;
}

interface WizardState {
  name: string;
  code: string;
  description: string;
  accent_color: string;
  logo_url: string;
  status: AccountStatus;
  is_global: boolean;
  enabledCategoryIds: string[];
  enabledPlatformIds: string[];
  enabledSiteIds: string[];
  tags: string[];
  default_landing_tab: string;
  announcement_banner: string;
  ticket_url_template: string;
  cloneFromId: string | null;
}

const STATUSES: AccountStatus[] = ['Active', 'Onboarding', 'Offboarding', 'Archived'];

const DEFAULT_STATE: WizardState = {
  name: '',
  code: '',
  description: '',
  accent_color: '#0066CC',
  logo_url: '',
  status: 'Active',
  is_global: false,
  enabledCategoryIds: [],
  enabledPlatformIds: [],
  enabledSiteIds: [],
  tags: [],
  default_landing_tab: 'frequent',
  announcement_banner: '',
  ticket_url_template: '',
  cloneFromId: null,
};

/**
 * The Account Setup Wizard.
 *
 * Six steps, each one small and reviewable. The wizard can clone an
 * existing account's setup (categories, platforms, sites, tabs) so a new
 * client starts from a known-good configuration.
 */
export function AccountWizard({ accounts, categories, account }: AccountWizardProps) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [state, setState] = React.useState<WizardState>(DEFAULT_STATE);

  // Seed the form from the account being edited.
  React.useEffect(() => {
    if (account) {
      const settings = (account.settings ?? {}) as Record<string, any>;
      setState({
        name: account.name,
        code: account.code,
        description: account.description ?? '',
        accent_color: account.accent_color ?? '#0066CC',
        logo_url: account.logo_url ?? '',
        status: account.status,
        is_global: account.is_global,
        enabledCategoryIds: settings.enabled_category_ids ?? [],
        enabledPlatformIds: settings.enabled_platform_ids ?? [],
        enabledSiteIds: settings.enabled_site_ids ?? [],
        tags: settings.tags ?? [],
        default_landing_tab: settings.default_landing_tab ?? 'frequent',
        announcement_banner: settings.announcement_banner ?? '',
        ticket_url_template: (account as any).ticket_url_template ?? settings.ticket_url_template ?? '',
        cloneFromId: null,
      });
    } else {
      setState(DEFAULT_STATE);
    }
    setStep(0);
  }, [account]);

  const update = (patch: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  const contrast = checkContrast('#ffffff', state.accent_color);

  const STEPS = [
    { key: 'basics', label: 'Basics' },
    { key: 'branding', label: 'Branding' },
    { key: 'categories', label: 'Categories' },
    { key: 'tools', label: 'Platforms & sites' },
    { key: 'tabs', label: 'Tabs & defaults' },
    { key: 'review', label: 'Review' },
  ];

  const canAdvance = (() => {
    switch (step) {
      case 0:
        return state.name.trim().length > 0 && state.code.trim().length > 0;
      case 1:
        return contrast.passesAA;
      default:
        return true;
    }
  })();

  const applyClone = async (sourceId: string) => {
    if (!sourceId) {
      update({ cloneFromId: null });
      return;
    }
    const source = accounts.find((a) => a.id === sourceId);
    if (!source) return;

    const settings = (source.settings ?? {}) as Record<string, any>;
    update({
      cloneFromId: sourceId,
      enabledCategoryIds: settings.enabled_category_ids ?? state.enabledCategoryIds,
      enabledPlatformIds: settings.enabled_platform_ids ?? state.enabledPlatformIds,
      enabledSiteIds: settings.enabled_site_ids ?? state.enabledSiteIds,
      tags: settings.tags ?? state.tags,
      default_landing_tab: settings.default_landing_tab ?? state.default_landing_tab,
      ticket_url_template: settings.ticket_url_template ?? state.ticket_url_template,
    });
    toast.success(`Setup cloned from ${source.name}`);
  };

  const save = async () => {
    setSaving(true);
    const supabase = createClient();

    const settings = {
      enabled_category_ids: state.enabledCategoryIds,
      enabled_platform_ids: state.enabledPlatformIds,
      enabled_site_ids: state.enabledSiteIds,
      tags: state.tags,
      default_landing_tab: state.default_landing_tab,
      announcement_banner: state.announcement_banner || null,
      ticket_url_template: state.ticket_url_template || null,
      tabs: [
        { key: 'frequent', label: 'Frequent problems' },
        { key: 'anticipated', label: 'Anticipated' },
        { key: 'by_category', label: 'By category' },
        { key: 'critical', label: 'Critical issues' },
        { key: 'all', label: 'All scenarios' },
      ],
    };

    const payload = {
      name: state.name.trim(),
      code: state.code.trim().toUpperCase(),
      description: state.description.trim() || null,
      accent_color: state.accent_color,
      logo_url: state.logo_url.trim() || null,
      status: state.status,
      is_global: state.is_global,
      ticket_url_template: state.ticket_url_template?.trim() || null,
      settings,
    };

    try {
      if (account) {
        const { error } = await supabase
          .from('pb_accounts')
          .update(payload)
          .eq('id', account.id);
        if (error) throw error;
        toast.success('Account updated');
      } else {
        const { data, error } = await supabase
          .from('pb_accounts')
          .insert(payload)
          .select('id, code')
          .single();
        if (error) throw error;
        toast.success('Account created');
        router.push(`/accounts/${data.code}`);
        return;
      }
      router.push(`/accounts/${payload.code}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-base font-semibold tracking-tight">
          {account ? `Edit ${account.name}` : 'New account'}
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {account
            ? 'Update the account configuration. Changes are audit-logged.'
            : 'Set up an account. You can start from an existing account’s configuration.'}
        </p>
      </div>

      {/* Step navigator */}
      <ol className="mb-6 flex items-center gap-1 overflow-x-auto">
        {STEPS.map((s, index) => (
          <li key={s.key} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => index <= step && setStep(index)}
              disabled={index > step}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium transition-colors',
                index === step
                  ? 'bg-primary/10 text-primary'
                  : index < step
                    ? 'text-foreground hover:bg-accent'
                    : 'text-muted-foreground/50',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-[9px]',
                  index < step
                    ? 'bg-primary text-primary-foreground'
                    : index === step
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted',
                )}
              >
                {index < step ? <IconCheck className="h-2.5 w-2.5" /> : index + 1}
              </span>
              {s.label}
            </button>
            {index < STEPS.length - 1 && (
              <span className="h-px w-3 bg-border" aria-hidden />
            )}
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="p-4">
          {/* Step 0: Basics */}
          {step === 0 && (
            <div className="space-y-4">
              {!account && (
                <div className="rounded-md border border-dashed p-3">
                  <Label>Clone setup from an existing account</Label>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    Copies categories, platforms, sites, tags and default tabs.
                  </p>
                  <Select
                    value={state.cloneFromId ?? ''}
                    onValueChange={(v) => void applyClone(v)}
                  >
                    <SelectTrigger className="mt-2 h-9 text-xs">
                      <SelectValue placeholder="Start from scratch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="" className="text-xs">
                        Start from scratch
                      </SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">
                          <span className="flex items-center gap-1.5">
                            <IconCopy className="h-3 w-3" />
                            {a.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-name">Account name</Label>
                  <Input
                    id="acc-name"
                    value={state.name}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="Northwind Logistics"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-code">Code</Label>
                  <Input
                    id="acc-code"
                    value={state.code}
                    onChange={(e) => update({ code: e.target.value.toUpperCase() })}
                    placeholder="NWL"
                    maxLength={12}
                  />
                  <p className="text-2xs text-muted-foreground">
                    Short code used in URLs and ticket references.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="acc-desc">Description</Label>
                <Textarea
                  id="acc-desc"
                  value={state.description}
                  onChange={(e) => update({ description: e.target.value })}
                  rows={2}
                  placeholder="What this account covers and who to contact."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-status">Status</Label>
                  <Select
                    value={state.status}
                    onValueChange={(v) => update({ status: v as AccountStatus })}
                  >
                    <SelectTrigger id="acc-status" className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex cursor-pointer items-start gap-2 pt-6 text-xs">
                  <Checkbox
                    checked={state.is_global}
                    onCheckedChange={(c) => update({ is_global: c === true })}
                  />
                  <span>
                    Global account
                    <span className="block text-2xs text-muted-foreground">
                      Visible to every user, regardless of their access.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Step 1: Branding */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="acc-color">Accent colour</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="acc-color"
                    type="color"
                    value={state.accent_color}
                    onChange={(e) => update({ accent_color: e.target.value })}
                    className="h-9 w-14 cursor-pointer rounded-md border bg-transparent"
                    aria-label="Pick accent colour"
                  />
                  <Input
                    value={state.accent_color}
                    onChange={(e) => update({ accent_color: e.target.value })}
                    className="h-9 w-32 font-mono text-xs"
                    aria-label="Accent colour hex"
                  />
                  <div
                    className="flex h-9 items-center rounded-md px-3 text-xs font-medium"
                    style={{
                      backgroundColor: state.accent_color,
                      color: contrast.passesAA ? '#ffffff' : '#000000',
                    }}
                  >
                    Preview
                  </div>
                </div>
                <p
                  className={cn(
                    'text-2xs',
                    contrast.passesAA ? 'text-muted-foreground' : 'text-destructive',
                  )}
                >
                  Contrast {contrast.ratio}:1 ({contrast.level}).
                  {contrast.passesAA
                    ? ' Meets WCAG AA.'
                    : ' White text on this colour would be unreadable - pick a darker shade.'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="acc-logo">Logo URL</Label>
                <Input
                  id="acc-logo"
                  value={state.logo_url}
                  onChange={(e) => update({ logo_url: e.target.value })}
                  placeholder="/logos/northwind.png"
                />
                <p className="text-2xs text-muted-foreground">
                  Path to an uploaded logo, or an internal URL. Leave empty to use
                  the account code.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Categories */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enabled categories</p>
                  <p className="text-2xs text-muted-foreground">
                    Only these categories are offered when classifying a scenario for
                    this account.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-2xs"
                  onClick={() => update({ enabledCategoryIds: categories.map((c) => c.id) })}
                >
                  Select all
                </Button>
              </div>

              <div className="max-h-80 space-y-0.5 overflow-y-auto rounded-md border p-2">
                {categories.map((category) => {
                  const checked = state.enabledCategoryIds.includes(category.id);
                  return (
                    <label
                      key={category.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          update({
                            enabledCategoryIds: checked
                              ? state.enabledCategoryIds.filter((id) => id !== category.id)
                              : [...state.enabledCategoryIds, category.id],
                          })
                        }
                      />
                      {category.color && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: category.color }}
                          aria-hidden
                        />
                      )}
                      <span className="flex-1">{category.name}</span>
                      {category.parent_id && (
                        <span className="text-2xs text-muted-foreground">sub</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Platforms & sites */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Account-specific platforms</Label>
                <p className="text-2xs text-muted-foreground">
                  Extra platform options that only exist for this account. Global
                  platform options remain available.
                </p>
                <TagInput
                  values={state.enabledPlatformIds}
                  onChange={(v) => update({ enabledPlatformIds: v })}
                  placeholder="Add a platform and press Enter"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Account-specific sites</Label>
                <p className="text-2xs text-muted-foreground">
                  Sites or locations for this account.
                </p>
                <TagInput
                  values={state.enabledSiteIds}
                  onChange={(v) => update({ enabledSiteIds: v })}
                  placeholder="Add a site and press Enter"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Tags</Label>
                <TagInput
                  values={state.tags}
                  onChange={(v) => update({ tags: v })}
                  placeholder="Add a tag and press Enter"
                />
              </div>
            </div>
          )}

          {/* Step 4: Tabs & defaults */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="acc-tab">Default landing tab</Label>
                <Select
                  value={state.default_landing_tab}
                  onValueChange={(v) => update({ default_landing_tab: v })}
                >
                  <SelectTrigger id="acc-tab" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="frequent" className="text-xs">
                      Frequent problems
                    </SelectItem>
                    <SelectItem value="anticipated" className="text-xs">
                      Anticipated
                    </SelectItem>
                    <SelectItem value="by_category" className="text-xs">
                      By category
                    </SelectItem>
                    <SelectItem value="critical" className="text-xs">
                      Critical issues
                    </SelectItem>
                    <SelectItem value="all" className="text-xs">
                      All scenarios
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="acc-banner">Announcement banner</Label>
                <Textarea
                  id="acc-banner"
                  value={state.announcement_banner}
                  onChange={(e) => update({ announcement_banner: e.target.value })}
                  rows={2}
                  placeholder="Optional notice shown at the top of this account's pages."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="acc-ticket">Ticket URL template</Label>
                <Input
                  id="acc-ticket"
                  value={state.ticket_url_template}
                  onChange={(e) => update({ ticket_url_template: e.target.value })}
                  placeholder="https://tickets.internal/issue/{ticket_id}"
                />
                <p className="text-2xs text-muted-foreground">
                  {'{ticket_id}'} is replaced with the ticket reference, making
                  ticket IDs clickable.
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium">Review</h2>
              <dl className="divide-y rounded-md border text-xs">
                <ReviewRow label="Name" value={state.name || '—'} />
                <ReviewRow label="Code" value={state.code || '—'} />
                <ReviewRow label="Status" value={state.status} />
                <ReviewRow
                  label="Accent"
                  value={
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-3 w-3 rounded"
                        style={{ backgroundColor: state.accent_color }}
                        aria-hidden
                      />
                      {state.accent_color}
                    </span>
                  }
                />
                <ReviewRow
                  label="Categories"
                  value={`${state.enabledCategoryIds.length} enabled`}
                />
                <ReviewRow
                  label="Platforms"
                  value={
                    state.enabledPlatformIds.length
                      ? state.enabledPlatformIds.join(', ')
                      : 'None (global options only)'
                  }
                />
                <ReviewRow
                  label="Sites"
                  value={
                    state.enabledSiteIds.length
                      ? state.enabledSiteIds.join(', ')
                      : 'None'
                  }
                />
                <ReviewRow label="Default tab" value={state.default_landing_tab} />
                <ReviewRow
                  label="Ticket template"
                  value={state.ticket_url_template || 'Global default'}
                />
                <ReviewRow
                  label="Cloned from"
                  value={
                    state.cloneFromId
                      ? (accounts.find((a) => a.id === state.cloneFromId)?.name ?? '—')
                      : 'Nothing'
                  }
                />
              </dl>

              {!account && (
                <p className="text-2xs text-muted-foreground">
                  After saving you can add users, categories and scenarios to this
                  account.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-2xs tabular-nums text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </span>
          {step < STEPS.length - 1 ? (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
            >
              Continue
              <IconArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={save}
              disabled={saving || !canAdvance}
            >
              <IconDeviceFloppy className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : account ? 'Save changes' : 'Create account'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{value}</dd>
    </div>
  );
}

/** A simple free-text tag editor. */
function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = React.useState('');

  const add = () => {
    const value = draft.trim();
    if (!value || values.includes(value)) {
      setDraft('');
      return;
    }
    onChange([...values, value]);
    setDraft('');
  };

  return (
    <div className="rounded-md border p-2">
      {values.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {values.map((value) => (
            <span
              key={value}
              className="chip bg-muted text-muted-foreground"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="hover:text-destructive"
                aria-label={`Remove ${value}`}
              >
                <IconTrash className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-7 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 text-2xs"
          onClick={add}
        >
          <IconPlus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
