"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Sparkles,
  FileText,
  Send,
  Save,
  Bookmark,
  Loader2,
  Clock,
  CheckCircle2,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getProposals,
  updateProposal,
  sendProposal,
  saveAsTemplate,
  type ProposalContentJson,
} from "@/lib/proposals/actions";
import type { SalesProposal } from "@/lib/types/database";
import type { ProposalStatus } from "@/lib/types/enums";

// ============================================================
// Section config
// ============================================================

const SECTIONS: {
  key: keyof Omit<ProposalContentJson, "pricing" | "testimonial_quotes" | "is_template">;
  label: string;
}[] = [
  { key: "executive_summary", label: "Executive Summary" },
  { key: "about_bak", label: "About Build Alpha Kids" },
  { key: "service_offering", label: "Service Offering" },
  { key: "local_impact", label: "Local Impact" },
  { key: "trial_results", label: "Trial Results" },
  { key: "next_steps", label: "Next Steps" },
];

// ============================================================
// Status badge
// ============================================================

function StatusBadge({ status }: { status: ProposalStatus }) {
  const styles: Record<ProposalStatus, string> = {
    draft: "bg-gray-100 text-gray-700",
    final: "bg-blue-100 text-blue-700",
    sent: "bg-green-100 text-green-700",
  };
  const icons: Record<ProposalStatus, React.ReactNode> = {
    draft: <Clock className="h-3 w-3" />,
    final: <CheckCircle2 className="h-3 w-3" />,
    sent: <Mail className="h-3 w-3" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ============================================================
// Main page component
// ============================================================

export default function ProposalPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leadId = params.id;

  const [proposals, setProposals] = useState<SalesProposal[]>([]);
  const [activeProposal, setActiveProposal] = useState<SalesProposal | null>(
    null
  );
  const [editedContent, setEditedContent] =
    useState<ProposalContentJson | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "list">("editor");

  // Load proposals
  const loadProposals = useCallback(async () => {
    const { data, error: loadError } = await getProposals(leadId);
    if (loadError) {
      setError(loadError);
      return;
    }
    setProposals(data);
    if (data.length > 0 && !activeProposal) {
      setActiveProposal(data[0]);
      setEditedContent(data[0].content_json as unknown as ProposalContentJson);
    }
  }, [leadId, activeProposal]);

  useEffect(() => {
    loadProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  // Generate new proposal
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Failed to generate proposal");
        toast.error("Could not generate proposal. Please try again.");
        return;
      }
      const newProposal = result.data as SalesProposal;
      setProposals((prev) => [newProposal, ...prev]);
      setActiveProposal(newProposal);
      setEditedContent(
        newProposal.content_json as unknown as ProposalContentJson
      );
      setActiveTab("editor");
      toast.success("Proposal generated successfully.");
      setSuccessMessage("Proposal generated successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate proposal";
      setError(msg);
      toast.error("Could not generate proposal. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  // Save edits
  const handleSave = async () => {
    if (!activeProposal || !editedContent) return;
    setSaving(true);
    setError(null);
    try {
      const { data, error: saveError } = await updateProposal(
        activeProposal.id,
        { content_json: editedContent }
      );
      if (saveError) {
        setError(saveError);
        toast.error("Could not save changes. Please try again.");
        return;
      }
      if (data) {
        setActiveProposal(data);
        setProposals((prev) =>
          prev.map((p) => (p.id === data.id ? data : p))
        );
        toast.success("Changes saved.");
        setSuccessMessage("Changes saved");
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      toast.error("Could not save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Mark as final (PDF placeholder)
  const handleMarkFinal = async () => {
    if (!activeProposal) return;
    setSaving(true);
    setError(null);
    try {
      const { data, error: updateError } = await updateProposal(
        activeProposal.id,
        { status: "final" as ProposalStatus, content_json: editedContent ?? undefined }
      );
      if (updateError) {
        setError(updateError);
        toast.error("Could not finalise proposal. Please try again.");
        return;
      }
      if (data) {
        setActiveProposal(data);
        setProposals((prev) =>
          prev.map((p) => (p.id === data.id ? data : p))
        );
        toast.success("Proposal marked as final.");
        setSuccessMessage("Proposal marked as final");
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      toast.error("Could not finalise proposal. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Send proposal
  const handleSend = async () => {
    if (!activeProposal) return;
    if (
      !confirm(
        "Are you sure you want to send this proposal to the lead? This will email the proposal content."
      )
    ) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      const { data, error: sendError } = await sendProposal(
        activeProposal.id
      );
      if (sendError) {
        setError(sendError);
        toast.error("Could not send proposal. Please try again.");
        return;
      }
      if (data) {
        setActiveProposal(data);
        setProposals((prev) =>
          prev.map((p) => (p.id === data.id ? data : p))
        );
        toast.success("Proposal sent to lead.");
        setSuccessMessage("Proposal sent successfully");
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
      toast.error("Could not send proposal. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Save as template
  const handleSaveAsTemplate = async () => {
    if (!activeProposal) return;
    try {
      const { error: templateError } = await saveAsTemplate(
        activeProposal.id
      );
      if (templateError) {
        setError(templateError);
        toast.error("Could not save as template. Please try again.");
        return;
      }
      toast.success("Saved as template.");
      setSuccessMessage("Saved as template");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save as template"
      );
      toast.error("Could not save as template. Please try again.");
    }
  };

  // Update a section in edited content
  const updateSection = (key: string, value: string) => {
    if (!editedContent) return;
    setEditedContent({ ...editedContent, [key]: value });
  };

  // Update pricing fields
  const updatePricing = (field: "model" | "rate" | "details", value: string) => {
    if (!editedContent) return;
    setEditedContent({
      ...editedContent,
      pricing: { ...editedContent.pricing, [field]: value },
    });
  };

  // Update testimonial quotes
  const updateQuote = (index: number, value: string) => {
    if (!editedContent) return;
    const quotes = [...editedContent.testimonial_quotes];
    quotes[index] = value;
    setEditedContent({ ...editedContent, testimonial_quotes: quotes });
  };

  const selectProposal = (proposal: SalesProposal) => {
    setActiveProposal(proposal);
    setEditedContent(
      proposal.content_json as unknown as ProposalContentJson
    );
    setActiveTab("editor");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href={`/admin/crm/${leadId}`} />}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">
              Sales Proposals
            </h1>
            <p className="text-sm text-[#666666]">
              Generate and manage AI-powered proposals for this lead
            </p>
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-primary hover:bg-[#D4651F] text-white"
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {generating ? "Generating..." : "Generate Proposal"}
        </Button>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("editor")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "editor"
              ? "border-primary text-primary"
              : "border-transparent text-[#666666] hover:text-[#1A1A1A]"
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setActiveTab("list")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "list"
              ? "border-primary text-primary"
              : "border-transparent text-[#666666] hover:text-[#1A1A1A]"
          }`}
        >
          All Proposals ({proposals.length})
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "editor" && activeProposal && editedContent ? (
        <div className="space-y-6">
          {/* Proposal header */}
          <div className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium text-[#1A1A1A]">
                  {activeProposal.title}
                </h2>
                <p className="text-xs text-[#666666]">
                  Created{" "}
                  {new Date(activeProposal.created_at).toLocaleDateString(
                    "en-AU"
                  )}
                </p>
              </div>
              <StatusBadge
                status={activeProposal.status as ProposalStatus}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveAsTemplate}
              >
                <Bookmark className="mr-1.5 h-3.5 w-3.5" />
                Save as Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkFinal}
                disabled={
                  saving || activeProposal.status === "sent"
                }
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Generate PDF
              </Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={sending || activeProposal.status === "sent"}
                className="bg-primary hover:bg-[#D4651F] text-white"
              >
                {sending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                Send to Lead
              </Button>
            </div>
          </div>

          {/* Editable sections */}
          <div className="space-y-4">
            {SECTIONS.map(({ key, label }) => {
              const value = editedContent[key];
              if (key === "trial_results" && value === null) {
                return (
                  <div
                    key={key}
                    className="rounded-lg border bg-gray-50 p-4"
                  >
                    <h3 className="mb-1 text-sm font-semibold text-[#666666]">
                      {label}
                    </h3>
                    <p className="text-sm italic text-[#666666]">
                      No trial data available. This section will be omitted.
                    </p>
                  </div>
                );
              }
              return (
                <div key={key} className="rounded-lg border bg-card p-4">
                  <h3 className="mb-2 text-sm font-semibold text-[#1A1A1A]">
                    {label}
                  </h3>
                  <textarea
                    value={(value as string) ?? ""}
                    onChange={(e) => updateSection(key, e.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-[#1A1A1A] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              );
            })}

            {/* Pricing section */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold text-[#1A1A1A]">
                Pricing
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#666666]">
                    Model
                  </label>
                  <input
                    type="text"
                    value={editedContent.pricing?.model ?? ""}
                    onChange={(e) => updatePricing("model", e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-[#1A1A1A] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#666666]">
                    Rate
                  </label>
                  <input
                    type="text"
                    value={editedContent.pricing?.rate ?? ""}
                    onChange={(e) => updatePricing("rate", e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-[#1A1A1A] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-[#666666]">
                  Details
                </label>
                <textarea
                  value={editedContent.pricing?.details ?? ""}
                  onChange={(e) => updatePricing("details", e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-[#1A1A1A] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Testimonial quotes */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold text-[#1A1A1A]">
                Testimonial Quotes
              </h3>
              {editedContent.testimonial_quotes?.length > 0 ? (
                <div className="space-y-2">
                  {editedContent.testimonial_quotes.map((quote, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-2 text-sm text-primary font-bold">
                        &ldquo;
                      </span>
                      <textarea
                        value={quote}
                        onChange={(e) => updateQuote(i, e.target.value)}
                        rows={2}
                        className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm text-[#1A1A1A] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-[#666666]">
                  No testimonial quotes generated.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === "editor" && !activeProposal ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16">
          <Sparkles className="mb-3 h-10 w-10 text-primary" />
          <h3 className="mb-1 text-lg font-medium text-[#1A1A1A]">
            No proposals yet
          </h3>
          <p className="mb-4 text-sm text-[#666666]">
            Generate an AI-powered proposal to get started.
          </p>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-primary hover:bg-[#D4651F] text-white"
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generate Proposal
          </Button>
        </div>
      ) : null}

      {/* Proposals list tab */}
      {activeTab === "list" && (
        <div className="space-y-3">
          {proposals.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#666666]">
              No proposals found for this lead.
            </p>
          ) : (
            proposals.map((proposal) => (
              <button
                key={proposal.id}
                onClick={() => selectProposal(proposal)}
                className={`w-full rounded-lg border p-4 text-left transition-colors hover:border-primary/50 ${
                  activeProposal?.id === proposal.id
                    ? "border-primary bg-orange-50"
                    : "bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-[#1A1A1A]">
                        {proposal.title}
                      </p>
                      <p className="text-xs text-[#666666]">
                        Created{" "}
                        {new Date(proposal.created_at).toLocaleDateString(
                          "en-AU"
                        )}
                        {proposal.sent_at &&
                          ` | Sent ${new Date(proposal.sent_at).toLocaleDateString("en-AU")}`}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    status={proposal.status as ProposalStatus}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
