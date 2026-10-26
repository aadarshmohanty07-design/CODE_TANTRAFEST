import { cookies } from "next/headers";
import { getSessionAccount } from "./service";
import { getDefaultStore } from "./store";
import type { Account, ApprovalData } from "./types";

export const SESSION_COOKIE = "aegis_approvals_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export async function currentApprovalAccount(): Promise<{
  account: Account;
  data: ApprovalData;
} | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? null;
  return getSessionAccount(getDefaultStore(), token);
}
