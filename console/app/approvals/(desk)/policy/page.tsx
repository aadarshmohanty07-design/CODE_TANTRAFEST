import Link from "next/link";
import { InvitePanel } from "@/components/approvals/InvitePanel";
import { PolicyForm } from "@/components/approvals/PolicyForm";
import { getOllamaStatus, ollamaConfig } from "@/lib/approvals/ollama";
import { whenUtc } from "@/lib/approvals/presentation";
import { dashboardFor } from "@/lib/approvals/service";
import { currentApprovalAccount } from "@/lib/approvals/session";
import { getDefaultStore } from "@/lib/approvals/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Requirements preset" };

export default async function PolicyPage() {
  const session = await currentApprovalAccount();
  if (!session) return null;
  const dashboard = await dashboardFor(getDefaultStore(), session.account.id);
  const model = await getOllamaStatus(ollamaConfig());
  const modelReady = model.reachable && model.installed === true;
  const other = dashboard.others[0] ?? null;
  const armed = dashboard.requirements.autoDecision;

  return (
    <div className="doc-page">
      <aside className="doc-margin">
        <div className="doc-folio">Requirements</div>
        <div className="doc-folio mt-1">{dashboard.account.name}</div>
        <div className="mt-7 border-t border-edge pt-3">
          <div className="doc-note">
            Auto-decision {armed ? "armed" : "off"}
          </div>
          {armed ? (
            <div className="doc-note mt-1">
              Since {whenUtc(dashboard.requirements.autoArmedAt)}
            </div>
          ) : (
            <div className="doc-note mt-1">A person decides</div>
          )}
          <div className="doc-note mt-1">
            Model {modelReady ? "ready" : "not ready"}
          </div>
        </div>
        {armed ? (
          <div className="mt-6">
            <span className="doc-stamp">Auto armed</span>
          </div>
        ) : null}
      </aside>

      <div className="doc-body">
        <Link href="/approvals" className="arrow-link">
          All requests
        </Link>
        <span className="doc-folio mt-5 block">Approver settings</span>
        <h1 className="doc-title mt-2">Requirements preset</h1>
        <p className="doc-deck mt-4">
          Every request for your server is checked against this preset. Resource,
          duration, spend, access level, purpose length and blocked terms are
          enforced in code. The local model reads the purpose against your
          guidance and recommends the rest.
        </p>

        {!modelReady ? (
          <div className="mt-5 border-l-2 border-signal pl-3 text-[11.5px] leading-relaxed text-dim">
            <span className="text-signal">The local model is not ready.</span>{" "}
            Requests get hard-limit checks only, and auto-decision stays paused
            until Ollama is running with {model.model}.
          </div>
        ) : null}

        <PolicyForm requirements={dashboard.requirements} />

        <section id="invite" className="doc-section">
          <div className="doc-section-head">
            <h2 className="doc-section-title">Second person</h2>
            <span className="doc-folio">
              {other ? "account exists" : "one invite remaining"}
            </span>
          </div>
          <InvitePanel other={other} />
        </section>
      </div>
    </div>
  );
}
