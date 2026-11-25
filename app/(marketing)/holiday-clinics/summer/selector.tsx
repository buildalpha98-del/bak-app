"use client";

import { useActionState, useEffect, useState } from "react";
import { SUMMER_CLINICS, formatSummerDate } from "@/lib/bookings/summer-clinics";
import { startSummerCheckout } from "./actions";

export function SummerSelector({ bookingKey }: { bookingKey: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [dates, setDates] = useState<string[]>([]);
  const [child, setChild] = useState("");
  const [email, setEmail] = useState("");
  const [result, submit, pending] = useActionState(startSummerCheckout, {});
  useEffect(() => {
    if (result.url) window.location.assign(result.url);
  }, [result.url]);

  return (
    <form action={submit} className="mx-auto max-w-3xl space-y-6">
      <input type="hidden" name="key" value={bookingKey} />
      <fieldset disabled={!ready || pending || !!result.url} className="space-y-3">
        <legend className="text-lg font-bold">Choose one day for $50 or any three for $120</legend>
        {SUMMER_CLINICS.map((clinic) => (
          <label key={clinic.date} className="flex cursor-pointer gap-4 rounded-xl border p-4">
            <input type="checkbox" className="size-5 self-center" name="dates" value={clinic.date}
              checked={dates.includes(clinic.date)}
              disabled={dates.length === 3 && !dates.includes(clinic.date)}
              onChange={(event) => setDates(event.target.checked ?
                [...dates, clinic.date] : dates.filter((date) => date !== clinic.date))}
            />
            <span>
              <strong>{formatSummerDate(clinic.date)} · {clinic.title} + Sports</strong>
              <span className="block">{clinic.park}, {clinic.suburb}</span>
              <span className="block text-sm">Bring a water bottle{clinic.towel ? " and towel" : ""}.</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p aria-live="polite">{dates.length === 2 ? "Select one more day for the $120 pass." :
        dates.length === 3 ? "Three days selected · $120" : dates.length === 1 ? "One day selected · $50" : "Select your clinic dates."}</p>
      <label className="block">Child’s name
        <input name="child" value={child} onChange={(event) => setChild(event.target.value)} required maxLength={100} className="mt-1 block w-full rounded-lg border p-3" />
      </label>
      <label className="block">Parent email
        <input name="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required maxLength={254} autoComplete="email" className="mt-1 block w-full rounded-lg border p-3" />
      </label>
      <button type="submit" disabled={!ready || pending || !!result.url || ![1, 3].includes(dates.length)}
        className="rounded-xl bg-black px-5 py-3 font-bold text-white disabled:opacity-50">
        {pending || result.url ? "Opening Square…" : "Continue to Square"}
      </button>
      {result.error && <p role="alert">{result.error}</p>}
      {result.url && <p><a className="underline" href={result.url}>Open Square checkout</a></p>}
    </form>
  );
}
