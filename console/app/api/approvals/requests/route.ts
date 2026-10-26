import { NextResponse, type NextRequest } from "next/server";
import {
  assertSameOrigin,
  jsonError,
  readJson,
  requireApiAccount,
} from "@/lib/approvals/http";
import { createAccessRequest } from "@/lib/approvals/service";
import { getDefaultStore } from "@/lib/approvals/store";
import { requestSchema } from "@/lib/approvals/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const account = await requireApiAccount(request);
    const input = requestSchema.parse(await readJson(request));
    const created = await createAccessRequest(
      getDefaultStore(),
      account.id,
      input
    );
    return NextResponse.json({
      id: created.id,
      status: created.status,
      decision: created.decision,
    });
  } catch (error) {
    return jsonError(error);
  }
}
