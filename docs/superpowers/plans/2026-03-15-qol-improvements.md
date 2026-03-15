# Quality of Life Improvements — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 13 quality-of-life features across auth, navigation, workflow, notifications, and visual polish to make the Build Alpha Kids platform more pleasant and efficient for daily use.

**Architecture:** Each feature is a self-contained task that touches 1–3 files. Features are grouped into 5 chunks that can be implemented in parallel. All features use existing design system tokens (oklch colours, shadcn/ui, Tailwind v4). No new dependencies required — `next-themes`, `sonner`, `lucide-react` all already installed.

**Tech Stack:** Next.js 14+ (App Router), Tailwind CSS v4 (oklch tokens), shadcn/ui, Supabase Auth, next-themes, Lucide React, TypeScript

---

## Chunk 1: Auth & Session Management

### Task 1: "Keep Me Signed In" Toggle

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Modify: `lib/auth/actions.ts`

**Context:** Supabase SSR manages sessions via cookies. By default sessions expire after ~1 hour of inactivity. The `signInWithPassword` method does not accept session duration params directly, but we can control cookie `maxAge` in the Supabase client config. The simpler approach: set a localStorage flag, then in the browser client, call `supabase.auth.startAutoRefresh()` which keeps the session alive indefinitely. For "don't keep me signed in", we skip auto-refresh so the default timeout applies.

Actually, the cleanest approach: pass `rememberMe` as a hidden form field to the server action, and use Supabase's built-in session management. The key insight is that Supabase sessions already persist via cookies and auto-refresh. The issue is that cookies have a default expiry. We handle this client-side: if "keep me signed in" is unchecked, we set a sessionStorage flag, and on page unload we sign out.

**Simplest correct approach:** Supabase sessions already persist for a long time (default 7 days with auto-refresh). The real issue is that users WANT shorter sessions when on shared devices. So the default should be "kept signed in" (it already is), and we add a toggle for "Sign out when I close the browser" which triggers sign-out on `beforeunload`.

- [ ] **Step 1: Add the "Keep me signed in" checkbox to login page**

In `app/(auth)/login/page.tsx`, add state and a checkbox between the password field and submit button:

```tsx
const [rememberMe, setRememberMe] = useState(true);
```

Add after the password `</div>` and before the `<button type="submit">`:

```tsx
<label className="flex items-center gap-2.5 cursor-pointer select-none group py-1">
  <input
    type="checkbox"
    checked={rememberMe}
    onChange={(e) => setRememberMe(e.target.checked)}
    className="h-4 w-4 rounded border-border/60 text-primary focus:ring-primary/20 accent-primary cursor-pointer"
  />
  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
    Keep me signed in
  </span>
</label>
```

- [ ] **Step 2: Store the preference and handle session expiry**

In `app/(auth)/login/page.tsx`, after `const result = await signIn(formData);` succeeds (no error), store the preference:

```tsx
if (result?.error) {
  setError(result.error);
  setLoading(false);
} else {
  // If user doesn't want persistent session, set flag for cleanup on browser close
  if (!rememberMe) {
    sessionStorage.setItem("bak-session-ephemeral", "true");
  } else {
    sessionStorage.removeItem("bak-session-ephemeral");
  }
}
```

- [ ] **Step 3: Create ephemeral session hook**

Create `lib/hooks/useEphemeralSession.ts`:

```tsx
"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function useEphemeralSession() {
  useEffect(() => {
    const isEphemeral = sessionStorage.getItem("bak-session-ephemeral") === "true";
    if (!isEphemeral) return;

    function handleBeforeUnload() {
      // Sign out when browser/tab closes (not on navigation)
      const supabase = createSupabaseBrowserClient();
      supabase.auth.signOut();
      // Clear the cookie synchronously
      document.cookie.split(";").forEach((c) => {
        const name = c.trim().split("=")[0];
        if (name.startsWith("sb-")) {
          document.cookie = `${name}=;expires=${new Date(0).toUTCString()};path=/`;
        }
      });
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
}
```

- [ ] **Step 4: Wire ephemeral session into DashboardShell**

In `components/shared/dashboard-shell.tsx`, import and call the hook:

```tsx
import { useEphemeralSession } from "@/lib/hooks/useEphemeralSession";

// Inside DashboardShell component body, before return:
useEphemeralSession();
```

- [ ] **Step 5: Commit**

```bash
git add app/(auth)/login/page.tsx lib/auth/actions.ts lib/hooks/useEphemeralSession.ts components/shared/dashboard-shell.tsx
git commit -m "feat: add 'keep me signed in' toggle to login page"
```

---

### Task 2: Session Timeout Warning

**Files:**
- Create: `components/shared/session-timeout-warning.tsx`
- Modify: `components/shared/dashboard-shell.tsx`

**Context:** Show a toast warning 5 minutes before session expires. Supabase fires `TOKEN_REFRESHED` and `SIGNED_OUT` auth events. We track the last refresh time and warn when approaching expiry.

- [ ] **Step 1: Create the session timeout warning component**

Create `components/shared/session-timeout-warning.tsx`:

