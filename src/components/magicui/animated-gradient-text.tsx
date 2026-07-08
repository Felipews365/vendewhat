import { cn } from "@/lib/utils";
import { ReactNode, CSSProperties } from "react";

interface AnimatedGradientTextProps {
  children: ReactNode;
  className?: string;
  speed?: number;
  colorFrom?: string;
  colorMid?: string;
  colorTo?: string;
}

export function AnimatedGradientText({
  children,
  className,
  speed = 3,
  colorFrom = "#FFD600",
  colorMid = "#ffffff",
  colorTo = "#9DC4FF",
}: AnimatedGradientTextProps) {
  return (
    <span
      style={
        {
          "--bg-size": "300%",
          "--color-one": colorFrom,
          "--color-two": colorMid,
          "--color-three": colorTo,
          animationDuration: `${speed}s`,
        } as CSSProperties
      }
      className={cn(
        "inline animate-gradient bg-gradient-to-r from-[var(--color-one)] via-[var(--color-two)] to-[var(--color-three)] bg-[length:var(--bg-size)_100%] bg-clip-text text-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
}
