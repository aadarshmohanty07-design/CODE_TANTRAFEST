import { randomUUID } from "node:crypto";
import {
  analyzeAccessRequest,
  decideAutomatically,
  type AnalyzeInput,
} from "./analyze";
import {
  generateInviteCode,
  hashInviteCode,
  hashPasscode,
  hashSessionToken,
  nameKey,
  newSessionToken,
  normalizeInviteCode,
  normalizeName,
  verifyPasscode,
} from "./auth";
import { autoReadiness, defaultRequirements } from "./requirements";
import type { ApprovalStore } from "./store";
import type {
  AccessLevel,
  AccessRequest,
  Account,
  Analysis,
  ApprovalData,
  Decision,
  PublicAccount,
  Requirements,
  RequirementsInput,
  TimelineActor,
  TimelineEvent,
} from "./types";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_ACCOUNT = 12;

export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "invalid"
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

export type Analyzer = (input: AnalyzeInput) => Promise<Analysis>;

export interface CreateRequestInput {
  approverId: string;
  resource: string;
  accessLevel: AccessLevel;
  durationHours: number;
  spendUsd: number;
  startsAt: string | null;
  purpose: string;
  details: string;
}

export interface Dashboard {
  account: PublicAccount;
  requirements: Requirements;
  others: PublicAccount[];
  incoming: AccessRequest[];
  outgoing: AccessRequest[];
  recent: AccessRequest[];
  accountCount: number;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function publicAccount(account: Account): PublicAccount {
  return {
    id: account.id,
    name: account.name,
    createdAt: account.createdAt,
  };
}

function requireName(value: string): string {
  const name = normalizeName(value);
  if (name.length < 2 || name.length > 40) {
    throw new ApprovalError("Use a name between 2 and 40 characters.");
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new ApprovalError("The name contains unsupported characters.");
  }
  return name;
}

function requirePasscode(value: string, label = "Passcode"): string {
  if (value.length < 8) {
    throw new ApprovalError(`${label} must be at least 8 characters.`);
  }
  if (value.length > 128) {
    throw new ApprovalError(`${label} must be 128 characters or fewer.`);
  }
  return value;
}

function findAccount(data: ApprovalData, accountId: string): Account {
  const account = data.accounts.find((candidate) => candidate.id === accountId);
  if (!account) throw new ApprovalError("Account not found.", 404);
  return account;
}

function findRequest(data: ApprovalData, requestId: string): AccessRequest {
  const request = data.requests.find((candidate) => candidate.id === requestId);
  if (!request) throw new ApprovalError("Request not found.", 404);
  return request;
}

function issueSession(
  data: ApprovalData,
  accountId: string,
  now = new Date()
): string {
  const token = newSessionToken();
  data.sessions.push({
    tokenHash: hashSessionToken(token),
    accountId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  });

  const mine = data.sessions.filter((session) => session.accountId === accountId);
  if (mine.length > MAX_SESSIONS_PER_ACCOUNT) {
    const keep = new Set(
      mine
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, MAX_SESSIONS_PER_ACCOUNT)
        .map((session) => session.tokenHash)
    );
    data.sessions = data.sessions.filter(
      (session) => session.accountId !== accountId || keep.has(session.tokenHash)
    );
  }
  return token;
}

export async function accountCount(store: ApprovalStore): Promise<number> {
  const data = await store.read();
  return data.accounts.length;
}

export async function createFirstAccount(
  store: ApprovalStore,
  input: { name: string; passcode: string }
): Promise<{ account: PublicAccount; token: string }> {
  const name = requireName(input.name);
  const passcode = requirePasscode(input.passcode);

  return store.mutate(async (data) => {
    if (data.accounts.length > 0) {
      throw new ApprovalError(
        "This server already has its first account. Sign in or use an invite.",
        409
      );
    }
    const key = nameKey(name);
    if (data.accounts.some((account) => account.nameKey === key)) {
      throw new ApprovalError("That name is already in use.", 409);
    }

    const now = nowIso();
    const credentials = await hashPasscode(passcode);
    const account: Account = {
      id: randomUUID(),
      name,
      nameKey: key,
      passcodeSalt: credentials.salt,
      passcodeHash: credentials.hash,
      createdAt: now,
      requirements: defaultRequirements(now),
    };
    data.accounts.push(account);
    const token = issueSession(data, account.id);
    return { account: publicAccount(account), token };
  });
}

