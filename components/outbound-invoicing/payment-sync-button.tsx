"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { syncPaymentStatuses } from "@/lib/quickbooks/actions";

export function PaymentSyncButton() {
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    const { data, error } = await syncPaymentStatuses();
    if (error) {
      toast.error(error);
    } else if (data) {
      toast.success(`Checked ${data.checked} invoices. ${data.paid} marked as paid.`);
    }
    setLoading(false);
  }

  return (
    <Button onClick={handleSync} variant="outline" disabled={loading}>
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
      Sync Payment Status
    </Button>
  );
}
