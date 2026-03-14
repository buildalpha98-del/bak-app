"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DocumentList } from "./document-list";
import { DocumentDetailSheet } from "./document-detail-sheet";
import { DocumentUploadDialog } from "./document-upload-dialog";
import { getDocuments } from "@/lib/documents/actions";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/documents/constants";
import type { DocumentListItem } from "@/lib/documents/actions";
import type { DocumentCategory } from "@/lib/types/enums";

// ============================================================
// Document Hub — main layout with category sidebar + list
// ============================================================

interface DocumentHubProps {
  initialDocuments: DocumentListItem[];
  categoryCounts: Record<string, number>;
  userRole: "admin" | "ops" | "coach";
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
}: DocumentHubProps) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [selectedCategory, setSelectedCategory] = useState<
    DocumentCategory | "all"
  >("all");
  const [selectedDoc, setSelectedDoc] = useState<DocumentListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const canUpload = userRole === "admin" || userRole === "ops";

  // Filter documents by category
  const filteredDocuments =
    selectedCategory === "all"
      ? documents
      : documents.filter((d) => d.category === selectedCategory);

  const totalCount = documents.length;

  async function refreshDocuments() {
    setLoading(true);
    const { data } = await getDocuments();
    if (data) setDocuments(data);
    setLoading(false);
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
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Upload Document
          </Button>
        )}
      </div>

      {/* Layout: sidebar + main */}
      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* Category Sidebar */}
        <div className="w-full lg:w-56 shrink-0">
          <nav className="space-y-1">
            {/* All Documents */}
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
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
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
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
      />
    </div>
  );
}
