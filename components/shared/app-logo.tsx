import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Size scale for the crest.
 *
 * Two shapes here, and the split is deliberate:
 *
 * - **Boxed** (`xs`, `rail`) — the mark is a ~1.51:1 horizontal lockup, but the
 *   nav chrome that hosts it is square. These fit the mark inside a square via
 *   `object-contain`, so it letterboxes rather than stretches. `rail` in
 *   particular MUST stay boxed: the sidebar collapses to `w-16` (64px) with
 *   `px-3`, leaving 40px — a natural-width mark at this height would be ~54px
 *   and overflow the collapsed rail.
 * - **Natural** (`sm`, `lg`, `xl`) — height is fixed, width follows the mark's
 *   own ratio. Used where there is room to breathe.
 *
 * `width`/`height` are the rendered CSS pixel box: they set the pre-load
 * placeholder (no CLS) and the srcset width `next/image` requests.
 */
const SIZES = {
  /** Mobile top bar. */
  xs: { width: 32, height: 32, className: "size-8 object-contain" },
  /** Portal shells — parent, client, shared portal view. */
  sm: { width: 48, height: 32, className: "h-8 w-auto" },
  /** Dashboard sidebar rail. Boxed so it survives collapse — see above. */
  rail: { width: 36, height: 36, className: "size-9 object-contain" },
  /** Portal login cards. */
  lg: { width: 121, height: 80, className: "h-20 w-auto" },
  /** AuthShell card — the front door. */
  xl: { width: 170, height: 112, className: "h-28 w-auto" },
} as const;

export type AppLogoSize = keyof typeof SIZES;

interface AppLogoProps {
  size?: AppLogoSize;
  className?: string;
  /**
   * Eager-load and preload. Defaults to true for the sizes that render
   * above the fold as page chrome or as a login card's focal point.
   */
  priority?: boolean;
}

/**
 * The Build Alpha Kids crest — the single source of truth for the mark.
 *
 * Every surface that shows the logo renders it through here. Do not reach for
 * a raw `<img>`: three of them (auth shell, sidebar, top bar) used to bypass
 * this component and ship the unoptimised 438KB master for a 36px slot.
 *
 * **Asset:** `/logo.png` (512x338) is canonical. `/logo-full.png` is the same
 * artwork at 2044x1352 — a master, not a different mark — and no longer has an
 * app-code consumer. 512px wide covers every size above at 2x DPR (the largest,
 * `xl`, requests 340px). The only other `/logo.png` consumer is
 * `lib/launch/email-templates.ts`, which needs an absolute URL that
 * `next/image` cannot give it.
 */
export function AppLogo({ size = "sm", className, priority }: AppLogoProps) {
  const { width, height, className: sizeClass } = SIZES[size];

  return (
    <Image
      src="/logo.png"
      alt="Build Alpha Kids"
      width={width}
      height={height}
      className={cn(sizeClass, className)}
      priority={priority ?? (size === "lg" || size === "xl" || size === "rail")}
    />
  );
}
