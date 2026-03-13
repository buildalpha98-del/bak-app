"use client";

import { Star } from "lucide-react";

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  max?: number;
}

export function StarRating({ value, onChange, max = 5 }: StarRatingProps) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => {
        const starValue = i + 1;
        const filled = starValue <= value;

        return (
          <button
            key={starValue}
            type="button"
            onClick={() => onChange(starValue)}
            className="rounded-md p-0.5 transition-transform active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`${starValue} star${starValue !== 1 ? "s" : ""}`}
          >
            <Star
              className={`size-10 ${
                filled
                  ? "fill-amber-400 text-amber-400"
                  : "fill-transparent text-muted-foreground/30"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
