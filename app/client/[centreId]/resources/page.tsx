import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientPortalPulse } from "@/lib/client/status-pulse-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ClientPortalPulseStrip } from "@/components/client/client-status-pulse";
import { cn } from "@/lib/utils";
import {
  Shield,
  FileText,
  Building2,
  Download,
  ExternalLink,
  FolderOpen,
  Sparkles,
  BookMarked,
} from "lucide-react";

interface Document {
  id: string;
  title: string;
  category: string;
  file_url: string;
  file_type: string | null;
  tags: string[] | null;
  created_at: string;
}

const SECTIONS = [
  {
    key: "risk_assessment",
    label: "Risk Assessments",
    emptyLabel: "risk assessments",
    icon: Shield,
    iconClass: "text-teal-600",
    headerClass: "text-teal-700",
  },
  {
    key: "policy",
    label: "Policies & Procedures",
    emptyLabel: "policies",
    icon: FileText,
    iconClass: "text-blue-600",
    headerClass: "text-blue-700",
  },
  {
    key: "centre_doc",
    label: "Centre Documents",
    emptyLabel: "centre documents",
    icon: Building2,
    iconClass: "text-amber-600",
    headerClass: "text-amber-700",
  },
];

function fileTypeBadgeLabel(fileType: string | null): string {
  if (!fileType) return "FILE";
  const ext = fileType.toUpperCase().replace(".", "");
  return ext || "FILE";
}

export default async function ResourcesPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser();
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.centre_id !== centreId) redirect(`/client/${clientUser.centre_id}`);

  const supabase = await createSupabaseServerClient();
  const [{ data: documents }, pulse] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, category, file_url, file_type, tags, created_at")
      .eq("visibility", "all")
      .in("category", ["risk_assessment", "policy", "centre_doc"])
      .order("category")
      .order("title"),
    getClientPortalPulse(centreId),
  ]);

  const docs: Document[] = documents ?? [];

  const grouped: Record<string, Document[]> = {
    risk_assessment: [],
    policy: [],
    centre_doc: [],
  };

  for (const doc of docs) {
    if (grouped[doc.category]) {
      grouped[doc.category].push(doc);
    }
  }

  const hasAny = docs.length > 0;

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Resources &amp; Documents
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Risk assessments, policies, and documents shared by Build Alpha Kids.
        </p>
      </div>

      <ClientPortalPulseStrip
        stats={[
          {
            icon: Sparkles,
            count: pulse.resourcesNewThisMonthCount,
            label: pulse.resourcesNewThisMonthCount === 1 ? "new this month" : "new this month",
          },
          {
            icon: BookMarked,
            count: pulse.resourcesPoliciesCount,
            label: pulse.resourcesPoliciesCount === 1 ? "policy on file" : "policies on file",
          },
        ]}
      />

      {!hasAny ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-base font-medium text-muted-foreground">
            No resources have been shared yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Check back later for risk assessments, policies, and centre documents.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {SECTIONS.map(({ key, label, emptyLabel, icon: Icon, iconClass, headerClass }) => {
            const sectionDocs = grouped[key] ?? [];
            return (
              <section key={key}>
                <div className="flex items-center gap-2 mb-4">
                  <Icon className={`h-5 w-5 ${iconClass}`} />
                  <h2 className={`text-lg font-semibold ${headerClass}`}>{label}</h2>
                </div>

                {sectionDocs.length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-7">
                    No {emptyLabel} available yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sectionDocs.map((doc) => (
                      <Card key={doc.id} className="rounded-2xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <div className="flex items-start justify-between gap-4">
                            <CardTitle className="text-base font-medium leading-snug">
                              {doc.title}
                            </CardTitle>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="secondary" className="text-xs uppercase tracking-wide">
                                {fileTypeBadgeLabel(doc.file_type)}
                              </Badge>
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                className={cn(
                                  buttonVariants({ variant: "outline", size: "sm" }),
                                  "gap-1.5"
                                )}
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Download</span>
                                <ExternalLink className="h-3 w-3 sm:hidden" />
                              </a>
                            </div>
                          </div>
                        </CardHeader>
                        {doc.tags && doc.tags.length > 0 && (
                          <CardContent className="pb-4 px-4 pt-0">
                            <div className="flex flex-wrap gap-1.5">
                              {doc.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-xs text-muted-foreground font-normal"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
