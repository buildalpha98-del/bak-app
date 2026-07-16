import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { oklchToHex, contrastRatio } from "../contrast";

// ============================================================
// CI guard: brand fill/foreground pairs must clear WCAG AA
// ============================================================
//
// This is the ONLY test in the repo that asserts a colour. Nothing else
// here — no snapshot, no visual-regression harness, no class assertion —
// can see a restyle. `npm run build` going green proves the app compiles
// and proves nothing about whether the brand renders legibly.
//
// It exists because the dashboard shipped a live AA failure to
// production: `--primary` (#E95C12) paired with a near-white
// `--primary-foreground` (#FEFDFC) measures 3.44:1, under the 4.5:1 AA
// floor, on every `default` Button and Badge in the light theme.
//
// If you are here because this test went red: the fix is to change the
// INK, not to lower the threshold.

const AA_THRESHOLD = 4.5;

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** Extract a top-level CSS block's body. The theme blocks nest no braces. */
function block(selector: string): string {
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`);
  const m = CSS.match(re);
  if (!m) throw new Error(`Could not find CSS block: ${selector}`);
  return m[1];
}

/** Read a custom property's raw value out of a block body. */
function rawToken(body: string, name: string): string {
  const m = body.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`Could not find token --${name}`);
  return m[1].trim();
}

/** Resolve a token declared as `oklch(L C H)` to hex. */
function tokenHex(body: string, name: string): string {
  const raw = rawToken(body, name);
  const m = raw.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`Token --${name} is not a plain oklch() value: ${raw}`);
  return oklchToHex(Number(m[1]), Number(m[2]), Number(m[3]));
}

const root = block(":root");
const dark = block(".dark");

describe("oklchToHex", () => {
  it("converts the brand orange token", () => {
    expect(oklchToHex(0.679, 0.168, 47.2)).toBe("#E8712A");
  });

  it("converts the achromatic extremes", () => {
    expect(oklchToHex(1, 0, 0)).toBe("#FFFFFF");
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
  });

  it("clamps out-of-gamut values into sRGB", () => {
    expect(oklchToHex(0.65, 0.4, 42)).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("contrastRatio", () => {
  it("scores white on brand orange as an AA failure", () => {
    expect(contrastRatio("#FFFFFF", "#E8712A")).toBeCloseTo(3.08, 1);
  });

  it("scores brand charcoal on brand orange as an AA pass", () => {
    expect(contrastRatio("#1C1917", "#E8712A")).toBeCloseTo(5.69, 1);
  });

  it("scores black on white at the 21:1 maximum", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("scores a colour against itself at 1:1", () => {
    expect(contrastRatio("#E8712A", "#E8712A")).toBeCloseTo(1, 5);
  });

  it("is symmetric — order of arguments does not matter", () => {
    expect(contrastRatio("#FFFFFF", "#E8712A")).toBeCloseTo(
      contrastRatio("#E8712A", "#FFFFFF"),
      5
    );
  });

  it("accepts 3-digit shorthand hex", () => {
    expect(contrastRatio("#FFF", "#000")).toBeCloseTo(21, 5);
  });
});

// ------------------------------------------------------------
// The guard proper: assert the ACTUAL token values in globals.css
// ------------------------------------------------------------

describe("globals.css brand token pairs clear WCAG AA", () => {
  // The Button/Badge pair. `bg-primary text-primary-foreground` is the
  // shape ~298 buttons render. This is the pair that was shipping at
  // 3.44:1 in the light theme.
  it(":root --primary / --primary-foreground clears AA", () => {
    const ratio = contrastRatio(
      tokenHex(root, "primary-foreground"),
      tokenHex(root, "primary")
    );
    expect(ratio).toBeGreaterThanOrEqual(AA_THRESHOLD);
  });

  it(".dark --primary / --primary-foreground clears AA", () => {
    const ratio = contrastRatio(
      tokenHex(dark, "primary-foreground"),
      tokenHex(dark, "primary")
    );
    expect(ratio).toBeGreaterThanOrEqual(AA_THRESHOLD);
  });

  // Chunk-2 independence. Chunk 2 reconciles --primary onto the
  // --brand-orange hex (#E8712A). The ink must clear AA on BOTH oranges,
  // so that this accessibility fix and the palette alignment can be
  // reverted independently of each other. If this fails, the two chunks
  // have become coupled.
  it(":root --primary-foreground also clears AA on --brand-orange", () => {
    const brandOrange = rawToken(root, "brand-orange");
    expect(brandOrange).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const ratio = contrastRatio(tokenHex(root, "primary-foreground"), brandOrange);
    expect(ratio).toBeGreaterThanOrEqual(AA_THRESHOLD);
  });

  // THE TRIPWIRE. Read this before "fixing" --sidebar-primary-foreground.
  //
  // --sidebar-primary-foreground LOOKS like it pairs with
  // --sidebar-primary, and the token names invite you to flip it to ink
  // alongside --primary-foreground. It does not pair with it. Measured
  // against the source: nothing renders text on `bg-sidebar-primary` —
  // that token only draws 3px active stripes and 1.5px status dots.
  //
  // The one and only consumer of --sidebar-primary-foreground is
  // components/shared/navigation/sidebar.tsx:79, which renders it as the
  // ACTIVE NAV LABEL on `bg-sidebar-accent` (near-black charcoal).
  //
  // So --sidebar-primary-foreground must stay NEAR-WHITE. Flipping it to
  // ink to "match" the --primary fix takes that label from 17.8:1 to
  // 1.04:1 — invisible text on the primary navigation. This test is here
  // to catch exactly that.
  it("--sidebar-primary-foreground stays legible on --sidebar-accent (its real pair)", () => {
    for (const [name, body] of [
      [":root", root],
      [".dark", dark],
    ] as const) {
      const ratio = contrastRatio(
        tokenHex(body, "sidebar-primary-foreground"),
        tokenHex(body, "sidebar-accent")
      );
      expect(ratio, `${name} sidebar active nav label`).toBeGreaterThanOrEqual(
        AA_THRESHOLD
      );
    }
  });
});

// ------------------------------------------------------------
// Toasts: every state renders on --popover. Guard that ground.
// ------------------------------------------------------------
//
// components/ui/sonner.tsx themes ALL toast states — bare, success, error,
// warning, info — onto --popover / --popover-foreground. It can do that only
// because `richColors` is off; see the last test in this file.
//
// This replaced Sonner's stock rich palette, which failed AA on all four
// states in the light theme (worst: warning text #DC7609 on #FFFCF0, 3.08:1 —
// the same ratio as the white-on-orange button bug above).

describe("toast state tokens clear WCAG on the --popover ground", () => {
  const themes = [
    [":root", root],
    [".dark", dark],
  ] as const;

  // The text pair. Identical for every toast state by construction — the
  // point of dropping richColors is that state no longer changes the ground,
  // so there is exactly one pair to keep legible instead of four.
  it("--popover-foreground on --popover clears AA in both themes", () => {
    for (const [name, body] of themes) {
      const ratio = contrastRatio(
        tokenHex(body, "popover-foreground"),
        tokenHex(body, "popover")
      );
      expect(ratio, `${name} toast text`).toBeGreaterThanOrEqual(AA_THRESHOLD);
    }
  });

  // The accent pairs: toast icons and the state border. These are non-text
  // UI components, so the floor is WCAG 2.1 SC 1.4.11's 3:1, not 4.5:1.
  //
  // --success/--warning/--info are declared in BOTH blocks and lightened for
  // dark. If you add a state accent, add it here: the :root values go muddy
  // on the dark popover (--info measures 3.80:1 there at its light value).
  const NON_TEXT_THRESHOLD = 3;

  it.each(["success", "warning", "info", "destructive"])(
    "--%s is visible on --popover in both themes",
    (token) => {
      for (const [name, body] of themes) {
        const ratio = contrastRatio(tokenHex(body, token), tokenHex(body, "popover"));
        expect(ratio, `${name} --${token} toast accent`).toBeGreaterThanOrEqual(
          NON_TEXT_THRESHOLD
        );
      }
    }
  );

  // THE TRIPWIRE for the toast work — the counterpart to the sidebar one above.
  //
  // `richColors` reads like a nice-to-have and is the single line that undoes
  // this entire chunk. It stamps data-rich-colors="true", whose selectors
  // (0,3,0) outrank the base rule (0,2,0) that the --normal-* vars in
  // components/ui/sonner.tsx theme through. Every typed toast then silently
  // reverts to Sonner's stock palette — including the light-theme AA failures.
  //
  // Nothing else in this repo can see that regression: it changes no markup,
  // no roles and no text, so the Playwright specs and every unit test stay
  // green while all 767 toast call sites render the wrong design.
  it("app/layout.tsx does not mount the Toaster with richColors", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    const toaster = layout.match(/<Toaster[^>]*\/>/);
    expect(toaster, "could not find the <Toaster /> mount in app/layout.tsx")
      .not.toBeNull();
    expect(toaster![0]).not.toMatch(/richColors/);
  });
});
