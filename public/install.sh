#!/bin/sh
# Atlas CLI installer.
#
#   curl -fsSL https://www.atlaslabs.id/install.sh | sh
#
# Downloads one self-contained file and puts an 'atlas' launcher on your PATH.
# No package manager, no dependencies beyond Node 20+.
set -eu

VERSION="0.2.0"
SHA256="5c570ecc50cf0db3bf78e4889a25da4c91b742093abeec115d2f77f7ae09766b"
BASE_URL="${ATLAS_INSTALL_BASE:-https://www.atlaslabs.id}"
SRC="${BASE_URL}/download/atlas.cjs"

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "Node.js 20+ is required. Install it from https://nodejs.org, then re-run."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "${NODE_MAJOR}" -ge 20 ] || die "Node.js 20+ is required (found $(node -v))."

# Prefer a PATH dir we can already write to, so no sudo is needed.
if [ -w "/usr/local/bin" ]; then
  BIN_DIR="/usr/local/bin"
else
  BIN_DIR="${HOME}/.local/bin"
  mkdir -p "${BIN_DIR}"
fi
LIB_DIR="${HOME}/.local/lib/atlas"
mkdir -p "${LIB_DIR}"

TMP=$(mktemp) || die "could not create a temp file"
trap 'rm -f "${TMP}"' EXIT

say "Downloading Atlas CLI ${VERSION} ..."
curl -fsSL "${SRC}" -o "${TMP}" || die "download failed from ${SRC}"

# Verify before anything lands on PATH: a corrupted or swapped download must
# never become an executable the user runs.
if command -v shasum >/dev/null 2>&1; then
  GOT=$(shasum -a 256 "${TMP}" | awk '{print $1}')
elif command -v sha256sum >/dev/null 2>&1; then
  GOT=$(sha256sum "${TMP}" | awk '{print $1}')
else
  GOT=""
fi
if [ -n "${GOT}" ] && [ "${GOT}" != "${SHA256}" ]; then
  die "checksum mismatch - expected ${SHA256}, got ${GOT}. Aborting."
fi

mv "${TMP}" "${LIB_DIR}/atlas.cjs"
trap - EXIT
chmod 0644 "${LIB_DIR}/atlas.cjs"

printf '#!/bin/sh\nexec node "%s/atlas.cjs" "$@"\n' "${LIB_DIR}" > "${BIN_DIR}/atlas"
chmod 0755 "${BIN_DIR}/atlas"

say ""
say "Installed atlas ${VERSION} -> ${BIN_DIR}/atlas"
case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *) say ""
     say "  ${BIN_DIR} is not on your PATH. Add it:"
     say "    echo 'export PATH=\"${BIN_DIR}:\$PATH\"' >> ~/.zshrc && exec zsh" ;;
esac
say ""
say "Next:  atlas login"
