#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "TokenRank requires Node.js. Install Node.js first: https://nodejs.org/"
  exit 1
fi

release_base="${TOKENRANK_RELEASE_BASE_URL:-https://github.com/tokenrank/tokenrank-cli/releases/latest/download}"
install_dir="${TOKENRANK_HOME:-${HOME}/.tokenrank}"
bin_dir="${TOKENRANK_BIN_DIR:-${install_dir}/bin}"

if ! mkdir -p "${install_dir}" "${bin_dir}" 2>/dev/null; then
  echo "TokenRank cannot create its install directories:" >&2
  echo "  ${install_dir}" >&2
  echo "  ${bin_dir}" >&2
  echo "Set TOKENRANK_HOME and TOKENRANK_BIN_DIR to directories owned by your user, then retry." >&2
  exit 1
fi

if [[ ! -w "${install_dir}" || ! -w "${bin_dir}" ]]; then
  echo "TokenRank cannot write to its install directories:" >&2
  echo "  ${install_dir}" >&2
  echo "  ${bin_dir}" >&2
  echo "Set TOKENRANK_HOME and TOKENRANK_BIN_DIR to directories owned by your user, then retry." >&2
  exit 1
fi

curl -fsSL "${release_base}/tokenrank.mjs" -o "${install_dir}/tokenrank.mjs"
curl -fsSL "${release_base}/package.json" -o "${install_dir}/package.json"
chmod +x "${install_dir}/tokenrank.mjs"
ln -sf "${install_dir}/tokenrank.mjs" "${bin_dir}/tokenrank"

echo "TokenRank collector installed: ${bin_dir}/tokenrank"
if ! command -v tokenrank >/dev/null 2>&1; then
  echo "Add this to your shell PATH if tokenrank is not found:"
  printf '  export PATH="%s:$PATH"\n' "${bin_dir}"
fi

if [[ -n "${TOKENRANK_WEBHOOK_URL:-}" ]]; then
  TOKENRANK_NO_LOGO=1 "${bin_dir}/tokenrank" connect "${TOKENRANK_WEBHOOK_URL}"
  TOKENRANK_NO_LOGO=1 "${bin_dir}/tokenrank" service install
  "${bin_dir}/tokenrank" upload
else
  "${bin_dir}/tokenrank" tools
fi
