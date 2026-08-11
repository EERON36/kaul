"use client";

import { useState } from "react";

export function LogoutButton() {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  async function logout() {
    setIsPending(true);
    setErrorMessage(undefined);

    let response: Response;
    try {
      response = await fetch("/api/kaul/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      setErrorMessage("Det gick inte att logga ut. Försök igen.");
      setIsPending(false);
      return;
    }

    if (!response.ok) {
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
