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

export type StickerFill = keyof typeof FILLS;
export type StickerSize = keyof typeof SIZES;
export type StickerShadow = keyof typeof SHADOWS;

/**
 * The sticker CTA treatment as bare classes, for the cases that cannot
 * be a <StickerButton> — which is a next/link, so it can never be a
 * <button type="submit">. The enquiry form's submit is the only such
 * case today.
 *
 * This exists so the flagship CTA token set has ONE definition. Reach
 * for <StickerButton> whenever the thing is a link; reach for this only
 * when it genuinely cannot be, and layer the extras (disabled states,
 * etc.) on top with cn().
 *
 * The focus-visible outline lives here rather than on a caller: every
 * sticker CTA needs a keyboard focus indicator, and the black outline
 * at a 4px offset clears the hard shadow on all three fills.
 */
export function stickerClasses({
  fill = "yellow",
  size = "lg",
  shadow = "black",
}: {
  fill?: StickerFill;
  size?: StickerSize;
  shadow?: StickerShadow;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#111] font-heading font-bold text-[#111] transition-all hover:translate-x-[2px] hover:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#111]",
    FILLS[fill],
    SIZES[size],
    SHADOWS[shadow]
  );
}

export function StickerButton({
  fill = "yellow",
  size = "lg",
  shadow = "black",
  className,
  ...props
}: React.ComponentProps<typeof Link> & {
  fill?: StickerFill;
  size?: StickerSize;
  shadow?: StickerShadow;
}) {
  return (
    <Link className={cn(stickerClasses({ fill, size, shadow }), className)} {...props} />
  );
}
