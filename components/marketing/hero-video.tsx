"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { BRAND } from "@/lib/marketing/content";

// ============================================================
// Hero showreel — Vimeo, inside the hero's sticker card
// ============================================================
//
// The unlisted showreel (BAK_SH_v2, 68s, 16:9). The `h` param is the
// unlisted-link hash — without it the player 403s. `dnt=1` puts the
// player in do-not-track mode (no Vimeo session tracking): the right
// default for a children's business whose privacy pack is still with
// the lawyer.
//
// Loading strategy: the crest renders server-side as the poster — it
// stays the LCP element exactly as before, so the video costs the
// page nothing on first paint. The iframe mounts client-side and
// fades in over the crest when its player is ready.
//
// prefers-reduced-motion: ambient autoplay is a motion effect, so
// reduced-motion visitors get a controls-on player that plays only
// when they ask it to. The mode is decided after mount (matchMedia is
// client-only); until then everyone sees the crest poster.
const VIDEO_ID = "958086996";
const UNLISTED_HASH = "59cc87085d";

const AMBIENT_SRC = `https://player.vimeo.com/video/${VIDEO_ID}?h=${UNLISTED_HASH}&dnt=1&background=1&autoplay=1&muted=1&loop=1`;
const MANUAL_SRC = `https://player.vimeo.com/video/${VIDEO_ID}?h=${UNLISTED_HASH}&dnt=1&title=0&byline=0&portrait=0`;

type Mode = "poster" | "ambient" | "manual";

export function HeroVideo() {
  const [mode, setMode] = useState<Mode>("poster");
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    setMode(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "manual"
        : "ambient"
    );
  }, []);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[1.4rem]">
      {/* Crest poster — server-rendered, priority: the LCP element.
          sizes reflects the card's real display widths (see the grid
          maths in hero.tsx history); re-check if the grid ratio or
          card padding changes. */}
      <div className="absolute inset-0 flex items-center justify-center bg-[#FFF7F2] p-8 sm:p-10">
        <Image
          src={BRAND.logo}
          alt="Build Alpha Kids club crest — fanned sports balls behind the club banner"
          width={513}
          height={339}
          priority
          sizes="(min-width: 1024px) 420px, (min-width: 640px) 300px, 280px"
          className="h-auto w-full"
        />
      </div>

      {mode !== "poster" && (
        <iframe
          src={mode === "ambient" ? AMBIENT_SRC : MANUAL_SRC}
          title="Build Alpha Kids — our sessions in action"
          allow="autoplay; fullscreen; picture-in-picture"
          onLoad={() => setPlayerReady(true)}
          className={`absolute inset-0 size-full transition-opacity duration-700 ${
            playerReady ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
