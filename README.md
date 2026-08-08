# oto_meishi

音声を添えたデジタル名刺を作成・共有できるWebアプリケーションです。プロフィール、SNS・Webサイトへのリンク、音声を1枚のカードにまとめ、ユーザーごとの公開URLから閲覧できます。

## 主な機能

### ユーザー向け

- Supabase Authを利用した新規登録、ログイン、ログアウト
- ユーザーIDごとの公開名刺ページ
- 表示名、自己紹介、テーマ、音声タイトルの編集
- SNS・Webサイトリンクの登録（最大4件、`https://`のみ）
- QRコードによる公開ページの共有
- 音声ファイルのアップロード、差し替え、削除、再生
- FFmpegによる音声検査、AAC（M4A）変換、2パスのラウドネス正規化
- 不適切な音声、誹謗中傷、危険なリンクなどの通報
- モデレーション対応内容の通知と既読管理
- ヘルプページ、利用規約ページ

### 管理者向け

- 管理者ロール（`moderator` / `admin`）によるアクセス制御
- プロフィール、音声、リンク、通報の一覧・詳細確認
- プロフィールや音声の非公開・復旧、プロフィールの利用停止
- リンクの非公開・復旧
- 通報ステータスと対応メモの管理
- モデレーション履歴の保存
- 対応時に対象ユーザーへ定型通知を作成

### 音声とストレージ

- 入力上限: 64 MiB、180秒
- 出力: AAC-LC / M4A、既定128 kbps、最大5 MiB
- ラウドネス目標: -16 LUFS、True Peak -1.5 dBTP、LRA 11 LU
- FFprobeでストリーム、長さ、サンプルレート、チャンネル数などを検査
- 変換処理は同時実行数を制限し、一時ファイルを処理後に削除
- 音声は非公開のCloudflare R2バケットへ保存
- 再生時のみ短時間（既定60秒、最大300秒）の署名付きURLを発行
- 音声差し替え時、審査証拠として参照中の旧音声は最大60日保持し、それ以外は削除

## 使用技術

| 分類 | 技術 |
| --- | --- |
| フロントエンド / API | Next.js 16（App Router）、React 19、TypeScript |
| 認証 | Supabase Auth |
| データベース | Supabase Postgres |
| ORM | Prisma 7、`@prisma/adapter-pg` |
| オブジェクトストレージ | Cloudflare R2、AWS SDK for JavaScript |
| 音声処理 | FFmpeg、FFprobe |
| テスト | Vitest、Testing Library、jsdom |
| CI | GitHub Actions |
| スタイル | CSS Modules、Tailwind CSS 4 |
| コンテナ | Docker、Next.js standalone output |

## ディレクトリ構成

```text
app/                  Next.js App RouterのページとRoute Handler
components/           UIコンポーネント
lib/                  認証、DB、R2、音声処理、検証などのロジック
prisma/               Prismaスキーマと設定
supabase/migrations/  Supabase Postgresのマイグレーション
tests/                API、コンポーネント、ライブラリのテスト
public/               画像やSVGなどの静的ファイル
docs/                 補足ドキュメント
```

## セットアップ

### 前提環境

- Node.js 24.x
- npm
- Docker DesktopなどのDocker実行環境
- Supabaseプロジェクト
- 非公開のCloudflare R2バケット

FFmpegとFFprobeの実行ファイルはnpmパッケージに含まれるため、通常はOSへ別途インストールする必要はありません。
Supabase CLIは開発依存関係としてバージョンを固定しているため、`npm ci`でインストールされます。

### Node.jsのサポート方針

公開時の正式サポート対象はNode.js 24.xです。ローカル開発は`.nvmrc`と`package.json`、Dockerは各Dockerfile、CIはGitHub Actionsで同じメジャーバージョンを使用します。

- Node.js 22は新規環境のサポート対象外です。公式EOLは2027年4月30日の予定です。
- Node.js 26は正式サポートの対象外です。2026年10月28日のLTS移行後に、localStorage関連テストを含む全テストと本番ビルドを再検証します。
- Node.js 24の公式EOLは2028年4月30日の予定です。遅くとも2027年10月末までに後継LTSへの移行計画を見直し、EOLまでに移行します。