export async function login(
  store: ApprovalStore,
  input: { name: string; passcode: string }
): Promise<{ account: PublicAccount; token: string } | null> {
  const data = await store.read();
  const key = nameKey(input.name);
  const account = data.accounts.find((candidate) => candidate.nameKey === key);
  if (!account) return null;
  const valid = await verifyPasscode(
    input.passcode,
    account.passcodeSalt,
    account.passcodeHash
  );
  if (!valid) return null;

  return store.mutate((current) => {
    const latest = findAccount(current, account.id);
    const token = issueSession(current, latest.id);
    return { account: publicAccount(latest), token };
  });
}

export async function logout(
  store: ApprovalStore,
  token: string | null
): Promise<void> {
  if (!token) return;
  const tokenHash = hashSessionToken(token);
  await store.mutate((data) => {
    data.sessions = data.sessions.filter(
      (session) => session.tokenHash !== tokenHash
    );
  });
}

export async function getSessionAccount(
  store: ApprovalStore,
  token: string | null
): Promise<{ account: Account; data: ApprovalData } | null> {
  if (!token) return null;
  const data = await store.read();
  const session = data.sessions.find(
    (candidate) => candidate.tokenHash === hashSessionToken(token)
  );
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
  const account = data.accounts.find(
    (candidate) => candidate.id === session.accountId
  );
  if (!account) return null;
  return { account, data };
}

export async function createInvite(
  store: ApprovalStore,
  accountId: string
): Promise<{ code: string; expiresAt: string }> {
  const code = generateInviteCode();
  const codeHash = hashInviteCode(code);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  await store.mutate((data) => {
    findAccount(data, accountId);
    if (data.accounts.length >= 2) {
      throw new ApprovalError(
        "This server already has two accounts. No invite is needed.",
        409
      );
    }
    data.invites = data.invites.filter(
      (invite) => invite.createdBy !== accountId || invite.usedAt !== null
    );
    data.invites.push({
      id: randomUUID(),
      codeHash,
      createdBy: accountId,
      createdAt: new Date().toISOString(),
      expiresAt,
      usedAt: null,
      usedBy: null,
    });
  });

  return { code, expiresAt };
}

export async function joinWithInvite(
  store: ApprovalStore,
  input: { code: string; name: string; passcode: string }
): Promise<{ account: PublicAccount; token: string }> {
  const name = requireName(input.name);
  const passcode = requirePasscode(input.passcode);
  const normalizedCode = normalizeInviteCode(input.code);
  if (normalizedCode.length < 8) {
    throw new ApprovalError("Enter the invite code you were given.");
  }
  const codeHash = hashInviteCode(normalizedCode);

  return store.mutate(async (data) => {
    if (data.accounts.length >= 2) {
      throw new ApprovalError("This server already has two accounts.", 409);
    }
    const invite = data.invites.find((candidate) => candidate.codeHash === codeHash);
    if (
      !invite ||
      invite.usedAt !== null ||
      Date.parse(invite.expiresAt) <= Date.now()
    ) {
      throw new ApprovalError("That invite code is invalid or has expired.");
    }
    const key = nameKey(name);
    if (data.accounts.some((account) => account.nameKey === key)) {
      throw new ApprovalError("That name is already in use.", 409);
    }

    const now = nowIso();
    const credentials = await hashPasscode(passcode);
    const account: Account = {
      id: randomUUID(),
      name,
      nameKey: key,
      passcodeSalt: credentials.salt,
      passcodeHash: credentials.hash,
      createdAt: now,
      requirements: defaultRequirements(now),
    };
    data.accounts.push(account);
    invite.usedAt = now;
    invite.usedBy = account.id;
    data.invites = data.invites.filter(
      (candidate) => candidate.id === invite.id || candidate.usedAt !== null
    );
    const token = issueSession(data, account.id);
    return { account: publicAccount(account), token };
  });
}

