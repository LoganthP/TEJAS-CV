import React from "react";
import { motion } from "framer-motion";

interface RiskGaugeProps {
  score: number | null | undefined;
  confidence?: number | null | undefined;
  reviewThreshold?: number;
  quarantineThreshold?: number;
  size?: number;
  className?: string;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score,
  confidence,
  reviewThreshold = 35,
  quarantineThreshold = 70,
  size = 180,
  className = "",
}) => {
  const numScore = score === null || score === undefined ? 0 : Math.min(100, Math.max(0, score));
  const hasValue = score !== null && score !== undefined;

  // Semicircle parameters
  const strokeWidth = 14;
  const radius = (size - strokeWidth * 2) / 2;
  const center = size / 2;
  const circumference = Math.PI * radius; // half circle length

  // Color mapping based on thresholds
  let color = "#34d399"; // accept
  let statusText = "SAFE";
  if (numScore >= quarantineThreshold) {
    color = "#f43f5e"; // quarantine
    statusText = "HIGH RISK";
  } else if (numScore >= reviewThreshold) {
    color = "#fbbf24"; // review
    statusText = "ELEVATED";
  }

  // Calculate arc stroke offsets
  // Total arc angle is 180 degrees (from 180deg to 0deg)
  const offset = circumference - (numScore / 100) * circumference;

  return (
    <div className={`flex flex-col items-center justify-center relative ${className}`}>
      <svg
        width={size}
        height={size / 2 + 30}
        viewBox={`0 0 ${size} ${size / 2 + 30}`}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id="gaugeBg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.2" />
            <stop offset="35%" stopColor="#fbbf24" stopOpacity="0.2" />
            <stop offset="70%" stopColor="#f43f5e" stopOpacity="0.2" />
          </linearGradient>
          <filter id="gaugeGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background Arc */}
        <path
          d={`M ${strokeWidth} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth} ${center}`}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Bands: Safe (0-35), Review (35-70), Quarantine (70-100) */}
        {/* Threshold ticks */}
        {(() => {
          // Angle for 35% (180deg - 35% * 180)
          const rad35 = (Math.PI * (180 - (reviewThreshold / 100) * 180)) / 180;
          const x35_in = center + (radius - strokeWidth / 2 - 2) * Math.cos(rad35);
          const y35_in = center - (radius - strokeWidth / 2 - 2) * Math.sin(rad35);
          const x35_out = center + (radius + strokeWidth / 2 + 2) * Math.cos(rad35);
          const y35_out = center - (radius + strokeWidth / 2 + 2) * Math.sin(rad35);

          // Angle for 70%
          const rad70 = (Math.PI * (180 - (quarantineThreshold / 100) * 180)) / 180;
          const x70_in = center + (radius - strokeWidth / 2 - 2) * Math.cos(rad70);
          const y70_in = center - (radius - strokeWidth / 2 - 2) * Math.sin(rad70);
          const x70_out = center + (radius + strokeWidth / 2 + 2) * Math.cos(rad70);
          const y70_out = center - (radius + strokeWidth / 2 + 2) * Math.sin(rad70);

          return (
            <g opacity="0.6">
              <line x1={x35_in} y1={y35_in} x2={x35_out} y2={y35_out} stroke="#fbbf24" strokeWidth="2" />
              <line x1={x70_in} y1={y70_in} x2={x70_out} y2={y70_out} stroke="#f43f5e" strokeWidth="2" />
            </g>
          );
        })()}

        {/* Foreground Colored Arc */}
        {hasValue && (
          <motion.path
            d={`M ${strokeWidth} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth} ${center}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            filter="url(#gaugeGlow)"
          />
        )}
      </svg>

      {/* Center readout */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-2 flex flex-col items-center">
        <span className="font-mono text-3xl font-bold tracking-tight" style={{ color: hasValue ? color : "#64748b" }}>
          {hasValue ? numScore.toFixed(1) : "—"}
        </span>
        <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase -mt-0.5">
          RISK SCORE
        </span>
        {hasValue && (
          <span
            className="text-[9px] font-semibold tracking-wider px-1.5 py-0.2 rounded mt-0.5"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {statusText}
          </span>
        )}
      </div>

      {/* Confidence footer */}
      {confidence !== undefined && confidence !== null && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 font-mono">
          <span className="text-slate-500">CONFIDENCE:</span>
          <span className="text-cyan-400 font-semibold">{(confidence * 100).toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
};
