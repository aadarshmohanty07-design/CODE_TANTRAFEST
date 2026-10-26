import { NextResponse, type NextRequest } from "next/server";
import {
  assertSameOrigin,
  attachSession,
  clientIp,
  hitRateLimit,
  jsonError,
  readJson,
} from "@/lib/approvals/http";
import {
  ApprovalError,
  joinWithInvite,
} from "@/lib/approvals/service";
import { getDefaultStore } from "@/lib/approvals/store";
import { joinSchema } from "@/lib/approvals/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (hitRateLimit(`join:${clientIp(request)}`, 10)) {
      throw new ApprovalError("Too many attempts. Try again later.", 429);
    }
    const input = joinSchema.parse(await readJson(request));
    if (input.passcode !== input.confirm) {
      throw new ApprovalError("The two passcodes do not match.");
    }
    const result = await joinWithInvite(getDefaultStore(), {
      code: input.code,
      name: input.name,
      passcode: input.passcode,
    });
    const response = NextResponse.json({ account: result.account });
    attachSession(response, result.token, request);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
