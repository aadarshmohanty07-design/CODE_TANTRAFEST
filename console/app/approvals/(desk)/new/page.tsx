import Link from "next/link";
import { NewRequestForm } from "@/components/approvals/NewRequestForm";
import { getOllamaStatus, ollamaConfig } from "@/lib/approvals/ollama";
import { dashboardFor } from "@/lib/approvals/service";
import { currentApprovalAccount } from "@/lib/approvals/session";
import { getDefaultStore } from "@/lib/approvals/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request access" };

export default async function NewRequestPage() {
  const session = await currentApprovalAccount();
  if (!session) return null;
  const dashboard = await dashboardFor(getDefaultStore(), session.account.id);
  const model = await getOllamaStatus(ollamaConfig());
  const modelReady = model.reachable && model.installed === true;
  const approvers = dashboard.others;

  return (
    <div className="doc-page">
      <aside className="doc-margin">
        <div className="doc-folio">New request</div>
        <div className="doc-folio mt-1">
          {approvers[0]?.name ?? "No approver yet"}
        </div>
        <div className="mt-7 border-t border-edge pt-3">
          <div className="doc-note">
            {modelReady ? "Model ready" : "Rule checks only"}
          </div>
          <div className="doc-note mt-1">{model.model}</div>
        </div>
      </aside>

      <div className="doc-body">
        <Link href="/approvals" className="arrow-link">
          All requests
        </Link>
        <span className="doc-folio mt-5 block">Shared server access</span>
        <h1 className="doc-title mt-2">Request access</h1>

        {approvers.length === 0 ? (
          <>
            <p className="doc-deck mt-4">
              There is no second account on this server yet, so there is nobody
              to review a request. Create an invite first.
            </p>
            <div className="mt-5">
              <Link href="/approvals/policy#invite" className="btn btn-primary">
                Go to the invite
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="doc-deck mt-4">
              Ask {approvers.map((account) => account.name).join(" or ")} for
              time on the shared server. The request is checked against their
              requirements preset, then read by the local model before it lands
              in their queue.
            </p>
            <NewRequestForm
              approvers={approvers}
              modelReady={modelReady}
              modelLabel={model.model}
            />
          </>
        )}
      </div>
    </div>
  );
}
