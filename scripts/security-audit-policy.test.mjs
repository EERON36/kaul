import { describe, expect, it } from "vitest";

import {
  assessAuditExecution,
  evaluateAuditReport,
  parseAuditJson,
} from "./security-audit-policy.mjs";

function advisory(identifier, packageName, severity, source) {
  return {
    source,
    name: packageName,
    dependency: packageName,
    title: `${packageName} ${identifier}`,
    url: `https://github.com/advisories/${identifier}`,
    severity,
    range: "affected",
  };
}

function supersededNextAuditReport() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      next: {
        name: "next",
        severity: "high",
        isDirect: true,
        via: ["postcss", "sharp"],
        effects: [],
        nodes: ["node_modules/next"],
      },
      postcss: {
        name: "postcss",
        severity: "high",
        isDirect: false,
        via: [
          advisory("GHSA-qx2v-qp2m-jg93", "postcss", "moderate", 1),
          advisory("GHSA-6g55-p6wh-862q", "postcss", "high", 2),
          advisory("GHSA-fxqj-rqcc-2cmp", "postcss", "moderate", 3),
          advisory("GHSA-r28c-9q8g-f849", "postcss", "high", 4),
        ],
        effects: ["next"],
        nodes: ["node_modules/next/node_modules/postcss"],
      },
      sharp: {
        name: "sharp",
        severity: "high",
        isDirect: false,
        via: [advisory("GHSA-f88m-g3jw-g9cj", "sharp", "high", 5)],
        effects: ["next"],
        nodes: ["node_modules/sharp"],
      },
    },
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 3,
        critical: 0,
        total: 3,
      },
    },
  };
}

function addVulnerability(report, packageName, severity, identifier) {
  report.vulnerabilities[packageName] = {
    name: packageName,
    severity,
    isDirect: false,
    via: [advisory(identifier, packageName, severity, 99)],
    effects: ["next"],
    nodes: [`node_modules/next/node_modules/${packageName}`],
  };
  report.metadata.vulnerabilities[severity] += 1;
  report.metadata.vulnerabilities.total += 1;
}

describe("security audit policy", () => {
  it("rejects the superseded PostCSS and Sharp exceptions", () => {
    const result = evaluateAuditReport(supersededNextAuditReport());

    expect(result.warnings).toEqual([]);
    expect(result.failures).toHaveLength(4);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("GHSA-6g55-p6wh-862q"),
        expect.stringContaining("GHSA-r28c-9q8g-f849"),
        expect.stringContaining("GHSA-f88m-g3jw-g9cj"),
        expect.stringContaining("next via postcss, sharp"),
      ]),
    );
  });

  it("fails an unknown high-severity advisory", () => {
    const report = supersededNextAuditReport();
    addVulnerability(
      report,
      "unexpected-package",
      "high",
      "GHSA-1111-2222-3333",
    );

    expect(evaluateAuditReport(report).failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Unexpected high advisory GHSA-1111-2222-3333"),
      ]),
    );
  });

  it("fails every critical advisory", () => {
    const report = supersededNextAuditReport();
    addVulnerability(
      report,
      "critical-package",
      "critical",
      "GHSA-4444-5555-6666",
    );

    expect(evaluateAuditReport(report).failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Critical vulnerability summary"),
        expect.stringContaining("Unexpected critical advisory"),
      ]),
    );
  });

  it("rejects a formerly reviewed advisory at every node path", () => {
    const report = supersededNextAuditReport();
    report.vulnerabilities.sharp.nodes = [
      "node_modules/another-package/node_modules/sharp",
    ];

    expect(evaluateAuditReport(report).failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Unexpected high advisory GHSA-f88m-g3jw-g9cj"),
      ]),
    );
  });

  it("fails malformed audit JSON", () => {
    expect(() => parseAuditJson("{not-json")).toThrow(
      "npm audit returned malformed JSON",
    );
  });

  it("fails inconsistent npm audit summary metadata", () => {
    const report = supersededNextAuditReport();
    report.metadata.vulnerabilities.high = 0;

    expect(() => evaluateAuditReport(report)).toThrow(
      "does not match the vulnerability records",
    );
  });

  it("fails a critical package summary even when its advisory says high", () => {
    const report = supersededNextAuditReport();
    report.vulnerabilities.sharp.severity = "critical";
    report.metadata.vulnerabilities.high -= 1;
    report.metadata.vulnerabilities.critical += 1;

    expect(evaluateAuditReport(report).failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Critical vulnerability summary"),
      ]),
    );
  });

  it("fails audit command and registry errors", () => {
    expect(() =>
      assessAuditExecution({
        status: null,
        stdout: "",
        stderr: "",
        error: new Error("spawn failed"),
      }),
    ).toThrow("Could not execute npm audit");

    expect(() =>
      assessAuditExecution({
        status: 1,
        stdout: JSON.stringify({ error: { code: "EAI_AGAIN" } }),
        stderr: "registry unavailable",
      }),
    ).toThrow("not a supported npm audit report");
  });
});
