"use client";

import { useState, type FormEvent } from "react";

import { authClient } from "@/modules/authentication/auth-client";
import { getLoginFailureMessage } from "@/modules/authentication/login-feedback";

export function LoginForm() {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setErrorMessage(undefined);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = await authClient.signIn.email({
      email,
      password,
    });

    if (result.error) {
      setErrorMessage(getLoginFailureMessage());
      setIsPending(false);
      return;
    }

    window.location.assign("/");
  }

  return (
    <form
      action="/login"
      aria-describedby="login-help login-error"
      method="post"
      onSubmit={submit}
    >
      <div className="form-field">
        <label htmlFor="email">E-post</label>
        <input
          autoComplete="username"
          id="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </div>

      <div className="form-field">
        <label htmlFor="password">Lösenord</label>
        <input
          autoComplete="current-password"
          id="password"
          maxLength={128}
          name="password"
          required
          type="password"
        />
      </div>

      <p className="form-help" id="login-help">
        Använd din personliga inloggning till Kaul.
      </p>
      <p aria-live="polite" className="form-error" id="login-error">
        {errorMessage}
      </p>

      <button className="primary-button" disabled={isPending} type="submit">
        {isPending ? "Loggar in…" : "Logga in"}
      </button>
    </form>
  );
}
