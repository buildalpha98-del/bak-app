import "server-only";
import { getSquareApiUrl } from "@/lib/payments/square-config";

export async function summerSquare<T>(path: string, payload?: object): Promise<T> {
  const base = new URL(getSquareApiUrl()).origin;
  const response = await fetch(base + "/v2" + path, {
    method: payload ? "POST" : "GET",
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
