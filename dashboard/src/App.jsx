import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

// ── Brand ──────────────────────────────────────────────────────────────────
const NAVY  = "#1a2854";
const CYAN  = "#00bce5";
const GREEN = "#059669";
const AMBER = "#d97706";
const RED   = "#dc2626";

// ── Helpers ────────────────────────────────────────────────────────────────
function statusColor(s)  { return s === "green" ? GREEN : s === "amber" ? AMBER : RED; }
function statusBg(s)     { return s === "green" ? "#ecfdf5" : s === "amber" ? "#fffbeb" : "#fef2f2"; }
function statusBorder(s) { return s === "green" ? "#6ee7b7" : s === "amber" ? "#fcd34d" : "#fca5a5"; }
function statusIcon(s)   { return s === "green" ? "●" : s === "amber" ? "◐" : "●"; }
function fmt(n, prefix = "", suffix = "") {
  if (n == null) return "—";
  return `${prefix}${typeof n === "number" ? n.toLocaleString() : n}${suffix}`;
}
function delta(n, invert = false) {
  if (n == null) return null;
  const up = n >= 0;
  const good = invert ? !up : up;
  return (
    <span style={{ color: good ? GREEN : RED, fontWeight: 600, fontSize: 13 }}>
      {up ? "▲" : "▼"} {Math.abs(n)}%
    </span>
  );
}
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function fmtDuration(secs) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Layout Components ──────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e9f0",
      borderRadius: 12,
      padding: "24px 28px",
      ...style
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      {accent && <div style={{ width: 4, height: 22, background: accent, borderRadius: 2 }} />}
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: NAVY, fontFamily: "'Lora', serif", letterSpacing: 0.3 }}>
        {children}
      </h2>
    </div>
  );
}

function Label({ children, color = NAVY }) {
  return <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color }}>{children}</span>;
}

function PriorityBadge({ p }) {
  const colors = { high: RED, medium: AMBER, low: GREEN };
  const bgs    = { high: "#fef2f2", medium: "#fffbeb", low: "#ecfdf5" };
  return (
    <span style={{
      background: bgs[p],
      color: colors[p],
      border: `1px solid ${colors[p]}33`,
      borderRadius: 6,
      padding: "2px 10px",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: "uppercase"
    }}>{p}</span>
  );
}

