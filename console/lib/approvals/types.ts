export type AccessLevel = "read" | "execute" | "admin";
export type RequestStatus = "pending" | "accepted" | "rejected";
export type Verdict = "accept" | "reject" | "review";
export type AnalysisEngine = "ollama" | "rules";
export type Decider = "human" | "auto";
export type TimelineActor = "requester" | "approver" | "ai" | "system";

export interface Requirements {
  allowedResources: string[];
  maxDurationHours: number;
  maxSpendUsd: number;
  allowExecute: boolean;
  allowAdmin: boolean;
  minPurposeChars: number;
  blockedTerms: string[];
  guidance: string;
  autoDecision: boolean;
  autoArmedAt: string | null;
  updatedAt: string;
}

export type RequirementsInput = Omit<Requirements, "autoArmedAt" | "updatedAt">;

export interface Account {
  id: string;
  name: string;
  nameKey: string;
  passcodeSalt: string;
  passcodeHash: string;
  createdAt: string;
  requirements: Requirements;
}

export interface PublicAccount {
  id: string;
  name: string;
  createdAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
}

export interface InviteRecord {
  id: string;
  codeHash: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
}

export interface HardCheck {
  id: string;
  label: string;
  requirement: string;
  detail: string;
  passed: boolean;
}

export interface AnalysisReason {
  requirement: string;
  finding: string;
  met: boolean | null;
}

export interface Analysis {
  id: string;
  createdAt: string;
  engine: AnalysisEngine;
  model: string | null;
  verdict: Verdict;
  confidence: number;
  summary: string;
  reasons: AnalysisReason[];
  risks: string[];
  checks: HardCheck[];
  durationMs: number;
  error: string | null;
  overridden: boolean;
}

export interface Decision {
  status: "accepted" | "rejected";
  decider: Decider;
  deciderId: string;
  deciderName: string;
  engine: AnalysisEngine | null;
  analysisId: string | null;
  note: string;
  at: string;
}

export interface TimelineEvent {
  id: string;
  at: string;
  actor: TimelineActor;
  actorName: string;
  label: string;
  detail: string | null;
}

export interface AccessRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  approverId: string;
  approverName: string;
  resource: string;
  accessLevel: AccessLevel;
  durationHours: number;
  spendUsd: number;
  startsAt: string | null;
  purpose: string;
  details: string;
  status: RequestStatus;
  policyUpdatedAt: string;
  analysis: Analysis | null;
  decision: Decision | null;
  createdAt: string;
  updatedAt: string;
  timeline: TimelineEvent[];
}

export interface ApprovalData {
  version: 1;
  accounts: Account[];
  sessions: SessionRecord[];
  invites: InviteRecord[];
  requests: AccessRequest[];
}

export type RequestFacts = Pick<
  AccessRequest,
  "resource" | "accessLevel" | "durationHours" | "spendUsd" | "startsAt" | "purpose" | "details"
>;

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface OllamaStatus {
  reachable: boolean;
  model: string;
  installed: boolean | null;
  error: string | null;
}
