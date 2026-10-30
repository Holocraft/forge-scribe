/**
 * Rewrite module.json URLs for a GitHub release.
 * Run from CI with GITHUB_REPOSITORY=owner/repo and GITHUB_REF_NAME=v0.1.0.
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repo = process.env.GITHUB_REPOSITORY ?? "OWNER/folio";
const tag = process.env.GITHUB_REF_NAME ?? `v${JSON.parse(readFileSync("module.json", "utf8")).version}`;
const version = tag.replace(/^v/, "");
const manifest = JSON.parse(readFileSync("module.json", "utf8"));
manifest.version = version;
manifest.url = `https://github.com/${repo}`;
manifest.manifest = `https://github.com/${repo}/releases/latest/download/module.json`;
manifest.download = `https://github.com/${repo}/releases/download/${tag}/folio.zip`;

const moduleDir = resolve("build/folio");
mkdirSync(moduleDir, { recursive: true });
for (const entry of ["LICENSE", "README.md", "dist", "lang"]) {
  cpSync(entry, resolve(moduleDir, entry), { recursive: true });
}
writeFileSync(resolve(moduleDir, "module.json"), `${JSON.stringify(manifest, null, 2)}\n`);
mkdirSync(dirname(resolve("build/module.json")), { recursive: true });
writeFileSync(resolve("build/module.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Stamped ${repo} ${tag}`);
