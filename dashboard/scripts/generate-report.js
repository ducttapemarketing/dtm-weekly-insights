// scripts/generate-report.js
// Main weekly script. Runs all 7 fetchers in parallel,
// sends the combined data to Claude for analysis,
// and writes insights.json to dashboard/public/.

import Anthropic from '@anthropic-ai/sdk';
import fs        from 'fs';
import path      from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

import { fetchGA4Data }      from '../fetchers/ga4.js';
import { fetchGSCData }      from '../fetchers/gsc.js';
import { fetchYouTubeData }  from '../fetchers/youtube.js';
import { fetchKitData }      from '../fetchers/kit.js';
import { fetchMetaData }     from '../fetchers/meta.js';
import { fetchUnbounceData } from '../fetchers/unbounce.js';
import { fetchVimeoData }    from '../fetchers/vimeo.js';

// ── Config ────────────────────────────────────────────────────────────────────
const OUTPUT_PATH = './dashboard/public/insights.json';
const MODEL       = 'claude-opus-4-5-20251101'; // Use Opus for best analysis quality

// ── Business context — EDIT THIS to match your situation ─────────────────────
const BUSINESS_CONTEXT = `
We are Duct Tape Marketing. We sell marketing consulting, training, and done-for-you
services to small business owners and marketing consultants. Our primary products are
the Duct Tape Marketing Consultant Network (DTMCN) membership and our Marketing
System consulting engagements.

This quarter's primary goal: Reduce our cost-per-lead from Meta Ads while maintaining
or growing total lead volume. Secondary goal: grow the email list by 500 new subscribers.

Key context: Our YouTube channel drives top-of-funnel awareness. Our VSLs on Vimeo
sit on Unbounce landing pages and are the primary conversion mechanism. Kit broadcasts
are our main nurture tool. Meta Ads is our only paid channel right now.
`;

