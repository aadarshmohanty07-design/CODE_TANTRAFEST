import { describe, expect, it } from "vitest";
import {
  autoReadiness,
  defaultRequirements,
  evaluateRequirements,
  failedChecks,
} from "../lib/approvals/requirements";
import type { RequestFacts, Requirements } from "../lib/approvals/types";

const base: RequestFacts = {
  resource: "GPU node",
  accessLevel: "read",
  durationHours: 2,
  spendUsd: 0,
  startsAt: null,
  purpose: "Run the monthly evaluation suite for the release candidate.",
  details: "",
};

function policy(overrides: Partial<Requirements> = {}): Requirements {
  return {
    ...defaultRequirements("2026-10-26T00:00:00.000Z"),
    allowedResources: ["GPU node"],
    maxDurationHours: 4,
    maxSpendUsd: 10,
    minPurposeChars: 20,
    guidance: "Short evaluation jobs only. No persistent workloads.",
    ...overrides,
  };
}

function failing(requirements: Requirements, request: Partial<RequestFacts>) {
  return failedChecks(evaluateRequirements(requirements, { ...base, ...request }));
}

describe("approval requirements", () => {
  it("passes a request that fits every hard limit", () => {
    const checks = evaluateRequirements(
      policy({ allowExecute: true, blockedTerms: ["mining"] }),
      { ...base, resource: "gpu NODE", accessLevel: "execute" }
    );
    expect(failedChecks(checks)).toEqual([]);
    expect(checks.find((check) => check.id === "access")?.passed).toBe(true);
  });

  it("refuses every request when no resource is approved", () => {
    const failures = failing(policy({ allowedResources: [] }), {});
    expect(failures.map((check) => check.id)).toContain("resource");
  });

  it("refuses an unapproved resource", () => {
    const failures = failing(policy(), { resource: "Build runner" });
    expect(failures.map((check) => check.id)).toEqual(["resource"]);
  });

  it("enforces duration, spend, access level and purpose length", () => {
    const failures = failing(
      policy({ minPurposeChars: 80 }),
      {
        durationHours: 5,
        spendUsd: 11,
        accessLevel: "admin",
        purpose: "too short",
      }
    );
    expect(failures.map((check) => check.id).sort()).toEqual(
      ["access", "duration", "purpose", "spend"].sort()
    );
  });

  it("requires an explicit allow for execute and admin", () => {
    expect(failing(policy(), { accessLevel: "execute" }).map((c) => c.id)).toEqual([
      "access",
    ]);
    expect(
      failing(policy({ allowExecute: true }), { accessLevel: "admin" }).map(
        (check) => check.id
      )
    ).toEqual(["access"]);
    expect(
      failing(policy({ allowAdmin: true }), { accessLevel: "execute" })
    ).toEqual([]);
  });

  it("matches blocked terms across resource, purpose and detail", () => {
    const failures = failing(
      policy({ blockedTerms: ["crypto mining", "unvetted"] }),
      {
        purpose: "Run crypto  MINING on the node for a week.",
        details: "unvetted dataset",
      }
    );
    const blocked = failures.find((check) => check.id === "blocked");
    expect(blocked?.passed).toBe(false);
    expect(blocked?.detail).toContain("crypto mining");
    expect(blocked?.detail).toContain("unvetted");
  });

  it("will not arm auto-decision without a resource and guidance", () => {
    expect(autoReadiness(policy({ allowedResources: [] }))).toMatch(/resource/i);
    expect(autoReadiness(policy({ guidance: "short" }))).toMatch(/guidance/i);
    expect(autoReadiness(policy())).toBeNull();
  });
});
