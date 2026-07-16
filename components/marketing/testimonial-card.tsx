import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicTestimonial } from "@/lib/marketing/testimonials";

/**
 * Parent/school testimonial as a sticker card — white fill, thick
 * black outline, hard shadow, brand-yellow stars. The star row is
 * decorative (aria-hidden) with a screen-reader sentence alongside;
 * quote and attribution are near-black on white (18.9:1).
 */
export function TestimonialCard({
  testimonial,
  className,
}: {
  testimonial: PublicTestimonial;
  className?: string;
}) {
  const rating = Math.min(5, Math.max(0, Math.round(testimonial.rating)));

  return (
    <figure
      className={cn(
        "flex h-full flex-col rounded-2xl border-2 border-[#111] bg-white p-6 shadow-[4px_4px_0_#111] sm:p-7",
        className
      )}
    >
      <div className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className="size-5"
            fill={i < rating ? "#FFD23F" : "#FFFFFF"}
            stroke="#111111"
            strokeWidth={2}
          />
        ))}
      </div>
      <p className="sr-only">Rated {rating} out of 5 stars</p>

      <blockquote className="mt-4 flex-1 text-base font-medium leading-relaxed text-[#1A1A1A]">
        &ldquo;{testimonial.comment}&rdquo;
      </blockquote>

      <figcaption className="mt-5">
        <p className="font-heading text-base font-extrabold tracking-tight text-[#111]">
          {testimonial.display_name}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-[#1A1A1A]/70">
          {testimonial.centre_name}
        </p>
      </figcaption>
    </figure>
  );
}
