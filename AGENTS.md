## py

- 依存は`uv add`．pyproject直接編集禁止
- 直接`python/python3`実行しない．必ず`uv run`利用
- csv保存はencoding='utf-8-sig'

## Core Principles

- 日本語回答
- web検索/context7で最新情報取得
- jjをgitより優先利用
- 曖昧なことがあればなんでもいつでも質問。
- You are not alone. 同時作業は無視.
- テストはユーザーが求める振る舞いやE2Eのみ．内部ロジックなどは将来のリファクタリングを妨げるのでテストしない．

## Release

- `mainにpush` と言われた場合は、明示的に除外されない限り、リリース完了確認まで含める。
- このリポジトリのリリースは `main` への Conventional Commit を起点に GitHub Actions の semantic-release で行う。
- リリースを発火させる必要がある依存更新は、既存運用に合わせて `fix(deps...)` のコミットにする。
- `main` push 後は `Semantic Release` と `Release Multi-Platform` の workflow 完了を確認する。

### 禁止事項

- 指示されていないフォールバック
- 早期失敗
- pass-through/後方互換のラッパー メソッド
