import Image from "next/image";
import { cn } from "@/lib/utils";

interface AppLogoProps {
  size?: "sm" | "lg";
  className?: string;
}

/**
 * Shared logo component used across auth pages, sidebar, and top bar.
 * Uses Next.js Image for automatic optimisation (WebP, lazy-load, sizing).
 */
export function AppLogo({ size = "sm", className }: AppLogoProps) {
  const dims = size === "lg" ? { width: 80, height: 80 } : { width: 32, height: 32 };

  return (
    <Image
      src="/logo.png"
      alt="Build Alpha Kids"
      {...dims}
      className={cn("w-auto", size === "lg" ? "h-20" : "h-8", className)}
      priority={size === "lg"}
    />
  );
}
