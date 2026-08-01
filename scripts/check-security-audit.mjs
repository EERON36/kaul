import { spawnSync } from "node:child_process";

import { assessAuditExecution } from "./security-audit-policy.mjs";

const npmCliPath = process.env.npm_execpath;
const execution = npmCliPath
  ? spawnSync(process.execPath, [npmCliPath, "audit", "--omit=dev", "--json"], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      shell: false,
      windowsHide: true,
    })
  : {
      error: new Error(
        "npm_execpath is unavailable; run this check through npm run audit:ci.",
      ),
      status: null,
      stdout: "",
      stderr: "",
    };

try {
  const result = assessAuditExecution(execution);
  const counts = result.report.metadata.vulnerabilities;

  console.log(
    `npm audit summary: info=${counts.info}, low=${counts.low}, ` +
      `moderate=${counts.moderate}, high=${counts.high}, ` +
      `critical=${counts.critical}, total=${counts.total}`,
  );
  console.log("Discovered audit findings:");

  if (result.findings.length === 0) {
    console.log("- none");
  }

  for (const finding of result.findings) {
    if (finding.kind === "aggregate") {
      console.log(
        `- [${finding.severity}] ${finding.identifier}; nodes=${finding.nodes.join(
          ",",
        )}; via=${finding.viaPackages.join(",")}`,
      );
    } else {
      console.log(
        `- [${finding.severity}] ${finding.identifier}; package=${finding.packageName}; ` +
          `nodes=${finding.nodes.join(",")}; ${finding.title}`,
      );
    }
  }

  if (result.stderr.trim()) {
    console.warn(`npm audit stderr:\n${result.stderr.trim()}`);
  }

  for (const warning of result.warnings) {
    console.warn(`WARNING: ${warning} The vulnerability still exists.`);
  }

  if (result.failures.length > 0) {
    for (const failure of result.failures) {
      console.error(`ERROR: ${failure}`);
    }

    process.exitCode = 1;
  } else {
    console.log(
      "Security audit policy passed: no unexpected high or critical findings.",
    );
  }
} catch (error) {
  console.error(
    `Security audit policy failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
}
