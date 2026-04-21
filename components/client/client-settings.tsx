"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Link2,
  Plus,
  Copy,
  Check,
  Trash2,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createSharedLink,
  revokeSharedLink,
} from "@/lib/client/actions";

interface SharedLink {
  id: string;
  centre_id: string;
  created_by: string;
  token: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
}

interface ClientSettingsProps {
  isPrimary: boolean;
  centreId: string;
  sharedLinks: SharedLink[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function truncateToken(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function daysUntilExpiry(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(dateStr);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function ClientSettings({
  isPrimary,
  centreId,
  sharedLinks: initialLinks,
}: ClientSettingsProps) {
  const [links, setLinks] = useState(initialLinks);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function handleCreate() {
    startCreateTransition(async () => {
      const { data, error } = await createSharedLink(centreId);
      if (error) {
        toast.error("Could not create shared link. Please try again.");
        return;
      }
      if (data) {
        setLinks((prev) => [data, ...prev]);
        toast.success("Shared link created.");
      }
    });
  }

  function handleRevoke(linkId: string) {
    setRevokingId(linkId);
    revokeSharedLink(linkId).then(({ error }) => {
      setRevokingId(null);
      if (error) {
        toast.error("Could not revoke link. Please try again.");
        return;
      }
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      toast.success("Shared link revoked.");
    });
  }

  function handleCopy(link: SharedLink) {
    const url = `${window.location.origin}/client/shared/${link.token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  // Non-primary user view
  if (!isPrimary) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">Settings</h1>
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <ShieldAlert className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              Settings restricted
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Contact your primary portal user to manage settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-bold font-heading text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage shared access links and preferences
      </p>

      {/* Shared Links */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-cyan-600" />
            Shared Links
          </CardTitle>
          <Button
            onClick={handleCreate}
            disabled={isCreating}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {isCreating ? "Creating..." : "Create New Link"}
          </Button>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-cyan-50">
                <Link2 className="h-5 w-5 text-cyan-600" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                No active shared links. Create one to share read-only portal access.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {links.map((link) => {
                const days = daysUntilExpiry(link.expires_at);
                const isExpiringSoon = days <= 7;

                return (
                  <div
                    key={link.id}
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700">
                          {truncateToken(link.token)}
                        </code>
                        <Badge
                          variant="outline"
                          className={
                            isExpiringSoon
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-cyan-200 bg-cyan-50 text-cyan-700"
                          }
                        >
                          {days > 0 ? `${days} day${days === 1 ? "" : "s"} left` : "Expires today"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Created {formatDate(link.created_at)} &middot; Expires{" "}
                        {formatDate(link.expires_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        onClick={() => handleCopy(link)}
                        variant="outline"
                        size="sm"
                        className="min-h-[36px]"
                        aria-label="Copy link"
                      >
                        {copiedId === link.id ? (
                          <>
                            <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Copy
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => handleRevoke(link.id)}
                        disabled={revokingId === link.id}
                        variant="outline"
                        size="sm"
                        className="min-h-[36px] text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                        aria-label="Revoke link"
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        {revokingId === link.id ? "Revoking..." : "Revoke"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
