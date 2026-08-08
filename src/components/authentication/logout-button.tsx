"use client";

import { useState } from "react";

import { authClient } from "@/modules/authentication/auth-client";

export function LogoutButton() {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  async function logout() {
    setIsPending(true);
    setErrorMessage(undefined);

    const result = await authClient.signOut();

    if (result.error) {
      setErrorMessage("Det gick inte att logga ut. Försök igen.");
      setIsPending(false);
      return;
    }

    window.location.assign("/login");
  }

  return (
    <div>
      <button
        className="logout-button"
        disabled={isPending}
        onClick={logout}
        type="button"
      >
        {isPending ? "Loggar ut…" : "Logga ut"}
      </button>
      <p aria-live="polite" className="form-status">
        {errorMessage}
      </p>
    </div>
  );
}
