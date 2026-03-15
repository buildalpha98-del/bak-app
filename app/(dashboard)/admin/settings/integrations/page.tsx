import { redirect } from "next/navigation";

// QuickBooks integration removed — invoicing is now fully native.
// Redirect to invoicing settings.
export default function IntegrationsSettingsPage() {
  redirect("/admin/settings/invoicing");
}
