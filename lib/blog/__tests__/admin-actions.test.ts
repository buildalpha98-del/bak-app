import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// These actions are "use server" exports — public POST endpoints — and
// they write the content that ends up on the public site. Middleware's
// role check is a cached routing hint, not an authorisation boundary,
// so requireAdmin() in admin-actions.ts is the real gate. Half of this
// file exists to keep it that way.

const { serverMock } = vi.hoisted(() => ({
  serverMock: { auth: { getUser: vi.fn() }, from: vi.fn() },
}));

// Overrides the global mocks in tests/setup.ts for this file.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => serverMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listPostsForAdmin,
  getPostForEdit,
  createPost,
  updatePost,
  setPostStatus,
} from "../admin-actions";

// ------------------------------------------------------------
// A fake that actually writes
// ------------------------------------------------------------
//
// Same principle as lib/marketing/__tests__/blog.test.ts: the builder
// EXECUTES what it is handed against an in-memory table. insert really
// appends, update really mutates the row, eq really filters, and the
// slug UNIQUE constraint from migration 070 is really enforced.
//
// Canned { data, error } would make most of this file vacuous — the
// "publish doesn't clobber published_at" test would pass just as
// happily with the `=== null` check deleted, because nothing would be
// reading the row back. Here, deleting it overwrites the seeded date
// and the assertion fails.
//
// Routing is input-based on the table name — never
// mockResolvedValueOnce chains, which leak ordering between tests.

type Row = Record<string, unknown>;

interface QueryError {
  code?: string;
  message: string;
}

interface Harness {
  /** Live view of the table, post-write. */
  rows: () => Row[];
  /** Table names the code under test queried, in order. */
  tables: string[];
}

const SLUG_CONFLICT: QueryError = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "blog_posts_slug_key"',
};

function setup(state: {
  user?: { id: string } | null;
  role?: string | null;
  rows?: Row[];
  /** Forces a failure on blog_posts reads. */
  readError?: QueryError;
  /** Forces a failure on blog_posts writes. */
  writeError?: QueryError;
}): Harness {
  const table: Row[] = (state.rows ?? []).map((r) => ({ ...r }));
  const harness: Harness = { rows: () => table, tables: [] };
  let nextId = table.length + 1;

  serverMock.auth.getUser.mockResolvedValue({
    data: { user: state.user ?? null },
    error: null,
  });

  serverMock.from.mockImplementation((tableName: string) => {
    harness.tables.push(tableName);

    if (tableName === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: state.role ? { role: state.role } : null,
                error: null,
              }),
          }),
        }),
      };
    }

    if (tableName !== "blog_posts") {
      throw new Error(`Unexpected table: ${tableName}`);
    }

    let mode: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    const filters: { column: string; value: unknown }[] = [];
    let orderKey: string | null = null;
    let ascending = true;

    const matches = (r: Row) => filters.every((f) => r[f.column] === f.value);

    const run = (): { data: Row[] | null; error: QueryError | null } => {
      if (mode === "select") {
        if (state.readError) return { data: null, error: state.readError };
        let out = table.filter(matches);
        if (orderKey) {
          const key = orderKey;
          out = [...out].sort((a, b) => {
            const av = a[key] as string | null;
            const bv = b[key] as string | null;
            const cmp =
              av == null
                ? bv == null
                  ? 0
                  : -1
                : bv == null
                  ? 1
                  : av < bv
                    ? -1
                    : av > bv
                      ? 1
                      : 0;
            return ascending ? cmp : -cmp;
          });
        }
        return { data: out, error: null };
      }

      if (mode === "insert") {
        if (state.writeError) return { data: null, error: state.writeError };
        // blog_posts.slug is UNIQUE (migration 070).
        if (table.some((r) => r.slug === payload.slug)) {
          return { data: null, error: SLUG_CONFLICT };
        }
        const row: Row = {
          id: `generated-${nextId++}`,
          status: "draft",
          published_at: null,
          author_name: "Build Alpha Kids",
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...payload,
        };
        table.push(row);
        return { data: [row], error: null };
      }

      // update
      if (state.writeError) return { data: null, error: state.writeError };
      const targets = table.filter(matches);
      if (
        payload.slug !== undefined &&
        table.some((r) => r.slug === payload.slug && !targets.includes(r))
      ) {
        return { data: null, error: SLUG_CONFLICT };
      }
      targets.forEach((r) => Object.assign(r, payload));
      return { data: targets, error: null };
    };

    const builder = {
      select() {
        return builder;
      },
      insert(values: Row) {
        mode = "insert";
        payload = values;
        return builder;
      },
      update(values: Row) {
        mode = "update";
        payload = values;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, value });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderKey = column;
        ascending = options?.ascending ?? true;
        return builder;
      },
      single() {
        const { data, error } = run();
        if (error) return Promise.resolve({ data: null, error });
        return Promise.resolve({ data: data?.[0] ?? null, error: null });
      },
      maybeSingle() {
        const { data, error } = run();
        if (error) return Promise.resolve({ data: null, error });
        return Promise.resolve({ data: data?.[0] ?? null, error: null });
      },
      then<T>(onFulfilled: (v: { data: Row[] | null; error: unknown }) => T): Promise<T> {
        return Promise.resolve(run()).then(onFulfilled);
      },
    };

    return builder;
  });

  return harness;
}

