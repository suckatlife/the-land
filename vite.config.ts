import { defineConfig } from "vite";
import { execSync } from "node:child_process";

/** A short, human-readable identity for this build.
 *
 *  Vercel builds from a detached HEAD and does not guarantee a usable git
 *  checkout, but it does hand us the commit SHA directly. Locally, ask git.
 *  Either way the result is the first seven characters of the commit that
 *  produced the bundle, which is what you paste into `git show`. */
function buildId(): string {
  const fromCi = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
}

// UTC, minute resolution. Enough to tell two deploys apart on the same commit.
const builtAt = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
    __BUILD_TIME__: JSON.stringify(builtAt),
  },
});
