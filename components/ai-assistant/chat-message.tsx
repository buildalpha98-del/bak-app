"use client";

import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

/**
 * Renders a single chat bubble for the AI assistant.
 * User messages: right-aligned, orange background, white text.
 * Assistant messages: left-aligned, muted background, dark text.
 * Supports basic inline markdown: **bold**, *italic*, and - list items.
 */
export function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-white rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        )}
      >
        <div className="whitespace-pre-wrap break-words">
          {renderContent(content)}
        </div>
        {timestamp && (
          <p
            className={cn(
              "mt-1 text-[10px]",
              isUser ? "text-white/70" : "text-muted-foreground"
            )}
          >
            {formatTime(timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Render content with basic markdown support.
 */
function renderContent(text: string): React.ReactNode {
  // Split by lines to handle lists
  const lines = text.split("\n");

  return lines.map((line, lineIdx) => {
    // List items
    if (line.match(/^[\s]*[-*]\s/)) {
      const listContent = line.replace(/^[\s]*[-*]\s/, "");
      return (
        <div key={lineIdx} className="flex gap-1.5 ml-1">
          <span className="shrink-0">&#8226;</span>
          <span>{renderInlineFormatting(listContent)}</span>
        </div>
      );
    }

    // Numbered list items
    if (line.match(/^[\s]*\d+\.\s/)) {
      const match = line.match(/^[\s]*(\d+)\.\s(.*)/);
      if (match) {
        return (
          <div key={lineIdx} className="flex gap-1.5 ml-1">
            <span className="shrink-0">{match[1]}.</span>
            <span>{renderInlineFormatting(match[2])}</span>
          </div>
        );
      }
    }

    // Empty line
    if (line.trim() === "") {
      return <br key={lineIdx} />;
    }

    // Normal line
    return (
      <span key={lineIdx}>
        {renderInlineFormatting(line)}
        {lineIdx < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}

/**
 * Render inline formatting: **bold** and *italic*.
 */
function renderInlineFormatting(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Match **bold** or *italic*
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={match.index} className="font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={match.index} className="italic">
          {match[3]}
        </em>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
