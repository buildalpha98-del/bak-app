"use client";

import { useState } from "react";
import { Loader2, Copy, Check, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateSessionReflection } from "@/lib/client/curriculum-actions";

interface SessionReflectionProps {
  sessionId: string;
  centreType: "childcare_centre" | "school";
  existingReflection?: string;
}

export function SessionReflection({
  sessionId,
  centreType,
  existingReflection,
}: SessionReflectionProps) {
  const [reflection, setReflection] = useState<string>(existingReflection ?? "");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const text = await generateSessionReflection(sessionId, centreType);
      setReflection(text);
    } catch (err) {
      setError("Unable to generate reflection. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reflection);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable in some contexts
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Generating educator reflection&hellip;</span>
      </div>
    );
  }

  if (reflection) {
    return (
      <div className="rounded-lg border-l-4 border-amber-300 bg-amber-50 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <BookOpen className="h-3.5 w-3.5" />
            Educator Reflection Prompt
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 text-xs text-amber-700 hover:bg-amber-100 hover:text-amber-800"
          >
            {copied ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copy to Clipboard
              </>
            )}
          </Button>
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-amber-900">
          {reflection}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        className="w-fit border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
      >
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        Generate Reflection
      </Button>
    </div>
  );
}
