import { verifyPilotDocumentReadiness } from "./pilot-document-readiness";

try {
  await verifyPilotDocumentReadiness();
  process.stdout.write("PILOT_DOCUMENTS_READY\n");
} catch {
  process.stderr.write("PILOT_DOCUMENTS_NOT_READY\n");
  process.exitCode = 1;
}
