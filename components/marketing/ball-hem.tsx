import Image from "next/image";
import { BRAND } from "@/lib/marketing/content";

/**
 * The ball hem from the coach uniform: sport balls running along a
 * bottom edge, full width, cropped by that edge. Decorative only, and
 * rendered the way the ball rows are (next/image, unoptimized SVG).
 *
 * The artwork is 16:1, so the height is clamped and the image covers
 * its box anchored centre-bottom: narrower screens lose the sides of
 * the row, never the tops of the balls.
 */
export function BallHem() {
  return (
    <Image
      src={BRAND.ballsHemWide}
      alt=""
      aria-hidden="true"
      width={5440}
      height={340}
      unoptimized
      style={{
        display: "block",
        width: "100%",
        height: "clamp(56px, 10vw, 150px)",
        objectFit: "cover",
        objectPosition: "center bottom",
      }}
    />
  );
}
