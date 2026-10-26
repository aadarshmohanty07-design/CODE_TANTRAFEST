"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PublicAccount } from "@/lib/approvals/types";

export function NewRequestForm({
  approvers,
  modelReady,
  modelLabel,
}: {
  approvers: PublicAccount[];
  modelReady: boolean;
  modelLabel: string;
}) {
  const router = useRouter();
  const [approverId, setApproverId] = useState(approvers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approver =
    approvers.find((candidate) => candidate.id === approverId) ?? approvers[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const localStart = String(form.get("startsAt") ?? "");
    const payload = {
      approverId,
      resource: String(form.get("resource") ?? ""),
      accessLevel: String(form.get("accessLevel") ?? "read"),
      durationHours: Number(form.get("durationHours") ?? 0),
      spendUsd: Number(form.get("spendUsd") ?? 0),
      startsAt: localStart ? new Date(localStart).toISOString() : null,
      purpose: String(form.get("purpose") ?? ""),
      details: String(form.get("details") ?? ""),
    };

    if (!approverId) {
      setError("Choose who should review the request.");
      return;
    }
    if (!Number.isFinite(payload.durationHours) || payload.durationHours <= 0) {
      setError("Enter a duration above zero.");
      return;
    }
    if (!Number.isFinite(payload.spendUsd) || payload.spendUsd < 0) {
      setError("Enter a spend of zero or more.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/approvals/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!response.ok || !data.id) {
        throw new Error(data.error ?? "The request could not be sent.");
      }
      router.push(`/approvals/requests/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form className="approval-form" onSubmit={submit}>
      {!modelReady ? (
        <div className="mb-5 border-l-2 border-signal pl-3 text-[11.5px] leading-relaxed text-dim">
          <span className="text-signal">The local model is offline.</span> The
          request will still be checked against the hard limits, but{" "}
          {approver?.name ?? "the approver"} will have to judge the purpose
          themselves. Model: {modelLabel}.
        </div>
      ) : null}

      {approvers.length > 1 ? (
        <div className="approval-field">
          <label className="approval-field-label" htmlFor="request-approver">
            Send to
          </label>
          <div className="approval-field-input">
            <select
              id="request-approver"
              value={approverId}
              onChange={(event) => setApproverId(event.target.value)}
            >
              {approvers.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="approval-field">
          <span className="approval-field-label">Send to</span>
          <div className="approval-field-input">
            <div className="text-[14px]">{approver?.name ?? "—"}</div>
            <p className="approval-help">
              Their requirements preset and local model review this request.
            </p>
          </div>
        </div>
      )}

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="request-resource">
          Resource
        </label>
        <div className="approval-field-input">
          <input
            id="request-resource"
            name="resource"
            type="text"
            placeholder="GPU node, build runner, dataset volume"
            maxLength={80}
            required
          />
          <p className="approval-help">
            Name the thing you need from the shared server.
          </p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="request-level">
          Access level
        </label>
        <div className="approval-field-input">
          <select id="request-level" name="accessLevel" defaultValue="read">
            <option value="read">Read only</option>
            <option value="execute">Execute</option>
            <option value="admin">Admin</option>
          </select>
          <p className="approval-help">
            Read can view. Execute can run jobs. Admin can change the server.
          </p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="request-duration">
          For how long
        </label>
        <div className="approval-field-input">
          <input
            id="request-duration"
            name="durationHours"
            type="number"
            min="0.25"
            max="720"
            step="0.25"
            defaultValue="2"
            required
          />
          <p className="approval-help">Hours. Use 0.25 for fifteen minutes.</p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="request-spend">
          Spend
        </label>
        <div className="approval-field-input">
          <input
            id="request-spend"
            name="spendUsd"
            type="number"
            min="0"
            step="1"
            defaultValue="0"
            required
          />
          <p className="approval-help">
            US dollars. Enter 0 when the request costs nothing.
          </p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="request-start">
          Start
        </label>
        <div className="approval-field-input">
          <input
            id="request-start"
            name="startsAt"
            type="datetime-local"
          />
          <p className="approval-help">
            Optional. Your local time; the record shows UTC.
          </p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="request-purpose">
          What it is for
        </label>
        <div className="approval-field-input">
          <textarea
            id="request-purpose"
            name="purpose"
            placeholder="What will run, why it needs this resource, and what the result is used for."
            maxLength={2000}
            required
          />
          <p className="approval-help">
            Long enough to judge the request. Short purposes fail the preset.
          </p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="request-details">
          Technical detail
        </label>
        <div className="approval-field-input">
          <textarea
            id="request-details"
            name="details"
            placeholder="Command, dataset, model, or job name. Optional."
            maxLength={1500}
          />
        </div>
      </div>

      <div className="mt-4 border-l-2 border-edge pl-3 text-[11px] leading-relaxed text-faint">
        Resource, duration, spend, access level, purpose length and blocked
        terms are checked in code. The local model reads the purpose and
        guidance for fit. It cannot override a failed hard limit.
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-4 border-l-2 border-danger pl-3 text-[11.5px] leading-relaxed text-dim"
        >
          <span className="text-danger">Not sent.</span> {error}
        </div>
      ) : null}

      <div className="approval-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy
            ? `Checking against ${approver?.name ?? "the preset"}…`
            : "Send request"}
        </button>
        {busy ? (
          <span className="doc-note">
            The local model can take a few seconds on its first run.
          </span>
        ) : null}
      </div>
    </form>
  );
}
