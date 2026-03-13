"use client";

import { useState, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getContactsForMessaging,
  type ContactForMessaging,
} from "@/lib/messages/actions";

interface NewMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string, name: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function roleBadgeLabel(role: string): string {
  if (role === "ops") return "Ops";
  if (role === "admin") return "Admin";
  return "Coach";
}

export function NewMessageDialog({
  open,
  onOpenChange,
  onSelect,
}: NewMessageDialogProps) {
  const [contacts, setContacts] = useState<ContactForMessaging[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      return;
    }

    let cancelled = false;

    async function fetchContacts() {
      setLoading(true);
      try {
        const data = await getContactsForMessaging();
        if (!cancelled) setContacts(data);
      } catch (err) {
        console.error("Failed to fetch contacts:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchContacts();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filteredContacts = contacts.filter((c) =>
    c.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (contact: ContactForMessaging) => {
    onSelect(contact.id, contact.full_name);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">New Message</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-card pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[44px]"
            autoFocus
          />
        </div>

        {/* Contact list */}
        <div className="max-h-[300px] overflow-y-auto -mx-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "No contacts found" : "No contacts available"}
              </p>
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => handleSelect(contact)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-secondary/50 transition-colors text-left min-h-[44px]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                  {getInitials(contact.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    {contact.full_name}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {roleBadgeLabel(contact.role)}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
