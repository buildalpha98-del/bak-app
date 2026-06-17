import { redirect } from "next/navigation";
import {
  getCurrentClientUser,
  getCurrentClientUserCentres,
} from "@/lib/client/actions";
import { ClientLoginForm } from "./client-login-form";

// ============================================================
// /client-login
// ============================================================
//
// The magic-link redirect target. When the visitor is already
// signed in and has portal access, send them straight to their
// default centre — multi-centre directors then pick from the
// switcher in the shell header.

export default async function ClientLoginPage() {
  const { data: clientUser } = await getCurrentClientUser();
  if (clientUser) {
    const { data: centres } = await getCurrentClientUserCentres();
    const defaultCentre = centres?.find((c) => c.is_default) ?? centres?.[0];
    const target = defaultCentre?.id ?? clientUser.centre_id;
    if (target) redirect(`/client/${target}`);
  }
  return <ClientLoginForm />;
}