日程は[Node.js公式リリース予定](https://github.com/nodejs/release#release-schedule)を基準とし、変更があった場合はこの方針も更新します。

### 1. 依存関係をインストール

```bash
npm ci
```

### 2. 環境変数を用意

`.env.example`をコピーして、プロジェクトルートに`.env.local`を作成します。

```powershell
Copy-Item .env.example .env.local
```

macOS / Linuxの場合:

```bash
cp .env.example .env.local
```

設定する変数は次のとおりです。

| 変数 | 公開範囲 | 必須 | 用途 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ブラウザへ公開 | 必須 | SupabaseプロジェクトURL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ブラウザへ公開 | 必須 | Supabaseのanon key。RLSと組み合わせて使用 |
| `NEXT_PUBLIC_SITE_URL` | ブラウザへ公開 | 必須 | 公開プロフィール、QRコード、画面上のURL表示に使用するサイトのオリジン |
| `DATABASE_URL` | サーバーのみ | 必須 | Prismaが利用するPostgres接続文字列 |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバーのみ | 必須 | サーバー側でユーザーを検証するservice role key |
| `R2_ACCOUNT_ID` | サーバーのみ | 必須 | CloudflareアカウントID |
| `R2_ACCESS_KEY_ID` | サーバーのみ | 必須 | R2 APIトークンのAccess Key ID |
| `R2_SECRET_ACCESS_KEY` | サーバーのみ | 必須 | R2 APIトークンのSecret Access Key |
| `MODERATION_CLEANUP_SECRET` | サーバーのみ | 必須（本番） | モデレーション期限処理と審査用音声削除の内部APIで使用するBearer認証用ランダム値 |
| `ACCOUNT_BAN_HASH_SECRET` | サーバーのみ | 必須（本番） | 再登録禁止対象のメール・外部認証IDをHMAC照合値へ変換する32文字以上の秘密値 |
| `R2_BUCKET` | サーバーのみ | 必須 | 非公開R2バケット名 |
| `R2_REGION` | サーバーのみ | 必須 | 通常は`auto` |
| `R2_PUBLIC_URL` | サーバーのみ | 任意 | 過去の公開R2 URLをオブジェクトキーへ移行するときだけ使用 |

設定例:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000

DATABASE_URL=postgresql://user:password@host:5432/postgres
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
MODERATION_CLEANUP_SECRET=replace-with-at-least-32-random-characters
ACCOUNT_BAN_HASH_SECRET=replace-with-another-stable-32-character-secret
R2_BUCKET=your-private-bucket
R2_REGION=auto
R2_PUBLIC_URL=
```

`.env.local`は`.gitignore`の対象です。`DATABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、R2の認証情報、`MODERATION_CLEANUP_SECRET`、`ACCOUNT_BAN_HASH_SECRET`をGitへコミットしたり、`NEXT_PUBLIC_`を付けたりしないでください。`NEXT_PUBLIC_`付きの値はブラウザへ含まれるため、秘密情報には使用できません。

`ACCOUNT_BAN_HASH_SECRET`は既存の再登録禁止記録との照合に継続して必要です。通常のシークレット更新では変更せず、漏えい時は既存照合値の移行方法を決めてから更新してください。

`NEXT_PUBLIC_SITE_URL`はパスや末尾スラッシュを含まないオリジンを設定します。ローカル開発では`http://localhost:3000`、本番環境では次の値を使用します。

```env
NEXT_PUBLIC_SITE_URL=https://oto-meishi.com
```

将来ドメインを変更する場合は、この環境変数を新しいHTTPSオリジンへ変更して再ビルドしてください。`NEXT_PUBLIC_`で始まる環境変数はNext.jsのビルド時にブラウザ用コードへ埋め込まれるため、Cloud Runの実行時設定だけを変更しても反映されません。

### 3. Supabaseを設定

Supabase CLIへログインし、対象プロジェクトをリンクします。

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

適用予定のSQLを確認してから、マイグレーションを反映します。

```bash
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase migration list
```

このプロジェクトでは`supabase/migrations/`をDB変更履歴の正として扱います。既存DBへ安易に`prisma db push`を実行せず、マイグレーションファイルを経由してください。

Supabase AuthではEmail認証を有効にし、Site URLとRedirect URLへローカルURLおよびデプロイ先URLを登録してください。

### 4. Cloudflare R2を設定

1. R2でバケットを作成し、公開アクセスを無効にする
2. 対象バケットの読み書き権限を持つR2 APIトークンを作成する
3. アカウントID、Access Key ID、Secret Access Key、バケット名を`.env.local`へ設定する

音声の公開URLをDBへ保存する構成ではありません。DBにはR2のオブジェクトキーを保存し、再生APIが認可・公開状態を確認してから署名付きURLを返します。

モデレーションで非公開にした音声は、修正前後を管理者が比較できるよう、スナップショットの期限（原則60日）までR2へ保持します。期限切れ音声は内部APIによる定期処理で削除します。現在のプロフィールまたは期限内スナップショットから参照されている音声は削除されません。R2削除に失敗した場合はDBの保存キーを残し、次回の定期処理で再試行します。

### 5. Prisma Clientを生成

```bash
npx prisma generate
```

### 6. 開発サーバーを起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)を開きます。

## 管理者の登録

管理画面を使用するには、Supabase Authで作成済みのユーザーIDを`AdminUser.authId`へ登録します。`AUTH_USER_ID`はSupabase DashboardのAuthentication > Usersで確認できます。

```sql
insert into public."AdminUser" ("authId", "role", "isActive")
values ('AUTH_USER_ID', 'admin', true);
```

通常の確認・対応だけを行うユーザーには`moderator`を指定できます。管理者権限はクライアント側の情報ではなく、サーバーがSupabaseのユーザーIDと`AdminUser`を照合して判断します。

管理者権限、管理画面の操作、モデレーションの状態遷移、通知、データ保持の現行仕様と決定済みの変更方針は、[管理者機能の現行仕様](docs/admin-moderation.md)を参照してください。管理者機能を変更する場合は、実装コードとテストコードと同じPR内で仕様書も更新します。

## 開発用コマンド

```bash
npm run dev         # 開発サーバー
npm run build       # 本番ビルド
npm run start       # ビルド済みアプリを起動
npm run lint        # ESLint
npm test                     # 外部サービスへ接続しない通常テスト
npm run test:integration     # ローカル環境を使用する統合テスト
npm run supabase:test:start  # テスト用Supabaseを最小構成で起動
npm run supabase:test:status # ローカル接続情報を表示
npm run supabase:test:reset  # ローカルDBを再作成
npm run supabase:test:stop   # テスト用Supabaseを停止
npm run test:watch           # Vitestのwatchモード
```

## テスト

### 通常テスト

```bash
npm test
```

通常テストでは、モックを使用するテストと外部サービスへ接続しないテストだけを実行します。`*.integration.test.ts`は実行対象に含まれず、`.env.docker`や`.env.integration.local`も読み込みません。

### 統合テスト

統合テストはSupabase Auth、Postgres、FFmpegなどを実際に使用します。本番や共有環境ではなく、Supabase CLIで起動したローカル環境だけを使用してください。事前にDockerを起動します。

#### 1. ローカルSupabaseを起動

```bash
npm run supabase:test:start
```

このコマンドではDB、Auth、APIゲートウェイなど統合テストに必要なサービスを残し、Studio、Storage、Realtimeなどは起動しません。初回はDockerイメージの取得に時間がかかる場合があります。

#### 2. 専用環境変数を設定

起動後、ローカルSupabaseのURLとキーを確認します。

```bash
npm run supabase:test:status
```

`.env.integration.example`をコピーして`.env.integration.local`を作成し、表示されたローカル環境の値を設定します。

```powershell
Copy-Item .env.integration.example .env.integration.local
```

macOS / Linuxの場合:

```bash
cp .env.integration.example .env.integration.local
```

| 変数 | 用途 |
| --- | --- |
| `INTEGRATION_SUPABASE_URL` | ローカルSupabase APIのURL |
| `INTEGRATION_SUPABASE_ANON_KEY` | ローカルSupabaseのanon key |
| `INTEGRATION_DATABASE_URL` | ローカルPostgresの接続文字列 |
| `INTEGRATION_SUPABASE_SERVICE_ROLE_KEY` | テスト用Authユーザーを削除するためのローカルservice role key |
| `INTEGRATION_ACCOUNT_BAN_HASH_SECRET` | 再登録禁止の照合テストだけに使う32文字以上の任意の秘密値 |

`INTEGRATION_ACCOUNT_BAN_HASH_SECRET`には本番の秘密値を流用せず、ローカル統合テスト専用の値を設定してください。ホストされたSupabaseプロジェクトのURLやキーは設定しないでください。`.env.integration.local`はGitの管理対象外です。

#### 3. ローカルDBを再作成

新規DB相当の状態やマイグレーション追加後の状態を確認するときは、ローカルDBをリセットします。

```bash
npm run supabase:test:reset
```

このコマンドは`--local`を明示しており、ローカルDBのデータを削除した後、`supabase/migrations/`を順番に適用します。開発中のローカルデータも消えるため、必要な場合だけ実行してください。リンク済みのSupabaseプロジェクトには適用しません。

#### 4. 統合テストを実行

```bash
npm run test:integration
```

統合テストは環境変数をアプリ用の変数へ設定する前にURLを解析し、接続先ホストとプロトコルを検証します。現在許可しているホストは次のとおりです。

- `localhost`
- `127.0.0.1`
- `::1`
- `host.docker.internal`

Supabaseには`http:`または`https:`、Postgresには`postgres:`または`postgresql:`だけを許可します。環境変数の未設定、形式不正、許可されていない接続先は、通信やDB接続を始める前にエラーになります。CIで別のテスト用サービス名を使用する場合は、接続先検証の許可リストとテストを明示的に変更してください。

通常の繰り返し実行では、テスト単位のクリーンアップを使用します。プロフィール統合テストが作成するプロフィール、メールアドレス、Authユーザーには実行ごとのUUIDを使用し、終了時にその実行で記録したプロフィール、SNSリンク、Authユーザーだけを削除します。既存データや他の実行が作成したデータを名前の部分一致などで削除しない方針です。

DBリセットは、全マイグレーションを新規DB相当で検証するときや、テストが強制終了してデータが残った場合に使用します。

#### 5. ローカルSupabaseを停止

```bash
npm run supabase:test:stop
```

## セキュリティ上の主な対策

- Supabaseアクセストークンをサーバーで検証し、プロフィール所有者・管理者を認可
- PostgresのRLSと権限設定
- service role keyとR2認証情報をサーバー環境に限定
- 非公開R2バケットと短時間の署名付き再生URL
- プロフィール、音声、リンクの公開状態を再生・表示時に確認
- 音声・JSON・URL・文字数・Content-Typeの検証
- APIごとのユーザー単位・IP単位のレート制限
- CSP、HSTS、`X-Frame-Options`などのセキュリティヘッダー
- 管理操作、通報対応、通知作成をDBトランザクションで保存
- 個人向けAPIレスポンスの`private, no-store`指定

レート制限は現在アプリプロセス内のメモリで管理しています。Cloud Runを複数インスタンスへ水平分散する場合は、Redisなどの共有ストアへの移行を検討してください。

## Dockerでの起動

開発用Docker Composeを使用する場合は`.env.docker`を作成し、`.env.local`と同じ変数を設定します。コンテナからホスト上のローカルSupabaseへ接続する場合、URLには`host.docker.internal`を使用します。

```bash
docker compose up --build
```

本番向け`Dockerfile`はNext.js standalone output、FFmpeg、FFprobeを含むNode.jsコンテナを生成します。

## デプロイ予定

アプリケーションのデプロイ先はGoogle Cloud Runを予定しています。認証とデータベースにはSupabase、音声ストレージにはCloudflare R2を引き続き使用します。

```text
GitHub
  └─ Cloud Build
       ├─ Dockerイメージをビルド
       ├─ Artifact Registryへ保存
       └─ Cloud Runへデプロイ
            ├─ Supabase Auth / Postgres
            ├─ Cloudflare R2
            └─ Secret Manager
```

リポジトリには、Next.js standalone outputとFFmpeg / FFprobeを含む`Dockerfile`、Cloud Buildからビルド・保存・デプロイする`cloudbuild.yaml`が含まれています。現在の設定は費用を抑えるため、次の構成です。

- リージョン: `asia-northeast1`
- 最小インスタンス数: 0
- 最大インスタンス数: 1
- CPU: 1 vCPU
- メモリ: 512 MiB
- 同時リクエスト数: 8
- リクエストタイムアウト: 120秒
- リクエスト処理中のみCPUを割り当て

最大インスタンス数を1にすることで、ポートフォリオ運用時の想定外の課金と音声変換の多重実行を抑えます。アクセスがない場合は0インスタンスまで縮小するため、最初のアクセスではコールドスタートが発生する場合があります。音声変換時のメモリ使用量は、デプロイ後にCloud Runのメトリクスで確認してください。

本番環境では、公開値と秘密値を分けて設定してください。

- Dockerビルド時と実行時の公開値: `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`NEXT_PUBLIC_SITE_URL`
- Secret Manager: `DATABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、R2認証情報、`MODERATION_CLEANUP_SECRET`、`ACCOUNT_BAN_HASH_SECRET`
- Cloud Runの通常環境変数: `R2_BUCKET`、`R2_REGION`

Google CloudのAPI有効化、Artifact Registry、実行サービスアカウント、Secret Manager、Cloud Buildの権限、デプロイコマンドについては[Cloud Runデプロイ手順](docs/cloud-run-deployment.md)を参照してください。

## 補足

- プロフィールのテーマは`normal`、`dark`、`light`、`colorful`の4種類です。
- 表示名は20文字、自己紹介は60文字、音声タイトルとSNSラベルは25文字までです。
- SNS・WebサイトURLは`https://`で始まるURLだけを登録できます。
- 管理機能や通知機能を追加・変更した場合は、PrismaスキーマだけでなくSupabaseマイグレーションも更新してください。
