import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPublishedPosts, getPostBySlug } from "../blog";

// vi.hoisted so this reference exists before the hoisted vi.mock factory runs.
const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }));

// Overrides the global admin mock in tests/setup.ts for this file.
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => supabaseMock,
}));

// ------------------------------------------------------------
// A fake that actually filters
// ------------------------------------------------------------
//
// The mock below EXECUTES the query it is handed — eq/lte really
// filter, order really sorts, limit really truncates — against seeded
// rows. That is the point: a mock returning canned data would pass
// just as happily with `.eq("status", "published")` deleted from
// blog.ts, and the test would be worthless. Here, deleting a filter
// lets a draft through and the assertion fails.
//
// Routing is input-based on the table name — never
// mockResolvedValueOnce chains, which leak ordering between tests.

type Row = Record<string, unknown>;

interface FilterCall {
  op: string;
  column: string;
  value: unknown;
}

interface Harness {
  /** Every eq/lte the code under test applied, in order. */
  filters: FilterCall[];
  /** The column list passed to .select(). */
  selected: string | null;
}

function setupTable(rows: Row[], state: { error?: { message: string } } = {}): Harness {
  const harness: Harness = { filters: [], selected: null };

  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "blog_posts") throw new Error(`Unexpected table: ${table}`);

    let working = [...rows];
    let orderKey: string | null = null;
    let ascending = true;
    let limitN: number | null = null;

    const finalise = (): Row[] => {
      let out = [...working];
      if (orderKey) {
        const key = orderKey;
        out.sort((a, b) => {
          const av = a[key] as string | null;
          const bv = b[key] as string | null;
          // ISO-8601 strings sort chronologically as plain strings.
          const cmp =
            av == null ? (bv == null ? 0 : -1) : bv == null ? 1 : av < bv ? -1 : av > bv ? 1 : 0;
          return ascending ? cmp : -cmp;
        });
      }
      if (limitN != null) out = out.slice(0, limitN);
      return out;
    };

    const builder = {
      select(columns: string) {
        harness.selected = columns;
        return builder;
      },
      eq(column: string, value: unknown) {
        harness.filters.push({ op: "eq", column, value });
        working = working.filter((r) => r[column] === value);
        return builder;
      },
      lte(column: string, value: string) {
        harness.filters.push({ op: "lte", column, value });
        // Mirrors SQL: `NULL <= x` is NULL, not true, so null drops out.
        working = working.filter((r) => r[column] != null && (r[column] as string) <= value);
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderKey = column;
        ascending = options?.ascending ?? true;
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      maybeSingle() {
        if (state.error) return Promise.resolve({ data: null, error: state.error });
        const out = finalise();
        // Faithful to PostgREST: maybeSingle errors on multiple rows.
        if (out.length > 1) {
          return Promise.resolve({ data: null, error: { message: "multiple rows returned" } });
        }
        return Promise.resolve({ data: out[0] ?? null, error: null });
      },
      // Thenable so `await query` resolves the list form.
      then<T>(
        onFulfilled: (value: { data: Row[] | null; error: unknown }) => T
      ): Promise<T> {
        const result = state.error
          ? { data: null, error: state.error }
          : { data: finalise(), error: null };
        return Promise.resolve(result).then(onFulfilled);
      },
    };

    return builder;
  });

  return harness;
}

// ------------------------------------------------------------
// Fixtures — "now" is frozen at 2026-07-15T02:00:00Z
// ------------------------------------------------------------

const NOW = new Date("2026-07-15T02:00:00Z");

function post(overrides: Partial<Row> & { slug: string }): Row {
  return {
    id: `id-${overrides.slug}`,
    title: `Title ${overrides.slug}`,
    excerpt: null,
    content: "body",
    cover_image_url: null,
    status: "published",
    published_at: "2026-07-01T00:00:00Z",
    author_name: "Build Alpha Kids",
    tags: [],
    seo_title: null,
    seo_description: null,
    ...overrides,
  };
}

const PUBLISHED = post({ slug: "live-post" });
const DRAFT = post({ slug: "draft-post", status: "draft" });
const FUTURE = post({ slug: "scheduled-post", published_at: "2026-08-01T00:00:00Z" });
const NO_DATE = post({ slug: "no-date-post", published_at: null });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const slugsOf = (rows: { slug: string }[]) => rows.map((r) => r.slug);

// ------------------------------------------------------------
// getPublishedPosts — visibility gate
// ------------------------------------------------------------

describe("getPublishedPosts — visibility", () => {
  it("excludes drafts", async () => {
    setupTable([PUBLISHED, DRAFT]);
    expect(slugsOf(await getPublishedPosts())).toEqual(["live-post"]);
  });

  it("excludes posts scheduled for the future", async () => {
    setupTable([PUBLISHED, FUTURE]);
    expect(slugsOf(await getPublishedPosts())).toEqual(["live-post"]);
  });

  it("excludes a published post with no publication date", async () => {
    setupTable([PUBLISHED, NO_DATE]);
    expect(slugsOf(await getPublishedPosts())).toEqual(["live-post"]);
  });

  it("includes a post published exactly at the current instant", async () => {
    const boundary = post({ slug: "boundary", published_at: NOW.toISOString() });
    setupTable([boundary]);
    expect(slugsOf(await getPublishedPosts())).toEqual(["boundary"]);
  });

  it("excludes a post published one millisecond from now", async () => {
    const justAfter = post({
      slug: "just-after",
      published_at: new Date(NOW.getTime() + 1).toISOString(),
    });
    setupTable([justAfter]);
    expect(await getPublishedPosts()).toEqual([]);
  });

  it("returns an empty list rather than throwing when nothing is public", async () => {
    setupTable([DRAFT, FUTURE, NO_DATE]);
    expect(await getPublishedPosts()).toEqual([]);
  });
});

