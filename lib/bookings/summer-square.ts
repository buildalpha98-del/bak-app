import "server-only";

export async function summerSquare<T>(path: string, payload?: object, method = payload ? "POST" : "GET"): Promise<T> {
  const base = process.env.VERCEL_ENV === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
  const response = await fetch(base + "/v2" + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": "2026-11-18",
    },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Square request failed (${response.status})`);
  return response.json() as Promise<T>;
}
