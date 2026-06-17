"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  Building2,
  Baby,
  Clock,
  X,
  Briefcase,
  CalendarDays,
  BookOpen,
  FileText,
  History,
} from "lucide-react";
import {
  globalSearch,
  type SearchResult,
  type SearchResultType,
} from "@/lib/search/actions";
import { useRecentPages, type RecentPage } from "@/lib/hooks/useRecentPages";
import type { UserRole } from "@/lib/types/enums";

interface CommandPaletteProps {
  userRole: UserRole;
}

type DisplayItem = {
  id: string;
  type: SearchResultType | "recent" | "history";
  title: string;
  subtitle: string;
  href: string;
};

const RECENT_SEARCH_KEY = "bak-recent-searches";
const MAX_RECENT_SEARCHES = 5;

function loadRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCH_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === "undefined") return;
  if (!query || query.length < 2) return;
  try {
    const existing = loadRecentSearches();
    const next = [query, ...existing.filter((q) => q !== query)].slice(
      0,
      MAX_RECENT_SEARCHES
    );
    localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable; silently skip.
  }
}

export function CommandPalette({ userRole }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();
  const { getRecentPages } = useRecentPages();

  const recentPages = getRecentPages();
  const isQueryEmpty = query.length < 2;
  const showRecentPages = isQueryEmpty && recentPages.length > 0;
  const showHistory = isQueryEmpty && recentSearches.length > 0;

  // Build the display list — recent searches first (so a typist can replay),
  // then recent pages, then live results when typing.
  const displayItems: DisplayItem[] = isQueryEmpty
    ? [
        ...recentSearches.map((q) => ({
          id: `history:${q}`,
          type: "history" as const,
          title: q,
          subtitle: "Recent search",
          href: `#run-search:${q}`,
        })),
        ...recentPages.map((p: RecentPage) => ({
          id: p.path,
          type: "recent" as const,
          title: p.title,
          subtitle: p.path,
          href: p.path,
        })),
      ]
    : results.map((r) => ({
        id: `${r.type}:${r.id}`,
        type: r.type,
        title: r.title,
        subtitle: r.subtitle,
        href: r.url,
      }));

  // Toggle on Cmd+K / Ctrl+K — window-level so it works from any logged-in page.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Reload recent searches whenever the palette opens — keep in sync if
  // multiple tabs are mutating localStorage.
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setRecentSearches(loadRecentSearches());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search — 250ms feels snappy without hammering the server.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults([]);
      setSelectedIndex(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await globalSearch(query, { roleScope: userRole });
        setResults(data);
        setSelectedIndex(0);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, userRole]);

  const runQuery = useCallback((q: string) => {
    setQuery(q);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const navigate = useCallback(
    (href: string, originalQuery?: string) => {
      // History entries replay the search instead of navigating.
      if (href.startsWith("#run-search:")) {
        runQuery(href.slice("#run-search:".length));
        return;
      }
      if (originalQuery) saveRecentSearch(originalQuery);
      setOpen(false);
      router.push(href);
    },
    [router, runQuery]
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
      navigate(displayItems[selectedIndex].href, query);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  function getIcon(type: DisplayItem["type"]) {
    const cls = "h-4 w-4";
    switch (type) {
      case "staff":
        return <Users className={`${cls} text-blue-600`} />;
      case "centre":
        return <Building2 className={`${cls} text-emerald-600`} />;
      case "child":
        return <Baby className={`${cls} text-purple-600`} />;
      case "lead":
        return <Briefcase className={`${cls} text-amber-600`} />;
      case "session":
        return <CalendarDays className={`${cls} text-orange-600`} />;
      case "program":
        return <BookOpen className={`${cls} text-indigo-600`} />;
      case "document":
        return <FileText className={`${cls} text-slate-600`} />;
      case "history":
        return <History className={`${cls} text-muted-foreground`} />;
      case "recent":
        return <Clock className={`${cls} text-muted-foreground`} />;
      default:
        return <Search className={`${cls} text-muted-foreground`} />;
    }
  }

  function getIconBg(type: DisplayItem["type"]) {
    switch (type) {
      case "staff":
        return "bg-blue-100 dark:bg-blue-950/40";
      case "centre":
        return "bg-emerald-100 dark:bg-emerald-950/40";
      case "child":
        return "bg-purple-100 dark:bg-purple-950/40";
      case "lead":
        return "bg-amber-100 dark:bg-amber-950/40";
      case "session":
        return "bg-orange-100 dark:bg-orange-950/40";
      case "program":
        return "bg-indigo-100 dark:bg-indigo-950/40";
      case "document":
        return "bg-slate-100 dark:bg-slate-800/60";
      default:
        return "bg-secondary/60";
    }
  }

  function getGroupLabel(type: DisplayItem["type"]) {
    switch (type) {
      case "staff":
        return "Staff";
      case "centre":
        return "Centres";
      case "child":
        return "Children";
      case "lead":
        return "Leads";
      case "session":
        return "Sessions";
      case "program":
        return "Programs";
      case "document":
        return "Documents";
      case "history":
        return "Recent searches";
      case "recent":
        return "Recent pages";
      default:
        return String(type);
    }
  }

  if (!open) return null;

  // Group items by type, preserving order.
  const groups: { type: DisplayItem["type"]; items: (DisplayItem & { globalIndex: number })[] }[] = [];
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
    >
      <div
        className="w-full max-w-xl mx-4 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search centres, coaches, leads, kids, sessions, programs, documents"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            aria-label="Search query"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {loading && (
            <div className="space-y-2 px-4 py-3" aria-live="polite">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 animate-pulse"
                >
                  <div className="h-8 w-8 rounded-lg bg-secondary/60" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/2 rounded bg-secondary/60" />
                    <div className="h-2.5 w-1/3 rounded bg-secondary/40" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && isQueryEmpty && !showRecentPages && !showHistory && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Search centres, coaches, leads, kids, sessions, programs,
              documents
            </div>
          )}

          {!loading && !isQueryEmpty && results.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {!loading &&
            groups.map((group) => (
              <div key={String(group.type)}>
                <div className="px-4 pt-3 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {getGroupLabel(group.type)}
                </div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      item.globalIndex === selectedIndex
                        ? "bg-secondary text-foreground"
                        : "text-foreground hover:bg-secondary/50"
                    }`}
                    onClick={() => navigate(item.href, query)}
                    onMouseEnter={() => setSelectedIndex(item.globalIndex)}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getIconBg(
                        item.type
                      )}`}
                    >
                      {getIcon(item.type)}
                    </span>
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
