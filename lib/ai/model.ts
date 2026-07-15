// ============================================================
// Single source of truth for the Claude model id
// ============================================================
//
// Every AI feature (programme builder, skills, coach assistant, child
// insights, sales proposals, curriculum mapping) imports this instead
// of hardcoding a model string. When Anthropic retires a model the
// whole platform's AI died with a 404 ("model: claude-sonnet-4-…")
// because seven files each pinned the old id — now it's one line.

export const AI_MODEL = "claude-sonnet-5";
