import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const BIG_OUTSOURCE_ACCOUNTS = [
  { name: 'Health Carousel', code: 'HC', accent_color: '#233B74', description: 'Healthcare staffing and workforce solutions', status: 'Active', is_global: false },
  { name: 'MyVRhost', code: 'MVRH', accent_color: '#288FC2', description: 'Short-term vacation rental property management', status: 'Active', is_global: false },
  { name: 'Imagine Learning', code: 'IL', accent_color: '#794183', description: 'Digital-first educational curriculum platform', status: 'Active', is_global: false },
  { name: 'Harper Group', code: 'HG', accent_color: '#E07E3C', description: 'Publishing and lifestyle brand distribution', status: 'Active', is_global: false },
  { name: 'Clearabee', code: 'CB', accent_color: '#233B74', description: 'On-demand rubbish clearance and recycling services', status: 'Active', is_global: false },
  { name: 'DoNotPay', code: 'DNP', accent_color: '#288FC2', description: 'Consumer rights automation and legal tech', status: 'Active', is_global: false },
  { name: 'Feed', code: 'FEED', accent_color: '#794183', description: 'E-commerce advertising and marketplace automation', status: 'Active', is_global: false },
  { name: 'CelebVM', code: 'CVM', accent_color: '#E07E3C', description: 'Celebrity video messaging and fan platform', status: 'Active', is_global: false },
  { name: 'Priceline RevOps', code: 'PLRO', accent_color: '#233B74', description: 'Travel booking revenue operations and inventory', status: 'Active', is_global: false },
  { name: 'Miratech', code: 'MIRA', accent_color: '#288FC2', description: 'Global IT services and cloud consulting', status: 'Active', is_global: false },
  { name: 'US Legal Support', code: 'USLS', accent_color: '#794183', description: 'Litigation support and record retrieval services', status: 'Active', is_global: false },
  { name: 'Driveline Baseball', code: 'DLB', accent_color: '#E07E3C', description: 'Data-driven baseball performance training', status: 'Active', is_global: false },
  { name: 'Cohley', code: 'CHLY', accent_color: '#233B74', description: 'Digital asset and user-generated content generation', status: 'Active', is_global: false },
  { name: 'Fat Pizza', code: 'FPZ', accent_color: '#288FC2', description: 'Quick service restaurant ordering and logistics', status: 'Active', is_global: false },
  { name: 'Under the Doormat', code: 'UTD', accent_color: '#794183', description: 'Luxury urban short-stay property management', status: 'Active', is_global: false },
  { name: 'Medex', code: 'MDX', accent_color: '#E07E3C', description: 'Emergency medical supply distribution', status: 'Active', is_global: false },
  { name: 'Lem Garcia Law', code: 'LGL', accent_color: '#233B74', description: 'Personal injury and civil legal practice', status: 'Active', is_global: false },
  { name: 'Freedom and Glory', code: 'FAG', accent_color: '#288FC2', description: 'Lifestyle apparel and brand operations', status: 'Active', is_global: false },
  { name: 'InMotion', code: 'INM', accent_color: '#794183', description: 'Web hosting and managed infrastructure services', status: 'Active', is_global: false },
  { name: 'Travers', code: 'TRV', accent_color: '#E07E3C', description: 'Industrial metalworking and supply distribution', status: 'Active', is_global: false },
  { name: 'Essentials in Writing', code: 'EIW', accent_color: '#233B74', description: 'Homeschooling video curriculum and grading services', status: 'Active', is_global: false },
  { name: 'Cipher Billing', code: 'CPHB', accent_color: '#288FC2', description: 'Medical billing and revenue cycle management', status: 'Active', is_global: false },
  { name: 'IFA', code: 'IFA', accent_color: '#794183', description: 'Agricultural cooperative supply and agronomy services', status: 'Active', is_global: false },
  { name: 'Skanwear', code: 'SKW', accent_color: '#E07E3C', description: 'Arc flash protection and specialist workwear', status: 'Active', is_global: false },
  { name: 'MyCali PT', code: 'MCPT', accent_color: '#233B74', description: 'Outpatient physical therapy clinic network', status: 'Active', is_global: false },
  { name: 'Kiddom', code: 'KDM', accent_color: '#288FC2', description: 'K-12 digital curriculum and assessment suite', status: 'Active', is_global: false }
];

