// fetchers/meta.js
// Pulls campaign performance, spend, CPL, and creative stats
// from the Meta Ads API for this week vs last week.

import * as dotenv from 'dotenv';
dotenv.config();

const META_BASE    = 'https://graph.facebook.com/v19.0';
const AD_ACCOUNT   = () => {
  const id = process.env.META_AD_ACCOUNT_ID;
  if (!id) throw new Error('META_AD_ACCOUNT_ID env var is missing');
  return id; // should be in format act_XXXXXXXXX
};
const ACCESS_TOKEN = () => {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error('META_ACCESS_TOKEN env var is missing');
  return t;
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

async function metaGet(path, params = {}) {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set('access_token', ACCESS_TOKEN());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
  }
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) throw new Error(`Meta API error: ${json.error.message}`);
  return json;
}

// Core fields to pull for any insights query
const INSIGHT_FIELDS = [
  'campaign_name',
  'adset_name',
  'spend',
  'impressions',
  'reach',
  'clicks',
  'ctr',
  'cpm',
  'cpc',
  'actions',           // includes leads, link_clicks, etc.
  'cost_per_action_type',
  'video_avg_time_watched_actions',
  'video_p75_watched_actions',
].join(',');

export async function fetchMetaData() {
  const accountId = AD_ACCOUNT();

  const thisWeekRange = { since: daysAgo(7),  until: daysAgo(1) };
  const lastWeekRange = { since: daysAgo(14), until: daysAgo(8) };

  // ── 1. Account-level summary: this week vs last week ─────────────────────
  const [thisWeekAccount, lastWeekAccount] = await Promise.all([
    metaGet(`/${accountId}/insights`, {
      fields:       INSIGHT_FIELDS,
      date_preset:  'last_7d',
      time_range:   thisWeekRange,
      level:        'account',
    }),
    metaGet(`/${accountId}/insights`, {
      fields:       INSIGHT_FIELDS,
      date_preset:  'last_7d',
      time_range:   lastWeekRange,
      level:        'account',
    }),
  ]);

  // ── 2. Campaign-level breakdown this week ─────────────────────────────────
  const campaignsRes = await metaGet(`/${accountId}/insights`, {
    fields:     INSIGHT_FIELDS,
    time_range: thisWeekRange,
    level:      'campaign',
    limit:      20,
  });

  // ── 3. Active ads this week (for creative performance) ────────────────────
  const adsRes = await metaGet(`/${accountId}/insights`, {
    fields:     [
      'ad_name',
      'campaign_name',
      'spend',
      'impressions',
      'clicks',
      'ctr',
      'actions',
      'cost_per_action_type',
    ].join(','),
    time_range: thisWeekRange,
    level:      'ad',
    limit:      20,
    sort:       ['spend_descending'],
  });

  // ── Parse helpers ─────────────────────────────────────────────────────────
  function parseInsight(insight) {
    const actions     = insight.actions ?? [];
    const costPerAction = insight.cost_per_action_type ?? [];

    // Extract leads (lead gen) or link clicks as conversions
    const leads = actions.find(a => a.action_type === 'lead')?.value
      ?? actions.find(a => a.action_type === 'onsite_conversion.lead_grouped')?.value
      ?? 0;

    const costPerLead = costPerAction.find(a => a.action_type === 'lead')?.value
      ?? costPerAction.find(a => a.action_type === 'onsite_conversion.lead_grouped')?.value
      ?? null;

    const linkClicks = actions.find(a => a.action_type === 'link_click')?.value ?? 0;

    return {
      spend:       parseFloat(insight.spend ?? 0),
      impressions: parseInt(insight.impressions ?? 0),
      reach:       parseInt(insight.reach ?? 0),
      clicks:      parseInt(insight.clicks ?? 0),
      ctr:         round(parseFloat(insight.ctr ?? 0), 2),
      cpm:         round(parseFloat(insight.cpm ?? 0), 2),
      cpc:         round(parseFloat(insight.cpc ?? 0), 2),
      leads:       parseInt(leads),
      costPerLead: costPerLead ? round(parseFloat(costPerLead), 2) : null,
      linkClicks:  parseInt(linkClicks),
    };
  }

  function parseCampaigns(res) {
    return (res.data ?? []).map(c => ({
      campaignName: c.campaign_name,
      ...parseInsight(c),
    })).sort((a, b) => b.spend - a.spend);
  }

  function parseAds(res) {
    return (res.data ?? []).map(a => ({
      adName:       a.ad_name,
      campaignName: a.campaign_name,
      ...parseInsight(a),
    }));
  }

  const thisWeekSummary = parseInsight(thisWeekAccount.data?.[0] ?? {});
  const lastWeekSummary = parseInsight(lastWeekAccount.data?.[0] ?? {});

  // Week-over-week deltas
  const weekOverWeek = {
    spendDelta:       pct(thisWeekSummary.spend, lastWeekSummary.spend),
    impressionsDelta: pct(thisWeekSummary.impressions, lastWeekSummary.impressions),
    ctrDelta:         pct(thisWeekSummary.ctr, lastWeekSummary.ctr),
    cpmDelta:         pct(thisWeekSummary.cpm, lastWeekSummary.cpm),
    leadsDelta:       pct(thisWeekSummary.leads, lastWeekSummary.leads),
    costPerLeadDelta: thisWeekSummary.costPerLead && lastWeekSummary.costPerLead
      ? pct(thisWeekSummary.costPerLead, lastWeekSummary.costPerLead)
      : null,
  };

  const campaigns = parseCampaigns(campaignsRes);
  const ads       = parseAds(adsRes);

  // Flag underperforming campaigns (CPL > 50% above account average, or CTR < 0.5%)
  const avgCPL = thisWeekSummary.costPerLead;
  const underperforming = campaigns.filter(c =>
    (avgCPL && c.costPerLead && c.costPerLead > avgCPL * 1.5) ||
    (c.ctr < 0.5 && c.spend > 50)
  );

  return {
    thisWeek:      { ...thisWeekSummary, dateRange: thisWeekRange },
    lastWeek:      { ...lastWeekSummary, dateRange: lastWeekRange },
    weekOverWeek,
    campaigns,
    topAds:        ads.slice(0, 10),
    underperforming,
    fetchedAt:     new Date().toISOString(),
  };
}

function pct(current, previous) {
  if (!previous || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function round(val, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

// ── Standalone test ───────────────────────────────────────────────────────────
if (process.argv[1].includes('meta.js')) {
  console.log('Testing Meta Ads fetcher...');
  fetchMetaData()
    .then(data => {
      console.log('\n✅ Meta Ads data fetched successfully');
      console.log('\n── This Week Summary ──');
      console.log(data.thisWeek);
      console.log('\n── Week-over-week ──');
      console.log(data.weekOverWeek);
      console.log('\n── Campaigns ──');
      console.table(data.campaigns.map(c => ({
        campaign:   c.campaignName?.slice(0, 30),
        spend:      `$${c.spend}`,
        leads:      c.leads,
        cpl:        c.costPerLead ? `$${c.costPerLead}` : 'n/a',
        ctr:        `${c.ctr}%`,
      })));
    })
    .catch(err => {
      console.error('\n❌ Meta fetch failed:', err.message);
      if (err.message.includes('token')) {
        console.error('💡 Your Meta access token may have expired. System User tokens last 60 days.');
      }
      process.exit(1);
    });
}
