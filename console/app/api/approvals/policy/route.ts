import { NextResponse, type NextRequest } from "next/server";
import {
  assertSameOrigin,
  jsonError,
  readJson,
  requireApiAccount,
} from "@/lib/approvals/http";
import { updateRequirements } from "@/lib/approvals/service";
import { getDefaultStore } from "@/lib/approvals/store";
import { policySchema } from "@/lib/approvals/validation";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const account = await requireApiAccount(request);
    const parsed = policySchema.parse(await readJson(request));
    const { passcode, confirm, ...requirements } = parsed;
    const updated = await updateRequirements(
      getDefaultStore(),
      account.id,
      requirements,
      { passcode, confirm }
    );
    return NextResponse.json({ requirements: updated });
  } catch (error) {
    return jsonError(error);
  }
}