let hasBootstrapped = false;

export async function ensureDefaultAccountsAndCategories() {
  if (hasBootstrapped) return;

  const kongUrl = process.env.INTERNAL_API_URL || 'http://kong:8000';
  const serviceKey = process.env.SERVICE_ROLE_KEY;
  if (!serviceKey) return;

  try {
    const admin = createSupabaseClient(kongUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Ensure initial accounts exist if table is empty
    const { count } = await admin
      .from('pb_accounts')
      .select('*', { count: 'exact', head: true });

    if (!count || count === 0) {
      await admin.from('pb_accounts').upsert(BIG_OUTSOURCE_ACCOUNTS, {
        onConflict: 'code',
      });
    }

    // 2. Ensure Category EDR exists
    let edrId: string | null = null;
    const { data: edrCat } = await admin
      .from('pb_categories')
      .select('id')
      .eq('slug', 'edr')
      .maybeSingle();

    if (edrCat?.id) {
      edrId = edrCat.id;
    } else {
      const { data: newEdr } = await admin
        .from('pb_categories')
        .upsert(
          {
            name: 'EDR',
            slug: 'edr',
            icon: 'shield-check',
            color: '#e11d48',
            sort_order: 8,
            is_active: true,
          },
          { onConflict: 'slug' }
        )
        .select('id')
        .single();
      edrId = newEdr?.id ?? null;
    }

    // Ensure Sub-Category ESET exists under EDR
    if (edrId) {
      await admin.from('pb_categories').upsert(
        {
          name: 'ESET',
          slug: 'eset',
          parent_id: edrId,
          icon: 'shield',
          color: '#06b6d4',
          sort_order: 1,
          is_active: true,
        },
        { onConflict: 'slug' }
      );
    }

    // 3. Ensure ESET in platform criteria options
    const { data: platformField } = await admin
      .from('pb_criteria_fields')
      .select('id')
      .eq('key', 'platform')
      .maybeSingle();

    if (platformField?.id) {
      const { data: existingEset } = await admin
        .from('pb_criteria_options')
        .select('id')
        .eq('field_id', platformField.id)
        .eq('value', 'eset')
        .maybeSingle();

      if (!existingEset) {
        await admin.from('pb_criteria_options').insert({
          field_id: platformField.id,
          label: 'ESET',
          value: 'eset',
          color: '#06b6d4',
          sort_order: 8,
          is_active: true,
        });
      }
    }

    // 4. Update general app_name to 'IT Operations Playbook'
    const { data: settingsRow } = await admin
      .from('pb_settings')
      .select('settings')
      .eq('scope', 'global')
      .maybeSingle();

    if (settingsRow?.settings && settingsRow.settings.app_name !== 'IT Operations Playbook') {
      await admin
        .from('pb_settings')
        .update({
          settings: { ...settingsRow.settings, app_name: 'IT Operations Playbook' },
        })
        .eq('scope', 'global');
    }

    // 5. Ensure all user profiles are mapped to all accounts in pb_user_accounts
    const { data: allUsers } = await admin.from('pb_user_profiles').select('id');
    const { data: allAccounts } = await admin.from('pb_accounts').select('id');

    if (allUsers && allAccounts && allUsers.length > 0 && allAccounts.length > 0) {
      const pairs = [];
      for (const u of allUsers) {
        for (const a of allAccounts) {
          pairs.push({ user_id: u.id, account_id: a.id });
        }
      }
      await admin.from('pb_user_accounts').upsert(pairs, {
        onConflict: 'user_id,account_id',
      });
    }

    hasBootstrapped = true;
  } catch (err) {
    console.warn('Bootstrap defaults warning:', err);
  }
}