function normalizeRequirements(
  input: RequirementsInput
): Omit<Requirements, "autoArmedAt" | "updatedAt"> {
  const resources = Array.from(
    new Map(
      input.allowedResources
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => [item.toLocaleLowerCase("en-US"), item])
    ).values()
  );
  const blocked = Array.from(
    new Map(
      input.blockedTerms
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => [item.toLocaleLowerCase("en-US"), item])
    ).values()
  );
  if (resources.length === 0 && input.autoDecision) {
    throw new ApprovalError(
      "Add at least one approved resource before arming auto-decision."
    );
  }
  if (resources.length > 12) {
    throw new ApprovalError("List no more than 12 approved resources.");
  }
  if (blocked.length > 20) {
    throw new ApprovalError("List no more than 20 blocked terms.");
  }
  if (!Number.isFinite(input.maxDurationHours) || input.maxDurationHours <= 0) {
    throw new ApprovalError("Set a maximum duration above zero.");
  }
  if (!Number.isFinite(input.maxSpendUsd) || input.maxSpendUsd < 0) {
    throw new ApprovalError("Set a maximum spend of zero or more.");
  }
  if (
    !Number.isInteger(input.minPurposeChars) ||
    input.minPurposeChars < 0 ||
    input.minPurposeChars > 500
  ) {
    throw new ApprovalError("Purpose length must be between 0 and 500.");
  }
  const guidance = input.guidance.trim();
  if (guidance.length > 2_000) {
    throw new ApprovalError("Guidance must be 2,000 characters or fewer.");
  }
  return {
    allowedResources: resources,
    maxDurationHours: input.maxDurationHours,
    maxSpendUsd: input.maxSpendUsd,
    allowExecute: input.allowExecute,
    allowAdmin: input.allowAdmin,
    minPurposeChars: input.minPurposeChars,
    blockedTerms: blocked,
    guidance,
    autoDecision: input.autoDecision,
  };
}

export async function updateRequirements(
  store: ApprovalStore,
  accountId: string,
  input: RequirementsInput,
  auth: { passcode?: string; confirm?: string } = {}
): Promise<Requirements> {
  const normalized = normalizeRequirements(input);

  return store.mutate(async (data) => {
    const account = findAccount(data, accountId);
    const currentlyArmed = account.requirements.autoDecision;

    if (normalized.autoDecision) {
      const blocked = autoReadiness({
        ...normalized,
        autoArmedAt: account.requirements.autoArmedAt,
        updatedAt: account.requirements.updatedAt,
      });
      if (blocked) throw new ApprovalError(blocked);
      if (!auth.passcode) {
        throw new ApprovalError(
          "Enter your passcode to save an armed auto-decision preset.",
          403
        );
      }
      const valid = await verifyPasscode(
        auth.passcode,
        account.passcodeSalt,
        account.passcodeHash
      );
      if (!valid) {
        throw new ApprovalError(
          "The passcode is incorrect. Auto-decision was not changed.",
          403
        );
      }
      if (!currentlyArmed && auth.confirm?.trim().toUpperCase() !== "AUTO") {
        throw new ApprovalError("Type AUTO to arm auto-decision.");
      }
    }

    const now = nowIso();
    const autoArmedAt = normalized.autoDecision
      ? currentlyArmed
        ? account.requirements.autoArmedAt
        : now
      : null;
    account.requirements = {
      ...normalized,
      autoArmedAt,
      updatedAt: now,
    };
    return clone(account.requirements);
  });
}

function validateRequestInput(input: CreateRequestInput): CreateRequestInput {
  const resource = input.resource.trim();
  const purpose = input.purpose.trim();
  const details = input.details.trim();
  if (resource.length < 1 || resource.length > 80) {
    throw new ApprovalError("Name the resource in 1 to 80 characters.");
  }
  if (!["read", "execute", "admin"].includes(input.accessLevel)) {
    throw new ApprovalError("Choose a valid access level.");
  }
  if (
    !Number.isFinite(input.durationHours) ||
    input.durationHours <= 0 ||
    input.durationHours > 720
  ) {
    throw new ApprovalError("Duration must be between 0 and 720 hours.");
  }
  if (!Number.isFinite(input.spendUsd) || input.spendUsd < 0) {
    throw new ApprovalError("Spend must be zero or more.");
  }
  if (purpose.length < 1 || purpose.length > 2_000) {
    throw new ApprovalError("Describe the purpose in 1 to 2,000 characters.");
  }
  if (details.length > 1_500) {
    throw new ApprovalError("Technical detail must be 1,500 characters or fewer.");
  }
  if (input.startsAt && Number.isNaN(Date.parse(input.startsAt))) {
    throw new ApprovalError("The requested start time is not valid.");
  }
  return {
    ...input,
    resource,
    purpose,
    details,
    startsAt: input.startsAt || null,
  };
}

