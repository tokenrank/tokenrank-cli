import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("standalone installers", () => {
  it("owns the Unix installation and optional onboarding flow", async () => {
    const script = await readFile("install.sh", "utf8");

    expect(script).toContain("tokenrank/tokenrank-cli/releases/latest/download");
    expect(script).toContain("${HOME}/.tokenrank");
    expect(script).toContain("${install_dir}/bin");
    expect(script).toContain("${release_base}/tokenrank.mjs");
    expect(script).toContain("TOKENRANK_WEBHOOK_URL");
    expect(script).toContain('"${bin_dir}/tokenrank" service install');
    expect(script.indexOf('"${bin_dir}/tokenrank" service install')).toBeLessThan(
      script.indexOf('"${bin_dir}/tokenrank" upload'),
    );
  });

  it("fails with an actionable Unix permissions message", async () => {
    const script = await readFile("install.sh", "utf8");

    expect(script).toContain('if ! mkdir -p "${install_dir}" "${bin_dir}" 2>/dev/null; then');
    expect(script).toContain('[[ ! -w "${install_dir}" || ! -w "${bin_dir}" ]]');
    expect(script).toContain("Set TOKENRANK_HOME and TOKENRANK_BIN_DIR");
  });

  it("owns the Windows installation, PATH update, and optional onboarding flow", async () => {
    const script = await readFile("install.ps1", "utf8");

    expect(script).toContain("tokenrank/tokenrank-cli/releases/latest/download");
    expect(script).toContain("tokenrank.cmd");
    expect(script).toContain('[Environment]::SetEnvironmentVariable("Path", $updatedUserPath, "User")');
    expect(script).toContain("TOKENRANK_WEBHOOK_URL");
    expect(script).toContain("& $cmdPath service install");
    expect(script.indexOf("& $cmdPath service install")).toBeLessThan(
      script.indexOf("& $cmdPath upload"),
    );
  });
});
