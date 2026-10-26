import { redirect } from "next/navigation";
import { AuthForm } from "@/components/approvals/AuthForm";
import { accountCount } from "@/lib/approvals/service";
import { currentApprovalAccount } from "@/lib/approvals/session";
import { getDefaultStore } from "@/lib/approvals/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join approvals" };

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const [count, session, params] = await Promise.all([
    accountCount(getDefaultStore()),
    currentApprovalAccount(),
    searchParams,
  ]);
  if (count === 0) redirect("/approvals/setup");
  if (count >= 2) redirect("/approvals/login");
  if (session) redirect("/approvals");

  return (
    <div className="doc-page">
      <aside className="doc-margin">
        <div className="doc-folio">Approvals</div>
        <div className="doc-folio mt-1">Second account</div>
        <div className="mt-7 border-t border-edge pt-3">
          <div className="doc-note">One-time invite</div>
          <div className="doc-note mt-1">Own passcode</div>
          <div className="doc-note mt-1">Own requirements</div>
        </div>
      </aside>

      <div className="doc-body approval-auth">
        <span className="doc-folio">Shared server access</span>
        <h1 className="doc-title mt-2">Create your account</h1>
        <p className="doc-deck mt-4">
          The first person generated an invite code for this server. Your
          account gets its own requirements preset and request queue; it does
          not inherit theirs.
        </p>

        <div className="mt-5 border-l-2 border-edge pl-3 text-[11.5px] leading-relaxed text-dim">
          The invite works once and expires after 24 hours. If it has expired,
          ask the first person for a new code.
        </div>

        <AuthForm mode="join" initialCode={params.code ?? ""} />
      </div>
    </div>
  );
}
