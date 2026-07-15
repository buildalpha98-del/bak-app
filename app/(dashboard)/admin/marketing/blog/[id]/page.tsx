"use client";

// ============================================================
// Admin / Blog — post editor
// ============================================================
//
// Handles both new and existing posts: the route id "new" is the
// create form, any other id loads that post. One component because the
// two differ only in whether an id exists — a separate /new route would
// duplicate the whole form to change one call.
//
// A client component (like testimonials/page.tsx) because the form is
// stateful: slug auto-derivation and the markdown preview both need to
// react as you type. It holds NO privileged client, though — every read
// and write goes through lib/blog/admin-actions.ts, which authenticates
// and checks the admin role server-side. Nothing here is trusted.
//
// Markdown preview uses react-markdown exactly as
// components/announcements/announcement-detail.tsx does (same `prose`
// wrapper); no new dependency.

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { ArrowLeft, Eye, Loader2, Save, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/ui/load-error";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  createPost,
  getPostForEdit,
  setPostStatus,
  updatePost,
} from "@/lib/blog/admin-actions";
import { slugify, parseTagsField } from "@/lib/blog/admin-shared";

interface FormState {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image_url: string;
  seo_title: string;
  seo_description: string;
  tags: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  cover_image_url: "",
  seo_title: "",
  seo_description: "",
  tags: "",
};

function formatPublishedAt(iso: string | null): string {
  if (!iso) return "not yet published";
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  });
}

