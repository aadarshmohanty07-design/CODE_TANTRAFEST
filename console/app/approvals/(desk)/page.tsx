import Link from "next/link";
import { AutoRefresh } from "@/components/approvals/AutoRefresh";
import { StatusPill } from "@/components/ui";
import { dashboardFor } from "@/lib/approvals/service";
import { getDefaultStore } from "@/lib/approvals/store";
import {
  engineLabel,
  plural,
  requestStatus,
  verdictStatus,
  verdictText,
  whenShort,
  whenUtc,
} from "@/lib/approvals/presentation";
import {
  AUTO_CONFIDENCE_THRESHOLD,
  accessLevelLabel,
  formatHours,
  formatUsd,
} from "@/lib/approvals/requirements";
import { ollamaConfig, getOllamaStatus } from "@/lib/approvals/ollama";
import { currentApprovalAccount } from "@/lib/approvals/session";
import type { Analysis } from "@/lib/approvals/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Access requests" };

function Review({ analysis }: { analysis: Analysis | null }) {
  if (!analysis) {
    return <span className="doc-folio">Not reviewed</span>;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <StatusPill status={verdictStatus(analysis.verdict)}>
        {verdictText(analysis.verdict)}
      </StatusPill>
      <span className="doc-folio">
        {analysis.engine === "ollama"
          ? `${Math.round(analysis.confidence * 100)}%`
          : engineLabel(analysis.engine).toLocaleLowerCase("en-US")}
      </span>
    </div>
  );
}

