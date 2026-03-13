"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  syncCentreToQuickBooks,
  syncAllCentresToQuickBooks,
} from "@/lib/quickbooks/actions";

export function CustomerSyncButton({ centreId }: { centreId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    const { error } = await syncCentreToQuickBooks(centreId);
    if (error) toast.error(error);
    else toast.success("Centre synced to QuickBooks.");
    setLoading(false);
  }

  return (
    <Button onClick={handleSync} variant="outline" size="sm" disabled={loading}>
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
      Sync to QuickBooks
    </Button>
  );
}

export function BulkCustomerSyncButton() {
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    const { data, error } = await syncAllCentresToQuickBooks();
    if (error) {
      toast.error(error);
    } else if (data) {
      if (data.failed.length > 0) {
        toast.warning(`${data.synced} synced, ${data.failed.length} failed.`);
      } else {
        toast.success(`All ${data.synced} centres synced to QuickBooks.`);
      }
    }
    setLoading(false);
  }

  return (
    <Button onClick={handleSync} variant="outline" disabled={loading}>
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
      Sync All Centres to QuickBooks
    </Button>
  );
}
