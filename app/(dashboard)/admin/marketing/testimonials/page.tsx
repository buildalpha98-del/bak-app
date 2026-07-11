"use client";

// ============================================================
// Admin / Testimonials
// ============================================================
//
// Pattern alignment with the final-batch close-out:
//   - URL-persisted filter chips (?status=pending|approved)
//   - bulk-select on pending list with sticky BulkActionBar (approve/reject)
//   - rounded-2xl shells, restrained brand orange
//   - sonner toasts on mutate
//
// The per-row Approve flow keeps the existing "edit display name +
// comment" inline sheet — bulk approve uses the default centre name +
// contact name + original comment so the operator's first pass clears
// the queue; they can still hand-polish individual entries.

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Star,
  Check,
  X,
  Eye,
  EyeOff,
  Loader2,
  MessageSquareQuote,
  CheckCheck,
  CircleSlash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { createBrowserClient } from "@supabase/ssr";
import {
  bulkApproveTestimonials,
  bulkRejectTestimonials,
} from "@/lib/marketing/actions";

interface PendingFeedback {
  id: string;
  rating: number;
  comment: string;
  sport: string | null;
  centre_id: string;
  centre_name: string;
  contact_name: string | null;
}

interface ApprovedTestimonial {
  id: string;
  feedback_rating_id: string | null;
  centre_name: string;
  comment: string;
  rating: number;
  display_name: string;
  status: string;
  approved_at: string | null;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < rating
              ? "fill-yellow-400 text-yellow-400"
              : "text-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

const FILTER_VALUES = ["all", "pending", "approved", "rejected"] as const;
type FilterValue = (typeof FILTER_VALUES)[number];
function isFilter(v: string | null): v is FilterValue {
  return v !== null && (FILTER_VALUES as readonly string[]).includes(v);
}

export default function TestimonialsPage() {
  const router = useRouter();
  const params = useSearchParams();

  const filter: FilterValue = isFilter(params.get("filter"))
    ? (params.get("filter") as FilterValue)
    : "all";

  function setFilter(next: FilterValue) {
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (next === "all") sp.delete("filter");
    else sp.set("filter", next);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const [pending, setPending] = useState<PendingFeedback[]>([]);
  const [approved, setApproved] = useState<ApprovedTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editComment, setEditComment] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Bulk-select state lives on the pending list.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"approve" | "reject" | null>(
    null
  );

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: approvedData } = await supabase
        .from("approved_testimonials")
        .select("*")
        .order("approved_at", { ascending: false });

      setApproved((approvedData as ApprovedTestimonial[]) ?? []);

      const handledFeedbackIds = new Set(
        (approvedData ?? [])
          .map((t: ApprovedTestimonial) => t.feedback_rating_id)
          .filter(Boolean)
      );

      const { data: feedbackData } = await supabase
        .from("feedback_ratings")
        .select(
          "id, rating, comment, sport, centre_id, centres(name, primary_contact_name)"
        )
        .not("comment", "is", null)
        .not("submitted_at", "is", null)
        .gte("rating", 4)
        .order("submitted_at", { ascending: false });

      const pendingItems: PendingFeedback[] = (feedbackData ?? [])
        .filter(
          (f: Record<string, unknown>) =>
            !handledFeedbackIds.has(f.id as string)
        )
        .map((f: Record<string, unknown>) => {
          const centre = f.centres as Record<string, unknown> | null;
          return {
            id: f.id as string,
            rating: f.rating as number,
            comment: f.comment as string,
            sport: f.sport as string | null,
            centre_id: f.centre_id as string,
            centre_name: (centre?.name as string) ?? "Unknown Centre",
            contact_name: (centre?.primary_contact_name as string) ?? null,
          };
        });