export default async function ApprovalsPage() {
  const session = await currentApprovalAccount();
  if (!session) return null;
  const store = getDefaultStore();
  const [dashboard, model] = await Promise.all([
    dashboardFor(store, session.account.id),
    getOllamaStatus(ollamaConfig()),
  ]);
  const other = dashboard.others[0] ?? null;
  const modelReady = model.reachable && model.installed === true;
  const auto = dashboard.requirements.autoDecision;
  const noResources = dashboard.requirements.allowedResources.length === 0;

  return (
    <div className="doc-page">
      <aside className="doc-margin">
        <div className="doc-folio">Approvals</div>
        <div className="doc-folio mt-1">
          {new Date().toISOString().slice(0, 10)}
        </div>
        <div className="doc-folio mt-1">{dashboard.account.name}</div>
        <div className="mt-7 border-t border-edge pt-3">
          <div className="doc-note">
            {plural(dashboard.incoming.length, "request")} waiting
          </div>
          <div className="doc-note mt-1">
            {plural(dashboard.outgoing.length, "request")} sent
          </div>
          <div className="doc-note mt-1">
            Auto-decision {auto ? "armed" : "off"}
          </div>
          <div className="doc-note mt-1">
            Ollama {modelReady ? "ready" : model.reachable ? "incomplete" : "offline"}
          </div>
        </div>
        {auto ? (
          <div className="mt-6">
            <span className="doc-stamp">Auto armed</span>
          </div>
        ) : null}
      </aside>

      <div className="doc-body">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="doc-folio">Shared server access, both directions</span>
          <AutoRefresh />
        </div>

        <h1 className="doc-title mt-2">Access requests</h1>
        <p className="doc-deck mt-4">
          {other
            ? `This server is shared by ${dashboard.account.name} and ${other.name}. Requests are checked against the approver's requirements, then wait for a person unless that approver armed auto-decision.`
            : "Only one account exists on this server. Create an invite so the other person can join and requests have somewhere to go."}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          {other ? (
            <Link href="/approvals/new" className="btn btn-primary">
              Request access
            </Link>
          ) : (
            <Link href="/approvals/policy#invite" className="btn btn-primary">
              Invite the other person
            </Link>
          )}
          <Link href="/approvals/policy" className="arrow-link">
            Edit requirements
          </Link>
        </div>

        {!modelReady ? (
          <div className="mt-6 border-l-2 border-signal pl-3 text-[11.5px] leading-relaxed text-dim">
            <span className="text-signal">
              Ollama is {model.reachable ? "missing the configured model" : "offline"}.
            </span>{" "}
            Requests still get deterministic hard-limit checks. The model cannot
            recommend or auto-decide until {model.model} is available on this
            server.
            {model.error ? (
              <span className="mt-1 block text-faint">{model.error}</span>
            ) : null}
          </div>
        ) : null}

        {auto ? (
          <div className="mt-6 border-l-2 border-danger pl-3 text-[11.5px] leading-relaxed text-dim">
            <span className="text-danger">Auto-decision is armed.</span> New
            requests that pass every hard limit and reach{" "}
            {Math.round(AUTO_CONFIDENCE_THRESHOLD * 100)}% model confidence will
            be decided without you.{" "}
            <Link href="/approvals/policy" className="link-underline">
              Review the preset
            </Link>
            .
          </div>
        ) : null}

        {noResources ? (
          <div className="mt-4 border-l-2 border-signal pl-3 text-[11.5px] leading-relaxed text-dim">
            <span className="text-signal">
              Your own preset has no approved resources.
            </span>{" "}
            Requests sent to you would be refused. Set it when you are ready to
            approve.{" "}
            <Link href="/approvals/policy" className="link-underline">
              Set the preset
            </Link>
            .
          </div>
        ) : null}

        <section className="doc-section">
          <div className="doc-section-head">
            <h2 className="doc-section-title">Waiting for your decision</h2>
            <span className="doc-folio">{plural(dashboard.incoming.length, "request")}</span>
          </div>
          {dashboard.incoming.length === 0 ? (
            <p className="doc-note">
              Nothing is waiting. New requests appear here automatically.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="doc-ledger">
                <thead>
                  <tr>
                    <th>Requester</th>
                    <th>Resource</th>
                    <th>Access</th>
                    <th>Review</th>
                    <th>Received</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.incoming.map((request) => (
                    <tr key={request.id}>
                      <td>{request.requesterName}</td>
                      <td>
                        <Link
                          href={`/approvals/requests/${request.id}`}
                          className="link-underline"
                        >
                          {request.resource}
                        </Link>
                      </td>
                      <td>
                        {accessLevelLabel(request.accessLevel)},{" "}
                        {formatHours(request.durationHours)}
                      </td>
                      <td>
                        <Review analysis={request.analysis} />
                      </td>
                      <td className="whitespace-nowrap text-[10.5px] text-faint">
                        {whenShort(request.createdAt)}
                      </td>
                      <td>
                        <Link
                          href={`/approvals/requests/${request.id}`}
                          className="arrow-link whitespace-nowrap text-[10.5px]"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="doc-section">
          <div className="doc-section-head">
            <h2 className="doc-section-title">Your requests</h2>
            <Link href={other ? "/approvals/new" : "/approvals/policy#invite"} className="arrow-link text-[10.5px]">
              {other ? "New request" : "Invite first"}
            </Link>
          </div>
          {dashboard.outgoing.length === 0 ? (
            <p className="doc-note">
              You have not asked for access yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="doc-ledger">
                <thead>
                  <tr>
                    <th>Approver</th>
                    <th>Resource</th>
                    <th>Review</th>
                    <th>Status</th>
                    <th>Sent</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.outgoing.map((request) => {
                    const status = requestStatus(request);
                    return (
                      <tr key={request.id}>
                        <td>{request.approverName}</td>
                        <td>
                          <Link
                            href={`/approvals/requests/${request.id}`}
                            className="link-underline"
                          >
                            {request.resource}
                          </Link>
                        </td>
                        <td>
                          <Review analysis={request.analysis} />
                        </td>
                        <td>
                          <StatusPill status={status.status}>
                            {status.label}
                          </StatusPill>
                        </td>
                        <td className="whitespace-nowrap text-[10.5px] text-faint">
                          {whenShort(request.createdAt)}
                        </td>
                        <td>
                          <Link
                            href={`/approvals/requests/${request.id}`}
                            className="arrow-link whitespace-nowrap text-[10.5px]"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {dashboard.recent.length > 0 ? (
          <section className="doc-section">
            <div className="doc-section-head">
              <h2 className="doc-section-title">Recent decisions</h2>
              <span className="doc-folio">{plural(dashboard.recent.length, "decision")}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="doc-ledger">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Outcome</th>
                    <th>Decided by</th>
                    <th>When</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recent.map((request) => {
                    const status = requestStatus(request);
                    return (
                      <tr key={request.id}>
                        <td>
                          <Link
                            href={`/approvals/requests/${request.id}`}
                            className="link-underline"
                          >
                            {request.resource}
                          </Link>
                        </td>
                        <td>
                          <StatusPill status={status.status}>
                            {status.label}
                          </StatusPill>
                        </td>
                        <td>
                          {request.decision?.decider === "auto"
                            ? `Automatic, ${request.approverName}`
                            : request.decision?.deciderName ?? "—"}
                        </td>
                        <td className="whitespace-nowrap text-[10.5px] text-faint">
                          {whenShort(request.decision?.at)}
                        </td>
                        <td>
                          <Link
                            href={`/approvals/requests/${request.id}`}
                            className="arrow-link whitespace-nowrap text-[10.5px]"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="doc-section">
          <div className="doc-section-head">
            <h2 className="doc-section-title">Your requirements</h2>
            <Link href="/approvals/policy" className="arrow-link text-[10.5px]">
              Edit preset
            </Link>
          </div>
          <table className="doc-ledger">
            <tbody>
              <tr>
                <th className="w-[180px]">Approved resources</th>
                <td>
                  {dashboard.requirements.allowedResources.length > 0
                    ? dashboard.requirements.allowedResources.join(", ")
                    : "None. Every request is refused."}
                </td>
              </tr>
              <tr>
                <th>Maximum duration</th>
                <td>{formatHours(dashboard.requirements.maxDurationHours)}</td>
              </tr>
              <tr>
                <th>Maximum spend</th>
                <td>{formatUsd(dashboard.requirements.maxSpendUsd)}</td>
              </tr>
              <tr>
                <th>Access</th>
                <td>
                  Read allowed
                  {dashboard.requirements.allowExecute ? ", execute allowed" : ""}
                  {dashboard.requirements.allowAdmin ? ", admin allowed" : ""}
                </td>
              </tr>
              <tr>
                <th>Auto-decision</th>
                <td>
                  {auto
                    ? `Armed ${whenUtc(dashboard.requirements.autoArmedAt)}`
                    : "Off. A person decides every request."}
                </td>
              </tr>
              <tr>
                <th>Local model</th>
                <td>
                  {model.model},{" "}
                  {modelReady
                    ? "ready"
                    : model.reachable
                      ? "model not installed"
                      : "unreachable"}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
