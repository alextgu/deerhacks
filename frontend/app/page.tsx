"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
import { getDisplayName } from "@/lib/user-display";

// ── Intersection observer hook ─────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ── Spider chart (animated) ────────────────────────────────────────────────────
function SpiderChart({ values, color, size = 200 }: { values: number[]; color: string; size?: number }) {
  const [disp, setDisp] = useState(values);
  const target = useRef(values);
  useEffect(() => { target.current = values; }, [values]);
  useEffect(() => {
    let raf: number;
    const tick = () => {
      setDisp(prev => {
        const next = prev.map((v, i) => { const d = target.current[i] - v; return Math.abs(d) < 0.001 ? target.current[i] : v + d * 0.05; });
        return next;
      });
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
      {[.25,.5,.75,1].map(rv => <polygon key={rv} points={axes.map((_,i)=>{const p=toXY(i,rv);return`${p.x},${p.y}`;}).join(" ")} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>)}
      {axes.map((_,i)=>{const p=toXY(i,1);return<line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>;})}
      <path d={path(disp)} fill={`${color}25`} stroke={color} strokeWidth="2.5" strokeLinejoin="round"/>
      {disp.map((v,i)=>{const p=toXY(i,v);return<circle key={i} cx={p.x} cy={p.y} r="4" fill={color}/>;}) }
      {axes.map((l,i)=>{const p=toXY(i,1.28);return<text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="rgba(255,255,255,0.5)" fontFamily="'Outfit',sans-serif">{l}</text>;})}
    </svg>
  );
}

function randVals() { return Array.from({length:6},()=>Math.round((Math.random()*.65+.3)*100)/100); }
function cosSim(a:number[],b:number[]) { const d=a.reduce((s,v,i)=>s+v*b[i],0); return Math.round(d/(Math.sqrt(a.reduce((s,v)=>s+v*v,0))*Math.sqrt(b.reduce((s,v)=>s+v*v,0)))*100); }

// ── Typewriter ────────────────────────────────────────────────────────────────
function Typewriter({ texts }: { texts: string[] }) {
  const [txt, setTxt] = useState("");
  const state = useRef({ i: 0, c: 0, deleting: false });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function step() {
      const st = state.current;
      const word = texts[st.i];

      if (!st.deleting) {
        const nextC = st.c + 1;
        setTxt(word.slice(0, nextC));
        st.c = nextC;
        if (nextC >= word.length) {
          st.deleting = true;
          timer = setTimeout(step, 2000);
        } else {
          timer = setTimeout(step, 72);
        }
      } else {
        const nextC = st.c - 1;
        setTxt(word.slice(0, nextC));
        st.c = nextC;
        if (nextC <= 0) {
          st.deleting = false;
          st.i = (st.i + 1) % texts.length;
          st.c = 0;
          timer = setTimeout(step, 380);
        } else {
          timer = setTimeout(step, 38);
        }
      }
    }

    timer = setTimeout(step, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{txt}<span style={{display:"inline-block",width:3,height:"0.9em",background:"currentColor",marginLeft:3,verticalAlign:"middle",animation:"blink .9s step-end infinite"}}/></>;
}

// ── Testimonials data ──────────────────────────────────────────────────────────
const TESTI = [
  { h: "@saket_s", q: "Found my perfect hackathon team in 20 minutes. We ended up winning.", r: "CS student, UWaterloo" },
  { h: "@alex_k",  q: "First app that matched me with people I actually clicked with.", r: "Software engineer" },
  { h: "@sean_m",  q: "91% overlap on tech and writing. We shipped something real.", r: "Founder, BuildFast" },
  { h: "@akash_p", q: "Met my co-founder here. 6 months in, building something meaningful.", r: "Startup founder" },
  { h: "@priya_r", q: "Uploaded my data, matched, had coffee the next day. Uncanny.", r: "ML researcher" },
  { h: "@mei_l",   q: "Finally a place where being curious is the whole point.", r: "PhD student, MIT" },
];

// ── Auto-scrolling + draggable testimonial strip ───────────────────────────────
function TestiStrip() {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartSL = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRaf = useRef<number | null>(null);
  const SPEED = 0.55;

  function startAuto() {
    if (autoRaf.current) return;
    function tick() {
      const el = trackRef.current;
      if (!el) return;
      el.scrollLeft += SPEED;
      if (el.scrollLeft >= el.scrollWidth / 2) {
        el.scrollLeft = 0;
      }
      autoRaf.current = requestAnimationFrame(tick);
    }
    autoRaf.current = requestAnimationFrame(tick);
  }

  function stopAuto() {
    if (autoRaf.current) { cancelAnimationFrame(autoRaf.current); autoRaf.current = null; }
  }

  function scheduleRestart() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => startAuto(), 5000);
  }

  useEffect(() => {
    startAuto();
    return () => {
      stopAuto();
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doubled = [...TESTI, ...TESTI];

  return (
    <div
      ref={trackRef}
      style={{
        display: "flex", gap: "1.25rem", overflowX: "auto",
        paddingBottom: "1rem", cursor: "grab",
        scrollbarWidth: "none", userSelect: "none",
      }}
      onMouseDown={e => {
        stopAuto();
        isDragging.current = true;
        dragStartX.current = e.pageX;
        dragStartSL.current = trackRef.current?.scrollLeft || 0;
        if (trackRef.current) trackRef.current.style.cursor = "grabbing";
      }}
      onMouseMove={e => {
        if (!isDragging.current || !trackRef.current) return;
        e.preventDefault();
        trackRef.current.scrollLeft = dragStartSL.current - (e.pageX - dragStartX.current);
      }}
      onMouseUp={() => {
        isDragging.current = false;
        if (trackRef.current) trackRef.current.style.cursor = "grab";
        scheduleRestart();
      }}
      onMouseLeave={() => {
        if (isDragging.current) {
          isDragging.current = false;
          if (trackRef.current) trackRef.current.style.cursor = "grab";
          scheduleRestart();
        }
      }}
      onTouchStart={e => {
        stopAuto();
        dragStartX.current = e.touches[0].pageX;
        dragStartSL.current = trackRef.current?.scrollLeft || 0;
      }}
      onTouchMove={e => {
        if (!trackRef.current) return;
        trackRef.current.scrollLeft = dragStartSL.current - (e.touches[0].pageX - dragStartX.current);
      }}
      onTouchEnd={() => scheduleRestart()}
    >
      {doubled.map((t, i) => (
        <div key={`${t.h}-${i}`} style={{
          minWidth: 300, flexShrink: 0,
          background: "rgba(255,255,255,0.035)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 20, padding: "1.75rem",
          position: "relative", backdropFilter: "blur(8px)",
          transition: "border-color 0.3s, background 0.3s",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(124,58,237,0.35)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(124,58,237,0.06)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.035)"; }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 2, borderRadius: "20px 20px 0 0", background: (i % TESTI.length) < 3 ? "linear-gradient(90deg,rgba(124,58,237,0.6),transparent)" : "linear-gradient(90deg,rgba(167,139,250,0.4),transparent)" }} />
          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--v2)", letterSpacing: 1, marginBottom: "0.85rem" }}>{t.h}</div>
          <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "0.95rem", color: "rgba(255,255,255,0.82)", lineHeight: 1.65, marginBottom: "1.1rem" }}>"{t.q}"</div>
          <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>{t.r}</div>
        </div>
      ))}
    </div>
  );
}

// ── Features — vertical node list with side visuals ────────────────────────────
const FEATURE_ITEMS = [
  {
    num: "01", color: "#7c3aed", tag: "Identity",
    title: "Your spider chart is your identity",
    desc: "Six axes built from your actual Gemini conversations — creativity, logic, tech, writing, science, social. No quiz, no guessing.",
    visual: "spider",
  },
  {
    num: "02", color: "#8b2fe8", tag: "Matching",
    title: "Intent-based, not swiping",
    desc: "Set your goal before we show you anyone. Friend, hackathon team, or co-founder — every match is purposeful.",
    visual: "intent",
  },
  {
    num: "03", color: "#9333ea", tag: "Transparency",
    title: "See the overlap before you speak",
    desc: "Both charts displayed side by side on match. Know exactly where you align before writing the first message.",
    visual: "overlap",
  },
  {
    num: "04", color: "#a055f5", tag: "Messaging",
    title: "Instant chat, always saved",
    desc: "A private panel opens the moment you match. Real-time via Supabase. No DM requests, no mutual follows.",
    visual: "chat",
  },
  {
    num: "05", color: "#a78bfa", tag: "Privacy",
    title: "Your data never leaves the upload",
    desc: "We extract interest vectors and discard the raw file immediately. Zero conversation content stored — ever.",
    visual: "lock",
  },
];

function FeaturesVertical({ youT, matchT }: { youT: number[]; matchT: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold: 0.08 });
    obs.observe(el); return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{
        position: "absolute", left: 27, top: 28, bottom: 28, width: 1,
        background: "linear-gradient(to bottom, rgba(124,58,237,0.6) 0%, rgba(167,139,250,0.2) 75%, transparent 100%)",
        zIndex: 0,
      }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
        {FEATURE_ITEMS.map((item, i) => (
          <div
            key={item.num}
            style={{
              display: "grid", gridTemplateColumns: "56px 1fr 320px",
              gap: "2rem", alignItems: "center",
              position: "relative", zIndex: 1,
              opacity: inView ? 1 : 0,
              transform: inView ? "translateX(0)" : "translateX(-24px)",
              transition: `opacity 0.6s ${i * 0.11}s, transform 0.6s ${i * 0.11}s`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{
                width: 54, height: 54, borderRadius: "50%",
                background: "var(--dark3)",
                border: `2px solid ${item.color}80`,
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative", flexShrink: 0,
                boxShadow: inView ? `0 0 18px ${item.color}30` : "none",
                transition: "box-shadow 0.6s",
              }}>
                {inView && (
                  <div style={{
                    position: "absolute", inset: -7, borderRadius: "50%",
                    border: `1.5px solid ${item.color}50`,
                    animation: `pulse-ring 3s ease-out ${i * 0.5}s infinite`,
                  }} />
                )}
                <span style={{ fontSize: "0.58rem", fontWeight: 800, color: item.color, letterSpacing: 1 }}>{item.num}</span>
              </div>
            </div>

            <div>
              <div style={{
                display: "inline-flex", alignItems: "center",
                background: `${item.color}14`, border: `1px solid ${item.color}30`,
                borderRadius: 100, padding: "0.12rem 0.6rem",
                fontSize: "0.65rem", fontWeight: 700, color: item.color,
                marginBottom: "0.55rem", letterSpacing: 0.5,
              }}>{item.tag}</div>
              <h3 style={{
                fontFamily: "var(--serif)", fontSize: "1.05rem", fontWeight: 700,
                letterSpacing: "-0.3px", marginBottom: "0.4rem",
                color: "rgba(255,255,255,0.92)", lineHeight: 1.25,
              }}>{item.title}</h3>
              <p style={{ fontSize: "0.81rem", color: "rgba(255,255,255,0.48)", lineHeight: 1.7 }}>{item.desc}</p>
            </div>

            <div style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16, padding: "1.25rem",
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: 130,
            }}>
              {item.visual === "spider" && <SpiderChart values={youT} color={item.color} size={110} />}
              {item.visual === "overlap" && (
                <div style={{ position: "relative", width: 110, height: 110 }}>
                  <SpiderChart values={youT} color="#a78bfa" size={110} />
                  <div style={{ position: "absolute", inset: 0, opacity: 0.7 }}>
                    <SpiderChart values={matchT} color="#f97316" size={110} />
                  </div>
                </div>
              )}
              {item.visual === "intent" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", width: "100%" }}>
                  {["Friend", "Hackathon (2–5)", "Co-founder"].map((opt, j) => (
                    <div key={opt} style={{
                      background: j === 0 ? `${item.color}14` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${j === 0 ? item.color + "50" : "rgba(255,255,255,0.07)"}`,
                      borderRadius: 8, padding: "0.45rem 0.8rem",
                      fontSize: "0.76rem", fontWeight: 600,
                      color: j === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.38)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      {opt}
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: j === 0 ? item.color : "rgba(255,255,255,0.12)" }} />
                    </div>
                  ))}
                </div>
              )}
              {item.visual === "chat" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", width: "100%" }}>
                  {[{t:"them",m:"Saw our 88% match 👀"},{t:"me",m:"What are you building?"},{t:"them",m:"AI tool — same vibe"}].map((msg, j) => (
                    <div key={j} style={{
                      borderRadius: 10, padding: "0.4rem 0.75rem",
                      fontSize: "0.73rem", fontWeight: 500,
                      maxWidth: "78%", display: "flex",
                      alignSelf: msg.t === "me" ? "flex-end" : "flex-start",
                      background: msg.t === "me" ? `linear-gradient(135deg,${item.color},#9333ea)` : "rgba(255,255,255,0.06)",
                      border: msg.t === "me" ? "none" : "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.88)",
                    }}>{msg.m}</div>
                  ))}
                </div>
              )}
              {item.visual === "lock" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.7rem" }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%",
                    background: `${item.color}14`, border: `1px solid ${item.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={item.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", textAlign: "center", lineHeight: 1.5 }}>
                    Raw file deleted on upload.<br/>Zero bytes stored.
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const NAMES = ["alex_k","priya_s","dan_w","mei_l","omar_r","julia_t","kiran_b","sam_v"];

export default function Home() {
  const { user } = useUser();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [youT, setYouT] = useState<number[]>([]);
  const [matchT, setMatchT] = useState<number[]>([]);
  const [mName, setMName] = useState("");
  const [mPct, setMPct] = useState(0);

  const heroRef = useRef<HTMLElement>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const mouseSmooth = useRef({ x: 0, y: 0 });
  const [glowPos, setGlowPos] = useState({ x: 0, y: 0 });
  const [heroHeight, setHeroHeight] = useState(0);

  useEffect(() => {
    setMounted(true);
    const y = randVals(), m = randVals();
    setYouT(y); setMatchT(m);
    setMName(NAMES[Math.floor(Math.random()*NAMES.length)]);
    setMPct(cosSim(y, m));
    const interval = setInterval(() => {
      const ny = randVals(), nm = randVals();
      setYouT(ny); setMatchT(nm);
      setMName(NAMES[Math.floor(Math.random()*NAMES.length)]);
      setMPct(cosSim(ny, nm));
    }, 4000);
    const onScroll = () => { setScrolled(window.scrollY > 50); };
    window.addEventListener("scroll", onScroll);
    // Close dropdown on outside click
    const onClickOutside = (e: MouseEvent) => {
      const wrap = document.querySelector('.user-menu-wrap');
      const dropdown = document.getElementById('user-dropdown');
      if (dropdown && wrap && !wrap.contains(e.target as Node)) {
        dropdown.style.display = 'none';
      }
    };
    document.addEventListener('click', onClickOutside);
    if (heroRef.current) setHeroHeight(heroRef.current.offsetHeight);
    return () => {
      clearInterval(interval);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener('click', onClickOutside);
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      mouseSmooth.current.x += (mouse.x - mouseSmooth.current.x) * 0.05;
      mouseSmooth.current.y += (mouse.y - mouseSmooth.current.y) * 0.05;
      setGlowPos({ x: mouseSmooth.current.x, y: mouseSmooth.current.y });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mouse]);

  if (!mounted || !youT.length) return null;

  const showGlow = glowPos.y < (heroHeight || 900);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Fraunces:ital,wght@0,300;0,700;1,300;1,700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
        :root{
          --v: #7c3aed; --v2: #a78bfa; --v3: #c4b5fd;
          --o: #f97316; --y: #fbbf24;
          --dark: #0a0a0f; --dark2: #12121a; --dark3: #1a1a28;
          --text: #f1f0ff; --muted: rgba(241,240,255,0.45);
          --border: rgba(255,255,255,0.08);
          --font: 'Outfit', sans-serif;
          --serif: 'Fraunces', serif;
        }
        html{scroll-behavior:smooth;}
        body{background:var(--dark);color:var(--text);font-family:var(--font);overflow-x:hidden;}
        ::selection{background:rgba(124,58,237,0.3);}

        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes pulse-ring{0%{transform:scale(1);opacity:0.65}100%{transform:scale(1.9);opacity:0}}
        @keyframes slide-in-left{from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slide-in-right{from{opacity:0;transform:translateX(60px)}to{opacity:1;transform:translateX(0)}}
        @keyframes gradient-shift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}

        /* NAV */
        nav{
          position:fixed;top:0;left:0;right:0;z-index:200;
          display:grid;grid-template-columns:1fr auto 1fr;
          align-items:center;padding:1rem 2.5rem;transition:all 0.4s;
        }
        nav.scrolled{background:rgba(10,10,15,0.85);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);}
        .logo{font-weight:900;font-size:1.3rem;letter-spacing:-0.5px;display:flex;align-items:center;gap:0.5rem;justify-self:start;}
        .logo-ring{position:relative;width:10px;height:10px;flex-shrink:0;}
        .logo-ring::before{content:'';position:absolute;inset:0;border-radius:50%;background:var(--v);animation:pulse-ring 1.5s ease-out infinite;}
        .logo-ring::after{content:'';position:absolute;inset:1px;border-radius:50%;background:var(--v2);}
        .nav-c{display:flex;gap:2rem;font-size:0.85rem;font-weight:500;justify-self:center;}
        .nav-c a{text-decoration:none;color:var(--muted);transition:color 0.2s;}
        .nav-c a:hover{color:var(--text);}
        .nav-r{display:flex;gap:0.6rem;justify-self:end;}
        .nb{background:none;border:1px solid var(--border);color:var(--muted);border-radius:8px;padding:0.45rem 1rem;font-family:var(--font);font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.2s;}
        .nb:hover{border-color:var(--v2);color:var(--v2);}
        .nb-fill{background:linear-gradient(135deg,var(--v),var(--v2));color:white;border:none;border-radius:8px;padding:0.45rem 1.1rem;font-family:var(--font);font-size:0.82rem;font-weight:700;cursor:pointer;transition:all 0.2s;}
        .nb-fill:hover{opacity:0.85;transform:translateY(-1px);}

        /* USER AVATAR + DROPDOWN */
        .user-menu-wrap{position:relative;}
        .user-avatar-btn{
          position:relative;background:none;border:2px solid rgba(124,58,237,0.5);
          border-radius:50%;padding:0;cursor:pointer;width:40px;height:40px;
          display:flex;align-items:center;justify-content:center;
          transition:border-color 0.2s,box-shadow 0.2s;overflow:visible;
        }
        .user-avatar-btn:hover{border-color:var(--v2);box-shadow:0 0 0 4px rgba(124,58,237,0.15);}
        .user-avatar-fallback{
          width:36px;height:36px;border-radius:50%;
          background:linear-gradient(135deg,var(--v),var(--v2));
          display:flex;align-items:center;justify-content:center;
          color:white;
        }
        .user-status-dot{
          position:absolute;bottom:0;right:0;
          width:10px;height:10px;border-radius:50%;
          background:#22c55e;border:2px solid var(--dark);
        }
        .user-dropdown{
          position:absolute;top:calc(100% + 12px);right:0;
          background:rgba(18,18,26,0.98);border:1px solid rgba(255,255,255,0.1);
          border-radius:16px;padding:0.5rem;min-width:220px;
          backdrop-filter:blur(20px);
          box-shadow:0 20px 60px rgba(0,0,0,0.5),0 0 0 1px rgba(124,58,237,0.1);
          flex-direction:column;gap:0.15rem;z-index:300;
        }
        .user-dropdown-info{padding:0.75rem 0.85rem 0.6rem;}
        .user-dropdown-name{font-size:0.85rem;font-weight:700;color:rgba(255,255,255,0.92);margin-bottom:0.15rem;}
        .user-dropdown-email{font-size:0.72rem;color:rgba(255,255,255,0.35);font-weight:500;}
        .user-dropdown-divider{height:1px;background:rgba(255,255,255,0.07);margin:0.25rem 0;}
        .user-dropdown-item{
          display:flex;align-items:center;gap:0.6rem;
          padding:0.6rem 0.85rem;border-radius:10px;
          font-size:0.82rem;font-weight:600;color:rgba(255,255,255,0.65);
          text-decoration:none;transition:background 0.15s,color 0.15s;cursor:pointer;
        }
        .user-dropdown-item:hover{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.92);}
        .user-dropdown-logout{color:rgba(239,68,68,0.7);}
        .user-dropdown-logout:hover{background:rgba(239,68,68,0.08);color:rgba(239,68,68,0.9);}

        /* HERO */
        .hero{min-height:100vh;display:grid;grid-template-columns:1fr 1fr;align-items:center;padding:7rem 4rem 4rem;gap:3rem;position:relative;overflow:hidden;}
        .hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px);background-size:80px 80px;pointer-events:none;mask-image:radial-gradient(ellipse at center,black 40%,transparent 80%);}
        .hero-left{animation:slide-in-left 0.8s ease forwards;}
        .hero-h1{font-family:var(--serif);font-size:clamp(3rem,5.5vw,5.5rem);font-weight:700;line-height:1;letter-spacing:-2px;margin-bottom:1rem;}
        .hero-h1 em{font-style:italic;color:transparent;background:linear-gradient(135deg,var(--v2),var(--o));background-size:200% 200%;animation:gradient-shift 4s ease infinite;-webkit-background-clip:text;background-clip:text;}
        .hero-sub{font-size:1rem;color:var(--muted);line-height:1.75;max-width:420px;margin-bottom:0.75rem;}
        .hero-tw{font-size:0.95rem;color:var(--v2);font-weight:600;margin-bottom:2rem;min-height:1.5rem;}
        .hero-btns{display:flex;gap:0.75rem;flex-wrap:wrap;}
        .btn-primary{background:linear-gradient(135deg,var(--v),#9333ea);color:white;border:none;border-radius:10px;padding:0.85rem 2rem;font-family:var(--font);font-size:0.9rem;font-weight:700;cursor:pointer;transition:all 0.25s;box-shadow:0 4px 24px rgba(124,58,237,0.35);}
        .btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(124,58,237,0.5);}
        .btn-outline{background:none;border:1px solid var(--border);color:var(--text);border-radius:10px;padding:0.85rem 2rem;font-family:var(--font);font-size:0.9rem;font-weight:600;cursor:pointer;transition:all 0.25s;}
        .btn-outline:hover{border-color:var(--v2);color:var(--v2);transform:translateY(-2px);}
        .hero-right{animation:slide-in-right 0.8s ease forwards;display:flex;flex-direction:column;gap:1.5rem;align-items:center;}
        .charts-stack{position:relative;display:flex;align-items:center;gap:2rem;}
        .chart-bubble{background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:24px;padding:1.5rem;backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;gap:0.4rem;position:relative;animation:float 6s ease-in-out infinite;}
        .chart-bubble:nth-child(3){animation-delay:1s;}
        .chart-lbl{font-size:0.65rem;font-weight:700;color:var(--muted);letter-spacing:2px;text-transform:uppercase;}
        .chart-name{font-size:0.9rem;font-weight:700;}
        .pct-tag{position:absolute;top:-12px;right:12px;background:linear-gradient(135deg,var(--v),var(--v2));color:white;font-size:0.7rem;font-weight:800;padding:0.2rem 0.7rem;border-radius:100px;box-shadow:0 4px 12px rgba(124,58,237,0.4);}
        .charts-mid{display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--muted);font-size:0.7rem;font-weight:600;}
        .charts-mid-line{width:1px;height:40px;background:linear-gradient(to bottom,var(--v),transparent);opacity:0.4;}
        .charts-mid-dot{width:8px;height:8px;border-radius:50%;background:var(--v);position:relative;}
        .charts-mid-dot::after{content:'';position:absolute;inset:-4px;border-radius:50%;border:1px solid var(--v);animation:pulse-ring 2s ease-out infinite;}
        .rand-note{font-size:0.72rem;color:var(--muted);font-weight:500;text-align:center;}

        /* MARQUEE */
        .marquee-strip{background:var(--v);padding:0.85rem 0;overflow:hidden;white-space:nowrap;position:relative;z-index:2;}
        .marquee-inner{display:inline-flex;gap:0;animation:marquee 18s linear infinite;}
        .marquee-item{display:inline-flex;align-items:center;gap:1rem;padding:0 2.5rem;font-weight:700;font-size:0.85rem;letter-spacing:0.5px;}
        .marquee-sep{opacity:0.5;font-size:1.2rem;}

        /* HOW IT WORKS */
        .how-section{background:var(--dark2);padding:6rem 4rem;position:relative;overflow:hidden;}
        .how-section::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(to right,transparent,var(--border),transparent);}
        .section-pre{font-size:0.7rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--v2);margin-bottom:0.75rem;}
        .section-h{font-family:var(--serif);font-size:clamp(2rem,4vw,3.5rem);font-weight:700;letter-spacing:-1.5px;line-height:1.05;margin-bottom:0.75rem;}
        .section-h em{font-style:italic;color:var(--v2);}
        .section-sub{font-size:0.88rem;color:var(--muted);margin-bottom:3.5rem;max-width:600px;line-height:1.7;}

        /* FEATURES */
        .features-section{padding:6rem 4rem;background:var(--dark);position:relative;}
        .features-section::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(to right,transparent,var(--border),transparent);}

        /* FEEDBACK */
        .testi-section{background:var(--dark2);padding:6rem 4rem;position:relative;overflow:hidden;}
        .testi-section::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(to right,transparent,var(--border),transparent);}
        .testi-bg-text{
          position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
          font-family:var(--serif);font-size:clamp(6rem,14vw,14rem);
          font-weight:700;font-style:italic;
          color:rgba(124,58,237,0.07);
          white-space:nowrap;pointer-events:none;user-select:none;letter-spacing:-4px;
        }
        .testi-inner{position:relative;z-index:1;}
        .drag-hint{display:flex;align-items:center;gap:0.5rem;font-size:0.72rem;color:rgba(255,255,255,0.2);font-weight:500;margin-top:1.25rem;}
        .drag-hint-line{flex:1;height:1px;background:rgba(255,255,255,0.06);}

        /* CTA — contained glow lives inside .cta-box which has overflow:hidden */
        .cta-section{
          padding:5rem 4rem 5rem;
          background:var(--dark);
        }
        .cta-box{
          background:linear-gradient(135deg,#1a0a3d,#0f0a1f,#1a0a3d);
          border:1px solid rgba(124,58,237,0.2);
          border-radius:28px;padding:5rem 4rem;
          text-align:center;
          /* KEY: position:relative + overflow:hidden keeps the glow div fully contained */
          position:relative;
          overflow:hidden;
        }
        /* Static ambient glow — absolutely positioned inside the box, cannot bleed out */
        .cta-glow{
          position:absolute;
          top:50%;left:50%;
          transform:translate(-50%,-50%);
          width:700px;height:400px;
          border-radius:50%;
          background:radial-gradient(ellipse at center, rgba(124,58,237,0.28) 0%, rgba(100,30,200,0.14) 40%, rgba(40,10,80,0.04) 70%, transparent 100%);
          pointer-events:none;
          filter:blur(40px);
        }
        /* Everything inside the box sits above the glow */
        .cta-content{position:relative;z-index:1;}
        .cta-h{font-family:var(--serif);font-size:clamp(2rem,4vw,3.8rem);font-weight:700;letter-spacing:-2px;margin-bottom:1rem;line-height:1.05;}
        .cta-h em{font-style:italic;color:var(--v2);}
        .cta-sub{color:var(--muted);font-size:1rem;margin-bottom:2.5rem;line-height:1.7;}
        .cta-btns{display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;}

        /* FOOTER */
        footer{background:var(--dark2);border-top:1px solid var(--border);padding:0;}
        .footer-top{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:3rem;padding:3rem 4rem;}
        .footer-logo{font-weight:900;font-size:1.1rem;color:var(--text);margin-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem;}
        .footer-tagline{font-size:0.78rem;color:var(--muted);line-height:1.6;max-width:220px;margin-top:0.5rem;}
        .footer-col-title{font-size:0.7rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--v2);margin-bottom:1rem;}
        .footer-links{display:flex;flex-direction:column;gap:0.5rem;}
        .footer-links a{font-size:0.8rem;color:var(--muted);text-decoration:none;transition:color 0.2s;font-weight:500;}
        .footer-links a:hover{color:var(--text);}
        .footer-bottom{border-top:1px solid var(--border);padding:1.25rem 4rem;display:flex;align-items:center;justify-content:space-between;}
        .footer-copy{font-size:0.75rem;color:rgba(255,255,255,0.25);font-weight:500;}
        .footer-built{font-size:0.75rem;color:rgba(255,255,255,0.2);font-weight:500;}
        .footer-socials{display:flex;gap:1rem;align-items:center;}
        .footer-social-link{width:32px;height:32px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;transition:all 0.2s;cursor:pointer;}
        .footer-social-link:hover{border-color:var(--v2);background:rgba(124,58,237,0.08);}

        /* SCROLL REVEAL */
        .reveal{opacity:0;transform:translateY(40px);transition:opacity 0.7s ease,transform 0.7s ease;}
        .reveal.in{opacity:1;transform:translateY(0);}
        .reveal-l{opacity:0;transform:translateX(-40px);transition:opacity 0.7s ease,transform 0.7s ease;}
        .reveal-l.in{opacity:1;transform:translateX(0);}
        .reveal-r{opacity:0;transform:translateX(40px);transition:opacity 0.7s ease,transform 0.7s ease;}
        .reveal-r.in{opacity:1;transform:translateX(0);}

        @media(max-width:900px){
          .hero{grid-template-columns:1fr;padding:6rem 2rem 3rem;}
          .hero-right{order:-1;}
          .how-section,.features-section,.testi-section,.cta-section{padding-left:1.5rem;padding-right:1.5rem;}
          .footer-top{grid-template-columns:1fr 1fr;gap:2rem;padding:2rem 1.5rem;}
          .footer-bottom{flex-direction:column;gap:1rem;padding:1rem 1.5rem;text-align:center;}
          nav{padding:1rem 1.5rem;grid-template-columns:auto 1fr auto;}
          .nav-c{display:none;}
        }
      `}</style>

      {/* Hero-only mouse glow */}
      {showGlow && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 0 }}>
          <div style={{ position: "absolute", width: 1000, height: 680, borderRadius: "62% 38% 70% 30% / 45% 55% 45% 55%", background: `radial-gradient(ellipse at 50% 50%, rgba(100,40,210,0.18) 0%, rgba(80,30,180,0.1) 30%, rgba(40,15,80,0.06) 58%, rgba(10,10,15,0) 80%)`, transform: `translate(${glowPos.x - 500}px,${glowPos.y - 340}px)`, filter: "blur(55px)", willChange: "transform" }} />
          <div style={{ position: "absolute", width: 560, height: 400, borderRadius: "45% 55% 38% 62% / 58% 42% 58% 42%", background: `radial-gradient(ellipse at 48% 52%, rgba(130,55,240,0.32) 0%, rgba(110,40,220,0.18) 35%, rgba(60,20,120,0.07) 62%, rgba(10,10,15,0) 78%)`, transform: `translate(${glowPos.x - 280}px,${glowPos.y - 200}px)`, filter: "blur(36px)", willChange: "transform" }} />
          <div style={{ position: "absolute", width: 260, height: 190, borderRadius: "68% 32% 52% 48% / 42% 58% 42% 58%", background: `radial-gradient(ellipse at 46% 48%, rgba(155,90,255,0.42) 0%, rgba(130,60,240,0.22) 40%, rgba(70,25,140,0.06) 68%, rgba(10,10,15,0) 80%)`, transform: `translate(${glowPos.x - 130}px,${glowPos.y - 95}px) rotate(18deg)`, filter: "blur(20px)", willChange: "transform" }} />
        </div>
      )}

      {/* NAV */}
      <nav className={scrolled ? "scrolled" : ""}>
        <div className="logo"><div className="logo-ring" />DFS</div>
        <div className="nav-c">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#feedback">Feedback</a>
        </div>
        <div className="nav-r">
          {user ? (
            <div className="user-menu-wrap">
              <button className="user-avatar-btn" onClick={() => {
                const d = document.getElementById('user-dropdown');
                if (d) d.style.display = d.style.display === 'flex' ? 'none' : 'flex';
              }}>
                {user.picture ? (
                  <img src={user.picture} alt={getDisplayName(user)} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div className="user-avatar-fallback">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                )}
                <div className="user-status-dot" />
              </button>
              <div id="user-dropdown" className="user-dropdown" style={{ display: 'none' }}>
                <div className="user-dropdown-info">
                  <div className="user-dropdown-name">{getDisplayName(user)}</div>
                  <div className="user-dropdown-email">{user.email}</div>
                </div>
                <div className="user-dropdown-divider" />
                <a href="/dashboard" className="user-dropdown-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  Dashboard
                </a>
                <a href="/auth/logout" className="user-dropdown-item user-dropdown-logout">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Log out
                </a>
              </div>
            </div>
          ) : (
            <>
              <a href="/auth/login" style={{ textDecoration: 'none' }}>
                <button className="nb">Log in</button>
              </a>
              <a href="/auth/login?screen_hint=signup" style={{ textDecoration: 'none' }}>
                <button className="nb-fill">Sign up free</button>
              </a>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section ref={heroRef} className="hero">
        <div className="hero-grid" />
        <div className="hero-left">
          <h1 className="hero-h1">
            Connect Through <br /> <em>Shared</em><br /> Thinking.
          </h1>
          <div className="hero-tw">
            <Typewriter texts={["Find your hackathon team.", "Match by how you think.", "Meet your people.", "Connect with depth."]} />
          </div>
          <div className="hero-btns">
            <a href="/auth/login?screen_hint=signup" style={{ textDecoration: 'none' }}>
              <button className="btn-primary">Upload Gemini data</button>
            </a>
            <button
              className="btn-outline"
              onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}
            >
              See how it works
            </button>
          </div>
        </div>
        <div className="hero-right">
          <div className="charts-stack">
            <div className="chart-bubble">
              <div className="chart-lbl">Your profile</div>
              <SpiderChart values={youT} color="#a78bfa" size={165} />
              <div className="chart-name" style={{ color: "var(--v2)" }}>You</div>
            </div>
            <div className="charts-mid">
              <div className="charts-mid-line" />
              <div className="charts-mid-dot" />
              <div className="charts-mid-line" />
              <span>match</span>
            </div>
            <div className="chart-bubble" style={{ animationDelay: "1s" }}>
              <div className="pct-tag">{mPct}%</div>
              <div className="chart-lbl">Best match</div>
              <SpiderChart values={matchT} color="#f97316" size={165} />
              <div className="chart-name" style={{ color: "var(--o)" }}>{mName}</div>
            </div>
          </div>
          <div className="rand-note">Upload your data to see your results</div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="marquee-strip">
        <div className="marquee-inner">
          {["Find your team", "Match by thinking", "Spider chart matching", "Depth First Social", "Upload Gemini data", "Cosine similarity", "Real connections", "Hackathon teams", "Co-founder matching", "Find your team", "Match by thinking", "Spider chart matching", "Depth First Social", "Upload Gemini data", "Cosine similarity", "Real connections", "Hackathon teams", "Co-founder matching"].map((t, i) => (
            <span key={i} className="marquee-item">{t}<span className="marquee-sep">✦</span></span>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="how" className="how-section">
        <RevealDiv className="section-pre">How it works</RevealDiv>
        <RevealDiv className="section-h">From data to <em>your people.</em></RevealDiv>
        <RevealDiv>
          <p className="section-sub">
            Like depth-first search — we go deep before we go wide.<br />
            Five steps, one algorithm.
          </p>
        </RevealDiv>
        <RevealDiv>
          <HowTree />
        </RevealDiv>
      </section>

      {/* FEATURES */}
      <section id="features" className="features-section">
        <RevealDiv className="section-pre">Features</RevealDiv>
        <RevealDiv className="section-h">Built for people who <em>think in systems.</em></RevealDiv>
        <RevealDiv style={{ marginTop: "3rem" }}>
          <FeaturesVertical youT={youT} matchT={matchT} />
        </RevealDiv>
      </section>

      {/* FEEDBACK */}
      <section id="feedback" className="testi-section">
        <div className="testi-bg-text">connecting.</div>
        <div className="testi-inner">
          <RevealDiv className="section-pre">Feedback</RevealDiv>
          <RevealDiv className="section-h">People are <em>connecting.</em></RevealDiv>
          <RevealDiv style={{ marginTop: "2.5rem" }}>
            <TestiStrip />
            <div className="drag-hint">
              <div className="drag-hint-line" />
              ← drag or let it flow →
              <div className="drag-hint-line" />
            </div>
          </RevealDiv>
        </div>
      </section>

      {/* CTA */}
      <div className="cta-section">
        <RevealDiv>
          <div className="cta-box">
            {/* Contained ambient glow — clipped by overflow:hidden on .cta-box */}
            <div className="cta-glow" />
            {/* All text/buttons sit above the glow via z-index */}
            <div className="cta-content">
              <h2 className="cta-h">Stop scrolling.<br />Start <em>connecting.</em></h2>
              <p className="cta-sub">Upload your Gemini history and find your first match in under 2 minutes.<br />Free, private, built for real people.</p>
              <div className="cta-btns">
                <a href="/auth/login?screen_hint=signup" style={{ textDecoration: 'none' }}>
                  <button className="btn-primary">Get started for free →</button>
                </a>
                <button className="btn-outline">Learn more</button>
              </div>
            </div>
          </div>
        </RevealDiv>
      </div>

      {/* FOOTER */}
      <footer>
        <div className="footer-top">
          <div>
            <div className="footer-logo"><div className="logo-ring" />DFS</div>
            <div className="footer-tagline">Depth First Social — connect with people who think like you, powered by your AI conversation history.</div>
          </div>
          <div>
            <div className="footer-col-title">Product</div>
            <div className="footer-links">
              <a href="#how">How it works</a>
              <a href="#features">Features</a>
              <a href="#feedback">Testimonials</a>
              <a href="#">Changelog</a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Company</div>
            <div className="footer-links">
              <a href="#">About</a>
              <a href="#">Blog</a>
              <a href="#">GitHub</a>
              <a href="#">DeerHacks 2025</a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Legal</div>
            <div className="footer-links">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Cookie Policy</a>
              <a href="#">Security</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-copy">© 2025 Depth First Social. All rights reserved.</div>
          <div className="footer-socials">
            <div className="footer-social-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
            </div>
            <div className="footer-social-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
              </svg>
            </div>
            <div className="footer-social-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
              </svg>
            </div>
          </div>
          <div className="footer-built">Built at DeerHacks 2025</div>
        </div>
      </footer>
    </>
  );
}

// ── How It Works tree ──────────────────────────────────────────────────────────
const HOW_STEPS = [
  { num: "01", label: "Export",     detail: "Download your Gemini history via Google Takeout", icon: "⬆", color: "#7c3aed" },
  { num: "02", label: "Analyze",    detail: "We build a 6-axis interest graph from your data",  icon: "◈", color: "#8b2fe8" },
  { num: "03", label: "Set Intent", detail: "Pick your goal: Friend, Hackathon, or Co-founder", icon: "◎", color: "#9333ea" },
  { num: "04", label: "Match",      detail: "Cosine similarity finds your closest overlap",      icon: "⟡", color: "#a055f5" },
  { num: "05", label: "Connect",    detail: "Private chat opens — no DM requests needed",        icon: "◉", color: "#a78bfa" },
];

function HowTree() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: 700, position: "relative" }}>
        {HOW_STEPS.map((step, i) => (
          <div key={step.num} style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
              <div style={{
                fontSize: "0.6rem", fontWeight: 800, color: step.color,
                letterSpacing: 2, marginBottom: 10,
                opacity: inView ? 1 : 0,
                transition: `opacity 0.4s ${i * 0.12}s`,
              }}>{step.num}</div>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                background: "var(--dark3)",
                border: `2px solid ${step.color}80`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.5rem", position: "relative",
                opacity: inView ? 1 : 0,
                transform: inView ? "scale(1)" : "scale(0.5)",
                transition: `opacity 0.5s ${i * 0.12}s, transform 0.5s ${i * 0.12}s`,
                flexShrink: 0,
                boxShadow: inView ? `0 0 20px ${step.color}35` : "none",
              }}>
                {inView && (
                  <div style={{
                    position: "absolute", inset: -8, borderRadius: "50%",
                    border: `2px solid ${step.color}55`,
                    animation: `pulse-ring 2.5s ease-out ${i * 0.5}s infinite`,
                  }} />
                )}
                {inView && (
                  <div style={{
                    position: "absolute", inset: -16, borderRadius: "50%",
                    border: `1.5px solid ${step.color}30`,
                    animation: `pulse-ring 2.5s ease-out ${i * 0.5 + 0.6}s infinite`,
                  }} />
                )}
                <span style={{ color: step.color, fontFamily: "var(--serif)", fontSize: "1.2rem" }}>{step.icon}</span>
              </div>
              <div style={{
                width: 1, height: 20,
                background: `linear-gradient(to bottom,${step.color}70,transparent)`,
                opacity: inView ? 1 : 0,
                transition: `opacity 0.4s ${i * 0.12 + 0.3}s`,
              }} />
              <div style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12, padding: "0.85rem 0.75rem",
                textAlign: "center", width: "100%",
                opacity: inView ? 1 : 0,
                transform: inView ? "translateY(0)" : "translateY(10px)",
                transition: `opacity 0.5s ${i * 0.12 + 0.2}s, transform 0.5s ${i * 0.12 + 0.2}s`,
              }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "rgba(255,255,255,0.95)", marginBottom: "0.35rem" }}>{step.label}</div>
                <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.55 }}>{step.detail}</div>
              </div>
            </div>
            {i < HOW_STEPS.length - 1 && (
              <div style={{
                display: "flex", alignItems: "center",
                marginTop: 46, width: 40, flexShrink: 0,
                opacity: inView ? 1 : 0,
                transition: `opacity 0.4s ${i * 0.12 + 0.4}s`,
              }}>
                <div style={{ flex: 1, height: 1.5, background: `linear-gradient(90deg, ${HOW_STEPS[i].color}80, ${HOW_STEPS[i+1].color}80)` }} />
                <svg width="8" height="10" viewBox="0 0 8 10" style={{ flexShrink: 0 }}>
                  <path d="M0,0 L8,5 L0,10 Z" fill={HOW_STEPS[i+1].color} />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reveal wrappers ────────────────────────────────────────────────────────────
function RevealDiv({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const { ref, inView } = useInView();
  return <div ref={ref} className={`reveal${inView ? " in" : ""}${className ? " " + className : ""}`} style={style}>{children}</div>;
}
function RevealLDiv({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const { ref, inView } = useInView();
  return <div ref={ref} className={`reveal-l${inView ? " in" : ""}${className ? " " + className : ""}`} style={style}>{children}</div>;
}
function RevealRDiv({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const { ref, inView } = useInView();
  return <div ref={ref} className={`reveal-r${inView ? " in" : ""}${className ? " " + className : ""}`} style={style}>{children}</div>;
}