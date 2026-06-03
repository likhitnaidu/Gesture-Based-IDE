import { useState, useEffect, useRef, useCallback } from "react";

// ── MediaPipe CDN loader ──────────────────────────────────────────────────────
function loadScript(src) {
    return new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) return res();
        const s = document.createElement("script");
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
    });
}

// ── Gesture classifier (mirrors gesture_ide.py) ───────────────────────────────
function classify(fingers) {
    const [t, i, m, r, p] = fingers;
    if ([t, i, m, r, p].join() === "0,0,0,0,0") return "fist";
    if ([t, i, m, r, p].join() === "1,1,1,1,1") return "open";
    if ([i, m, r, p].join() === "1,0,0,0") return "point";
    if ([i, m, r, p].join() === "1,1,0,0") return "peace";
    if ([t, i, m, r].join() === "1,0,0,0") return "thumb";
    if ([i, m, r, p].join() === "0,0,0,1") return "pinky";
    return null;
}

// ── Finger up detection from MediaPipe landmarks ──────────────────────────────
function fingersUp(lm) {
    const TIP = [4, 8, 12, 16, 20];
    const PIP = [3, 6, 10, 14, 18];
    const MCP = [2, 5, 9, 13, 17];
    const up = [0, 0, 0, 0, 0];
    up[0] = lm[TIP[0]].x < lm[MCP[0]].x ? 1 : 0;
    for (let i = 1; i < 5; i++) {
        up[i] = lm[TIP[i]].y < lm[PIP[i]].y ? 1 : 0;
    }
    return up;
}

// ── IDE_ACTIONS (macOS shortcuts) ─────────────────────────────────────────────
const IDE_ACTIONS = {
    point: { label: "Move Cursor", shortcut: "mouse", color: "#FFB300" },
    peace: { label: "Select Word →", shortcut: "⌘⇧→", color: "#0066FF" },
    open: { label: "Run File", shortcut: "⇧F10", color: "#00CC44" },
    thumb: { label: "Save File", shortcut: "⌘S", color: "#00CC44" },
    fist: { label: "Stop / Cancel", shortcut: "⌘C", color: "#FF2D00" },
    pinky: { label: "Toggle Terminal", shortcut: "⌘`", color: "#0066FF" },
};

const GESTURE_EMOJIS = {
    point: "☝️", peace: "✌️", open: "🖐️",
    thumb: "👍", fist: "✊", pinky: "🤙",
};

// ── Hand skeleton connections ─────────────────────────────────────────────────
const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17],
];

// ── Sample code for IDE pane ──────────────────────────────────────────────────
const CODE_LINES = [
    { n: 1, t: "import", c: "keyword", s: "import " },
    { n: 1, t: "normal", c: "", s: "cv2, numpy " },
    { n: 1, t: "keyword", c: "keyword", s: "as " },
    { n: 1, t: "normal", c: "", s: "np" },
    { n: 2, t: "keyword", c: "keyword", s: "from " },
    { n: 2, t: "normal", c: "", s: "cvzone.HandTrackingModule " },
    { n: 2, t: "keyword", c: "keyword", s: "import " },
    { n: 2, t: "normal", c: "", s: "HandDetector" },
    { n: 3, t: "blank", c: "", s: "" },
    { n: 4, t: "comment", c: "comment", s: "# gesture classifier" },
    { n: 5, t: "keyword", c: "keyword", s: "def " },
    { n: 5, t: "fn", c: "fn", s: "classify" },
    { n: 5, t: "normal", c: "", s: "(fingers):" },
    { n: 6, t: "normal", c: "", s: "    t, i, m, r, p = fingers" },
    { n: 7, t: "keyword", c: "keyword", s: "    if   " },
    { n: 7, t: "normal", c: "", s: "[t,i,m,r,p] == [0,0,0,0,0]: " },
    { n: 7, t: "keyword", c: "keyword", s: "return " },
    { n: 7, t: "str", c: "str", s: '"fist"' },
    { n: 8, t: "keyword", c: "keyword", s: "    elif " },
    { n: 8, t: "normal", c: "", s: "[t,i,m,r,p] == [1,1,1,1,1]: " },
    { n: 8, t: "keyword", c: "keyword", s: "return " },
    { n: 8, t: "str", c: "str", s: '"open"' },
    { n: 9, t: "keyword", c: "keyword", s: "    elif " },
    { n: 9, t: "normal", c: "", s: "[  i,m,r,p] == [1,0,0,0]:   " },
    { n: 9, t: "keyword", c: "keyword", s: "return " },
    { n: 9, t: "str", c: "str", s: '"point"' },
    { n: 10, t: "keyword", c: "keyword", s: "    elif " },
    { n: 10, t: "normal", c: "", s: "[  i,m,r,p] == [1,1,0,0]:   " },
    { n: 10, t: "keyword", c: "keyword", s: "return " },
    { n: 10, t: "str", c: "str", s: '"peace"' },
    { n: 11, t: "keyword", c: "keyword", s: "    elif " },
    { n: 11, t: "normal", c: "", s: "[t,  i,m,r] == [1,0,0,0]:   " },
    { n: 11, t: "keyword", c: "keyword", s: "return " },
    { n: 11, t: "str", c: "str", s: '"thumb"' },
    { n: 12, t: "keyword", c: "keyword", s: "    else:                              " },
    { n: 12, t: "keyword", c: "keyword", s: "return " },
    { n: 12, t: "normal", c: "", s: "None" },
];

