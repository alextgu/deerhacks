"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { getDisplayName, getFirstName, getInitials } from "@/lib/user-display";
import { NavWalletDropdown } from "@/components/nav-wallet-dropdown";

type ProfileWallet = { wallet_address?: string | null; sol_balance?: number | null };

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

// ── How-To Modal ──────────────────────────────────────────────────────────────
function HowToModal({ onClose }: { onClose: () => void }) {
  const steps = [
    {
      num: "01",
      title: "Go to Google Takeout",
      desc: "Open takeout.google.com in your browser and sign in with your Google account.",
      detail: "takeout.google.com",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      ),
    },
    {
      num: "02",
      title: "Deselect everything",
      desc: "Click 'Deselect all' at the top to uncheck all Google products.",
      detail: "Click 'Deselect all' first",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      ),
    },
    {
      num: "03",
      title: "Select Gemini Apps Activity",
      desc: "Scroll down and check only 'Gemini Apps Activity'. Nothing else is needed.",
      detail: "Only Gemini Apps Activity",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ),
    },
    {
      num: "04",
      title: "Export & download",
      desc: "Scroll to the bottom, click 'Next step', choose .zip format, and click 'Create export'. Download when ready.",
      detail: ".zip format · any size",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      ),
    },
    {
      num: "05",
      title: "Upload here",
      desc: "Come back to this page and drop the downloaded .zip file into the upload area above.",
      detail: "Drop the .zip file above",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} />
      <div
        style={{ position: "relative", background: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "2.5rem", maxWidth: 560, width: "100%", maxHeight: "88vh", overflowY: "auto", animation: "modalIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#a78bfa", marginBottom: "0.4rem" }}>Guide</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.5rem", fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.1 }}>How to export your<br /><em style={{ fontStyle: "italic", color: "#a78bfa" }}>Gemini data</em></h2>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Privacy note */}
        <div style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 12, padding: "0.85rem 1rem", marginBottom: "1.75rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>We only read <strong style={{ color: "rgba(255,255,255,0.8)" }}>topic patterns</strong> from your data — never the content of your messages. Raw data is discarded immediately after analysis.</span>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {steps.map((step, i) => (
            <div key={step.num} style={{ display: "flex", gap: "1rem", alignItems: "flex-start", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "1rem 1.1rem", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: 2, height: "100%", background: `linear-gradient(to bottom, rgba(124,58,237,${1 - i * 0.15}), transparent)` }} />
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#a78bfa" }}>
                {step.icon}
              </div>
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

        <button
          onClick={onClose}
          style={{ width: "100%", marginTop: "1.75rem", background: "linear-gradient(135deg,#7c3aed,#9333ea)", color: "white", border: "none", borderRadius: 12, padding: "0.85rem", fontFamily: "var(--font)", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer" }}
        >
          Got it, let me upload →
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<ProfileWallet | null>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "chart">("upload");
  const [showHowTo, setShowHowTo] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (!isLoading && !user) router.push("/auth/login"); }, [user, isLoading, router]);

  const fetchProfile = () => {
    fetch("/api/profile").then(r => r.ok ? r.json() : null).then(d => d?.profile && setProfile(d.profile)).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    fetchProfile();
    const onSync = () => fetchProfile();
    window.addEventListener("wallet-synced", onSync);
    return () => window.removeEventListener("wallet-synced", onSync);
  }, [user]);

  useEffect(() => {
    if (window.location.hash === "#wallet") {
      setTimeout(() => document.getElementById("wallet")?.scrollIntoView({ behavior: "smooth" }), 300);
    }
  }, []);

  if (!mounted || isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "2px solid rgba(124,58,237,0.2)", borderTop: "2px solid #7c3aed", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }
  if (!user) return null;

  const displayName = getDisplayName(user);
  const firstName = getFirstName(user);
  const initials = getInitials(user);
  const joinDate = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const hasData = false; // flip to true once data is uploaded

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
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}

        .dash-nav{
          display:flex;align-items:center;justify-content:space-between;
          padding:1.1rem 2.5rem;border-bottom:1px solid var(--border);
          background:rgba(10,10,15,0.85);backdrop-filter:blur(20px);
          position:sticky;top:0;z-index:100;
        }
        .dash-logo{font-weight:900;font-size:1.2rem;letter-spacing:-0.5px;display:flex;align-items:center;gap:0.5rem;text-decoration:none;color:var(--text);}
        .logo-dot{width:10px;height:10px;border-radius:50%;background:var(--v2);position:relative;}
        .logo-dot::before{content:'';position:absolute;inset:0;border-radius:50%;background:var(--v);animation:pulse-ring 1.5s ease-out infinite;}
        .nav-right{display:flex;align-items:center;gap:0.85rem;}
        .nav-email{font-size:0.78rem;font-weight:600;color:var(--muted);}
        .nav-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--v),var(--v2));display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:800;color:white;border:2px solid rgba(124,58,237,0.4);overflow:hidden;flex-shrink:0;}
        .nav-avatar img{width:100%;height:100%;object-fit:cover;}
        .wallet-nav-btn{background:none;border:1px solid rgba(124,58,237,0.35);color:var(--v2);border-radius:8px;padding:0.38rem 0.85rem;font-family:var(--font);font-size:0.78rem;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:0.4rem;}
        .wallet-nav-btn:hover{border-color:var(--v2);background:rgba(124,58,237,0.08);}
        .logout-btn{background:none;border:1px solid var(--border);color:var(--muted);border-radius:8px;padding:0.38rem 0.85rem;font-family:var(--font);font-size:0.78rem;font-weight:600;cursor:pointer;transition:all 0.2s;text-decoration:none;display:flex;align-items:center;gap:0.35rem;}
        .logout-btn:hover{border-color:rgba(239,68,68,0.4);color:rgba(239,68,68,0.8);}

        /* MAIN LAYOUT */
        .dash-main{padding:2.5rem;max-width:1100px;margin:0 auto;width:100%;}

        /* PAGE HEADER */
        .page-header{margin-bottom:2rem;animation:fadeUp 0.5s ease forwards;}
        .page-eyebrow{font-size:0.65rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--v2);margin-bottom:0.4rem;}
        .page-title{font-family:var(--serif);font-size:clamp(1.75rem,3vw,2.4rem);font-weight:700;letter-spacing:-1px;line-height:1.05;}
        .page-title em{font-style:italic;color:transparent;background:linear-gradient(135deg,var(--v2),#f97316);background-size:200% 200%;animation:gradient-shift 4s ease infinite;-webkit-background-clip:text;background-clip:text;}

        /* DASHBOARD GRID */
        .dash-grid{display:grid;grid-template-columns:300px 1fr;gap:1.25rem;align-items:start;}

        /* PROFILE CARD */
        .profile-card{
          background:var(--dark2);border:1px solid var(--border);
          border-radius:22px;overflow:hidden;
          animation:fadeUp 0.5s ease 0.05s forwards;opacity:0;
          position:relative;
        }
        .profile-banner{height:80px;background:linear-gradient(135deg,#1a0a3d 0%,#0f0a1f 50%,#130a2e 100%);position:relative;}
        .profile-banner-glow{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 100%,rgba(124,58,237,0.35) 0%,transparent 70%);}
        .profile-body{padding:0 1.5rem 1.75rem;}
        .profile-avatar-wrap{position:relative;margin-top:-32px;margin-bottom:1rem;}
        .profile-avatar{
          width:64px;height:64px;border-radius:50%;
          background:linear-gradient(135deg,var(--v),var(--v2));
          display:flex;align-items:center;justify-content:center;
          font-size:1.2rem;font-weight:800;color:white;
          border:3px solid var(--dark2);
          box-shadow:0 0 24px rgba(124,58,237,0.3);
          overflow:hidden;position:relative;
        }
        .profile-avatar img{width:100%;height:100%;object-fit:cover;}
        .online-badge{position:absolute;bottom:2px;right:2px;width:13px;height:13px;border-radius:50%;background:#22c55e;border:2.5px solid var(--dark2);}
        .profile-name{font-family:var(--serif);font-size:1.05rem;font-weight:700;margin-bottom:0.15rem;letter-spacing:-0.3px;}
        .profile-email{font-size:0.72rem;color:var(--muted);font-weight:500;margin-bottom:1.25rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

        .profile-info-grid{display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.25rem;}
        .profile-info-row{display:flex;align-items:center;gap:0.6rem;font-size:0.78rem;color:rgba(255,255,255,0.55);font-weight:500;}
        .profile-info-row svg{flex-shrink:0;opacity:0.5;}
        .profile-info-val{color:rgba(255,255,255,0.8);font-weight:600;}

        .profile-divider{height:1px;background:var(--border);margin:1.25rem 0;}

        .profile-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;}
        .profile-stat{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:0.75rem 0.5rem;text-align:center;}
        .profile-stat-val{font-family:var(--serif);font-size:1.25rem;font-weight:700;color:var(--v2);line-height:1;}
        .profile-stat-lbl{font-size:0.58rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-top:0.3rem;}

        .setup-progress{margin-top:1.25rem;}
        .progress-title{font-size:0.62rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:0.85rem;}
        .progress-item{display:flex;align-items:center;gap:0.65rem;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.78rem;font-weight:600;}
        .progress-item:last-child{border-bottom:none;padding-bottom:0;}
        .progress-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
        .progress-dot.green{background:#22c55e;box-shadow:0 0 6px rgba(34,197,94,0.5);}
        .progress-dot.yellow{background:#fbbf24;box-shadow:0 0 6px rgba(251,191,36,0.5);}
        .progress-dot.gray{background:rgba(255,255,255,0.18);}
        .progress-text{flex:1;color:rgba(255,255,255,0.65);}
        .progress-badge{font-size:0.58rem;font-weight:700;padding:0.12rem 0.45rem;border-radius:100px;letter-spacing:0.5px;}
        .badge-done{background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid rgba(34,197,94,0.2);}
        .badge-pending{background:rgba(251,191,36,0.1);color:#fbbf24;border:1px solid rgba(251,191,36,0.2);}
        .badge-soon{background:rgba(255,255,255,0.05);color:var(--muted);border:1px solid rgba(255,255,255,0.08);}

        /* RIGHT PANEL */
        .right-panel{display:flex;flex-direction:column;gap:1.25rem;animation:fadeUp 0.5s ease 0.1s forwards;opacity:0;}

        /* TABS */
        .tabs{display:flex;gap:0.35rem;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:12px;padding:0.3rem;}
        .tab-btn{flex:1;padding:0.55rem 1rem;border-radius:9px;border:none;background:none;font-family:var(--font);font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.2s;color:var(--muted);display:flex;align-items:center;justify-content:center;gap:0.5rem;}
        .tab-btn.active{background:var(--dark2);color:var(--text);box-shadow:0 2px 8px rgba(0,0,0,0.3);}
        .tab-btn:hover:not(.active){color:rgba(255,255,255,0.7);}

        /* UPLOAD CARD */
        .upload-card{background:var(--dark2);border:1px solid var(--border);border-radius:22px;padding:2rem;display:flex;flex-direction:column;gap:1.5rem;}
        .upload-header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;}
        .card-eyebrow{font-size:0.62rem;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--v2);margin-bottom:0.35rem;}
        .card-title{font-family:var(--serif);font-size:1.25rem;font-weight:700;letter-spacing:-0.4px;line-height:1.15;}
        .card-sub{font-size:0.8rem;color:var(--muted);line-height:1.65;margin-top:0.35rem;}

        .upload-zone{
          border:2px dashed rgba(124,58,237,0.3);border-radius:16px;
          padding:2.5rem 2rem;display:flex;flex-direction:column;
          align-items:center;gap:0.85rem;cursor:pointer;transition:all 0.25s;
          background:rgba(124,58,237,0.02);text-align:center;
        }
        .upload-zone.drag{border-color:rgba(124,58,237,0.7);background:rgba(124,58,237,0.08);}
        .upload-zone:hover{border-color:rgba(124,58,237,0.55);background:rgba(124,58,237,0.05);}
        .upload-icon{width:52px;height:52px;border-radius:15px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.22);display:flex;align-items:center;justify-content:center;animation:float 3.5s ease-in-out infinite;}
        .upload-zone-title{font-size:0.88rem;font-weight:700;color:rgba(255,255,255,0.82);}
        .upload-zone-sub{font-size:0.72rem;color:var(--muted);}

        .howto-btn{
          display:flex;align-items:center;gap:0.6rem;
          background:rgba(124,58,237,0.06);
          border:1px solid rgba(124,58,237,0.18);
          border-radius:12px;padding:0.85rem 1.1rem;
          cursor:pointer;transition:all 0.2s;width:100%;
          text-align:left;
        }
        .howto-btn:hover{background:rgba(124,58,237,0.1);border-color:rgba(124,58,237,0.35);}
        .howto-icon{width:32px;height:32px;border-radius:9px;background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .howto-text-title{font-size:0.82rem;font-weight:700;color:rgba(255,255,255,0.85);}
        .howto-text-sub{font-size:0.7rem;color:var(--muted);margin-top:0.1rem;}
        .howto-arrow{margin-left:auto;color:var(--v2);opacity:0.7;}

        .btn-primary{background:linear-gradient(135deg,var(--v),#9333ea);color:white;border:none;border-radius:12px;padding:0.85rem 2rem;font-family:var(--font);font-size:0.88rem;font-weight:700;cursor:pointer;transition:all 0.25s;box-shadow:0 4px 20px rgba(124,58,237,0.3);width:100%;}
        .btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(124,58,237,0.45);}

        /* CHART CARD */
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

        /* WALLET SECTION */
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
          .nav-email{display:none;}
        }
      `}</style>

      {showHowTo && <HowToModal onClose={() => setShowHowTo(false)} />}

      {/* NAV */}
      <nav className="dash-nav">
        <a href="/" className="dash-logo"><div className="logo-dot" />DFS</a>
        <div className="nav-right">
          <NavWalletDropdown buttonClassName="wallet-nav-btn" />
          <span className="nav-email">{user.email}</span>
          <div className="nav-avatar">
            {user.picture ? <img src={user.picture} alt={displayName} /> : initials}
          </div>
          <a href="/auth/logout" className="logout-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Log out
          </a>
        </div>
      </nav>

      <main className="dash-main">
        {/* PAGE HEADER */}
        <div className="page-header">
          <div className="page-eyebrow">Your Dashboard</div>
          <h1 className="page-title">Welcome back, <em>{firstName}</em></h1>
        </div>

        {/* MAIN GRID */}
        <div className="dash-grid">

          {/* ── LEFT: PROFILE CARD ── */}
          <div className="profile-card">
            <div className="profile-banner">
              <div className="profile-banner-glow" />
            </div>
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
                  <span>Joined</span>
                  <span className="profile-info-val">{joinDate}</span>
                </div>
                <div className="profile-info-row">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>Built at</span>
                  <span className="profile-info-val">DeerHacks 2025</span>
                </div>
                <div className="profile-info-row">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span>Network</span>
                  <span className="profile-info-val">Solana Devnet</span>
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

              <div className="setup-progress">
                <div className="progress-title">Setup Progress</div>
                {[
                  { label: "Account created", dot: "green", badge: "Done", cls: "badge-done" },
                  { label: "Upload Gemini data", dot: "yellow", badge: "Pending", cls: "badge-pending" },
                  { label: "Set match intent", dot: "gray", badge: "Soon", cls: "badge-soon" },
                  { label: "Find your matches", dot: "gray", badge: "Soon", cls: "badge-soon" },
                ].map((item, i) => (
                  <div key={i} className="progress-item">
                    <div className={`progress-dot ${item.dot}`} />
                    <span className="progress-text">{item.label}</span>
                    <span className={`progress-badge ${item.cls}`}>{item.badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT: TABS + CONTENT ── */}
          <div className="right-panel">
            {/* TABS */}
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

            {/* UPLOAD TAB */}
            {activeTab === "upload" && (
              <div className="upload-card">
                <div className="upload-header">
                  <div>
                    <div className="card-eyebrow">Step 1 of 3</div>
                    <div className="card-title">Upload your Gemini data</div>
                    <div className="card-sub">Export your Google Gemini conversation history and drop it here. We extract interest vectors — your raw messages are never stored or read.</div>
                  </div>
                </div>

                <div
                  className={`upload-zone ${dragOver ? "drag" : ""}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); }}
                >
                  <div className="upload-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </div>
                  <div className="upload-zone-title">Drop your Gemini export here</div>
                  <div className="upload-zone-sub">or click to browse · .json or .zip accepted</div>
                </div>

                {/* HOW TO BUTTON */}
                <button className="howto-btn" onClick={() => setShowHowTo(true)}>
                  <div className="howto-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </div>
                  <div>
                    <div className="howto-text-title">How do I get my Gemini data?</div>
                    <div className="howto-text-sub">Step-by-step guide · takes ~2 minutes</div>
                  </div>
                  <div className="howto-arrow">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </button>

                <button className="btn-primary">Upload Gemini Data →</button>
              </div>
            )}

            {/* CHART TAB */}
            {activeTab === "chart" && (
              <div className="chart-card">
                <div className="card-eyebrow">Interest Profile</div>
                <div className="card-title" style={{ marginBottom: "1.25rem" }}>Your Spider Chart</div>

                {hasData ? (
                  <div style={{ display: "flex", justifyContent: "center", flex: 1, alignItems: "center" }}>
                    <SpiderChart values={[0.8,0.6,0.7,0.9,0.5,0.75]} color="#a78bfa" size={280} />
                  </div>
                ) : (
                  <div className="chart-locked">
                    {/* Blurred ghost chart behind */}
                    <div className="chart-blur-bg">
                      <SpiderChart values={[0.6,0.5,0.7,0.8,0.4,0.6]} color="#a78bfa" size={260} />
                    </div>
                    {/* Lock overlay */}
                    <div className="chart-lock-overlay">
                      <div className="lock-icon-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      </div>
                      <div className="lock-title">Chart not generated yet</div>
                      <div className="lock-sub">Upload your Gemini data and we'll map your intellectual fingerprint across 6 axes.</div>
                      <button className="btn-primary" style={{ width: "auto", padding: "0.65rem 1.5rem", fontSize: "0.82rem" }} onClick={() => setActiveTab("upload")}>
                        Upload data to unlock →
                      </button>
                    </div>
                  </div>
                )}

                {/* Axes preview */}
                <div className="chart-axes">
                  {["Creativity","Logic","Social","Tech","Writing","Science"].map(ax => (
                    <div key={ax} className="chart-axis-pill">{ax}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* WALLET SECTION */}
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
                <div className="wallet-empty-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 12h.01"/></svg>
                </div>
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