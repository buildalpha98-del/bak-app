"use client";

// ============================================================
// Renders program content_json in a structured, readable format.
// Handles standard keys (warm_up, drills, game, cool_down) and
// falls back to key-value display for non-standard structures.
// ============================================================

interface ProgramContentProps {
  contentJson: Record<string, unknown>;
  sport: string;
}

const SECTION_ORDER = ["warm_up", "drills", "game", "cool_down"];

const SECTION_LABELS: Record<string, string> = {
  warm_up: "Warm Up",
  drills: "Drills",
  game: "Game",
  cool_down: "Cool Down",
};

function formatKey(key: string): string {
  return SECTION_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value: unknown): React.ReactNode {
  if (typeof value === "string") {
    return <p className="text-sm text-foreground whitespace-pre-wrap">{value}</p>;
  }

  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1 pl-4">
        {value.map((item, i) => (
          <li
            key={i}
            className="text-sm text-foreground list-disc marker:text-primary"
          >
            {typeof item === "string" ? item : JSON.stringify(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <div className="space-y-1 pl-2">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <span className="text-xs font-medium text-muted-foreground">
              {formatKey(k)}:
            </span>
            <div className="pl-2">{renderValue(v)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <p className="text-sm text-foreground">{String(value)}</p>
  );
}

export function ProgramContent({ contentJson, sport }: ProgramContentProps) {
  if (!contentJson || Object.keys(contentJson).length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-muted-foreground">
          No programme details available for this {sport} session.
        </p>
      </div>
    );
  }

  // Render standard sections first, then any remaining keys
  const renderedKeys = new Set<string>();
  const sections: { key: string; label: string; value: unknown }[] = [];

  for (const key of SECTION_ORDER) {
    if (key in contentJson) {
      sections.push({ key, label: SECTION_LABELS[key], value: contentJson[key] });
      renderedKeys.add(key);
    }
  }

  // Add any remaining keys
  for (const key of Object.keys(contentJson)) {
    if (!renderedKeys.has(key)) {
      sections.push({ key, label: formatKey(key), value: contentJson[key] });
    }
  }

  return (
    <div className="space-y-4">
      {sections.map(({ key, label, value }) => (
        <div key={key}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
            {label}
          </h4>
          {renderValue(value)}
        </div>
      ))}
    </div>
  );
}
