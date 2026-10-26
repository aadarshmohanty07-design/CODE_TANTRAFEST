import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Analyzer } from "../lib/approvals/service";
import {
  ApprovalError,
  createAccessRequest,
  createFirstAccount,
  createInvite,
  dashboardFor,
  decideRequest,
  getSessionAccount,
  joinWithInvite,
  login,
  logout,
  updateRequirements,
} from "../lib/approvals/service";
import { ApprovalStore } from "../lib/approvals/store";
import { evaluateRequirements } from "../lib/approvals/requirements";
import type {
  Analysis,
  RequirementsInput,
} from "../lib/approvals/types";

let directory: string;
let store: ApprovalStore;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "aegis-approvals-"));
  store = new ApprovalStore(path.join(directory, "approvals.json"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const FIRST_PASSCODE = "first-pass-123";
const SECOND_PASSCODE = "second-pass-456";

async function makeTwoAccounts() {
  const first = await createFirstAccount(store, {
    name: "Aadarsh",
    passcode: FIRST_PASSCODE,
  });
  const invite = await createInvite(store, first.account.id);
  const second = await joinWithInvite(store, {
    code: invite.code,
    name: "Friend",
    passcode: SECOND_PASSCODE,
  });
  return { first, second, invite };
}

const policyInput: RequirementsInput = {
  allowedResources: ["GPU node"],
  maxDurationHours: 4,
  maxSpendUsd: 10,
  allowExecute: true,
  allowAdmin: false,
  minPurposeChars: 20,
  blockedTerms: [],
  guidance: "Short evaluation jobs only. No persistent workloads.",
  autoDecision: false,
};

const requestInput = {
  approverId: "",
  resource: "GPU node",
  accessLevel: "execute" as const,
  durationHours: 2,
  spendUsd: 4,
  startsAt: null,
  purpose: "Run the monthly evaluation suite for the release candidate.",
  details: "python eval.py",
};

const acceptAnalysis: Analyzer = async ({ requirements, request }) => {
  const checks = evaluateRequirements(requirements, request);
  const result: Analysis = {
    id: "analysis-1",
    createdAt: new Date().toISOString(),
    engine: "ollama",
    model: "test-model",
    verdict: "accept",
    confidence: 0.92,
    summary: "The job fits the limits and the short-job guidance.",
    reasons: [],
    risks: [],
    checks,
    durationMs: 800,
    error: null,
    overridden: false,
  };
  return result;
};

describe("approval accounts and sessions", () => {
  it("hashes the passcode, issues sessions and enforces the two-account cap", async () => {
    const first = await createFirstAccount(store, {
      name: "  Aadarsh ",
      passcode: FIRST_PASSCODE,
    });
    expect(first.account.name).toBe("Aadarsh");

    const raw = await readFile(store.filePath, "utf8");
    expect(raw).not.toContain(FIRST_PASSCODE);
    const parsed = JSON.parse(raw) as {
      accounts: { passcodeHash: string }[];
    };
    expect(parsed.accounts[0].passcodeHash).toMatch(/^[0-9a-f]{64}$/);

    expect(
      await login(store, { name: "Aadarsh", passcode: "wrong-pass-999" })
    ).toBeNull();
    const signedIn = await login(store, {
      name: "  aadarsh ",
      passcode: FIRST_PASSCODE,
    });
    expect(signedIn?.account.id).toBe(first.account.id);
    expect(
      await getSessionAccount(store, signedIn?.token ?? null)
    ).not.toBeNull();

    const invite = await createInvite(store, first.account.id);
    const second = await joinWithInvite(store, {
      code: invite.code,
      name: "Friend",
      passcode: SECOND_PASSCODE,
    });
    expect(second.account.name).toBe("Friend");

    await expect(createInvite(store, first.account.id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      joinWithInvite(store, {
        code: invite.code,
        name: "Third",
        passcode: "third-pass-789",
      })
    ).rejects.toBeInstanceOf(ApprovalError);

    await logout(store, signedIn?.token ?? null);
    expect(await getSessionAccount(store, signedIn?.token ?? null)).toBeNull();
  });

  it("rejects a wrong or reused invite code", async () => {
    const first = await createFirstAccount(store, {
      name: "Aadarsh",
      passcode: FIRST_PASSCODE,
    });
    const invite = await createInvite(store, first.account.id);
    await expect(
      joinWithInvite(store, {
        code: "AAAA-BBBB-CCCC",
        name: "Friend",
        passcode: SECOND_PASSCODE,
      })
    ).rejects.toThrow(/invalid or has expired/i);

    await joinWithInvite(store, {
      code: invite.code,
      name: "Friend",
      passcode: SECOND_PASSCODE,
    });
    await expect(
      joinWithInvite(store, {
        code: invite.code,
        name: "Other",
        passcode: "other-pass-789",
      })
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("requirements arming", () => {
  it("requires the passcode and typed confirmation to arm auto-decision", async () => {
    const { second } = await makeTwoAccounts();

    await expect(
      updateRequirements(store, second.account.id, {
        ...policyInput,
        autoDecision: true,
      })
    ).rejects.toThrow(/passcode/i);

    await expect(
      updateRequirements(
        store,
        second.account.id,
        { ...policyInput, autoDecision: true },
        { passcode: SECOND_PASSCODE }
      )
    ).rejects.toThrow(/type AUTO/i);

    await expect(
      updateRequirements(
        store,
        second.account.id,
        { ...policyInput, autoDecision: true },
        { passcode: "wrong-pass-999", confirm: "AUTO" }
      )
    ).rejects.toThrow(/incorrect/i);

    const armed = await updateRequirements(
      store,
      second.account.id,
      { ...policyInput, autoDecision: true },
      { passcode: SECOND_PASSCODE, confirm: "AUTO" }
    );
    expect(armed.autoDecision).toBe(true);
    expect(armed.autoArmedAt).not.toBeNull();

    await expect(
      updateRequirements(store, second.account.id, {
        ...policyInput,
        autoDecision: true,
      })
    ).rejects.toThrow(/passcode/i);

    const disarmed = await updateRequirements(store, second.account.id, {
      ...policyInput,
      autoDecision: false,
    });
    expect(disarmed.autoDecision).toBe(false);
    expect(disarmed.autoArmedAt).toBeNull();
  });
});

describe("request decisions", () => {
  it("records a human decision and refuses the requester as decider", async () => {
    const { first, second } = await makeTwoAccounts();
    await updateRequirements(store, second.account.id, policyInput);

    const created = await createAccessRequest(
      store,
      first.account.id,
      { ...requestInput, approverId: second.account.id },
      acceptAnalysis
    );
    expect(created.status).toBe("pending");
    expect(created.analysis?.engine).toBe("ollama");
    expect(created.decision).toBeNull();

    await expect(
      decideRequest(store, first.account.id, created.id, "accepted", "")
    ).rejects.toMatchObject({ status: 403 });

    const decided = await decideRequest(
      store,
      second.account.id,
      created.id,
      "accepted",
      "Fits the limits."
    );
    expect(decided.status).toBe("accepted");
    expect(decided.decision?.decider).toBe("human");
    expect(decided.decision?.deciderName).toBe("Friend");

    const dashboard = await dashboardFor(store, first.account.id);
    expect(dashboard.outgoing[0]?.status).toBe("accepted");
    expect(dashboard.recent[0]?.id).toBe(created.id);
  });

  it("lets the armed preset decide an accepted request", async () => {
    const { first, second } = await makeTwoAccounts();
    await updateRequirements(
      store,
      second.account.id,
      { ...policyInput, autoDecision: true },
      { passcode: SECOND_PASSCODE, confirm: "AUTO" }
    );

    const created = await createAccessRequest(
      store,
      first.account.id,
      { ...requestInput, approverId: second.account.id },
      acceptAnalysis
    );

    expect(created.status).toBe("accepted");
    expect(created.decision?.decider).toBe("auto");
    expect(created.decision?.deciderName).toBe("Friend");
    expect(created.decision?.note).toMatch(/every hard requirement passed/i);
  });
});
