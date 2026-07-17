import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const source = path.join(
  process.cwd(),
  "node_modules",
  "pdf-parse",
  "dist",
  "pdf-parse",
  "cjs",
  "pdf.worker.mjs",
);
const targetDirectories = [
  path.join(
    process.cwd(),
    ".next",
    "server",
    "app",
    "api",
    "profile",
    "parse-resume",
  ),
  path.join(process.cwd(), ".next", "server", "chunks"),
];

for (const targetDirectory of targetDirectories) {
  const target = path.join(targetDirectory, "pdf.worker.mjs");
  await fs.mkdir(targetDirectory, { recursive: true });
  await fs.copyFile(source, target);
  console.log(`Copied PDF worker to ${path.relative(process.cwd(), target)}`);
}
