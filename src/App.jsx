import { useState, useRef, useEffect, useCallback } from "react";

// ── Capacitor back-button (Android) ────────────────────────
try {
  import("@capacitor/app").then(() => {});
} catch (_) {}

const STREAM_URL =
  "https://amg02703-leadstory-leadstory-samsungnz-vc7nn.amagi.tv/playlist/amg02703-leadstory-leadstory-samsungnz/playlist.m3u8";
const CHANNEL_NAME = "Breaking News";
const CHANNEL_SUB = "by LeadStory · NZ";

export default function TVApp() {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const controlsTimer = useRef(null);

  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [status, setStatus] = useState("loading");
  const [showExit, setShowExit] = useState(false);
  const [currentTime, setCurrentTime] = useState(getTime());

  function getTime() {
    return new Date().toLocaleTimeString("en-NZ", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(getTime()), 15000);
    return () => clearInterval(t);
  }, []);

  // Capacitor Android back-button → show exit dialog
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

  // ── HLS initialiser (first load + retry) ───────────────────
  const initHls = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Tear down any existing instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
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
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) setStatus("error");
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = STREAM_URL;
        video.play().catch(() => {});
      } else {
        setStatus("error");
      }
    };

    if (window.Hls) {
      boot(window.Hls);
      return;
    }

    // HLS.js not loaded yet — inject once, then boot
    const existing = document.getElementById("hlsjs-script");
    if (existing) {
      existing.addEventListener("load", () => boot(window.Hls), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "hlsjs-script";
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js";
    script.onload = () => boot(window.Hls);
    script.onerror = () => setStatus("error");
    document.head.appendChild(script);
  }, []);

  // First load — attach video listeners once
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlaying = () => setStatus("playing");
    const onError = () => setStatus("error");
    const onWaiting = () => setStatus("loading");

    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    video.addEventListener("waiting", onWaiting);

    initHls();

    return () => {
      hlsRef.current?.destroy();
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      video.removeEventListener("waiting", onWaiting);
    };
  }, [initHls]);

  // Auto-hide controls
  const resetTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (!showExit) setShowControls(false);
    }, 4000);
  }, [showExit]);

  useEffect(() => {
    resetTimer();
    return () => clearTimeout(controlsTimer.current);
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) {
        try { screen.orientation.unlock(); } catch (_) {}
        import("@capacitor/status-bar")
          .then(({ StatusBar }) => StatusBar.show())
          .catch(() => {});
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Enter fullscreen → lock landscape, hide all system bars ─
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await containerRef.current?.requestFullscreen({ navigationUI: "hide" });
      } catch (_) {}
      try { await screen.orientation.lock("landscape"); } catch (_) {}
      try {
        const { StatusBar } = await import("@capacitor/status-bar");
        await StatusBar.hide();
      } catch (_) {}
    } else {
      try { screen.orientation.unlock(); } catch (_) {}
      try { await document.exitFullscreen(); } catch (_) {}
      try {
        const { StatusBar } = await import("@capacitor/status-bar");
        await StatusBar.show();
      } catch (_) {}
    }
  };

  // ── Retry: full reinit, no drag ─────────────────────────────
  const retry = useCallback(() => {
    initHls();
  }, [initHls]);

  const handleClose = () => {
    setShowExit(true);
    setShowControls(true);
    clearTimeout(controlsTimer.current);
  };

  // ── YES, EXIT — close the whole app properly ────────────────
  const confirmClose = () => {
    try { document.exitFullscreen(); } catch (_) {}
    // Capacitor (Android / iOS)
    import("@capacitor/app")
      .then(({ App }) => App.exitApp())
      .catch(() => {
        // Electron
        if (window.electronAPI?.quit) {
          window.electronAPI.quit();
        } else {
          window.close();
        }
      });
  };

  const ctrlVisible = showControls && !showExit;

  return (
    <div
      ref={containerRef}
      onMouseMove={resetTimer}
      onTouchStart={resetTimer}
      style={{
        position: "relative",
        width: "100%",
        height: "100svh",
        background: "#000",
        overflow: "hidden",
        fontFamily: "'Courier New', monospace",
        cursor: showControls ? "default" : "none",
      }}
    >
      {/* VIDEO */}
      <video
        ref={videoRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: isFullscreen ? "cover" : "contain",
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

      {/* TOP BAR — portrait only (hidden in fullscreen) */}
      {!isFullscreen && (
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

      {/* ── FLOATING ICON CONTROLS ─────────────────────────────
          Portrait  : icon-only, left / center / right at video bottom
          Fullscreen: same layout across full landscape screen
          Hidden until touch / mouse move (auto-hides after 4 s)
      ──────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: isFullscreen ? 36 : 52,
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
        {/* Fullscreen — bottom left */}
        <FloatIconBtn onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
          {isFullscreen ? (
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

        {/* Retry — bottom center */}
        <FloatIconBtn onClick={retry} title="Retry" color="#4ea8de">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
          </svg>
        </FloatIconBtn>

        {/* Close — bottom right */}
        <FloatIconBtn onClick={handleClose} title="Close" color="#e63946">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </FloatIconBtn>
      </div>

      {/* EXIT CONFIRM MODAL */}
      {showExit && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.82)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#111",
              border: "1px solid #2a2a2a",
              borderRadius: 4,
              padding: "44px 56px",
              textAlign: "center",
            }}
          >
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
      <div
        style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "#e63946", boxShadow: "0 0 8px #e63946",
          animation: "pulse 1.5s infinite",
        }}
      />
      <span style={{ color: "#e63946", fontSize: 10, letterSpacing: 3, fontWeight: 700 }}>
        LIVE
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 36, height: 36,
        border: "3px solid #1a1a1a",
        borderTop: "3px solid #e8c96e",
        borderRadius: "50%",
        animation: "spin 0.9s linear infinite",
      }}
    />
  );
}

/**
 * Floating circular icon button — no text label.
 * Used for portrait-mode controls and fullscreen overlay controls.
 */
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
        width: 50,
        height: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: pressed ? color : "#ccc",
        boxShadow: "0 2px 14px rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

// ── Styles ──────────────────────────────────────────────────

const overlayStyle = {
  position: "absolute",
  inset: 0,
  zIndex: 10,
  background: "#000",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

const barBase = {
  position: "absolute",
  left: 0,
  right: 0,
  zIndex: 20,
  transition: "opacity 0.4s, transform 0.4s",
  pointerEvents: "auto",
};

const retryBtnStyle = {
  background: "transparent",
  border: "1px solid #333",
  color: "#888",
  padding: "10px 24px",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 11,
  letterSpacing: 3,
  fontFamily: "'Courier New', monospace",
};

const modalBtn = {
  padding: "10px 28px",
  border: "1px solid",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 11,
  letterSpacing: 2,
  fontFamily: "'Courier New', monospace",
  transition: "all 0.2s",
};
