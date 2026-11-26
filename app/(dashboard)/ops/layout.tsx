import { redirect } from "next/navigation";
import { requireAdminOrOps, AuthorisationError } from "@/lib/auth/require-role";

export default async function Layout({ children }: { children: React.ReactNode }) {
  let denied = false;
  try { await requireAdminOrOps(); } catch (error) {
    if (!(error instanceof AuthorisationError)) throw error;
    denied = true;
  }
  if (denied) redirect("/login");
  return children;
}