// ── Section: Header ────────────────────────────────────────────────────────
function Header({ data }) {
  return (
    <div style={{
      background: NAVY,
      padding: "28px 40px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: `4px solid ${CYAN}`
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: CYAN,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 900, color: NAVY, fontFamily: "'Lora', serif"
        }}>D</div>
        <div>
          <div style={{ color: "#fff", fontFamily: "'Lora', serif", fontSize: 20, fontWeight: 700 }}>
            Duct Tape Marketing
          </div>
          <div style={{ color: CYAN, fontSize: 13, letterSpacing: 1, fontWeight: 600 }}>WEEKLY INTELLIGENCE BRIEF</div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: CYAN, fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>WEEK OF</div>
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{fmtDate(data.weekOf)}</div>
        <div style={{ color: "#8a9bbf", fontSize: 11, marginTop: 2 }}>Generated {new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>
    </div>
  );
}

// ── Section: Verdict ───────────────────────────────────────────────────────
function Verdict({ text }) {
  return (
    <Card style={{ background: NAVY, border: "none", borderLeft: `5px solid ${CYAN}` }}>
      <Label color={CYAN}>Weekly Verdict</Label>
      <p style={{ margin: "12px 0 0", color: "#e8edf7", fontSize: 17, lineHeight: 1.65, fontFamily: "'Lora', serif", fontWeight: 400 }}>
        {text}
      </p>
    </Card>
  );
}

// ── Section: Funnel Health ─────────────────────────────────────────────────
function FunnelHealth({ health }) {
  const stages = ["awareness", "consideration", "conversion", "retention"];
  const labels = { awareness: "Awareness", consideration: "Consideration", conversion: "Conversion", retention: "Retention" };

  return (
    <Card>
      <SectionTitle accent={CYAN}>Funnel Health</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {stages.map((stage, i) => {
          const h = health[stage];
          return (
            <div key={stage} style={{
              background: statusBg(h.status),
              border: `1.5px solid ${statusBorder(h.status)}`,
              borderRadius: 10,
              padding: "16px 18px",
              position: "relative"
            }}>
              {i < stages.length - 1 && (
                <div style={{
                  position: "absolute", right: -18, top: "50%", transform: "translateY(-50%)",
                  color: "#c9d0de", fontSize: 18, zIndex: 1
                }}>→</div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Label color="#6b7280">{labels[stage]}</Label>
                <span style={{ color: statusColor(h.status), fontSize: 18 }}>{statusIcon(h.status)}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{h.summary}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Section: Urgent Actions ────────────────────────────────────────────────
function UrgentActions({ actions }) {
  const [expanded, setExpanded] = useState({});
  const toggle = (i) => setExpanded(p => ({ ...p, [i]: !p[i] }));
  const sorted = [...actions].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.priority] - rank[b.priority];
  });

  return (
    <Card>
      <SectionTitle accent={RED}>Urgent Actions ({actions.length})</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map((a, i) => (
          <div key={i} style={{
            border: `1px solid ${a.priority === "high" ? "#fca5a5" : a.priority === "medium" ? "#fcd34d" : "#6ee7b7"}`,
            borderRadius: 10,
            overflow: "hidden"
          }}>
            <button
              onClick={() => toggle(i)}
              style={{
                width: "100%", background: a.priority === "high" ? "#fff5f5" : a.priority === "medium" ? "#fffdf0" : "#f0fdf4",
                border: "none", cursor: "pointer",
                padding: "14px 18px",
                display: "flex", alignItems: "center", gap: 12, textAlign: "left"
              }}
            >
              <PriorityBadge p={a.priority} />
              <span style={{ flex: 1, fontWeight: 600, color: NAVY, fontSize: 14 }}>{a.action}</span>
              <span style={{ color: "#9ca3af", fontSize: 12, whiteSpace: "nowrap" }}>Do by: <strong>{a.doBy}</strong></span>
              <span style={{ color: "#9ca3af", marginLeft: 8 }}>{expanded[i] ? "▲" : "▼"}</span>
            </button>
            {expanded[i] && (
              <div style={{ padding: "0 18px 16px", background: "#fff" }}>
                <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <Label color="#6b7280">Why</Label>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{a.why}</p>
                  </div>
                  <div>
                    <Label color="#6b7280">Expected Outcome</Label>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{a.expectedOutcome}</p>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Label color={CYAN}>How To</Label>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: "#1a2854", lineHeight: 1.5, fontWeight: 500 }}>{a.howTo}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Section: Insights ──────────────────────────────────────────────────────
function Insights({ insights }) {
  const [filter, setFilter] = useState("all");
  const sources = ["all", ...new Set(insights.map(i => i.source))];
  const filtered = filter === "all" ? insights : insights.filter(i => i.source === filter);

  const impactRank = { high: 0, medium: 1, low: 2 };
  const sorted = [...filtered].sort((a, b) => impactRank[a.impact] - impactRank[b.impact]);

  const sourceColors = {
    "GA4": "#4f46e5", "GSC": "#059669", "YouTube": "#dc2626", "Meta": "#2563eb",
    "Kit": "#d97706", "Unbounce": "#7c3aed", "Vimeo": "#0891b2", "Cross-channel": NAVY
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 4, height: 22, background: CYAN, borderRadius: 2 }} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: NAVY, fontFamily: "'Lora', serif" }}>
            Insights ({insights.length})
          </h2>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {sources.map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: "4px 12px", borderRadius: 20, border: "1px solid",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              borderColor: filter === s ? CYAN : "#e5e9f0",
              background: filter === s ? CYAN : "#fff",
              color: filter === s ? "#fff" : "#6b7280"
            }}>{s}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sorted.map((ins, i) => (
          <div key={i} style={{
            border: "1px solid #e5e9f0", borderRadius: 10, padding: "16px 20px",
            borderLeft: `4px solid ${sourceColors[ins.source] || NAVY}`
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{
                background: `${sourceColors[ins.source] || NAVY}15`,
                color: sourceColors[ins.source] || NAVY,
                border: `1px solid ${sourceColors[ins.source] || NAVY}30`,
                borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700
              }}>{ins.source}</span>
              <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>
                Impact: <span style={{ color: ins.impact === "high" ? RED : ins.impact === "medium" ? AMBER : GREEN }}>{ins.impact}</span>
                {" · "}Effort: <span style={{ color: "#374151" }}>{ins.effort}</span>
                {" · "}Confidence: <span style={{ color: "#374151" }}>{ins.confidence}</span>
              </span>
            </div>
            <p style={{ margin: "0 0 8px", fontWeight: 700, color: NAVY, fontSize: 14 }}>{ins.observation}</p>
            <p style={{ margin: "0 0 6px", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
              <strong>Meaning:</strong> {ins.meaning}
            </p>
            <p style={{ margin: "0 0 6px", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
              <strong>Why:</strong> {ins.hypothesis}
            </p>
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 14px", marginTop: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#0369a1" }}>→ ACTION: </span>
              <span style={{ fontSize: 13, color: "#0369a1" }}>{ins.recommendation}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Section: Do Not Touch ──────────────────────────────────────────────────
function DoNotTouch({ items }) {
  return (
    <Card>
      <SectionTitle accent={GREEN}>🔒 Do Not Touch ({items.length})</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            background: "#f0fdf4", border: "1.5px solid #6ee7b7",
            borderRadius: 10, padding: "16px 18px"
          }}>
            <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#065f46", fontSize: 14 }}>{item.thing}</p>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{item.reason}</p>
            <div style={{ background: "#d1fae5", borderRadius: 6, padding: "6px 10px", display: "inline-block" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#065f46" }}>{item.metric}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Section: Watch Next Week ───────────────────────────────────────────────
function WatchNextWeek({ items }) {
  return (
    <Card>
      <SectionTitle accent={AMBER}>👀 Watch Next Week ({items.length})</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            background: "#fffbeb", border: "1.5px solid #fcd34d",
            borderRadius: 10, padding: "16px 18px",
            display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 16, alignItems: "start"
          }}>
            <div>
              <Label color="#92400e">Metric</Label>
              <p style={{ margin: "6px 0 0", fontWeight: 700, color: NAVY, fontSize: 14 }}>{item.metric}</p>
            </div>
            <div>
              <Label color="#92400e">Why We're Watching</Label>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{item.because}</p>
            </div>
            <div>
              <Label color="#92400e">Act If</Label>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{item.threshold}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Section: GA4 Panel ─────────────────────────────────────────────────────
function GA4Panel({ ga4 }) {
  const { overview, daily, channels, topPages, weekOverWeek } = ga4;
  const tw = overview?.this_week || {};
  const lw = overview?.last_week || {};

  const dailyData = (daily || []).map(d => ({
    date: `${d.date.slice(4, 6)}/${d.date.slice(6, 8)}`,
    sessions: d.sessions,
    engaged: d.engagedSessions
  }));

  const channelData = Object.entries(channels || {}).map(([name, v]) => ({
    name: name.replace("Organic Search", "Organic").replace("Paid Social", "Paid"),
    sessions: v.this_week?.sessions || 0
  })).sort((a, b) => b.sessions - a.sessions);

  return (
    <Card>
      <SectionTitle accent="#4f46e5">GA4 — Website Analytics</SectionTitle>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Sessions", val: tw.sessions, d: weekOverWeek?.sessionsDelta },
          { label: "New Users", val: tw.newUsers, d: weekOverWeek?.newUsersDelta },
          { label: "Engaged Sessions", val: tw.engagedSessions, d: weekOverWeek?.engagementDelta },
          { label: "Bounce Rate", val: tw.bounceRate ? `${(tw.bounceRate * 100).toFixed(1)}%` : null, d: weekOverWeek?.bounceRateDelta, invert: true }
        ].map(({ label, val, d, invert }, i) => (
          <div key={i} style={{ background: "#f8faff", borderRadius: 8, padding: "14px 16px" }}>
            <Label color="#6b7280">{label}</Label>
            <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: "6px 0 4px", fontFamily: "'Lora', serif" }}>
              {fmt(val)}
            </div>
            {delta(d, invert)}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20, marginBottom: 24 }}>
        <div>
          <Label color="#6b7280">Daily Sessions</Label>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={dailyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="sessions" stroke={NAVY} strokeWidth={2} dot={{ r: 3 }} name="Sessions" />
              <Line type="monotone" dataKey="engaged" stroke={CYAN} strokeWidth={2} dot={{ r: 3 }} name="Engaged" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div>
          <Label color="#6b7280">Traffic by Channel</Label>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={channelData} cx="50%" cy="50%" outerRadius={65} dataKey="sessions" nameKey="name">
                {channelData.map((_, i) => (
                  <Cell key={i} fill={[NAVY, CYAN, "#4f46e5", AMBER, GREEN][i % 5]} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [v.toLocaleString(), n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Pages */}
      <Label color="#6b7280">Top Pages</Label>
      <div style={{ marginTop: 10, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e9f0" }}>
              {["Page", "Sessions", "Engaged", "Bounce Rate", "Avg Duration"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: h === "Page" ? "left" : "right", color: "#6b7280", fontWeight: 700, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(topPages || []).slice(0, 6).map((p, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "9px 12px", color: NAVY, fontWeight: 500, maxWidth: 240 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.path}
                  </div>
                </td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}>{p.sessions?.toLocaleString()}</td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}>{p.engagedSessions?.toLocaleString()}</td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}>{p.bounceRate != null ? `${(p.bounceRate * 100).toFixed(1)}%` : "—"}</td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}>{fmtDuration(p.avgDuration)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Section: GSC Panel ─────────────────────────────────────────────────────
function GSCPanel({ gsc }) {
  const { topQueries, risingQueries, opportunities } = gsc;
  const [view, setView] = useState("top");
  const views = { top: topQueries, rising: risingQueries, opportunities };
  const data = (views[view] || []).slice(0, 12);

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 4, height: 22, background: GREEN, borderRadius: 2 }} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: NAVY, fontFamily: "'Lora', serif" }}>Google Search Console</h2>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["top", "Top Queries"], ["rising", `Rising (${(risingQueries||[]).length})`], ["opportunities", `Opportunities (${(opportunities||[]).length})`]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{
              padding: "4px 12px", borderRadius: 20, border: "1px solid",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              borderColor: view === k ? GREEN : "#e5e9f0",
              background: view === k ? GREEN : "#fff",
              color: view === k ? "#fff" : "#6b7280"
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e9f0" }}>
              {["Query", "Clicks", "Impressions", "CTR", "Position", ...(view === "top" ? ["Δ Position"] : [])].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: h === "Query" ? "left" : "right", color: "#6b7280", fontWeight: 700, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((q, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "9px 12px", color: NAVY, fontWeight: 500, maxWidth: 280 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.key}</div>
                </td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}>{q.clicks}</td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}>{q.impressions?.toLocaleString()}</td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}>{q.ctr}%</td>
                <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: q.position <= 5 ? 700 : 400, color: q.position <= 3 ? GREEN : q.position <= 10 ? AMBER : "#374151" }}>
                  {q.position}
                </td>
                {view === "top" && (
                  <td style={{ padding: "9px 12px", textAlign: "right" }}>
                    {q.positionDelta != null ? (
                      <span style={{ color: q.positionDelta > 0 ? GREEN : q.positionDelta < 0 ? RED : "#6b7280", fontWeight: 600 }}>
                        {q.positionDelta > 0 ? "▲" : q.positionDelta < 0 ? "▼" : "—"} {Math.abs(q.positionDelta)}
                      </span>
                    ) : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Section: YouTube Panel ─────────────────────────────────────────────────
function YouTubePanel({ youtube }) {
  const { channel, thisWeek, weekOverWeek, topVideos } = youtube;
  return (
    <Card>
      <SectionTitle accent="#dc2626">YouTube Analytics</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Views", val: thisWeek?.views?.toLocaleString(), d: weekOverWeek?.viewsDelta },
          { label: "Watch Minutes", val: thisWeek?.estimatedMinutesWatched?.toLocaleString(), d: weekOverWeek?.watchTimeDelta },
          { label: "Avg View Duration", val: fmtDuration(thisWeek?.averageViewDuration), d: weekOverWeek?.avgDurationDelta },
          { label: "Net Subscribers", val: `+${weekOverWeek?.subscriberNetThis || 0}`, d: null }
        ].map(({ label, val, d }, i) => (
          <div key={i} style={{ background: "#fff5f5", borderRadius: 8, padding: "14px 16px" }}>
            <Label color="#6b7280">{label}</Label>
            <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: "6px 0 4px", fontFamily: "'Lora', serif" }}>{val}</div>
            {delta(d)}
          </div>
        ))}
      </div>
      <Label color="#6b7280">Top Videos This Week</Label>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {(topVideos || []).slice(0, 5).map((v, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8f9ff", borderRadius: 8 }}>
            <span style={{ fontWeight: 800, color: "#9ca3af", fontSize: 15, width: 20 }}>#{i + 1}</span>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontWeight: 600, color: NAVY, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</div>
            </div>
            <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>{v.views?.toLocaleString()} views</span>
              <span style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>{v.avgViewPercentage}% watched</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Section: Meta Panel ────────────────────────────────────────────────────
function MetaPanel({ meta }) {
  const { thisWeek, lastWeek, weekOverWeek, campaigns } = meta;
  return (
    <Card>
      <SectionTitle accent="#2563eb">Meta Ads</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Spend", val: `$${thisWeek?.spend?.toFixed(2)}`, d: weekOverWeek?.spendDelta },
          { label: "Impressions", val: thisWeek?.impressions?.toLocaleString(), d: weekOverWeek?.impressionsDelta },
          { label: "Leads", val: thisWeek?.leads, d: weekOverWeek?.leadsDelta },
          { label: "Cost Per Lead", val: `$${thisWeek?.costPerLead?.toFixed(2)}`, d: weekOverWeek?.costPerLeadDelta, invert: true }
        ].map(({ label, val, d, invert }, i) => (
          <div key={i} style={{ background: "#eff6ff", borderRadius: 8, padding: "14px 16px" }}>
            <Label color="#6b7280">{label}</Label>
            <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: "6px 0 4px", fontFamily: "'Lora', serif" }}>{val}</div>
            {delta(d, invert)}
          </div>
        ))}
      </div>
      <Label color="#6b7280">Campaigns</Label>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {(campaigns || []).map((c, i) => {
          const target = 28;
          const over = c.costPerLead > target;
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
              alignItems: "center", gap: 12, padding: "10px 14px",
              background: over ? "#fff5f5" : "#f8f9ff", borderRadius: 8,
              border: over ? "1px solid #fca5a5" : "1px solid transparent"
            }}>
              <span style={{ fontWeight: 600, color: NAVY, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.campaignName}</span>
              <span style={{ fontSize: 12, textAlign: "right" }}>${c.spend?.toFixed(0)} spend</span>
              <span style={{ fontSize: 12, textAlign: "right" }}>{c.leads} leads</span>
              <span style={{ fontSize: 12, textAlign: "right", color: over ? RED : GREEN, fontWeight: 700 }}>
                ${c.costPerLead?.toFixed(0)} CPL
              </span>
              <span style={{ fontSize: 12, textAlign: "right" }}>{c.ctr}% CTR</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Section: Kit Panel ─────────────────────────────────────────────────────
function KitPanel({ kit }) {
  const { subscribers, averages, recentBroadcasts } = kit;
  const broadcastData = (recentBroadcasts || []).map((b, i) => ({
    name: `#${(recentBroadcasts.length - i)}`,
    openRate: b.openRate,
    clickRate: b.clickRate,
    subject: b.subject
  })).reverse();

  return (
    <Card>
      <SectionTitle accent={AMBER}>Kit Newsletter</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Active Subscribers", val: subscribers?.active?.toLocaleString() },
          { label: "New This Week", val: `+${subscribers?.newThisWeek}` },
          { label: "Avg Open Rate", val: `${averages?.openRate}%` },
          { label: "Avg Click Rate", val: `${averages?.clickRate}%` }
        ].map(({ label, val }, i) => (
          <div key={i} style={{ background: "#fffbeb", borderRadius: 8, padding: "14px 16px" }}>
            <Label color="#6b7280">{label}</Label>
            <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: "6px 0 0", fontFamily: "'Lora', serif" }}>{val}</div>
          </div>
        ))}
      </div>

      <Label color="#6b7280">Broadcast Performance (Last 4)</Label>
      <div style={{ marginTop: 12 }}>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={broadcastData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, n) => [`${v}%`, n === "openRate" ? "Open Rate" : "Click Rate"]} />
            <Bar dataKey="openRate" fill={NAVY} radius={[4, 4, 0, 0]} name="Open Rate" />
            <Bar dataKey="clickRate" fill={CYAN} radius={[4, 4, 0, 0]} name="Click Rate" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {(recentBroadcasts || []).map((b, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "3fr 1fr 1fr 1fr",
            padding: "9px 12px", background: i === 0 ? "#fffbeb" : "#f8f9ff",
            borderRadius: 8, gap: 12, alignItems: "center",
            border: i === 0 ? "1px solid #fcd34d" : "1px solid transparent"
          }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {i === 0 && "⭐ "}{b.subject}
            </span>
            <span style={{ fontSize: 12, textAlign: "right", fontWeight: i === 0 ? 700 : 400, color: i === 0 ? AMBER : "#374151" }}>{b.openRate}% open</span>
            <span style={{ fontSize: 12, textAlign: "right" }}>{b.clickRate}% click</span>
            <span style={{ fontSize: 12, textAlign: "right", color: "#9ca3af" }}>{b.recipientCount?.toLocaleString()} sent</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Section: Unbounce Panel ────────────────────────────────────────────────
function UnbouncePanel({ unbounce }) {
  const { topPages, activeABTests, averageConversionRate } = unbounce;
  return (
    <Card>
      <SectionTitle accent="#7c3aed">Unbounce — Landing Pages</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20 }}>
        <div>
          <Label color="#6b7280">Pages by Visitors</Label>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {(topPages || []).map((p, i) => {
              const pct = p.thisWeek?.conversionRate;
              const avg = averageConversionRate;
              const flag = pct < avg * 0.5 && p.thisWeek?.visitors > 50;
              return (
                <div key={i} style={{
                  padding: "12px 14px", borderRadius: 8,
                  background: flag ? "#fff5f5" : "#f8f9ff",
                  border: flag ? "1px solid #fca5a5" : "1px solid #e5e9f0"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: NAVY, fontSize: 13 }}>{p.pageName}</span>
                    {flag && <span style={{ fontSize: 11, color: RED, fontWeight: 700 }}>⚠ LOW CONV</span>}
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{p.thisWeek?.visitors} visitors</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: flag ? RED : GREEN }}>{pct}% conv</span>
                    {p.conversionDelta != null && <span style={{ fontSize: 12, color: p.conversionDelta >= 0 ? GREEN : RED, fontWeight: 600 }}>
                      {p.conversionDelta >= 0 ? "▲" : "▼"}{Math.abs(p.conversionDelta)}%
                    </span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {(activeABTests || []).length > 0 && (
          <div>
            <Label color="#6b7280">Active A/B Tests</Label>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
              {activeABTests.map((test, i) => {
                const sorted = [...test.variants].sort((a, b) => b.conversionRate - a.conversionRate);
                const winner = sorted[0];
                const loser  = sorted[sorted.length - 1];
                const lift   = winner && loser ? ((winner.conversionRate - loser.conversionRate) / loser.conversionRate * 100).toFixed(0) : null;
                return (
                  <div key={i} style={{ background: "#faf5ff", border: "1.5px solid #c4b5fd", borderRadius: 10, padding: "14px 16px" }}>
                    <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#5b21b6", fontSize: 13 }}>{test.pageName}</p>
                    {sorted.map((v, j) => (
                      <div key={j} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "6px 8px", borderRadius: 6, marginBottom: 4,
                        background: j === 0 ? "#ede9fe" : "#f3f4f6"
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: j === 0 ? "#5b21b6" : "#6b7280" }}>
                          {j === 0 ? "🏆 " : ""}Variant {v.variantId?.slice(-1).toUpperCase()}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: j === 0 ? "#5b21b6" : "#374151" }}>{v.conversionRate}%</span>
                      </div>
                    ))}
                    {lift && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#5b21b6", fontWeight: 600 }}>+{lift}% lift → declare B winner</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Section: Vimeo Panel ───────────────────────────────────────────────────
function VimeoPanel({ vimeo }) {
  const { topVideos, totals } = vimeo;
  return (
    <Card>
      <SectionTitle accent="#0891b2">Vimeo — Video Sales Letters</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Plays", val: totals?.totalPlays },
          { label: "Watch Minutes", val: totals?.totalWatchMinutes?.toLocaleString() },
          { label: "Avg Finish Rate", val: `${totals?.avgFinishRate}%` }
        ].map(({ label, val }, i) => (
          <div key={i} style={{ background: "#ecfeff", borderRadius: 8, padding: "14px 16px" }}>
            <Label color="#6b7280">{label}</Label>
            <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: "6px 0 0", fontFamily: "'Lora', serif" }}>{fmt(val)}</div>
          </div>
        ))}
      </div>

      {(topVideos || []).map((v, i) => {
        const eng = v.engagement;
        const dropBad = v.thisWeek?.finishRate < 40;
        return (
          <div key={i} style={{
            border: dropBad ? "1.5px solid #fca5a5" : "1.5px solid #a5f3fc",
            borderRadius: 10, padding: "16px 20px", marginBottom: 12,
            background: dropBad ? "#fff5f5" : "#f0fdfe"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>{v.title}</span>
              {dropBad && <span style={{ fontSize: 11, fontWeight: 700, color: RED, background: "#fee2e2", padding: "3px 10px", borderRadius: 20 }}>⚠ LOW FINISH RATE</span>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: eng ? 14 : 0 }}>
              {[
                { label: "Plays", val: v.thisWeek?.plays, prev: v.lastWeek?.plays },
                { label: "Play Rate", val: v.thisWeek?.playRate != null ? `${v.thisWeek.playRate}%` : "—" },
                { label: "Finish Rate", val: v.thisWeek?.finishRate != null ? `${v.thisWeek.finishRate}%` : "—", bad: dropBad },
                { label: "Watch Mins", val: v.thisWeek?.watchMinutes?.toLocaleString() }
              ].map(({ label, val, bad }, j) => (
                <div key={j} style={{ textAlign: "center", background: "#fff", borderRadius: 6, padding: "10px" }}>
                  <Label color="#6b7280">{label}</Label>
                  <div style={{ fontSize: 18, fontWeight: 800, color: bad ? RED : NAVY, marginTop: 6, fontFamily: "'Lora', serif" }}>{val}</div>
                </div>
              ))}
            </div>

            {eng && (
              <div>
                <Label color="#6b7280">Retention at Key Points</Label>
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {[["25%", eng["25pct"]], ["50%", eng["50pct"]], ["75%", eng["75pct"]], ["90%", eng["90pct"]]].map(([mark, val], j) => (
                    <div key={j} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{mark}</div>
                      <div style={{
                        width: 52, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, fontSize: 14,
                        background: val > 60 ? "#d1fae5" : val > 40 ? "#fef3c7" : "#fee2e2",
                        color: val > 60 ? GREEN : val > 40 ? AMBER : RED
                      }}>{val != null ? `${val}%` : "—"}</div>
                    </div>
                  ))}
                  {eng.biggestDropSeconds != null && (
                    <div style={{ marginLeft: 8, background: "#fff1f2", border: "1px solid #fda4af", borderRadius: 8, padding: "6px 12px" }}>
                      <span style={{ fontSize: 12, color: RED, fontWeight: 700 }}>
                        Biggest drop at {fmtDuration(eng.biggestDropSeconds)} ({eng.biggestDropPct}% drop)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeNav, setActiveNav] = useState("overview");

  useEffect(() => {
    fetch("/insights.json")
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load insights.json (${r.status})`);
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  const navItems = [
    { id: "overview",  label: "Overview" },
    { id: "actions",   label: "Actions" },
    { id: "insights",  label: "Insights" },
    { id: "ga4",       label: "GA4" },
    { id: "gsc",       label: "Search" },
    { id: "youtube",   label: "YouTube" },
    { id: "meta",      label: "Meta Ads" },
    { id: "kit",       label: "Email" },
    { id: "unbounce",  label: "Landing Pages" },
    { id: "vimeo",     label: "Vimeo" },
  ];

  const scrollTo = (id) => {
    setActiveNav(id);
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 40, textAlign: "center", maxWidth: 440 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ color: NAVY, fontFamily: "'Lora', serif" }}>Could not load insights</h2>
        <p style={{ color: "#6b7280", fontSize: 14 }}>{error}</p>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Make sure <code>insights.json</code> exists in <code>public/</code> and your dev server is running.</p>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, border: `4px solid ${NAVY}`, borderTopColor: CYAN, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ color: NAVY, fontWeight: 600 }}>Loading weekly insights…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  const raw = data.rawData || {};

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .nav-item:hover { background: rgba(0,188,229,0.1) !important; }
      `}</style>

      {/* Top Nav */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "#fff", borderBottom: "1px solid #e5e9f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <Header data={data} />
        <nav style={{ padding: "0 40px", display: "flex", gap: 4, overflowX: "auto" }}>
          {navItems.map(item => (
            <button
              key={item.id}
              className="nav-item"
              onClick={() => scrollTo(item.id)}
              style={{
                padding: "12px 16px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: activeNav === item.id ? 700 : 500,
                color: activeNav === item.id ? CYAN : "#374151",
                borderBottom: `2px solid ${activeNav === item.id ? CYAN : "transparent"}`,
                whiteSpace: "nowrap",
                transition: "all 0.15s"
              }}
            >{item.label}</button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 40px", display: "flex", flexDirection: "column", gap: 24 }}>

        <div id="section-overview" />
        <Verdict text={data.weeklyVerdict} />
        <FunnelHealth health={data.funnelHealth} />

        <div id="section-actions" />
        <UrgentActions actions={data.urgentActions || []} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <DoNotTouch items={data.doNotTouch || []} />
          <WatchNextWeek items={data.watchNextWeek || []} />
        </div>

        <div id="section-insights" />
        <Insights insights={data.insights || []} />

        <div id="section-ga4" />
        {raw.ga4 && !raw.ga4.error && <GA4Panel ga4={raw.ga4} />}

        <div id="section-gsc" />
        {raw.gsc && !raw.gsc.error && <GSCPanel gsc={raw.gsc} />}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <div id="section-youtube" />
            {raw.youtube && !raw.youtube.error && <YouTubePanel youtube={raw.youtube} />}
          </div>
          <div>
            <div id="section-meta" />
            {raw.meta && !raw.meta.error && <MetaPanel meta={raw.meta} />}
          </div>
        </div>

        <div id="section-kit" />
        {raw.kit && !raw.kit.error && <KitPanel kit={raw.kit} />}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <div id="section-unbounce" />
            {raw.unbounce && !raw.unbounce.error && <UnbouncePanel unbounce={raw.unbounce} />}
          </div>
          <div>
            <div id="section-vimeo" />
            {raw.vimeo && !raw.vimeo.error && <VimeoPanel vimeo={raw.vimeo} />}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "20px 0 8px", color: "#9ca3af", fontSize: 12 }}>
          Duct Tape Marketing · Weekly Intelligence Brief · Powered by Claude · Auto-generated Monday 8am UTC
        </div>
      </main>
    </div>
  );
}
