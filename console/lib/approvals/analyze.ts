import { randomUUID } from "node:crypto";
import {
  AUTO_CONFIDENCE_THRESHOLD,
  evaluateRequirements,
  failedChecks,
} from "./requirements";
import {
  OllamaError,
  requestModelReview,
  type ModelReview,
} from "./ollama";
import type {
  Analysis,
  AnalysisReason,
  Decision,
  OllamaConfig,
  PublicAccount,
  RequestFacts,
  Requirements,
  Verdict,
} from "./types";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface AnalyzeInput {
  requirements: Requirements;
  approverName: string;
  request: RequestFacts;
  config?: OllamaConfig;
  fetchImpl?: FetchLike;
}

function reasonFromFailure(
  checks: ReturnType<typeof evaluateRequirements>
): AnalysisReason[] {
  return failedChecks(checks).map((check) => ({
    requirement: check.requirement,
    finding: check.detail,
    met: false,
  }));
}

function fallbackAnalysis(
  checks: ReturnType<typeof evaluateRequirements>,
  error: string | null,
  durationMs: number
): Analysis {
  const failures = failedChecks(checks);
  const rejectedByRules = failures.length > 0;
  const summary = rejectedByRules
    ? `A hard requirement failed: ${failures.map((check) => check.label).join(", ")}.`
    : "No hard requirement failed. The local model did not provide a verdict, so this request needs a person.";
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    engine: "rules",
    model: null,
    verdict: rejectedByRules ? "reject" : "review",
    confidence: rejectedByRules ? 1 : 0,
    summary,
    reasons: reasonFromFailure(checks),
    risks: rejectedByRules
      ? []
      : [
          "Purpose, fit and ambiguity were not assessed by the local model.",
        ],
    checks,
    durationMs,
    error,
    overridden: false,
  };
}

function mergeModelReview(
  review: ModelReview,
  checks: ReturnType<typeof evaluateRequirements>
): {
  verdict: Verdict;
  summary: string;
  reasons: AnalysisReason[];
  risks: string[];
  overridden: boolean;
} {
  const failures = failedChecks(checks);
  if (failures.length === 0) {
    return {
      verdict: review.verdict,
      summary: review.summary,
      reasons: review.reasons,
      risks: review.risks,
      overridden: false,
    };
  }

  const labels = failures.map((check) => check.label).join(", ");
  return {
    verdict: "reject",
    summary: `A hard requirement failed (${labels}), so the request is rejected despite the model's recommendation.`,
    reasons: [
      ...reasonFromFailure(checks),
      ...review.reasons.filter((reason) => reason.met !== true),
    ].slice(0, 8),
    risks: review.risks,
    overridden: review.verdict !== "reject",
  };
}

export async function analyzeAccessRequest(
  input: AnalyzeInput
): Promise<Analysis> {
  const started = Date.now();
  const checks = evaluateRequirements(input.requirements, input.request);
  const failures = failedChecks(checks);

  // Hard limits are deterministic. Do not spend a model call on a request the
  // requirements already reject.
  if (failures.length > 0) {
    return fallbackAnalysis(checks, null, Date.now() - started);
  }

  try {
    const review = await requestModelReview({
      requirements: input.requirements,
      approverName: input.approverName,
      request: input.request,
      checks,
      config: input.config,
      fetchImpl: input.fetchImpl,
    });
    const merged = mergeModelReview(review, checks);
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      engine: "ollama",
      model: review.model,
      verdict: merged.verdict,
      confidence: merged.overridden ? 1 : review.confidence,
      summary: merged.summary,
      reasons: merged.reasons,
      risks: merged.risks,
      checks,
      durationMs: Date.now() - started,
      error: null,
      overridden: merged.overridden,
    };
  } catch (error) {
    const message =
      error instanceof OllamaError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    return fallbackAnalysis(
      checks,
      message.length > 300 ? `${message.slice(0, 297)}...` : message,
      Date.now() - started
    );
  }
}

export interface AutoDecisionResult {
  decision: Decision | null;
  held: string | null;
}

export function decideAutomatically(
  requirements: Requirements,
  analysis: Analysis,
  approver: Pick<PublicAccount, "id" | "name">,
  now = new Date().toISOString()
): AutoDecisionResult {
  if (!requirements.autoDecision) {
    return { decision: null, held: null };
  }

  const failures = failedChecks(analysis.checks);
  const confidence = Math.round(analysis.confidence * 100);
  const base = {
    decider: "auto" as const,
    deciderId: approver.id,
    deciderName: approver.name,
    engine: analysis.engine,
    analysisId: analysis.id,
    at: now,
  };

  if (failures.length > 0) {
    return {
      decision: {
        ...base,
        status: "rejected",
        note: `Auto-rejected after a hard requirement failed. ${failures
          .map((check) => check.detail)
          .join(" ")}`,
      },
      held: null,
    };
  }

  if (analysis.engine === "rules") {
    return {
      decision: null,
      held:
        "Auto-decision held: the local model did not provide a verdict, so the request needs a person.",
    };
  }

  if (analysis.verdict === "review") {
    return {
      decision: null,
      held: "Auto-decision held: the model asked for a human review.",
    };
  }

  if (analysis.confidence < AUTO_CONFIDENCE_THRESHOLD) {
    return {
      decision: null,
      held: `Auto-decision held: model confidence ${confidence}% is below ${Math.round(
        AUTO_CONFIDENCE_THRESHOLD * 100
      )}%.`,
    };
  }

  if (analysis.verdict === "accept") {
    return {
      decision: {
        ...base,
        status: "accepted",
        note: `Auto-accepted: the local model was ${confidence}% confident and every hard requirement passed.`,
      },
      held: null,
    };
  }

  return {
    decision: {
      ...base,
      status: "rejected",
      note: `Auto-rejected: the local model was ${confidence}% confident this request does not meet the requirements.`,
    },
    held: null,
  };
}
