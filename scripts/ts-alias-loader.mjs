import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcRoot = join(repoRoot, "src");

function existingFile(base) {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate));
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const matched = existingFile(join(srcRoot, specifier.slice(2)));
    if (matched) {
      return { url: pathToFileURL(matched).href, shortCircuit: true };
    }
  }

  if (
    context.parentURL &&
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.(js|mjs|cjs|ts|tsx|json)$/.test(specifier)
  ) {
    const parentDir = join(fileURLToPath(context.parentURL), "..");
    const matched = existingFile(join(parentDir, specifier));
    if (matched) {
      return { url: pathToFileURL(matched).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
