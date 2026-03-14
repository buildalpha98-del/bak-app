"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

export interface RecentPage {
  path: string;
  title: string;
  timestamp: number;
}

const STORAGE_KEY = "bak-recent-pages";
const MAX_ITEMS = 8;

const DASHBOARD_PREFIXES = ["/admin", "/ops", "/coach", "/parent"];

// UUID pattern to skip in title generation
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pathToTitle(path: string): string {
  // Remove the role prefix (first two segments like /admin)
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 1) return titleCase(segments[0] || "Dashboard");

  // Skip role prefix, filter UUIDs, format remaining
  const meaningful = segments.slice(1).filter((s) => !UUID_REGEX.test(s));
  if (meaningful.length === 0) return titleCase(segments[0]);

  return meaningful
    .map((s) => titleCase(s.replace(/-/g, " ")))
    .join(" \u203A ");
}

function titleCase(str: string): string {
  return str
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getStoredPages(): RecentPage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function storePages(pages: RecentPage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function useRecentPages() {
  const pathname = usePathname();

  // Track current page
  useEffect(() => {
    if (!pathname) return;
    const isDashboard = DASHBOARD_PREFIXES.some((p) =>
      pathname.startsWith(p)
    );
    if (!isDashboard) return;

    const pages = getStoredPages();
    const title = pathToTitle(pathname);

    // Remove existing entry for this path
    const filtered = pages.filter((p) => p.path !== pathname);

    // Add to front
    const updated = [
      { path: pathname, title, timestamp: Date.now() },
      ...filtered,
    ].slice(0, MAX_ITEMS);

    storePages(updated);
  }, [pathname]);

  const getRecentPages = useCallback((): RecentPage[] => {
    return getStoredPages();
  }, []);

  return { getRecentPages };
}
