"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Star, Check, X, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createBrowserClient } from "@supabase/ssr";

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

export default function TestimonialsPage() {
  const [pending, setPending] = useState<PendingFeedback[]>([]);
  const [approved, setApproved] = useState<ApprovedTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editComment, setEditComment] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch approved testimonials
      const { data: approvedData } = await supabase
        .from("approved_testimonials")
        .select("*")
        .order("approved_at", { ascending: false });

      setApproved((approvedData as ApprovedTestimonial[]) ?? []);

      // Get IDs of feedback already in approved_testimonials
      const approvedFeedbackIds = new Set(
        (approvedData ?? [])
          .map((t: ApprovedTestimonial) => t.feedback_rating_id)
          .filter(Boolean)
      );

      // Fetch pending feedback (rating >= 4, has comment, not yet in approved)
      const { data: feedbackData } = await supabase
        .from("feedback_ratings")
        .select("id, rating, comment, sport, centre_id, centres(name, primary_contact_name)")
        .not("comment", "is", null)
        .not("submitted_at", "is", null)
        .gte("rating", 4)
        .order("submitted_at", { ascending: false });

      const pendingItems: PendingFeedback[] = (feedbackData ?? [])
        .filter((f: Record<string, unknown>) => !approvedFeedbackIds.has(f.id as string))
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

      // Insert as rejected so it doesn't reappear in pending
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#E8712A]" />
      </div>
    );
  }

  const approvedVisible = approved.filter((t) => t.status === "approved");
  const rejectedCount = approved.filter((t) => t.status === "rejected").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Testimonials</h1>
        <p className="text-sm text-[#666666]">
          Review centre feedback and approve for public display on the marketing
          website.
        </p>
      </div>

      {/* Pending Review */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">
            Pending Review
          </h2>
          <Badge variant="outline">{pending.length}</Badge>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-xl border bg-white p-6 text-center text-sm text-[#666666]">
            No pending feedback to review. High-rated feedback with comments
            will appear here.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pending.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border bg-white p-5 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-[#1A1A1A]">
                      {item.centre_name}
                    </p>
                    {item.sport && (
                      <Badge variant="secondary" className="mt-1">
                        {item.sport}
                      </Badge>
                    )}
                  </div>
                  <StarRating rating={item.rating} />
                </div>

                <p className="text-sm text-[#666666] italic">
                  &ldquo;{item.comment}&rdquo;
                </p>

                {editingId === item.id ? (
                  <div className="space-y-3 rounded-lg bg-[#F5F5F5] p-3">
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
                        className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="gap-1 bg-[#E8712A] hover:bg-[#d4641f]"
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
                      className="gap-1 bg-[#E8712A] hover:bg-[#d4641f]"
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
            ))}
          </div>
        )}
      </section>

      {/* Approved */}
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
          <div className="rounded-xl border bg-white p-6 text-center text-sm text-[#666666]">
            No approved testimonials yet. Approve pending feedback above to
            display them publicly.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {approvedVisible.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border bg-white p-5 space-y-3"
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
    </div>
  );
}
