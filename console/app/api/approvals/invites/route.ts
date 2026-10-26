import { NextResponse, type NextRequest } from "next/server";
import {
  assertSameOrigin,
  jsonError,
  requireApiAccount,
} from "@/lib/approvals/http";
import { createInvite } from "@/lib/approvals/service";
import { getDefaultStore } from "@/lib/approvals/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const account = await requireApiAccount(request);
    const invite = await createInvite(getDefaultStore(), account.id);
    return NextResponse.json(invite);
  } catch (error) {
    return jsonError(error);
  }
}
