import { NextResponse, type NextRequest } from "next/server";
import {
  assertSameOrigin,
  clearSession,
  jsonError,
} from "@/lib/approvals/http";
import { SESSION_COOKIE } from "@/lib/approvals/session";
import { logout } from "@/lib/approvals/service";
import { getDefaultStore } from "@/lib/approvals/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;
    await logout(getDefaultStore(), token);
    const response = NextResponse.json({ ok: true });
    clearSession(response);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
