import type { StatusLike } from "@/components/ui";
import type { AccessRequest, Analysis, Decision } from "./types";

export function whenUtc(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

export function whenShort(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function verdictText(verdict: Analysis["verdict"]): string {
  switch (verdict) {
    case "accept":
      return "Accept";
    case "reject":
      return "Reject";
    default:
      return "Needs review";
  }
}

export function verdictStatus(verdict: Analysis["verdict"]): StatusLike {
  switch (verdict) {
    case "accept":
      return "OK";
    case "reject":
      return "RED";
    default:
      return "AMBER";
  }
}

export function requestStatus(request: AccessRequest): {
  label: string;
  status: StatusLike;
} {
  if (request.decision) {
    if (request.decision.status === "accepted") {
      return { label: "Accepted", status: "OK" };
    }
    return { label: "Rejected", status: "RED" };
  }
  if (request.timeline.some((event) => event.label === "Held for review")) {
    return { label: "Held for review", status: "AMBER" };
  }
  if (request.analysis?.verdict === "review") {
    return { label: "Needs review", status: "AMBER" };
  }
  return { label: "Waiting", status: "AMBER" };
}

export function decisionLine(decision: Decision): string {
  return decision.decider === "auto"
    ? "Decided automatically under the armed preset"
    : `Decided by ${decision.deciderName}`;
}

export function engineLabel(engine: Analysis["engine"]): string {
  return engine === "ollama" ? "Local model" : "Rule check";
}

export function confidenceLabel(analysis: Analysis): string {
  return `${Math.round(analysis.confidence * 100)}%`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`;
}
