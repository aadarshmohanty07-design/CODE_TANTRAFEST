"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = "accepted" | "rejected" | "analyze";

export function DecisionPanel({
  requestId,
  hasAnalysis,
}: {
  requestId: string;
  hasAnalysis: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(status: "accepted" | "rejected") {
    setBusy(status);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/approvals/requests/${requestId}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status, note }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "The decision was not recorded.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function analyze() {
    setBusy("analyze");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/approvals/requests/${requestId}/analyze`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "The check could not be run.");
      }
      setMessage(
        data.status === "accepted" || data.status === "rejected"
          ? "The review is complete and the armed preset recorded a decision."
          : "The review is updated."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="approval-field">
        <label className="approval-field-label" htmlFor="decision-note">
          Decision note
        </label>
        <div className="approval-field-input">
          <textarea
            id="decision-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional. Why you accepted or rejected it."
            maxLength={1000}
          />
          <p className="approval-help">
            Stored with your name and the time. It is not sent to the model.
          </p>
        </div>
      </div>

      {!hasAnalysis ? (
        <p className="mt-4 text-[11.5px] leading-relaxed text-signal">
          No review is stored yet. Run the check before accepting or rejecting.
        </p>
      ) : null}

      {message ? (
        <p aria-live="polite" className="mt-4 text-[11.5px] text-safe">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-[11.5px] leading-relaxed text-danger">
          {error}
        </p>
      ) : null}

      <div className="approval-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => decide("accepted")}
          disabled={busy !== null || !hasAnalysis}
        >
          {busy === "accepted" ? "Recording…" : "Accept access"}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => decide("rejected")}
          disabled={busy !== null || !hasAnalysis}
        >
          {busy === "rejected" ? "Recording…" : "Reject request"}
        </button>
        <button
          type="button"
          className="arrow-link"
          onClick={analyze}
          disabled={busy !== null}
        >
          {busy === "analyze" ? "Running the check…" : "Check again"}
        </button>
      </div>
    </div>
  );
}
