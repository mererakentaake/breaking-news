import { useState, useRef, useEffect, useCallback } from "react";

// ── Capacitor back-button (Android) ────────────────────────
let CapApp = null;
try {
  // Only imported when running inside Capacitor
  import("@capacitor/app").then((m) => {
    CapApp = m.App;
  });
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
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [status, setStatus] = useState("loading"); // loading | playing | error
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
        const listener = App.addListener("backButton", () => {
          handleClose();
        });
        cleanup = () => listener.then((h) => h.remove());
      })
      .catch(() => {});
    return () => cleanup?.();
  }, []);

  // Load HLS.js and start stream
  useEffect(() => {
    let hls;

    const initPlayer = (Hls) => {
      const video = videoRef.current;
      if (!video) return;

      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: true, maxBufferLength: 30 });
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
      initPlayer(window.Hls);
    } else {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js";
      script.onload = () => initPlayer(window.Hls);
      script.onerror = () => setStatus("error");
      document.head.appendChild(script);
    }

    const video = videoRef.current;
    const onPlaying = () => setStatus("playing");
    const onError = () => setStatus("error");
    const onWaiting = () => setStatus("loading");
    video?.addEventListener("playing", onPlaying);
    video?.addEventListener("error", onError);
    video?.addEventListener("waiting", onWaiting);

    return () => {
      hls?.destroy();
      video?.removeEventListener("playing", onPlaying);
      video?.removeEventListener("error", onError);
      video?.removeEventListener("waiting", onWaiting);
    };
  }, []);

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
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleVolume = (e) => {
    const v = Number(e.target.value);
    if (videoRef.current) videoRef.current.volume = v;
    setVolume(v);
    setIsMuted(v === 0);
  };

  const retry = () => {
    setStatus("loading");
    hlsRef.current?.startLoad();
    videoRef.current?.play().catch(() => {});
  };

  const handleClose = () => {
    setShowExit(true);
    setShowControls(true);
    clearTimeout(controlsTimer.current);
  };

  const confirmClose = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    // On Capacitor / Electron, exit the app properly
    if (window.__CAPACITOR__) {
      import("@capacitor/app").then(({ App }) => App.exitApp());
    } else if (window.electronAPI?.quit) {
      window.electronAPI.quit();
    } else {
      window.close();
    }
  };

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
          objectFit: "contain",
          background: "#000",
        }}
        playsInline
        autoPlay
        muted={isMuted}
      />

      {/* LOADING OVERLAY */}
      {status === "loading" && (
        <div style={overlayStyle}>
          <Spinner />
          <div
            style={{
              color: "#aaa",
              fontSize: 12,
              letterSpacing: 3,
              marginTop: 20,
            }}
          >
            CONNECTING…
          </div>
        </div>
      )}

      {/* ERROR OVERLAY */}
      {status === "error" && (
        <div style={overlayStyle}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📡</div>
          <div
            style={{
              color: "#fff",
              fontSize: 14,
              letterSpacing: 2,
              marginBottom: 8,
            }}
          >
            STREAM UNAVAILABLE
          </div>
          <div
            style={{
              color: "#555",
              fontSize: 11,
              letterSpacing: 1,
              marginBottom: 24,
            }}
          >
            Check your connection
          </div>
          <button onClick={retry} style={retryBtnStyle}>
            ⟳ RETRY
          </button>
        </div>
      )}

      {/* TOP BAR */}
      <div
        style={{
          ...barBase,
          top: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent)",
          padding: "18px 22px 40px",
          opacity: showControls ? 1 : 0,
          transform: showControls ? "translateY(0)" : "translateY(-100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <LiveDot />
          <div>
            <div
              style={{
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              {CHANNEL_NAME}
            </div>
            <div
              style={{
                color: "#666",
                fontSize: 10,
                letterSpacing: 2,
                marginTop: 2,
              }}
            >
              {CHANNEL_SUB}
            </div>
          </div>
        </div>
        <div style={{ color: "#888", fontSize: 13, letterSpacing: 2 }}>
          {currentTime}
        </div>
      </div>

      {/* BOTTOM CONTROLS */}
      <div
        style={{
          ...barBase,
          bottom: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.95), transparent)",
          padding: "40px 22px 24px",
          opacity: showControls ? 1 : 0,
          transform: showControls ? "translateY(0)" : "translateY(100%)",
        }}
      >
        {/* Volume */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <button onClick={toggleMute} style={iconBtnStyle}>
            <span style={{ fontSize: 18 }}>
              {isMuted || volume === 0
                ? "🔇"
                : volume < 0.4
                ? "🔈"
                : volume < 0.75
                ? "🔉"
                : "🔊"}
            </span>
          </button>
          <div style={{ position: "relative" }}>
            <div
              style={{
                color: "#555",
                fontSize: 10,
                letterSpacing: 2,
                marginBottom: 6,
              }}
            >
              VOL {Math.round((isMuted ? 0 : volume) * 100)}%
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={handleVolume}
              style={{ width: 140, accentColor: "#e8c96e", cursor: "pointer" }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <Btn
            icon={isFullscreen ? "⊡" : "⛶"}
            label={isFullscreen ? "EXIT FULL" : "FULLSCREEN"}
            onClick={toggleFullscreen}
          />
          <Btn icon="⟳" label="RETRY" onClick={retry} color="#4ea8de" />
          <div style={{ flex: 1 }} />
          <Btn icon="✕" label="CLOSE" onClick={handleClose} color="#e63946" danger />
        </div>
      </div>

      {/* EXIT CONFIRM */}
      {showExit && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.8)",
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
            <div
              style={{
                color: "#fff",
                fontSize: 16,
                letterSpacing: 3,
                marginBottom: 6,
              }}
            >
              CLOSE APP?
            </div>
            <div
              style={{
                color: "#444",
                fontSize: 11,
                letterSpacing: 1,
                marginBottom: 32,
              }}
            >
              The stream will stop.
            </div>
            <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
              <button
                onClick={confirmClose}
                style={{
                  ...modalBtn,
                  background: "#e63946",
                  borderColor: "#e63946",
                  color: "#fff",
                }}
              >
                YES, EXIT
              </button>
              <button
                onClick={() => {
                  setShowExit(false);
                  resetTimer();
                }}
                style={{
                  ...modalBtn,
                  background: "transparent",
                  borderColor: "#333",
                  color: "#888",
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.2; } }
      `}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function LiveDot() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#e63946",
          boxShadow: "0 0 8px #e63946",
          animation: "pulse 1.5s infinite",
        }}
      />
      <span
        style={{
          color: "#e63946",
          fontSize: 10,
          letterSpacing: 3,
          fontWeight: 700,
        }}
      >
        LIVE
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        border: "3px solid #1a1a1a",
        borderTop: "3px solid #e8c96e",
        borderRadius: "50%",
        animation: "spin 0.9s linear infinite",
      }}
    />
  );
}

function Btn({ icon, label, onClick, color = "#888", danger = false }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov
          ? danger
            ? "rgba(230,57,70,0.15)"
            : "rgba(255,255,255,0.07)"
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${hov ? color : "#2a2a2a"}`,
        borderRadius: 3,
        color: hov ? color : "#666",
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        transition: "all 0.2s",
        fontSize: 10,
        letterSpacing: 2,
        fontFamily: "'Courier New', monospace",
      }}
    >
      <span style={{ fontSize: 15 }}>{icon}</span>
      {label}
    </button>
  );
}

// ── Styles ─────────────────────────────────────────────────

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

const iconBtnStyle = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "4px 6px",
  display: "flex",
  alignItems: "center",
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