// ------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------

const NOW = new Date("2026-07-15T02:00:00Z");
const ADMIN = { user: { id: "u1" }, role: "admin" };

function post(over: Partial<Row> & { id: string; slug: string }): Row {
  return {
    title: `Title ${over.slug}`,
    excerpt: null,
    content: "body",
    cover_image_url: null,
    status: "draft",
    published_at: null,
    author_name: "Build Alpha Kids",
    tags: [],
    seo_title: null,
    seo_description: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

/** A complete, valid editor payload. */
function input(over: Record<string, unknown> = {}) {
  return {
    title: "Why Kids Need Sport",
    slug: "why-kids-need-sport",
    excerpt: "A short intro.",
    content: "# Heading\n\nSome body copy.",
    cover_image_url: "",
    seo_title: "",
    seo_description: "",
    tags: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ------------------------------------------------------------
// Auth guard
// ------------------------------------------------------------

describe("admin blog actions — auth guard", () => {
  const cases = [
    {
      name: "listPostsForAdmin",
      call: () => listPostsForAdmin(),
    },
    { name: "getPostForEdit", call: () => getPostForEdit("p1") },
    { name: "createPost", call: () => createPost(input()) },
    { name: "updatePost", call: () => updatePost("p1", input()) },
    { name: "setPostStatus", call: () => setPostStatus("p1", "published") },
  ];

  describe.each(cases)("$name", ({ call }) => {
    it("rejects an unauthenticated caller and never touches blog_posts", async () => {
      const h = setup({ user: null, rows: [post({ id: "p1", slug: "a" })] });
      const res = await call();

      expect(res.error).toBe("Not authenticated");
      expect(h.tables).not.toContain("blog_posts");
    });

    it("rejects a caller with no staff profile", async () => {
      const h = setup({
        user: { id: "u1" },
        role: null,
        rows: [post({ id: "p1", slug: "a" })],
      });
      const res = await call();

      expect(res.error).toBe("Forbidden");
      expect(h.tables).not.toContain("blog_posts");
    });

    // ops has no /admin access at all per middleware's ROLE_ROUTES, so
    // these actions must not be a side door around that.
    it.each(["ops", "coach", "parent"])("rejects role %s", async (role) => {
      const h = setup({
        user: { id: "u1" },
        role,
        rows: [post({ id: "p1", slug: "a" })],
      });
      const res = await call();

      expect(res.error).toBe("Forbidden");
      expect(h.tables).not.toContain("blog_posts");
    });
  });

  it("does not write a post for a non-admin", async () => {
    const h = setup({ user: { id: "u1" }, role: "coach", rows: [] });
    await createPost(input());
    expect(h.rows()).toHaveLength(0);
  });

  it("does not publish a post for a non-admin", async () => {
    const h = setup({
      user: { id: "u1" },
      role: "ops",
      rows: [post({ id: "p1", slug: "a", status: "draft" })],
    });
    await setPostStatus("p1", "published");
    expect(h.rows()[0].status).toBe("draft");
  });
});

// ------------------------------------------------------------
// listPostsForAdmin
// ------------------------------------------------------------

describe("listPostsForAdmin", () => {
  it("includes drafts — the whole point of not reusing getPublishedPosts", async () => {
    setup({
      ...ADMIN,
      rows: [
        post({ id: "p1", slug: "live", status: "published", published_at: "2026-07-01T00:00:00Z" }),
        post({ id: "p2", slug: "draft", status: "draft" }),
      ],
    });
    const { data } = await listPostsForAdmin();
    expect(data.map((p) => p.slug).sort()).toEqual(["draft", "live"]);
  });

  it("includes a post scheduled for the future, which the public list hides", async () => {
    setup({
      ...ADMIN,
      rows: [
        post({
          id: "p1",
          slug: "scheduled",
          status: "published",
          published_at: "2026-08-01T00:00:00Z",
        }),
      ],
    });
    const { data } = await listPostsForAdmin();
    expect(data).toHaveLength(1);
  });

  it("orders newest first by created_at, so new drafts surface at the top", async () => {
    setup({
      ...ADMIN,
      rows: [
        post({ id: "p1", slug: "older", created_at: "2026-05-01T00:00:00Z" }),
        post({ id: "p2", slug: "newest", created_at: "2026-07-10T00:00:00Z" }),
        post({ id: "p3", slug: "middle", created_at: "2026-06-01T00:00:00Z" }),
      ],
    });
    const { data } = await listPostsForAdmin();
    expect(data.map((p) => p.slug)).toEqual(["newest", "middle", "older"]);
  });

  it("returns an empty list, not an error, when there are no posts", async () => {
    setup({ ...ADMIN, rows: [] });
    expect(await listPostsForAdmin()).toEqual({ data: [], error: null });
  });

  it("degrades to a friendly error when the table is unreachable", async () => {
    // The real shape of the unapplied-migration case.
    setup({
      ...ADMIN,
      readError: { message: 'relation "blog_posts" does not exist' },
    });
    const { data, error } = await listPostsForAdmin();

    expect(data).toEqual([]);
    expect(error).toBe("Could not load blog posts.");
    // The driver's message must not reach the operator's screen.
    expect(error).not.toContain("relation");
  });
});

// ------------------------------------------------------------
// getPostForEdit
// ------------------------------------------------------------

describe("getPostForEdit", () => {
  it("returns a draft — getPostBySlug would return null here", async () => {
    setup({ ...ADMIN, rows: [post({ id: "p1", slug: "draft-post", status: "draft" })] });
    const { data } = await getPostForEdit("p1");
    expect(data?.slug).toBe("draft-post");
  });

  it("returns null for an id that does not exist", async () => {
    setup({ ...ADMIN, rows: [post({ id: "p1", slug: "a" })] });
    expect(await getPostForEdit("nope")).toEqual({ data: null, error: null });
  });

  it("matches on id exactly rather than returning the first row", async () => {
    setup({
      ...ADMIN,
      rows: [post({ id: "p1", slug: "a" }), post({ id: "p2", slug: "b" })],
    });
    const { data } = await getPostForEdit("p2");
    expect(data?.slug).toBe("b");
  });
});

// ------------------------------------------------------------
// createPost
// ------------------------------------------------------------

describe("createPost", () => {
  it("writes the post and returns its id", async () => {
    const h = setup({ ...ADMIN, rows: [] });
    const { data, error } = await createPost(input());

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    expect(h.rows()).toHaveLength(1);
    expect(h.rows()[0]).toMatchObject({
      title: "Why Kids Need Sport",
      slug: "why-kids-need-sport",
      excerpt: "A short intro.",
      content: "# Heading\n\nSome body copy.",
    });
  });

  it("always creates a draft, never a published post", async () => {
    // A new post must not reach the public site on a Save mis-click.
    const h = setup({ ...ADMIN, rows: [] });
    await createPost(input({ status: "published", published_at: NOW.toISOString() }));

    expect(h.rows()[0].status).toBe("draft");
    expect(h.rows()[0].published_at).toBeNull();
  });

  it("stores blank optional fields as NULL, not empty strings", async () => {
    const h = setup({ ...ADMIN, rows: [] });
    await createPost(input({ excerpt: "", cover_image_url: "", seo_title: "" }));

    expect(h.rows()[0].excerpt).toBeNull();
    expect(h.rows()[0].cover_image_url).toBeNull();
    expect(h.rows()[0].seo_title).toBeNull();
  });

  it("derives a clean slug from a hand-edited one", async () => {
    const h = setup({ ...ADMIN, rows: [] });
    await createPost(input({ slug: "  Why Kids NEED Sport!! " }));
    expect(h.rows()[0].slug).toBe("why-kids-need-sport");
  });

  it("accepts an empty body — a titled draft is a legitimate starting point", async () => {
    const h = setup({ ...ADMIN, rows: [] });
    const { error } = await createPost(input({ content: "" }));

    expect(error).toBeNull();
    expect(h.rows()[0].content).toBe("");
  });

  it("trims and dedupes tags", async () => {
    const h = setup({ ...ADMIN, rows: [] });
    await createPost(input({ tags: [" sport ", "sport", "kids", ""] }));
    expect(h.rows()[0].tags).toEqual(["sport", "kids"]);
  });
});

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

describe("createPost — validation", () => {
  const bad: [string, Record<string, unknown>, string][] = [
    ["an empty title", { title: "" }, "Title is required."],
    ["a whitespace-only title", { title: "   " }, "Title is required."],
    ["a slug with no alphanumerics", { slug: "!!!" }, "Slug is required, and must contain at least one letter or number."],
    ["an over-long title", { title: "x".repeat(201) }, "Title must be 200 characters or fewer."],
    ["an over-long excerpt", { excerpt: "x".repeat(501) }, "Excerpt must be 500 characters or fewer."],
    ["an over-long SEO title", { seo_title: "x".repeat(71) }, "SEO title must be 70 characters or fewer."],
    ["a non-http cover image URL", { cover_image_url: "javascript:alert(1)" }, "Cover image URL must start with http:// or https://"],
    ["a non-string title", { title: 42 }, "Invalid title."],
    ["tags that are not an array", { tags: "sport" }, "Invalid tags."],
    ["too many tags", { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, "A post can have at most 10 tags."],
  ];

  it.each(bad)("rejects %s and writes nothing", async (_name, over, message) => {
    const h = setup({ ...ADMIN, rows: [] });
    const { data, error } = await createPost(input(over));

    expect(error).toBe(message);
    expect(data).toBeNull();
    expect(h.rows()).toHaveLength(0);
  });

  it("rejects a payload that is not an object at all", async () => {
    const h = setup({ ...ADMIN, rows: [] });
    expect((await createPost("nonsense")).error).toBe("Invalid request.");
    expect((await createPost(null)).error).toBe("Invalid request.");
    expect(h.rows()).toHaveLength(0);
  });

  it("validates on update too, not just create", async () => {
    const h = setup({ ...ADMIN, rows: [post({ id: "p1", slug: "original" })] });
    const { error } = await updatePost("p1", input({ title: "" }));

    expect(error).toBe("Title is required.");
    expect(h.rows()[0].slug).toBe("original");
  });
});

// ------------------------------------------------------------
// Slug collisions
// ------------------------------------------------------------

describe("slug uniqueness", () => {
  it("surfaces a create collision as a friendly error, not a Postgres one", async () => {
    setup({ ...ADMIN, rows: [post({ id: "p1", slug: "why-kids-need-sport" })] });
    const { data, error } = await createPost(input({ slug: "why-kids-need-sport" }));

    expect(data).toBeNull();
    expect(error).toBe(
      "That slug is already used by another post. Try a different one."
    );
    expect(error).not.toContain("duplicate key");
    expect(error).not.toContain("blog_posts_slug_key");
  });

  it("surfaces an update collision the same way", async () => {
    setup({
      ...ADMIN,
      rows: [post({ id: "p1", slug: "taken" }), post({ id: "p2", slug: "mine" })],
    });
    const { error } = await updatePost("p2", input({ slug: "taken" }));

    expect(error).toBe(
      "That slug is already used by another post. Try a different one."
    );
  });

  it("lets a post keep its own slug on update", async () => {
    // The collision check must compare against OTHER rows, or every
    // save of an unchanged slug would fail.
    const h = setup({ ...ADMIN, rows: [post({ id: "p1", slug: "mine" })] });
    const { error } = await updatePost("p1", input({ slug: "mine", title: "New title" }));

    expect(error).toBeNull();
    expect(h.rows()[0].title).toBe("New title");
  });

  it("catches a collision created by differing capitalisation", async () => {
    // slugify lowercases, so "Taken" and "taken" are the same slug.
    setup({ ...ADMIN, rows: [post({ id: "p1", slug: "taken" })] });
    const { error } = await createPost(input({ slug: "TAKEN" }));

    expect(error).toBe(
      "That slug is already used by another post. Try a different one."
    );
  });

  it("reports a non-collision write failure generically", async () => {
    setup({
      ...ADMIN,
      rows: [],
      writeError: { code: "08006", message: "connection failure" },
    });
    const { error } = await createPost(input());

    expect(error).toBe("Could not save the post. Please try again.");
    expect(error).not.toContain("connection failure");
  });
});

// ------------------------------------------------------------
// Publishing
// ------------------------------------------------------------

describe("setPostStatus — publish", () => {
  it("stamps published_at when it is null", async () => {
    const h = setup({
      ...ADMIN,
      rows: [post({ id: "p1", slug: "a", status: "draft", published_at: null })],
    });
    const { data, error } = await setPostStatus("p1", "published");

    expect(error).toBeNull();
    expect(h.rows()[0].status).toBe("published");
    expect(h.rows()[0].published_at).toBe("2026-07-15T02:00:00.000Z");
    expect(data?.published_at).toBe("2026-07-15T02:00:00.000Z");
  });

  it("does NOT overwrite an existing published_at on re-publish", async () => {
    // published_at is the post's public date and the blog's sort key.
    // Resetting it on every republish would silently re-date and
    // reorder old posts whenever someone fixed a typo.
    const original = "2026-01-01T00:00:00Z";
    const h = setup({
      ...ADMIN,
      rows: [post({ id: "p1", slug: "a", status: "draft", published_at: original })],
    });
    const { data } = await setPostStatus("p1", "published");

    expect(h.rows()[0].status).toBe("published");
    expect(h.rows()[0].published_at).toBe(original);
    expect(data?.published_at).toBe(original);
  });

  it("keeps published_at when unpublishing, so a republish restores the date", async () => {
    const original = "2026-01-01T00:00:00Z";
    const h = setup({
      ...ADMIN,
      rows: [post({ id: "p1", slug: "a", status: "published", published_at: original })],
    });
    await setPostStatus("p1", "draft");

    expect(h.rows()[0].status).toBe("draft");
    expect(h.rows()[0].published_at).toBe(original);
  });

  it("round-trips unpublish → republish without moving the date", async () => {
    const original = "2026-01-01T00:00:00Z";
    const h = setup({
      ...ADMIN,
      rows: [post({ id: "p1", slug: "a", status: "published", published_at: original })],
    });
    await setPostStatus("p1", "draft");
    await setPostStatus("p1", "published");

    expect(h.rows()[0].status).toBe("published");
    expect(h.rows()[0].published_at).toBe(original);
  });

  it("never stamps published_at when moving to draft", async () => {
    const h = setup({
      ...ADMIN,
      rows: [post({ id: "p1", slug: "a", status: "draft", published_at: null })],
    });
    await setPostStatus("p1", "draft");
    expect(h.rows()[0].published_at).toBeNull();
  });

  it("only touches the targeted post", async () => {
    const h = setup({
      ...ADMIN,
      rows: [
        post({ id: "p1", slug: "a", status: "draft" }),
        post({ id: "p2", slug: "b", status: "draft" }),
      ],
    });
    await setPostStatus("p1", "published");

    expect(h.rows().find((r) => r.id === "p2")?.status).toBe("draft");
  });

  it("rejects a status outside the CHECK constraint", async () => {
    const h = setup({ ...ADMIN, rows: [post({ id: "p1", slug: "a", status: "draft" })] });
    const { error } = await setPostStatus(
      "p1",
      "archived" as unknown as "draft"
    );

    expect(error).toBe("Invalid status.");
    expect(h.rows()[0].status).toBe("draft");
  });

  it("reports a missing post rather than silently succeeding", async () => {
    setup({ ...ADMIN, rows: [] });
    const { data, error } = await setPostStatus("gone", "published");

    expect(data).toBeNull();
    expect(error).toBe("That post no longer exists.");
  });
});

// ------------------------------------------------------------
// updatePost
// ------------------------------------------------------------

describe("updatePost", () => {
  it("saves the editable fields", async () => {
    const h = setup({ ...ADMIN, rows: [post({ id: "p1", slug: "old-slug" })] });
    const { error } = await updatePost(
      "p1",
      input({
        title: "Updated title",
        slug: "updated-slug",
        excerpt: "New excerpt",
        content: "New body",
        cover_image_url: "https://example.com/a.jpg",
        seo_title: "SEO",
        seo_description: "SEO description",
        tags: ["sport"],
      })
    );

    expect(error).toBeNull();
    expect(h.rows()[0]).toMatchObject({
      title: "Updated title",
      slug: "updated-slug",
      excerpt: "New excerpt",
      content: "New body",
      cover_image_url: "https://example.com/a.jpg",
      seo_title: "SEO",
      seo_description: "SEO description",
      tags: ["sport"],
    });
  });

  it("does not change status or published_at", async () => {
    // Saving edits to a live post must not unpublish or re-date it,
    // and saving a draft must not publish it.
    const h = setup({
      ...ADMIN,
      rows: [
        post({
          id: "p1",
          slug: "a",
          status: "published",
          published_at: "2026-01-01T00:00:00Z",
        }),
      ],
    });
    await updatePost("p1", input({ status: "draft", published_at: null }));

    expect(h.rows()[0].status).toBe("published");
    expect(h.rows()[0].published_at).toBe("2026-01-01T00:00:00Z");
  });

  it("only updates the targeted post", async () => {
    const h = setup({
      ...ADMIN,
      rows: [post({ id: "p1", slug: "a" }), post({ id: "p2", slug: "b" })],
    });
    await updatePost("p1", input({ slug: "changed", title: "Changed" }));

    expect(h.rows().find((r) => r.id === "p2")).toMatchObject({
      slug: "b",
      title: "Title b",
    });
  });

  it("reports a missing post rather than silently succeeding", async () => {
    setup({ ...ADMIN, rows: [] });
    const { data, error } = await updatePost("gone", input());

    expect(data).toBeNull();
    expect(error).toBe("That post no longer exists.");
  });
});