// ------------------------------------------------------------
// getPublishedPosts — ordering, limit, columns
// ------------------------------------------------------------

describe("getPublishedPosts — ordering", () => {
  it("orders by published_at descending, newest first", async () => {
    setupTable([
      post({ slug: "older", published_at: "2026-05-01T00:00:00Z" }),
      post({ slug: "newest", published_at: "2026-07-10T00:00:00Z" }),
      post({ slug: "middle", published_at: "2026-06-01T00:00:00Z" }),
    ]);
    expect(slugsOf(await getPublishedPosts())).toEqual(["newest", "middle", "older"]);
  });
});

describe("getPublishedPosts — limit", () => {
  const many = [
    post({ slug: "p1", published_at: "2026-07-01T00:00:00Z" }),
    post({ slug: "p2", published_at: "2026-07-02T00:00:00Z" }),
    post({ slug: "p3", published_at: "2026-07-03T00:00:00Z" }),
    post({ slug: "p4", published_at: "2026-07-04T00:00:00Z" }),
  ];

  it("returns at most `limit` posts", async () => {
    setupTable(many);
    expect(await getPublishedPosts(2)).toHaveLength(2);
  });

  it("keeps the newest when limiting, not an arbitrary slice", async () => {
    setupTable(many);
    expect(slugsOf(await getPublishedPosts(2))).toEqual(["p4", "p3"]);
  });

  it("returns everything public when no limit is given", async () => {
    setupTable(many);
    expect(await getPublishedPosts()).toHaveLength(4);
  });

  it("applies the limit after the visibility gate, so drafts never consume a slot", async () => {
    setupTable([DRAFT, FUTURE, PUBLISHED]);
    expect(slugsOf(await getPublishedPosts(2))).toEqual(["live-post"]);
  });
});

describe("getPublishedPosts — query shape", () => {
  it("reads from blog_posts", async () => {
    setupTable([PUBLISHED]);
    await getPublishedPosts();
    expect(supabaseMock.from).toHaveBeenCalledWith("blog_posts");
  });

  it("does not fetch the post body for the list view", async () => {
    const harness = setupTable([PUBLISHED]);
    await getPublishedPosts();
    expect(harness.selected).not.toContain("content");
  });

  it("gates published_at against the UTC instant, not a Sydney calendar date", async () => {
    // The Sydney-day rule is for DATE columns (clinics). published_at is
    // a timestamptz: a date-only bound would shift the gate by hours and
    // publish scheduled posts early.
    const harness = setupTable([PUBLISHED]);
    await getPublishedPosts();

    const bound = harness.filters.find((f) => f.op === "lte" && f.column === "published_at");
    expect(bound?.value).toBe("2026-07-15T02:00:00.000Z");
  });

  it("propagates a query error instead of silently returning an empty list", async () => {
    setupTable([PUBLISHED], { error: { message: "connection reset" } });
    await expect(getPublishedPosts()).rejects.toMatchObject({ message: "connection reset" });
  });
});

// ------------------------------------------------------------
// getPostBySlug
// ------------------------------------------------------------

describe("getPostBySlug", () => {
  it("returns the post for a published slug", async () => {
    setupTable([PUBLISHED, DRAFT]);
    const found = await getPostBySlug("live-post");
    expect(found?.slug).toBe("live-post");
  });

  it("includes the body and SEO fields", async () => {
    const harness = setupTable([PUBLISHED]);
    const found = await getPostBySlug("live-post");
    expect(harness.selected).toContain("content");
    expect(found?.content).toBe("body");
  });

  it("returns null for a slug that does not exist", async () => {
    setupTable([PUBLISHED]);
    expect(await getPostBySlug("nope")).toBeNull();
  });

  it("returns null for a draft slug rather than the row", async () => {
    // A guessed draft URL must 404, not render unpublished work.
    setupTable([DRAFT]);
    expect(await getPostBySlug("draft-post")).toBeNull();
  });

  it("returns null for a slug scheduled for the future", async () => {
    setupTable([FUTURE]);
    expect(await getPostBySlug("scheduled-post")).toBeNull();
  });

  it("returns null for a published slug with no publication date", async () => {
    setupTable([NO_DATE]);
    expect(await getPostBySlug("no-date-post")).toBeNull();
  });

  it("does not leak a draft when a published post exists alongside it", async () => {
    setupTable([PUBLISHED, DRAFT]);
    expect(await getPostBySlug("draft-post")).toBeNull();
  });

  it("matches the slug exactly rather than by prefix", async () => {
    setupTable([PUBLISHED]);
    expect(await getPostBySlug("live")).toBeNull();
  });

  it("gates published_at against the UTC instant", async () => {
    const harness = setupTable([PUBLISHED]);
    await getPostBySlug("live-post");

    const bound = harness.filters.find((f) => f.op === "lte" && f.column === "published_at");
    expect(bound?.value).toBe("2026-07-15T02:00:00.000Z");
  });

  it("propagates a query error instead of returning null", async () => {
    setupTable([PUBLISHED], { error: { message: "connection reset" } });
    await expect(getPostBySlug("live-post")).rejects.toMatchObject({
      message: "connection reset",
    });
  });
});
