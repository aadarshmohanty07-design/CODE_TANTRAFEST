import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ApprovalData } from "./types";

const STORE_VERSION = 1;

function emptyData(): ApprovalData {
  return {
    version: STORE_VERSION,
    accounts: [],
    sessions: [],
    invites: [],
    requests: [],
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isApprovalData(value: unknown): value is ApprovalData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ApprovalData>;
  return (
    data.version === STORE_VERSION &&
    Array.isArray(data.accounts) &&
    Array.isArray(data.sessions) &&
    Array.isArray(data.invites) &&
    Array.isArray(data.requests) &&
    data.accounts.every(
      (account) =>
        !!account &&
        typeof account.id === "string" &&
        typeof account.name === "string" &&
        typeof account.passcodeHash === "string" &&
        typeof account.passcodeSalt === "string" &&
        !!account.requirements &&
        isStringArray(account.requirements.allowedResources)
    )
  );
}

function pruneSessions(data: ApprovalData): void {
  const now = Date.now();
  data.sessions = data.sessions.filter(
    (session) => Date.parse(session.expiresAt) > now
  );
  data.invites = data.invites.filter(
    (invite) => invite.usedAt !== null || Date.parse(invite.expiresAt) > now
  );
}

export class ApprovalStore {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async read(): Promise<ApprovalData> {
    await this.tail.catch(() => undefined);
    return this.readDirect();
  }

  async mutate<T>(fn: (data: ApprovalData) => T | Promise<T>): Promise<T> {
    const task = this.tail.then(async () => {
      const data = await this.readDirect();
      pruneSessions(data);
      const result = await fn(data);
      await this.writeDirect(data);
      return result;
    });
    this.tail = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  private async readDirect(): Promise<ApprovalData> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyData();
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Approval data at ${this.filePath} is not valid JSON.`);
    }
    if (!isApprovalData(parsed)) {
      throw new Error(
        `Approval data at ${this.filePath} does not match version ${STORE_VERSION}.`
      );
    }
    return parsed;
  }

  private async writeDirect(data: ApprovalData): Promise<void> {
    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temp = path.join(
      directory,
      `.${path.basename(this.filePath)}.${process.pid}.${randomUUID()}.tmp`
    );
    await fs.writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
    try {
      await fs.rename(temp, this.filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST" || code === "EPERM") {
        await fs.rm(this.filePath, { force: true });
        await fs.rename(temp, this.filePath);
      } else {
        await fs.rm(temp, { force: true });
        throw error;
      }
    }
  }
}

type StoreGlobal = typeof globalThis & {
  __aegisApprovalStores?: Map<string, ApprovalStore>;
};

export function defaultApprovalFile(): string {
  return path.join(process.cwd(), ".data", "approvals.json");
}

export function getDefaultStore(): ApprovalStore {
  const filePath = defaultApprovalFile();
  const scope = globalThis as StoreGlobal;
  if (!scope.__aegisApprovalStores) {
    scope.__aegisApprovalStores = new Map();
  }
  let store = scope.__aegisApprovalStores.get(filePath);
  if (!store) {
    store = new ApprovalStore(filePath);
    scope.__aegisApprovalStores.set(filePath, store);
  }
  return store;
}
