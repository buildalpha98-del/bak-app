"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { VideoContent } from "@/lib/types/database";

interface VideoEditorProps {
  value: VideoContent;
  onChange: (value: VideoContent) => void;
}

function detectVideoType(url: string): VideoContent["video_type"] {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/vimeo\.com/.test(url)) return "vimeo";
  return "upload";
}

function getYouTubeEmbedUrl(url: string): string | null {
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  const embedMatch = url.match(/youtube\.com\/embed\/([^?]+)/);
  const id = watchMatch?.[1] ?? shortMatch?.[1] ?? embedMatch?.[1];
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

function getVimeoEmbedUrl(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? `https://player.vimeo.com/video/${match[1]}` : null;
}

export function VideoEditor({ value, onChange }: VideoEditorProps) {
  const [urlInput, setUrlInput] = useState(value.video_url);

  // Sync URL input back to parent with auto-detected type
  useEffect(() => {
    const debounce = setTimeout(() => {
      const detected = detectVideoType(urlInput);
      onChange({ ...value, video_url: urlInput, video_type: detected });
    }, 400);
    return () => clearTimeout(debounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlInput]);

  const embedUrl =
    value.video_type === "youtube"
      ? getYouTubeEmbedUrl(value.video_url)
      : value.video_type === "vimeo"
      ? getVimeoEmbedUrl(value.video_url)
      : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="video-url">Video URL</Label>
        <Input
          id="video-url"
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=… or Vimeo link"
        />
        <p className="text-xs text-muted-foreground">
          Paste a YouTube, Vimeo, or direct video URL
        </p>
        {value.video_url && (
          <p className="text-xs text-muted-foreground">
            Detected type:{" "}
            <span className="font-medium capitalize">{value.video_type}</span>
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="duration">Duration (seconds)</Label>
        <Input
          id="duration"
          type="number"
          min={0}
          value={value.duration_seconds || ""}
          onChange={(e) =>
            onChange({ ...value, duration_seconds: Number(e.target.value) })
          }
          placeholder="e.g. 300"
          className="w-40"
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="require-full-watch"
          checked={value.require_full_watch}
          onCheckedChange={(checked) =>
            onChange({ ...value, require_full_watch: Boolean(checked) })
          }
        />
        <Label htmlFor="require-full-watch" className="cursor-pointer">
          Require coaches to watch the full video before completing
        </Label>
      </div>

      {/* Preview */}
      {embedUrl ? (
        <div className="mt-4 rounded-lg overflow-hidden border aspect-video">
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Video preview"
          />
        </div>
      ) : value.video_url && value.video_type === "upload" ? (
        <p className="text-sm text-muted-foreground italic mt-2">
          Upload preview not available — video will be shown to coaches after upload.
        </p>
      ) : null}
    </div>
  );
}
