// fetchers/unbounce.js
// Pulls landing page conversion rates, visitor counts, and A/B test
// results from Unbounce for this week vs last week.

import * as dotenv from 'dotenv';
dotenv.config();

const UNBOUNCE_BASE = 'https://api.unbounce.com';

// Unbounce uses OAuth 2.0. Tokens expire — this handles refresh automatically.
async function getAccessToken() {
  let token = process.env.UNBOUNCE_ACCESS_TOKEN;

  // If we have a refresh token, always get a fresh access token
  const refreshToken  = process.env.UNBOUNCE_REFRESH_TOKEN;
  const clientId      = process.env.UNBOUNCE_CLIENT_ID;
  const clientSecret  = process.env.UNBOUNCE_CLIENT_SECRET;

  if (refreshToken && clientId && clientSecret) {
    const res = await fetch(`${UNBOUNCE_BASE}/0.1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      token = data.access_token;
    } else {
      console.warn('⚠️  Token refresh failed — falling back to stored access token');
    }
  }

  if (!token) throw new Error('UNBOUNCE_ACCESS_TOKEN env var is missing');
  return token;
}

async function unbounceGet(path, token) {
  const res = await fetch(`${UNBOUNCE_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Unbounce API error ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export async function fetchUnbounceData() {
  const token = await getAccessToken();

  // ── 1. Get all sub-accounts (domains) ────────────────────────────────────
  const accountsRes = await unbounceGet('/0.1/accounts', token);
  const accounts    = accountsRes.accounts ?? [];
  if (accounts.length === 0) throw new Error('No Unbounce accounts found');

  // Use first account by default (most setups have one)
  const accountId = accounts[0].id;

  // ── 2. Get all pages in the account ───────────────────────────────────────
  const pagesRes = await unbounceGet(
    `/0.1/accounts/${accountId}/pages?count=50&include_sub_pages=true`,
    token
  );
  const pages = pagesRes.pages ?? [];

  // ── 3. Pull stats for each page: this week vs last week ──────────────────
  const thisWeekStart = daysAgo(7);
  const thisWeekEnd   = daysAgo(1);
  const lastWeekStart = daysAgo(14);
  const lastWeekEnd   = daysAgo(8);

  const pageStats = await Promise.all(
    pages.map(async (page) => {
      try {
        const [thisWeekStats, lastWeekStats] = await Promise.all([
          unbounceGet(
            `/0.1/pages/${page.id}/page_group_stats?from=${thisWeekStart}&to=${thisWeekEnd}`,
            token
          ),
          unbounceGet(
            `/0.1/pages/${page.id}/page_group_stats?from=${lastWeekStart}&to=${lastWeekEnd}`,
            token
          ),
        ]);

        const tw = parsePageStats(thisWeekStats);
        const lw = parsePageStats(lastWeekStats);

        return {
          pageId:   page.id,
          pageName: page.name,
          url:      page.url,
          state:    page.state,    // 'published' or 'unpublished'
          thisWeek: tw,
          lastWeek: lw,
          conversionDelta: pct(tw.conversionRate, lw.conversionRate),
          visitorsDelta:   pct(tw.visitors, lw.visitors),
        };
      } catch {
        return {
          pageId:   page.id,
          pageName: page.name,
          url:      page.url,
          state:    page.state,
          error:    'Stats unavailable',
        };
      }
    })
  );

  // Only published pages with data
  const publishedPages = pageStats.filter(p => p.state === 'published' && !p.error);

  // Sort by visitors descending
  const byVisitors = [...publishedPages].sort(
    (a, b) => (b.thisWeek?.visitors ?? 0) - (a.thisWeek?.visitors ?? 0)
  );

  // Identify high-traffic / low-conversion pages (potential problem pages)
  const avgConvRate = avg(publishedPages.map(p => p.thisWeek?.conversionRate).filter(Boolean));
  const problemPages = publishedPages.filter(p =>
    p.thisWeek?.visitors > 50 &&
    p.thisWeek?.conversionRate < avgConvRate * 0.5
  );

  // Best performing pages
  const bestPages = [...publishedPages]
    .sort((a, b) => (b.thisWeek?.conversionRate ?? 0) - (a.thisWeek?.conversionRate ?? 0))
    .slice(0, 5);

  // ── 4. A/B test variants ──────────────────────────────────────────────────
  const pagesWithVariants = await Promise.all(
    pages.slice(0, 10).map(async (page) => {
      try {
        const variantsRes = await unbounceGet(`/0.1/pages/${page.id}/page_group_stats?from=${thisWeekStart}&to=${thisWeekEnd}&include_sub_pages=true`, token);
        const variants    = variantsRes.page_group_stats ?? [];
        if (variants.length > 1) {
          return {
            pageName: page.name,
            variants: variants.map(v => ({
              variantId:      v.id,
              visitors:       v.visitors,
              conversionRate: round(v.conversion_rate * 100, 1),
              conversions:    v.conversions,
            })).sort((a, b) => b.conversionRate - a.conversionRate),
          };
        }
        return null;
      } catch {
        return null;
      }
    })
  );

  const activeABTests = pagesWithVariants.filter(Boolean);

  return {
    topPages:     byVisitors.slice(0, 10),
    bestPages,
    problemPages,
    activeABTests,
    averageConversionRate: round(avgConvRate, 1),
    fetchedAt: new Date().toISOString(),
  };
}

function parsePageStats(res) {
  const stats = res.page_group_stats?.[0] ?? res;
  return {
    visitors:       stats.visitors       ?? 0,
    conversions:    stats.conversions    ?? 0,
    conversionRate: round((stats.conversion_rate ?? 0) * 100, 1),
  };
}

function pct(current, previous) {
  if (!previous || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round(val, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

// ── Standalone test ───────────────────────────────────────────────────────────
if (process.argv[1].includes('unbounce.js')) {
  console.log('Testing Unbounce fetcher...');
  fetchUnbounceData()
    .then(data => {
      console.log('\n✅ Unbounce data fetched successfully');
      console.log(`\n── Account avg conversion rate: ${data.averageConversionRate}% ──`);
      console.log('\n── Top Pages by Visitors ──');
      console.table(data.topPages.slice(0, 5).map(p => ({
        name:        p.pageName?.slice(0, 30),
        visitors:    p.thisWeek?.visitors,
        convRate:    `${p.thisWeek?.conversionRate}%`,
        convDelta:   p.conversionDelta != null ? `${p.conversionDelta}%` : 'n/a',
      })));
      console.log('\n── Problem Pages (high traffic, low conversion) ──');
      console.table(data.problemPages.map(p => ({
        name:     p.pageName?.slice(0, 30),
        visitors: p.thisWeek?.visitors,
        convRate: `${p.thisWeek?.conversionRate}%`,
      })));
      if (data.activeABTests.length > 0) {
        console.log('\n── Active A/B Tests ──');
        console.log(JSON.stringify(data.activeABTests, null, 2));
      }
    })
    .catch(err => {
      console.error('\n❌ Unbounce fetch failed:', err.message);
      process.exit(1);
    });
}
