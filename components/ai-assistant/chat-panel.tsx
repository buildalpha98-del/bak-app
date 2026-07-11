"use client";

// Integration: Import and render <ChatPanel sessionId={session.id} sessionContext={...} />
// in the coach active session page: app/(dashboard)/coach/schedule/[sessionId]/active/page.tsx
// or the session detail page: app/(dashboard)/coach/schedule/[sessionId]/page.tsx

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, X, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessage } from "./chat-message";
import { QuickPrompts } from "./quick-prompts";
import {
  getOrCreateConversation,
  getConversationHistory,
} from "@/lib/ai/assistant-actions";
import type { SessionContextData } from "@/lib/ai/context-assembly";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatPanelProps {
  sessionId: string;
  sessionContext: SessionContextData;
}

export function ChatPanel({ sessionId, sessionContext }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    setIsOffline(!navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load conversation on open
  useEffect(() => {
    if (!isOpen) return;

    async function loadConversation() {
      const { data: conversation, error: convError } =
        await getOrCreateConversation(sessionId);

      if (convError || !conversation) {
        setError("Failed to load conversation.");
        return;
      }

      setConversationId(conversation.id);

      const { data: history } = await getConversationHistory(conversation.id);
      if (history && history.length > 0) {
        setMessages(history);
      }
    }

    loadConversation();
  }, [isOpen, sessionId]);

  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || !conversationId || isLoading || isOffline)
        return;

      setError(null);
      const userMessage: Message = {
        role: "user",
        content: messageText.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputText("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            message: messageText.trim(),
            sessionContext,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const errorMessage =
            (errorData as { error?: string }).error ??
            "Something went wrong. Please try again.";
          setError(errorMessage);
          setIsLoading(false);
          return;
        }

        const data = (await res.json()) as {
          response: string;
          tokensUsed: number;
        };

        const assistantMessage: Message = {
          role: "assistant",
          content: data.response,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch {
        setError("Failed to send message. Please check your connection.");
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, isLoading, isOffline, sessionContext]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    sendMessage(prompt);
  };

  return (
    <>
      {/* Floating trigger button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-8"
          aria-label="Open AI Assistant"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      <div
        className={cn(
          "fixed bottom-0 right-0 z-50 flex flex-col bg-background border border-border rounded-t-xl shadow-2xl transition-all duration-300 ease-out",
          // Mobile: full width, 400px height
          "w-full h-[400px]",
          // Desktop: fixed width, positioned bottom-right
          "md:w-[380px] md:right-4 md:bottom-4 md:rounded-xl md:h-[500px]",
          isOpen
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">AI Assistant</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Offline banner */}
        {isOffline && (
          <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-700">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span>You&apos;re offline. Messages can&apos;t be sent right now.</span>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Sparkles className="h-8 w-8 text-primary/30 mb-3" />
              <p className="text-xs text-muted-foreground text-center mb-4">
                Ask me anything about your session — activity ideas, behaviour tips, or adaptations.
              </p>
              <QuickPrompts onSelect={handleQuickPrompt} />
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <ChatMessage
                  key={idx}
                  role={msg.role}
                  content={msg.content}
                  timestamp={msg.timestamp}
                />
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-center">
                  {error}
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t px-3 py-2 shrink-0">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your session..."
              className="min-h-[40px] max-h-[80px] resize-none text-sm"
              disabled={isLoading || isOffline}
              rows={1}
            />
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 bg-primary hover:bg-[#D4651F]"
              onClick={() => sendMessage(inputText)}
              disabled={!inputText.trim() || isLoading || isOffline}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
