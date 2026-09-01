#!/usr/bin/env node
/**
 * Print the next eligible pending ticket folder under tasks/, or NONE.
 * Eligibility: status pending + every plan.md dependency has status done.
 *
 * Usage:
 *   node next-eligible.mjs           # one ticket id or NONE
 *   node next-eligible.mjs --list    # all eligible, ascending
 */
import fs from "node:fs";
import path from "node:path";

// User-level skill: resolve tasks/ from the repo cwd (run from project root).
const tasksRoot = path.resolve(process.cwd(), "tasks");

function readState(ticketDir) {
  const statusPath = path.join(tasksRoot, ticketDir, "status.md");
  if (!fs.existsSync(statusPath)) return null;
  const text = fs.readFileSync(statusPath, "utf8");
  const match = text.match(/\*\*State:\*\*\s*(\w+)/);
  return match?.[1] ?? null;
}

function ticketNumber(dir) {
  const m = dir.match(/^(\d{3})-/);
  return m ? Number(m[1]) : NaN;
}

function readDependencyIds(ticketDir, allTicketDirs) {
  const planPath = path.join(tasksRoot, ticketDir, "plan.md");
  if (!fs.existsSync(planPath)) return [];
  const text = fs.readFileSync(planPath, "utf8");
  const depsSection = text.match(
    /## Dependencies\r?\n([\s\S]*?)(?=\r?\n## |\r?\n*$)/,
  );
  if (!depsSection) return [];
  const body = depsSection[1].trim();
  if (!body || body === "—" || /^-\s*—\s*$/m.test(body)) return [];
  // Prose form: "None", "None (first ticket).", "- none"
  if (/^-?\s*(none|n\/a)\b/i.test(body)) return [];

  // Explicit slug bullets: - 004-auth-sessions
  const slugs = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s+(\d{3}-[a-z0-9-]+)\b/i);
    if (m) slugs.push(m[1]);
  }
  if (slugs.length > 0) return slugs;

  // "All tickets 001–019" / "all above" / "depends on all"
  const range = body.match(
    /all tickets\s+(\d{3})\s*[–—-]\s*(\d{3})/i,
  );
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    return allTicketDirs.filter((dir) => {
      const n = ticketNumber(dir);
      return n >= from && n <= to;
    });
  }

  if (/all above|depends on all|all tickets/i.test(body)) {
    const self = ticketNumber(ticketDir);
    return allTicketDirs.filter((dir) => ticketNumber(dir) < self);
  }

  // Unknown prose deps → treat as blocking until clarified (no false eligibility)
  console.error(
    `warn: could not parse dependencies for ${ticketDir}; treating as ineligible`,
  );
  return ["__unparsed__"];
}

function listTicketDirs() {
  return fs
    .readdirSync(tasksRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{3}-/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function isEligible(ticketDir, stateByTicket, allTicketDirs) {
  if (stateByTicket.get(ticketDir) !== "pending") return false;
  const deps = readDependencyIds(ticketDir, allTicketDirs);
  if (deps.includes("__unparsed__")) return false;
  return deps.every((dep) => stateByTicket.get(dep) === "done");
}

const ticketDirs = listTicketDirs();
const stateByTicket = new Map(
  ticketDirs.map((dir) => [dir, readState(dir)]),
);

const eligible = ticketDirs.filter((dir) =>
  isEligible(dir, stateByTicket, ticketDirs),
);

const listMode = process.argv.includes("--list");
if (listMode) {
  if (eligible.length === 0) {
    process.stdout.write("NONE\n");
  } else {
    process.stdout.write(eligible.join("\n") + "\n");
  }
} else {
  process.stdout.write((eligible[0] ?? "NONE") + "\n");
}
