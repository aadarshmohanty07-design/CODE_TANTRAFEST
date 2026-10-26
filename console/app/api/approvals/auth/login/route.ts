import { NextResponse, type NextRequest } from "next/server";
import { nameKey } from "@/lib/approvals/auth";
import {
  assertSameOrigin,
  attachSession,
  clearRateLimit,
  clientIp,
  hitRateLimit,
  jsonError,
  readJson,
} from "@/lib/approvals/http";
import { ApprovalError, login } from "@/lib/approvals/service";
import { getDefaultStore } from "@/lib/approvals/store";
import { loginSchema } from "@/lib/approvals/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = loginSchema.parse(await readJson(request));
    const key = `login:${clientIp(request)}:${nameKey(input.name)}`;
    if (hitRateLimit(key, 6)) {
      throw new ApprovalError(
        "Too many sign-in attempts. Wait ten minutes and try again.",
        429
      );
    }

    const result = await login(getDefaultStore(), {
      name: input.name,
      passcode: input.passcode,
    });
    if (!result) {
      throw new ApprovalError("Name or passcode is incorrect.", 401);
    }
    clearRateLimit(key);

    const response = NextResponse.json({ account: result.account });
    attachSession(response, result.token, request);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
