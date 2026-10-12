import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = "" }) => {
  return (
    <div
      className={twMerge(
        clsx(
          "animate-pulse rounded-lg bg-white/[0.04] border border-white/[0.03]",
          className
        )
      )}
    />
  );
};
