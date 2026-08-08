import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/authentication/logout-button";
import { EnvironmentNotice } from "@/components/environment-notice";
import { KaulWordmark } from "@/components/kaul-wordmark";
import {
  AuthenticationGuardError,
  requireAuthenticatedUser,
  type AuthenticatedUser,
} from "@/modules/authentication/guards";
import { getPasswordChangeErrorRedirect } from "@/modules/authentication/page-access";

import { PasswordChangeForm } from "./password-change-form";

export const dynamic = "force-dynamic";

export default async function PasswordChangePage() {
  let user: AuthenticatedUser;

  try {
    user = await requireAuthenticatedUser();
  } catch (error) {
    if (error instanceof AuthenticationGuardError) {
      const destination = getPasswordChangeErrorRedirect(error.code);

      if (destination) {
        redirect(destination);
      }
    }

    throw error;
  }

  if (user.credentialState === "APPLICATION_ALLOWED") {
    redirect("/");
  }

  const isExpired = user.credentialState === "TEMPORARY_CREDENTIAL_EXPIRED";

  return (
    <div className="authentication-page">
      <a className="skip-link" href="#huvudinnehall">
        Hoppa till huvudinnehåll
      </a>
      <EnvironmentNotice />
      <main className="authentication-main" id="huvudinnehall">
        <div className="authentication-panel">
          <KaulWordmark />
          <h1>
            {isExpired ? "Inloggningen behöver återställas" : "Byt lösenord"}
          </h1>
          {isExpired ? (
            <div className="blocked-state" role="alert">
              <p>
                Den tillfälliga inloggningsuppgiften kan inte längre användas.
                Kontakta administratören för att få hjälp.
              </p>
              <LogoutButton />
            </div>
          ) : (
            <>
              <p className="introductory-text">
                Du behöver välja ett nytt lösenord innan du kan använda Kaul.
              </p>
              <PasswordChangeForm />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
