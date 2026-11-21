#!/usr/bin/env bash
# Publish pre-built artifacts to three distribution branches.
#
# This monorepo has three publishable packages: core, core-rs, ui.
# For each one we maintain a separate branch — `dist-core`, `dist-core-rs`,
# `dist-ui` — where the package sits at the repo root with its `package.json`
# rewritten to point at its sibling dist branches via git URLs.
#
# Why three branches instead of one?
#   - `pnpm add github:user/repo#branch` always treats the branch root as one
#     npm package. Subpath syntax in git URLs is fragile across pnpm/npm
#     versions; per-package branches sidestep that entirely.
#   - Consumers can pull just `@tarbo-table/core` without dragging UI/wasm.
#
# Usage:
#   pnpm release:dist               # build + commit + push all three
#   pnpm release:dist --no-push     # local-only (for inspection)
#   pnpm release:dist --no-test     # skip test gate (NOT recommended)

set -euo pipefail
cd "$(dirname "$0")/.."

PUSH=1
RUN_TESTS=1
for arg in "$@"; do
	case "$arg" in
		--no-push) PUSH=0 ;;
		--no-test) RUN_TESTS=0 ;;
		--help|-h)
			head -n 18 "$0" | sed -n 's/^# //p; s/^#//p'
			exit 0
			;;
		*) echo "unknown flag: $arg"; exit 2 ;;
	esac
done

echo "▸ checking working tree…"
if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "  ✗ uncommitted changes; commit or stash first." >&2
	exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
	echo "  ⚠ not on main (current: $BRANCH). continue? [y/N]"
	read -r ans
	[[ "$ans" =~ ^[Yy] ]] || exit 1
fi

echo "▸ pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

echo "▸ pnpm build (core → core-rs → ui)"
pnpm build

if [[ $RUN_TESTS -eq 1 ]]; then
	echo "▸ pnpm test"
	pnpm test
fi

MAIN_SHA="$(git rev-parse --short HEAD)"
RELEASED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
REPO_URL="${TARBO_REPO_URL:-git+https://github.com/EedgeY/table.git}"
export REPO_URL

