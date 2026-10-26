import type {
  HardCheck,
  RequestFacts,
  Requirements,
} from "./types";

export const AUTO_CONFIDENCE_THRESHOLD = 0.85;

export function defaultRequirements(now = new Date().toISOString()): Requirements {
  return {
    allowedResources: [],
    maxDurationHours: 4,
    maxSpendUsd: 0,
    allowExecute: false,
    allowAdmin: false,
    minPurposeChars: 40,
    blockedTerms: [],
    guidance: "",
    autoDecision: false,
    autoArmedAt: null,
    updatedAt: now,
  };
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function formatHours(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} h`;
}

export function accessLevelLabel(level: RequestFacts["accessLevel"]): string {
  switch (level) {
    case "admin":
      return "Admin";
    case "execute":
      return "Execute";
    default:
      return "Read only";
  }
}

function lower(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function evaluateRequirements(
  requirements: Requirements,
  request: RequestFacts
): HardCheck[] {
  const checks: HardCheck[] = [];
  const resource = lower(request.resource);
  const allowedResources = requirements.allowedResources.map(lower);

  if (allowedResources.length === 0) {
    checks.push({
      id: "resource",
      label: "Resource",
      requirement: "The resource appears on the approved list.",
      detail: "No resources are approved on this server yet.",
      passed: false,
    });
  } else if (!allowedResources.includes(resource)) {
    checks.push({
      id: "resource",
      label: "Resource",
      requirement: "The resource appears on the approved list.",
      detail: `"${request.resource.trim()}" is not approved.`,
      passed: false,
    });
  } else {
    checks.push({
      id: "resource",
      label: "Resource",
      requirement: "The resource appears on the approved list.",
      detail: `"${request.resource.trim()}" is approved.`,
      passed: true,
    });
  }

  checks.push({
    id: "duration",
    label: "Duration",
    requirement: `Duration does not exceed ${formatHours(requirements.maxDurationHours)}.`,
    detail: `${formatHours(request.durationHours)} requested, limit ${formatHours(
      requirements.maxDurationHours
    )}.`,
    passed: request.durationHours <= requirements.maxDurationHours,
  });

  checks.push({
    id: "spend",
    label: "Spend",
    requirement: `Spend does not exceed ${formatUsd(requirements.maxSpendUsd)}.`,
    detail: `${formatUsd(request.spendUsd)} requested, limit ${formatUsd(
      requirements.maxSpendUsd
    )}.`,
    passed: request.spendUsd <= requirements.maxSpendUsd,
  });

  if (request.accessLevel === "admin") {
    checks.push({
      id: "access",
      label: "Access level",
      requirement: "Admin access is allowed.",
      detail: "Admin access requested.",
      passed: requirements.allowAdmin,
    });
  } else if (request.accessLevel === "execute") {
    checks.push({
      id: "access",
      label: "Access level",
      requirement: "Execute access is allowed.",
      detail: "Execute access requested.",
      passed: requirements.allowExecute || requirements.allowAdmin,
    });
  } else {
    checks.push({
      id: "access",
      label: "Access level",
      requirement: "Read-only access is allowed.",
      detail: "Read-only access requested.",
      passed: true,
    });
  }

  const purposeLength = request.purpose.trim().length;
  checks.push({
    id: "purpose",
    label: "Purpose",
    requirement: `Purpose is at least ${requirements.minPurposeChars} characters.`,
    detail: `${purposeLength} characters given.`,
    passed: purposeLength >= requirements.minPurposeChars,
  });

  const haystack = lower(
    [request.resource, request.purpose, request.details].join(" \n ")
  ).replace(/\s+/g, " ");
  const matchedTerms = requirements.blockedTerms.filter((term) => {
    const needle = lower(term).replace(/\s+/g, " ");
    return needle.length > 0 && haystack.includes(needle);
  });
  checks.push({
    id: "blocked",
    label: "Blocked terms",
    requirement: "The request contains none of the blocked terms.",
    detail: matchedTerms.length
      ? `Matched: ${matchedTerms.join(", ")}.`
      : "No blocked term found.",
    passed: matchedTerms.length === 0,
  });

  return checks;
}

export function failedChecks(checks: HardCheck[]): HardCheck[] {
  return checks.filter((check) => !check.passed);
}

export function autoReadiness(requirements: Requirements): string | null {
  if (requirements.allowedResources.length === 0) {
    return "Add at least one approved resource before arming auto-decision.";
  }
  if (requirements.guidance.trim().length < 20) {
    return "Write at least 20 characters of guidance for the model before arming auto-decision.";
  }
  return null;
}
