import { ApplicationShell } from "@/components/application-shell";
import {
  NavigationGuardLink as Link,
  NavigationGuardProvider,
} from "@/components/navigation-guard";

import { loadClientWorkspace } from "../../client-workspace-data";
import { ClientWorkspaceHeader } from "../../client-workspace";
import { DocumentUpload } from "../document-upload-client";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string }> }>) {
  const { clientId } = await params;
  const workspace = await loadClientWorkspace(clientId);
  const readOnly = workspace.client.status === "ARCHIVED";

  return (
    <NavigationGuardProvider confirmationMessage="Du har osparade dokumentuppgifter. Vill du lämna sidan? Uppgifterna försvinner om du inte laddar upp filen.">
      <ApplicationShell currentPath="/klienter" user={workspace.user}>
        <div className="page-content">
          <ClientWorkspaceHeader
            client={workspace.client}
            currentSection="documents"
          />
          <section className="client-section" aria-labelledby="upload-heading">
            <h2 id="upload-heading">Ladda upp dokument</h2>
            {readOnly ? (
              <p className="read-only-notice">
                Klienten är arkiverad. Nya dokument kan inte laddas upp.
              </p>
            ) : (
              <DocumentUpload clientId={clientId} />
            )}
            <p>
              <Link href={`/klienter/${clientId}/dokument`}>
                Tillbaka till Dokument
              </Link>
            </p>
          </section>
        </div>
      </ApplicationShell>
    </NavigationGuardProvider>
  );
}
