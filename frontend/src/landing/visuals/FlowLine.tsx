import React from "react";

interface FlowLineProps {
  orientation?: "horizontal" | "vertical";
  length?: number | string;
  className?: string;
  color?: string;
  dashed?: boolean;
}

export const FlowLine: React.FC<FlowLineProps> = ({
  orientation = "horizontal",
  length = "100%",
  className = "",
  color = "#22d3ee",
  dashed = true,
}) => {
  if (orientation === "vertical") {
    return (
      <div className={`relative flex flex-col items-center justify-center ${className}`}>
        <svg
          style={{ height: length, width: 20 }}
          viewBox="0 0 20 100"
          preserveAspectRatio="none"
          className="overflow-visible"
        >
          {/* Background trace line */}
          <line
            x1="10"
            y1="0"
            x2="10"
            y2="100"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="1.5"
          />
          {/* Animated flowing dash line */}
          <line
            x1="10"
            y1="0"
            x2="10"
            y2="100"
            stroke={color}
            strokeWidth="2"
            strokeDasharray={dashed ? "6 8" : undefined}
            className="animate-flow-dash"
            opacity="0.85"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg
        style={{ width: length, height: 20 }}
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        {/* Background trace line */}
        <line
          x1="0"
          y1="10"
          x2="100"
          y2="10"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth="1.5"
        />
        {/* Animated flowing dash line */}
        <line
          x1="0"
          y1="10"
          x2="100"
          y2="10"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? "6 8" : undefined}
          className="animate-flow-dash"
          opacity="0.85"
        />
      </svg>
    </div>
  );
};