// ── Prompt ────────────────────────────────────────────────────────────────────
function buildPrompt(data) {
  return `
You are a senior marketing strategist briefing the Duct Tape Marketing team every Monday morning.

${BUSINESS_CONTEXT}

Your job is NOT to describe numbers — the team can read numbers. For every insight you surface, you must answer all three of:
1. WHAT does this mean for our business?
2. WHY is this probably happening?
3. WHAT specifically should we do this week?

Rules:
- Write like a brilliant, direct marketing director. Short sentences. Strong opinions.
- Never flag a problem without recommending a specific action.
- Always look for cross-channel connections (e.g. YouTube video → GA4 spike, GSC keyword gap → Meta opportunity, Unbounce problem page + Meta spend = money burning).
- If the data supports a strong conclusion, say it clearly. Don't hedge.
- Rank everything by business impact, not by data source.
- "Do Not Touch" means it's working — flag it so the team doesn't accidentally break it.

Respond ONLY with valid JSON matching this exact schema. No preamble, no markdown, just the JSON object:

{
  "weekOf": "YYYY-MM-DD",
  "weeklyVerdict": "2-3 sentence executive summary. What was the overall story this week?",
  "funnelHealth": {
    "awareness":     { "status": "green|amber|red", "summary": "one sentence" },
    "consideration": { "status": "green|amber|red", "summary": "one sentence" },
    "conversion":    { "status": "green|amber|red", "summary": "one sentence" },
    "retention":     { "status": "green|amber|red", "summary": "one sentence" }
  },
  "urgentActions": [
    {
      "priority": "high|medium|low",
      "action": "specific action to take",
      "why": "why this matters / what the data shows",
      "howTo": "exact steps to take it",
      "expectedOutcome": "what should happen if we do this",
      "doBy": "today|this week|before next report"
    }
  ],
  "insights": [
    {
      "source": "GA4|GSC|YouTube|Meta|Kit|Unbounce|Vimeo|Cross-channel",
      "observation": "what the data shows",
      "meaning": "what it means for the business",
      "hypothesis": "why this is probably happening",
      "recommendation": "specific next action",
      "confidence": "high|medium|low",
      "effort": "low|medium|high",
      "impact": "low|medium|high"
    }
  ],
  "doNotTouch": [
    {
      "thing": "what is working",
      "reason": "why it's working and why we should leave it alone",
      "metric": "the number that proves it"
    }
  ],
  "watchNextWeek": [
    {
      "metric": "what to watch",
      "because": "why we're watching before acting",
      "threshold": "at what point do we act?"
    }
  ],
  "rawData": {}
}

Here is this week's data across all 7 platforms:

## GA4 — Website Analytics
${JSON.stringify(data.ga4, null, 2)}

## Google Search Console — Organic Search
${JSON.stringify(data.gsc, null, 2)}

## YouTube — Video Analytics
${JSON.stringify(data.youtube, null, 2)}

## Meta Ads — Paid Social
${JSON.stringify(data.meta, null, 2)}

## Kit (ConvertKit) — Email Newsletter
${JSON.stringify(data.kit, null, 2)}

## Unbounce — Landing Pages
${JSON.stringify(data.unbounce, null, 2)}

## Vimeo — Video Sales Letters
${JSON.stringify(data.vimeo, null, 2)}
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting weekly marketing report generation...');
  console.log(`📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n`);

  // ── Step 1: Run all fetchers in parallel ───────────────────────────────────
  console.log('📊 Fetching data from all platforms...');

  const results = await Promise.allSettled([
    fetchGA4Data().then(d => { console.log('  ✅ GA4');       return d; }),
    fetchGSCData().then(d => { console.log('  ✅ GSC');       return d; }),
    fetchYouTubeData().then(d => { console.log('  ✅ YouTube'); return d; }),
    fetchKitData().then(d => { console.log('  ✅ Kit');       return d; }),
    fetchMetaData().then(d => { console.log('  ✅ Meta Ads'); return d; }),
    fetchUnbounceData().then(d => { console.log('  ✅ Unbounce'); return d; }),
    fetchVimeoData().then(d => { console.log('  ✅ Vimeo');   return d; }),
  ]);

  const [ga4Result, gscResult, youtubeResult, kitResult, metaResult, unbounceResult, vimeoResult] = results;

  // Warn on failures but continue — partial data is better than no report
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`\n⚠️  ${failures.length} fetcher(s) failed — report will use available data:`);
    results.forEach((r, i) => {
      const names = ['GA4', 'GSC', 'YouTube', 'Kit', 'Meta', 'Unbounce', 'Vimeo'];
      if (r.status === 'rejected') console.warn(`  ❌ ${names[i]}: ${r.reason?.message}`);
    });
  }

  const data = {
    ga4:      ga4Result.status      === 'fulfilled' ? ga4Result.value      : { error: ga4Result.reason?.message },
    gsc:      gscResult.status      === 'fulfilled' ? gscResult.value      : { error: gscResult.reason?.message },
    youtube:  youtubeResult.status  === 'fulfilled' ? youtubeResult.value  : { error: youtubeResult.reason?.message },
    kit:      kitResult.status      === 'fulfilled' ? kitResult.value      : { error: kitResult.reason?.message },
    meta:     metaResult.status     === 'fulfilled' ? metaResult.value     : { error: metaResult.reason?.message },
    unbounce: unbounceResult.status === 'fulfilled' ? unbounceResult.value : { error: unbounceResult.reason?.message },
    vimeo:    vimeoResult.status    === 'fulfilled' ? vimeoResult.value    : { error: vimeoResult.reason?.message },
  };

  // ── Step 2: Send to Claude for analysis ───────────────────────────────────
  console.log('\n🧠 Sending to Claude for analysis...');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let insights;
  let rawResponse;

  try {
    const message = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 4096,
      messages:   [{ role: 'user', content: buildPrompt(data) }],
    });

    rawResponse = message.content[0].text;

    // Parse JSON — strip any accidental markdown fences
    const cleaned = rawResponse
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/,      '')
      .trim();

    insights = JSON.parse(cleaned);
    console.log('  ✅ Claude analysis complete');

  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error('❌ Claude returned invalid JSON. Retrying with stricter prompt...');

      // Retry once with an explicit correction prompt
      const retryMessage = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: 4096,
        messages:   [
          { role: 'user',      content: buildPrompt(data) },
          { role: 'assistant', content: rawResponse ?? '' },
          { role: 'user',      content: 'Your response was not valid JSON. Return ONLY the JSON object with no markdown, no backticks, no commentary. Start your response with { and end with }.' },
        ],
      });

      const retryText = retryMessage.content[0].text.trim();
      insights = JSON.parse(retryText);
      console.log('  ✅ Retry succeeded');
    } else {
      throw err;
    }
  }

  // ── Step 3: Enrich with raw data and metadata ─────────────────────────────
  insights.weekOf     = insights.weekOf || new Date().toISOString().split('T')[0];
  insights.generatedAt = new Date().toISOString();
  insights.rawData    = data;  // Dashboard can use raw data for charts

  // ── Step 4: Write output ───────────────────────────────────────────────────
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(insights, null, 2));

  console.log(`\n✅ Report saved to ${OUTPUT_PATH}`);
  console.log(`\n📋 Weekly Verdict: ${insights.weeklyVerdict}`);
  console.log(`\n🎯 Urgent Actions: ${insights.urgentActions?.length ?? 0}`);
  console.log(`💡 Insights: ${insights.insights?.length ?? 0}`);
  console.log(`🔒 Do Not Touch: ${insights.doNotTouch?.length ?? 0}`);
  console.log(`👀 Watch Next Week: ${insights.watchNextWeek?.length ?? 0}`);
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