```tsx
"use client";

import { useEffect, useRef, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const WARNING_BEFORE_MS = 5 * 60 * 1000; // 5 minutes before expiry
const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour (Supabase default)

export function SessionTimeoutWarning() {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasWarnedRef = useRef(false);

  const scheduleWarning = useCallback((expiresAt: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    hasWarnedRef.current = false;

    const warningTime = expiresAt - Date.now() - WARNING_BEFORE_MS;
    if (warningTime <= 0) return;

    timerRef.current = setTimeout(() => {
      if (hasWarnedRef.current) return;
      hasWarnedRef.current = true;

      toast.warning("Your session expires in 5 minutes", {
        description: "Click to stay signed in.",
        duration: Infinity,
        action: {
          label: "Stay signed in",
          onClick: async () => {
            const supabase = createSupabaseBrowserClient();
            const { data } = await supabase.auth.refreshSession();
            if (data.session) {
              toast.success("Session extended");
            }
          },
        },
      });
    }, warningTime);
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // Schedule warning based on current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.expires_at) {
        scheduleWarning(session.expires_at * 1000);
      }
    });

    // Re-schedule on token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session?.expires_at) {
        scheduleWarning(session.expires_at * 1000);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scheduleWarning]);

  return null;
}
```

- [ ] **Step 2: Add to DashboardShell**

In `components/shared/dashboard-shell.tsx`, add inside the root div, after `<InstallPrompt />`:

```tsx
import { SessionTimeoutWarning } from "./session-timeout-warning";

// Inside return, after <InstallPrompt />:
<SessionTimeoutWarning />
```

- [ ] **Step 3: Commit**

```bash
git add components/shared/session-timeout-warning.tsx components/shared/dashboard-shell.tsx
git commit -m "feat: add session timeout warning with 5-minute toast"
```

---

## Chunk 2: Navigation & Speed

### Task 3: Global Search (Cmd+K / ⌘K)

**Files:**
- Create: `components/shared/command-palette.tsx`
- Create: `lib/search/actions.ts`
- Modify: `components/shared/dashboard-shell.tsx`

**Context:** A command palette (Cmd+K) that searches across staff, centres, children, sessions, and invoices. Uses server actions for database queries. Results grouped by type. Opens as a modal dialog with keyboard navigation.

- [ ] **Step 1: Create the search server action**

Create `lib/search/actions.ts`:

```tsx
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SearchResult {
  id: string;
  type: "staff" | "centre" | "child" | "session" | "invoice" | "page";
  title: string;
  subtitle: string;
  href: string;
}

export async function globalSearch(query: string, role: string): Promise<SearchResult[]> {
  if (!query || query.length < 2) return [];

  const supabase = await createSupabaseServerClient();
  const results: SearchResult[] = [];
  const q = `%${query}%`;
  const rolePrefix = `/${role}`;

  // Search staff (admin/ops only)
  if (role === "admin" || role === "ops") {
    const { data: staff } = await supabase
      .from("profiles")
      .select("id, name, email, role")
      .or(`name.ilike.${q},email.ilike.${q}`)
      .limit(5);

    if (staff) {
      for (const s of staff) {
        results.push({
          id: s.id,
          type: "staff",
          title: s.name,
          subtitle: `${s.role} · ${s.email}`,
          href: `${rolePrefix}/staff/${s.id}`,
        });
      }
    }
  }

  // Search centres
  if (role === "admin" || role === "ops") {
    const { data: centres } = await supabase
      .from("centres")
      .select("id, name, suburb")
      .or(`name.ilike.${q},suburb.ilike.${q}`)
      .limit(5);

    if (centres) {
      for (const c of centres) {
        results.push({
          id: c.id,
          type: "centre",
          title: c.name,
          subtitle: c.suburb || "Centre",
          href: `${rolePrefix}/centres/${c.id}`,
        });
      }
    }
  }

  // Search children (admin/ops)
  if (role === "admin" || role === "ops") {
    const { data: children } = await supabase
      .from("children")
      .select("id, first_name, last_name")
      .or(`first_name.ilike.${q},last_name.ilike.${q}`)
      .limit(5);

    if (children) {
      for (const ch of children) {
        results.push({
          id: ch.id,
          type: "child",
          title: `${ch.first_name} ${ch.last_name}`,
          subtitle: "Child",
          href: `${rolePrefix}/children/${ch.id}`,
        });
      }
    }
  }

  return results;
}
```

- [ ] **Step 2: Create the command palette component**

