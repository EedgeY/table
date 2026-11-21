{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";
  inputs.rust-overlay.url = "github:oxalica/rust-overlay";
  inputs.rust-overlay.inputs.nixpkgs.follows = "nixpkgs";

  outputs = { self, nixpkgs, flake-utils, rust-overlay }: flake-utils.lib.eachDefaultSystem (system:
    let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [ (import rust-overlay) ];
      };
      pnpm = pkgs.pnpm_10.override { nodejs = pkgs.nodejs_22; };

      rust = pkgs.rust-bin.stable.latest.default.override {
        targets = [ "wasm32-unknown-unknown" ];
        extensions = [ "rust-src" ];
      };
    in {
      devShells.default = pkgs.mkShellNoCC {
        packages = [
          pkgs.nodejs_22
          pnpm
          rust
          pkgs.wasm-pack
          pkgs.wasm-bindgen-cli
          pkgs.binaryen
          pkgs.git
          pkgs.gh
          pkgs.jq
          pkgs.typos
          pkgs.lefthook
        ];
        shellHook = ''
          if [ -f pnpm-lock.yaml ]; then
            if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules/.pnpm/lock.yaml 2>/dev/null ]; then
              pnpm install --frozen-lockfile
            fi
          fi
          export CARGO_TARGET_DIR="$PWD/target"
        '';
      };
    });
}