function timelineEvent(
  actor: TimelineActor,
  actorName: string,
  label: string,
  detail: string | null = null,
  now = nowIso()
): TimelineEvent {
  return { id: randomUUID(), at: now, actor, actorName, label, detail };
}

function verdictLabel(verdict: Analysis["verdict"]): string {
  switch (verdict) {
    case "accept":
      return "accept";
    case "reject":
      return "reject";
    default:
      return "needs review";
  }
}

async function finalizeAnalysis(
  store: ApprovalStore,
  requestId: string,
  analysis: Analysis,
  policyUpdatedAt: string,
  rerun: boolean
): Promise<AccessRequest> {
  return store.mutate((data) => {
    const request = findRequest(data, requestId);
    const approver = findAccount(data, request.approverId);
    request.policyUpdatedAt = policyUpdatedAt;

    if (request.status !== "pending" || request.decision) {
      return clone(request);
    }

    const now = nowIso();
    request.analysis = analysis;
    request.updatedAt = now;
    const engineNote =
      analysis.engine === "rules"
        ? analysis.error
          ? `Rule check only. ${analysis.error}`
          : "Deterministic hard-limit check."
        : `${Math.round(analysis.confidence * 100)}% confidence.`;
    request.timeline.push(
      timelineEvent(
        analysis.engine === "ollama" ? "ai" : "system",
        analysis.engine === "ollama"
          ? analysis.model ?? "Local model"
          : "Requirement check",
        `${rerun ? "Re-run" : "Review"}: ${verdictLabel(analysis.verdict)}`,
        engineNote,
        now
      )
    );

    if (approver.requirements.updatedAt !== policyUpdatedAt) {
      request.timeline.push(
        timelineEvent(
          "system",
          "Auto-decision",
          "Auto-decision paused",
          "The requirements changed while the review was running. Run the review again.",
          now
        )
      );
      return clone(request);
    }

    const automatic = decideAutomatically(
      approver.requirements,
      analysis,
      approver,
      now
    );
    if (automatic.decision) {
      request.status = automatic.decision.status;
      request.decision = automatic.decision;
      request.updatedAt = now;
      request.timeline.push(
        timelineEvent(
          "ai",
          approver.name,
          `Auto-decision: ${automatic.decision.status}`,
          automatic.decision.note,
          now
        )
      );
    } else if (automatic.held) {
      request.timeline.push(
        timelineEvent("system", "Auto-decision", "Held for review", automatic.held, now)
      );
    }

    return clone(request);
  });
}

export async function createAccessRequest(
  store: ApprovalStore,
  requesterId: string,
  input: CreateRequestInput,
  analyzer: Analyzer = analyzeAccessRequest
): Promise<AccessRequest> {
  const validated = validateRequestInput(input);

  const prepared = await store.mutate((data) => {
    const requester = findAccount(data, requesterId);
    const approver = findAccount(data, validated.approverId);
    if (requester.id === approver.id) {
      throw new ApprovalError("You cannot request access from yourself.");
    }

    const now = nowIso();
    const request: AccessRequest = {
      id: randomUUID(),
      requesterId: requester.id,
      requesterName: requester.name,
      approverId: approver.id,
      approverName: approver.name,
      resource: validated.resource,
      accessLevel: validated.accessLevel,
      durationHours: validated.durationHours,
      spendUsd: validated.spendUsd,
      startsAt: validated.startsAt,
      purpose: validated.purpose,
      details: validated.details,
      status: "pending",
      policyUpdatedAt: approver.requirements.updatedAt,
      analysis: null,
      decision: null,
      createdAt: now,
      updatedAt: now,
      timeline: [
        timelineEvent(
          "requester",
          requester.name,
          `Request sent to ${approver.name}`,
          `${validated.resource}, ${validated.durationHours} hours.`,
          now
        ),
      ],
    };
    data.requests.push(request);
    return {
      request: clone(request),
      requirements: clone(approver.requirements),
      approverName: approver.name,
    };
  });

  const analysis = await analyzer({
    requirements: prepared.requirements,
    approverName: prepared.approverName,
    request: {
      resource: prepared.request.resource,
      accessLevel: prepared.request.accessLevel,
      durationHours: prepared.request.durationHours,
      spendUsd: prepared.request.spendUsd,
      startsAt: prepared.request.startsAt,
      purpose: prepared.request.purpose,
      details: prepared.request.details,
    },
  });

  return finalizeAnalysis(
    store,
    prepared.request.id,
    analysis,
    prepared.requirements.updatedAt,
    false
  );
}

