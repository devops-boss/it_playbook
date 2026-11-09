import type {
  CriteriaField,
  CriteriaOption,
  Scenario,
  ScenarioCriteriaValue,
} from '@/types/database';

/**
 * A single resolved chip, ready to render.
 *
 * `fieldId` lets the chip act as a filter toggle: clicking it adds the
 * option to that field's filter.
 */
export interface ResolvedChip {
  key: string;
  fieldId: string;
  fieldKey: string;
  fieldLabel: string;
  optionId: string | null;
  label: string;
  color: string | null;
  /** True when the value is a plain text/number/date, not a stored option. */
  isFreeText: boolean;
}

export interface CriteriaLookup {
  fields: Map<string, CriteriaField>;
  optionsByField: Map<string, Map<string, CriteriaOption>>;
  optionsById: Map<string, CriteriaOption>;
}

export function buildCriteriaLookup(
  fields: CriteriaField[],
  optionsByField: Record<string, CriteriaOption[]>,
  categories?: { id: string; name: string; color: string | null }[],
): CriteriaLookup {
  const fieldMap = new Map<string, CriteriaField>();
  for (const f of fields) fieldMap.set(f.id, f);

  const options = new Map<string, Map<string, CriteriaOption>>();
  const byId = new Map<string, CriteriaOption>();

  for (const [fieldId, list] of Object.entries(optionsByField)) {
    const inner = new Map<string, CriteriaOption>();
    for (const option of list) {
      inner.set(option.id, option);
      byId.set(option.id, option);
    }
    options.set(fieldId, inner);
  }

  if (categories && categories.length > 0) {
    const categoryField = fields.find((f) => f.key === 'category');
    const fieldId = categoryField?.id ?? 'category';
    const inner = options.get(fieldId) ?? new Map<string, CriteriaOption>();
    for (const cat of categories) {
      const opt: CriteriaOption = {
        id: cat.id,
        field_id: fieldId,
        label: cat.name,
        value: cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        parent_id: (cat as any).parent_id ?? null,
        color: cat.color,
        sort_order: 0,
        is_active: true,
      };
      inner.set(cat.id, opt);
      byId.set(cat.id, opt);
    }
    options.set(fieldId, inner);
  }

  return { fields: fieldMap, optionsByField: options, optionsById: byId };
}

/**
 * Resolve stored criteria values into displayable chips.
 *
 * System fields (account, category, issue type, severity, impact scope) live
 * as real columns on the scenario row; custom fields live in the EAV table.
 * Both end up as the same chip shape so the UI never special-cases them.
 */
export function resolveChips(
  scenario: Pick<
    Scenario,
    | 'account_id'
    | 'category_id'
    | 'issue_type_id'
    | 'severity_id'
    | 'impact_scope_id'
  > & { is_global?: boolean },
  criteriaValues: ScenarioCriteriaValue[],
  lookup: CriteriaLookup,
  accountNames: Map<string, string> = new Map(),
  categoryNames: Map<string, string> = new Map(),
): ResolvedChip[] {
  const chips: ResolvedChip[] = [];

  const pushSystem = (
    fieldKey: string,
    optionId: string | null,
    fallbackLabel?: string,
  ) => {
    if (!optionId) return;
    const field = Array.from(lookup.fields.values()).find((f) => f.key === fieldKey);
    const option = lookup.optionsById.get(optionId);
    chips.push({
      key: `${fieldKey}:${optionId}`,
      fieldId: field?.id ?? fieldKey,
      fieldKey,
      fieldLabel: field?.label ?? fieldKey,
      optionId,
      label: option?.label ?? fallbackLabel ?? optionId,
      color: option?.color ?? null,
      isFreeText: false,
    });
  };

  if (scenario.is_global) {
    const accountField = Array.from(lookup.fields.values()).find((f) => f.key === 'account');
    chips.push({
      key: 'account:global',
      fieldId: accountField?.id ?? 'account',
      fieldKey: 'account',
      fieldLabel: 'Scope',
      optionId: null,
      label: 'All Accounts (Global)',
      color: '#288FC2',
      isFreeText: false,
    });
  } else {
    pushSystem('account', scenario.account_id, accountNames.get(scenario.account_id ?? ''));
  }

  pushSystem('category', scenario.category_id, categoryNames.get(scenario.category_id ?? ''));
  pushSystem('issue_type', scenario.issue_type_id);
  pushSystem('severity', scenario.severity_id);
  pushSystem('impact_scope', scenario.impact_scope_id);

  for (const value of criteriaValues) {
    const field = lookup.fields.get(value.field_id);
    if (!field) continue;

    if (value.option_id) {
      const option = lookup.optionsById.get(value.option_id);
      chips.push({
        key: `custom:${value.field_id}:${value.option_id}`,
        fieldId: value.field_id,
        fieldKey: field.key,
        fieldLabel: field.label,
        optionId: value.option_id,
        label: option?.label ?? value.option_id,
        color: option?.color ?? null,
        isFreeText: false,
      });
    } else if (value.value_text) {
      chips.push({
        key: `custom:${value.field_id}:text:${value.value_text}`,
        fieldId: value.field_id,
        fieldKey: field.key,
        fieldLabel: field.label,
        optionId: null,
        label: value.value_text,
        color: null,
        isFreeText: true,
      });
    } else if (value.value_number !== null && value.value_number !== undefined) {
      chips.push({
        key: `custom:${value.field_id}:num:${value.value_number}`,
        fieldId: value.field_id,
        fieldKey: field.key,
        fieldLabel: field.label,
        optionId: null,
        label: String(value.value_number),
        color: null,
        isFreeText: true,
      });
    } else if (value.value_date) {
      chips.push({
        key: `custom:${value.field_id}:date:${value.value_date}`,
        fieldId: value.field_id,
        fieldKey: field.key,
        fieldLabel: field.label,
        optionId: null,
        label: value.value_date,
        color: null,
        isFreeText: true,
      });
    } else if (value.value_bool !== null && value.value_bool !== undefined) {
      chips.push({
        key: `custom:${value.field_id}:bool:${value.value_bool}`,
        fieldId: value.field_id,
        fieldKey: field.key,
        fieldLabel: field.label,
        optionId: null,
        label: value.value_bool ? 'Yes' : 'No',
        color: null,
        isFreeText: true,
      });
    }
  }

  return chips;
}
