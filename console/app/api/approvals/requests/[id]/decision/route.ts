import { NextResponse, type NextRequest } from "next/server";
import {
  assertSameOrigin,
  jsonError,
  readJson,
  requireApiAccount,
} from "@/lib/approvals/http";
import { decideRequest } from "@/lib/approvals/service";
import { getDefaultStore } from "@/lib/approvals/store";
import { decisionSchema } from "@/lib/approvals/validation";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const account = await requireApiAccount(request);
    const input = decisionSchema.parse(await readJson(request));
    const { id } = await params;
    const updated = await decideRequest(
      getDefaultStore(),
      account.id,
      id,
      input.status,
      input.note
    );
    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      decision: updated.decision,
    });
  } catch (error) {
    return jsonError(error);
  }
}
