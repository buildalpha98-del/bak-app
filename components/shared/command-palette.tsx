"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Users, Building2, Baby, Clock, X } from "lucide-react";
import { globalSearch, type SearchResult } from "@/lib/search/actions";
import { useRecentPages, type RecentPage } from "@/lib/hooks/useRecentPages";
import type { UserRole } from "@/lib/types/enums";

interface CommandPaletteProps {
  userRole: UserRole;
}

type DisplayItem = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

export function CommandPalette({ userRole }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();
  const { getRecentPages } = useRecentPages();

  const recentPages = getRecentPages();
  const isQueryEmpty = query.length < 2;
  const showRecents = isQueryEmpty && recentPages.length > 0;

  const displayItems: DisplayItem[] = showRecents
    ? recentPages.map((p: RecentPage) => ({
        id: p.path,
        type: "recent",
        title: p.title,
        subtitle: p.path,
        href: p.path,
      }))
    : results;

  // Toggle on Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      // Small delay to let the modal render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const data = await globalSearch(query, userRole);
      setResults(data);
      setSelectedIndex(0);
      setLoading(false);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, userRole]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, displayItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && displayItems[selectedIndex]) {
      e.preventDefault();
      navigate(displayItems[selectedIndex].href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  function getIcon(type: string) {
    switch (type) {
      case "staff":
        return <Users className="h-4 w-4 text-muted-foreground" />;
      case "centre":
        return <Building2 className="h-4 w-4 text-muted-foreground" />;
      case "child":
        return <Baby className="h-4 w-4 text-muted-foreground" />;
      case "recent":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Search className="h-4 w-4 text-muted-foreground" />;
    }
  }

  function getGroupLabel(type: string) {
    switch (type) {
      case "staff":
        return "Staff";
      case "centre":
        return "Centres";
      case "child":
        return "Children";
      case "recent":
        return "Recent";
      default:
        return type;
    }
  }

  if (!open) return null;

  // Group items by type
  const groups: { type: string; items: (DisplayItem & { globalIndex: number })[] }[] = [];
  let globalIdx = 0;
  for (const item of displayItems) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.type === item.type) {
      lastGroup.items.push({ ...item, globalIndex: globalIdx });
    } else {
      groups.push({ type: item.type, items: [{ ...item, globalIndex: globalIdx }] });
    }
    globalIdx++;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg mx-4 overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search staff, centres, children..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {loading && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          )}

          {!loading && isQueryEmpty && !showRecents && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Start typing to search...
            </div>
          )}

          {!loading && !isQueryEmpty && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results found
            </div>
          )}

          {!loading &&
            groups.map((group) => (
              <div key={group.type}>
                <div className="px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {getGroupLabel(group.type)}
                </div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      item.globalIndex === selectedIndex
                        ? "bg-primary/10 text-foreground"
                        : "text-foreground hover:bg-secondary/50"
                    }`}
                    onClick={() => navigate(item.href)}
                    onMouseEnter={() => setSelectedIndex(item.globalIndex)}
                  >
                    {getIcon(item.type)}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{item.title}</div>
                      {item.subtitle && (
                        <div className="truncate text-xs text-muted-foreground">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))}
        </div>

        {/* Footer with keyboard hints */}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <kbd className="inline-flex h-5 items-center rounded border border-border/60 bg-background/50 px-1 text-[10px] font-medium">
              ↑↓
            </kbd>
            Navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="inline-flex h-5 items-center rounded border border-border/60 bg-background/50 px-1 text-[10px] font-medium">
              ↵
            </kbd>
            Open
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="inline-flex h-5 items-center rounded border border-border/60 bg-background/50 px-1 text-[10px] font-medium">
              ESC
            </kbd>
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
