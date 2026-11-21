#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

CRATE_DIR="$(pwd)"
BUILD_IMAGE="${BUILD_IMAGE:-1}"

echo "[core-rs] Building pipeline wasm (nodejs target)…"
wasm-pack build --target nodejs --release --out-dir pkg-node --features wasm

echo "[core-rs] Building pipeline wasm (web target)…"
wasm-pack build --target web --release --out-dir pkg-web --features wasm

if [ "$BUILD_IMAGE" = "1" ]; then
	echo "[core-rs] Building image wasm (nodejs target)…"
	wasm-pack build --target nodejs --release --out-dir pkg-node-image --features image-wasm

	echo "[core-rs] Building image wasm (web target)…"
	wasm-pack build --target web --release --out-dir pkg-web-image --features image-wasm
fi

echo "[core-rs] Done."
echo "    node pipeline:  $CRATE_DIR/pkg-node"
echo "    web  pipeline:  $CRATE_DIR/pkg-web"
if [ "$BUILD_IMAGE" = "1" ]; then
	echo "    node image:     $CRATE_DIR/pkg-node-image"
	echo "    web  image:     $CRATE_DIR/pkg-web-image"
fi