Create `components/shared/command-palette.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  Building2,
  Baby,
  Calendar,
  FileText,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { globalSearch, type SearchResult } from "@/lib/search/actions";

const TYPE_ICONS: Record<string, typeof Search> = {
  staff: Users,
  centre: Building2,
  child: Baby,
  session: Calendar,
  invoice: FileText,
  page: Search,
};

const TYPE_LABELS: Record<string, string> = {
  staff: "Staff",
  centre: "Centres",
  child: "Children",
  session: "Sessions",
  invoice: "Invoices",
  page: "Pages",
};

interface CommandPaletteProps {
  userRole: string;
}

export function CommandPalette({ userRole }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard shortcut to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
  }, [open]);

  // Debounced search
  const search = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        const data = await globalSearch(q, userRole);
        setResults(data);
        setActiveIndex(0);
        setLoading(false);
      }, 250);
    },
    [userRole]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      navigateTo(results[activeIndex]);
    }
  }

  function navigateTo(result: SearchResult) {
    setOpen(false);
    router.push(result.href);
  }

  if (!open) return null;

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  let flatIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-x-4 top-[15vh] z-50 mx-auto max-w-lg animate-scale-in">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="h-5 w-5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                search(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search staff, centres, children..."
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <kbd className="hidden sm:inline-flex h-6 items-center gap-0.5 rounded-md border border-border bg-secondary/50 px-1.5 text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-72 overflow-y-auto p-2">
            {loading && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Searching...
              </div>
            )}

            {!loading && query.length >= 2 && results.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No results found for &ldquo;{query}&rdquo;
              </div>
            )}

            {!loading && query.length < 2 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Start typing to search...
              </div>
            )}

            {Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  {TYPE_LABELS[type] || type}
                </div>
                {items.map((result) => {
                  const currentIndex = flatIndex++;
                  const Icon = TYPE_ICONS[result.type] || Search;
                  const isActive = currentIndex === activeIndex;
                  return (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => navigateTo(result)}
                      onMouseEnter={() => setActiveIndex(currentIndex)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-secondary/50"
                      }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        isActive ? "bg-primary/15" : "bg-secondary"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{result.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                      </div>
                      {isActive && (
                        <CornerDownLeft className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 border-t border-border bg-secondary/20 px-4 py-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <ArrowUp className="h-3 w-3" />
              <ArrowDown className="h-3 w-3" />
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CornerDownLeft className="h-3 w-3" />
              <span>Open</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="font-mono">ESC</span>
              <span>Close</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Add CommandPalette to DashboardShell**

In `components/shared/dashboard-shell.tsx`:

```tsx
import { CommandPalette } from "./command-palette";

// Inside the root div, after <InstallPrompt />:
<CommandPalette userRole={profile.role} />
```

- [ ] **Step 4: Add Cmd+K hint to the top bar**

In `components/shared/navigation/top-bar.tsx`, add a search trigger button between Breadcrumbs and the notifications area:

```tsx
{/* Search trigger — desktop only */}
<button
  type="button"
  onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
  className="hidden md:inline-flex items-center gap-2 h-8 rounded-lg border border-border/60 bg-secondary/30 px-3 text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-all"
>
  <Search className="h-3.5 w-3.5" />
  <span>Search...</span>
  <kbd className="ml-2 inline-flex h-5 items-center rounded border border-border/60 bg-background/50 px-1 text-[10px] font-medium">
    ⌘K
  </kbd>
</button>
```

Import `Search` from lucide-react.

- [ ] **Step 5: Commit**

```bash
git add components/shared/command-palette.tsx lib/search/actions.ts components/shared/dashboard-shell.tsx components/shared/navigation/top-bar.tsx
git commit -m "feat: add global search command palette (Cmd+K)"
```

---

### Task 4: Quick Actions Menu

**Files:**
- Create: `components/shared/quick-actions.tsx`
- Modify: `components/shared/dashboard-shell.tsx`

**Context:** A floating action button (FAB) on mobile that shows role-specific quick actions. On desktop, keyboard shortcuts (e.g., N for new) are available via the command palette.

- [ ] **Step 1: Create the quick actions component**

Create `components/shared/quick-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Calendar,
  Building2,
  Receipt,
  ClipboardList,
  Users,
  Megaphone,
} from "lucide-react";
import type { UserRole } from "@/lib/types/enums";

interface QuickAction {
  label: string;
  icon: typeof Plus;
  href: string;
}

const QUICK_ACTIONS: Record<string, QuickAction[]> = {
  admin: [
    { label: "New Centre", icon: Building2, href: "/admin/centres/add" },
    { label: "New Invoice", icon: Receipt, href: "/admin/invoicing/outbound/new" },
    { label: "New Staff", icon: Users, href: "/admin/staff/new" },
    { label: "Announcement", icon: Megaphone, href: "/admin/announcements" },
  ],
  ops: [
    { label: "New Invoice", icon: Receipt, href: "/ops/invoicing/outbound/new" },
    { label: "New Form", icon: ClipboardList, href: "/ops/forms/new" },
    { label: "Announcement", icon: Megaphone, href: "/ops/announcements" },
  ],
  coach: [
    { label: "Submit Form", icon: ClipboardList, href: "/coach/forms" },
    { label: "New Invoice", icon: Receipt, href: "/coach/invoicing/new" },
  ],
};

interface QuickActionsProps {
  role: UserRole;
}

