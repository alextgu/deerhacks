"use client";

import { useState, useEffect } from "react";

export function LoadingScreen() {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(0);

  const phases = [
    "Initializing",
    "Loading modules",
    "Connecting services",
    "Almost ready",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) return 100;
        const jump = Math.random() * 12 + 3;
        return Math.min(100, p + jump);
      });
    }, 120);

    const phaseInterval = setInterval(() => {
      setPhase((p) => Math.min(p + 1, phases.length - 1));
    }, 400);

    return () => {
      clearInterval(interval);
      clearInterval(phaseInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0a0a0f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2rem",
      }}
    >
      <style>{`
        @keyframes ls-spin { to { transform: rotate(360deg) } }
        @keyframes ls-pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }
        @keyframes ls-ring { 0% { transform: scale(1); opacity: 0.6 } 100% { transform: scale(2.2); opacity: 0 } }
        @keyframes ls-fade { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      {/* Logo + animated rings */}
      <div style={{ position: "relative", width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(124,58,237,0.15)", animation: "ls-ring 2s ease-out infinite" }} />
        <div style={{ position: "absolute", inset: -8, borderRadius: "50%", border: "1.5px solid rgba(124,58,237,0.1)", animation: "ls-ring 2s ease-out 0.5s infinite" }} />
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: "2.5px solid rgba(124,58,237,0.12)",
            borderTopColor: "#7c3aed",
            borderRightColor: "#a78bfa",
            animation: "ls-spin 1s cubic-bezier(0.4,0,0.2,1) infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
            boxShadow: "0 0 20px rgba(124,58,237,0.5)",
          }}
        />
      </div>

      {/* Brand */}
      <div style={{ textAlign: "center", animation: "ls-fade 0.6s ease forwards" }}>
        <div
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "1.4rem",
            fontWeight: 900,
            letterSpacing: "-0.5px",
            color: "#f1f0ff",
            marginBottom: "0.35rem",
          }}
        >
          DFS
        </div>
        <div
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            letterSpacing: "2.5px",
            textTransform: "uppercase" as const,
            color: "rgba(167,139,250,0.6)",
          }}
        >
          Depth First Social
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ width: 200, display: "flex", flexDirection: "column", gap: "0.6rem", alignItems: "center" }}>
        <div
          style={{
            width: "100%",
            height: 3,
            borderRadius: 4,
            background: "rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 4,
              background: "linear-gradient(90deg, #7c3aed, #a78bfa)",
              width: `${progress}%`,
              transition: "width 0.15s ease",
              boxShadow: "0 0 8px rgba(124,58,237,0.4)",
            }}
          />
        </div>
        <div
          style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            color: "rgba(255,255,255,0.25)",
            letterSpacing: "1px",
            animation: "ls-pulse 1.5s ease-in-out infinite",
          }}
        >
          {phases[phase]}
        </div>
      </div>
    </div>
  );
}
