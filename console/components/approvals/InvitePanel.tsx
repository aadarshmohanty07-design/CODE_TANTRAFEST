"use client";

import { useState } from "react";
import { whenUtc } from "@/lib/approvals/presentation";
import type { PublicAccount } from "@/lib/approvals/types";

export function InvitePanel({
  other,
}: {
  other: PublicAccount | null;
}) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const joinUrl =
    code && typeof window !== "undefined"
      ? `${window.location.origin}/approvals/join?code=${encodeURIComponent(code)}`
      : null;

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/approvals/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = (await response.json().catch(() => ({}))) as {
        code?: string;
        expiresAt?: string;
        error?: string;
      };
      if (!response.ok || !data.code) {
        throw new Error(data.error ?? "The invite could not be created.");
      }
      setCode(data.code);
      setExpiresAt(data.expiresAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
    } catch {
      setError("Copy failed. Select the link and copy it by hand.");
    }
  }

  if (other) {
    return (
      <p className="text-[12px] leading-relaxed text-dim">
        Both accounts exist. Requests can move between you and {other.name}.
      </p>
    );
  }

  return (
    <div>
      <p className="max-w-[62ch] text-[12px] leading-relaxed text-dim">
        The second person creates their own account with a one-time code. The
        code expires after 24 hours; generating a new one cancels the old one.
      </p>
      {!code ? (
        <div className="approval-actions">
          <button
            type="button"
            className="btn"
            onClick={generate}
            disabled={busy}
          >
            {busy ? "Creating…" : "Create invite code"}
          </button>
        </div>
      ) : (
        <div className="mt-4 border-t border-edge pt-4">
          <div className="doc-folio">Invite code</div>
          <div className="approval-code mt-1">{code}</div>
          <div className="doc-folio mt-4">Join link</div>
          <div className="approval-url mt-1">{joinUrl}</div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <button type="button" className="btn btn-sm" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              className="arrow-link"
              onClick={generate}
              disabled={busy}
            >
              Create a new code
            </button>
            <span className="doc-note">
              {expiresAt ? `Expires ${whenUtc(expiresAt)}` : ""}
            </span>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
            The code is shown once. Copy the link before you leave this page; if
            it is lost, create a new code.
          </p>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-[11.5px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
