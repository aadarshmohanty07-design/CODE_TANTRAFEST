import { redirect } from "next/navigation";
import { AuthForm } from "@/components/approvals/AuthForm";
import { ollamaConfig } from "@/lib/approvals/ollama";
import { accountCount } from "@/lib/approvals/service";
import { currentApprovalAccount } from "@/lib/approvals/session";
import { getDefaultStore } from "@/lib/approvals/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in to approvals" };

export default async function LoginPage() {
  const [count, session] = await Promise.all([
    accountCount(getDefaultStore()),
    currentApprovalAccount(),
  ]);
  if (count === 0) redirect("/approvals/setup");
  if (session) redirect("/approvals");

  const model = ollamaConfig().model;

  return (
    <div className="doc-page">
      <aside className="doc-margin">
        <div className="doc-folio">Approvals</div>
        <div className="doc-folio mt-1">Two-person server</div>
        <div className="mt-7 border-t border-edge pt-3">
          <div className="doc-note">Ollama {model}</div>
          <div className="doc-note mt-1">Decisions stay on this server</div>
        </div>
      </aside>

      <div className="doc-body approval-auth">
        <span className="doc-folio">Shared server access</span>
        <h1 className="doc-title mt-2">Sign in</h1>
        <p className="doc-deck mt-4">
          Use the name and passcode you created. Requests and requirements are
          stored per account, so the other person never acts as you.
        </p>

        <AuthForm mode="login" showJoin={count < 2} />
      </div>
    </div>
  );
}
