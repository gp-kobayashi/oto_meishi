# 音声付き名刺アプリ（oto_meishi）

音声ファイルを添付できるデジタル名刺アプリです。プロフィール情報、SNSリンク、音声ファイルを管理・共有できます。

## 機能

- **プロフィール管理**: 表示名、自己紹介、テーマの設定
- **SNSリンク**: 複数のSNSサービスのリンク追加（最大4つ）
- **音声ファイル**: 音声ファイルのアップロードと再生
- **音声変換**: アップロードされた音声ファイルをAAC形式（.m4a）に自動変換
- **古い音源削除**: 新しい音源をアップロード時、古い音源を自動削除
- **文字数制限**: 表示名（20文字）、自己紹介（60文字）、音声タイトル（25文字）、SNSラベル（25文字）
- **テーマ切り替え**: 標準、ダーク、ライト、カラフルの4つのテーマ

## 環境設定

プロジェクトルートに `.env.local` ファイルを作成し、以下の環境変数を設定してください。

```env
# Cloudflare R2 Storage Configuration
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET=your_bucket_name
R2_REGION=auto

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### R2の設定手順

1. Cloudflare R2でバケットを作成
2. R2アクセス権を持つAPIトークンを生成
3. `.env.local`ファイルに認証情報を追加
4. バケットの公開アクセスは有効にせず、再生時は短時間の署名URLを使用

### Supabaseの設定手順

1. `supabase start` を実行してローカルSupabaseを起動
2. 出力された `API URL` を `NEXT_PUBLIC_SUPABASE_URL` にコピー
3. 出力された `anon key` を `NEXT_PUBLIC_SUPABASE_ANON_KEY` にコピー
4. 出力された `service_role key` を `SUPABASE_SERVICE_ROLE_KEY` にコピー

### Docker環境での開発

Dockerを使用した開発環境を設定する場合：

1. `.env.docker` ファイルを作成し、以下の変数を設定：
```env
# Cloudflare R2 Storage Configuration
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET=your_bucket_name
R2_REGION=auto

# Supabase Configuration (for local testing)
NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

2. Docker Composeで実行：
```bash
docker-compose up --build
```

3. アプリにアクセス: http://localhost:3000

## 音声変換について

アップロードされた音声ファイルは、FFmpegを使用してAAC形式（.m4a, 128kbps）に自動変換されます。これにより、すべてのブラウザでの互換性が確保され、MP3よりも良い圧縮率が提供されます。変換はサーバーサイドでffmpeg-staticを使用して処理されます。

## 開始方法

まず、開発サーバーを起動します：

```bash
npm run dev
# または
yarn dev
# または
pnpm dev
# または
bun dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてアプリを確認してください。

`app/page.tsx` を編集することでページを変更できます。ファイルを編集するとページが自動的に更新されます。

## プロジェクト構成

- `app/`: Next.jsのApp Routerを使用したページ構成
- `components/`: Reactコンポーネント
- `lib/`: ユーティリティ関数（R2ストレージ、Supabaseクライアント、音声変換など）
- `prisma/`: データベーススキーマ
- `supabase/`: Supabaseのマイグレーションファイル

## データベースのセットアップ

1. Prismaスキーマをデータベースに適用：
```bash
npx prisma db push
```

2. Supabaseのマイグレーションを実行：
```bash
supabase db reset
```

## デプロイ

Vercelを使用してデプロイするのが最も簡単です：

[Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) からデプロイできます。

詳細は [Next.jsデプロイメントドキュメント](https://nextjs.org/docs/app/building-your-application/deploying) を参照してください。

## 依存関係

- Next.js: Reactフレームワーク
- Supabase: 認証とデータベース
- Prisma: ORM
- Cloudflare R2: オブジェクトストレージ
- FFmpeg: 音声変換
