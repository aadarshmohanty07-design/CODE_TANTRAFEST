"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { whenUtc } from "@/lib/approvals/presentation";
import type { Requirements } from "@/lib/approvals/types";

export function PolicyForm({ requirements }: { requirements: Requirements }) {
  const router = useRouter();
  const [autoDecision, setAutoDecision] = useState(requirements.autoDecision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wasArmed = requirements.autoDecision;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const passcode = String(form.get("autoPasscode") ?? "");
    const confirm = String(form.get("autoConfirm") ?? "");

    if (autoDecision && !passcode) {
      setError("Enter your passcode to save an armed auto-decision preset.");
      return;
    }
    if (autoDecision && !wasArmed && confirm.trim().toUpperCase() !== "AUTO") {
      setError("Type AUTO to arm auto-decision.");
      return;
    }

    const payload = {
      allowedResources: String(form.get("allowedResources") ?? "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
      maxDurationHours: Number(form.get("maxDurationHours")),
      maxSpendUsd: Number(form.get("maxSpendUsd")),
      allowExecute: form.get("allowExecute") === "on",
      allowAdmin: form.get("allowAdmin") === "on",
      minPurposeChars: Number(form.get("minPurposeChars")),
      blockedTerms: String(form.get("blockedTerms") ?? "")
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
      guidance: String(form.get("guidance") ?? ""),
      autoDecision,
      passcode: autoDecision ? passcode : undefined,
      confirm: autoDecision && !wasArmed ? confirm : undefined,
    };

    setBusy(true);
    try {
      const response = await fetch("/api/approvals/policy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "The requirements were not saved.");
      }
      setMessage(
        autoDecision
          ? "Requirements saved. Auto-decision is armed."
          : "Requirements saved. Auto-decision is off."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="approval-form" onSubmit={submit}>
      <div className="approval-field">
        <label className="approval-field-label" htmlFor="policy-resources">
          Approved resources
        </label>
        <div className="approval-field-input">
          <textarea
            id="policy-resources"
            name="allowedResources"
            defaultValue={requirements.allowedResources.join("\n")}
            placeholder={"GPU node\nBuild runner\nDataset volume"}
          />
          <p className="approval-help">
            One per line. A request must name one of these exactly, ignoring
            case. Leave empty to refuse every request.
          </p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="policy-duration">
          Maximum duration
        </label>
        <div className="approval-field-input">
          <input
            id="policy-duration"
            name="maxDurationHours"
            type="number"
            min="0.25"
            max="720"
            step="0.25"
            defaultValue={requirements.maxDurationHours}
            required
          />
          <p className="approval-help">Hours per request.</p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="policy-spend">
          Maximum spend
        </label>
        <div className="approval-field-input">
          <input
            id="policy-spend"
            name="maxSpendUsd"
            type="number"
            min="0"
            step="1"
            defaultValue={requirements.maxSpendUsd}
            required
          />
          <p className="approval-help">US dollars. Use 0 for no spend.</p>
        </div>
      </div>

      <div className="approval-field">
        <span className="approval-field-label">Access level</span>
        <div className="approval-field-input">
          <label className="approval-check">
            <input
              type="checkbox"
              name="allowExecute"
              defaultChecked={requirements.allowExecute}
            />
            Allow execute access, for running jobs.
          </label>
          <label className="approval-check">
            <input
              type="checkbox"
              name="allowAdmin"
              defaultChecked={requirements.allowAdmin}
            />
            Allow admin access, including server changes.
          </label>
          <p className="approval-help">
            Read-only access is always allowed. Admin implies execute.
          </p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="policy-purpose-length">
          Minimum purpose
        </label>
        <div className="approval-field-input">
          <input
            id="policy-purpose-length"
            name="minPurposeChars"
            type="number"
            min="0"
            max="500"
            step="1"
            defaultValue={requirements.minPurposeChars}
            required
          />
          <p className="approval-help">Characters. Shorter requests fail.</p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="policy-blocked">
          Blocked terms
        </label>
        <div className="approval-field-input">
          <textarea
            id="policy-blocked"
            name="blockedTerms"
            defaultValue={requirements.blockedTerms.join(", ")}
            placeholder="crypto mining, unvetted dataset"
          />
          <p className="approval-help">
            Comma or line separated. Matched against the resource, purpose and
            technical detail.
          </p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="policy-guidance">
          Guidance for the model
        </label>
        <div className="approval-field-input">
          <textarea
            id="policy-guidance"
            name="guidance"
            defaultValue={requirements.guidance}
            placeholder="What kinds of work are welcome, what needs a conversation, and what you never allow."
            maxLength={2000}
          />
          <p className="approval-help">
            The local model weighs this when it recommends a decision. Hard
            limits above are enforced in code regardless.
          </p>
        </div>
      </div>

      <div className="approval-policy-section">
        <div className="doc-section-head">
          <h2 className="doc-section-title">Auto-decision</h2>
          <span className="doc-folio">
            {autoDecision ? "armed" : "off by default"}
          </span>
        </div>
        <p className="max-w-[62ch] text-[12px] leading-relaxed text-dim">
          {autoDecision
            ? "On. The local model can accept or reject new requests on your behalf. It must be at least 85% confident, every hard limit must pass, and its decision is recorded as automatic. Low-confidence or unavailable model checks stay in your queue."
            : "Off by default. When armed, the local model can accept or reject new requests on your behalf. It must be at least 85% confident, every hard limit must pass, and its decision is recorded as automatic. Low-confidence or unavailable model checks stay in your queue."}
        </p>

        <label className="approval-check mt-2">
          <input
            type="checkbox"
            checked={autoDecision}
            onChange={(event) => setAutoDecision(event.target.checked)}
          />
          Let the local model decide new requests against this preset.
        </label>

        {autoDecision ? (
          <>
            {wasArmed && requirements.autoArmedAt ? (
              <p className="doc-note mt-1">
                Armed since {whenUtc(requirements.autoArmedAt)}.
              </p>
            ) : (
              <p className="mt-1 border-l-2 border-danger pl-3 text-[11px] leading-relaxed text-dim">
                Arming this means an accepted request gets access without you
                reading it first. You can turn it off at any time.
              </p>
            )}

            <div className="approval-field mt-3">
              <label className="approval-field-label" htmlFor="auto-passcode">
                Passcode
              </label>
              <div className="approval-field-input">
                <input
                  id="auto-passcode"
                  name="autoPasscode"
                  type="password"
                  autoComplete="current-password"
                  minLength={1}
                  maxLength={128}
                  required={autoDecision}
                />
                <p className="approval-help">
                  Required every time you save with auto-decision on.
                </p>
              </div>
            </div>

            {!wasArmed ? (
              <div className="approval-field">
                <label className="approval-field-label" htmlFor="auto-confirm">
                  Confirmation
                </label>
                <div className="approval-field-input">
                  <input
                    id="auto-confirm"
                    name="autoConfirm"
                    type="text"
                    placeholder="Type AUTO"
                    autoComplete="off"
                    maxLength={8}
                    required
                  />
                  <p className="approval-help">
                    Type AUTO to confirm that the model may decide on your
                    behalf.
                  </p>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {message ? (
        <p aria-live="polite" className="mt-4 text-[11.5px] text-safe">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 border-l-2 border-danger pl-3 text-[11.5px] leading-relaxed text-dim">
          <span className="text-danger">Not saved.</span> {error}
        </p>
      ) : null}

      <div className="approval-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy
            ? "Saving…"
            : autoDecision
              ? "Save with auto-decision on"
              : "Save requirements"}
        </button>
      </div>
    </form>
  );
}
