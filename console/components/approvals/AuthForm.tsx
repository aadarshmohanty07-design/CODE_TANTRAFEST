"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Mode = "setup" | "login" | "join";

const COPY: Record<Mode, { endpoint: string; action: string; busy: string }> = {
  setup: {
    endpoint: "/api/approvals/auth/setup",
    action: "Create account",
    busy: "Creating account…",
  },
  login: {
    endpoint: "/api/approvals/auth/login",
    action: "Sign in",
    busy: "Signing in…",
  },
  join: {
    endpoint: "/api/approvals/auth/join",
    action: "Join this server",
    busy: "Joining…",
  },
};

export function AuthForm({
  mode,
  setupCodeRequired = false,
  initialCode = "",
  showJoin = true,
}: {
  mode: Mode;
  setupCodeRequired?: boolean;
  initialCode?: string;
  showJoin?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(initialCode);
  const copy = COPY[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const passcode = String(form.get("passcode") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (mode !== "login" && passcode !== confirm) {
      setError("The two passcodes do not match.");
      return;
    }

    const payload: Record<string, string> = { name, passcode };
    if (mode !== "login") payload.confirm = confirm;
    if (mode === "setup") {
      payload.setupCode = String(form.get("setupCode") ?? "");
    }
    if (mode === "join") payload.code = code;

    setBusy(true);
    try {
      const response = await fetch(copy.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "The server could not complete that action.");
      }
      router.replace("/approvals");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form className="approval-form" onSubmit={submit}>
      {mode === "join" ? (
        <div className="approval-field">
          <label className="approval-field-label" htmlFor="join-code">
            Invite code
          </label>
          <div className="approval-field-input">
            <input
              id="join-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={32}
              required
            />
            <p className="approval-help">
              The first person generated this code for you. It works once.
            </p>
          </div>
        </div>
      ) : null}

      {mode === "setup" && setupCodeRequired ? (
        <div className="approval-field">
          <label className="approval-field-label" htmlFor="setup-code">
            Setup code
          </label>
          <div className="approval-field-input">
            <input
              id="setup-code"
              name="setupCode"
              type="password"
              autoComplete="off"
              required
            />
            <p className="approval-help">
              This server was started with a setup code. Ask the operator for it.
            </p>
          </div>
        </div>
      ) : null}

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="account-name">
          Your name
        </label>
        <div className="approval-field-input">
          <input
            id="account-name"
            name="name"
            type="text"
            autoComplete="username"
            minLength={2}
            maxLength={40}
            required
          />
          <p className="approval-help">
            This is the name the other person sees on requests.
          </p>
        </div>
      </div>

      <div className="approval-field">
        <label className="approval-field-label" htmlFor="account-passcode">
          Passcode
        </label>
        <div className="approval-field-input">
          <input
            id="account-passcode"
            name="passcode"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "login" ? 1 : 8}
            maxLength={128}
            required
          />
          <p className="approval-help">
            {mode === "login"
              ? "Use the passcode you set when you created this account."
              : "At least 8 characters. There is no reset email; keep it somewhere safe."}
          </p>
        </div>
      </div>

      {mode !== "login" ? (
        <div className="approval-field">
          <label className="approval-field-label" htmlFor="account-confirm">
            Repeat passcode
          </label>
          <div className="approval-field-input">
            <input
              id="account-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-4 border-l-2 border-danger pl-3 text-[11.5px] leading-relaxed text-dim"
        >
          <span className="text-danger">Not completed.</span> {error}
        </div>
      ) : null}

      <div className="approval-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? copy.busy : copy.action}
        </button>
        {mode === "login" && showJoin ? (
          <Link href="/approvals/join" className="arrow-link">
            I have an invite code
          </Link>
        ) : null}
        {mode === "join" ? (
          <Link href="/approvals/login" className="arrow-link">
            Sign in instead
          </Link>
        ) : null}
      </div>
    </form>
  );
}
