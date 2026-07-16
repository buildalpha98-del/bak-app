"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "@/components/ui/app-link";
import { CheckCircle2, Play, Video } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { completeModule } from "@/lib/training/completion-actions";
import type {
  TrainingModule,
  TrainingAssignment,
  TrainingCompletion,
  VideoContent,
} from "@/lib/types/database";

interface Props {
  module: TrainingModule;
  assignment: TrainingAssignment | null;
  attempts: TrainingCompletion[];
}

export function VideoCompletion({ module, assignment, attempts }: Props) {
  const content = module.content_json as VideoContent;
  const alreadyCompleted = attempts.length > 0;

  const [watchProgress, setWatchProgress] = useState(0);
  const [completed, setCompleted] = useState(alreadyCompleted);
  const [submitting, setSubmitting] = useState(false);
  const [pathwayInfo, setPathwayInfo] = useState<{
    pathwayComplete?: boolean;
    nextModuleId?: string;
  }>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track HTML5 video progress
  useEffect(() => {
    if (content.video_type !== "upload" || !videoRef.current) return;

    intervalRef.current = setInterval(() => {
      const el = videoRef.current;
      if (el && el.duration > 0) {
        const pct = Math.round((el.currentTime / el.duration) * 100);
        setWatchProgress(pct);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [content.video_type]);

  // For iframe embeds, track time spent watching as a proxy
  const iframeStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (content.video_type === "upload" || completed) return;
    iframeStartRef.current = Date.now();

    const timer = setInterval(() => {
      if (!iframeStartRef.current || content.duration_seconds <= 0) return;
      const elapsed = (Date.now() - iframeStartRef.current) / 1000;
      const pct = Math.min(
        100,
        Math.round((elapsed / content.duration_seconds) * 100)
      );
      setWatchProgress(pct);
    }, 1000);

    return () => clearInterval(timer);
  }, [content.video_type, content.duration_seconds, completed]);

  const canComplete = content.require_full_watch ? watchProgress >= 90 : true;

  const handleComplete = useCallback(async () => {
    if (!assignment) return;
    setSubmitting(true);
    const result = await completeModule(assignment.id, module.id, {
      passed: true,
      completion_data: { watch_progress: watchProgress },
    });
    if ("success" in result) {
      setCompleted(true);
      setPathwayInfo({
        pathwayComplete: result.pathwayComplete,
        nextModuleId: result.nextModuleId,
      });
    }
    setSubmitting(false);
  }, [assignment, module.id, watchProgress]);

  function getEmbedUrl(): string {
    if (content.video_type === "youtube") {
      const id = extractYouTubeId(content.video_url);
      return `https://www.youtube.com/embed/${id}`;
    }
    if (content.video_type === "vimeo") {
      const id = extractVimeoId(content.video_url);
      return `https://player.vimeo.com/video/${id}`;
    }
    return content.video_url;
  }

  if (completed) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h2 className="text-xl font-semibold text-foreground">
            Module Completed
          </h2>
          <p className="text-sm text-muted-foreground">
            {alreadyCompleted && !pathwayInfo.pathwayComplete
              ? "You have already completed this module."
              : "Well done — you've finished this video module."}
          </p>
          {pathwayInfo.pathwayComplete && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 mt-4">
              <p className="font-semibold text-emerald-700">
                Congratulations — you&apos;ve completed the pathway!
              </p>
            </div>
          )}
          {pathwayInfo.nextModuleId && (
            <Link
              href={`/coach/training/${pathwayInfo.nextModuleId}`}
              className={cn(buttonVariants(), "mt-2")}
            >
              Continue to Next Module
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0 overflow-hidden rounded-lg">
          {content.video_type === "upload" ? (
            <video
              ref={videoRef}
              src={content.video_url}
              controls
              className="w-full aspect-video bg-black"
              playsInline
            />
          ) : (
            <iframe
              src={getEmbedUrl()}
              className="w-full aspect-video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={module.title}
            />
          )}
        </CardContent>
      </Card>

      {content.require_full_watch && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Play className="h-3 w-3" />
              Watch progress
            </span>
            <span>{watchProgress}%</span>
          </div>
          <Progress value={watchProgress} className="h-2" />
          {watchProgress < 90 && (
            <p className="text-xs text-muted-foreground">
              Watch at least 90% to unlock completion.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {content.duration_seconds
            ? `${Math.ceil(content.duration_seconds / 60)} min`
            : "Video"}
        </span>
      </div>

      <Button
        onClick={handleComplete}
        disabled={!canComplete || submitting || !assignment}
        className="w-full"
      >
        {submitting ? "Submitting..." : "Mark Complete"}
      </Button>
    </div>
  );
}

function extractYouTubeId(url: string): string {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?#]+)/
  );
  return match?.[1] ?? url;
}

function extractVimeoId(url: string): string {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match?.[1] ?? url;
}
