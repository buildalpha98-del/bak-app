import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The brand's sticker CTA — pill with a thick black outline and a
 * hard shadow that the button "presses into" on hover. One hover
 * treatment everywhere: translate 2px into a 2px shadow.
 *
 * Text is always near-black #111 — AA-verified on every fill
 * (yellow 13.1:1, white 18.9:1, orange 6.1:1). `shadow="orange"`
 * exists for dark bands where a black shadow would vanish.
 */
const FILLS = {
  yellow: "bg-[#FFD23F]",
  white: "bg-white",
  orange: "bg-[#E8712A]",
} as const;

const SIZES = {
  /** Nav-scale. */
  sm: "h-11 px-6 text-sm",
  /** Hero/band-scale. */
  lg: "h-13 px-8 text-base",
} as const;

const SHADOWS = {
  black:
    "shadow-[4px_4px_0_#111] hover:shadow-[2px_2px_0_#111]",
  orange:
    "shadow-[4px_4px_0_#E8712A] hover:shadow-[2px_2px_0_#E8712A]",
} as const;

export function StickerButton({
  fill = "yellow",
  size = "lg",
  shadow = "black",
  className,
  ...props
}: React.ComponentProps<typeof Link> & {
  fill?: keyof typeof FILLS;
  size?: keyof typeof SIZES;
  shadow?: keyof typeof SHADOWS;
}) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#111] font-heading font-bold text-[#111] transition-all hover:translate-x-[2px] hover:translate-y-[2px]",
        FILLS[fill],
        SIZES[size],
        SHADOWS[shadow],
        className
      )}
      {...props}
    />
  );
}
