import * as fs from "node:fs";
import * as path from "node:path";
import { WhiskerReport, SessionLog } from "./types.js";

export async function writeReport(
  report: WhiskerReport,
  sessionLog: SessionLog,
  outputDir: string,
  version: string = "0.1.0"
): Promise<{ markdownPath: string; jsonPath: string; screenshotDir: string }> {
  // Ensure output directories exist
  const screenshotDir = path.join(outputDir, "screenshots");

  // Clear existing screenshots from previous runs
  if (fs.existsSync(screenshotDir)) {
    const existingFiles = fs.readdirSync(screenshotDir);
    for (const file of existingFiles) {
      if (file.endsWith(".png")) {
        fs.unlinkSync(path.join(screenshotDir, file));
      }
    }
  }

  fs.mkdirSync(screenshotDir, { recursive: true });

  // Write report.json
  const jsonPath = path.join(outputDir, "report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // Write screenshots
  for (const step of sessionLog.steps) {
    const filename = `step-${String(step.stepNumber).padStart(3, "0")}.png`;
    const filepath = path.join(screenshotDir, filename);
    fs.writeFileSync(filepath, Buffer.from(step.screenshotBase64, "base64"));
  }

  // Generate and write report.md
  const markdown = generateMarkdown(report, version);
  const markdownPath = path.join(outputDir, "report.md");
  fs.writeFileSync(markdownPath, markdown);

  return { markdownPath, jsonPath, screenshotDir };
}

function generateMarkdown(report: WhiskerReport, version: string): string {
  const lines: string[] = [];

  lines.push("# Whisker Usability Test Report");
  lines.push("");
  lines.push(`**Task:** ${report.metadata.task}`);
  lines.push(`**URL:** ${report.metadata.url}`);
  if (report.metadata.persona) {
    lines.push(`**Persona:** ${report.metadata.persona}`);
  }
  lines.push(`**Date:** ${report.metadata.timestamp}`);
  lines.push(
    `**Duration:** ${(report.metadata.duration / 1000).toFixed(1)} seconds`
  );
  lines.push(`**Steps taken:** ${report.metadata.totalSteps}`);
  lines.push(`**Task completed:** ${report.taskCompleted ? "Yes" : "No"}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(report.summary);
  lines.push("");

  if (report.taskCompletionNotes) {
    lines.push("## Task Completion");
    lines.push("");
    lines.push(report.taskCompletionNotes);
    lines.push("");
  }

  // Group findings by severity
  const bySeverity = {
    critical: report.findings.filter((f) => f.severity === "critical"),
    major: report.findings.filter((f) => f.severity === "major"),
    minor: report.findings.filter((f) => f.severity === "minor"),
    suggestion: report.findings.filter((f) => f.severity === "suggestion"),
  };

  const totalFindings = report.findings.length;
  lines.push(`## Findings (${totalFindings} total)`);
  lines.push("");

  if (totalFindings === 0) {
    lines.push("No issues found during this test session.");
    lines.push("");
  }

  for (const [severity, findings] of Object.entries(bySeverity)) {
    if (findings.length === 0) continue;

    const severityLabel = {
      critical: "🔴 P0 Critical",
      major: "🟠 P1 Major",
      minor: "🟡 P2 Minor",
      suggestion: "💡 P3 Suggestion",
    }[severity];

    lines.push(
      `### ${severityLabel} (${findings.length})`
    );
    lines.push("");

    for (const finding of findings) {
      lines.push(`#### ${finding.id}: ${finding.title}`);
      lines.push("");
      lines.push(`**Category:** ${finding.category}`);
      lines.push("");
      lines.push(finding.description);
      lines.push("");

      if (finding.stepsToReproduce && finding.stepsToReproduce.length > 0) {
        lines.push("**Steps to reproduce:**");
        for (let i = 0; i < finding.stepsToReproduce.length; i++) {
          lines.push(`${i + 1}. ${finding.stepsToReproduce[i]}`);
        }
        lines.push("");
      }

      if (finding.screenshotStepNumber) {
        const screenshotPath = `screenshots/step-${String(finding.screenshotStepNumber).padStart(3, "0")}.png`;
        lines.push(`**Screenshot:** [Step ${finding.screenshotStepNumber}](${screenshotPath})`);
        lines.push("");
      }

      if (finding.suggestedFix) {
        lines.push(`**Suggested fix:** ${finding.suggestedFix}`);
        lines.push("");
      }

      if (finding.grepPatterns && finding.grepPatterns.length > 0) {
        lines.push("**Search patterns:**");
        lines.push("```");
        for (const pattern of finding.grepPatterns) {
          lines.push(`grep -r "${pattern}" src/`);
        }
        lines.push("```");
        lines.push("");
      }
    }
  }

  if (report.consoleErrors.length > 0) {
    lines.push("## Console Errors");
    lines.push("");
    lines.push("The following JavaScript errors were detected:");
    lines.push("");
    lines.push("```");
    for (const err of report.consoleErrors) {
      lines.push(err);
    }
    lines.push("```");
    lines.push("");
  }

  if (report.networkFailures.length > 0) {
    lines.push("## Network Failures");
    lines.push("");
    lines.push("The following network requests failed:");
    lines.push("");
    for (const fail of report.networkFailures) {
      lines.push(
        `- \`${fail.method} ${fail.url}\` → ${fail.status} ${fail.statusText}`
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  const displayVersion = version.startsWith("v") ? version : `v${version}`;
  lines.push(
    `*Generated by Whisker ${displayVersion} using ${report.metadata.modelUsed}*`
  );

  return lines.join("\n");
}
