"use client";

import React, { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface ShimmerButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  hoverBackground?: string;
  children: React.ReactNode;
  className?: string;
}

export function ShimmerButton({
  shimmerColor = "#ffffff",
  shimmerSize = "0.05em",
  shimmerDuration = "3s",
  borderRadius = "100px",
  background = "radial-gradient(ellipse 80% 50% at 50% 120%, #0064D2, #003F8A)",
  hoverBackground,
  className,
  children,
  ...props
}: ShimmerButtonProps) {
  return (
    <button
      style={
        {
          "--spread": "90deg",
          "--shimmer-color": shimmerColor,
          "--radius": borderRadius,
          "--speed": shimmerDuration,
          "--cut": shimmerSize,
          "--bg": background,
          "--bg-hover": hoverBackground ?? background,
        } as CSSProperties
      }
      className={cn(
        "group relative z-0 flex cursor-pointer items-center justify-center gap-2 overflow-hidden whitespace-nowrap border border-white/10 px-6 py-3 text-white font-semibold text-sm",
        "transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px",
        "[border-radius:var(--radius)]",
        "before:absolute before:inset-0 before:overflow-hidden before:[border-radius:var(--radius)] before:[container-type:size]",
        "before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)]",
        "before:[mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)]",
        "before:[mask-composite:xor] before:[-webkit-mask-composite:xor]",
        "before:p-[var(--cut)]",
        className,
      )}
      {...props}
    >
      {/* spark */}
      <div
        className={cn(
          "-z-30 blur-[2px]",
          "absolute inset-0 overflow-visible [container-type:size]",
        )}
      >
        {/* desliza pela largura do container (shimmer-slide) */}
        <div className="absolute inset-0 h-[100cqh] animate-shimmer-slide [aspect-ratio:1] [border-radius:0] [mask:none]">
          <div className="animate-spin-around absolute -inset-full w-auto rotate-0 [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))] [translate:0_0]" />
        </div>
      </div>
      {children}
      {/* backdrop — troca cor no hover com transição suave */}
      <div
        className={cn(
          "absolute -z-20 [border-radius:var(--radius)] [inset:var(--cut)]",
          "transition-[background] duration-300 ease-in-out",
          "[background:var(--bg)] group-hover:[background:var(--bg-hover)]",
        )}
      />
    </button>
  );
}
