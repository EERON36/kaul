import { resolve } from "node:path";

import { replaceDiagnosticFileAtomically } from "../src/test/document-upload-diagnostic";
import { runDocumentUploadServiceDiagnostic } from "../src/test/document-upload-service-diagnostic";

try {
  const { artifactDirectory, report } =
    await runDocumentUploadServiceDiagnostic();
  await replaceDiagnosticFileAtomically(
    resolve(artifactDirectory, "diagnostic.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
} catch {
  process.stdout.write("KAUL205_DIAGNOSTIC_UNAVAILABLE\n");
}
