"use client";

import { useId } from "react";
import Avatar3D from "./Avatar3D";
import { cx } from "./ui";

const DEFAULT_LOOK = {
  female: { skin: "#f1c7a3", hair: "#3b2416", hair_style: "long", outfit: "#7c5cff", accent: "#22d3ee", lips: "#c45a6a" },
  male: { skin: "#d9a27f", hair: "#1f1a24", hair_style: "short", outfit: "#2563eb", accent: "#22d3ee", lips: "#9b4a4a" },
};

function shade(hex, amount) {
  const n = parseInt(hex.replace("#", ""), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const MIN_3D_SIZE = 120;

/**
 * The AI interviewer. Uses the persona's realistic 3D model (with lip-sync) when one is configured
 * and there's room for it, otherwise the illustrated avatar.
 * `state` is idle | speaking | listening | thinking; `utterance` is { id, text, duration } while speaking.
 */
export default function Avatar({ persona, level = 0, state = "idle", size = 260, utterance }) {
  const illustrated = <IllustratedAvatar persona={persona} level={level} state={state} size={size} />;
  if (persona?.model_url && size >= MIN_3D_SIZE) {
    return <Avatar3D persona={persona} state={state} utterance={utterance} size={size} fallback={illustrated} />;
  }
  return illustrated;
}

/** Illustrated SVG interviewer with body motion; `level` (0–1) drives lip-sync and gestures. */
export function IllustratedAvatar({ persona, level = 0, state = "idle", size = 260 }) {
  const uid = useId().replace(/:/g, "");
  const female = (persona?.gender || "female") === "female";
  const look = { ...DEFAULT_LOOK[female ? "female" : "male"], ...(persona?.appearance || {}) };
  const speaking = state === "speaking";
  const mouthOpen = speaking ? 1.5 + level * 9 : 0;
  const gesture = speaking ? level * 14 : 0;
  const ring = {
    speaking: "ring-brand/60 shadow-[0_0_80px_-10px] shadow-brand",
    listening: "ring-ok/60 shadow-[0_0_80px_-10px] shadow-ok",
    thinking: "ring-brand-2/50",
    idle: "ring-line",
  }[state];
  const skinDark = shade(look.skin, -28);
  const hairLight = shade(look.hair, 30);
  const outfitDark = shade(look.outfit, -40);

  return (
    <div className={cx("relative rounded-full ring-4 transition-all duration-500", ring)}
      style={{ width: size, height: size }} data-state={state}>
      <svg viewBox="0 0 200 200" className={cx("h-full w-full rounded-full", `av-${uid}`)}>
        <defs>
          <radialGradient id={`bg-${uid}`} cx="50%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#2b2456" />
            <stop offset="100%" stopColor="#0a0e1b" />
          </radialGradient>
          <linearGradient id={`skin-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={shade(look.skin, 12)} />
            <stop offset="100%" stopColor={look.skin} />
          </linearGradient>
          <linearGradient id={`outfit-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={look.outfit} />
            <stop offset="100%" stopColor={outfitDark} />
          </linearGradient>
          <linearGradient id={`hair-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hairLight} />
            <stop offset="100%" stopColor={look.hair} />
          </linearGradient>
          <clipPath id={`clip-${uid}`}><circle cx="100" cy="100" r="100" /></clipPath>
        </defs>

        <g clipPath={`url(#clip-${uid})`}>
          <rect width="200" height="200" fill={`url(#bg-${uid})`} />
          <circle cx="160" cy="40" r="40" fill={look.accent} opacity="0.08" />

          {/* Long hair behind the shoulders */}
          {look.hair_style === "long" && (
            <g className="av-head">
              <path d="M54 92 Q50 150 66 176 L134 176 Q150 150 146 92 Q146 46 100 44 Q54 46 54 92 Z" fill={`url(#hair-${uid})`} />
            </g>
          )}

          <g className="av-body">
            {/* torso */}
            <path d="M24 212 Q26 158 72 146 L128 146 Q174 158 176 212 Z" fill={`url(#outfit-${uid})`} />
            {female ? (
              <path d="M84 146 Q100 166 116 146" fill={look.skin} />
            ) : (
              <>
                <path d="M86 146 L100 166 L114 146" fill="#e7eaf3" />
                <path d="M97 160 L100 176 L103 160 L100 154 Z" fill={look.accent} />
              </>
            )}
            {/* left arm + hand (gestures while speaking) */}
            <g className="av-arm-l" style={{ transform: `rotate(${-gesture}deg)`, transformOrigin: "52px 168px" }}>
              <path d="M40 200 Q44 172 62 168 L70 176 Q56 186 54 204 Z" fill={outfitDark} />
              <ellipse cx="70" cy="170" rx="8" ry="7" fill={look.skin} />
            </g>
            {/* right arm + hand */}
            <g className="av-arm-r" style={{ transform: `rotate(${gesture * 0.7}deg)`, transformOrigin: "148px 168px" }}>
              <path d="M160 200 Q156 172 138 168 L130 176 Q144 186 146 204 Z" fill={outfitDark} />
              <ellipse cx="130" cy="170" rx="8" ry="7" fill={look.skin} />
            </g>
          </g>

          <g className="av-head">
            {/* neck */}
            <path d="M88 118 L112 118 L114 148 Q100 156 86 148 Z" fill={skinDark} />
            {/* ears + earrings */}
            <ellipse cx="62" cy="96" rx="6" ry="10" fill={look.skin} />
            <ellipse cx="138" cy="96" rx="6" ry="10" fill={look.skin} />
            {female && (
              <>
                <circle cx="62" cy="109" r="2.6" fill={look.accent} />
                <circle cx="138" cy="109" r="2.6" fill={look.accent} />
              </>
            )}
            {/* face */}
            <path d="M62 88 Q62 46 100 46 Q138 46 138 88 Q138 128 100 138 Q62 128 62 88 Z" fill={`url(#skin-${uid})`} />
            {/* hair top */}
            {look.hair_style === "long" ? (
              <path d="M58 92 Q54 42 100 40 Q148 42 142 92 Q136 62 112 56 Q96 70 70 66 Q62 76 58 92 Z" fill={`url(#hair-${uid})`} />
            ) : (
              <path d="M60 86 Q56 40 100 38 Q146 40 140 86 Q138 62 118 58 Q100 64 82 58 Q64 62 60 86 Z" fill={`url(#hair-${uid})`} />
            )}
            {/* cheeks */}
            <ellipse cx="78" cy="110" rx="7" ry="4" fill="#ff8a8a" opacity="0.18" />
            <ellipse cx="122" cy="110" rx="7" ry="4" fill="#ff8a8a" opacity="0.18" />
            {/* brows */}
            <g className="av-brows">
              <path d="M74 80 Q83 75 92 79" stroke={look.hair} strokeWidth={female ? 2.4 : 3.2} fill="none" strokeLinecap="round" />
              <path d="M108 79 Q117 75 126 80" stroke={look.hair} strokeWidth={female ? 2.4 : 3.2} fill="none" strokeLinecap="round" />
            </g>
            {/* eyes */}
            <g className="av-eyes">
              <ellipse cx="83" cy="92" rx="5.2" ry="5.8" fill="#fff" />
              <ellipse cx="117" cy="92" rx="5.2" ry="5.8" fill="#fff" />
              <g className="av-pupils">
                <circle cx="83.5" cy="92.5" r="3.4" fill="#2a1d3d" />
                <circle cx="117.5" cy="92.5" r="3.4" fill="#2a1d3d" />
                <circle cx="84.8" cy="91" r="1.2" fill="#fff" />
                <circle cx="118.8" cy="91" r="1.2" fill="#fff" />
              </g>
              {female && (
                <>
                  <path d="M76 88 Q83 84 90 87" stroke="#1b1530" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                  <path d="M110 87 Q117 84 124 88" stroke="#1b1530" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                </>
              )}
            </g>
            {/* nose */}
            <path d="M100 98 Q96 108 101 110" stroke={skinDark} strokeWidth="2" fill="none" strokeLinecap="round" />
            {/* mouth */}
            {speaking ? (
              <g>
                <ellipse cx="100" cy="121" rx={9 - level * 1.5} ry={mouthOpen / 2 + 1} fill="#6e2433" />
                <ellipse cx="100" cy={121 + mouthOpen / 3} rx={5} ry={Math.max(0.5, mouthOpen / 5)} fill="#e07a8a" opacity="0.8" />
                <path d={`M${91 + level} ${120 - mouthOpen / 2} Q100 ${117 - mouthOpen / 2} ${109 - level} ${120 - mouthOpen / 2}`}
                  stroke={look.lips} strokeWidth="2.5" fill="none" strokeLinecap="round" />
              </g>
            ) : (
              <path d={state === "listening" ? "M89 119 Q100 127 111 119" : "M90 120 Q100 125 110 120"}
                stroke={look.lips} strokeWidth={female ? 3.2 : 2.6} fill="none" strokeLinecap="round" />
            )}
          </g>
        </g>
      </svg>
      <style>{`
        .av-${uid} .av-body { transform-origin: 100px 200px; animation: av-breathe-${uid} 4s ease-in-out infinite; }
        .av-${uid} .av-head { transform-origin: 100px 140px; animation: av-sway-${uid} 7s ease-in-out infinite; }
        .av-${uid} .av-eyes { transform-origin: 100px 92px; animation: av-blink-${uid} 5s infinite; }
        .av-${uid} .av-arm-l, .av-${uid} .av-arm-r { transition: transform 90ms linear; }
        [data-state="speaking"] .av-${uid} .av-head { animation: av-talk-${uid} 1.6s ease-in-out infinite; }
        [data-state="listening"] .av-${uid} .av-head { animation: av-listen-${uid} 3s ease-in-out infinite; }
        [data-state="listening"] .av-${uid} .av-brows { transform: translateY(-2px); }
        [data-state="thinking"] .av-${uid} .av-pupils { transform: translate(2px, -2.5px); transition: transform .4s; }
        [data-state="thinking"] .av-${uid} .av-head { animation: av-think-${uid} 2.4s ease-in-out infinite; }
        @keyframes av-breathe-${uid} { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.012, 1.025); } }
        @keyframes av-sway-${uid} { 0%, 100% { transform: rotate(0deg); } 30% { transform: rotate(1.6deg); } 70% { transform: rotate(-1.4deg); } }
        @keyframes av-talk-${uid} { 0%, 100% { transform: rotate(-1deg) translateY(0); } 25% { transform: rotate(1.5deg) translateY(-1px); } 60% { transform: rotate(-2deg) translateY(1px); } }
        @keyframes av-listen-${uid} { 0%, 100% { transform: rotate(3deg); } 50% { transform: rotate(4deg) translateY(1.5px); } }
        @keyframes av-think-${uid} { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(-4deg) translateY(-1px); } }
        @keyframes av-blink-${uid} { 0%, 93%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.08); } }
      `}</style>
    </div>
  );
}
