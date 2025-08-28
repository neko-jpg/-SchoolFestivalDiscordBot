# -bot
これは、文化祭ディスコードbot作成のためのレポジトリです

環境変数について（ID の命名）
- `DISCORD_CLIENT_ID` / `DISCORD_GUILD_ID` を優先して使用します。
- 後方互換のため `CLIENT_ID` / `GUILD_ID` も読み込み可能です（両方設定された場合は `DISCORD_*` を採用）。
- `.env.example` に両方の例を記載しています。

型安全な環境変数
- すべての設定値は `src/env.ts` で `zod` により検証・正規化され、`env` として提供されます。
- コードからは `import { env } from './env'` を使って参照してください（`process.env` の直接参照は避ける）。
- 現在サポート: `DISCORD_TOKEN`, `CLIENT_ID`/`DISCORD_CLIENT_ID`, `GUILD_ID`/`DISCORD_GUILD_ID`, `COMMANDS_SCOPE`, `NODE_ENV`, `LOG_LEVEL`, ほかオプション値。

トラブルシューティング（スラッシュコマンドが出てこない）
- `npm run deploy` のログに以下が出ます：
  - デプロイ範囲（`guild` or `global`）、`clientId`、`guildId`、登録コマンド一覧
  - Discord API から取得した現在のコマンド一覧（件数と名前）
  - トークンのアプリケーション ID と `CLIENT_ID` が一致しているかの確認
  - 対象ギルド在籍確認（在籍していない場合はインストール URL を案内）
  - 各コマンドの `default_member_permissions` / `dm_permission` に関する注意
- `global` は反映まで最大1時間かかることがあります。即時確認したい場合は `COMMANDS_SCOPE=guild` でギルド単位にデプロイしてください。
- Bot が対象サーバーに参加しているか、十分な権限があるか（少なくともコマンドの可視化に必要な `applications.commands` スコープでインストールされているか）を確認してください。

起動時の差分確認
- Bot 起動時（`Ready! Logged in` 後）、ローカルで読み込んだコマンド名と、Discord 側（guild/global）の登録済みコマンド名を比較して差分をログ出力します。
- 差分がある場合は `npm run deploy` の実行を促す警告が出ます（guild: ほぼ即時反映、global: 反映に時間がかかる点に注意）。
- さらに、説明やオプション構造の差分も検出して `changed` として表示します（簡易比較）。

起動時の自動デプロイ（オプション）
- `.env` に `AUTO_DEPLOY_ON_STARTUP=true` を設定すると、起動時の差分検出後に自動で上書き登録します。
- 対象範囲は `COMMANDS_SCOPE` に従います（`guild`/`global`/`both`）。`clear-*` では実行しません。
- グローバルは反映に時間がかかるため、直後のUI反映は遅れる場合があります。

コマンドファイルの読込
- 読込ディレクトリ: 実行時は `dist/commands`、開発時（ts-node）は `src/commands`。
- 対象拡張子: `.ts` / `.js`。サブディレクトリも再帰的に読み込みます。
- 期待するエクスポート: `data`（SlashCommandBuilder）と `execute(interaction)`。ESM の default export でも CommonJS の `module.exports` でも可。
- ログ: 読み込んだファイル一覧、読み込み成功/スキップ理由（`Invalid command module shape` など）を出力します。

除外ルール
- 型定義ファイル: `*.d.ts` は読み込み対象外。
- テストファイル: `*.test.ts/js`・`*.spec.ts/js` は対象外。
- ディレクトリ: `__tests__` / `__mocks__` 配下は再帰探索から除外。

ホットリロード（開発モード）
- `NODE_ENV` が `production` 以外のとき、`src/commands` 配下の `.ts`/`.js` を監視し、追加/変更/削除を自動反映します。
- コマンド名の変更・重複検知時は置換し、ログで警告します。
- Windows/macOS はネイティブ再帰監視に対応。環境によっては監視が無効な場合があり、その際はワーニングが出ます。

COMMANDS_SCOPE の扱い
- 設定場所: `.env` の `COMMANDS_SCOPE`。
- 許可値: `guild` / `global` / `both` / `clear-guild` / `clear-global`（大文字小文字は不問）。
- 既定値: 未設定時は `guild`。
- 挙動:
  - `guild`: 対象ギルドのスラッシュコマンドを上書き登録。
  - `global`: グローバルのスラッシュコマンドを上書き登録（反映まで最大1時間）。
  - `both`: ギルド→グローバルの順で両方に登録。
  - `clear-guild`: 対象ギルドのスラッシュコマンドを全削除（空配列で上書き）。
  - `clear-global`: グローバルのスラッシュコマンドを全削除（空配列で上書き）。
- 利用箇所: デプロイスクリプト（`src/deploy-commands.ts`）が `env.COMMANDS_SCOPE` を参照します。

デプロイ前の差分チェック（Preflight Diff）
- `npm run deploy` 実行時、常に Discord 側の登録内容とローカル定義を比較して差分をログ出力します（guild/global/両方、`COMMANDS_SCOPE` に準拠）。
- 差分の種類: `missingOnRemote`（未登録）、`extraOnRemote`（不要）、`changed`（説明・オプション構造の差分）。
- 変更を加えたくない場合は `.env` に `COMMANDS_DRY_RUN=true` を設定すると、差分表示のみで終了します。

ターゲット指定デプロイ
- `.env` に `COMMANDS_TARGET` をカンマ区切りで設定すると、該当コマンドのみ登録対象になります。
- 例: `COMMANDS_TARGET=ping,config,shift`

可視性診断（guild）
- `.env` に `VISIBILITY_CHECK_USER_ID` を設定すると、対象ユーザーが `default_member_permissions` を満たすかをギルド権限で推定してログに出します。
- 権限はギルドの役職（@everyone 含む）から合算し、Owner/ADMINISTRATOR は常に満たす扱いです（チャンネル上書きは考慮しません）。
