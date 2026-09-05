import { waitForDocumentScannerReadiness } from "../src/test/document-scanner-ci-readiness";

try {
  if (await waitForDocumentScannerReadiness()) {
    process.stdout.write("DOCUMENT_SCANNER_READY\n");
  } else {
    process.stderr.write("DOCUMENT_SCANNER_NOT_READY\n");
    process.exitCode = 1;
  }
} catch {
  process.stderr.write("DOCUMENT_SCANNER_NOT_READY\n");
  process.exitCode = 1;
}