export function QuickActions({ role }: QuickActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const actions = QUICK_ACTIONS[role];

  if (!actions || actions.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-30 md:hidden flex flex-col-reverse items-end gap-2">
      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
        aria-label="Quick actions"
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>

      {/* Action items */}
      {open &&
        actions.map((action, i) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(action.href);
              }}
              className="flex items-center gap-2.5 rounded-full bg-card border border-border shadow-lg pl-4 pr-2 py-2 animate-scale-in"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="text-sm font-medium text-foreground whitespace-nowrap">
                {action.label}
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
            </button>
          );
        })}
    </div>
  );
}
```

- [ ] **Step 2: Add to DashboardShell**

In `components/shared/dashboard-shell.tsx`:

```tsx
import { QuickActions } from "./quick-actions";

// Inside root div, after <BottomTabs />:
<QuickActions role={profile.role} />
```

- [ ] **Step 3: Commit**

```bash
git add components/shared/quick-actions.tsx components/shared/dashboard-shell.tsx
git commit -m "feat: add mobile quick actions floating button"
```

---

### Task 5: Recent Pages

**Files:**
- Create: `lib/hooks/useRecentPages.ts`
- Modify: `components/shared/command-palette.tsx`

**Context:** Track pages the user visits and show them as suggestions in the command palette when the search query is empty. Stored in localStorage. Max 8 items.

- [ ] **Step 1: Create the recent pages hook**

Create `lib/hooks/useRecentPages.ts`:

```tsx
"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "bak-recent-pages";
const MAX_ITEMS = 8;

export interface RecentPage {
  path: string;
  title: string;
  timestamp: number;
}

function getSegmentLabel(segment: string): string {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pathToTitle(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 1) return "Dashboard";
  // Skip role prefix, take last 1-2 meaningful segments
  const meaningful = segments.slice(1).filter((s) => !s.match(/^[0-9a-f-]{36}$/));
  return meaningful.map(getSegmentLabel).join(" › ") || "Dashboard";
}

export function useRecentPages() {
  const pathname = usePathname();

  // Record current page
  useEffect(() => {
    if (!pathname) return;
    // Skip non-dashboard routes
    if (!pathname.startsWith("/admin") && !pathname.startsWith("/ops") && !pathname.startsWith("/coach") && !pathname.startsWith("/parent")) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    const pages: RecentPage[] = stored ? JSON.parse(stored) : [];

    // Remove if already exists
    const filtered = pages.filter((p) => p.path !== pathname);
    // Add to front
    filtered.unshift({ path: pathname, title: pathToTitle(pathname), timestamp: Date.now() });
    // Trim
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_ITEMS)));
  }, [pathname]);

  const getRecentPages = useCallback((): RecentPage[] => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }, []);

  return { getRecentPages };
}
```

- [ ] **Step 2: Show recent pages in command palette when query is empty**

In `components/shared/command-palette.tsx`, import the hook and show recent pages when query is empty:

```tsx
import { useRecentPages } from "@/lib/hooks/useRecentPages";

// Inside CommandPalette component:
const { getRecentPages } = useRecentPages();
const [recentPages, setRecentPages] = useState<RecentPage[]>([]);

// In the useEffect that fires on open:
useEffect(() => {
  if (open) {
    // ... existing code
    setRecentPages(getRecentPages());
  }
}, [open, getRecentPages]);
```

In the results area, when `query.length < 2`, replace the "Start typing" message with recent pages:

```tsx
{!loading && query.length < 2 && recentPages.length > 0 && (
  <div>
    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
      Recent
    </div>
    {recentPages.map((page, i) => (
      <button
        key={page.path}
        type="button"
        onClick={() => { setOpen(false); router.push(page.path); }}
        onMouseEnter={() => setActiveIndex(i)}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
          i === activeIndex ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary/50"
        }`}
      >
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          i === activeIndex ? "bg-primary/15" : "bg-secondary"
        }`}>
          <Clock className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{page.title}</p>
          <p className="text-xs text-muted-foreground truncate">{page.path}</p>
        </div>
      </button>
    ))}
  </div>
)}
```

Import `Clock` from lucide-react.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useRecentPages.ts components/shared/command-palette.tsx
git commit -m "feat: add recent pages to command palette"
```

---

## Chunk 3: Daily Workflow

### Task 6: Coach "Today" View Improvements

**Files:**
- Create: `components/coach/today-session-card.tsx`
- Modify: `app/(dashboard)/coach/schedule/page.tsx` (or the TodayView sub-component)

**Context:** Enhance the coach's today view with: countdown to next session, one-tap Google Maps directions, and a quick-action button for marking attendance. Need to find the actual TodayView component first.

- [ ] **Step 1: Find and read the TodayView component**

Search for TodayView or today-view in `app/(dashboard)/coach/schedule/` or `components/coach/`.

- [ ] **Step 2: Create an enhanced session card**

