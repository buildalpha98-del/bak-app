import { NextResponse } from "next/server";
import { getCentreDeliveryLog } from "@/lib/centres/delivery-log-actions";
import { deliveryLogCsv } from "@/lib/centres/delivery-log";

// GET /api/centres/[id]/delivery-log?term=<termId> — the centre's
// term as a CSV: one row per session, what was delivered by whom.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const term = new URL(request.url).searchParams.get("term");
  const { data, error } = await getCentreDeliveryLog(id, term);
  if (error || !data) return NextResponse.json({ error: error ?? "Not found." }, { status: error === "Not authenticated." ? 401 : 404 });
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return new NextResponse(deliveryLogCsv(data.log), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug(data.centre_name)}-${slug(data.term.name)}-delivery-log.csv"`,
    },
  });
}
