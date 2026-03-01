"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, isLoading, router]);

  if (!mounted || isLoading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0a0a0f",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          border: "2px solid rgba(124,58,237,0.2)",
          borderTop: "2px solid #7c3aed",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!user) return null;

  const initials = user.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email?.[0].toUpperCase() ?? "?";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Fraunces:ital,wght@0,300;0,700;1,300;1,700&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --v: #7c3aed; --v2: #a78bfa; --v3: #c4b5fd;
          --dark: #0a0a0f; --dark2: #12121a; --dark3: #1a1a28;
          --text: #f1f0ff; --muted: rgba(241,240,255,0.45);
          --border: rgba(255,255,255,0.08);
          --font: 'Outfit', sans-serif;
          --serif: 'Fraunces', serif;
        }
        body { background: var(--dark); color: var(--text); font-family: var(--font); overflow-x: hidden; }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse-ring { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.8); opacity: 0; } }
        @keyframes gradient-shift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }

        .dash-wrap {
          min-height: 100vh;
          background: var(--dark);
          display: grid;
          grid-template-rows: auto 1fr;
        }

        .dash-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 3rem;
          border-bottom: 1px solid var(--border);
          background: rgba(10,10,15,0.8);
          backdrop-filter: blur(20px);
          position: sticky; top: 0; z-index: 100;
        }
        .dash-logo {
          font-weight: 900; font-size: 1.2rem; letter-spacing: -0.5px;
          display: flex; align-items: center; gap: 0.5rem;
          text-decoration: none; color: var(--text);
        }
        .logo-dot {
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--v2); position: relative;
        }
        .logo-dot::before {
          content: ''; position: absolute; inset: 0; border-radius: 50%;
          background: var(--v); animation: pulse-ring 1.5s ease-out infinite;
        }
        .dash-nav-right { display: flex; align-items: center; gap: 1rem; }
        .dash-nav-name { font-size: 0.82rem; font-weight: 600; color: var(--muted); }
        .dash-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          background: linear-gradient(135deg, var(--v), var(--v2));
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 800; color: white;
          border: 2px solid rgba(124,58,237,0.4);
          overflow: hidden;
        }
        .dash-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .logout-btn {
          background: none; border: 1px solid var(--border);
          color: var(--muted); border-radius: 8px;
          padding: 0.4rem 0.9rem; font-family: var(--font);
          font-size: 0.8rem; font-weight: 600; cursor: pointer;
          transition: all 0.2s; text-decoration: none;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .logout-btn:hover { border-color: rgba(239,68,68,0.4); color: rgba(239,68,68,0.8); }

        .wallet-nav-btn {
          background: none; border: 1px solid rgba(124,58,237,0.35);
          color: var(--v2); border-radius: 8px;
          padding: 0.4rem 0.9rem; font-family: var(--font);
          font-size: 0.8rem; font-weight: 600; cursor: pointer;
          transition: all 0.2s; text-decoration: none;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .wallet-nav-btn:hover { border-color: var(--v2); background: rgba(124,58,237,0.08); }

        .dash-main { padding: 3rem; max-width: 1200px; margin: 0 auto; width: 100%; }

        .welcome-row {
          display: flex; align-items: flex-end; justify-content: space-between;
          margin-bottom: 2.5rem;
          animation: fadeUp 0.6s ease forwards;
        }
        .welcome-pre {
          font-size: 0.7rem; font-weight: 700; letter-spacing: 3px;
          text-transform: uppercase; color: var(--v2); margin-bottom: 0.5rem;
        }
        .welcome-h1 {
          font-family: var(--serif); font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 700; letter-spacing: -1.5px; line-height: 1.05;
        }
        .welcome-h1 em {
          font-style: italic; color: transparent;
          background: linear-gradient(135deg, var(--v2), #f97316);
          background-size: 200% 200%;
          animation: gradient-shift 4s ease infinite;
          -webkit-background-clip: text; background-clip: text;
        }
        .welcome-email { font-size: 0.8rem; color: var(--muted); margin-top: 0.4rem; font-weight: 500; }

        .stats-row {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 1rem; margin-bottom: 2rem;
        }
        .stat-card {
          background: var(--dark2); border: 1px solid var(--border);
          border-radius: 18px; padding: 1.5rem;
          position: relative; overflow: hidden;
          animation: fadeUp 0.6s ease forwards;
          transition: border-color 0.2s, transform 0.2s;
        }
        .stat-card:hover { border-color: rgba(124,58,237,0.3); transform: translateY(-2px); }
        .stat-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
          border-radius: 18px 18px 0 0;
        }
        .stat-card:nth-child(1)::before { background: linear-gradient(90deg, var(--v), transparent); }
        .stat-card:nth-child(2)::before { background: linear-gradient(90deg, #f97316, transparent); }
        .stat-card:nth-child(3)::before { background: linear-gradient(90deg, #22c55e, transparent); }
        .stat-label { font-size: 0.68rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 0.75rem; }
        .stat-value { font-family: var(--serif); font-size: 2.2rem; font-weight: 700; letter-spacing: -1px; }
        .stat-sub { font-size: 0.72rem; color: var(--muted); margin-top: 0.25rem; font-weight: 500; }

        .dash-grid { display: grid; grid-template-columns: 1fr 340px; gap: 1.5rem; }

        .upload-card {
          background: var(--dark2); border: 1px solid var(--border);
          border-radius: 22px; padding: 2.5rem;
          animation: fadeUp 0.6s ease 0.1s forwards; opacity: 0;
          display: flex; flex-direction: column; gap: 1.5rem;
        }
        .card-pre { font-size: 0.68rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--v2); margin-bottom: 0.4rem; }
        .card-title { font-family: var(--serif); font-size: 1.4rem; font-weight: 700; letter-spacing: -0.5px; line-height: 1.2; }
        .card-sub { font-size: 0.82rem; color: var(--muted); line-height: 1.7; }

        .upload-zone {
          border: 2px dashed rgba(124,58,237,0.3); border-radius: 16px;
          padding: 3rem 2rem; display: flex; flex-direction: column;
          align-items: center; gap: 1rem; cursor: pointer; transition: all 0.2s;
          background: rgba(124,58,237,0.03); text-align: center;
        }
        .upload-zone:hover { border-color: rgba(124,58,237,0.6); background: rgba(124,58,237,0.07); }
        .upload-icon {
          width: 56px; height: 56px; border-radius: 16px;
          background: rgba(124,58,237,0.12); border: 1px solid rgba(124,58,237,0.25);
          display: flex; align-items: center; justify-content: center;
          animation: float 4s ease-in-out infinite;
        }
        .upload-zone-title { font-size: 0.9rem; font-weight: 700; color: rgba(255,255,255,0.85); }
        .upload-zone-sub { font-size: 0.75rem; color: var(--muted); }

        .upload-steps { display: flex; flex-direction: column; gap: 0.6rem; }
        .upload-step {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.75rem 1rem; border-radius: 10px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
          font-size: 0.8rem; color: rgba(255,255,255,0.6); font-weight: 500;
        }
        .step-num {
          width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
          background: rgba(124,58,237,0.15); border: 1px solid rgba(124,58,237,0.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.6rem; font-weight: 800; color: var(--v2);
        }
        .btn-primary {
          background: linear-gradient(135deg, var(--v), #9333ea);
          color: white; border: none; border-radius: 12px;
          padding: 0.9rem 2rem; font-family: var(--font);
          font-size: 0.9rem; font-weight: 700; cursor: pointer;
          transition: all 0.25s; box-shadow: 0 4px 24px rgba(124,58,237,0.35);
          width: 100%;
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(124,58,237,0.5); }

        .dash-sidebar { display: flex; flex-direction: column; gap: 1rem; }

        .profile-card {
          background: var(--dark2); border: 1px solid var(--border);
          border-radius: 22px; padding: 1.75rem;
          animation: fadeUp 0.6s ease 0.15s forwards; opacity: 0;
          text-align: center;
        }
        .profile-avatar-lg {
          width: 72px; height: 72px; border-radius: 50%;
          background: linear-gradient(135deg, var(--v), var(--v2));
          display: flex; align-items: center; justify-content: center;
          font-size: 1.4rem; font-weight: 800; color: white;
          margin: 0 auto 1rem; position: relative;
          border: 3px solid rgba(124,58,237,0.4);
          box-shadow: 0 0 30px rgba(124,58,237,0.25);
          overflow: hidden;
        }
        .profile-avatar-lg img { width: 100%; height: 100%; object-fit: cover; }
        .online-dot {
          position: absolute; bottom: 2px; right: 2px;
          width: 14px; height: 14px; border-radius: 50%;
          background: #22c55e; border: 2px solid var(--dark2);
        }
        .profile-name { font-family: var(--serif); font-size: 1.1rem; font-weight: 700; margin-bottom: 0.25rem; }
        .profile-email { font-size: 0.72rem; color: var(--muted); font-weight: 500; margin-bottom: 1.25rem; }
        .profile-divider { height: 1px; background: var(--border); margin-bottom: 1.25rem; }
        .profile-stat-row { display: flex; justify-content: space-around; }
        .profile-stat { text-align: center; }
        .profile-stat-val { font-family: var(--serif); font-size: 1.4rem; font-weight: 700; color: var(--v2); }
        .profile-stat-lbl { font-size: 0.65rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 0.15rem; }

        .status-card {
          background: var(--dark2); border: 1px solid var(--border);
          border-radius: 22px; padding: 1.5rem;
          animation: fadeUp 0.6s ease 0.2s forwards; opacity: 0;
        }
        .status-title { font-size: 0.75rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 1rem; }
        .status-item {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.7rem 0; border-bottom: 1px solid rgba(255,255,255,0.04);
          font-size: 0.8rem; font-weight: 600;
        }
        .status-item:last-child { border-bottom: none; padding-bottom: 0; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .status-dot.green { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.5); }
        .status-dot.yellow { background: #fbbf24; box-shadow: 0 0 8px rgba(251,191,36,0.5); }
        .status-dot.gray { background: rgba(255,255,255,0.2); }
        .status-text { flex: 1; color: rgba(255,255,255,0.7); }
        .status-badge {
          font-size: 0.62rem; font-weight: 700; padding: 0.15rem 0.5rem;
          border-radius: 100px; letter-spacing: 0.5px;
        }
        .badge-done { background: rgba(34,197,94,0.12); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
        .badge-pending { background: rgba(251,191,36,0.12); color: #fbbf24; border: 1px solid rgba(251,191,36,0.2); }
        .badge-soon { background: rgba(255,255,255,0.06); color: var(--muted); border: 1px solid rgba(255,255,255,0.08); }

        /* WALLET SECTION */
        .wallet-section { margin-top: 2rem; }
        .wallet-header { margin-bottom: 1.5rem; }
        .wallet-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .wallet-card {
          background: var(--dark2); border: 1px solid var(--border);
          border-radius: 22px; padding: 2rem;
          animation: fadeUp 0.6s ease 0.25s forwards; opacity: 0;
          position: relative; overflow: hidden;
          transition: border-color 0.2s, transform 0.2s;
        }
        .wallet-card:hover { border-color: rgba(124,58,237,0.3); transform: translateY(-2px); }
        .wallet-card-full {
          grid-column: 1 / -1;
          background: var(--dark2); border: 1px solid var(--border);
          border-radius: 22px; padding: 2rem;
          animation: fadeUp 0.6s ease 0.3s forwards; opacity: 0;
        }
        .wallet-balance-label { font-size: 0.68rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 0.5rem; }
        .wallet-balance-val { font-family: var(--serif); font-size: 2.8rem; font-weight: 700; letter-spacing: -2px; color: var(--text); }
        .wallet-balance-sub { font-size: 0.75rem; color: var(--muted); margin-top: 0.25rem; font-weight: 500; }
        .wallet-connect-btn {
          margin-top: 1.25rem;
          background: linear-gradient(135deg, var(--v), #9333ea);
          color: white; border: none; border-radius: 10px;
          padding: 0.75rem 1.5rem; font-family: var(--font);
          font-size: 0.85rem; font-weight: 700; cursor: pointer;
          transition: all 0.25s; box-shadow: 0 4px 16px rgba(124,58,237,0.3);
          display: flex; align-items: center; gap: 0.5rem;
        }
        .wallet-connect-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(124,58,237,0.45); }
        .wallet-stat-label { font-size: 0.68rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 0.5rem; }
        .wallet-stat-val { font-family: var(--serif); font-size: 1.6rem; font-weight: 700; letter-spacing: -0.5px; }
        .wallet-stat-sub { font-size: 0.72rem; color: var(--muted); margin-top: 0.25rem; }
        .wallet-tx-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.85rem 0; border-bottom: 1px solid rgba(255,255,255,0.04);
          font-size: 0.82rem;
        }
        .wallet-tx-row:last-child { border-bottom: none; padding-bottom: 0; }
        .wallet-tx-left { display: flex; align-items: center; gap: 0.75rem; }
        .wallet-tx-icon {
          width: 32px; height: 32px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .wallet-tx-name { font-weight: 600; color: rgba(255,255,255,0.85); }
        .wallet-tx-date { font-size: 0.7rem; color: var(--muted); margin-top: 0.1rem; }
        .wallet-tx-amount { font-weight: 700; font-size: 0.85rem; }
        .wallet-empty {
          display: flex; flex-direction: column; align-items: center;
          gap: 0.75rem; padding: 2rem; text-align: center;
          color: var(--muted);
        }
        .wallet-empty-icon {
          width: 48px; height: 48px; border-radius: 14px;
          background: rgba(124,58,237,0.08); border: 1px solid rgba(124,58,237,0.15);
          display: flex; align-items: center; justify-content: center;
        }
        .wallet-address {
          font-family: monospace; font-size: 0.75rem;
          color: var(--muted); background: rgba(255,255,255,0.04);
          border: 1px solid var(--border); border-radius: 8px;
          padding: 0.5rem 0.85rem; margin-top: 0.75rem;
          word-break: break-all;
        }
        .wallet-section-divider {
          height: 1px; background: var(--border);
          margin: 2.5rem 0;
        }

        @media(max-width: 900px) {
          .dash-main { padding: 1.5rem; }
          .dash-nav { padding: 1rem 1.5rem; }
          .stats-row { grid-template-columns: 1fr; }
          .dash-grid { grid-template-columns: 1fr; }
          .welcome-row { flex-direction: column; align-items: flex-start; gap: 1rem; }
          .wallet-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="dash-wrap">
        <nav className="dash-nav">
          <a href="/" className="dash-logo">
            <div className="logo-dot" />
            DFS
          </a>
          <div className="dash-nav-right">
            <button
              className="wallet-nav-btn"
              onClick={() => document.getElementById('wallet')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <path d="M16 12h.01"/>
              </svg>
              Wallet
            </button>
            <span className="dash-nav-name">{user.email}</span>
            <div className="dash-avatar">
              {user.picture ? <img src={user.picture} alt={user.name || "User"} /> : initials}
            </div>
            <a href="/auth/logout" className="logout-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Log out
            </a>
          </div>
        </nav>

        <main className="dash-main">
          <div className="welcome-row">
            <div>
              <div className="welcome-pre">Your Dashboard</div>
              <h1 className="welcome-h1">
                Welcome back, <em>{user.name?.split(" ")[0] || "there"}</em>
              </h1>
              <div className="welcome-email">{user.email}</div>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-card" style={{ animationDelay: "0.05s" }}>
              <div className="stat-label">Profile Status</div>
              <div className="stat-value" style={{ color: "#fbbf24" }}>Pending</div>
              <div className="stat-sub">Upload your data to get started</div>
            </div>
            <div className="stat-card" style={{ animationDelay: "0.1s" }}>
              <div className="stat-label">Matches Found</div>
              <div className="stat-value" style={{ color: "#f97316" }}>—</div>
              <div className="stat-sub">Complete your profile first</div>
            </div>
            <div className="stat-card" style={{ animationDelay: "0.15s" }}>
              <div className="stat-label">Member Since</div>
              <div className="stat-value" style={{ fontSize: "1.4rem", color: "#22c55e" }}>
                {new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </div>
              <div className="stat-sub">DeerHacks 2025</div>
            </div>
          </div>

          <div className="dash-grid">
            <div className="upload-card">
              <div>
                <div className="card-pre">Step 1 of 3</div>
                <div className="card-title">Upload your Gemini data</div>
                <div className="card-sub" style={{ marginTop: "0.4rem" }}>
                  Export your Google Gemini conversation history and upload it here.
                  We'll extract your interest vectors — no raw data is ever stored.
                </div>
              </div>

              <div className="upload-zone">
                <div className="upload-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div className="upload-zone-title">Drop your Gemini export here</div>
                <div className="upload-zone-sub">or click to browse · .json or .zip accepted</div>
              </div>

              <div>
                <div className="card-pre" style={{ marginBottom: "0.75rem" }}>How to export</div>
                <div className="upload-steps">
                  {[
                    "Go to takeout.google.com",
                    "Select only 'Gemini Apps Activity'",
                    "Download and upload the file here",
                  ].map((step, i) => (
                    <div key={i} className="upload-step">
                      <div className="step-num">{i + 1}</div>
                      {step}
                    </div>
                  ))}
                </div>
              </div>

              <button className="btn-primary">Upload Gemini Data →</button>
            </div>

            <div className="dash-sidebar">
              <div className="profile-card">
                <div className="profile-avatar-lg">
                  {user.picture ? <img src={user.picture} alt={user.name || "User"} /> : initials}
                  <div className="online-dot" />
                </div>
                <div className="profile-name">{user.name || "Anonymous"}</div>
                <div className="profile-email">{user.email}</div>
                <div className="profile-divider" />
                <div className="profile-stat-row">
                  <div className="profile-stat">
                    <div className="profile-stat-val">—</div>
                    <div className="profile-stat-lbl">Matches</div>
                  </div>
                  <div className="profile-stat">
                    <div className="profile-stat-val">—</div>
                    <div className="profile-stat-lbl">Score</div>
                  </div>
                  <div className="profile-stat">
                    <div className="profile-stat-val">0</div>
                    <div className="profile-stat-lbl">Chats</div>
                  </div>
                </div>
              </div>

              <div className="status-card">
                <div className="status-title">Setup Progress</div>
                {[
                  { label: "Account created", dot: "green", badge: "Done", cls: "badge-done" },
                  { label: "Upload Gemini data", dot: "yellow", badge: "Pending", cls: "badge-pending" },
                  { label: "Set match intent", dot: "gray", badge: "Soon", cls: "badge-soon" },
                  { label: "Find your matches", dot: "gray", badge: "Soon", cls: "badge-soon" },
                ].map((item, i) => (
                  <div key={i} className="status-item">
                    <div className={`status-dot ${item.dot}`} />
                    <span className="status-text">{item.label}</span>
                    <span className={`status-badge ${item.cls}`}>{item.badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* WALLET SECTION */}
          <div className="wallet-section-divider" />
          <div id="wallet" className="wallet-section">
            <div className="wallet-header">
              <div className="welcome-pre">Solana · Devnet</div>
              <h2 className="welcome-h1" style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)" }}>
                Your <em>Wallet</em>
              </h2>
            </div>

            <div className="wallet-grid">
              {/* BALANCE CARD */}
              <div className="wallet-card" style={{ background: "linear-gradient(135deg, #1a0a3d, #0f0a1f)" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, var(--v), var(--v2))", borderRadius: "22px 22px 0 0" }} />
                <div className="wallet-balance-label">Total Balance</div>
                <div className="wallet-balance-val">0 <span style={{ fontSize: "1.2rem", color: "var(--muted)" }}>SOL</span></div>
                <div className="wallet-balance-sub">≈ $0.00 USD · Devnet</div>
                <button className="wallet-connect-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  Connect Wallet
                </button>
              </div>

              {/* REPUTATION CARD */}
              <div className="wallet-card">
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #f97316, transparent)", borderRadius: "22px 22px 0 0" }} />
                <div className="wallet-stat-label">Reputation Score</div>
                <div className="wallet-stat-val" style={{ color: "#f97316" }}>—</div>
                <div className="wallet-stat-sub">Complete matches to earn reputation</div>

                <div style={{ marginTop: "1.5rem" }}>
                  <div className="wallet-stat-label" style={{ marginBottom: "0.75rem" }}>On-chain Activity</div>
                  {[
                    { label: "Matches completed", val: "0" },
                    { label: "Connections made", val: "0" },
                    { label: "Hackathons joined", val: "0" },
                  ].map((row, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                      fontSize: "0.78rem",
                    }}>
                      <span style={{ color: "var(--muted)", fontWeight: 500 }}>{row.label}</span>
                      <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{row.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* TRANSACTION HISTORY */}
              <div className="wallet-card-full">
                <div className="wallet-stat-label" style={{ marginBottom: "1rem" }}>Transaction History</div>
                <div className="wallet-empty">
                  <div className="wallet-empty-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2"/>
                      <path d="M16 12h.01"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>No transactions yet</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Connect your wallet and complete matches to see activity here</div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}