import { useState, useRef, useEffect, useCallback } from "react";

try { import("@capacitor/app").then(() => {}); } catch (_) {}

const STREAM_URL =
  "https://amg02703-leadstory-leadstory-samsungnz-vc7nn.amagi.tv/playlist/amg02703-leadstory-leadstory-samsungnz/playlist.m3u8";
const CHANNEL_NAME = "Breaking News";
const CHANNEL_SUB  = "by LeadStory · NZ";

export default function TVApp() {
  const videoRef      = useRef(null);
  const containerRef  = useRef(null);
  const hlsRef        = useRef(null);
  const controlsTimer = useRef(null);
  const unmutedRef    = useRef(false); // unmute once after first autoplay

  const [showControls, setShowControls] = useState(true);
  const [isLandscape,  setIsLandscape]  = useState(false);
  const [status,       setStatus]       = useState("loading");
  const [showExit,     setShowExit]     = useState(false);
  const [currentTime,  setCurrentTime]  = useState(getTime());

  function getTime() {
    return new Date().toLocaleTimeString("en-NZ", {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  }

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(getTime()), 15000);
    return () => clearInterval(t);
  }, []);

  // Capacitor Android back-button
  useEffect(() => {
    let cleanup = null;
    import("@capacitor/app")
      .then(({ App }) => {
        const listener = App.addListener("backButton", () => handleClose());
        cleanup = () => listener.then((h) => h.remove());
      })
      .catch(() => {});
    return () => cleanup?.();
  }, []);

  // ── HLS init (first load + retry) ───────────────────────────
  const initHls = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    video.removeAttribute("src");
    video.load();
    setStatus("loading");

    const boot = (Hls) => {
      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: true,
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 5,
          manifestLoadingTimeOut: 8000,
          manifestLoadingMaxRetry: 3,
        });
        hlsRef.current = hls;
        hls.loadSource(STREAM_URL);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          // Start muted so autoplay is never blocked, then unmute immediately
          video.muted = true;
          video.play()
            .then(() => {
              // Unmute as soon as playback starts — device volume takes over
              video.muted = false;
              unmutedRef.current = true;
            })
            .catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setStatus("error"); });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = STREAM_URL;
        video.muted = true;
        video.play()
          .then(() => { video.muted = false; unmutedRef.current = true; })
          .catch(() => {});
      } else {
        setStatus("error");
      }
    };

    if (window.Hls) { boot(window.Hls); return; }

    const existing = document.getElementById("hlsjs-script");
    if (existing) {
      existing.addEventListener("load", () => boot(window.Hls), { once: true });
      return;
    }
    const script   = document.createElement("script");
    script.id      = "hlsjs-script";
    script.src     = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js";
    script.onload  = () => boot(window.Hls);
    script.onerror = () => setStatus("error");
    document.head.appendChild(script);
  }, []);

  // Attach video event listeners once
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlaying = () => {
      setStatus("playing");
      // Safety net: unmute if the .then() path above didn't fire
      if (!unmutedRef.current) {
        video.muted = false;
        unmutedRef.current = true;
      }
    };
    const onError   = () => setStatus("error");
    const onWaiting = () => setStatus("loading");

    video.addEventListener("playing", onPlaying);
    video.addEventListener("error",   onError);
    video.addEventListener("waiting", onWaiting);

    initHls();

    return () => {
      hlsRef.current?.destroy();
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error",   onError);
      video.removeEventListener("waiting", onWaiting);
    };
  }, [initHls]);

  // Auto-hide controls (4 s)
  const resetTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(
      () => { if (!showExit) setShowControls(false); },
      4000
    );
  }, [showExit]);

  useEffect(() => {
    resetTimer();
    return () => clearTimeout(controlsTimer.current);
  }, []);

  // If the OS exits fullscreen independently (e.g. back gesture), mirror it
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) {
        setIsLandscape(false);
        import("@capacitor/status-bar")
          .then(({ StatusBar }) => StatusBar.show())
          .catch(() => {});
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── LANDSCAPE TOGGLE ────────────────────────────────────────
  //
  //  The entire container is CSS-rotated 90 ° clockwise so the video
  //  always goes landscape, regardless of whether the OS honours
  //  screen.orientation.lock().
  //
  //  On top of that we call requestFullscreen (hides browser chrome)
  //  and StatusBar.hide() (hides Android status bar) for a fully
  //  immersive experience.  On most Android WebViews requestFullscreen
  //  also triggers immersive mode which hides the nav bar.
  //
  const toggleLandscape = async () => {
    if (!isLandscape) {
      setIsLandscape(true);
      try {
        await containerRef.current?.requestFullscreen({ navigationUI: "hide" });
      } catch (_) {}
      try {
        const { StatusBar } = await import("@capacitor/status-bar");
        await StatusBar.hide();
      } catch (_) {}
    } else {
      setIsLandscape(false);
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (_) {}
      try {
        const { StatusBar } = await import("@capacitor/status-bar");
        await StatusBar.show();
      } catch (_) {}
    }
  };

  const retry = useCallback(() => {
    unmutedRef.current = false;
    initHls();
  }, [initHls]);

  const handleClose = () => {
    setShowExit(true);
    setShowControls(true);
    clearTimeout(controlsTimer.current);
  };

  const confirmClose = () => {
    try { document.exitFullscreen(); } catch (_) {}
    import("@capacitor/app")
      .then(({ App }) => App.exitApp())
      .catch(() => {
        if (window.electronAPI?.quit) window.electronAPI.quit();
        else window.close();
      });
  };

  const ctrlVisible = showControls && !showExit;

  // ── CSS landscape transform ──────────────────────────────────
  //
  //  Portrait viewport: W × H  (e.g. 390 × 844)
  //  We want the container to visually fill the screen in landscape.
  //
  //    width  = 100vh  (844) → becomes the landscape width
  //    height = 100vw  (390) → becomes the landscape height
  //    transform-origin: top left
  //    transform: translateX(100vw) rotate(90deg)
  //
  //  After rotate(90deg) around top-left the box drifts off to the
  //  left; translateX(100vw) brings it flush to the screen's right
  //  edge, perfectly covering the portrait viewport.
  //
  const lsStyle = isLandscape
    ? {
        position: "fixed",
        top: 0, left: 0,
        width: "100vh",
        height: "100vw",
        transformOrigin: "top left",
        transform: "translateX(100vw) rotate(90deg)",
        zIndex: 9999,
      }
    : {
        position: "relative",
        width: "100%",
        height: "100svh",
      };

  return (
    <div
      ref={containerRef}
      onMouseMove={resetTimer}
      onTouchStart={resetTimer}
      style={{
        ...lsStyle,
        background: "#000",
        overflow: "hidden",
        fontFamily: "'Courier New', monospace",
        cursor: showControls ? "default" : "none",
      }}
    >
      {/* VIDEO — starts muted for autoplay, unmuted programmatically once playing */}
      <video
        ref={videoRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: isLandscape ? "cover" : "contain",
          background: "#000",
        }}
        playsInline
        autoPlay
        muted
      />

      {/* LOADING OVERLAY */}
      {status === "loading" && (
        <div style={overlayStyle}>
          <Spinner />
          <div style={{ color: "#aaa", fontSize: 12, letterSpacing: 3, marginTop: 20 }}>
            CONNECTING…
          </div>
        </div>
      )}

      {/* ERROR OVERLAY */}
      {status === "error" && (
        <div style={overlayStyle}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📡</div>
          <div style={{ color: "#fff", fontSize: 14, letterSpacing: 2, marginBottom: 8 }}>
            STREAM UNAVAILABLE
          </div>
          <div style={{ color: "#555", fontSize: 11, letterSpacing: 1, marginBottom: 24 }}>
            Check your connection
          </div>
          <button onClick={retry} style={retryBtnStyle}>⟳ RETRY</button>
        </div>
      )}

      {/* TOP BAR — portrait only */}
      {!isLandscape && (
        <div
          style={{
            ...barBase,
            top: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent)",
            padding: "18px 22px 40px",
            opacity: ctrlVisible ? 1 : 0,
            transform: ctrlVisible ? "translateY(0)" : "translateY(-100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <LiveDot />
            <div>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>
                {CHANNEL_NAME}
              </div>
              <div style={{ color: "#666", fontSize: 10, letterSpacing: 2, marginTop: 2 }}>
                {CHANNEL_SUB}
              </div>
            </div>
          </div>
          <div style={{ color: "#888", fontSize: 13, letterSpacing: 2 }}>{currentTime}</div>
        </div>
      )}

      {/* FLOATING ICON CONTROLS — portrait + landscape */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: isLandscape ? 36 : 52,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          opacity: ctrlVisible ? 1 : 0,
          transition: "opacity 0.35s ease",
          pointerEvents: ctrlVisible ? "auto" : "none",
        }}
      >
        {/* Fullscreen / exit — left */}
        <FloatIconBtn onClick={toggleLandscape} title={isLandscape ? "Exit Fullscreen" : "Fullscreen"}>
          {isLandscape ? (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
              <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V3h4"/><path d="M17 3h4v4"/>
              <path d="M21 17v4h-4"/><path d="M7 21H3v-4"/>
            </svg>
          )}
        </FloatIconBtn>

        {/* Retry — center */}
        <FloatIconBtn onClick={retry} title="Retry" color="#4ea8de">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
          </svg>
        </FloatIconBtn>

        {/* Close — right */}
        <FloatIconBtn onClick={handleClose} title="Close" color="#e63946">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </FloatIconBtn>
      </div>

      {/* EXIT CONFIRM MODAL */}
      {showExit && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#111", border: "1px solid #2a2a2a",
            borderRadius: 4, padding: "44px 56px", textAlign: "center",
          }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>📺</div>
            <div style={{ color: "#fff", fontSize: 16, letterSpacing: 3, marginBottom: 6 }}>
              CLOSE APP?
            </div>
            <div style={{ color: "#444", fontSize: 11, letterSpacing: 1, marginBottom: 32 }}>
              The stream will stop.
            </div>
            <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
              <button
                onClick={confirmClose}
                style={{ ...modalBtn, background: "#e63946", borderColor: "#e63946", color: "#fff" }}
              >
                YES, EXIT
              </button>
              <button
                onClick={() => { setShowExit(false); resetTimer(); }}
                style={{ ...modalBtn, background: "transparent", borderColor: "#333", color: "#888" }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.2; } }
      `}</style>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function LiveDot() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: "#e63946", boxShadow: "0 0 8px #e63946",
        animation: "pulse 1.5s infinite",
      }} />
      <span style={{ color: "#e63946", fontSize: 10, letterSpacing: 3, fontWeight: 700 }}>LIVE</span>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 36, height: 36,
      border: "3px solid #1a1a1a", borderTop: "3px solid #e8c96e",
      borderRadius: "50%", animation: "spin 0.9s linear infinite",
    }} />
  );
}

function FloatIconBtn({ onClick, title, color = "#ccc", children }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        background: pressed ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.55)",
        border: `1.5px solid ${pressed ? color : "rgba(255,255,255,0.18)"}`,
        borderRadius: "50%",
        width: 50, height: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        color: pressed ? color : "#ccc",
        boxShadow: "0 2px 14px rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
        WebkitTapHighlightColor: "transparent",
        outline: "none", padding: 0,
      }}
    >
      {children}
    </button>
  );
}

// ── Styles ──────────────────────────────────────────────────

const overlayStyle = {
  position: "absolute", inset: 0, zIndex: 10, background: "#000",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
};
const barBase = {
  position: "absolute", left: 0, right: 0, zIndex: 20,
  transition: "opacity 0.4s, transform 0.4s", pointerEvents: "auto",
};
const retryBtnStyle = {
  background: "transparent", border: "1px solid #333", color: "#888",
  padding: "10px 24px", borderRadius: 3, cursor: "pointer",
  fontSize: 11, letterSpacing: 3, fontFamily: "'Courier New', monospace",
};
const modalBtn = {
  padding: "10px 28px", border: "1px solid", borderRadius: 3,
  cursor: "pointer", fontSize: 11, letterSpacing: 2,
  fontFamily: "'Courier New', monospace", transition: "all 0.2s",
};
