# dist ブランチの更新手順

> `main` の最新ソースから pre-built artifact をビルドし、3 つの dist ブランチ
> (`dist-core`, `dist-core-rs`, `dist-ui`) にコミット & push する。
> 消費側プロジェクトはこの dist ブランチを参照しているので、ここを更新しない
> 限り消費側に新しい変更は流れない。

---

## 通常リリース

```bash
# 1. main で全テスト緑であることを確認
git switch main
git pull
pnpm install --frozen-lockfile
pnpm test

# 2. ワンショットで全 dist ブランチを更新
pnpm release:dist
```

スクリプトは内部で:

1. 作業ツリーが clean か確認 (uncommitted があれば中断)
2. `main` ブランチで実行しているか確認 (他ブランチなら確認プロンプト)
3. `pnpm install --frozen-lockfile`
4. `pnpm build` (core → core-rs → ui 全部)
5. `pnpm test` (`--no-test` で省略可)
6. 各パッケージごとに以下を実行:
   - `dist-<pkg>` ブランチを worktree (`.dist-worktree-<pkg>/`) に checkout
   - 前回内容を消す (履歴は残る)
   - artifact をコピー (TS dist / WASM bundle)
   - `package.json` を書換 (devDeps/scripts を drop、workspace 依存を sibling
     dist ブランチの git URL に変換)
   - commit (`chore(<pkg>): build from main@<sha>`)
   - push (`--no-push` で省略可)
   - worktree 後片付け

---

## ローカル確認だけしたい

```bash
pnpm release:dist --no-push
# → .dist-worktree-core/, .dist-worktree-core-rs/, .dist-worktree-ui/ に
#    ビルド成果物が残るので、内容を inspect できる
git -C .dist-worktree-core log -1
ls .dist-worktree-core
```

確認後の片付け:

```bash
git worktree remove .dist-worktree-core
git worktree remove .dist-worktree-core-rs
git worktree remove .dist-worktree-ui
```

---

## 初回 (まだ dist-\* ブランチが存在しない)

スクリプトは自動で orphan ブランチを作成するので、特別な手順は不要:

```bash
pnpm release:dist
```

初回 push 後は GitHub 上に 3 ブランチが生える。

---

## バージョン固定タグを切る

```bash
git tag -a v0.1.0-core    dist-core    -m "core v0.1.0"
git tag -a v0.1.0-core-rs dist-core-rs -m "core-rs v0.1.0"
git tag -a v0.1.0-ui      dist-ui      -m "ui v0.1.0"
git push origin v0.1.0-core v0.1.0-core-rs v0.1.0-ui
```

消費側で固定:

```jsonc
"@tarbo-table/core": "git+https://github.com/EedgeY/table.git#v0.1.0-core"
```

`#dist-core` だと常に最新を追う。タグ参照なら不変。

---

## トラブルシュート

| 症状                                         | 原因                                                      | 対処                                       |
| -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| `uncommitted changes; commit or stash first` | git 作業ツリーが dirty                                    | `git stash` または commit してから再実行   |
| Cargo / wasm-pack が `command not found`     | Nix devShell に入っていない                               | `nix develop` してから再実行               |
| dist ブランチに push できない (Permission)   | SSH 鍵 / GitHub 認証                                      | `ssh -T git@github.com` で確認             |
| pnpm test で 1 件失敗                        | コード変更でリグレッション                                | テスト直してから release                   |
| dist-core-rs に WASM が入らない              | `pnpm --filter @tarbo-table/core-rs build` が失敗している | `wasm-pack build` を手動実行してエラー確認 |

---

## CI 化 (将来)

`.github/workflows/release-dist.yml` で `main` への push をトリガーに自動更新も
可能。現状は手動。手動の方がうっかり壊れた dist を push しない安全性がある。

参考スケルトン:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  release-dist:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0, ssh-key: ${{ secrets.DIST_DEPLOY_KEY }} }
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: wasm32-unknown-unknown }
      - run: cargo install wasm-pack
      - run: pnpm install --frozen-lockfile
      - run: pnpm release:dist
```

(deploy key は `EedgeY/table` 用に発行し、push 権限を付与する)
