import { redirect } from "next/navigation";

import { EnvironmentNotice } from "@/components/environment-notice";
import { KaulWordmark } from "@/components/kaul-wordmark";
import {
  AuthenticationGuardError,
  requireAuthenticatedUser,
} from "@/modules/authentication/guards";
import {
  getAuthenticatedDestination,
  isLoginPageVisibleError,
} from "@/modules/authentication/page-access";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  try {
    const user = await requireAuthenticatedUser();

    redirect(getAuthenticatedDestination(user.credentialState));
  } catch (error) {
    if (
      !(error instanceof AuthenticationGuardError) ||
      !isLoginPageVisibleError(error.code)
    ) {
      throw error;
    }
  }

  return (
    <div className="authentication-page">
      <a className="skip-link" href="#huvudinnehall">
        Hoppa till huvudinnehåll
      </a>
      <EnvironmentNotice />
      <main className="authentication-main" id="huvudinnehall">
        <div className="authentication-panel">
          <KaulWordmark />
          <h1>Logga in</h1>
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
