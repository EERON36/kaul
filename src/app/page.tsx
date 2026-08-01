import Link from "next/link";

import { getEnvironment } from "@/lib/environment";

export const dynamic = "force-dynamic";

const environmentNotices = {
  development:
    "Utvecklingsmiljö – använd inte verkliga personuppgifter eller känslig information.",
  test: "Testmiljö – använd endast fiktiva uppgifter.",
  pilot:
    "Pilotmiljö – använd inte verkliga personuppgifter eller känslig information.",
} as const;

export default function Home() {
  const { DEPLOYMENT_ENV } = getEnvironment();
  const notice =
    DEPLOYMENT_ENV === "production"
      ? undefined
      : environmentNotices[DEPLOYMENT_ENV];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#huvudinnehall">
        Hoppa till huvudinnehåll
      </a>

      <aside className="sidebar">
        <div className="wordmark">
          <span className="wordmark-name">Kaul</span>
          <span className="wordmark-description">Social dokumentation</span>
        </div>

        <nav aria-label="Huvudnavigering">
          <Link aria-current="page" className="navigation-link" href="/">
            Hem
          </Link>
        </nav>
      </aside>

      <main className="main-content" id="huvudinnehall" tabIndex={-1}>
        {notice ? <div className="environment-notice">{notice}</div> : null}

        <div className="page-content">
          <p className="eyebrow">Milestone 0</p>
          <h1>Projektgrund</h1>
          <p className="introductory-text">
            Kauls tekniska grund förbereds för säker och tillgänglig social
            dokumentation.
          </p>

          <section aria-labelledby="current-status" className="status-panel">
            <h2 id="current-status">Nuvarande status</h2>
            <p>
              Inga klientuppgifter eller andra verksamhetsfunktioner har
              aktiverats.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
