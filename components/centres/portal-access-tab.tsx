"use client";

import { useState, useEffect } from "react";
import { Loader2, UserPlus, Users, Trash2 } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  inviteClientUser,
  getCentreClientUsers,
  revokeClientAccess,
} from "@/lib/client/actions";
import type { ClientUser } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

interface PortalAccessTabProps {
  centreId: string;
  centreName: string;
  contactEmail: string | null;
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
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Primary</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.name}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.is_primary && (
                          <Badge variant="default">Primary</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatLastLogin(user.last_login)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRevoke(user)}
                          disabled={revokingId === user.id}
                          title="Revoke access"
                        >
                          {revokingId === user.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4 text-destructive" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
