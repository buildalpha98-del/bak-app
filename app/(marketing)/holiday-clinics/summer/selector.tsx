"use client";

import { useActionState, useEffect, useState } from "react";
import { SUMMER_CLINICS, formatSummerDate } from "@/lib/bookings/summer-clinics";
import { startSummerCheckout } from "./actions";

type Child = { id: number; name: string; dates: string[] };
const fieldStyle = "mt-1 block w-full rounded-lg border p-3";

export function SummerSelector({ bookingKey }: { bookingKey: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [nextId, setNextId] = useState(1);
  const [children, setChildren] = useState<Child[]>([{ id: 0, name: "", dates: [] }]);
  const [contact, setContact] = useState({ parentName: "", email: "", phone: "" });
  const [result, submit, pending] = useActionState(startSummerCheckout, {});
  useEffect(() => {
    if (result.url) window.location.assign(result.url);
  }, [result.url]);

  function updateChild(id: number, changes: Partial<Omit<Child, "id">>) {
    setChildren((current) => current.map((child) => child.id === id ? { ...child, ...changes } : child));
  }

  const canBook = children.every(({ name, dates }) => name.trim() && [1, 3].includes(dates.length));
  const total = children.reduce((sum, { dates }) => sum + (dates.length === 3 ? 120 : dates.length === 1 ? 50 : 0), 0);

  return (
    <form action={submit} className="mx-auto max-w-3xl space-y-6">
      <input type="hidden" name="key" value={bookingKey} />
      <input type="hidden" name="children" value={JSON.stringify(children.map(({ name, dates }) => ({ name, dates })))} />
      <fieldset disabled={!ready || pending || !!result.url} className="space-y-6">
        <legend className="text-lg font-bold">Choose one day for $50 or any three for $120 per child</legend>
        {children.map((child, index) => (
          <fieldset key={child.id} className="space-y-3 rounded-xl border p-4">
            <legend className="px-2 font-bold">Child {index + 1}</legend>
            <label className="block">Child {index + 1} name
              <input value={child.name} onChange={(event) => updateChild(child.id, { name: event.target.value })} required maxLength={100} className={fieldStyle} />
            </label>
            {index > 0 && (
              <button type="button" className="min-h-11 underline" disabled={children[0].dates.length === 0}
                onClick={() => updateChild(child.id, { dates: [...children[0].dates] })}>Use Child 1’s dates</button>
            )}
            {SUMMER_CLINICS.map((clinic) => (
              <label key={clinic.date} className="flex cursor-pointer gap-3 rounded-lg border p-3">
                <input type="checkbox" className="size-5 self-center" checked={child.dates.includes(clinic.date)}
                  disabled={child.dates.length === 3 && !child.dates.includes(clinic.date)}
                  onChange={(event) => updateChild(child.id, { dates: event.target.checked
                    ? [...child.dates, clinic.date] : child.dates.filter((date) => date !== clinic.date) })}
                />
                <span>
                  <strong>{formatSummerDate(clinic.date)} · {clinic.title} + Sports</strong>
                  <span className="block">{clinic.park}, {clinic.suburb}</span>
                  <span className="block text-sm">Bring a water bottle{clinic.towel ? " and towel" : ""}.</span>
                </span>
              </label>
            ))}
            <p aria-live="polite">{child.dates.length === 3 ? "Three days · $120" : child.dates.length === 1
              ? "One day · $50" : child.dates.length === 2 ? "Select one more day for the $120 pass." : "Select clinic dates."}</p>
            {children.length > 1 && <button type="button" className="min-h-11 underline"
              onClick={() => setChildren(children.filter(({ id }) => id !== child.id))}>Remove child {index + 1}</button>}
          </fieldset>
        ))}
        <button type="button" disabled={children.length >= 6} className="rounded-xl border px-5 py-3 font-bold disabled:opacity-50"
          onClick={() => { setChildren([...children, { id: nextId, name: "", dates: [] }]); setNextId(nextId + 1); }}>
          Add another child
        </button>
        <fieldset className="space-y-3">
          <legend className="font-bold">Parent or guardian</legend>
          <label className="block">Parent name
            <input name="parentName" value={contact.parentName} onChange={(event) => setContact({ ...contact, parentName: event.target.value })} required maxLength={100} autoComplete="name" className={fieldStyle} />
          </label>
          <label className="block">Parent email
            <input name="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} type="email" required maxLength={254} autoComplete="email" className={fieldStyle} />
          </label>
          <label className="block">Parent mobile
            <input name="phone" value={contact.phone} onChange={(event) => setContact({ ...contact, phone: event.target.value })} type="tel" placeholder="0400 000 000" required maxLength={20} autoComplete="tel" className={fieldStyle} />
          </label>
          <p className="text-sm">We’ll pass your email and mobile to Square to prefill checkout.</p>
        </fieldset>
      </fieldset>
      {canBook && (
        <section aria-label="Booking summary" className="rounded-xl bg-gray-100 p-4">
          <h2 className="font-bold">Booking summary</h2>
          {children.map((child) => (
            <div key={child.id} className="mt-2">
              <strong>{child.name} · ${child.dates.length === 3 ? 120 : 50}</strong>
              <ul>{SUMMER_CLINICS.filter((clinic) => child.dates.includes(clinic.date)).map((clinic) => (
                <li key={clinic.date}>{formatSummerDate(clinic.date)} · {clinic.park}, {clinic.suburb}</li>
              ))}</ul>
            </div>
          ))}
          <p className="mt-3 font-bold">Total · ${total}</p>
        </section>
      )}
      <button type="submit" disabled={!ready || pending || !!result.url || !canBook}
        className="rounded-xl bg-black px-5 py-3 font-bold text-white disabled:opacity-50">
        {pending || result.url ? "Opening Square…" : "Continue to Square"}
      </button>
      {result.error && <p role="alert">{result.error}</p>}
      {result.url && <p><a className="underline" href={result.url}>Open Square checkout</a></p>}
    </form>
  );
}
