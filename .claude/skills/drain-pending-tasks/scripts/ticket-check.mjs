#!/usr/bin/env node
/**
 * Verify a ticket is genuinely done, without the agent reading status.md/plan.md.
 * Prints "OK <ticket>" (exit 0) or "FAIL <ticket>" + reasons (exit 1).
 *
 * Usage: node ticket-check.mjs 027-character-plan-review-routing
 */
import fs from "node:fs";
import path from "node:path";

const ticket = process.argv[2];
if (!ticket) {
  process.stdout.write("FAIL: no ticket argument\n");
  process.exit(1);
}

const statusPath = path.resolve(process.cwd(), "tasks", ticket, "status.md");
if (!fs.existsSync(statusPath)) {
  process.stdout.write(`FAIL ${ticket}\n- status.md not found at ${statusPath}\n`);
  process.exit(1);
}

const text = fs.readFileSync(statusPath, "utf8");
const reasons = [];

const section = (name) => {
  const m = text.match(
    new RegExp(`##\\s+${name}\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s|$)`, "i"),
  );
  return m ? m[1].trim() : "";
};

const state = text.match(/\*\*State:\*\*\s*(\w+)/)?.[1] ?? "missing";
if (state !== "done") reasons.push(`state is "${state}", expected "done"`);

const completed = text.match(/\*\*Completed:\*\*\s*(.+)/)?.[1]?.trim() ?? "";
if (!completed || completed === "—") reasons.push("Completed date not set");

for (const name of ["Progress", "Acceptance criteria"]) {
  const body = section(name);
  if (!body) {
    reasons.push(`missing "## ${name}" section`);
    continue;
  }
  const unchecked = body
    .split(/\r?\n/)
    .filter((l) => /^\s*[-*]\s*\[\s\]/.test(l))
    .map((l) => l.trim().replace(/^[-*]\s*\[\s\]\s*/, "").slice(0, 60));
  if (unchecked.length > 0) {
    // Cap output: reasons are read by an agent, so keep them cheap.
    const shown = unchecked.slice(0, 3).join(" | ");
    const more = unchecked.length > 3 ? ` (+${unchecked.length - 3} more)` : "";
    reasons.push(`${unchecked.length} unchecked in ${name}: ${shown}${more}`);
  }
}

const handoff = section("Handoff");
if (!handoff || /Leave empty until the ticket is done/i.test(handoff)) {
  reasons.push("Handoff still empty/placeholder");
} else if (!/test/i.test(handoff) && !/test/i.test(section("Notes"))) {
  reasons.push("Handoff/Notes mention no tests (add tests or a Notes exception)");
}

if (reasons.length === 0) {
  process.stdout.write(`OK ${ticket}\n`);
  process.exit(0);
}
process.stdout.write(`FAIL ${ticket}\n${reasons.map((r) => `- ${r}`).join("\n")}\n`);
process.exit(1);
