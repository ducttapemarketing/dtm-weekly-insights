// fetchers/gsc.js
// Pulls top queries, top pages, and keyword position trends
// from Google Search Console for the past 7 days.

import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config();

function getGoogleAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT env var is missing');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export async function fetchGSCData() {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) throw new Error('GSC_SITE_URL env var is missing');

  const auth = getGoogleAuth();
  const sc   = google.searchconsole({ version: 'v1', auth });

  // GSC has a 3-day data lag — use 10 days ago to 3 days ago for "this week"
  const thisWeekEnd   = daysAgo(3);
  const thisWeekStart = daysAgo(10);
  const lastWeekEnd   = daysAgo(11);
  const lastWeekStart = daysAgo(17);

  // ── 1. Top 50 queries this week ───────────────────────────────────────────
  const { data: queriesRes } = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate:  thisWeekStart,
      endDate:    thisWeekEnd,
      dimensions: ['query'],
      rowLimit:   50,
      dataState:  'final',
    },
  });

  // ── 2. Top 25 pages this week ─────────────────────────────────────────────
  const { data: pagesRes } = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate:  thisWeekStart,
      endDate:    thisWeekEnd,
      dimensions: ['page'],
      rowLimit:   25,
      dataState:  'final',
    },
  });

  // ── 3. Same queries last week (for comparison) ────────────────────────────
  const { data: lastWeekRes } = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate:  lastWeekStart,
      endDate:    lastWeekEnd,
      dimensions: ['query'],
      rowLimit:   50,
      dataState:  'final',
    },
  });

  // ── 4. Device breakdown ───────────────────────────────────────────────────
  const { data: deviceRes } = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate:  thisWeekStart,
      endDate:    thisWeekEnd,
      dimensions: ['device'],
      dataState:  'final',
    },
  });

  // ── Parse helpers ─────────────────────────────────────────────────────────
  function parseRows(rows = []) {
    return rows.map(row => ({
      key:          row.keys[0],
      clicks:       row.clicks,
      impressions:  row.impressions,
      ctr:          Math.round(row.ctr * 1000) / 10,       // as %
      position:     Math.round(row.position * 10) / 10,    // one decimal
    }));
  }

  const thisWeekQueries = parseRows(queriesRes.rows);
  const lastWeekQueries = parseRows(lastWeekRes.rows);

  // Build a lookup for last week by query key
  const lastWeekMap = Object.fromEntries(lastWeekQueries.map(q => [q.key, q]));

  // Annotate this week's queries with position change vs last week
  const queriesWithDelta = thisWeekQueries.map(q => {
    const lw = lastWeekMap[q.key];
    return {
      ...q,
      positionLastWeek: lw?.position ?? null,
      positionDelta:    lw ? Math.round((lw.position - q.position) * 10) / 10 : null, // positive = improved
      clicksDelta:      lw ? q.clicks - lw.clicks : null,
    };
  });

  // Identify rising and falling queries
  const risingQueries  = queriesWithDelta.filter(q => q.positionDelta > 2).slice(0, 10);
  const fallingQueries = queriesWithDelta.filter(q => q.positionDelta < -2).slice(0, 10);

  // Opportunities: high impressions, low CTR, not yet ranking in top 5
  const opportunities = queriesWithDelta
    .filter(q => q.impressions > 50 && q.ctr < 3 && q.position > 5)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  return {
    thisWeek: {
      startDate: thisWeekStart,
      endDate:   thisWeekEnd,
    },
    topQueries:      queriesWithDelta.slice(0, 25),
    topPages:        parseRows(pagesRes.rows).slice(0, 15),
    risingQueries,
    fallingQueries,
    opportunities,
    deviceBreakdown: parseRows(deviceRes.rows),
    fetchedAt:       new Date().toISOString(),
  };
}

// ── Standalone test ───────────────────────────────────────────────────────────
if (process.argv[1].includes('gsc.js')) {
  console.log('Testing GSC fetcher...');
  fetchGSCData()
    .then(data => {
      console.log('\n✅ GSC data fetched successfully');
      console.log('\n── Top 5 Queries ──');
      console.table(data.topQueries.slice(0, 5));
      console.log('\n── Rising Queries ──');
      console.table(data.risingQueries.slice(0, 5));
      console.log('\n── Opportunities (high impressions, low CTR) ──');
      console.table(data.opportunities.slice(0, 5));
    })
    .catch(err => {
      console.error('\n❌ GSC fetch failed:', err.message);
      if (err.message.includes('404')) {
        console.error('💡 Check your GSC_SITE_URL — try both https://yoursite.com/ and sc-domain:yoursite.com');
      }
      process.exit(1);
    });
}
