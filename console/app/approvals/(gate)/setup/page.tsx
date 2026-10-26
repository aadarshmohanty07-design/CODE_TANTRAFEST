import { redirect } from "next/navigation";
import { AuthForm } from "@/components/approvals/AuthForm";
import { ollamaConfig } from "@/lib/approvals/ollama";
import { accountCount } from "@/lib/approvals/service";
import { currentApprovalAccount } from "@/lib/approvals/session";
import { getDefaultStore } from "@/lib/approvals/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up approvals" };

export default async function SetupPage() {
  const [count, session] = await Promise.all([
    accountCount(getDefaultStore()),
    currentApprovalAccount(),
  ]);
  if (session) redirect("/approvals");
  if (count > 0) redirect("/approvals/login");

  const setupCodeRequired = Boolean(process.env.APPROVALS_SETUP_CODE?.trim());
  const model = ollamaConfig().model;

  return (
    <div className="doc-page">
      <aside className="doc-margin">
        <div className="doc-folio">Approvals</div>
        <div className="doc-folio mt-1">First account</div>
        <div className="mt-7 border-t border-edge pt-3">
          <div className="doc-note">Two people</div>
          <div className="doc-note mt-1">Local model {model}</div>
          <div className="doc-note mt-1">No cloud calls</div>
        </div>
      </aside>

      <div className="doc-body approval-auth">
        <span className="doc-folio">Shared server access</span>
        <h1 className="doc-title mt-2">Set up this server</h1>
        <p className="doc-deck mt-4">
          Create the first account. You will invite the second person from your
          requirements page. Each person keeps their own passcode, requirements
          and request queue.
        </p>

        <div className="mt-5 border-l-2 border-edge pl-3 text-[11.5px] leading-relaxed text-dim">
          The first account controls who can join. Name it as yourself, not as
          the server. There is no passcode reset, so store the passcode before
          you continue.
        </div>

        <AuthForm mode="setup" setupCodeRequired={setupCodeRequired} />
      </div>
    </div>
  );
}
