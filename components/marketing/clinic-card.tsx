import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { StickerButton } from "@/components/marketing/sticker-button";
import {
  ACTIVE_KIDS_BLURB,
  BALL_COLORS,
  SITE,
  SPORTS,
  type BallColor,
} from "@/lib/marketing/content";
import {
  clinicAgeLabel,
  clinicAvailability,
  formatClinicDate,
  formatClinicPrice,
  formatClinicTimeRange,
  type PublicClinic,
} from "@/lib/marketing/clinics-shared";

/**
 * Holiday clinic sticker card — white fill, thick outline, hard
 * shadow, sport chip in the sport's canonical ball colour (unknown
 * sports fall back to court orange). No client hooks, so the same
 * component renders server-side on the homepage and inside the
 * client-side filters on /holiday-clinics.
 *
 * States: `lowSpots` adds an amber "X spots left" badge (yellow
 * fill + black text, 13.1:1); sold out desaturates the card to
 * greys (border/shadow/chips) but keeps all text near-black on
 * white/light-grey — AA holds — and the CTA becomes "Join
 * waitlist" pointing at the same booking URL.
 */
function sportBall(sport: string | null): BallColor {
  const match = SPORTS.find(
    (s) => s.name.toLowerCase() === sport?.toLowerCase()
  );
  return match?.ball ?? BALL_COLORS.orange;
}

const CHIP =
  "inline-flex max-w-max items-center gap-2 rounded-full border-2 px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wider";

export function ClinicCard({ clinic }: { clinic: PublicClinic }) {
  const { spotsLeft, soldOut, lowSpots } = clinicAvailability(clinic);
  const ball = sportBall(clinic.sport);
  const ages = clinicAgeLabel(clinic.age_group_min, clinic.age_group_max);

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-2xl border-2 bg-white p-6 sm:p-7",
        soldOut
          ? "border-[#767676] shadow-[4px_4px_0_#B5B5B5]"
          : "border-[#111] shadow-[4px_4px_0_#111]"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {clinic.sport && (
          <span
            className={cn(CHIP, soldOut ? "border-[#767676]" : "border-[#111]")}
            style={
              soldOut
                ? { backgroundColor: "#E5E5E5", color: "#111111" }
                : { backgroundColor: ball.color, color: ball.fg }
            }
          >
            {clinic.sport}
          </span>
        )}
        {soldOut && (
          <span className={cn(CHIP, "border-[#767676] bg-[#E5E5E5] text-[#111]")}>
            Sold out
          </span>
        )}
        {lowSpots && (
          <span className={cn(CHIP, "border-[#111] bg-[#FFD23F] text-[#111]")}>
            {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
          </span>
        )}
      </div>

      <h3 className="mt-4 font-heading text-xl font-extrabold tracking-tight text-[#111] sm:text-2xl">
        {clinic.title}
      </h3>

      <ul className="mt-4 space-y-2 text-sm font-semibold text-[#1A1A1A]/80">
        <li className="flex items-center gap-2.5">
          <CalendarDays className="size-4 shrink-0 text-[#111]" aria-hidden="true" />
          {formatClinicDate(clinic.date)}
        </li>
        <li className="flex items-center gap-2.5">
          <Clock className="size-4 shrink-0 text-[#111]" aria-hidden="true" />
          {formatClinicTimeRange(clinic.start_time, clinic.end_time)}
        </li>
        <li className="flex items-center gap-2.5">
          <MapPin className="size-4 shrink-0 text-[#111]" aria-hidden="true" />
          {clinic.location_name
            ? `${clinic.location_name}, ${clinic.suburb}`
            : clinic.suburb}
        </li>
        {ages && (
          <li className="flex items-center gap-2.5">
            <Users className="size-4 shrink-0 text-[#111]" aria-hidden="true" />
            {ages}
          </li>
        )}
      </ul>

      {/* Active Kids badge — always shown, per spec. */}
      <p
        className={cn(
          CHIP,
          "mt-4 bg-white text-[#111]",
          soldOut ? "border-[#767676]" : "border-[#111]"
        )}
      >
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-full border-2 border-[#111]"
          style={{ backgroundColor: BALL_COLORS.green.color }}
        />
        {ACTIVE_KIDS_BLURB}
      </p>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-6">
        <p className="font-heading text-3xl font-extrabold tracking-tight text-[#111]">
          {formatClinicPrice(clinic.price_cents)}
        </p>
        <StickerButton
          href={`/parent/book/${clinic.id}`}
          size="sm"
          fill={soldOut ? "white" : "yellow"}
        >
          {soldOut ? "Join waitlist" : "Book now"}
        </StickerButton>
      </div>
    </article>
  );
}

/**
 * Shared "no clinics" panel — rendered when the query returns
 * nothing OR throws (both pages wrap the fetch in try/catch so a DB
 * hiccup never breaks the section). Copy per spec.
 */
export function ClinicsEmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[#111]/40 bg-white px-6 py-14 text-center">
      <p className="font-heading text-xl font-extrabold tracking-tight text-[#111]">
        New clinic dates drop soon
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-relaxed text-[#1A1A1A]/70">
        Call us on {SITE.phone} or check back shortly.
      </p>
    </div>
  );
}
