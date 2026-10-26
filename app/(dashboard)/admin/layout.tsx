import { redirect } from "next/navigation";
import { requireAdmin, AuthorisationError } from "@/lib/auth/require-role";

export default async function Layout({ children }: { children: React.ReactNode }) {
  let denied = false;
  try { await requireAdmin(); } catch (error) {
    if (!(error instanceof AuthorisationError)) throw error;
    denied = true;
  }
  if (denied) redirect("/login");
  return children;
}
