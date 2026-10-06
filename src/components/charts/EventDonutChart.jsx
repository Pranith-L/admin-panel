import React, { useState } from 'react';

/**
 * High-Contrast Cyber Sentinel Donut / Pie Chart
 * Features distinctly separated, vibrant colors across diverse hue angles,
 * large legible typography, and zero distracting hover clutter inside the circle.
 */
export default function EventDonutChart({
  title = 'Registrations by Event',
  subtitle = '',
  totalCount = 0,
  totalLabel = 'Total',
  segments = [],
  rightElement = null,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Enlarged dimensions for prominence and readability
  const radius = 84;
  const strokeWidth = 22;
  const center = 120;
  const circumference = 2 * Math.PI * radius;

  // Ultra-distinct cyber palette tuned to the reference image: royal blue, cyan, pink, violet
  const defaultDistinctColors = [
    '#38bdf8', // Electric cyan-blue
    '#2563eb', // Royal blue
    '#8b5cf6', // Violet
    '#ec4899', // Hot pink
    '#f472b6', // Pink glow
    '#60a5fa', // Light blue
    '#2dd4bf', // Aqua teal
    '#c084fc', // Purple accent
  ];

  const activeSegments = Array.isArray(segments) ? segments : [];

  // Compute strokeDasharray and strokeDashoffset for each segment
  const numActiveSlices = activeSegments.filter((s) => (s.percentage || 0) > 0).length;
  const sliceGap = numActiveSlices > 1 ? 4 : 0; // pixel gap on arc circumference

  let accumulatedPercent = 0;
  const renderedSegments = activeSegments.map((seg, idx) => {
    const pct = Math.max(0, Math.min(100, seg.percentage || 0));
    const arcLength = Math.max(0, (pct / 100) * circumference - sliceGap);
    const strokeDasharray = `${arcLength} ${circumference}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * circumference + sliceGap / 2);
    accumulatedPercent += pct;

    const assignedColor = seg.color || defaultDistinctColors[idx % defaultDistinctColors.length];

    return {
      ...seg,
      percentage: pct,
      strokeDasharray,
      strokeDashoffset,
      color: assignedColor,
      index: idx,
    };
  });

  return (
    <div
      className="w-full border border-[#1d2f5c] p-4 sm:p-5"
      style={{
        background:
          'radial-gradient(circle at top, rgba(37,99,235,0.12), transparent 38%), linear-gradient(180deg, rgba(5,10,22,0.95), rgba(9,12,28,0.9))',
        boxShadow: '0 0 18px rgba(37,99,235,0.12)',
        borderRadius: '28px',
      }}
    >
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex-1 min-w-0 text-left">
          <h3 className="text-xl sm:text-2xl font-black font-heading text-white leading-tight tracking-tight text-left">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1.5 text-xs sm:text-sm text-slate-300 font-medium max-w-[440px] leading-snug text-left">
              {subtitle}
            </p>
          )}
        </div>
        {rightElement && <div className="flex justify-start sm:justify-end">{rightElement}</div>}
      </div>

      <div className="flex flex-col items-center gap-8 py-3">
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-[220px] h-[220px] sm:w-[250px] sm:h-[250px] flex items-center justify-center">
            <svg viewBox="0 0 240 240" className="w-full h-full -rotate-90 transform">
              <defs>
                {renderedSegments.map((seg) => (
                  <filter
                    key={`filter-${seg.index}`}
                    id={`donutGlow-${seg.index}`}
                    x="-30%"
                    y="-30%"
                    width="160%"
                    height="160%"
                  >
                    <feDropShadow
                      dx="0"
                      dy="0"
                      stdDeviation="5"
                      floodColor={seg.color}
                      floodOpacity="0.9"
                    />
                  </filter>
                ))}
              </defs>

              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke="rgba(255, 255, 255, 0.06)"
                strokeWidth={strokeWidth}
              />

              {renderedSegments.map((seg) => {
                if (seg.percentage <= 0) return null;
                const isHovered = hoveredIdx === seg.index;
                return (
                  <circle
                    key={seg.index}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-200 cursor-pointer"
                    style={{
                      filter: isHovered
                        ? `url(#donutGlow-${seg.index}) drop-shadow(0 0 18px ${seg.color})`
                        : `drop-shadow(0 0 8px ${seg.color}99)`,
                      opacity: hoveredIdx === null || isHovered ? 1 : 0.55,
                      transformOrigin: 'center',
                    }}
                    onMouseEnter={() => setHoveredIdx(seg.index)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                );
              })}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
              <span
                className="text-5xl sm:text-6xl font-black font-heading tracking-tight leading-none transition-colors"
                style={{
                  color: hoveredIdx !== null ? activeSegments[hoveredIdx]?.color || '#ffffff' : '#ffffff',
                  textShadow: hoveredIdx !== null
                    ? `0 0 24px ${activeSegments[hoveredIdx]?.color || '#38bdf8'}`
                    : '0 0 18px rgba(130, 170, 255, 0.6)',
                }}
              >
                {hoveredIdx !== null
                  ? activeSegments[hoveredIdx]?.count
                  : Number(totalCount || 0).toLocaleString()}
              </span>
              <span className="text-[10px] sm:text-[11px] font-black text-slate-200 uppercase tracking-[0.26em] mt-2 truncate max-w-[170px]">
                {hoveredIdx !== null ? activeSegments[hoveredIdx]?.label : totalLabel}
              </span>
            </div>
          </div>

          <div className="mt-3 text-center w-full max-w-[220px]">
            <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.28em] text-slate-300">
              Event Breakdown
            </div>
            <div className="mt-2 text-base sm:text-lg font-black text-white truncate px-2">
              {hoveredIdx !== null ? activeSegments[hoveredIdx]?.label : activeSegments[0]?.label || 'No event'}
            </div>
          </div>
        </div>

        <div className="w-full max-w-[560px] space-y-2.5">
          {activeSegments.length === 0 ? (
            <div className="py-6 px-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-base text-slate-300 text-center font-medium">
              No matching registrations recorded yet.
            </div>
          ) : (
            activeSegments.map((seg, idx) => {
              const isHovered = hoveredIdx === idx;
              const color = seg.color || defaultDistinctColors[idx % defaultDistinctColors.length];

              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`flex items-center justify-between gap-4 py-3 px-4 rounded-2xl transition-all duration-200 cursor-pointer ${
                    isHovered
                      ? 'bg-white/[0.08] border border-white/[0.12] shadow-[0_0_18px_rgba(34,211,238,0.12)]'
                      : 'bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.06]'
                  }`}
                  style={{
                    borderColor: isHovered ? color : 'rgba(255, 255, 255, 0.12)',
                    boxShadow: isHovered ? `0 0 22px ${color}20` : 'none',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{
                        backgroundColor: color,
                        boxShadow: `0 0 12px ${color}`,
                      }}
                    />
                    <span
                      className={`text-sm sm:text-base font-black truncate transition-colors ${
                        isHovered ? 'text-white' : 'text-slate-100'
                      }`}
                      title={seg.label}
                    >
                      {seg.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-base sm:text-lg text-white font-black">
                      {seg.count}
                    </span>
                    <span
                      className="font-mono text-[10px] sm:text-[11px] font-black px-2.5 py-1 rounded-lg min-w-[52px] text-center"
                      style={{
                        background: `${color}22`,
                        border: `1px solid ${color}80`,
                        color,
                        boxShadow: `0 0 12px ${color}20`,
                      }}
                    >
                      {Math.round(seg.percentage || 0)}%
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
