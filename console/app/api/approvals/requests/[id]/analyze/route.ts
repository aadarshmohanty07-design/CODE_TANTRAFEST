import { NextResponse, type NextRequest } from "next/server";
import {
  assertSameOrigin,
  hitRateLimit,
  jsonError,
  requireApiAccount,
} from "@/lib/approvals/http";
import {
  ApprovalError,
  reanalyzeRequest,
} from "@/lib/approvals/service";
import { getDefaultStore } from "@/lib/approvals/store";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const account = await requireApiAccount(request);
    if (hitRateLimit(`analyze:${account.id}`, 12)) {
      throw new ApprovalError(
        "Too many model checks. Wait ten minutes and try again.",
        429
      );
    }
    const { id } = await params;
    const updated = await reanalyzeRequest(getDefaultStore(), account.id, id);
    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      decision: updated.decision,
      analysis: updated.analysis
        ? {
            verdict: updated.analysis.verdict,
            confidence: updated.analysis.confidence,
            engine: updated.analysis.engine,
          }
        : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