Create `components/coach/today-session-card.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  MapPin,
  Clock,
  Navigation,
  ChevronRight,
  Users,
  Dumbbell,
} from "lucide-react";

interface TodaySessionCardProps {
  session: {
    id: string;
    centre_name: string;
    centre_address?: string;
    sport: string;
    start_time: string;
    end_time: string;
    status: string;
    headcount?: number;
  };
  isNext: boolean;
}

function getCountdown(targetTime: string): string | null {
  const now = new Date();
  const target = new Date(targetTime);
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function TodaySessionCard({ session, isNext }: TodaySessionCardProps) {
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    if (!isNext) return;
    const update = () => setCountdown(getCountdown(session.start_time));
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [isNext, session.start_time]);

  const mapsUrl = session.centre_address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(session.centre_address)}`
    : null;

  return (
    <div
      className={`rounded-2xl border p-4 transition-all ${
        isNext
          ? "border-primary/30 bg-primary/5 shadow-md glow-orange"
          : "border-border bg-card"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{session.centre_name}</h3>
            {isNext && countdown && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                <Clock className="h-3 w-3" />
                {countdown}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <Dumbbell className="h-3.5 w-3.5" />
            <span>{session.sport}</span>
            <span>·</span>
            <span>{formatTime(session.start_time)} – {formatTime(session.end_time)}</span>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          session.status === "completed"
            ? "bg-[var(--sport-green-light)] text-[var(--sport-green)]"
            : session.status === "confirmed"
            ? "bg-primary/10 text-primary"
            : "bg-secondary text-muted-foreground"
        }`}>
          {session.status}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--sport-blue-light)] px-3 py-2 text-xs font-semibold text-[var(--sport-blue)] hover:bg-[var(--sport-blue)]/20 transition-colors min-h-[44px]"
          >
            <Navigation className="h-3.5 w-3.5" />
            Directions
          </a>
        )}
        <Link
          href={`/coach/schedule/session/${session.id}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary/80 transition-colors min-h-[44px] flex-1 justify-center"
        >
          View Details
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Integrate into the existing TodayView**

This depends on the existing TodayView structure. The implementer should:
1. Find the TodayView component (search for `TodayView` or `today` in coach schedule components)
2. Replace the existing session list items with `<TodaySessionCard>` components
3. Pass `isNext={true}` for the first upcoming (non-completed) session

- [ ] **Step 4: Commit**

```bash
git add components/coach/today-session-card.tsx
git commit -m "feat: enhanced coach today view with countdown and directions"
```

---

### Task 7: Bulk Actions on Lists

**Files:**
- Create: `components/shared/bulk-action-bar.tsx`

**Context:** A reusable floating bar that appears when items are selected in a list. Individual pages opt in by managing selection state and passing available actions. This is a shared UI component — integration into specific pages (invoices, sessions) is done per-page.

- [ ] **Step 1: Create the bulk action bar component**

Create `components/shared/bulk-action-bar.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface BulkAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: "default" | "destructive";
  loading?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: BulkAction[];
}

