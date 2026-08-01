const severityNames = ["info", "low", "moderate", "high", "critical"];
const severities = new Set(severityNames);
const blockingSeverities = new Set(["high", "critical"]);

// These are reviewed upstream exceptions, not claims that the vulnerabilities
// are absent or harmless. Remove an exception as soon as a supported Next.js
// release resolves it. Any package, path, or dependency-tree change requires a
// fresh review; do not widen an exception merely to keep CI green.
export const reviewedUpstreamExceptions = Object.freeze({
  "GHSA-qx2v-qp2m-jg93": {
    packageName: "postcss",
    node: "node_modules/next/node_modules/postcss",
  },
  "GHSA-6g55-p6wh-862q": {
    packageName: "postcss",
    node: "node_modules/next/node_modules/postcss",
  },
  "GHSA-r28c-9q8g-f849": {
    packageName: "postcss",
    node: "node_modules/next/node_modules/postcss",
  },
  "GHSA-f88m-g3jw-g9cj": {
    packageName: "sharp",
    node: "node_modules/sharp",
  },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value) {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function sameMembers(actual, expected) {
  return (
    actual.length === expected.length &&
    [...actual]
      .sort()
      .every((value, index) => value === [...expected].sort()[index])
  );
}

function advisoryIdentifier(advisory) {
  return typeof advisory.url === "string"
    ? /^https:\/\/github\.com\/advisories\/(GHSA-[0-9a-z-]+)$/.exec(
        advisory.url,
      )?.[1]
    : undefined;
}

function validateAuditReport(report) {
  assert(
    isRecord(report) && report.auditReportVersion === 2,
    "Audit output is not a supported npm audit report.",
  );
  assert(
    isRecord(report.vulnerabilities),
    "Audit output is missing the vulnerabilities object.",
  );
  assert(
    isRecord(report.metadata?.vulnerabilities),
    "Audit output is missing vulnerability metadata.",
  );

  const counts = Object.fromEntries(severityNames.map((name) => [name, 0]));

  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    assert(
      isRecord(vulnerability) && vulnerability.name === name,
      `Audit vulnerability ${name} has an invalid package name.`,
    );
    assert(
      severities.has(vulnerability.severity),
      `Audit vulnerability ${name} has an invalid severity.`,
    );
    assert(
      typeof vulnerability.isDirect === "boolean" &&
        Array.isArray(vulnerability.via) &&
        isStringArray(vulnerability.effects) &&
        isStringArray(vulnerability.nodes),
      `Audit vulnerability ${name} has malformed dependency data.`,
    );

    counts[vulnerability.severity] += 1;

    for (const via of vulnerability.via) {
      assert(
        typeof via === "string" ||
          (isRecord(via) &&
            typeof via.name === "string" &&
            typeof via.dependency === "string" &&
            typeof via.title === "string" &&
            severities.has(via.severity)),
        `Audit vulnerability ${name} contains malformed advisory data.`,
      );
    }
  }

  const metadata = report.metadata.vulnerabilities;
  for (const severity of severityNames) {
    assert(
      Number.isInteger(metadata[severity]) &&
        metadata[severity] >= 0 &&
        metadata[severity] === counts[severity],
      `Audit metadata ${severity} count does not match the vulnerability records.`,
    );
  }
  assert(
    Number.isInteger(metadata.total) &&
      metadata.total === Object.keys(report.vulnerabilities).length,
    "Audit metadata total does not match the vulnerability records.",
  );

  return report;
}

export function parseAuditJson(output) {
  assert(
    typeof output === "string" && output.trim() !== "",
    "npm audit returned no JSON output.",
  );

  try {
    return validateAuditReport(JSON.parse(output));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("npm audit returned malformed JSON.", { cause: error });
    }
    throw error;
  }
}

function reviewedAdvisoryProblems(finding, expected, report) {
  const problems = [];

  if (
    finding.packageName !== expected.packageName ||
    finding.advisoryPackageName !== expected.packageName ||
    finding.dependencyName !== expected.packageName
  ) {
    problems.push(`expected package ${expected.packageName}`);
  }
  if (finding.isDirect) problems.push("expected a transitive dependency");
  if (!sameMembers(finding.nodes, [expected.node])) {
    problems.push(`expected node ${expected.node}`);
  }
  if (!sameMembers(finding.effects, ["next"])) {
    problems.push("expected dependent package next");
  }
  if (!report.vulnerabilities.next?.via.includes(expected.packageName)) {
    problems.push(`expected ${expected.packageName} beneath next`);
  }
  if (finding.severity === "critical") {
    problems.push("critical advisories are never allowlisted");
  }
  return problems;
}

