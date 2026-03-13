"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Unlink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getConnectUrl,
  disconnectQuickBooks,
} from "@/lib/quickbooks/actions";

interface Props {
  connected: boolean;
  companyName: string | null;
  connectedAt: string | null;
}

export function QBConnectionStatus({
  connected,
  companyName,
  connectedAt,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    const { data: url, error } = await getConnectUrl();
    if (error || !url) {
      toast.error(error ?? "Failed to get connect URL.");
      setLoading(false);
      return;
    }
    window.location.href = url;
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect from QuickBooks? This will clear all centre sync data.")) return;
    setLoading(true);
    const { error } = await disconnectQuickBooks();
    if (error) {
      toast.error(error);
    } else {
      toast.success("QuickBooks disconnected.");
    }
    setLoading(false);
  }

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#1A1A1A]">
            QuickBooks Online
          </h3>
          <p className="text-sm text-[#666666]">
            Connect your QuickBooks account to push outbound invoices directly.
          </p>
        </div>
        {connected ? (
          <Badge variant="default" className="bg-green-600">
            Connected
          </Badge>
        ) : (
          <Badge variant="secondary">Disconnected</Badge>
        )}
      </div>

      {connected && companyName && (
        <div className="text-sm text-[#666666]">
          <p>
            <span className="font-medium text-[#1A1A1A]">{companyName}</span>
          </p>
          {connectedAt && (
            <p>
              Connected{" "}
              {new Date(connectedAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      )}

      <div>
        {connected ? (
          <Button
            variant="destructive"
            onClick={handleDisconnect}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Unlink className="mr-2 h-4 w-4" />
            )}
            Disconnect
          </Button>
        ) : (
          <Button
            onClick={handleConnect}
            disabled={loading}
            className="bg-[#E8712A] hover:bg-[#D4631F]"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            Connect to QuickBooks
          </Button>
        )}
      </div>
    </div>
  );
}
