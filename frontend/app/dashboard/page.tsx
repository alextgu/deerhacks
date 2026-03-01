"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { getDisplayName, getFirstName, getInitials } from "@/lib/user-display";
import { NavWalletDropdown } from "@/components/nav-wallet-dropdown";
import { LoadingScreen } from "@/components/loading-screen";
import { ChatModal } from "@/components/chat-modal";

type ProfileData = {
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  wallet_address?: string | null;
  sol_balance?: number | null;
  karma_score?: number | null;
};

// ── Dimension → axis mapping (mirrors spider_chart.py) ────────────────────────
const DIMENSION_VARS: Record<string, string[]> = {
  "Creativity":  ["abstract_thinking", "novelty_seeking", "creative_drive", "contrarianism", "depth_vs_breadth"],
  "Logic":       ["systems_thinking", "pattern_recognition", "detail_orientation", "decisiveness", "long_term_thinking"],
  "Social":      ["social_energy", "empathy_signaling", "collaboration_enjoyment", "emotional_expressiveness", "leadership_drive"],
  "Tech":        ["execution_bias", "structure_need", "perfectionism", "deadline_orientation", "async_preference"],
  "Writing":     ["verbosity", "storytelling_tendency", "question_asking_rate", "directness", "formality"],
  "Science":     ["intellectual_humility", "intrinsic_motivation", "impact_orientation", "ambition", "risk_tolerance"],
};

function extractChartScores(raw: Record<string, number>): number[] {
  return Object.values(DIMENSION_VARS).map(vars => {
    const vals = vars.map(v => raw[v] ?? 0.5);
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  });
}