function aggregateFailure(finding, report) {
  if (finding.severity === "critical") {
    return `Critical aggregate finding for ${finding.packageName} is never allowed.`;
  }
  if (!blockingSeverities.has(finding.severity)) return undefined;

  const valid =
    finding.packageName === "next" &&
    finding.isDirect &&
    sameMembers(finding.nodes, ["node_modules/next"]) &&
    finding.effects.length === 0 &&
    new Set(finding.viaPackages).size === finding.viaPackages.length &&
    finding.viaPackages.every((name) => ["postcss", "sharp"].includes(name)) &&
    finding.viaPackages.every((name) =>
      blockingSeverities.has(report.vulnerabilities[name]?.severity),
    );

  return valid
    ? undefined
    : `Unexpected ${finding.severity} dependency aggregate for ${finding.packageName} ` +
        `via ${finding.viaPackages.join(", ")}.`;
}

function evaluateValidatedReport(report) {
  const findings = [];
  const warnings = [];
  const failures = [];

  for (const vulnerability of Object.values(report.vulnerabilities)) {
    const shared = {
      packageName: vulnerability.name,
      isDirect: vulnerability.isDirect,
      nodes: [...vulnerability.nodes],
      effects: [...vulnerability.effects],
    };
    const viaPackages = [];
    let hasBlockingAdvisory = false;

    if (vulnerability.severity === "critical") {
      failures.push(
        `Critical vulnerability summary for ${vulnerability.name} is never allowed.`,
      );
    }

    for (const advisory of vulnerability.via) {
      if (typeof advisory === "string") {
        viaPackages.push(advisory);
        continue;
      }

      const finding = {
        ...shared,
        kind: "advisory",
        identifier:
          advisoryIdentifier(advisory) ??
          (advisory.source === undefined
            ? "unknown advisory"
            : `source:${advisory.source}`),
        advisoryPackageName: advisory.name,
        dependencyName: advisory.dependency,
        severity: advisory.severity,
        title: advisory.title,
      };
      findings.push(finding);
      hasBlockingAdvisory ||= blockingSeverities.has(finding.severity);

      const expected = reviewedUpstreamExceptions[finding.identifier];
      if (!expected && blockingSeverities.has(finding.severity)) {
        failures.push(
          `Unexpected ${finding.severity} advisory ${finding.identifier} for ` +
            `${finding.packageName} at ${finding.nodes.join(", ")}.`,
        );
        continue;
      }

      if (expected) {
        const problems = reviewedAdvisoryProblems(finding, expected, report);
        if (problems.length > 0) {
          failures.push(
            `Reviewed advisory ${finding.identifier} appeared unexpectedly: ` +
              `${problems.join("; ")}.`,
          );
        } else {
          warnings.push(
            `Temporarily accepted reviewed upstream advisory ${finding.identifier} ` +
              `for ${finding.packageName} at ${finding.nodes.join(", ")} via next.`,
          );
        }
      }
    }

    if (
      vulnerability.severity === "high" &&
      viaPackages.length === 0 &&
      !hasBlockingAdvisory
    ) {
      failures.push(
        `Unexplained high vulnerability summary for ${vulnerability.name}.`,
      );
    }

    if (viaPackages.length > 0) {
      const aggregate = {
        ...shared,
        kind: "aggregate",
        identifier: `${vulnerability.name} dependency aggregate`,
        severity: vulnerability.severity,
        viaPackages,
      };
      findings.push(aggregate);
      const failure = aggregateFailure(aggregate, report);
      if (failure) failures.push(failure);
    }
  }

  return { findings, warnings, failures };
}

export function evaluateAuditReport(report) {
  return evaluateValidatedReport(validateAuditReport(report));
}

export function assessAuditExecution({ status, stdout, stderr, error }) {
  if (error) {
    throw new Error(`Could not execute npm audit: ${error.message}`, {
      cause: error,
    });
  }
  if (status !== 0 && status !== 1) {
    throw new Error(
      `npm audit failed with unexpected exit code ${String(status)}${
        stderr?.trim() ? `: ${stderr.trim()}` : ""
      }`,
    );
  }

  const report = parseAuditJson(stdout);
  assert(
    (status === 0 && report.metadata.vulnerabilities.total === 0) ||
      (status === 1 && report.metadata.vulnerabilities.total > 0),
    "npm audit exit code and vulnerability metadata disagree.",
  );

  return {
    report,
    stderr: typeof stderr === "string" ? stderr : "",
    ...evaluateValidatedReport(report),
  };
}
