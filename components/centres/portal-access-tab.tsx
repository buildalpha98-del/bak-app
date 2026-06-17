"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  UserPlus,
  Users,
  Trash2,
  Building2,
  Star,
  ChevronDown,
  Plus,
  X,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { toast } from "sonner";
import {
  inviteClientUser,
  getCentreClientUsers,
  revokeClientAccess,
  getCentresForClientUser,
  linkClientUserToCentre,
  unlinkClientUserFromCentre,
} from "@/lib/client/actions";
import { sendSms } from "@/lib/sms/actions";
import type { ClientUser } from "@/lib/types/database";
import type { ClientUserCentre } from "@/lib/client/actions";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface PortalAccessTabProps {
  centreId: string;
  centreName: string;
  contactEmail: string | null;
  /** All centres in the org (id+name only). Optional — when omitted the link UI is hidden. */
  availableCentres?: Array<{ id: string; name: string }>;
}

// ============================================================
// Helpers
// ============================================================

function formatLastLogin(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ============================================================
// Component
// ============================================================

export function PortalAccessTab({
  centreId,
  centreName,
  contactEmail,
  availableCentres = [],
}: PortalAccessTabProps) {
  // Invite form state
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState(contactEmail ?? "");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Users list state
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Fetch users on mount
  useEffect(() => {
    async function fetchUsers() {
      setLoadingUsers(true);
      setUsersError(null);
      const { data, error } = await getCentreClientUsers(centreId);
      if (error) {
        setUsersError(error);
      } else {
        setUsers(data);
      }
      setLoadingUsers(false);
    }
    fetchUsers();
  }, [centreId]);

  // Invite handler
  async function handleInvite() {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError("Name and email are required.");
      return;
    }
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    const { data, error } = await inviteClientUser({
      centreId,
      email: inviteEmail.trim(),
      name: inviteName.trim(),
    });

    setInviting(false);

    if (error) {
      setInviteError(error);
      return;
    }

    setInviteSuccess(`Invitation sent to ${inviteEmail.trim()}`);
    setInviteName("");
    setInviteEmail(contactEmail ?? "");

    // Add the new user to the list
    if (data) {
      setUsers((prev) => [...prev, data]);
    }
  }

  // Revoke handler
  async function handleRevoke(clientUser: ClientUser) {
    const confirmed = window.confirm(
      `Are you sure you want to revoke portal access for ${clientUser.name} (${clientUser.email})?`
    );
    if (!confirmed) return;

    setRevokingId(clientUser.id);
    const { error } = await revokeClientAccess(clientUser.id);
    setRevokingId(null);

    if (error) {
      setUsersError(error);
      return;
    }

    setUsers((prev) => prev.filter((u) => u.id !== clientUser.id));
  }

  return (
    <div className="space-y-6">
      {/* Invite User Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-5" />
            Invite to Portal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invite-name">Name</Label>
                <Input
                  id="invite-name"
                  placeholder="Contact name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  disabled={inviting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="email@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviting}
                />
              </div>
            </div>

            {inviteError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {inviteError}
              </div>
            )}

            {inviteSuccess && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                {inviteSuccess}
              </div>
            )}

            <Button onClick={handleInvite} disabled={inviting}>
              {inviting && <Loader2 className="size-4 animate-spin" />}
              {inviting ? "Sending Invitation..." : "Invite to Portal"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current Portal Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Portal Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usersError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {usersError}
            </div>
          )}

          {loadingUsers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
              <Users className="mb-3 size-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No portal users for {centreName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Invite a centre contact above to give them portal access.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {users.map((user) => (
                <PortalUserRow
                  key={user.id}
                  user={user}
                  availableCentres={availableCentres}
                  revoking={revokingId === user.id}
                  onRevoke={() => handleRevoke(user)}
                  onUsersChange={setUsers}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// PortalUserRow — single director with expandable linked centres
// ============================================================
//
// Each row keeps its own loaded list of linked centres (fetched
// lazily on expand). The "Link centre" picker filters out centres
// already linked so the admin can't accidentally insert a duplicate.

function PortalUserRow({
  user,
  availableCentres,
  revoking,
  onRevoke,
  onUsersChange,
}: {
  user: ClientUser;
  availableCentres: Array<{ id: string; name: string }>;
  revoking: boolean;
  onRevoke: () => void;
  onUsersChange: React.Dispatch<React.SetStateAction<ClientUser[]>>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [linkedCentres, setLinkedCentres] = useState<ClientUserCentre[] | null>(
    null,
  );
  const [loadingCentres, setLoadingCentres] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedToLink, setSelectedToLink] = useState<string>("");
  const [linking, setLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  // SMS test triage — admins use this to verify the SMS bridge can
  // actually reach a director (phone valid, opted into receiving, etc.).
  // We send through the configured provider regardless of opt-in (this is
  // a manual triage send, not the urgent-fallback path) so admins can
  // diagnose "did the message ever arrive?" even when the director has
  // urgent SMS turned off.
  const [smsBusy, setSmsBusy] = useState(false);

  async function handleSendTestSms() {
    setSmsBusy(true);
    const { error } = await sendSms({
      userId: user.user_id,
      body: `Build Alpha Kids: test SMS for ${user.name}. If you received this you're reachable for urgent alerts.`,
    });
    setSmsBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Test SMS sent to ${user.name}.`);
  }

  // Suppress lint warning — onUsersChange exists for future hookups
  // (e.g. when a primary user is revoked we need to refresh the
  // list). For now we keep it on the prop surface to avoid a churny
  // signature change later.
  void onUsersChange;

  async function loadCentres() {
    setLoadingCentres(true);
    const { data } = await getCentresForClientUser(user.id);
    setLinkedCentres(data);
    setLoadingCentres(false);
  }

  function handleToggle() {
    setExpanded((prev) => {
      if (!prev && linkedCentres === null) {
        void loadCentres();
      }
      return !prev;
    });
  }

  async function handleLink() {
    if (!selectedToLink) return;
    setLinking(true);
    const { error } = await linkClientUserToCentre(user.id, selectedToLink, false);
    setLinking(false);
    if (error) {
      toast.error(error);
      return;
    }
    setSelectedToLink("");
    setShowPicker(false);
    await loadCentres();
    toast.success("Centre linked.");
  }

  async function handleUnlink(centreId: string) {
    setUnlinkingId(centreId);
    const { error } = await unlinkClientUserFromCentre(user.id, centreId);
    setUnlinkingId(null);
    if (error) {
      toast.error(error);
      return;
    }
    setLinkedCentres((prev) => prev?.filter((c) => c.id !== centreId) ?? null);
    toast.success("Centre unlinked.");
  }

  const linkedIds = new Set(linkedCentres?.map((c) => c.id) ?? []);
  const pickableCentres = availableCentres.filter((c) => !linkedIds.has(c.id));

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={expanded}
          aria-label="Expand linked centres"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", expanded && "rotate-180")}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{user.name}</span>
            {user.is_primary && <Badge variant="default">Primary</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {user.email} · Last login {formatLastLogin(user.last_login)}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSendTestSms}
          disabled={smsBusy}
          title="Send a test SMS to verify the bridge is reachable."
        >
          {smsBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MessageSquare className="size-4 text-muted-foreground" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRevoke}
          disabled={revoking}
          title="Revoke access"
        >
          {revoking ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4 text-destructive" />
          )}
        </Button>
      </div>

      {expanded && (
        <div className="border-t bg-muted/20 p-3">
          <div className="flex items-center gap-2 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Building2 className="size-3.5" />
            Linked centres
          </div>
          {loadingCentres ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : !linkedCentres || linkedCentres.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              No centres linked yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {linkedCentres.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5"
                >
                  <span className="text-sm text-foreground">{c.name}</span>
                  {c.is_default && (
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                    >
                      <Star className="mr-1 size-3 fill-amber-400 text-amber-400" />
                      Default
                    </Badge>
                  )}
                  <span className="flex-1" />
                  <Button
                    variant="ghost"
                    size="icon"
                    title={
                      c.is_default
                        ? "Cannot unlink the default centre — set another default first"
                        : "Unlink centre"
                    }
                    disabled={c.is_default || unlinkingId === c.id}
                    onClick={() => handleUnlink(c.id)}
                    className="h-7 w-7"
                  >
                    {unlinkingId === c.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {availableCentres.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {showPicker ? (
                <>
                  <select
                    value={selectedToLink}
                    onChange={(e) => setSelectedToLink(e.target.value)}
                    disabled={linking}
                    className="h-8 rounded-md border bg-white px-2 text-xs"
                  >
                    <option value="">Pick a centre…</option>
                    {pickableCentres.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    onClick={handleLink}
                    disabled={linking || !selectedToLink}
                  >
                    {linking && <Loader2 className="mr-1 size-3.5 animate-spin" />}
                    Link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowPicker(false);
                      setSelectedToLink("");
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPicker(true)}
                  disabled={pickableCentres.length === 0}
                >
                  <Plus className="mr-1 size-3.5" />
                  Link another centre
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