// ── Spider Chart ──────────────────────────────────────────────────────────────
function SpiderChart({ values, color, size = 220 }: { values: number[]; color: string; size?: number }) {
  const [disp, setDisp] = useState(values);
  const target = useRef(values);
  useEffect(() => { target.current = values; }, [values]);
  useEffect(() => {
    let raf: number;
    const tick = () => {
      setDisp(prev => prev.map((v, i) => { const d = target.current[i] - v; return Math.abs(d) < 0.001 ? target.current[i] : v + d * 0.05; }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const axes = ["Creativity", "Logic", "Social", "Tech", "Writing", "Science"];
  const n = axes.length, cx = size / 2, cy = size / 2, r = size * 0.36;
  const toXY = (i: number, v: number) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return { x: cx + Math.cos(a) * r * v, y: cy + Math.sin(a) * r * v }; };
  const path = (vals: number[]) => vals.map((v, i) => { const p = toXY(i, v); return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ") + "Z";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[.25, .5, .75, 1].map(rv => <polygon key={rv} points={axes.map((_, i) => { const p = toXY(i, rv); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />)}
      {axes.map((_, i) => { const p = toXY(i, 1); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />; })}
      <path d={path(disp)} fill={`${color}20`} stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {disp.map((v, i) => { const p = toXY(i, v); return <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} />; })}
      {axes.map((l, i) => { const p = toXY(i, 1.3); return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="rgba(255,255,255,0.45)" fontFamily="'Outfit',sans-serif" fontWeight="600">{l}</text>; })}
    </svg>
  );
}

// ── MatchMaker Modal ──────────────────────────────────────────────────────────
const MATCH_TYPES = [
  { id: "hackathon",    label: "Hackathon Partner", desc: "Build something in 24–48hrs" },
  { id: "friend",       label: "Friend",             desc: "Same vibe, different worlds" },
  { id: "cofounder",    label: "Co-founder",         desc: "Build a company together" },
  { id: "studybuddy",   label: "Study Buddy",        desc: "Learn & level up together" },
  { id: "mentor",       label: "Mentor / Mentee",    desc: "Guidance or give it" },
  { id: "collaborator", label: "Collaborator",       desc: "Creative or technical project" },
];

function MatchMakerModal({ onClose, currentUserId }: { onClose: () => void; currentUserId: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Array<{ auth0_id: string; first_name?: string; last_name?: string; avatar_url?: string | null; archetype?: string; match_blurb: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [chatMatch, setChatMatch] = useState<{ matchId: string; matchBlurb: string | null } | null>(null);

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const canSearch = selected.length > 0 && count > 0 && !searching;

  const [searchPhase, setSearchPhase] = useState("");

  const handleSearch = async () => {
    if (!canSearch) return;
    setSearching(true);
    setError(null);
    setResults(null);
    setSearchPhase("Connecting to Snowflake…");

    const MIN_SEARCH_MS = 10000;
    const startTime = Date.now();

    const phases = [
      { at: 0, msg: "Connecting to Snowflake…" },
      { at: 1500, msg: "Loading your archetype vector…" },
      { at: 3000, msg: "Scanning candidate pool…" },
      { at: 5000, msg: "Running cosine similarity…" },
      { at: 7000, msg: "Ranking top matches…" },
      { at: 8500, msg: "Generating match insights…" },
    ];
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const p of phases) {
      timers.push(setTimeout(() => setSearchPhase(p.msg), p.at));
    }

    const context = selected.join(",");
    const params = new URLSearchParams({ server_id: "general", top_n: String(count), context });

    let fetchResult: { ok: boolean; data?: { suggestedMatches?: Array<{ auth0_id: string; first_name?: string; last_name?: string; avatar_url?: string | null; archetype?: string; match_blurb: string }> }; error?: string } | null = null;

    try {
      const res = await fetch(`/api/matches?${params}`);
      const data = await res.json();
      if (!res.ok) {
        fetchResult = { ok: false, error: data.error || "Matching failed" };
      } else {
        fetchResult = { ok: true, data };
      }
    } catch {
      fetchResult = { ok: false, error: "Network error — try again" };
    }

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, MIN_SEARCH_MS - elapsed);

    if (remaining > 0) {
      setSearchPhase("Finalizing results…");
      await new Promise(resolve => setTimeout(resolve, remaining));
    }

    timers.forEach(clearTimeout);

    if (fetchResult?.ok) {
      setResults(fetchResult.data?.suggestedMatches ?? []);
    } else {
      setError(fetchResult?.error ?? "Something went wrong");
    }
    setSearching(false);
  };

  const handleConnect = async (r: { auth0_id: string; match_blurb: string }) => {
    setConnectingId(r.auth0_id);
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchedUserId: r.auth0_id,
          matchBlurb: r.match_blurb,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create match");
      setChatMatch({ matchId: data.match.id, matchBlurb: data.match.match_blurb });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setConnectingId(null);
    }
  };

  if (chatMatch) {
    return (
      <ChatModal
        matchId={chatMatch.matchId}
        currentUserId={currentUserId}
        matchBlurb={chatMatch.matchBlurb}
        onClose={() => { setChatMatch(null); onClose(); }}
      />
    );
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", background: "rgba(10,10,15,0.78)" }} />
      <div
        style={{ position: "relative", background: "linear-gradient(145deg,#14121f,#0e0c18)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: 28, padding: "2.5rem", maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 40px 100px rgba(0,0,0,0.6),0 0 0 1px rgba(124,58,237,0.1),inset 0 1px 0 rgba(255,255,255,0.06)", animation: "matchModalIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, borderRadius: "28px 28px 0 0", background: "linear-gradient(90deg,#7c3aed,#a78bfa,#f97316,#a78bfa,#7c3aed)", backgroundSize: "200% 100%", animation: "shimmerBar 3s linear infinite" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.4rem" }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#a78bfa" }}>Matchmaker</div>
            </div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.6rem", fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.1, color: "rgba(255,255,255,0.95)" }}>
              {results ? "Your " : "Find your "}<em style={{ fontStyle: "italic", color: "#a78bfa" }}>{results ? "matches." : "people."}</em>
            </h2>
            {!results && <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", marginTop: "0.4rem", lineHeight: 1.6 }}>Pick what you're looking for and how many — we'll rank by closest overlap.</p>}
          </div>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.5)", flexShrink: 0, transition: "all 0.2s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.3)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(239,68,68,0.7)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.5)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Results view */}
        {results ? (
          <div>
            {results.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>No matches found yet — check back as more people join.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {results.map((r, i) => {
                  const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "Anonymous";
                  const init = r.first_name?.[0]?.toUpperCase() ?? "?";
                  const isConnecting = connectingId === r.auth0_id;
                  return (
                    <div key={r.auth0_id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 14, padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.85rem", flexShrink: 0, overflow: "hidden", border: "2px solid rgba(124,58,237,0.4)" }}>
                        {r.avatar_url ? <img src={r.avatar_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : init}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                          <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{name}</span>
                          {r.archetype && <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#a78bfa", background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: 100, padding: "0.08rem 0.5rem", letterSpacing: 0.5 }}>{r.archetype}</span>}
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.55 }}>{r.match_blurb}</div>
                      </div>
                      <button
                        onClick={() => handleConnect(r)}
                        disabled={isConnecting || connectingId !== null}
                        style={{
                          flexShrink: 0,
                          background: isConnecting ? "rgba(124,58,237,0.15)" : "linear-gradient(135deg,#7c3aed,#9333ea)",
                          color: "white",
                          border: "none",
                          borderRadius: 10,
                          padding: "0.55rem 1rem",
                          fontFamily: "var(--font)",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          cursor: isConnecting || connectingId !== null ? "not-allowed" : "pointer",
                          opacity: connectingId !== null && !isConnecting ? 0.4 : 1,
                          transition: "all 0.2s",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          boxShadow: isConnecting ? "none" : "0 3px 12px rgba(124,58,237,0.35)",
                        }}
                      >
                        {isConnecting ? (
                          <>
                            <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", animation: "spin 0.8s linear infinite" }} />
                            Connecting…
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                            Connect
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {error && <div style={{ marginTop: "1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "0.7rem 1rem", fontSize: "0.78rem", color: "rgba(239,68,68,0.85)" }}>{error}</div>}
            <button onClick={() => { setResults(null); setError(null); }} style={{ width: "100%", marginTop: "1.25rem", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "0.75rem", fontFamily: "var(--font)", fontSize: "0.85rem", fontWeight: 600, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>← Search again</button>
          </div>
        ) : (
          <div>
            {/* Section 1: Match type */}
            <div style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", fontWeight: 800, color: "#a78bfa", flexShrink: 0 }}>1</div>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>What are you looking for?</span>
                <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>Select all that apply</span>
                {selected.length > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: "0.65rem", fontWeight: 700, color: "#a78bfa", background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: 100, padding: "0.1rem 0.55rem", flexShrink: 0 }}>{selected.length} selected</span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                {MATCH_TYPES.map(type => {
                  const isOn = selected.includes(type.id);
                  return (
                    <button
                      key={type.id}
                      onClick={() => toggle(type.id)}
                      style={{ background: isOn ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${isOn ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "0.9rem 1rem", cursor: "pointer", textAlign: "left", transition: "all 0.2s", position: "relative", overflow: "hidden" }}
                      onMouseEnter={e => { if (!isOn) { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(124,58,237,0.3)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,58,237,0.06)"; } }}
                      onMouseLeave={e => { if (!isOn) { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)"; } }}
                    >
                      {isOn && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,#7c3aed,#a78bfa)", borderRadius: "14px 14px 0 0" }} />}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                        <div>
                          <div style={{ fontSize: "0.88rem", fontWeight: 700, color: isOn ? "white" : "rgba(255,255,255,0.75)", marginBottom: "0.25rem" }}>{type.label}</div>
                          <div style={{ fontSize: "0.72rem", color: isOn ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>{type.desc}</div>
                        </div>
                        <div style={{ width: 18, height: 18, borderRadius: 6, border: `1.5px solid ${isOn ? "#a78bfa" : "rgba(255,255,255,0.15)"}`, background: isOn ? "rgba(124,58,237,0.3)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, transition: "all 0.2s" }}>
                          {isOn && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 0 2rem" }} />

            {/* Section 2: Count */}
            <div style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", fontWeight: 800, color: "#a78bfa", flexShrink: 0 }}>2</div>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>How many matches do you want?</span>
                {count > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: "0.65rem", fontWeight: 700, color: count <= 3 ? "#22c55e" : count <= 7 ? "#fbbf24" : "#f97316", background: count <= 3 ? "rgba(34,197,94,0.08)" : count <= 7 ? "rgba(251,191,36,0.08)" : "rgba(249,115,22,0.08)", border: `1px solid ${count <= 3 ? "rgba(34,197,94,0.2)" : count <= 7 ? "rgba(251,191,36,0.2)" : "rgba(249,115,22,0.2)"}`, borderRadius: 100, padding: "0.1rem 0.55rem", flexShrink: 0 }}>{count} {count === 1 ? "match" : "matches"}</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginBottom: "1.1rem" }}>
                <button onClick={() => setCount(c => Math.max(0, c - 1))} style={{ width: 48, height: 48, borderRadius: 14, background: count === 0 ? "rgba(255,255,255,0.02)" : "rgba(124,58,237,0.08)", border: `1px solid ${count === 0 ? "rgba(255,255,255,0.06)" : "rgba(124,58,237,0.3)"}`, cursor: count === 0 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: count === 0 ? "rgba(255,255,255,0.18)" : "#a78bfa", fontSize: "1.4rem", fontWeight: 300, transition: "all 0.2s", flexShrink: 0 }}>−</button>
                <div style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "1rem" }}>
                  <div style={{ fontFamily: "var(--serif)", fontSize: "3.5rem", fontWeight: 700, letterSpacing: -3, color: count === 0 ? "rgba(255,255,255,0.12)" : "#a78bfa", lineHeight: 1, transition: "color 0.3s" }}>{count}</div>
                  <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.25)", fontWeight: 700, letterSpacing: 2, marginTop: "0.2rem" }}>MATCHES</div>
                </div>
                <button onClick={() => setCount(c => Math.min(20, c + 1))} style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#a78bfa", fontSize: "1.4rem", fontWeight: 300, transition: "all 0.2s", flexShrink: 0 }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,58,237,0.18)"; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,58,237,0.08)"; }}>+</button>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {[1, 3, 5, 10].map(n => (
                  <button key={n} onClick={() => setCount(n)} style={{ flex: 1, padding: "0.55rem", borderRadius: 10, border: `1px solid ${count === n ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.07)"}`, background: count === n ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.03)", cursor: "pointer", fontSize: "0.8rem", fontWeight: 700, color: count === n ? "#a78bfa" : "rgba(255,255,255,0.38)", transition: "all 0.2s", fontFamily: "var(--font)" }}>{n}</button>
                ))}
              </div>
            </div>

            {error && <div style={{ marginBottom: "1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "0.7rem 1rem", fontSize: "0.78rem", color: "rgba(239,68,68,0.85)" }}>{error}</div>}

            <button
              disabled={!canSearch}
              onClick={handleSearch}
              style={{ width: "100%", padding: "1rem", borderRadius: 14, border: "none", background: canSearch ? "linear-gradient(135deg,#7c3aed,#9333ea)" : "rgba(255,255,255,0.05)", color: canSearch ? "white" : "rgba(255,255,255,0.22)", fontFamily: "var(--font)", fontSize: "0.95rem", fontWeight: 700, cursor: canSearch ? "pointer" : "not-allowed", transition: "all 0.3s", boxShadow: canSearch ? "0 6px 24px rgba(124,58,237,0.4)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem" }}
              onMouseEnter={e => { if (canSearch) { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 10px 32px rgba(124,58,237,0.55)"; } }}
              onMouseLeave={e => { if (canSearch) { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 24px rgba(124,58,237,0.4)"; } }}
            >
              {searching ? (
                <>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", animation: "spin 0.8s linear infinite" }} />
                  {searchPhase || "Searching…"}
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  {canSearch ? `Find ${count} ${count === 1 ? "match" : "matches"} →` : "Select a type & count to search"}
                </>
              )}
            </button>

            {!canSearch && !searching && (
              <p style={{ textAlign: "center", fontSize: "0.7rem", color: "rgba(255,255,255,0.18)", marginTop: "0.65rem" }}>
                {selected.length === 0 && count === 0 ? "Pick at least one type and set a count above" : selected.length === 0 ? "Pick at least one match type above" : "Set how many matches you want"}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── How-To Modal ──────────────────────────────────────────────────────────────
function HowToModal({ onClose }: { onClose: () => void }) {
  const steps = [
    { num: "01", title: "Go to Google Takeout", desc: "Open takeout.google.com in your browser and sign in with your Google account.", detail: "takeout.google.com", icon: (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>) },
    { num: "02", title: "Deselect everything", desc: "Click 'Deselect all' at the top to uncheck all Google products.", detail: "Click 'Deselect all' first", icon: (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>) },
    { num: "03", title: "Select Gemini Apps Activity", desc: "Scroll down and check only 'Gemini Apps Activity'. Nothing else is needed.", detail: "Only Gemini Apps Activity", icon: (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>) },
    { num: "04", title: "Export & download", desc: "Scroll to the bottom, click 'Next step', choose .zip format, and click 'Create export'. Download when ready.", detail: ".zip format · any size", icon: (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>) },
    { num: "05", title: "Upload here", desc: "Come back to this page and drop the downloaded .zip file into the upload area above.", detail: "Drop the .zip file above", icon: (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>) },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} />
      <div style={{ position: "relative", background: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "2.5rem", maxWidth: 560, width: "100%", maxHeight: "88vh", overflowY: "auto", animation: "modalIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#a78bfa", marginBottom: "0.4rem" }}>Guide</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.5rem", fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.1 }}>How to export your<br /><em style={{ fontStyle: "italic", color: "#a78bfa" }}>Gemini data</em></h2>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 12, padding: "0.85rem 1rem", marginBottom: "1.75rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>We only read <strong style={{ color: "rgba(255,255,255,0.8)" }}>topic patterns</strong> from your data — never the content of your messages. Raw data is discarded immediately after analysis.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {steps.map((step, i) => (
            <div key={step.num} style={{ display: "flex", gap: "1rem", alignItems: "flex-start", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "1rem 1.1rem", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: 2, height: "100%", background: `linear-gradient(to bottom, rgba(124,58,237,${1 - i * 0.15}), transparent)` }} />
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#a78bfa" }}>{step.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "rgba(124,58,237,0.7)", letterSpacing: 1 }}>{step.num}</span>
                  <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{step.title}</span>
                </div>
                <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
                <div style={{ marginTop: "0.4rem", display: "inline-block", background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "0.15rem 0.5rem", fontSize: "0.68rem", color: "#a78bfa", fontWeight: 600, fontFamily: "monospace" }}>{step.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ width: "100%", marginTop: "1.75rem", background: "linear-gradient(135deg,#7c3aed,#9333ea)", color: "white", border: "none", borderRadius: 12, padding: "0.85rem", fontFamily: "var(--font)", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer" }}>Got it, let me upload →</button>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "chart">("upload");
  const [showHowTo, setShowHowTo] = useState(false);
  const [showMatchMaker, setShowMatchMaker] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [uploadedAt, setUploadedAt] = useState<Date | null>(null);
  const [wrongFileOverride, setWrongFileOverride] = useState(false);
  const [fileError, setFileError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [chartScores, setChartScores] = useState<number[]>([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  const [pendingFile, setPendingFile] = useState<{ name: string; scores: number[]; rawScores: Record<string, number> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (!isLoading && !user) router.push("/auth/login"); }, [user, isLoading, router]);

  const fetchProfile = () => {
    fetch("/api/profile").then(r => r.ok ? r.json() : null).then(d => d?.profile && setProfile(d.profile)).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    fetchProfile();
    const stored = localStorage.getItem("dfs_uploaded_at");
    if (stored) { setHasData(true); setUploadedAt(new Date(stored)); setActiveTab("chart"); }
    const storedScores = localStorage.getItem("dfs_chart_scores");
    if (storedScores) { try { setChartScores(JSON.parse(storedScores)); } catch {} }
    const onSync = () => fetchProfile();
    window.addEventListener("wallet-synced", onSync);
    return () => window.removeEventListener("wallet-synced", onSync);
  }, [user]);

  useEffect(() => {
    if (window.location.hash === "#wallet") {
      setTimeout(() => document.getElementById("wallet")?.scrollIntoView({ behavior: "smooth" }), 300);
    }
  }, []);

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      setFileError("Only .json files are accepted. Please export your Gemini data as JSON.");
      setPendingFile(null);
      return;
    }
    setFileError("");
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const raw: Record<string, number> = json.scores ?? {};
        const scores = extractChartScores(raw);
        setPendingFile({ name: file.name, scores, rawScores: raw });
        setUploading(false);
      } catch {
        setFileError("Couldn't parse that file. Make sure it's a valid Gemini export JSON.");
        setPendingFile(null);
        setUploading(false);
      }
    };
    reader.onerror = () => { setFileError("Failed to read the file."); setPendingFile(null); setUploading(false); };
    reader.readAsText(file);
  };

  const handleGenerateChart = async () => {
    if (!pendingFile || !user?.sub) return;
    const now = new Date();
    localStorage.setItem("dfs_uploaded_at", now.toISOString());
    localStorage.setItem("dfs_chart_scores", JSON.stringify(pendingFile.scores));
    setChartScores(pendingFile.scores);
    setHasData(true);
    setUploadedAt(now);
    setActiveTab("chart");

    const raw = pendingFile.rawScores;
    setPendingFile(null);

    const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archetype_scores: raw }),
      });
    } catch {}

    try {
      await fetch(`${BACKEND}/v2/archetype`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.sub,
          server_id: "general",
          vector: { scores: raw, evidence: {}, confidence: "high", message_count_used: 0 },
          reputation_score: 0,
        }),
      });
    } catch {}
  };

  const handleWrongFile = () => setWrongFileOverride(true);

  const canReupload = !uploadedAt || (() => { const diff = Date.now() - uploadedAt.getTime(); return diff > 1000 * 60 * 60 * 24 * 90; })();
  const daysUntilReupload = uploadedAt ? Math.max(0, 90 - Math.floor((Date.now() - uploadedAt.getTime()) / (1000 * 60 * 60 * 24))) : 0;

  if (!mounted || isLoading) {
    return <LoadingScreen />;
  }
  if (!user) return null;

  const displayName = profile?.first_name ? getDisplayName(profile) : getDisplayName(user);
  const firstName = profile?.first_name?.trim() || getFirstName(user);
  const initials = profile?.first_name ? getInitials(profile) : getInitials(user);
  const joinDate = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const uploadBlocked = hasData && !canReupload && !wrongFileOverride;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Fraunces:ital,wght@0,300;0,700;1,300;1,700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
        :root{
          --v:#7c3aed;--v2:#a78bfa;--v3:#c4b5fd;
          --dark:#0a0a0f;--dark2:#12121a;--dark3:#1a1a28;
          --text:#f1f0ff;--muted:rgba(241,240,255,0.45);
          --border:rgba(255,255,255,0.08);
          --font:'Outfit',sans-serif;--serif:'Fraunces',serif;
        }
        html{scroll-behavior:smooth;}
        body{background:var(--dark);color:var(--text);font-family:var(--font);overflow-x:hidden;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse-ring{0%{transform:scale(1);opacity:0.6}100%{transform:scale(1.8);opacity:0}}
        @keyframes gradient-shift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes modalIn{from{opacity:0;transform:scale(0.92) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes matchModalIn{from{opacity:0;transform:scale(0.9) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes shimmerBar{0%{background-position:0% 50%}100%{background-position:200% 50%}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes findPulse{0%,100%{box-shadow:0 4px 24px rgba(124,58,237,0.45)}50%{box-shadow:0 4px 36px rgba(124,58,237,0.75),0 0 0 6px rgba(124,58,237,0.1)}}
        .dash-nav{display:flex;align-items:center;justify-content:space-between;padding:1.1rem 2.5rem;border-bottom:1px solid var(--border);background:rgba(10,10,15,0.85);backdrop-filter:blur(20px);position:sticky;top:0;z-index:100;}
        .dash-logo{font-weight:900;font-size:1.2rem;letter-spacing:-0.5px;display:flex;align-items:center;gap:0.5rem;text-decoration:none;color:var(--text);}
        .dash-logo-img{height:32px;width:auto;object-fit:contain;display:block;}
        .logo-dot{width:10px;height:10px;border-radius:50%;background:var(--v2);position:relative;}
        .logo-dot::before{content:'';position:absolute;inset:0;border-radius:50%;background:var(--v);animation:pulse-ring 1.5s ease-out infinite;}
        .nav-right{display:flex;align-items:center;gap:0.85rem;}
        .nav-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--v),var(--v2));display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:800;color:white;border:2px solid rgba(124,58,237,0.4);overflow:hidden;flex-shrink:0;}
        .nav-avatar img{width:100%;height:100%;object-fit:cover;}
        .wallet-nav-btn{background:none;border:1px solid rgba(124,58,237,0.35);color:var(--v2);border-radius:8px;padding:0.38rem 0.85rem;font-family:var(--font);font-size:0.78rem;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:0.4rem;}
        .wallet-nav-btn:hover{border-color:var(--v2);background:rgba(124,58,237,0.08);}
        .logout-btn{background:none;border:1px solid rgba(239,68,68,0.35);color:rgba(239,68,68,0.75);border-radius:8px;padding:0.38rem 0.85rem;font-family:var(--font);font-size:0.78rem;font-weight:600;cursor:pointer;transition:all 0.2s;text-decoration:none;display:flex;align-items:center;gap:0.35rem;}
        .logout-btn:hover{border-color:rgba(239,68,68,0.7);color:rgba(239,68,68,1);background:rgba(239,68,68,0.06);}
        .dash-main{padding:2.5rem;max-width:1100px;margin:0 auto;width:100%;}
        .page-header{margin-bottom:2rem;animation:fadeUp 0.5s ease forwards;}
        .page-eyebrow{font-size:0.65rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--v2);margin-bottom:0.4rem;}
        .page-title{font-family:var(--serif);font-size:clamp(1.75rem,3vw,2.4rem);font-weight:700;letter-spacing:-1px;line-height:1.05;}
        .page-title em{font-style:italic;color:transparent;background:linear-gradient(135deg,var(--v2),#f97316);background-size:200% 200%;animation:gradient-shift 4s ease infinite;-webkit-background-clip:text;background-clip:text;}
        .dash-grid{display:grid;grid-template-columns:300px 1fr;gap:1.25rem;align-items:stretch;}
        .profile-card{background:var(--dark2);border:1px solid var(--border);border-radius:22px;overflow:hidden;animation:fadeUp 0.5s ease 0.05s forwards;opacity:0;position:relative;display:flex;flex-direction:column;}
        .profile-banner{height:80px;background:linear-gradient(135deg,#1a0a3d 0%,#0f0a1f 50%,#130a2e 100%);position:relative;}
        .profile-banner-glow{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 100%,rgba(124,58,237,0.35) 0%,transparent 70%);}
        .profile-body{padding:0 1.5rem 1.75rem;display:flex;flex-direction:column;flex:1;}
        .profile-avatar-wrap{position:relative;margin-top:-32px;margin-bottom:1rem;}
        .profile-avatar{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--v),var(--v2));display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:800;color:white;border:3px solid var(--dark2);box-shadow:0 0 24px rgba(124,58,237,0.3);overflow:hidden;position:relative;}
        .profile-avatar img{width:100%;height:100%;object-fit:cover;}
        .online-badge{position:absolute;bottom:2px;right:2px;width:13px;height:13px;border-radius:50%;background:#22c55e;border:2.5px solid var(--dark2);}
        .profile-name{font-family:var(--serif);font-size:1.05rem;font-weight:700;margin-bottom:0.15rem;letter-spacing:-0.3px;}
        .profile-email{font-size:0.72rem;color:var(--muted);font-weight:500;margin-bottom:1.25rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .profile-info-grid{display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.25rem;}
        .profile-info-row{display:flex;align-items:center;gap:0.6rem;font-size:0.78rem;color:rgba(255,255,255,0.55);font-weight:500;}
        .profile-info-row svg{flex-shrink:0;opacity:0.5;}
        .profile-info-val{color:rgba(255,255,255,0.8);font-weight:600;}
        .profile-divider{height:1px;background:var(--border);margin:1.25rem 0;}
        .profile-coins{display:flex;align-items:center;gap:0.75rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:0.75rem 1rem;}
        .profile-coin-icon{width:40px;height:40px;object-fit:contain;flex-shrink:0;}
        .profile-coin-val{font-family:var(--serif);font-size:1.5rem;font-weight:700;color:var(--v2);line-height:1;}
        .profile-coin-lbl{font-size:0.6rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-top:0.2rem;}
        .profile-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;}
        .profile-stat{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:0.75rem 0.5rem;text-align:center;}
        .profile-stat-val{font-family:var(--serif);font-size:1.25rem;font-weight:700;color:var(--v2);line-height:1;}
        .profile-stat-lbl{font-size:0.58rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-top:0.3rem;}
        .find-match-btn{width:100%;margin-top:0;background:linear-gradient(135deg,#7c3aed,#9333ea);color:white;border:none;border-radius:16px;padding:1.75rem 1.5rem;font-family:var(--font);font-size:1.05rem;font-weight:800;cursor:pointer;transition:transform 0.25s,box-shadow 0.25s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.5rem;letter-spacing:0.3px;animation:findPulse 3s ease-in-out infinite;position:relative;overflow:hidden;min-height:110px;}
        .find-match-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.15),transparent 60%);opacity:0;transition:opacity 0.2s;}
        .find-match-btn:hover{transform:translateY(-2px);animation:none;box-shadow:0 8px 32px rgba(124,58,237,0.65)!important;}
        .find-match-btn:hover::before{opacity:1;}
        .right-panel{display:flex;flex-direction:column;gap:1.25rem;animation:fadeUp 0.5s ease 0.1s forwards;opacity:0;}
        .tabs{display:flex;gap:0.35rem;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:12px;padding:0.3rem;}
        .tab-btn{flex:1;padding:0.55rem 1rem;border-radius:9px;border:none;background:none;font-family:var(--font);font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.2s;color:var(--muted);display:flex;align-items:center;justify-content:center;gap:0.5rem;}
        .tab-btn.active{background:var(--dark2);color:var(--text);box-shadow:0 2px 8px rgba(0,0,0,0.3);}
        .tab-btn:hover:not(.active){color:rgba(255,255,255,0.7);}
        .upload-card{background:var(--dark2);border:1px solid var(--border);border-radius:22px;padding:2rem;display:flex;flex-direction:column;gap:1.5rem;}
        .card-eyebrow{font-size:0.62rem;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--v2);margin-bottom:0.35rem;}
        .card-title{font-family:var(--serif);font-size:1.25rem;font-weight:700;letter-spacing:-0.4px;line-height:1.15;}
        .card-sub{font-size:0.8rem;color:var(--muted);line-height:1.65;margin-top:0.35rem;}
        .upload-zone{border:2px dashed rgba(124,58,237,0.3);border-radius:16px;padding:2.5rem 2rem;display:flex;flex-direction:column;align-items:center;gap:0.85rem;cursor:pointer;transition:all 0.25s;background:rgba(124,58,237,0.02);text-align:center;}
        .upload-zone.drag{border-color:rgba(124,58,237,0.7);background:rgba(124,58,237,0.08);}
        .upload-zone:hover{border-color:rgba(124,58,237,0.55);background:rgba(124,58,237,0.05);}
        .upload-icon{width:52px;height:52px;border-radius:15px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.22);display:flex;align-items:center;justify-content:center;animation:float 3.5s ease-in-out infinite;}
        .upload-zone-title{font-size:0.88rem;font-weight:700;color:rgba(255,255,255,0.82);}
        .upload-zone-sub{font-size:0.72rem;color:var(--muted);}
        .howto-btn{display:flex;align-items:center;gap:0.6rem;background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.18);border-radius:12px;padding:0.85rem 1.1rem;cursor:pointer;transition:all 0.2s;width:100%;text-align:left;}
        .howto-btn:hover{background:rgba(124,58,237,0.1);border-color:rgba(124,58,237,0.35);}
        .howto-icon{width:32px;height:32px;border-radius:9px;background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .howto-text-title{font-size:0.82rem;font-weight:700;color:rgba(255,255,255,0.85);}
        .howto-text-sub{font-size:0.7rem;color:var(--muted);margin-top:0.1rem;}
        .howto-arrow{margin-left:auto;color:var(--v2);opacity:0.7;}
        .btn-primary{background:linear-gradient(135deg,var(--v),#9333ea);color:white;border:none;border-radius:12px;padding:0.85rem 2rem;font-family:var(--font);font-size:0.88rem;font-weight:700;cursor:pointer;transition:all 0.25s;box-shadow:0 4px 20px rgba(124,58,237,0.3);width:100%;}
        .btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(124,58,237,0.45);}
        .chart-card{background:var(--dark2);border:1px solid var(--border);border-radius:22px;padding:2rem;min-height:400px;display:flex;flex-direction:column;}
        .chart-locked{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;border-radius:14px;overflow:hidden;}
        .chart-blur-bg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;filter:blur(8px);opacity:0.3;pointer-events:none;}
        .chart-lock-overlay{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:1rem;text-align:center;padding:2rem;}
        .lock-icon-wrap{width:56px;height:56px;border-radius:50%;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.25);display:flex;align-items:center;justify-content:center;}
        .lock-title{font-family:var(--serif);font-size:1rem;font-weight:700;letter-spacing:-0.2px;}
        .lock-sub{font-size:0.78rem;color:var(--muted);line-height:1.6;max-width:260px;}
        .chart-axes{display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-top:1.25rem;}
        .chart-axis-pill{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:0.45rem 0.75rem;font-size:0.72rem;font-weight:600;color:var(--muted);text-align:center;position:relative;overflow:hidden;}
        .chart-axis-pill::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(124,58,237,0.06),transparent);background-size:200% 100%;animation:shimmer 2.5s ease-in-out infinite;}
        .wallet-section{margin-top:1.5rem;}
        .section-eyebrow{font-size:0.62rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--v2);margin-bottom:0.4rem;}
        .section-title{font-family:var(--serif);font-size:clamp(1.3rem,2.5vw,1.8rem);font-weight:700;letter-spacing:-0.8px;line-height:1.05;margin-bottom:1.25rem;}
        .section-title em{font-style:italic;color:var(--v2);}
        .wallet-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}
        .wallet-card{background:var(--dark2);border:1px solid var(--border);border-radius:20px;padding:1.75rem;position:relative;overflow:hidden;transition:border-color 0.2s,transform 0.2s;}
        .wallet-card:hover{border-color:rgba(124,58,237,0.25);transform:translateY(-2px);}
        .wallet-card-full{grid-column:1/-1;background:var(--dark2);border:1px solid var(--border);border-radius:20px;padding:1.75rem;}
        .wallet-lbl{font-size:0.62rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:0.5rem;}
        .wallet-val{font-family:var(--serif);font-size:2.4rem;font-weight:700;letter-spacing:-2px;}
        .wallet-sub{font-size:0.72rem;color:var(--muted);margin-top:0.2rem;}
        .wallet-empty{display:flex;flex-direction:column;align-items:center;gap:0.65rem;padding:1.5rem;text-align:center;color:var(--muted);}
        .wallet-empty-icon{width:44px;height:44px;border-radius:12px;background:rgba(124,58,237,0.07);border:1px solid rgba(124,58,237,0.14);display:flex;align-items:center;justify-content:center;}
        .section-divider{height:1px;background:var(--border);margin:2rem 0;}
        @media(max-width:900px){
          .dash-grid{grid-template-columns:1fr;}
          .dash-main{padding:1.5rem;}
          .dash-nav{padding:1rem 1.5rem;}
          .wallet-grid{grid-template-columns:1fr;}
        }
      `}</style>

      {showHowTo && <HowToModal onClose={() => setShowHowTo(false)} />}
      {showMatchMaker && <MatchMakerModal onClose={() => setShowMatchMaker(false)} currentUserId={user.sub!} />}

      <nav className="dash-nav">
        <a href="/" className="dash-logo">
          <img src="/DFSlogo.png" alt="DFS" className="dash-logo-img" />
        </a>
        <div className="nav-right">
          <NavWalletDropdown buttonClassName="wallet-nav-btn" />
          <a href="/auth/logout" className="logout-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Log out
          </a>
          <div className="nav-avatar">
            {user.picture ? <img src={user.picture} alt={displayName} /> : initials}
          </div>
        </div>
      </nav>

      <main className="dash-main">
        <div className="page-header">
          <div className="page-eyebrow">Your Dashboard</div>
          <h1 className="page-title">Welcome back, <em>{firstName}</em></h1>
        </div>

        <div className="dash-grid">
          {/* ── LEFT: PROFILE CARD ── */}
          <div className="profile-card">
            <div className="profile-banner"><div className="profile-banner-glow" /></div>
            <div className="profile-body">
              <div className="profile-avatar-wrap">
                <div className="profile-avatar">
                  {user.picture ? <img src={user.picture} alt={displayName} /> : initials}
                  <div className="online-badge" />
                </div>
              </div>
              <div className="profile-name">{displayName}</div>
              <div className="profile-email">{user.email}</div>
              <div className="profile-info-grid">
                <div className="profile-info-row">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span>Joined</span><span className="profile-info-val">{joinDate}</span>
                </div>
                <div className="profile-info-row">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>Built at</span><span className="profile-info-val">DeerHacks 2025</span>
                </div>
                <div className="profile-info-row">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span>Network</span><span className="profile-info-val">Solana Devnet</span>
                </div>
              </div>
              <div className="profile-divider" />
              <div className="profile-coins">
                <img src="/DFScoin.png" alt="" className="profile-coin-icon" />
                <div>
                  <div className="profile-coin-val">{profile?.karma_score != null ? Number(profile.karma_score) : 0}</div>
                  <div className="profile-coin-lbl">DFS Coins</div>
                </div>
              </div>
              <div className="profile-divider" />
              <div className="profile-stats">
                {[{val:"—",lbl:"Matches"},{val:"—",lbl:"Score"},{val:"0",lbl:"Chats"}].map(s => (
                  <div key={s.lbl} className="profile-stat">
                    <div className="profile-stat-val">{s.val}</div>
                    <div className="profile-stat-lbl">{s.lbl}</div>
                  </div>
                ))}
              </div>
              <div className="profile-divider" />
              <button className="find-match-btn" onClick={() => setShowMatchMaker(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>Find My Match</span>
              </button>
            </div>
          </div>

          {/* ── RIGHT: TABS + CONTENT ── */}
          <div className="right-panel">
            <div className="tabs">
              <button className={`tab-btn ${activeTab === "upload" ? "active" : ""}`} onClick={() => setActiveTab("upload")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload Data
              </button>
              <button className={`tab-btn ${activeTab === "chart" ? "active" : ""}`} onClick={() => setActiveTab("chart")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                My Chart
              </button>
            </div>

            {activeTab === "upload" && (
              <div className="upload-card" style={{ position: "relative", overflow: "hidden" }}>
                {uploadBlocked && (
                  <div style={{ position: "absolute", inset: 0, zIndex: 10, borderRadius: 22, backdropFilter: "blur(12px)", background: "rgba(10,10,15,0.6)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.25rem", padding: "2rem", textAlign: "center" }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <div>
                      <div style={{ fontFamily: "var(--serif)", fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.4rem" }}>Come back in {daysUntilReupload} days</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.6, maxWidth: 280 }}>
                        To keep your profile accurate, you can only re-upload your data every 3 months.
                        {uploadedAt && <span style={{ display: "block", marginTop: "0.3rem", fontSize: "0.72rem", color: "rgba(255,255,255,0.3)" }}>Uploaded {uploadedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>}
                      </div>
                    </div>
                    <button onClick={handleWrongFile}
                      style={{ background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "0.6rem 1.2rem", fontFamily: "var(--font)", fontSize: "0.78rem", fontWeight: 600, color: "rgba(255,255,255,0.45)", cursor: "pointer", transition: "all 0.2s", marginTop: "0.25rem" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.4)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(239,68,68,0.7)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)"; }}
                    >I uploaded the wrong file — let me redo it</button>
                  </div>
                )}

                <div>
                  <div className="card-eyebrow">Step 1 of 3</div>
                  <div className="card-title">Upload your Gemini data</div>
                  <div className="card-sub">Export your Google Gemini conversation history and drop it here. We extract interest vectors — your raw messages are never stored or read.</div>
                </div>

                <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0] ?? null)} />

                <div className={`upload-zone ${dragOver ? "drag" : ""}`} onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0] ?? null); }}>
                  {uploading ? (
                    <>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid rgba(124,58,237,0.2)", borderTop: "2px solid #a78bfa", animation: "spin 0.8s linear infinite" }} />
                      <div className="upload-zone-title">Reading file…</div>
                      <div className="upload-zone-sub">Hang on a sec</div>
                    </>
                  ) : pendingFile ? (
                    <>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: "2px solid rgba(34,197,94,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <div className="upload-zone-title" style={{ color: "rgba(255,255,255,0.9)" }}>File ready</div>
                      <div className="upload-zone-sub" style={{ color: "rgba(34,197,94,0.8)", fontWeight: 600 }}>{pendingFile.name}</div>
                      <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)", marginTop: "0.15rem" }}>Click to swap file</div>
                    </>
                  ) : (
                    <>
                      <div className="upload-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
                      <div className="upload-zone-title">Drop your Gemini export here</div>
                      <div className="upload-zone-sub">or click to browse · <strong style={{ color: "rgba(167,139,250,0.8)" }}>.json only</strong></div>
                    </>
                  )}
                </div>

                {fileError && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "0.7rem 1rem", fontSize: "0.78rem", color: "rgba(239,68,68,0.85)", display: "flex", gap: "0.6rem", alignItems: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {fileError}
                  </div>
                )}

                <button className="howto-btn" onClick={() => setShowHowTo(true)}>
                  <div className="howto-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
                  <div>
                    <div className="howto-text-title">How do I get my Gemini data?</div>
                    <div className="howto-text-sub">Step-by-step guide · takes ~2 minutes</div>
                  </div>
                  <div className="howto-arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
                </button>

                {pendingFile ? (
                  <button className="btn-primary" onClick={handleGenerateChart} style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", boxShadow: "0 4px 20px rgba(34,197,94,0.35)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Make My Chart →
                  </button>
                ) : (
                  <button className="btn-primary" disabled={uploading} onClick={() => fileInputRef.current?.click()} style={{ opacity: uploading ? 0.5 : 0.45, cursor: uploading ? "not-allowed" : "pointer", background: "rgba(124,58,237,0.3)", boxShadow: "none", border: "1px solid rgba(124,58,237,0.3)" }}>
                    {uploading ? "Reading…" : "Upload a file first ↑"}
                  </button>
                )}
              </div>
            )}

            {activeTab === "chart" && (
              <div className="chart-card">
                <div className="card-eyebrow">Interest Profile</div>
                <div className="card-title" style={{ marginBottom: "1.25rem" }}>Your Spider Chart</div>
                {hasData ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "center", flex: 1, alignItems: "center" }}>
                      <SpiderChart values={chartScores} color="#a78bfa" size={280} />
                    </div>
                    {uploadedAt && (
                      <div style={{ textAlign: "center", marginTop: "0.75rem", fontSize: "0.72rem", color: "var(--muted)", fontWeight: 500 }}>
                        Generated from data uploaded {uploadedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="chart-locked">
                    <div className="chart-blur-bg"><SpiderChart values={[0.6,0.5,0.7,0.8,0.4,0.6]} color="#a78bfa" size={260} /></div>
                    <div className="chart-lock-overlay">
                      <div className="lock-icon-wrap"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
                      <div className="lock-title">Chart not generated yet</div>
                      <div className="lock-sub">Upload your Gemini data and we'll map your intellectual fingerprint across 6 axes.</div>
                      <button className="btn-primary" style={{ width: "auto", padding: "0.65rem 1.5rem", fontSize: "0.82rem" }} onClick={() => setActiveTab("upload")}>Upload data to unlock →</button>
                    </div>
                  </div>
                )}
                <div className="chart-axes">
                  {["Creativity","Logic","Social","Tech","Writing","Science"].map(ax => (
                    <div key={ax} className="chart-axis-pill" style={{ opacity: hasData ? 1 : 0.5 }}>{ax}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="section-divider" />
        <div id="wallet" className="wallet-section">
          <div className="section-eyebrow">Solana · Devnet</div>
          <h2 className="section-title">Your <em>Wallet</em></h2>
          <div className="wallet-grid">
            <div className="wallet-card" style={{ background: "linear-gradient(135deg,#1a0a3d,#0f0a1f)" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,var(--v),var(--v2))", borderRadius: "20px 20px 0 0" }} />
              <div className="wallet-lbl">Total Balance</div>
              <div className="wallet-val">{profile?.sol_balance != null ? Number(profile.sol_balance).toFixed(4) : "0"} <span style={{ fontSize: "1.1rem", color: "var(--muted)" }}>SOL</span></div>
              <div className="wallet-sub">≈ $0.00 USD · Devnet</div>
              {profile?.wallet_address ? (
                <div style={{ marginTop: "0.75rem", fontFamily: "monospace", fontSize: "0.72rem", color: "var(--muted)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.45rem 0.75rem" }}>
                  {profile.wallet_address.slice(0,4)}...{profile.wallet_address.slice(-4)}
                </div>
              ) : (
                <p style={{ marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.6 }}>Use the <strong style={{ color: "var(--v2)" }}>Wallet</strong> button in the nav to connect.</p>
              )}
            </div>
            <div className="wallet-card">
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,#f97316,transparent)", borderRadius: "20px 20px 0 0" }} />
              <div className="wallet-lbl">Reputation Score</div>
              <div className="wallet-val" style={{ color: "#f97316", fontSize: "1.8rem" }}>—</div>
              <div className="wallet-sub">Complete matches to earn reputation</div>
              <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {[{l:"Matches completed",v:"0"},{l:"Connections made",v:"0"},{l:"Hackathons joined",v:"0"}].map(r => (
                  <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.75rem" }}>
                    <span style={{ color: "var(--muted)", fontWeight: 500 }}>{r.l}</span>
                    <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="wallet-card-full">
              <div className="wallet-lbl" style={{ marginBottom: "1rem" }}>Transaction History</div>
              <div className="wallet-empty">
                <div className="wallet-empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 12h.01"/></svg></div>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "rgba(255,255,255,0.45)" }}>No transactions yet</div>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Connect your wallet and complete matches to see activity</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}