rewrite_package_json() {
	local src=$1
	local dst=$2
	local workspace_yaml="$PWD/pnpm-workspace.yaml"
	node --input-type=module --no-warnings - "$src" "$dst" "$workspace_yaml" <<'NODE'
import fs from 'node:fs';

const [src, dst, workspaceYaml] = process.argv.slice(2);
const REPO = process.env.REPO_URL || 'git+https://github.com/EedgeY/table.git';
const distBranchFor = {
	'@tarbo-table/core':    `${REPO}#dist-core`,
	'@tarbo-table/core-rs': `${REPO}#dist-core-rs`,
	'@tarbo-table/ui':      `${REPO}#dist-ui`,
};

function parseCatalogs(text) {
	const out = {};
	const lines = text.split('\n');
	let inCatalogs = false;
	let group = null;
	for (const raw of lines) {
		if (!raw.trim()) continue;
		if (!inCatalogs) {
			if (/^catalogs:\s*$/.test(raw)) inCatalogs = true;
			continue;
		}
		if (/^[^\s#].*:/.test(raw)) {
			inCatalogs = false;
			group = null;
			continue;
		}
		const groupM = raw.match(/^ {2}([A-Za-z0-9_-]+):\s*(\{\s*\})?\s*$/);
		if (groupM) {
			group = groupM[1];
			out[group] ??= {};
			continue;
		}
		if (group) {
			const entryM = raw.match(/^ {4}["']?([^"'\s:]+)["']?:\s*(.+?)\s*$/);
			if (entryM) {
				const key = entryM[1].replace(/^["']|["']$/g, '');
				out[group][key] = entryM[2].replace(/^["']|["']$/g, '');
			}
		}
	}
	return out;
}

const catalogs = parseCatalogs(fs.readFileSync(workspaceYaml, 'utf8'));

function resolveCatalog(pkg, spec) {
	const m = /^catalog:(.*)$/.exec(spec);
	if (!m) return spec;
	const group = m[1] || 'default';
	const entry = catalogs[group]?.[pkg];
	if (!entry) {
		throw new Error(`catalog ${group} has no entry for ${pkg} (spec ${spec})`);
	}
	return entry;
}

const json = JSON.parse(fs.readFileSync(src, 'utf8'));
delete json.devDependencies;
delete json.scripts;
delete json.private;

for (const field of ['dependencies', 'peerDependencies']) {
	const deps = json[field];
	if (!deps) continue;
	for (const k of Object.keys(deps)) {
		const v = deps[k];
		if (distBranchFor[k]) {
			deps[k] = distBranchFor[k];
		} else if (typeof v === 'string' && v.startsWith('catalog:')) {
			deps[k] = resolveCatalog(k, v);
		}
	}
}

fs.writeFileSync(dst, JSON.stringify(json, null, '\t') + '\n');
NODE
}

release_package() {
	local pkg=$1
	local branch=$2
	local worktree=".dist-worktree-$pkg"

	echo
	echo "═══ $pkg → $branch ═══"

	if [[ -d "$worktree" ]]; then
		git worktree remove --force "$worktree" 2>/dev/null || rm -rf "$worktree"
	fi

	if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
		git fetch origin "$branch"
		git worktree add -B "$branch" "$worktree" "origin/$branch"
	else
		git worktree add --detach "$worktree" HEAD
		(cd "$worktree" && git checkout --orphan "$branch" && git rm -rf . >/dev/null 2>&1 || true)
	fi

	find "$worktree" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +

	case "$pkg" in
		core)
			rsync -a packages/core/dist/ "$worktree/dist/"
			rewrite_package_json packages/core/package.json "$worktree/package.json"
			[[ -f packages/core/README.md ]] && cp packages/core/README.md "$worktree/" || true
			;;
		core-rs)
			rsync -a packages/core-rs/pkg-node/ "$worktree/pkg-node/"
			rsync -a packages/core-rs/pkg-web/  "$worktree/pkg-web/"
			rsync -a packages/core-rs/src/      "$worktree/src/"
			rewrite_package_json packages/core-rs/package.json "$worktree/package.json"
			[[ -f packages/core-rs/README.md ]] && cp packages/core-rs/README.md "$worktree/" || true
			;;
		ui)
			rsync -a packages/ui/dist/ "$worktree/dist/"
			rewrite_package_json packages/ui/package.json "$worktree/package.json"
			[[ -f packages/ui/README.md ]] && cp packages/ui/README.md "$worktree/" || true
			;;
		*)
			echo "unknown package: $pkg" >&2; exit 1 ;;
	esac

	cat > "$worktree/.RELEASE_INFO.md" <<EOF
# @tarbo-table/$pkg — dist branch

Pre-built artifacts for npm-less consumption. Do not edit directly.
Built from \`main@$MAIN_SHA\` at \`$RELEASED_AT\`.

For usage, see https://github.com/EedgeY/table/blob/main/docs/USAGE.md
EOF

	cd "$worktree"
	git add -A
	if git diff --cached --quiet; then
		echo "  no changes vs current $branch; nothing to commit."
	else
		git -c user.name="release-dist" -c user.email="release-dist@local" \
			commit -m "chore($pkg): build from main@$MAIN_SHA"
		if [[ $PUSH -eq 1 ]]; then
			git push -u origin "$branch"
		else
			echo "  (--no-push) inspect: cd $worktree && git log -1"
		fi
	fi
	cd ..

	if [[ $PUSH -eq 1 ]]; then
		git worktree remove "$worktree"
	fi
}

release_package core    dist-core
release_package core-rs dist-core-rs
release_package ui      dist-ui

echo
echo "✓ done. Built from main@$MAIN_SHA at $RELEASED_AT."
if [[ $PUSH -eq 0 ]]; then
	echo "  (--no-push) worktrees left at .dist-worktree-*/"
fi
