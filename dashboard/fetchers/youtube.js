// fetchers/youtube.js
// Pulls video performance, channel stats, and traffic sources
// from YouTube Analytics for the past 7 days vs prior 7 days.

import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config();

function getGoogleAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT env var is missing');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ],
  });
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export async function fetchYouTubeData() {
  const auth      = getGoogleAuth();
  const youtube   = google.youtube({ version: 'v3', auth });
  const ytAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

  // ── 1. Get the channel ID ─────────────────────────────────────────────────
  const { data: channelData } = await youtube.channels.list({
    part: ['id', 'snippet', 'statistics'],
    mine: true,
  });

  const channel   = channelData.items?.[0];
  const channelId = channel?.id;
  if (!channelId) throw new Error('No YouTube channel found for this service account');

  const channelStats = {
    name:             channel.snippet.title,
    subscribers:      parseInt(channel.statistics.subscriberCount),
    totalViews:       parseInt(channel.statistics.viewCount),
    videoCount:       parseInt(channel.statistics.videoCount),
  };

  // ── 2. Channel-level metrics this week vs last week ───────────────────────
  const [thisWeekStats, lastWeekStats] = await Promise.all([
    ytAnalytics.reports.query({
      ids:        `channel==${channelId}`,
      startDate:  daysAgo(7),
      endDate:    daysAgo(1),
      metrics:    'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,shares,likes,comments,annotationClickThroughRate',
    }),
    ytAnalytics.reports.query({
      ids:        `channel==${channelId}`,
      startDate:  daysAgo(14),
      endDate:    daysAgo(8),
      metrics:    'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost',
    }),
  ]);

  function parseChannelMetrics(res) {
    const headers = res.data.columnHeaders?.map(h => h.name) ?? [];
    const row     = res.data.rows?.[0] ?? [];
    return Object.fromEntries(headers.map((h, i) => [h, row[i] ?? 0]));
  }

  const thisWeek = parseChannelMetrics(thisWeekStats);
  const lastWeek = parseChannelMetrics(lastWeekStats);

  // Week-over-week deltas
  const weekOverWeek = {
    viewsDelta:       pct(thisWeek.views, lastWeek.views),
    watchTimeDelta:   pct(thisWeek.estimatedMinutesWatched, lastWeek.estimatedMinutesWatched),
    avgDurationDelta: pct(thisWeek.averageViewDuration, lastWeek.averageViewDuration),
    subscriberNetThis: thisWeek.subscribersGained - thisWeek.subscribersLost,
    subscriberNetLast: lastWeek.subscribersGained - lastWeek.subscribersLost,
  };

  // ── 3. Top 10 videos this week by views ───────────────────────────────────
  const { data: topVideosData } = await ytAnalytics.reports.query({
    ids:        `channel==${channelId}`,
    startDate:  daysAgo(7),
    endDate:    daysAgo(1),
    metrics:    'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
    dimensions: 'video',
    sort:       '-views',
    maxResults: 10,
  });

  // Get video titles for the top video IDs
  const videoIds = (topVideosData.rows ?? []).map(r => r[0]);
  let videoTitles = {};
  if (videoIds.length > 0) {
    const { data: videoDetails } = await youtube.videos.list({
      part: ['snippet'],
      id:   videoIds.join(','),
    });
    videoTitles = Object.fromEntries(
      (videoDetails.items ?? []).map(v => [v.id, v.snippet.title])
    );
  }

  const topVideos = (topVideosData.rows ?? []).map(row => ({
    videoId:           row[0],
    title:             videoTitles[row[0]] ?? 'Unknown',
    views:             row[1],
    watchMinutes:      row[2],
    avgViewDuration:   row[3],   // seconds
    avgViewPercentage: row[4],   // % of video watched
  }));

  // ── 4. Traffic sources this week ─────────────────────────────────────────
  const { data: sourcesData } = await ytAnalytics.reports.query({
    ids:        `channel==${channelId}`,
    startDate:  daysAgo(7),
    endDate:    daysAgo(1),
    metrics:    'views',
    dimensions: 'insightTrafficSourceType',
    sort:       '-views',
  });

  const trafficSources = (sourcesData.rows ?? []).map(row => ({
    source: row[0],
    views:  row[1],
  }));

  return {
    channel:       channelStats,
    thisWeek,
    lastWeek,
    weekOverWeek,
    topVideos,
    trafficSources,
    fetchedAt:     new Date().toISOString(),
  };
}

function pct(current, previous) {
  if (!previous || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// ── Standalone test ───────────────────────────────────────────────────────────
if (process.argv[1].includes('youtube.js')) {
  console.log('Testing YouTube fetcher...');
  fetchYouTubeData()
    .then(data => {
      console.log('\n✅ YouTube data fetched successfully');
      console.log('\n── Channel ──');
      console.log(data.channel);
      console.log('\n── This Week ──');
      console.log(data.thisWeek);
      console.log('\n── Week-over-week ──');
      console.log(data.weekOverWeek);
      console.log('\n── Top Videos ──');
      console.table(data.topVideos.slice(0, 5));
    })
    .catch(err => {
      console.error('\n❌ YouTube fetch failed:', err.message);
      if (err.message.includes('forbidden') || err.message.includes('403')) {
        console.error('💡 Make sure the YouTube Data API and YouTube Analytics API are both enabled in Google Cloud Console');
      }
      process.exit(1);
    });
}
