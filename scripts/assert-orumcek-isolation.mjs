import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const forbiddenDirs = [
  join(root, "src/lib/data"),
  join(root, "src/lib/home"),
  join(root, "src/lib/discovery"),
  join(root, "src/lib/seo"),
  join(root, "src/app/[locale]"),
];

function listFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

test("orumcek is isolated from public discovery paths", () => {
  const hits = [];
  for (const dir of forbiddenDirs) {
    for (const file of listFiles(dir)) {
      const source = readFileSync(file, "utf8");
      if (source.includes("@/lib/orumcek") || source.includes("lib/orumcek/")) {
        hits.push(file.replace(root + "/", ""));
      }
    }
  }
  assert.deepEqual(hits, [], `Public discovery path imported Örümcek:\n${hits.join("\n")}`);
});

test("orumcek crawl path never imports publish_event adapters", () => {
  const hits = [];
  for (const file of listFiles(join(root, "src/lib/orumcek"))) {
    const source = readFileSync(file, "utf8");
    if (
      source.includes("publish-event-action") ||
      source.includes("publishEventAction") ||
      source.includes("approve-and-publish-event-action")
    ) {
      hits.push(file.replace(root + "/", ""));
    }
  }
  assert.deepEqual(hits, [], `Örümcek imported a publish adapter:\n${hits.join("\n")}`);
});
