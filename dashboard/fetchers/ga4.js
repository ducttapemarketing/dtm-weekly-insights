// fetchers/ga4.js
// Pulls sessions, engagement, top pages, and channel breakdown
// for this week vs last week so Claude can spot trends.

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import * as dotenv from 'dotenv';
dotenv.config();

function getGoogleAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT env var is missing');
  const credentials = JSON.parse(raw);
  return { credentials };
}

// Returns YYYY-MM-DD for a date N days ago
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export async function fetchGA4Data() {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error('GA4_PROPERTY_ID env var is missing');

  const client = new BetaAnalyticsDataClient(getGoogleAuth());

  // ── 1. Week-over-week traffic overview ────────────────────────────────────
  const [overviewRes] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate: daysAgo(7),  endDate: daysAgo(1),  name: 'this_week'  },
      { startDate: daysAgo(14), endDate: daysAgo(8),  name: 'last_week'  },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'newUsers' },
      { name: 'totalUsers' },
    ],
  });

  // ── 2. Top 10 pages by sessions this week ─────────────────────────────────
  const [pagesRes] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: daysAgo(7), endDate: daysAgo(1) }],
    dimensions: [
      { name: 'pagePath' },
      { name: 'pageTitle' },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
  });

  // ── 3. Traffic by channel (this week vs last week) ─────────────────────────
  const [channelRes] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate: daysAgo(7),  endDate: daysAgo(1), name: 'this_week' },
      { startDate: daysAgo(14), endDate: daysAgo(8), name: 'last_week' },
    ],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'bounceRate' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  });

  // ── 4. Daily sessions this week (for sparkline chart) ─────────────────────
  const [dailyRes] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: daysAgo(7), endDate: daysAgo(1) }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });

  // ── Parse helpers ──────────────────────────────────────────────────────────
  function parseOverview(res) {
    const result = {};
    for (const row of res.rows ?? []) {
      const period = row.dimensionValues?.[0]?.value ?? 'unknown';
      result[period] = {};
      row.metricValues.forEach((mv, i) => {
        result[period][res.metricHeaders[i].name] = parseFloat(mv.value);
      });
    }
    return result;
  }

  function parsePages(res) {
    return (res.rows ?? []).map(row => ({
      path:            row.dimensionValues[0].value,
      title:           row.dimensionValues[1].value,
      sessions:        parseInt(row.metricValues[0].value),
      engagedSessions: parseInt(row.metricValues[1].value),
      bounceRate:      parseFloat(row.metricValues[2].value),
      avgDuration:     parseFloat(row.metricValues[3].value),
    }));
  }

  function parseChannels(res) {
    const result = {};
    for (const row of res.rows ?? []) {
      const channel = row.dimensionValues[0].value;
      const period  = row.dimensionValues[1]?.value ?? 'this_week';
      if (!result[channel]) result[channel] = {};
      result[channel][period] = {
        sessions:        parseInt(row.metricValues[0].value),
        engagedSessions: parseInt(row.metricValues[1].value),
        bounceRate:      parseFloat(row.metricValues[2].value),
      };
    }
    return result;
  }

  function parseDaily(res) {
    return (res.rows ?? []).map(row => ({
      date:            row.dimensionValues[0].value,
      sessions:        parseInt(row.metricValues[0].value),
      engagedSessions: parseInt(row.metricValues[1].value),
    }));
  }

  const data = {
    overview:  parseOverview(overviewRes),
    topPages:  parsePages(pagesRes),
    channels:  parseChannels(channelRes),
    daily:     parseDaily(dailyRes),
    fetchedAt: new Date().toISOString(),
  };

  // Compute week-over-week deltas for Claude context
  if (data.overview.this_week && data.overview.last_week) {
    const tw = data.overview.this_week;
    const lw = data.overview.last_week;
    data.weekOverWeek = {
      sessionsDelta:    pct(tw.sessions, lw.sessions),
      newUsersDelta:    pct(tw.newUsers, lw.newUsers),
      bounceRateDelta:  pct(tw.bounceRate, lw.bounceRate),
      engagementDelta:  pct(tw.engagedSessions, lw.engagedSessions),
    };
  }

  return data;
}

function pct(current, previous) {
  if (!previous || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10; // one decimal
}

// ── Standalone test ───────────────────────────────────────────────────────────
// Run: npm run test:ga4
if (process.argv[1].includes('ga4.js')) {
  console.log('Testing GA4 fetcher...');
  fetchGA4Data()
    .then(data => {
      console.log('\n✅ GA4 data fetched successfully');
      console.log('\n── Overview ──');
      console.log(JSON.stringify(data.overview, null, 2));
      console.log('\n── Week-over-week ──');
      console.log(JSON.stringify(data.weekOverWeek, null, 2));
      console.log('\n── Top Pages ──');
      console.table(data.topPages.slice(0, 5));
      console.log('\n── Channels ──');
      console.log(JSON.stringify(data.channels, null, 2));
    })
    .catch(err => {
      console.error('\n❌ GA4 fetch failed:', err.message);
      process.exit(1);
    });
}
