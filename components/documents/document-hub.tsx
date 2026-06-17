"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Shield,
  AlertTriangle,
  GraduationCap,
  Building2,
  CheckCircle2,
  LayoutTemplate,
  FolderOpen,
  BookOpen,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DocumentList } from "./document-list";
import { DocumentDetailSheet } from "./document-detail-sheet";
import { DocumentUploadDialog } from "./document-upload-dialog";
import { DocumentsStatusPulseStrip } from "./documents-status-pulse";
import { getDocuments } from "@/lib/documents/actions";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/documents/constants";
import type { DocumentListItem } from "@/lib/documents/actions";
import type { DocumentsStatusPulse } from "@/lib/documents/status-pulse-actions";
import type { DocumentCategory } from "@/lib/types/enums";

// ============================================================
// Document Hub — main layout with pulse strip + sidebar + list
// ============================================================

interface DocumentHubProps {
  initialDocuments: DocumentListItem[];
  categoryCounts: Record<string, number>;
  userRole: "admin" | "ops" | "coach";
  pulse: DocumentsStatusPulse;
  basePath: string;
}

const CATEGORY_ICONS: Record<DocumentCategory, React.ReactNode> = {
  program: <BookOpen className="h-4 w-4" />,
  policy: <Shield className="h-4 w-4" />,
  risk_assessment: <AlertTriangle className="h-4 w-4" />,
  onboarding: <GraduationCap className="h-4 w-4" />,
  centre_doc: <Building2 className="h-4 w-4" />,
  compliance: <CheckCircle2 className="h-4 w-4" />,
  template: <LayoutTemplate className="h-4 w-4" />,
  other: <FolderOpen className="h-4 w-4" />,
};

export function DocumentHub({
  initialDocuments,
  categoryCounts,
  userRole,
  pulse,
  basePath,
}: DocumentHubProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [documents, setDocuments] = useState(initialDocuments);
  const [selectedDoc, setSelectedDoc] = useState<DocumentListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  // URL-persisted category state.
  const categoryParam = params.get("category");
  const selectedCategory: DocumentCategory | "all" =
    categoryParam && CATEGORY_ORDER.includes(categoryParam as DocumentCategory)
      ? (categoryParam as DocumentCategory)
      : "all";

  function setSelectedCategory(cat: DocumentCategory | "all") {
    const next = new URLSearchParams(Array.from(params.entries()));
    if (cat === "all") {
      next.delete("category");
    } else {
      next.set("category", cat);
    }
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const canUpload = userRole === "admin" || userRole === "ops" || userRole === "coach";

  // Filter documents by category
  const filteredDocuments =
    selectedCategory === "all"
      ? documents
      : documents.filter((d) => d.category === selectedCategory);

  const totalCount = documents.length;

  async function refreshDocuments() {
    const { data } = await getDocuments();
    if (data) setDocuments(data);
    router.refresh();
  }

  function handleSelectDoc(doc: DocumentListItem) {
    setSelectedDoc(doc);
    setDetailOpen(true);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Centralised document storage for your team.
          </p>
        </div>
        {canUpload && (
          <Button
            onClick={() => setUploadOpen(true)}
            className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Upload Document
          </Button>
        )}
      </div>

      {/* Status pulse strip */}
      <div className="mt-6 mb-6">
        <DocumentsStatusPulseStrip pulse={pulse} basePath={basePath} />
      </div>

      {/* Layout: sidebar + main */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Category Sidebar */}
        <div className="w-full lg:w-56 shrink-0">
          <nav className="space-y-1">
            {/* All Documents */}
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm transition-colors ${
                selectedCategory === "all"
                  ? "bg-[var(--brand-orange-light)] text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                All Documents
              </span>
              <Badge
                variant="secondary"
                className="ml-auto text-[10px] px-1.5"
              >
                {totalCount}
              </Badge>
            </button>

            {/* Category items */}
            {CATEGORY_ORDER.map((cat) => {
              const count = categoryCounts[cat] ?? 0;
              const isActive = selectedCategory === cat;

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-[var(--brand-orange-light)] text-primary font-medium"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {CATEGORY_ICONS[cat]}
                    {CATEGORY_LABELS[cat]}
                  </span>
                  {count > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-auto text-[10px] px-1.5"
                    >
                      {count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <DocumentList
            documents={filteredDocuments}
            onSelect={handleSelectDoc}
            userRole={userRole}
            onRefresh={refreshDocuments}
          />
        </div>
      </div>

      {/* Detail Sheet */}
      <DocumentDetailSheet
        document={selectedDoc}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdate={refreshDocuments}
        userRole={userRole}
      />

      {/* Upload Dialog */}
      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={refreshDocuments}
        defaultCategory={
          selectedCategory !== "all" ? selectedCategory : undefined
        }
        userRole={userRole}
      />
    </div>
  );
}