export default function BlogEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const routeId = params.id;
  const isNew = routeId === "new";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [postId, setPostId] = useState<string | null>(isNew ? null : routeId);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);

  // Once the author edits the slug by hand, the title must stop
  // overwriting it — otherwise a late title tweak would silently break
  // the URL of a post they had already slugged deliberately.
  const [slugTouched, setSlugTouched] = useState(!isNew);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    const { data, error } = await getPostForEdit(id);

    if (error) {
      setLoadError(error);
    } else if (!data) {
      setNotFound(true);
    } else {
      setForm({
        title: data.title,
        slug: data.slug,
        excerpt: data.excerpt ?? "",
        content: data.content,
        cover_image_url: data.cover_image_url ?? "",
        seo_title: data.seo_title ?? "",
        seo_description: data.seo_description ?? "",
        tags: data.tags.join(", "),
      });
      setStatus(data.status);
      setPublishedAt(data.published_at);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isNew) void load(routeId);
  }, [isNew, routeId, load]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleTitleChange(value: string) {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: slugTouched ? prev.slug : slugify(value),
    }));
  }

  function payload() {
    return {
      title: form.title,
      slug: form.slug,
      excerpt: form.excerpt,
      content: form.content,
      cover_image_url: form.cover_image_url,
      seo_title: form.seo_title,
      seo_description: form.seo_description,
      tags: parseTagsField(form.tags),
    };
  }

  /** Returns the post id on success, null on failure. */
  async function save(): Promise<string | null> {
    setSaving(true);
    try {
      if (postId === null) {
        const { data, error } = await createPost(payload());
        if (error || !data) {
          toast.error(error ?? "Could not save the post.");
          return null;
        }
        setPostId(data.id);
        // Swap the URL from /new to the real id so a refresh reopens
        // the post instead of a blank form — replace, not push, so Back
        // still leaves the editor.
        router.replace(`/admin/marketing/blog/${data.id}`);
        return data.id;
      }

      const { error } = await updatePost(postId, payload());
      if (error) {
        toast.error(error);
        return null;
      }
      return postId;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    const id = await save();
    if (id) toast.success("Draft saved.");
  }

  async function handlePublish() {
    // Save first: publishing an unsaved editor would put the last saved
    // version live, not what is on screen.
    const id = await save();
    if (!id) return;

    setStatusChanging(true);
    try {
      const { data, error } = await setPostStatus(id, "published");
      if (error || !data) {
        toast.error(error ?? "Could not publish the post.");
        return;
      }
      setStatus("published");
      setPublishedAt(data.published_at);
      toast.success("Post published.");
    } finally {
      setStatusChanging(false);
    }
  }

  async function handleUnpublish() {
    if (!postId) return;
    setStatusChanging(true);
    try {
      const { data, error } = await setPostStatus(postId, "draft");
      if (error || !data) {
        toast.error(error ?? "Could not unpublish the post.");
        return;
      }
      setStatus("draft");
      toast.success("Post unpublished. It is no longer on the website.");
    } finally {
      setStatusChanging(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <LoadError message={loadError} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="rounded-2xl border bg-background p-6 text-center text-sm text-[#666666]">
          That post does not exist. It may have been deleted.
        </div>
      </div>
    );
  }

  const busy = saving || statusChanging;

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">
            {isNew && !postId ? "New post" : "Edit post"}
          </h1>
          <p className="flex items-center gap-2 text-sm text-[#666666]">
            {status === "published" ? (
              <>
                <Badge className="bg-green-100 text-green-700">Published</Badge>
                <span>{formatPublishedAt(publishedAt)}</span>
              </>
            ) : (
              <>
                <Badge variant="outline" className="text-[#666666]">
                  Draft
                </Badge>
                <span>Not visible on the website.</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={busy}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>

          {status === "published" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnpublish}
              disabled={busy}
              className="gap-1.5"
            >
              {statusChanging ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4" />
              )}
              Unpublish
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handlePublish}
              disabled={busy}
              className="gap-1.5 bg-primary hover:bg-[#d4641f]"
            >
              {statusChanging ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Publish
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Body */}
        <div className="space-y-4 lg:col-span-2">
          <div className="space-y-2 rounded-2xl border bg-background p-5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Why kids need sport"
            />

            <Label htmlFor="slug" className="pt-2">
              Slug
            </Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
              onBlur={() => set("slug", slugify(form.slug))}
              placeholder="why-kids-need-sport"
            />
            <p className="text-xs text-[#666666]">
              The public URL: /blog/{form.slug || "…"}. Derived from the title
              until you edit it.
            </p>

            <Label htmlFor="excerpt" className="pt-2">
              Excerpt
            </Label>
            <Textarea
              id="excerpt"
              value={form.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
              rows={2}
              placeholder="A one- or two-sentence summary for the blog index."
            />
          </div>

          {/* Markdown body with live preview */}
          <div className="rounded-2xl border bg-background p-5">
            <Tabs defaultValue="edit">
              <div className="flex items-center justify-between gap-3">
                <Label>Content</Label>
                <TabsList>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="preview" className="gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="edit" className="pt-3">
                <Textarea
                  value={form.content}
                  onChange={(e) => set("content", e.target.value)}
                  rows={20}
                  className="min-h-[24rem] font-mono text-sm"
                  placeholder={"# Heading\n\nWrite the post in Markdown."}
                />
              </TabsContent>

              <TabsContent value="preview" className="pt-3">
                <div className="prose prose-sm min-h-[24rem] max-w-none rounded-md border bg-muted/20 p-4 text-foreground">
                  {form.content.trim() ? (
                    <ReactMarkdown>{form.content}</ReactMarkdown>
                  ) : (
                    <p className="text-sm text-[#666666]">
                      Nothing to preview yet.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Sidebar: presentation + SEO */}
        <div className="space-y-4">
          <div className="space-y-2 rounded-2xl border bg-background p-5">
            <h2 className="text-sm font-semibold text-[#1A1A1A]">
              Presentation
            </h2>

            <Label htmlFor="cover" className="pt-2">
              Cover image URL
            </Label>
            <Input
              id="cover"
              value={form.cover_image_url}
              onChange={(e) => set("cover_image_url", e.target.value)}
              placeholder="https://…"
            />

            <Label htmlFor="tags" className="pt-2">
              Tags
            </Label>
            <Input
              id="tags"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="basketball, holiday clinics"
            />
            <p className="text-xs text-[#666666]">Separate tags with commas.</p>
          </div>

          <div className="space-y-2 rounded-2xl border bg-background p-5">
            <h2 className="text-sm font-semibold text-[#1A1A1A]">SEO</h2>
            <p className="text-xs text-[#666666]">
              Leave blank to fall back to the title and excerpt.
            </p>

            <Label htmlFor="seo-title" className="pt-2">
              SEO title
            </Label>
            <Input
              id="seo-title"
              value={form.seo_title}
              onChange={(e) => set("seo_title", e.target.value)}
              placeholder={form.title || "Page title for search results"}
            />

            <Label htmlFor="seo-description" className="pt-2">
              SEO description
            </Label>
            <Textarea
              id="seo-description"
              value={form.seo_description}
              onChange={(e) => set("seo_description", e.target.value)}
              rows={3}
              placeholder={form.excerpt || "Summary for search results"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/marketing/blog"
      className="inline-flex items-center gap-1.5 text-sm text-[#666666] transition hover:text-[#1A1A1A]"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to posts
    </Link>
  );
}