export function BulkActionBar({ selectedCount, onClearSelection, actions }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 animate-fade-up">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card shadow-2xl px-4 py-2.5">
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
          {selectedCount} selected
        </span>
        <div className="h-5 w-px bg-border mx-1" />
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={action.loading}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors min-h-[44px] ${
                action.variant === "destructive"
                  ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "bg-primary/10 text-primary hover:bg-primary/20"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {action.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onClearSelection}
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/shared/bulk-action-bar.tsx
git commit -m "feat: add reusable bulk action bar component"
```

---

### Task 8: Inline Editing

**Files:**
- Create: `components/shared/inline-edit.tsx`

**Context:** A reusable inline-editable text field. Click to edit, Enter/blur to save, Escape to cancel. Used in tables and detail pages to avoid full-page navigation for simple field updates.

- [ ] **Step 1: Create the inline edit component**

Create `components/shared/inline-edit.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Check, X, Pencil } from "lucide-react";

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

export function InlineEdit({
  value,
  onSave,
  className = "",
  inputClassName = "",
  placeholder = "Click to edit",
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function handleSave() {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      setDraft(value);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(value);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`group inline-flex items-center gap-1.5 text-left rounded-lg px-1.5 py-0.5 -mx-1.5 hover:bg-secondary/60 transition-colors ${className}`}
      >
        <span className={value ? "" : "text-muted-foreground"}>{value || placeholder}</span>
        <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors" />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        disabled={saving}
        className={`rounded-lg border border-primary/30 bg-background px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 ${inputClassName}`}
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex h-6 w-6 items-center justify-center rounded text-primary hover:bg-primary/10"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={handleCancel}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/shared/inline-edit.tsx
git commit -m "feat: add reusable inline edit component"
```

---

## Chunk 4: Notifications & Communication

### Task 9: Smart Notification Grouping

**Files:**
- Modify: `components/shared/navigation/notification-bell.tsx`

**Context:** Group consecutive notifications of the same type (e.g., 6 "shift confirmed" notifications) into a single grouped item in the bell dropdown. The grouping is client-side — the individual notifications remain separate in the database.

- [ ] **Step 1: Add grouping logic to notification bell**

In `components/shared/navigation/notification-bell.tsx`, add a grouping function before the component:

```tsx
interface GroupedNotification {
  key: string;
  notifications: Notification[];
  type: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
}

function groupNotifications(notifications: Notification[]): GroupedNotification[] {
  const groups: GroupedNotification[] = [];
  let current: GroupedNotification | null = null;

  for (const n of notifications) {
    if (current && current.type === n.type && !isOlderThan1Hour(current.created_at, n.created_at)) {
      current.notifications.push(n);
      current.read = current.read && n.read;
    } else {
      if (current) groups.push(current);
      current = {
        key: n.id,
        notifications: [n],
        type: n.type,
        title: n.title,
        body: n.body,
        created_at: n.created_at,
        read: n.read,
      };
    }
  }
  if (current) groups.push(current);

  // Update titles for groups with multiple items
  return groups.map((g) => {
    if (g.notifications.length > 1) {
      return {
        ...g,
        title: `${g.notifications.length} ${g.title.replace(/^(Your |A )/, "")}`,
        body: `${g.notifications.length} similar notifications`,
      };
    }
    return g;
  });
}

function isOlderThan1Hour(a: string, b: string): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) > 3600_000;
}
```

- [ ] **Step 2: Use grouped notifications in the render**

Replace the notifications map in the component with grouped results. Change the render loop from `notifications.map(...)` to `groupedNotifications.map(...)`, where `groupedNotifications = groupNotifications(notifications)`.

When a grouped item is clicked, mark all contained notifications as read.

- [ ] **Step 3: Commit**

```bash
git add components/shared/navigation/notification-bell.tsx
git commit -m "feat: smart notification grouping in bell dropdown"
```

---

### Task 10: Read Receipts on Announcements

**Files:**
- Create: `components/admin/announcement-read-receipts.tsx`
- Create: `lib/announcements/read-receipt-actions.ts`

**Context:** The `announcement_reads` table already tracks who has read each announcement. We need a UI component that shows read/unread status per staff member, with a "nudge" button to send a reminder notification.

- [ ] **Step 1: Create the server action for read receipts**

Create `lib/announcements/read-receipt-actions.ts`:

```tsx
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ReadReceipt {
  userId: string;
  name: string;
  role: string;
  hasRead: boolean;
  readAt: string | null;
}

export async function getAnnouncementReadReceipts(announcementId: string): Promise<ReadReceipt[]> {
  const supabase = await createSupabaseServerClient();

  // Get announcement to check audience
  const { data: announcement } = await supabase
    .from("announcements")
    .select("audience")
    .eq("id", announcementId)
    .single();

  if (!announcement) return [];

  // Get all staff who should have seen it
  let staffQuery = supabase.from("profiles").select("id, name, role").in("status", ["active"]);
  if (announcement.audience === "coaches") {
    staffQuery = staffQuery.eq("role", "coach");
  }
  // "all_staff" includes admin, ops, coach

  const { data: staff } = await staffQuery;
  if (!staff) return [];

  // Get reads
  const { data: reads } = await supabase
    .from("announcement_reads")
    .select("user_id, read_at")
    .eq("announcement_id", announcementId);

  const readMap = new Map((reads || []).map((r) => [r.user_id, r.read_at]));

  return staff.map((s) => ({
    userId: s.id,
    name: s.name,
    role: s.role,
    hasRead: readMap.has(s.id),
    readAt: readMap.get(s.id) || null,
  }));
}

export async function nudgeUnreadUsers(announcementId: string, userIds: string[]) {
  const supabase = await createSupabaseServerClient();

  // Get announcement title
  const { data: announcement } = await supabase
    .from("announcements")
    .select("title")
    .eq("id", announcementId)
    .single();

  if (!announcement) return;

  // Create reminder notifications for unread users
  const notifications = userIds.map((userId) => ({
    user_id: userId,
    type: "announcement_posted" as const,
    title: `Reminder: ${announcement.title}`,
    body: "You have an unread announcement. Please review it.",
    entity_type: "announcement" as const,
    entity_id: announcementId,
  }));

  await supabase.from("notifications").insert(notifications);
}
```

- [ ] **Step 2: Create the read receipts component**

Create `components/admin/announcement-read-receipts.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { Check, X, Bell } from "lucide-react";
import { toast } from "sonner";
import {
  getAnnouncementReadReceipts,
  nudgeUnreadUsers,
  type ReadReceipt,
} from "@/lib/announcements/read-receipt-actions";

interface AnnouncementReadReceiptsProps {
  announcementId: string;
}

export function AnnouncementReadReceipts({ announcementId }: AnnouncementReadReceiptsProps) {
  const [receipts, setReceipts] = useState<ReadReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [nudging, setNudging] = useState(false);

  useEffect(() => {
    getAnnouncementReadReceipts(announcementId).then((data) => {
      setReceipts(data);
      setLoading(false);
    });
  }, [announcementId]);

  const readCount = receipts.filter((r) => r.hasRead).length;
  const unreadUsers = receipts.filter((r) => !r.hasRead);

  async function handleNudge() {
    setNudging(true);
    await nudgeUnreadUsers(
      announcementId,
      unreadUsers.map((u) => u.userId)
    );
    toast.success(`Reminder sent to ${unreadUsers.length} staff`);
    setNudging(false);
  }

  if (loading) return <div className="animate-pulse h-20 rounded-xl bg-secondary" />;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Read Receipts</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {readCount} of {receipts.length} staff have read this
          </p>
        </div>
        {unreadUsers.length > 0 && (
          <button
            type="button"
            onClick={handleNudge}
            disabled={nudging}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors min-h-[44px]"
          >
            <Bell className="h-3.5 w-3.5" />
            {nudging ? "Sending..." : `Nudge ${unreadUsers.length}`}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--sport-green)] transition-all duration-500"
          style={{ width: `${receipts.length > 0 ? (readCount / receipts.length) * 100 : 0}%` }}
        />
      </div>

      {/* Staff list */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {receipts.map((r) => (
          <div
            key={r.userId}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm"
          >
            <div className="flex items-center gap-2">
              {r.hasRead ? (
                <Check className="h-4 w-4 text-[var(--sport-green)]" />
              ) : (
                <X className="h-4 w-4 text-muted-foreground/40" />
              )}
              <span className={r.hasRead ? "text-foreground" : "text-muted-foreground"}>
                {r.name}
              </span>
              <span className="text-xs text-muted-foreground/60">{r.role}</span>
            </div>
            {r.readAt && (
              <span className="text-xs text-muted-foreground/60">
                {new Date(r.readAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/announcements/read-receipt-actions.ts components/admin/announcement-read-receipts.tsx
git commit -m "feat: announcement read receipts with nudge functionality"
```

---

## Chunk 5: Visual Polish

### Task 11: Empty State Component

**Files:**
- Create: `components/shared/empty-state.tsx`

**Context:** A reusable empty state component with an icon, message, and optional action button. Sport-themed with warm styling matching the design system.

- [ ] **Step 1: Create the empty state component**

Create `components/shared/empty-state.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  Users,
  FileText,
  Receipt,
  MessageSquare,
  ClipboardList,
  Package,
  Bell,
  Search,
  Inbox,
} from "lucide-react";

// Pre-built messages for common empty states
export const EMPTY_STATES = {
  sessions: {
    icon: Calendar,
    title: "No sessions yet",
    description: "Sessions will appear here once the roster is published.",
  },
  staff: {
    icon: Users,
    title: "No staff members",
    description: "Add your first coach to get started.",
  },
  invoices: {
    icon: Receipt,
    title: "No invoices",
    description: "Invoices will appear here once generated.",
  },
  messages: {
    icon: MessageSquare,
    title: "No messages yet",
    description: "Start a conversation to see messages here.",
  },
  forms: {
    icon: ClipboardList,
    title: "No forms submitted",
    description: "Form submissions will appear here.",
  },
  documents: {
    icon: FileText,
    title: "No documents",
    description: "Upload documents to share with your team.",
  },
  equipment: {
    icon: Package,
    title: "No equipment logged",
    description: "Equipment logs will appear here.",
  },
  notifications: {
    icon: Bell,
    title: "All caught up!",
    description: "No new notifications.",
  },
  search: {
    icon: Search,
    title: "No results found",
    description: "Try adjusting your search or filters.",
  },
  default: {
    icon: Inbox,
    title: "Nothing here yet",
    description: "Content will appear here soon.",
  },
} as const;

interface EmptyStateProps {
  preset?: keyof typeof EMPTY_STATES;
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  compact?: boolean;
}

export function EmptyState({
  preset,
  icon: IconOverride,
  title: titleOverride,
  description: descOverride,
  action,
  compact = false,
}: EmptyStateProps) {
  const config = preset ? EMPTY_STATES[preset] : EMPTY_STATES.default;
  const Icon = IconOverride || config.icon;
  const title = titleOverride || config.title;
  const description = descOverride || config.description;

  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-8" : "py-16"}`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/60 mb-4">
        <Icon className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <h3 className={`font-semibold text-foreground ${compact ? "text-sm" : "text-base"}`}>
        {title}
      </h3>
      <p className={`text-muted-foreground mt-1 max-w-xs ${compact ? "text-xs" : "text-sm"}`}>
        {description}
      </p>
      {action && (
        action.href ? (
          <a
            href={action.href}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/shared/empty-state.tsx
git commit -m "feat: add reusable empty state component with presets"
```

---

### Task 12: Dark Mode Toggle

**Files:**
- Modify: `app/layout.tsx`
- Create: `components/shared/theme-toggle.tsx`
- Modify: `components/shared/navigation/user-menu.tsx`

**Context:** Dark mode CSS tokens already exist in `globals.css` under `.dark`. `next-themes` is already installed. We need to: (1) wrap the app in ThemeProvider, (2) add a toggle in the user menu.

- [ ] **Step 1: Add ThemeProvider to root layout**

In `app/layout.tsx`:

```tsx
import { ThemeProvider } from "next-themes";

// Wrap children with ThemeProvider inside PWAProvider:
<PWAProvider>
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <TooltipProvider delay={300}>{children}</TooltipProvider>
    <Toaster position="top-right" richColors closeButton />
  </ThemeProvider>
</PWAProvider>
```

Also remove `suppressHydrationWarning` is not needed since we use `attribute="class"` and `enableSystem={false}`. Actually, add `suppressHydrationWarning` to the `<html>` tag to prevent hydration mismatch:

```tsx
<html
  lang="en-AU"
  className={cn("font-sans", heading.variable, body.variable)}
  suppressHydrationWarning
>
```

- [ ] **Step 2: Create theme toggle component**

Create `components/shared/theme-toggle.tsx`:

```tsx
"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
    >
      {theme === "dark" ? (
        <>
          <Sun className="h-4 w-4 text-muted-foreground" />
          <span>Light mode</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4 text-muted-foreground" />
          <span>Dark mode</span>
        </>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Add toggle to user menu**

In `components/shared/navigation/user-menu.tsx`, import `ThemeToggle` and add it above the "Sign out" button:

```tsx
import { ThemeToggle } from "../theme-toggle";

// Inside the dropdown content, before sign out:
<ThemeToggle />
<div className="h-px bg-border my-1" />
```

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx components/shared/theme-toggle.tsx components/shared/navigation/user-menu.tsx
git commit -m "feat: add dark mode toggle using next-themes"
```

---

### Task 13: Enhanced Skeleton Loading States

**Files:**
- Create: `components/shared/skeleton-patterns.tsx`
- Modify: Select 5-6 loading.tsx files to upgrade from basic to content-aware skeletons

**Context:** The 34 loading.tsx files created during stress testing use basic rectangles. Enhance them with content-aware shapes (round avatars, varied line widths, staggered animations) that better match the content they replace.

- [ ] **Step 1: Create skeleton pattern library**

Create `components/shared/skeleton-patterns.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonStatsRow({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-4 grid-cols-2 md:grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`rounded-2xl border border-border bg-card p-5 space-y-3 animate-pulse stagger-${i + 1}`}>
          <Skeleton className="h-3 w-20 rounded-full" />
          <Skeleton className="h-8 w-16 rounded-lg" />
          <Skeleton className="h-2.5 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-secondary/20 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 rounded-full" style={{ width: `${60 + Math.random() * 60}px` }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`border-b border-border/50 last:border-0 px-4 py-3.5 flex items-center gap-4 animate-pulse stagger-${i + 1}`}>
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          {Array.from({ length: cols - 1 }).map((_, j) => (
            <Skeleton key={j} className="h-3 rounded-full" style={{ width: `${50 + Math.random() * 80}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`rounded-2xl border border-border bg-card p-5 space-y-4 animate-pulse stagger-${i + 1}`}>
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3.5 w-3/4 rounded-full" />
              <Skeleton className="h-2.5 w-1/2 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonPageHeader() {
  return (
    <div className="space-y-2 mb-6 animate-pulse">
      <Skeleton className="h-7 w-48 rounded-lg" />
      <Skeleton className="h-4 w-72 rounded-full" />
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 animate-pulse stagger-${i + 1}`}>
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3 rounded-full" />
            <Skeleton className="h-2.5 w-1/3 rounded-full" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Upgrade admin dashboard loading.tsx**

Update `app/(dashboard)/admin/loading.tsx` to use the new patterns:

```tsx
import { SkeletonPageHeader, SkeletonStatsRow, SkeletonCardGrid } from "@/components/shared/skeleton-patterns";

export default function AdminDashboardLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonStatsRow count={4} />
      <SkeletonCardGrid count={4} />
    </div>
  );
}
```

Apply similar upgrades to:
- `app/(dashboard)/admin/staff/loading.tsx` → `SkeletonPageHeader` + `SkeletonTable`
- `app/(dashboard)/admin/centres/loading.tsx` → `SkeletonPageHeader` + `SkeletonCardGrid`
- `app/(dashboard)/coach/loading.tsx` → `SkeletonPageHeader` + `SkeletonStatsRow` + `SkeletonList`
- `app/(dashboard)/parent/loading.tsx` → `SkeletonPageHeader` + `SkeletonStatsRow` + `SkeletonCardGrid`

- [ ] **Step 3: Commit**

```bash
git add components/shared/skeleton-patterns.tsx app/(dashboard)/admin/loading.tsx app/(dashboard)/admin/staff/loading.tsx app/(dashboard)/admin/centres/loading.tsx app/(dashboard)/coach/loading.tsx app/(dashboard)/parent/loading.tsx
git commit -m "feat: enhanced skeleton loading patterns with content-aware shapes"
```

---

## Summary

| Chunk | Tasks | Files Created | Files Modified |
|-------|-------|--------------|----------------|
| 1: Auth | T1 Keep signed in, T2 Timeout warning | 2 | 3 |
| 2: Navigation | T3 Cmd+K, T4 Quick actions, T5 Recent pages | 4 | 2 |
| 3: Workflow | T6 Coach today, T7 Bulk actions, T8 Inline edit | 3 | 0–1 |
| 4: Notifications | T9 Smart grouping, T10 Read receipts | 2 | 1 |
| 5: Visual | T11 Empty state, T12 Dark mode, T13 Skeletons | 4 | 3–8 |

**Total: ~15 new files, ~9 modified files, 13 commits**

All chunks are independent and can be implemented in parallel by separate agents. No chunk depends on another. Within each chunk, tasks are ordered by dependency (e.g., T5 Recent Pages depends on T3 Command Palette existing).
