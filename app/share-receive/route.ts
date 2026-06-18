// ============================================================
// Web Share Target receiver (POST)
// ============================================================
//
// When BAK is installed as a PWA and the user shares an image from
// the camera roll or another app, the OS POSTs the multipart form
// to this route per the `share_target` entry in manifest.json.
//
// The handler:
//   1. Resolves the current Supabase user (must be signed in)
//   2. Validates each image (mime + size cap)
//   3. Uploads to `share-inbox/<user_id>/<timestamp>-<filename>`
//   4. Redirects to /coach/assessments?share=<encoded paths>
//      so the coach can attach the photo to an observation.
//
// A failing/empty share lands the user back on assessments with
// `?share=empty` so the view can render a "nothing was shared"
// toast if it likes.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const BUCKET = "share-inbox";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not signed in — bounce. The share is lost (OS one-shot), but
    // we can at least drop them on the login page.
    return NextResponse.redirect(
      new URL("/auth/login?from=share", req.url),
      303,
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error("share-receive: invalid multipart body", err);
    return NextResponse.redirect(
      new URL("/coach/assessments?share=invalid", req.url),
      303,
    );
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File);

  const uploadedPaths: string[] = [];
  for (const file of files) {
    if (!file.size) continue;
    if (!ALLOWED_TYPES.has(file.type)) continue;
    if (file.size > MAX_BYTES) continue;

    const ext = file.name.split(".").pop() ?? "jpg";
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 64);
    const path = `${user.id}/${Date.now()}-${safeName || `share.${ext}`}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

    if (!error) uploadedPaths.push(path);
  }

  if (uploadedPaths.length === 0) {
    return NextResponse.redirect(
      new URL("/coach/assessments?share=empty", req.url),
      303,
    );
  }

  const shareId = encodeURIComponent(uploadedPaths.join(";"));
  return NextResponse.redirect(
    new URL(`/coach/assessments?share=${shareId}`, req.url),
    303,
  );
}

// GET — surface a tiny landing page so the route doesn't 405 if a
// user pastes the URL directly. The web share target spec only ever
// hits POST, but defensive code is cheap.
export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/coach/assessments", req.url), 303);
}