function groupByLine(tokens) {
    const lines = {};
    tokens.forEach(tok => {
        if (!lines[tok.n]) lines[tok.n] = [];
        lines[tok.n].push(tok);
    });
    return Object.entries(lines).map(([n, toks]) => ({ n: parseInt(n), toks }));
}

const CODE_ROWS = groupByLine(CODE_LINES);

// ── Terminal output ───────────────────────────────────────────────────────────
const TERMINAL_INIT = [
    { cls: "t-comment", text: "# GestureIDE — gesture bridge active" },
    { cls: "t-ok", text: "✓  cvzone HandDetector ready" },
    { cls: "t-ok", text: "✓  MediaPipe Hands model loaded" },
    { cls: "t-dim", text: "  Camera index 0 · 1280×720" },
    { cls: "t-prompt", text: "▶  waiting for gestures…" },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function GestureIDE() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const handsRef = useRef(null);
    const cameraRef = useRef(null);

    const [tracking, setTracking] = useState(false);
    const [paused, setPaused] = useState(false);
    const [mpReady, setMpReady] = useState(false);
    const [mpError, setMpError] = useState(null);
    const [gesture, setGesture] = useState(null);
    const [fired, setFired] = useState(null);
    const [fingers, setFingers] = useState([0, 0, 0, 0, 0]);
    const [fps, setFps] = useState(0);
    const [confidence, setConfidence] = useState(0);
    const [termLines, setTermLines] = useState(TERMINAL_INIT);
    const [activeLine, setActiveLine] = useState(7);
    const [holdPct, setHoldPct] = useState(0);
    const [termOpen, setTermOpen] = useState(true);

    const holdRef = useRef({ gesture: null, count: 0, lastFired: 0 });
    const HOLD_FRAMES = 14;
    const COOLDOWN_MS = 850;

    const fpsRef = useRef({ frames: 0, last: Date.now() });

    // ── Load MediaPipe ──────────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
                await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js");
                await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
                setMpReady(true);
            } catch (e) {
                setMpError("Failed to load MediaPipe — check network.");
            }
        })();
    }, []);

    const addTerm = useCallback((text, cls = "t-dim") => {
        setTermLines(prev => [...prev.slice(-20), { text, cls }]);
    }, []);

    const onResults = useCallback((results) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const W = canvas.width, H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        fpsRef.current.frames++;
        const now = Date.now();
        if (now - fpsRef.current.last > 1000) {
            setFps(Math.round(fpsRef.current.frames / ((now - fpsRef.current.last) / 1000)));
            fpsRef.current.frames = 0;
            fpsRef.current.last = now;
        }

        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            setGesture(null); setConfidence(0);
            holdRef.current = { gesture: null, count: 0, lastFired: holdRef.current.lastFired };
            setHoldPct(0);
            return;
        }

        const lm = results.multiHandLandmarks[0];
        const score = results.multiHandedness?.[0]?.score ?? 0.9;
        setConfidence(Math.round(score * 100));

        const flipped = lm.map(p => ({ ...p, x: 1 - p.x }));

        CONNECTIONS.forEach(([a, b]) => {
            const pa = flipped[a], pb = flipped[b];
            ctx.beginPath();
            ctx.moveTo(pa.x * W, pa.y * H);
            ctx.lineTo(pb.x * W, pb.y * H);
            ctx.strokeStyle = "rgba(0,102,255,0.45)";
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        flipped.forEach((p, idx) => {
            const isTip = [4, 8, 12, 16, 20].includes(idx);
            ctx.beginPath();
            ctx.arc(p.x * W, p.y * H, isTip ? 6 : 3.5, 0, Math.PI * 2);
            ctx.fillStyle = isTip ? "#00CC44" : "#0066FF";
            ctx.fill();
            if (isTip) {
                ctx.beginPath();
                ctx.arc(p.x * W, p.y * H, 12, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(0,204,68,0.3)";
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        });

        const up = fingersUp(lm);
        setFingers(up);
        const g = classify(up);
        setGesture(g);

        const hld = holdRef.current;
        if (g !== hld.gesture) {
            hld.gesture = g; hld.count = 0;
        } else {
            hld.count++;
            setHoldPct(Math.min(hld.count / HOLD_FRAMES, 1));
            const nowMs = Date.now();
            if (hld.count >= HOLD_FRAMES && !paused && g &&
                nowMs - hld.lastFired > COOLDOWN_MS) {
                hld.lastFired = nowMs;
                hld.count = 0;
                setFired(g);
                const action = IDE_ACTIONS[g];
                addTerm(`▶  [${g}] → ${action.label}  ${action.shortcut}`, "t-cmd");

                if (g === "peace") setActiveLine(l => Math.min(l + 1, CODE_ROWS.length));
                if (g === "point") setActiveLine(l => Math.max(l - 1, 1));
                if (g === "open") addTerm("  Running gesture_ide.py…", "t-ok");
                if (g === "thumb") addTerm("  File saved ✓", "t-ok");
                if (g === "fist") addTerm("  Process cancelled.", "t-err");
                if (g === "pinky") setTermOpen(v => !v);

                setTimeout(() => setFired(null), 800);
            }
        }
    }, [paused, addTerm]);

    const startTracking = useCallback(async () => {
        if (!mpReady || !videoRef.current) return;
        const { Hands } = window;
        const { Camera } = window;

        const hands = new Hands({
            locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
        });
        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.6,
        });
        hands.onResults(onResults);
        handsRef.current = hands;

        const camera = new Camera(videoRef.current, {
            onFrame: async () => {
                if (handsRef.current && videoRef.current)
                    await handsRef.current.send({ image: videoRef.current });
            },
            width: 640, height: 480,
        });
        await camera.start();
        cameraRef.current = camera;
        setTracking(true);
        fpsRef.current = { frames: 0, last: Date.now() };
        addTerm("▶  Tracking started", "t-ok");
    }, [mpReady, onResults, addTerm]);

    const stopTracking = useCallback(() => {
        if (cameraRef.current) { cameraRef.current.stop(); cameraRef.current = null; }
        if (handsRef.current) { handsRef.current.close(); handsRef.current = null; }
        if (videoRef.current?.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        }
        const canvas = canvasRef.current;
        if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        setTracking(false); setGesture(null); setFingers([0, 0, 0, 0, 0]);
        setConfidence(0); setFps(0); setHoldPct(0);
        addTerm("⏹  Tracking stopped", "t-err");
    }, [addTerm]);

    const col = g => g ? (IDE_ACTIONS[g]?.color || "#666") : "#333";

    const S = {
        root: {
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
            background: "#0A0B0D",
            color: "#C8CDD8",
            minHeight: "580px",
            borderRadius: "10px",
            overflow: "hidden",
            display: "grid",
            gridTemplateRows: "auto 1fr auto",
            fontSize: "13px",
            border: "1px solid #1C1F28",
        },
        titlebar: {
            background: "#111318",
            borderBottom: "1px solid #1C1F28",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            height: "38px",
            gap: "12px",
            userSelect: "none",
        },
        trafficLights: { display: "flex", gap: "7px", alignItems: "center" },
        dot: (c) => ({
            width: "12px", height: "12px", borderRadius: "50%", background: c,
            cursor: "pointer", transition: "filter 0.15s",
            boxShadow: `0 0 0 0.5px rgba(0,0,0,0.5)`,
        }),
        tabBar: {
            display: "flex", gap: "1px", marginLeft: "8px", flex: 1,
        },
        tab: (active) => ({
            padding: "0 16px",
            height: "38px",
            display: "flex", alignItems: "center", gap: "6px",
            fontSize: "11px",
            cursor: "pointer",
            background: active ? "#0A0B0D" : "transparent",
            borderTop: active ? `1.5px solid #0066FF` : "1.5px solid transparent",
            color: active ? "#E0E4F0" : "#4A5068",
            transition: "all 0.15s",
        }),
        statusChip: (on) => ({
            marginLeft: "auto",
            display: "flex", alignItems: "center", gap: "6px",
            fontSize: "11px",
            color: on ? "#00CC44" : "#4A5068",
            padding: "3px 10px",
            borderRadius: "12px",
            border: `1px solid ${on ? "#00CC4444" : "#1C1F28"}`,
            background: on ? "#00CC4411" : "transparent",
            transition: "all 0.3s",
        }),
        statusDot: (on) => ({
            width: "6px", height: "6px", borderRadius: "50%",
            background: on ? "#00CC44" : "#333",
            boxShadow: on ? "0 0 6px #00CC44" : "none",
            transition: "all 0.3s",
        }),
        main: {
            display: "grid",
            gridTemplateColumns: "1fr 300px",
            overflow: "hidden",
        },
        left: {
            display: "grid",
            gridTemplateRows: termOpen ? "1fr 140px" : "1fr 32px",
            overflow: "hidden",
            borderRight: "1px solid #1C1F28",
            transition: "grid-template-rows 0.25s ease",
        },
        editorWrap: {
            display: "grid",
            gridTemplateColumns: "1fr 200px",
            overflow: "hidden",
        },
        editor: {
            background: "#0A0B0D",
            overflowY: "auto",
            padding: "12px 0",
        },
        lineRow: (isActive) => ({
            display: "flex",
            alignItems: "center",
            paddingRight: "16px",
            background: isActive ? "#0066FF0F" : "transparent",
            borderLeft: isActive ? "2px solid #0066FF" : "2px solid transparent",
            transition: "all 0.2s",
        }),
        lineNum: {
            minWidth: "44px", textAlign: "right", paddingRight: "16px",
            color: "#2E3348", fontSize: "12px", userSelect: "none",
        },
        tokenColors: {
            keyword: "#FF2D00",
            fn: "#FFB300",
            str: "#00CC44",
            comment: "#3A4060",
            "": "#C8CDD8",
        },
        cameraPanel: {
            background: "#080910",
            borderLeft: "1px solid #1C1F28",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
        },
        camHeader: {
            padding: "8px 10px",
            fontSize: "10px",
            color: "#2E3348",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            borderBottom: "1px solid #111318",
            display: "flex", justifyContent: "space-between", alignItems: "center",
        },
        camFps: {
            color: fps > 20 ? "#00CC44" : fps > 10 ? "#FFB300" : "#FF2D00",
            fontWeight: 700,
        },
        videoWrap: {
            position: "relative", flex: 1,
            background: "#050608",
            display: "flex", alignItems: "center", justifyContent: "center",
        },
        video: {
            width: "100%", height: "100%", objectFit: "cover",
            transform: "scaleX(-1)", opacity: tracking ? 1 : 0,
            transition: "opacity 0.3s",
        },
        overlayCanvas: {
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            pointerEvents: "none",
        },
        cornerBracket: (pos) => {
            const base = {
                position: "absolute", width: "14px", height: "14px",
                borderColor: tracking ? col(gesture) : "#1C1F28",
                borderStyle: "solid", transition: "border-color 0.3s",
            };
            const map = {
                tl: { top: 8, left: 8, borderWidth: "1.5px 0 0 1.5px", borderRadius: "2px 0 0 0" },
                tr: { top: 8, right: 8, borderWidth: "1.5px 1.5px 0 0", borderRadius: "0 2px 0 0" },
                bl: { bottom: 8, left: 8, borderWidth: "0 0 1.5px 1.5px", borderRadius: "0 0 0 2px" },
                br: { bottom: 8, right: 8, borderWidth: "0 1.5px 1.5px 0", borderRadius: "0 0 2px 0" },
            };
            return { ...base, ...map[pos] };
        },
        noCamMsg: {
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: "8px", color: "#2E3348", fontSize: "11px",
            opacity: tracking ? 0 : 1, transition: "opacity 0.3s",
            pointerEvents: "none",
        },
        gestureOverlay: {
            position: "absolute", bottom: 8, left: "50%",
            transform: "translateX(-50%)",
            background: "#0A0B0DCC",
            border: `1px solid ${col(gesture)}44`,
            borderRadius: "6px",
            padding: "3px 10px",
            fontSize: "11px",
            color: col(gesture),
            display: gesture ? "flex" : "none",
            alignItems: "center", gap: "5px",
            backdropFilter: "blur(4px)",
            transition: "color 0.2s, border-color 0.2s",
        },
        terminal: {
            background: "#080910",
            borderTop: "1px solid #1C1F28",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
        },
        termHeader: {
            display: "flex", alignItems: "center", gap: "8px",
            padding: "0 12px",
            height: "32px",
            borderBottom: termOpen ? "1px solid #111318" : "none",
            fontSize: "11px",
            color: "#2E3348",
            cursor: "pointer",
            userSelect: "none",
            flexShrink: 0,
        },
        termBody: {
            flex: 1, overflowY: "auto", padding: "8px 14px",
            display: "flex", flexDirection: "column", gap: "2px",
        },
        termLine: (cls) => {
            const colors = {
                "t-comment": "#2E3348",
                "t-ok": "#00CC44",
                "t-dim": "#3A4060",
                "t-prompt": "#4A5068",
                "t-cmd": "#0066FF",
                "t-err": "#FF2D00",
            };
            return { color: colors[cls] || "#C8CDD8", fontSize: "11px", lineHeight: "1.6" };
        },
        sidebar: {
            background: "#0D0E13",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
        },
        sideSection: {
            padding: "12px 14px",
            borderBottom: "1px solid #1C1F28",
        },
        sideSectionLabel: {
            fontSize: "9px", letterSpacing: "0.12em",
            textTransform: "uppercase", color: "#2E3348",
            marginBottom: "10px",
        },
        gestureGrid: {
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: "6px",
        },
        gcard: (g, active) => ({
            background: active ? `${col(g)}15` : "#111318",
            border: `1px solid ${active ? col(g) : "#1C1F28"}`,
            borderRadius: "7px",
            padding: "8px 10px",
            cursor: "default",
            transition: "all 0.2s",
            display: "flex", flexDirection: "column", gap: "2px",
        }),
        gcardIcon: { fontSize: "16px" },
        gcardName: (g, active) => ({
            fontSize: "10px",
            color: active ? col(g) : "#4A5068",
            fontWeight: active ? 700 : 400,
            transition: "color 0.2s",
        }),
        gcardShortcut: {
            fontSize: "9px", color: "#2E3348",
        },
        fingerGrid: {
            display: "flex", flexDirection: "column", gap: "6px",
        },
        fingerRow: {
            display: "flex", alignItems: "center", gap: "8px",
        },
        fingerName: {
            width: "38px", fontSize: "10px", color: "#3A4060",
        },
        fingerBarBg: {
            flex: 1, height: "4px", background: "#1C1F28",
            borderRadius: "2px", overflow: "hidden",
        },
        fingerBarFill: (val) => ({
            height: "100%", borderRadius: "2px",
            width: `${val * 100}%`,
            background: val > 0.5 ? "#00CC44" : "#1C1F28",
            transition: "width 0.1s, background 0.2s",
        }),
        holdBarBg: {
            height: "3px", background: "#1C1F28",
            borderRadius: "2px", overflow: "hidden",
            marginTop: "10px",
        },
        holdBarFill: {
            height: "100%", borderRadius: "2px",
            width: `${holdPct * 100}%`,
            background: `linear-gradient(to right, #0066FF, #00CC44)`,
            transition: "width 0.08s",
        },
        confWrap: {
            display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
        },
        startBtn: (on) => ({
            margin: "12px 14px",
            padding: "9px 0",
            width: "calc(100% - 28px)",
            background: on ? "#FF2D0015" : "#0066FF",
            border: `1px solid ${on ? "#FF2D0055" : "#0066FF"}`,
            borderRadius: "7px",
            color: on ? "#FF2D00" : "#fff",
            fontFamily: "inherit",
            fontSize: "12px",
            fontWeight: 700,
            cursor: mpReady ? "pointer" : "not-allowed",
            opacity: mpReady ? 1 : 0.5,
            transition: "all 0.2s",
            letterSpacing: "0.04em",
        }),
        pauseBtn: {
            margin: "0 14px 12px",
            padding: "7px 0",
            width: "calc(100% - 28px)",
            background: "transparent",
            border: "1px solid #1C1F28",
            borderRadius: "7px",
            color: paused ? "#FFB300" : "#4A5068",
            fontFamily: "inherit",
            fontSize: "11px",
            cursor: "pointer",
            transition: "all 0.2s",
        },
        firedFlash: {
            position: "fixed", top: "16px", left: "50%",
            transform: "translateX(-50%)",
            background: "#0A0B0DDD",
            border: `1px solid ${col(fired)}`,
            borderRadius: "8px",
            padding: "8px 18px",
            fontSize: "13px", fontWeight: 700,
            color: col(fired),
            backdropFilter: "blur(8px)",
            opacity: fired ? 1 : 0,
            transition: "opacity 0.2s",
            pointerEvents: "none",
            zIndex: 1000,
            display: "flex", alignItems: "center", gap: "8px",
            boxShadow: fired ? `0 0 20px ${col(fired)}33` : "none",
        },
        statusBar: {
            background: "#0066FF",
            padding: "3px 14px",
            display: "flex", alignItems: "center", gap: "16px",
            fontSize: "11px", color: "rgba(255,255,255,0.8)",
        },
        sbItem: { display: "flex", alignItems: "center", gap: "5px" },
    };

    const FINGER_NAMES = ["Thumb", "Index", "Middle", "Ring", "Pinky"];

    return (
        <div style={{ padding: "0", background: "#050608", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1C1F28; border-radius: 2px; }
        @keyframes pulse-ring {
          0% { opacity: 0.8; transform: translateX(-50%) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) scale(1.08); }
        }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        .cursor-blink { animation: blink 1.1s step-end infinite; }
      `}</style>

            <div style={{ width: "100%", maxWidth: "1100px" }}>
                {/* Fired action flash */}
                <div style={S.firedFlash}>
                    {fired && GESTURE_EMOJIS[fired]} {fired && IDE_ACTIONS[fired]?.label}
                    {fired && <span style={{ fontSize: "11px", opacity: 0.7 }}>{IDE_ACTIONS[fired]?.shortcut}</span>}
                </div>

                <div style={S.root}>
                    {/* ── Title bar */}
                    <div style={S.titlebar}>
                        <div style={S.trafficLights}>
                            <div style={S.dot("#FF5F57")} title="Close" />
                            <div style={S.dot("#FEBC2E")} title="Minimise" />
                            <div style={S.dot("#28C840")} title="Maximise" />
                        </div>
                        <div style={S.tabBar}>
                            <div style={S.tab(true)}>
                                <span style={{ color: "#FFB300", fontSize: "10px" }}>🐍</span>
                                gesture_ide.py
                            </div>
                            <div style={S.tab(false)}>README.md</div>
                        </div>
                        <div style={S.statusChip(tracking)}>
                            <div style={S.statusDot(tracking)} />
                            {tracking ? (paused ? "paused" : "tracking") : "idle"}
                        </div>
                    </div>

                    {/* ── Main */}
                    <div style={S.main}>
                        {/* ── Left column: editor + terminal */}
                        <div style={S.left}>
                            <div style={S.editorWrap}>
                                {/* Code editor */}
                                <div style={S.editor}>
                                    {CODE_ROWS.map(({ n, toks }) => (
                                        <div key={n} style={S.lineRow(n === activeLine)}>
                                            <span style={S.lineNum}>{n}</span>
                                            <span>
                                                {toks.map((tok, ti) => (
                                                    <span key={ti} style={{ color: S.tokenColors[tok.c] || "#C8CDD8" }}>
                                                        {tok.s}
                                                    </span>
                                                ))}
                                            </span>
                                            {n === activeLine && (
                                                <span className="cursor-blink" style={{ marginLeft: "1px", color: "#0066FF", fontWeight: 700 }}>█</span>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Camera panel */}
                                <div style={S.cameraPanel}>
                                    <div style={S.camHeader}>
                                        <span>webcam</span>
                                        <span style={S.camFps}>{tracking ? `${fps} fps` : "—"}</span>
                                    </div>
                                    <div style={S.videoWrap}>
                                        <video ref={videoRef} style={S.video} autoPlay playsInline muted />
                                        <canvas ref={canvasRef} style={S.overlayCanvas} width={640} height={480} />
                                        {["tl", "tr", "bl", "br"].map(p => <div key={p} style={S.cornerBracket(p)} />)}
                                        <div style={S.noCamMsg}>
                                            <span style={{ fontSize: "28px" }}>📷</span>
                                            <span>start tracking to enable</span>
                                        </div>
                                        <div style={S.gestureOverlay}>
                                            {gesture && GESTURE_EMOJIS[gesture]} {gesture}
                                        </div>
                                    </div>
                                    <div style={{ padding: "6px 8px 0" }}>
                                        <div style={{ fontSize: "9px", color: "#2E3348", marginBottom: "3px", letterSpacing: "0.1em" }}>HOLD</div>
                                        <div style={S.holdBarBg}><div style={S.holdBarFill} /></div>
                                    </div>
                                    <div style={{ ...S.confWrap, padding: "10px 8px 6px" }}>
                                        <svg width="60" height="60" viewBox="0 0 60 60">
                                            <circle cx="30" cy="30" r="24" fill="none" stroke="#1C1F28" strokeWidth="4" />
                                            <circle cx="30" cy="30" r="24" fill="none"
                                                stroke={confidence > 70 ? "#00CC44" : "#0066FF"}
                                                strokeWidth="4"
                                                strokeDasharray="150.8"
                                                strokeDashoffset={150.8 - (confidence / 100) * 150.8}
                                                strokeLinecap="round"
                                                transform="rotate(-90 30 30)"
                                                style={{ transition: "stroke-dashoffset 0.4s, stroke 0.3s" }}
                                            />
                                            <text x="30" y="35" textAnchor="middle" fontSize="13" fontWeight="700"
                                                fill="#C8CDD8" fontFamily="JetBrains Mono, monospace">
                                                {confidence}%
                                            </text>
                                        </svg>
                                        <div style={{ fontSize: "9px", color: "#2E3348", letterSpacing: "0.1em" }}>CONFIDENCE</div>
                                    </div>
                                </div>
                            </div>

                            {/* Terminal */}
                            <div style={S.terminal}>
                                <div style={S.termHeader} onClick={() => setTermOpen(v => !v)}>
                                    <span style={{ color: "#00CC44", fontWeight: 700 }}>▸</span>
                                    <span>Terminal</span>
                                    <span style={{ marginLeft: "4px", fontSize: "10px" }}>— gesture_ide.py</span>
                                    <span style={{ marginLeft: "auto", fontSize: "10px" }}>{termOpen ? "⌄" : "⌃"}</span>
                                </div>
                                {termOpen && (
                                    <div style={S.termBody}>
                                        {termLines.map((line, i) => (
                                            <div key={i} style={S.termLine(line.cls)}>{line.text}</div>
                                        ))}
                                        <div style={{ color: "#0066FF", fontSize: "11px" }}>
                                            <span style={{ color: "#00CC44" }}>gesture_ide</span>
                                            <span style={{ color: "#2E3348" }}> % </span>
                                            <span className="cursor-blink">▌</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Sidebar */}
                        <div style={S.sidebar}>
                            {/* Gesture cards */}
                            <div style={S.sideSection}>
                                <div style={S.sideSectionLabel}>gestures</div>
                                <div style={S.gestureGrid}>
                                    {Object.entries(IDE_ACTIONS).map(([g, info]) => {
                                        const isActive = gesture === g;
                                        const isFired = fired === g;
                                        return (
                                            <div key={g} style={S.gcard(g, isActive || isFired)}>
                                                <div style={S.gcardIcon}>{GESTURE_EMOJIS[g]}</div>
                                                <div style={S.gcardName(g, isActive || isFired)}>{g}</div>
                                                <div style={S.gcardShortcut}>{info.shortcut}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Finger state */}
                            <div style={S.sideSection}>
                                <div style={S.sideSectionLabel}>finger state</div>
                                <div style={S.fingerGrid}>
                                    {FINGER_NAMES.map((name, i) => (
                                        <div key={name} style={S.fingerRow}>
                                            <div style={S.fingerName}>{name[0].toUpperCase() + name.slice(1, 3)}</div>
                                            <div style={S.fingerBarBg}>
                                                <div style={S.fingerBarFill(fingers[i])} />
                                            </div>
                                            <div style={{
                                                fontSize: "9px", width: "14px", textAlign: "right",
                                                color: fingers[i] > 0.5 ? "#00CC44" : "#2E3348"
                                            }}>
                                                {fingers[i] > 0.5 ? "↑" : "↓"}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Controls reference */}
                            <div style={S.sideSection}>
                                <div style={S.sideSectionLabel}>controls (macOS)</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                    {[
                                        ["⌘S", "Save file"],
                                        ["⌘C", "Stop / Cancel"],
                                        ["⌘⇧→", "Select word"],
                                        ["⇧F10", "Run file"],
                                        ["⌘`", "Terminal"],
                                        ["mouse", "Cursor mode"],
                                    ].map(([key, label]) => (
                                        <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                                            <span style={{ color: "#3A4060" }}>{label}</span>
                                            <kbd style={{
                                                background: "#111318", border: "1px solid #1C1F28",
                                                borderRadius: "4px", padding: "1px 6px",
                                                fontSize: "10px", color: "#FFB300", fontFamily: "inherit",
                                            }}>{key}</kbd>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ flex: 1 }} />

                            {mpError && (
                                <div style={{ margin: "0 14px 8px", fontSize: "10px", color: "#FF2D00", padding: "6px 8px", background: "#FF2D0011", borderRadius: "5px", border: "1px solid #FF2D0033" }}>
                                    {mpError}
                                </div>
                            )}

                            <button
                                style={S.startBtn(tracking)}
                                onClick={tracking ? stopTracking : startTracking}
                                disabled={!mpReady}
                            >
                                {!mpReady ? "⏳ loading mediapipe…"
                                    : tracking ? "⏹  stop tracking"
                                        : "▶  start tracking"}
                            </button>

                            {tracking && (
                                <button style={S.pauseBtn} onClick={() => setPaused(v => !v)}>
                                    {paused ? "▶  resume" : "⏸  pause"} gesture firing
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Status bar */}
                    <div style={S.statusBar}>
                        <div style={S.sbItem}>
                            <span>🐍</span> Python 3.11
                        </div>
                        <div style={S.sbItem}>
                            <span>🖐</span> MediaPipe Hands
                        </div>
                        <div style={S.sbItem}>
                            <span>📦</span> cvzone · pynput · opencv
                        </div>
                        <div style={{ marginLeft: "auto", opacity: 0.7 }}>
                            gesture → keyboard shortcut bridge · macOS
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
