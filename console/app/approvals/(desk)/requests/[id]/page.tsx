import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/approvals/AutoRefresh";
import { DecisionPanel } from "@/components/approvals/DecisionPanel";
import { StatusPill } from "@/components/ui";
import {
  confidenceLabel,
  decisionLine,
  engineLabel,
  requestStatus,
  shortId,
  verdictText,
  whenUtc,
} from "@/lib/approvals/presentation";
import {
  accessLevelLabel,
  formatHours,
  formatUsd,
} from "@/lib/approvals/requirements";
import { requestFor } from "@/lib/approvals/service";
import { currentApprovalAccount } from "@/lib/approvals/session";
import { getDefaultStore } from "@/lib/approvals/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Access request" };

export default async function RequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await currentApprovalAccount();
  if (!session) return null;
  const { id } = await params;
  const request = await requestFor(getDefaultStore(), session.account.id, id);
  if (!request) notFound();

  const isApprover = request.approverId === session.account.id;
  const pending = request.status === "pending" && !request.decision;
  const status = requestStatus(request);
  const analysis = request.analysis;
  const decision = request.decision;
  const outcomeClass =
    decision?.status === "accepted" ? "text-safe" : "text-danger";
  const verdictClass =
    analysis?.verdict === "accept"
      ? "text-safe"
      : analysis?.verdict === "reject"
        ? "text-danger"
        : "text-signal";

  return (
    <div className="doc-page">
      <aside className="doc-margin">
        <div className="doc-folio">Request {shortId(request.id)}</div>
        <div className="doc-folio mt-1">From {request.requesterName}</div>
        <div className="doc-folio mt-1">To {request.approverName}</div>
        <div className="mt-7 border-t border-edge pt-3">
          <StatusPill status={status.status}>{status.label}</StatusPill>
          {analysis ? (
            <div className="doc-note mt-2">
              Review: {verdictText(analysis.verdict).toLocaleLowerCase("en-US")}
              {analysis.engine === "ollama"
                ? `, ${confidenceLabel(analysis)}`
                : ", rule check"}
            </div>
          ) : (
            <div className="doc-note mt-2">No review stored</div>
          )}
          {decision ? (
            <div className="doc-note mt-1">
              {decision.decider === "auto" ? "Automatic" : "By person"}
            </div>
          ) : null}
        </div>
        {decision?.decider === "auto" ? (
          <div className="mt-6">
            <span className="doc-stamp">Decided by preset</span>
          </div>
        ) : null}
      </aside>

      <div className="doc-body">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link href="/approvals" className="arrow-link">
            All requests
          </Link>
          {pending ? (
            <AutoRefresh />
          ) : (
            <span className="doc-folio">{whenUtc(request.updatedAt)}</span>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
          <span className="doc-folio">Access request, {shortId(request.id)}</span>
          <StatusPill status={status.status}>{status.label}</StatusPill>
        </div>
        <h1 className="doc-title mt-2 break-words">{request.resource}</h1>
        <p className="doc-deck mt-4">
          {accessLevelLabel(request.accessLevel)} access for{" "}
          {formatHours(request.durationHours)}, requested by{" "}
          {request.requesterName}. Reviewed against {request.approverName}&apos;s
          requirements preset.
        </p>

        {decision ? (
          <section className="doc-section">
            <div className="doc-section-head">
              <h2 className="doc-section-title">Decision</h2>
              <span className="doc-folio">{decisionLine(decision)}</span>
            </div>
            <div className={`approval-verdict ${outcomeClass}`}>
              {decision.status === "accepted"
                ? "Access accepted"
                : "Access rejected"}
            </div>
            <p className="mt-3 max-w-[68ch] text-[13px] leading-relaxed text-dim">
              {decision.note ||
                "No decision note was recorded. The record below still shows who decided and when."}
            </p>
            <table className="doc-ledger mt-5">
              <tbody>
                <tr>
                  <th className="w-[160px]">Decided by</th>
                  <td>
                    {decision.decider === "auto"
                      ? `${decision.deciderName}, automatic preset`
                      : decision.deciderName}
                  </td>
                </tr>
                <tr>
                  <th>Mode</th>
                  <td>
                    {decision.decider === "auto"
                      ? `Auto-decision, ${engineLabel(decision.engine ?? "rules").toLocaleLowerCase("en-US")}`
                      : "Human decision"}
                  </td>
                </tr>
                <tr>
                  <th>Decided at</th>
                  <td>{whenUtc(decision.at)}</td>
                </tr>
                <tr>
                  <th>Review used</th>
                  <td>
                    {analysis
                      ? `${verdictText(analysis.verdict)}, ${
                          analysis.engine === "ollama"
                            ? confidenceLabel(analysis)
                            : "rule check"
                        }`
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        ) : null}

        <section className="doc-section">
          <div className="doc-section-head">
            <h2 className="doc-section-title">The request</h2>
            <span className="doc-folio">{whenUtc(request.createdAt)}</span>
          </div>
          <table className="doc-ledger">
            <tbody>
              <tr>
                <th className="w-[160px]">Requester</th>
                <td>{request.requesterName}</td>
              </tr>
              <tr>
                <th>Approver</th>
                <td>{request.approverName}</td>
              </tr>
              <tr>
                <th>Access</th>
                <td>{accessLevelLabel(request.accessLevel)}</td>
              </tr>
              <tr>
                <th>Duration</th>
                <td>{formatHours(request.durationHours)}</td>
              </tr>
              <tr>
                <th>Spend</th>
                <td>{formatUsd(request.spendUsd)}</td>
              </tr>
              <tr>
                <th>Requested start</th>
                <td>{request.startsAt ? whenUtc(request.startsAt) : "Not specified"}</td>
              </tr>
              <tr>
                <th>Request id</th>
                <td className="font-mono text-[11px]">{request.id}</td>
              </tr>
            </tbody>
          </table>

          <h3 className="doc-section-title mt-7 text-[15px]">Purpose</h3>
          <p className="mt-2 max-w-[68ch] whitespace-pre-wrap text-[13px] leading-relaxed text-dim">
            {request.purpose}
          </p>

          {request.details ? (
            <>
              <h3 className="doc-section-title mt-6 text-[15px]">
                Technical detail
              </h3>
              <p className="mt-2 max-w-[68ch] whitespace-pre-wrap text-[13px] leading-relaxed text-dim">
                {request.details}
              </p>
            </>
          ) : null}
        </section>

        <section className="doc-section">
          <div className="doc-section-head">
            <h2 className="doc-section-title">Requirements check</h2>
            {analysis ? (
              <span className="doc-folio">
                {engineLabel(analysis.engine)}
                {analysis.model ? `, ${analysis.model}` : ""}
              </span>
            ) : (
              <span className="doc-folio">not run</span>
            )}
          </div>

          {!analysis ? (
            <p className="doc-note">
              No review is stored for this request.{" "}
              {isApprover && pending
                ? "Use Check again below to run it."
                : "The approver can run it."}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className={`approval-verdict ${verdictClass}`}>
                  {verdictText(analysis.verdict)}
                </div>
                <div className="text-right">
                  <div className="doc-folio">
                    {analysis.engine === "ollama"
                      ? `${confidenceLabel(analysis)} confidence`
                      : "hard limits only"}
                  </div>
                  <div className="doc-folio mt-1">
                    {whenUtc(analysis.createdAt)}
                  </div>
                  <div className="doc-folio mt-1">
                    {Math.max(1, Math.round(analysis.durationMs / 1000))} s
                  </div>
                </div>
              </div>
              <p className="mt-4 max-w-[70ch] text-[13px] leading-relaxed text-dim">
                {analysis.summary}
              </p>

              {analysis.error ? (
                <div className="mt-4 border-l-2 border-signal pl-3 text-[11.5px] leading-relaxed text-dim">
                  <span className="text-signal">
                    The local model did not answer.
                  </span>{" "}
                  The checks below are deterministic. Auto-decision will stay
                  paused for this request unless a hard limit already rejects
                  it.
                  <span className="mt-1 block break-words text-faint">
                    {analysis.error}
                  </span>
                </div>
              ) : null}

              {analysis.overridden ? (
                <div className="mt-4 border-l-2 border-danger pl-3 text-[11.5px] leading-relaxed text-dim">
                  <span className="text-danger">
                    The model&apos;s recommendation was overridden.
                  </span>{" "}
                  A hard requirement failed, and the requirements preset is
                  enforced in code.
                </div>
              ) : null}

              {analysis.engine === "rules" && !analysis.error ? (
                <p className="mt-4 text-[11px] leading-relaxed text-faint">
                  The request was rejected by a hard limit before a model call.
                </p>
              ) : null}

              <h3 className="doc-section-title mt-7 text-[15px]">
                Hard requirements
              </h3>
              <div className="overflow-x-auto">
                <table className="doc-ledger mt-2">
                  <thead>
                    <tr>
                      <th>Requirement</th>
                      <th>Finding</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.checks.map((check) => (
                      <tr key={check.id}>
                        <td className="w-[240px]">{check.requirement}</td>
                        <td>{check.detail}</td>
                        <td>
                          <StatusPill status={check.passed ? "OK" : "RED"}>
                            {check.passed ? "Pass" : "Fail"}
                          </StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {analysis.engine === "ollama" && analysis.reasons.length > 0 ? (
                <>
                  <h3 className="doc-section-title mt-7 text-[15px]">
                    Model reasoning
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="doc-ledger mt-2">
                      <thead>
                        <tr>
                          <th>Requirement</th>
                          <th>Finding</th>
                          <th>Meets</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.reasons.map((reason, index) => (
                          <tr key={`${reason.requirement}-${index}`}>
                            <td className="w-[240px]">{reason.requirement}</td>
                            <td>{reason.finding}</td>
                            <td>
                              <StatusPill
                                status={
                                  reason.met === true
                                    ? "OK"
                                    : reason.met === false
                                      ? "RED"
                                      : "NEUTRAL"
                                }
                              >
                                {reason.met === true
                                  ? "Met"
                                  : reason.met === false
                                    ? "Not met"
                                    : "Unclear"}
                              </StatusPill>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {analysis.risks.length > 0 ? (
                <>
                  <h3 className="doc-section-title mt-7 text-[15px]">Risks</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-dim">
                    {analysis.risks.map((risk, index) => (
                      <li key={`${risk}-${index}`}>{risk}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </section>

        {pending && isApprover ? (
          <section className="doc-section">
            <div className="doc-section-head">
              <h2 className="doc-section-title">Your decision</h2>
              <span className="doc-folio">
                only {request.approverName} can decide
              </span>
            </div>
            <p className="mb-2 max-w-[68ch] text-[11.5px] leading-relaxed text-faint">
              A person can override the model&apos;s recommendation. The
              decision, your name and the time are recorded.
            </p>
            <DecisionPanel
              requestId={request.id}
              hasAnalysis={Boolean(analysis)}
            />
          </section>
        ) : null}

        {pending && !isApprover ? (
          <section className="doc-section">
            <div className="doc-section-head">
              <h2 className="doc-section-title">Waiting for a decision</h2>
              <AutoRefresh />
            </div>
            <p className="text-[12px] leading-relaxed text-dim">
              Only {request.approverName} can accept or reject this request.
              This page updates while it stays open.
            </p>
          </section>
        ) : null}

        <section className="doc-section">
          <div className="doc-section-head">
            <h2 className="doc-section-title">Record</h2>
            <span className="doc-folio">
              {request.timeline.length} entries
            </span>
          </div>
          <ol className="approval-history">
            {request.timeline.map((event) => (
              <li key={event.id} data-actor={event.actor}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[12px] text-body">{event.label}</span>
                  <span className="doc-folio">{whenUtc(event.at)}</span>
                </div>
                {event.detail ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-faint">
                    {event.detail}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] text-faint">
                  {event.actorName}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
