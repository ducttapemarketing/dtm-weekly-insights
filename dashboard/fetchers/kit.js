// fetchers/kit.js
// Pulls newsletter broadcast performance and subscriber growth
// from Kit (ConvertKit) v4 API.

import * as dotenv from 'dotenv';
dotenv.config();

const KIT_BASE = 'https://api.kit.com/v4';

function headers() {
  const secret = process.env.KIT_API_SECRET;
  if (!secret) throw new Error('KIT_API_SECRET env var is missing');
  return {
    'Authorization': `Bearer ${secret}`,
    'Content-Type':  'application/json',
  };
}

async function kitGet(path) {
  const res = await fetch(`${KIT_BASE}${path}`, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kit API error ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

export async function fetchKitData() {

  // ── 1. Recent broadcasts (last 8 so we have trend data) ──────────────────
  // Kit v4 returns broadcasts sorted newest first
  const broadcastsRes = await kitGet('/broadcasts?per_page=8&sort_field=published_at&sort_order=desc');
  const broadcasts    = broadcastsRes.broadcasts ?? broadcastsRes.data ?? [];

  // ── 2. Get stats for each broadcast ──────────────────────────────────────
  // Kit v4: GET /broadcasts/:id/stats
  const broadcastsWithStats = await Promise.all(
    broadcasts.slice(0, 8).map(async (b) => {
      try {
        const statsRes = await kitGet(`/broadcasts/${b.id}/stats`);
        const stats    = statsRes.broadcast?.stats ?? statsRes.stats ?? {};
        return {
          id:              b.id,
          subject:         b.email_template?.name ?? b.subject ?? 'Untitled',
          publishedAt:     b.published_at ?? b.send_at,
          recipientCount:  stats.recipients      ?? 0,
          openRate:        round(stats.open_rate  ?? 0, 1),
          clickRate:       round(stats.click_rate ?? 0, 1),
          unsubscribeRate: round(stats.unsubscribe_rate ?? 0, 2),
          opens:           stats.opens            ?? 0,
          clicks:          stats.clicks           ?? 0,
          unsubscribes:    stats.unsubscribes     ?? 0,
        };
      } catch {
        // Stats not yet available (broadcast too recent)
        return {
          id:          b.id,
          subject:     b.subject ?? 'Untitled',
          publishedAt: b.published_at ?? b.send_at,
          statsAvailable: false,
        };
      }
    })
  );

  // Separate complete stats from pending
  const completedBroadcasts = broadcastsWithStats.filter(b => b.statsAvailable !== false);
  const recentBroadcasts    = completedBroadcasts.slice(0, 4);

  // ── 3. Subscriber counts ─────────────────────────────────────────────────
  const [activeRes, totalRes] = await Promise.all([
    kitGet('/subscribers?status=active&per_page=1'),
    kitGet('/subscribers?per_page=1'),
  ]);

  const activeSubscribers = activeRes.pagination?.total_count
    ?? activeRes.meta?.total_count
    ?? 0;
  const totalSubscribers  = totalRes.pagination?.total_count
    ?? totalRes.meta?.total_count
    ?? 0;

  // ── 4. New subscribers this week ─────────────────────────────────────────
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const isoDate = sevenDaysAgo.toISOString().split('T')[0];

  const newThisWeekRes = await kitGet(
    `/subscribers?status=active&created_after=${isoDate}&per_page=1`
  );
  const newThisWeek = newThisWeekRes.pagination?.total_count
    ?? newThisWeekRes.meta?.total_count
    ?? 0;

  // ── 5. Compute averages over last 4 completed broadcasts ─────────────────
  function avg(arr, key) {
    const vals = arr.map(b => b[key]).filter(v => v != null && !isNaN(v));
    return vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 1) : null;
  }

  const averages = {
    openRate:        avg(recentBroadcasts, 'openRate'),
    clickRate:       avg(recentBroadcasts, 'clickRate'),
    unsubscribeRate: avg(recentBroadcasts, 'unsubscribeRate'),
  };

  // Best and worst performing broadcasts
  const sorted          = [...recentBroadcasts].sort((a, b) => b.openRate - a.openRate);
  const bestBroadcast   = sorted[0]  ?? null;
  const worstBroadcast  = sorted[sorted.length - 1] ?? null;

  return {
    subscribers: {
      active:     activeSubscribers,
      total:      totalSubscribers,
      newThisWeek,
    },
    recentBroadcasts,
    allBroadcasts:  completedBroadcasts,
    averages,
    bestBroadcast,
    worstBroadcast,
    fetchedAt: new Date().toISOString(),
  };
}

function round(val, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

// ── Standalone test ───────────────────────────────────────────────────────────
if (process.argv[1].includes('kit.js')) {
  console.log('Testing Kit fetcher...');
  fetchKitData()
    .then(data => {
      console.log('\n✅ Kit data fetched successfully');
      console.log('\n── Subscribers ──');
      console.log(data.subscribers);
      console.log('\n── Averages (last 4 broadcasts) ──');
      console.log(data.averages);
      console.log('\n── Recent Broadcasts ──');
      console.table(data.recentBroadcasts.map(b => ({
        subject:     b.subject?.slice(0, 40),
        openRate:    `${b.openRate}%`,
        clickRate:   `${b.clickRate}%`,
        recipients:  b.recipientCount,
      })));
      console.log('\n── Best Broadcast ──');
      console.log(data.bestBroadcast);
    })
    .catch(err => {
      console.error('\n❌ Kit fetch failed:', err.message);
      process.exit(1);
    });
}