export async function reanalyzeRequest(
  store: ApprovalStore,
  approverId: string,
  requestId: string,
  analyzer: Analyzer = analyzeAccessRequest
): Promise<AccessRequest> {
  const prepared = await store.mutate((data) => {
    const approver = findAccount(data, approverId);
    const request = findRequest(data, requestId);
    if (request.approverId !== approver.id) {
      throw new ApprovalError("Only the approver can run this review.", 403);
    }
    if (request.status !== "pending" || request.decision) {
      throw new ApprovalError("This request already has a decision.", 409);
    }
    return {
      requirements: clone(approver.requirements),
      approverName: approver.name,
      request: clone(request),
    };
  });

  const analysis = await analyzer({
    requirements: prepared.requirements,
    approverName: prepared.approverName,
    request: {
      resource: prepared.request.resource,
      accessLevel: prepared.request.accessLevel,
      durationHours: prepared.request.durationHours,
      spendUsd: prepared.request.spendUsd,
      startsAt: prepared.request.startsAt,
      purpose: prepared.request.purpose,
      details: prepared.request.details,
    },
  });

  return finalizeAnalysis(
    store,
    requestId,
    analysis,
    prepared.requirements.updatedAt,
    true
  );
}

export async function decideRequest(
  store: ApprovalStore,
  approverId: string,
  requestId: string,
  status: "accepted" | "rejected",
  note: string
): Promise<AccessRequest> {
  if (status !== "accepted" && status !== "rejected") {
    throw new ApprovalError("Choose accept or reject.");
  }
  const trimmed = note.trim();
  if (trimmed.length > 1_000) {
    throw new ApprovalError("Decision note must be 1,000 characters or fewer.");
  }

  return store.mutate((data) => {
    const approver = findAccount(data, approverId);
    const request = findRequest(data, requestId);
    if (request.approverId !== approver.id) {
      throw new ApprovalError("Only the approver can decide this request.", 403);
    }
    if (request.status !== "pending" || request.decision) {
      throw new ApprovalError("This request already has a decision.", 409);
    }
    if (!request.analysis) {
      throw new ApprovalError(
        "Run the requirements check before deciding this request.",
        409
      );
    }

    const now = nowIso();
    const decision: Decision = {
      status,
      decider: "human",
      deciderId: approver.id,
      deciderName: approver.name,
      engine: request.analysis.engine,
      analysisId: request.analysis.id,
      note: trimmed,
      at: now,
    };
    request.status = status;
    request.decision = decision;
    request.updatedAt = now;
    request.timeline.push(
      timelineEvent(
        "approver",
        approver.name,
        status === "accepted" ? "Access accepted" : "Access rejected",
        trimmed || null,
        now
      )
    );
    return clone(request);
  });
}

export async function dashboardFor(
  store: ApprovalStore,
  accountId: string
): Promise<Dashboard> {
  const data = await store.read();
  const account = findAccount(data, accountId);
  const mine = data.requests.filter(
    (request) =>
      request.requesterId === accountId || request.approverId === accountId
  );
  const incoming = mine
    .filter(
      (request) =>
        request.approverId === accountId &&
        request.status === "pending" &&
        !request.decision
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const outgoing = mine
    .filter((request) => request.requesterId === accountId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const recent = mine
    .filter((request) => request.decision !== null)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 8);

  return {
    account: publicAccount(account),
    requirements: clone(account.requirements),
    others: data.accounts
      .filter((candidate) => candidate.id !== accountId)
      .map(publicAccount),
    incoming: clone(incoming),
    outgoing: clone(outgoing),
    recent: clone(recent),
    accountCount: data.accounts.length,
  };
}

export async function requestFor(
  store: ApprovalStore,
  accountId: string,
  requestId: string
): Promise<AccessRequest | null> {
  const data = await store.read();
  const request = data.requests.find((candidate) => candidate.id === requestId);
  if (!request) return null;
  if (request.requesterId !== accountId && request.approverId !== accountId) {
    return null;
  }
  return clone(request);
}
