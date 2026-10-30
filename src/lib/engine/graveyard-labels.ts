// Graveyard labels, safe for the browser (graveyard.ts itself uses server-only fetchers).
export type DeathCause = "rug" | "slow_bleed" | "abandoned" | "unknown";
export const CAUSE_LABEL: Record<DeathCause, string> = { rug: "Rug pull", slow_bleed: "Slow bleed", abandoned: "Abandoned", unknown: "Unknown causes" };
export const CAUSE_EMOJI: Record<DeathCause, string> = { rug: "🪤", slow_bleed: "🩸", abandoned: "🕸️", unknown: "❓" };
