// fetchers/vimeo.js
// Pulls video play rate, finish rate, and engagement data
// from Vimeo for the past 7 days. Requires Vimeo Pro or higher.

import * as dotenv from 'dotenv';
dotenv.config();

const VIMEO_BASE = 'https://api.vimeo.com';

function headers() {
  const token = process.env.VIMEO_ACCESS_TOKEN;
  if (!token) throw new Error('VIMEO_ACCESS_TOKEN env var is missing');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
    'Accept':        'application/vnd.vimeo.*+json;version=3.4',
  };
}

async function vimeoGet(path, params = {}) {
  const url = new URL(`${VIMEO_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403) {
      throw new Error('Vimeo 403: Analytics data requires Vimeo Pro or higher plan');
    }
    throw new Error(`Vimeo API error ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString(); // Vimeo uses full ISO datetime
}

export async function fetchVimeoData() {

  // ── 1. Get all videos in the account ──────────────────────────────────────
  const videosRes = await vimeoGet('/me/videos', {
    fields:    'uri,name,duration,created_time,pictures,stats',
    per_page:  25,
    sort:      'date',
    direction: 'desc',
  });

  const videos = (videosRes.data ?? []).map(v => ({
    id:          v.uri.replace('/videos/', ''),
    uri:         v.uri,
    title:       v.name,
    duration:    v.duration,       // seconds
    totalPlays:  v.stats?.plays ?? 0,
    createdAt:   v.created_time,
  }));

  if (videos.length === 0) {
    return { videos: [], fetchedAt: new Date().toISOString() };
  }

  // ── 2. Pull analytics for each video: this week ───────────────────────────
  const startThisWeek = daysAgo(7);
  const startLastWeek = daysAgo(14);
  const endLastWeek   = daysAgo(8);
  const now           = new Date().toISOString();

  const videosWithStats = await Promise.all(
    videos.slice(0, 15).map(async (video) => {
      try {
        // Total stats for this video in the date range
        const [thisWeekStats, lastWeekStats] = await Promise.all([
          vimeoGet(`/videos/${video.id}/analytics`, {
            dimension: 'total',
            from:      startThisWeek,
            to:        now,
          }),
          vimeoGet(`/videos/${video.id}/analytics`, {
            dimension: 'total',
            from:      startLastWeek,
            to:        endLastWeek,
          }),
        ]);

        const tw = parseAnalytics(thisWeekStats);
        const lw = parseAnalytics(lastWeekStats);

        // Engagement heatmap: where do people drop off?
        let engagementData = null;
        try {
          const engagementRes = await vimeoGet(`/videos/${video.id}/analytics`, {
            dimension: 'video_segment',
            from:      startThisWeek,
            to:        now,
          });
          engagementData = parseEngagement(engagementRes, video.duration);
        } catch {
          // Engagement data may not be available on all plans
        }

        return {
          ...video,
          thisWeek:         tw,
          lastWeek:         lw,
          playsDelta:       pct(tw.plays, lw.plays),
          finishRateDelta:  pct(tw.finishRate, lw.finishRate),
          engagement:       engagementData,
        };
      } catch (err) {
        return { ...video, error: err.message };
      }
    })
  );

  const validVideos  = videosWithStats.filter(v => !v.error);
  const errorVideos  = videosWithStats.filter(v => v.error);

  // Sort by plays this week descending
  const byPlays = [...validVideos].sort(
    (a, b) => (b.thisWeek?.plays ?? 0) - (a.thisWeek?.plays ?? 0)
  );

  // Identify VSLs with low finish rates (potential conversion problem)
  const avgFinishRate = avg(validVideos.map(v => v.thisWeek?.finishRate).filter(Boolean));
  const lowFinishRate = validVideos.filter(v =>
    v.thisWeek?.plays > 10 &&
    v.thisWeek?.finishRate < avgFinishRate * 0.7
  );

  // Account-level totals this week
  const totals = {
    totalPlays:          sum(validVideos, v => v.thisWeek?.plays ?? 0),
    totalWatchMinutes:   sum(validVideos, v => v.thisWeek?.watchMinutes ?? 0),
    avgFinishRate:       round(avgFinishRate, 1),
  };

  return {
    videos:              byPlays,
    topVideos:           byPlays.slice(0, 5),
    lowFinishRateVideos: lowFinishRate,
    totals,
    errors:              errorVideos.length > 0 ? errorVideos.map(v => ({ title: v.title, error: v.error })) : undefined,
    fetchedAt:           new Date().toISOString(),
  };
}

function parseAnalytics(res) {
  // Vimeo analytics returns an array of data points; for 'total' dimension it's one entry
  const row = res.data?.[0] ?? res;
  return {
    plays:        row.plays        ?? row.impressions ?? 0,
    finishes:     row.finishes     ?? 0,
    impressions:  row.impressions  ?? 0,
    watchMinutes: round((row.watch_time ?? 0) / 60, 1),
    // Play rate = plays / impressions (how many who saw the thumbnail clicked play)
    playRate:     row.impressions > 0
      ? round((row.plays / row.impressions) * 100, 1)
      : null,
    // Finish rate = finishes / plays
    finishRate:   row.plays > 0
      ? round((row.finishes / row.plays) * 100, 1)
      : null,
  };
}

// Map engagement segments to drop-off percentages at key video points
function parseEngagement(res, durationSeconds) {
  const segments = res.data ?? [];
  if (!segments.length || !durationSeconds) return null;

  // Find retention at key milestones: 25%, 50%, 75%, 90%
  const milestones = [0.25, 0.50, 0.75, 0.90];
  const result     = {};

  for (const milestone of milestones) {
    const targetSecond = Math.floor(durationSeconds * milestone);
    const segment      = segments.find(s => s.segment?.start_time <= targetSecond && s.segment?.end_time >= targetSecond);
    const pctLabel     = `${Math.round(milestone * 100)}pct`;
    result[pctLabel]   = segment ? round(segment.retention * 100, 1) : null;
  }

  // Find the biggest drop-off point
  let biggestDrop = null;
  let biggestDropAt = null;
  for (let i = 1; i < segments.length; i++) {
    const drop = (segments[i - 1].retention ?? 0) - (segments[i].retention ?? 0);
    if (!biggestDrop || drop > biggestDrop) {
      biggestDrop   = drop;
      biggestDropAt = segments[i].segment?.start_time ?? null;
    }
  }

  return {
    ...result,
    biggestDropSeconds: biggestDropAt,
    biggestDropPct: biggestDrop ? round(biggestDrop * 100, 1) : null,
  };
}

function pct(current, previous) {
  if (!previous || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v));
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function sum(arr, fn) {
  return arr.reduce((acc, v) => acc + fn(v), 0);
}

function round(val, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

// ── Standalone test ───────────────────────────────────────────────────────────
if (process.argv[1].includes('vimeo.js')) {
  console.log('Testing Vimeo fetcher...');
  fetchVimeoData()
    .then(data => {
      console.log('\n✅ Vimeo data fetched successfully');
      console.log('\n── Account Totals This Week ──');
      console.log(data.totals);
      console.log('\n── Top Videos ──');
      console.table(data.topVideos.map(v => ({
        title:      v.title?.slice(0, 35),
        plays:      v.thisWeek?.plays,
        playRate:   v.thisWeek?.playRate != null ? `${v.thisWeek.playRate}%` : 'n/a',
        finishRate: v.thisWeek?.finishRate != null ? `${v.thisWeek.finishRate}%` : 'n/a',
      })));
      if (data.lowFinishRateVideos?.length > 0) {
        console.log('\n⚠️  Low Finish Rate Videos:');
        console.table(data.lowFinishRateVideos.map(v => ({
          title:      v.title?.slice(0, 35),
          finishRate: `${v.thisWeek?.finishRate}%`,
        })));
      }
      if (data.errors?.length > 0) {
        console.warn('\n⚠️  Errors:', data.errors);
      }
    })
    .catch(err => {
      console.error('\n❌ Vimeo fetch failed:', err.message);
      if (err.message.includes('403') || err.message.includes('Pro')) {
        console.error('💡 Vimeo analytics requires Pro plan or higher. Check vimeo.com/settings/account');
      }
      process.exit(1);
    });
}
