import { SITE, phoneHref } from "@/lib/marketing/content";
import { SUMMER_CLINICS, formatSummerDate, summerParticipants, type SummerParticipant } from "@/lib/bookings/summer-clinics";

type Booking = {
  clinic_dates: string[];
  child_name: string;
  booking_children: SummerParticipant[] | null;
  amount_cents: number;
  voucher_credit_cents: number;
};

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

export function summerParentEmail(booking: Booking, clinicDate: string | null) {
  const children = summerParticipants(booking);
  const contact = `<p>Questions? Call <a href="${phoneHref()}">${SITE.phone}</a> or reply to this email.</p>`;
  if (clinicDate) {
    const clinic = SUMMER_CLINICS.find(({ date }) => date === clinicDate);
    if (!clinic) return null;
    const attendees = children.filter((child) => child.dates.includes(clinicDate)).length;
    return {
      subject: `Tomorrow: ${clinic.title} + Sports · Build Alpha Kids`,
      html: `<p>A quick reminder that your Build Alpha Kids summer clinic is tomorrow.</p>
        <p><strong>${clinic.title} + Sports</strong><br>${formatSummerDate(clinic.date)} · 10 am–1 pm<br>${clinic.park}, ${clinic.suburb}<br>${attendees} ${attendees === 1 ? "child" : "children"} booked.</p>
        <p>Bring a water bottle${clinic.towel ? " and towel" : ""}.</p>
        ${contact}`,
    };
  }

  const selections = children.map((child, index) => {
    const dates = SUMMER_CLINICS.filter((clinic) => child.dates.includes(clinic.date))
      .map((clinic) => `<li>${formatSummerDate(clinic.date)} · ${clinic.title} + Sports · ${clinic.park}, ${clinic.suburb}</li>`).join("");
    return `<p><strong>Child ${index + 1}</strong></p><ul>${dates}</ul>`;
  }).join("");
  const voucher = booking.voucher_credit_cents;
  return {
    subject: "Booking confirmed · Build Alpha Kids summer clinics",
    html: `<p>Your Build Alpha Kids summer clinic booking is confirmed. All sessions run 10 am–1 pm.</p>
      ${selections}<p>Total: ${aud.format(booking.amount_cents / 100)}${voucher
        ? `<br>Voucher applied: ${aud.format(voucher / 100)}<br>Paid through Square: ${aud.format((booking.amount_cents - voucher) / 100)}` : ""}</p>
      ${contact}`,
  };
}
