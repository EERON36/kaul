"use client";

import { useState, type FormEvent } from "react";

import { getPasswordChangeFeedback } from "@/modules/authentication/password-change-feedback";

export function PasswordChangeForm({ operationId }: { operationId: string }) {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setErrorMessage(undefined);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/kaul/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operationId,
        currentPassword: String(formData.get("currentPassword") ?? ""),
        newPassword: String(formData.get("newPassword") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
      }),
    });
    const result: unknown = await response.json().catch(() => undefined);
    const code =
      typeof result === "object" && result !== null && "code" in result
        ? result.code
        : undefined;

    if (response.ok && code === "PASSWORD_CHANGED") {
      window.location.assign("/");
      return;
    }

    setErrorMessage(getPasswordChangeFeedback(code));
    setIsPending(false);
  }

  return (
    <form aria-describedby="password-policy password-error" onSubmit={submit}>
      <div className="form-field">
        <label htmlFor="currentPassword">Nuvarande lösenord</label>
        <input
          autoComplete="current-password"
          id="currentPassword"
          maxLength={128}
          name="currentPassword"
          required
          type="password"
        />
      </div>

      <div className="form-field">
        <label htmlFor="newPassword">Nytt lösenord</label>
        <input
          aria-describedby="password-policy"
          autoComplete="new-password"
          id="newPassword"
          maxLength={128}
          minLength={15}
          name="newPassword"
          required
          type="password"
        />
      </div>

      <div className="form-field">
        <label htmlFor="confirmPassword">Bekräfta nytt lösenord</label>
        <input
          autoComplete="new-password"
          id="confirmPassword"
          maxLength={128}
          minLength={15}
          name="confirmPassword"
          required
          type="password"
        />
      </div>

      <p className="form-help" id="password-policy">
        Minst 15 och högst 128 tecken. Mellanslag och lösenfraser är tillåtna.
      </p>
      <p aria-live="polite" className="form-error" id="password-error">
        {errorMessage}
      </p>

      <button className="primary-button" disabled={isPending} type="submit">
        {isPending ? "Sparar…" : "Spara nytt lösenord"}
      </button>
    </form>
  );
}
