import React from "react";

interface FlowConnectorProps {
  active?: boolean;
  color?: string;
  height?: number;
  direction?: "vertical" | "horizontal";
}

export const FlowConnector: React.FC<FlowConnectorProps> = ({
  active = false,
  color = "#22d3ee",
  height = 32,
  direction = "vertical",
}) => {
  if (direction === "horizontal") {
    return (
      <div className="relative flex items-center justify-center flex-1 h-2 my-auto">
        <div className="h-0.5 w-full bg-white/10" />
        {active && (
          <div
            className="absolute h-1.5 w-8 rounded-full shadow-glow-cyan animate-pulse"
            style={{ backgroundColor: color }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col items-center justify-center mx-auto"
      style={{ height: `${height}px` }}
    >
      <div className="w-0.5 h-full bg-white/10" />
      {active && (
        <div
          className="absolute w-1.5 h-6 rounded-full shadow-glow-cyan animate-bounce"
          style={{ backgroundColor: color }}
        />
      )}
    </div>
  );
};