      setPending(pendingItems);
    } catch {
      toast.error("Could not load testimonial data.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function startApprove(item: PendingFeedback) {
    setEditingId(item.id);
    setEditDisplayName(item.contact_name ?? item.centre_name);
    setEditComment(item.comment);
  }

  async function confirmApprove(item: PendingFeedback) {
    setActionLoading(item.id);
    try {
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase.from("approved_testimonials").insert({
        feedback_rating_id: item.id,
        centre_name: item.centre_name,
        comment: editComment.trim(),
        rating: item.rating,
        display_name: editDisplayName.trim(),
        status: "approved",
        approved_by: userData?.user?.id ?? null,
        approved_at: new Date().toISOString(),
      });

      if (error) {
        toast.error("Could not approve testimonial. Please try again.");
        return;
      }

      toast.success("Testimonial approved and published.");
      setEditingId(null);
      await fetchData();
    } finally {
      setActionLoading(null);
    }
  }

  async function rejectFeedback(feedbackId: string) {
    setActionLoading(feedbackId);
    try {
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase.from("approved_testimonials").insert({
        feedback_rating_id: feedbackId,
        centre_name: "",
        comment: "",
        rating: 0,
        display_name: "",
        status: "rejected",
        approved_by: userData?.user?.id ?? null,
      });

      if (error) {
        toast.error("Could not reject testimonial. Please try again.");
        return;
      }

      toast.success("Testimonial rejected.");
      await fetchData();
    } finally {
      setActionLoading(null);
    }
  }

  async function unpublish(testimonialId: string) {
    setActionLoading(testimonialId);
    try {
      const { error } = await supabase
        .from("approved_testimonials")
        .update({ status: "rejected" })
        .eq("id", testimonialId);

      if (error) {
        toast.error("Could not unpublish testimonial. Please try again.");
        return;
      }

      toast.success("Testimonial unpublished.");
      await fetchData();
    } finally {
      setActionLoading(null);
    }
  }

  // ============================================================
  // Bulk actions
  // ============================================================

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    if (!checked) return setSelectedIds(new Set());
    setSelectedIds(new Set(pending.map((p) => p.id)));
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    setBulkAction("approve");
    try {
      const ids = Array.from(selectedIds);
      const { data, error } = await bulkApproveTestimonials(ids);
      if (error) {
        toast.error(error);
        return;
      }
      const succeeded = data?.succeeded ?? 0;
      const failedCount = data?.failed.length ?? 0;
      if (failedCount > 0) {
        toast.warning(
          `Approved ${succeeded}, failed ${failedCount}. Check the failed rows.`
        );
      } else {
        toast.success(`Approved ${succeeded} testimonial${succeeded === 1 ? "" : "s"}.`);
      }
      setSelectedIds(new Set());
      await fetchData();
    } finally {
      setBulkAction(null);
    }
  }

  async function handleBulkReject() {
    if (selectedIds.size === 0) return;
    setBulkAction("reject");
    try {
      const ids = Array.from(selectedIds);
      const { data, error } = await bulkRejectTestimonials(ids);
      if (error) {
        toast.error(error);
        return;
      }
      const succeeded = data?.succeeded ?? 0;
      const failedCount = data?.failed.length ?? 0;
      if (failedCount > 0) {
        toast.warning(
          `Rejected ${succeeded}, failed ${failedCount}. Check the failed rows.`
        );
      } else {
        toast.success(`Rejected ${succeeded} testimonial${succeeded === 1 ? "" : "s"}.`);
      }
      setSelectedIds(new Set());
      await fetchData();
    } finally {
      setBulkAction(null);
    }
  }

  // ============================================================
  // Derived lists
  // ============================================================

  const approvedVisible = useMemo(
    () => approved.filter((t) => t.status === "approved"),
    [approved]
  );
  const rejectedList = useMemo(
    () => approved.filter((t) => t.status === "rejected"),
    [approved]
  );
  const rejectedCount = rejectedList.length;

  const showPending = filter === "all" || filter === "pending";
  const showApproved = filter === "all" || filter === "approved";
  const showRejected = filter === "rejected";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const allSelected =
    pending.length > 0 && pending.every((p) => selectedIds.has(p.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Testimonials</h1>
        <p className="text-sm text-[#666666]">
          Review centre feedback and approve for public display on the marketing
          website.
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
          count={pending.length + approvedVisible.length}
        />
        <FilterChip
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
          label="Pending"
          count={pending.length}
        />
        <FilterChip
          active={filter === "approved"}
          onClick={() => setFilter("approved")}
          label="Approved"
          count={approvedVisible.length}
        />
        <FilterChip
          active={filter === "rejected"}
          onClick={() => setFilter("rejected")}
          label="Rejected"
          count={rejectedCount}
        />
      </div>

      {/* Pending Review */}
      {showPending && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-[#1A1A1A]">
                Pending Review
              </h2>
              <Badge variant="outline">{pending.length}</Badge>
            </div>
            {pending.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-[#666666]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) => toggleAll(c === true)}
                  aria-label="Select all"
                />
                Select all
              </label>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="rounded-2xl border bg-background p-6 text-center text-sm text-[#666666]">
              <MessageSquareQuote className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
              No pending feedback to review. High-rated feedback with comments
              will appear here.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {pending.map((item) => {
                const selected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border bg-background p-5 space-y-3 hover:shadow-md transition"
                    data-selected={selected || undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleId(item.id)}
                          aria-label={`Select feedback from ${item.centre_name}`}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-[#1A1A1A]">
                            {item.centre_name}
                          </p>
                          {item.sport && (
                            <Badge variant="secondary" className="mt-1">
                              {item.sport}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <StarRating rating={item.rating} />
                    </div>

                    <p className="text-sm text-[#666666] italic">
                      &ldquo;{item.comment}&rdquo;
                    </p>

                    {editingId === item.id ? (
                      <div className="space-y-3 rounded-xl bg-muted/40 p-3">
                        <div>
                          <label className="text-xs font-medium text-[#666666]">
                            Display Name
                          </label>
                          <Input
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            className="mt-1"
                            placeholder="Name to display publicly"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#666666]">
                            Comment (editable)
                          </label>
                          <textarea
                            value={editComment}
                            onChange={(e) => setEditComment(e.target.value)}
                            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            rows={3}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="gap-1 bg-primary hover:bg-[#d4641f]"
                            onClick={() => confirmApprove(item)}
                            disabled={actionLoading === item.id}
                          >
                            {actionLoading === item.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            Confirm Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="gap-1 bg-primary hover:bg-[#d4641f]"
                          onClick={() => startApprove(item)}
                        >
                          <Check className="h-3 w-3" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-red-600 hover:bg-red-50"
                          onClick={() => rejectFeedback(item.id)}
                          disabled={actionLoading === item.id}
                        >
                          {actionLoading === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Approved */}
      {showApproved && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[#1A1A1A]">
              Approved Testimonials
            </h2>
            <Badge className="bg-green-100 text-green-700">
              {approvedVisible.length} published
            </Badge>
            {rejectedCount > 0 && (
              <Badge variant="outline" className="text-[#666666]">
                {rejectedCount} rejected
              </Badge>
            )}
          </div>

          {approvedVisible.length === 0 ? (
            <div className="rounded-2xl border bg-background p-6 text-center text-sm text-[#666666]">
              No approved testimonials yet. Approve pending feedback above to
              display them publicly.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {approvedVisible.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border bg-background p-5 space-y-3 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-[#1A1A1A]">
                        {item.display_name}
                      </p>
                      <p className="text-xs text-[#666666]">
                        {item.centre_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StarRating rating={item.rating} />
                      <Badge className="bg-green-100 text-green-700">
                        <Eye className="mr-1 h-3 w-3" />
                        Live
                      </Badge>
                    </div>
                  </div>

                  <p className="text-sm text-[#666666] italic">
                    &ldquo;{item.comment}&rdquo;
                  </p>

                  {item.approved_at && (
                    <p className="text-xs text-[#666666]">
                      Approved{" "}
                      {new Date(item.approved_at).toLocaleDateString("en-AU", {
                        dateStyle: "medium",
                      })}
                    </p>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-red-600 hover:bg-red-50"
                    onClick={() => unpublish(item.id)}
                    disabled={actionLoading === item.id}
                  >
                    {actionLoading === item.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                    Unpublish
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Rejected */}
      {showRejected && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[#1A1A1A]">
              Rejected
            </h2>
            <Badge variant="outline">{rejectedCount}</Badge>
          </div>
          {rejectedList.length === 0 ? (
            <div className="rounded-2xl border bg-background p-6 text-center text-sm text-[#666666]">
              No rejected feedback yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {rejectedList.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border bg-background p-5 space-y-2 hover:shadow-md transition opacity-70"
                >
                  <p className="text-sm font-medium text-[#1A1A1A]">
                    {item.centre_name || "—"}
                  </p>
                  <p className="text-xs text-[#666666]">
                    Marked rejected — won&apos;t surface on the public site.
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Sticky bulk-action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-background px-4 py-3 shadow-lg ring-1 ring-primary/20 sm:bottom-6 sm:right-6">
          <div className="flex items-center gap-3 pr-2 text-sm">
            <span className="font-medium text-foreground">
              {selectedIds.size} testimonial{selectedIds.size === 1 ? "" : "s"}{" "}
              selected
            </span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkReject}
            disabled={bulkAction !== null}
            className="text-red-600 hover:bg-red-50"
          >
            <CircleSlash className="size-4" />
            {bulkAction === "reject" ? "Rejecting…" : "Reject"}
          </Button>
          <Button
            size="sm"
            onClick={handleBulkApprove}
            disabled={bulkAction !== null}
            className="bg-primary text-white hover:bg-[#d4641f]"
          >
            <CheckCheck className="size-4" />
            {bulkAction === "approve" ? "Approving…" : "Approve"}
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
          : "inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      }
    >
      {label}
      <span className="rounded-full bg-background/70 px-1.5 tabular-nums">
        {count}
      </span>
    </button>
  );
}
