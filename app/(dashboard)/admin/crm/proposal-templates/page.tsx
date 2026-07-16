"use client";

import { useEffect, useState } from "react";
import Link from "@/components/ui/app-link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bookmark,
  FileText,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getProposalTemplates,
  removeTemplate,
  type ProposalContentJson,
} from "@/lib/proposals/actions";
import type { SalesProposal } from "@/lib/types/database";

export default function ProposalTemplatesPage() {
  const [templates, setTemplates] = useState<SalesProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error: loadError } = await getProposalTemplates();
    if (loadError) {
      setError(loadError);
    } else {
      setTemplates(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleRemove = async (proposalId: string) => {
    if (!confirm("Remove this proposal from templates?")) return;
    const { error: removeError } = await removeTemplate(proposalId);
    if (removeError) {
      setError(removeError);
      toast.error("Could not remove template. Please try again.");
      return;
    }
    toast.success("Template removed.");
    setTemplates((prev) => prev.filter((t) => t.id !== proposalId));
    setSuccessMessage("Template removed");
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          render={<Link href="/admin/crm" />}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A1A]">
            Proposal Templates
          </h1>
          <p className="text-sm text-[#666666]">
            Saved proposals that can be used as templates for new leads
          </p>
        </div>
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

      {/* Loading */}
      {loading && (
        <div className="py-12 text-center text-sm text-[#666666]">
          Loading templates...
        </div>
      )}

      {/* Empty state */}
      {!loading && templates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16">
          <Bookmark className="mb-3 h-10 w-10 text-[#666666]" />
          <h3 className="mb-1 text-lg font-medium text-[#1A1A1A]">
            No templates saved
          </h3>
          <p className="text-sm text-[#666666]">
            Save a proposal as a template from the proposal editor to reuse it.
          </p>
        </div>
      )}

      {/* Templates list */}
      {!loading && templates.length > 0 && (
        <div className="space-y-3">
          {templates.map((template) => {
            const content =
              template.content_json as unknown as ProposalContentJson;
            const isExpanded = expandedId === template.id;

            return (
              <div
                key={template.id}
                className="rounded-lg border bg-card"
              >
                {/* Template header */}
                <div className="flex items-center justify-between p-4">
                  <button
                    onClick={() => toggleExpand(template.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-[#1A1A1A]">
                        {template.title}
                      </p>
                      <p className="text-xs text-[#666666]">
                        Created{" "}
                        {new Date(template.created_at).toLocaleDateString(
                          "en-AU"
                        )}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-[#666666]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-[#666666]" />
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(template.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Expanded content */}
                {isExpanded && content && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-3">
                    {content.executive_summary && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-[#666666]">
                          Executive Summary
                        </h4>
                        <p className="mt-1 text-sm text-[#1A1A1A]">
                          {content.executive_summary}
                        </p>
                      </div>
                    )}
                    {content.about_bak && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-[#666666]">
                          About Build Alpha Kids
                        </h4>
                        <p className="mt-1 text-sm text-[#1A1A1A]">
                          {content.about_bak}
                        </p>
                      </div>
                    )}
                    {content.service_offering && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-[#666666]">
                          Service Offering
                        </h4>
                        <p className="mt-1 text-sm text-[#1A1A1A]">
                          {content.service_offering}
                        </p>
                      </div>
                    )}
                    {content.local_impact && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-[#666666]">
                          Local Impact
                        </h4>
                        <p className="mt-1 text-sm text-[#1A1A1A]">
                          {content.local_impact}
                        </p>
                      </div>
                    )}
                    {content.pricing && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-[#666666]">
                          Pricing
                        </h4>
                        <p className="mt-1 text-sm text-[#1A1A1A]">
                          <strong>{content.pricing.model}</strong> &mdash;{" "}
                          {content.pricing.rate}
                        </p>
                        <p className="text-sm text-[#666666]">
                          {content.pricing.details}
                        </p>
                      </div>
                    )}
                    {content.next_steps && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-[#666666]">
                          Next Steps
                        </h4>
                        <p className="mt-1 text-sm text-[#1A1A1A]">
                          {content.next_steps}
                        </p>
                      </div>
                    )}
                    {content.testimonial_quotes &&
                      content.testimonial_quotes.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-[#666666]">
                            Testimonial Quotes
                          </h4>
                          <div className="mt-1 space-y-1">
                            {content.testimonial_quotes.map((q, i) => (
                              <p
                                key={i}
                                className="text-sm italic text-[#666666]"
                              >
                                &ldquo;{q}&rdquo;
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
