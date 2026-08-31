"use client";

// Self-guided tour for /demo/school visitors — principals clicking the
// proposal link with nobody walking them through it. A floating
// checklist deep-links the portal's highlights, ticks items off as the
// visitor reaches each page, and ends on a "talk to us" nudge. Shown
// ONLY to the demo viewer account (never real clients, never the
// primary tester), mounted once in ClientShell so it survives
// navigation. Progress lives in localStorage — every visitor arrives
// as the same portal user, but each browser keeps its own progress.

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Compass, Check, ChevronDown, X, ArrowRight } from "lucide-react";

const STORAGE_KEY = "bak-demo-guide-v1";

interface GuideStop {
  key: string;
  title: string;
  detail: string;
  /** Where the item's link goes (appended to /client/<centreId>). */
  href: string;
  /** Marks the stop done when the pathname matches. */
  done: (path: string) => boolean;
}

const UUID = "[0-9a-f-]{36}";

const STOPS: GuideStop[] = [
  {
    key: "students",
    title: "Open a student's page",
    detail: "Pick anyone from a class — attendance, skill marks, progression and AI insights per child.",
    href: "/children",
    done: (p) => new RegExp(`/children/${UUID}`).test(p),
  },
  {
    key: "report-card",
    title: "Download a report card",
    detail: 'Hit "Student report" on their page — NSW-scale marks with term-over-term movement, ready for families.',
    href: "/children",
    // Downloads don't change the URL — a click listener marks this one.
    done: () => false,
  },
  {
    key: "session",
    title: "See this week's session plan",
    detail: "Open the next session — the full program for the day is one click away.",
    href: "/schedule",
    done: (p) => new RegExp(`/schedule/${UUID}`).test(p),
  },
  {
    key: "curriculum",
    title: "Scope & Sequence",
    detail: "Every session mapped to NSW PDHPE outcomes — programming meetings get easy.",
    href: "/curriculum",
    done: (p) => p.endsWith("/curriculum"),
  },
  {
    key: "coaches",
    title: "Meet the coaches",
    detail: "WWCC and First Aid verification, visible any time.",
    href: "/staff",
    done: (p) => p.endsWith("/staff"),
  },
  {
    key: "reports",
    title: "Open the term report",
    detail: "What lands in your inbox at the end of every term.",
    href: "/reports",
    done: (p) => p.endsWith("/reports"),
  },
];

interface StoredState {
  dismissed?: boolean;
  collapsed?: boolean;
  visited?: string[];
}

function load(): StoredState {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function save(state: StoredState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private-mode storage failures just mean no persistence.
  }
}

export function DemoGuide({ centreId }: { centreId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  // Render nothing until mounted — localStorage is browser-only and
  // reading it during SSR/hydration would mismatch.
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [visited, setVisited] = useState<Set<string>>(new Set());

  useEffect(() => {
    const s = load();
    setDismissed(!!s.dismissed);
    setCollapsed(!!s.collapsed);
    setVisited(new Set(s.visited ?? []));
    setMounted(true);
  }, []);

  // The report-card stop is a download, not a navigation — watch for
  // clicks on any student-report link anywhere in the portal.
  useEffect(() => {
    if (!mounted) return;
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('a[href*="student-report-pdf"]')) {
        setVisited((prev) => {
          if (prev.has("report-card")) return prev;
          const next = new Set(prev);
          next.add("report-card");
          save({ ...load(), visited: Array.from(next) });
          return next;
        });
      }
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [mounted]);

  // Tick stops off as the visitor reaches each page.
  useEffect(() => {
    if (!mounted) return;
    const newlyDone = STOPS.filter(
      (s) => !visited.has(s.key) && s.done(pathname)
    );
    if (newlyDone.length === 0) return;
    const next = new Set(visited);
    for (const s of newlyDone) next.add(s.key);
    setVisited(next);
    save({ ...load(), visited: Array.from(next) });
  }, [pathname, mounted, visited]);

  if (!mounted || dismissed) return null;

  const doneCount = STOPS.filter((s) => visited.has(s.key)).length;
  const allDone = doneCount === STOPS.length;

  function toggleCollapsed() {
    setCollapsed((c) => {
      save({ ...load(), collapsed: !c });
      return !c;
    });
  }

  function dismiss() {
    setDismissed(true);
    save({ ...load(), dismissed: true });
  }

  // Collapsed: a small progress pill that stays out of the way.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        className="fixed bottom-20 right-4 z-40 flex min-h-[44px] items-center gap-2 rounded-full bg-[#0891B2] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105 md:bottom-6"
        aria-label="Open the demo guide"
      >
        <Compass className="h-4 w-4" />
        Demo guide · {doneCount}/{STOPS.length}
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-20 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-[#0891B2]/20 bg-card shadow-2xl md:bottom-6"
      aria-label="Demo guide"
    >
      <div className="flex items-center justify-between gap-2 bg-[#0891B2] px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 shrink-0" />
          <p className="text-sm font-semibold">
            {allDone ? "You've seen the highlights" : "Six things to try"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded-full p-1.5 hover:bg-white/15"
            aria-label="Minimise the demo guide"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-1.5 hover:bg-white/15"
            aria-label="Close the demo guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="max-h-[50vh] overflow-y-auto p-2">
        {!allDone && (
          <p className="px-2 pb-1 pt-1 text-xs text-muted-foreground">
            You&apos;re exploring a live demo school — everything here is what
            your school would see. Worth two minutes:
          </p>
        )}
        <ul>
          {STOPS.map((stop, i) => {
            const done = visited.has(stop.key);
            return (
              <li key={stop.key}>
                <button
                  type="button"
                  onClick={() => router.push(`/client/${centreId}${stop.href}`)}
                  className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60"
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      done
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-[#0891B2]/10 text-[#0891B2]"
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-sm font-medium ${
                        done ? "text-muted-foreground line-through" : "text-foreground"
                      }`}
                    >
                      {stop.title}
                    </span>
                    {!done && (
                      <span className="block text-xs text-muted-foreground">
                        {stop.detail}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {allDone && (
          <div className="m-2 rounded-xl bg-[#0891B2]/5 p-3">
            <p className="text-sm font-medium text-foreground">
              This is what your school gets from week one.
            </p>
            <a
              href="https://buildalphakids.app/enquire"
              className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl bg-[#0891B2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0891B2]/90"
            >
              Talk to Build Alpha Kids
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>

    </aside>
  );
}
