import { NextResponse, type NextRequest } from "next/server";
import { setupCodeMatches } from "@/lib/approvals/auth";
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
  createFirstAccount,
} from "@/lib/approvals/service";
import { getDefaultStore } from "@/lib/approvals/store";
import { setupSchema } from "@/lib/approvals/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const ip = clientIp(request);
    if (hitRateLimit(`setup:${ip}`, 5, 60 * 60 * 1000)) {
      throw new ApprovalError("Too many setup attempts. Try again later.", 429);
    }
    const input = setupSchema.parse(await readJson(request));
    if (input.passcode !== input.confirm) {
      throw new ApprovalError("The two passcodes do not match.");
    }
    const requiredCode = process.env.APPROVALS_SETUP_CODE?.trim();
    if (requiredCode && !setupCodeMatches(input.setupCode, requiredCode)) {
      throw new ApprovalError("The setup code is incorrect.", 403);
    }

    const result = await createFirstAccount(getDefaultStore(), {
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
