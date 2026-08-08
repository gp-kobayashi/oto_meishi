# Cloud Runデプロイ手順

この手順では、Next.js・FFmpeg・ffprobeをGoogle Cloud Runで実行し、音声ファイルをCloudflare R2へ保存します。

## 1. 前提

- Google Cloudで請求先アカウントを設定済み
- Google Cloud CLIをインストール済み
- SupabaseとCloudflare R2を作成済み
- リポジトリのルートでコマンドを実行する

Google Cloudへログインし、対象プロジェクトを設定します。

```powershell
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

以降の`YOUR_PROJECT_ID`は実際のGoogle CloudプロジェクトIDへ置き換えてください。

## 2. APIを有効化する

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com iam.googleapis.com cloudresourcemanager.googleapis.com
```

## 3. Artifact Registryを作成する

東京リージョンにDockerリポジトリを作成します。

```powershell
gcloud artifacts repositories create oto-meishi --repository-format=docker --location=asia-northeast1 --description="oto_meishi container images"
```

すでに作成済みの場合、この操作は不要です。

## 4. Cloud Run実行アカウントを作成する

```powershell
gcloud iam service-accounts create oto-meishi-runner --display-name="oto_meishi Cloud Run runtime"
```

実行アカウントはGoogle Cloud上の秘密値を読むためだけに使用します。R2やSupabaseの秘密値をDockerイメージへ直接設定しないでください。

## 5. Secret Managerへ秘密値を登録する

Google Cloud Consoleの「Secret Manager」で以下の6件を作成し、初期バージョンを`1`として値を登録します。

| Secret名 | 設定する値 |
| --- | --- |
| `oto-meishi-database-url` | SupabaseのPostgreSQL接続URL |
| `oto-meishi-supabase-service-role-key` | Supabaseのservice role key |
| `oto-meishi-r2-account-id` | CloudflareアカウントID |
| `oto-meishi-r2-access-key-id` | R2 APIトークンのAccess Key ID |
| `oto-meishi-r2-secret-access-key` | R2 APIトークンのSecret Access Key |
| `oto-meishi-moderation-cleanup-secret` | 32文字以上のランダムな定期削除API用Bearerトークン |

各Secretに対して、Cloud Run実行アカウントへ「Secret Managerのシークレットアクセサー」権限を付与します。

```powershell
$PROJECT_ID = gcloud config get-value project
$RUNNER = "serviceAccount:oto-meishi-runner@$PROJECT_ID.iam.gserviceaccount.com"
$SECRETS = @(
  "oto-meishi-database-url",
  "oto-meishi-supabase-service-role-key",
  "oto-meishi-r2-account-id",
  "oto-meishi-r2-access-key-id",
  "oto-meishi-r2-secret-access-key",
  "oto-meishi-moderation-cleanup-secret"
)

foreach ($SECRET in $SECRETS) {
  gcloud secrets add-iam-policy-binding $SECRET --member=$RUNNER --role="roles/secretmanager.secretAccessor"
}
```

Secretを更新した場合は新しいバージョン番号を確認し、`cloudbuild.yaml`の参照番号も変更してください。

## 6. Cloud Buildの権限を設定する

Google Cloud Consoleの「Cloud Build > 設定」で、ビルドに使用されるサービスアカウントへ以下の権限を付与します。

- Cloud Run管理者
- Artifact Registry書き込み
- ログ書き込み
- Cloud Build編集者
- `oto-meishi-runner`に対するサービスアカウントユーザー

Google Cloudプロジェクトの作成時期によって、デフォルトのCloud Buildサービスアカウントが異なる場合があります。Consoleに表示される実際のビルドサービスアカウントへ付与してください。

## 7. デプロイする

以下の公開値を準備します。

- `YOUR_SUPABASE_URL`: Supabase Project URL
- `YOUR_SUPABASE_ANON_KEY`: Supabase anon key
- `YOUR_SITE_URL`: 公開サイトのオリジン（現在は`https://oto-meishi.com`）
- `YOUR_R2_BUCKET`: 非公開R2バケット名

これらはブラウザまたは構成上公開される値です。service role keyやR2 Secret Access Keyを`--substitutions`へ指定しないでください。

```powershell
gcloud builds submit --config=cloudbuild.yaml --substitutions="_NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL,_NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY,_NEXT_PUBLIC_SITE_URL=YOUR_SITE_URL,_R2_BUCKET=YOUR_R2_BUCKET"
```

`NEXT_PUBLIC_SITE_URL`はDockerイメージのビルド時にブラウザ用コードへ埋め込まれます。ドメインを変更した場合は、`_NEXT_PUBLIC_SITE_URL`を変更して新しいイメージをビルド・デプロイしてください。

この処理は次の順序で実行されます。

1. Dockerイメージをビルド
2. Artifact Registryへ保存
3. Cloud Runへデプロイ

Cloud Runには次の費用抑制設定が適用されます。

- 最小インスタンス0
- 最大インスタンス1
- 1 vCPU
- メモリ512MiB
- 同時リクエスト8
- リクエストタイムアウト120秒
- リクエスト処理中のみCPUを割り当て

## 8. デプロイ結果を確認する

サービスURLを確認します。

```powershell
gcloud run services describe oto-meishi --region=asia-northeast1 --format="value(status.url)"
```

ブラウザでサービスURLを開き、次を確認してください。

1. トップページが表示される
2. Supabaseでログインできる
3. プロフィールを保存できる
4. 3分以内の音声をアップロードできる
5. 公開プロフィールで音声を再生できる
6. 管理者ページへ管理者だけがアクセスできる

ログを確認する場合は次を実行します。

```powershell
gcloud run services logs read oto-meishi --region=asia-northeast1 --limit=100
```

## 9. SupabaseのリダイレクトURLを更新する

独自ドメインの割り当て後、Supabase DashboardのAuthentication URL Configurationで公開URLを設定します。

- Site URL: `https://oto-meishi.com`
- Redirect URL: `https://oto-meishi.com/profile`
- Redirect URL: `https://oto-meishi.com/reset-password`

Google・Facebook側のOAuth設定にも、Supabase Dashboardに表示されるコールバックURLを登録してください。

## 10. モデレーションの定期処理を設定する

ユーザー対応期限の処理と、保持期限を過ぎた審査用音声の削除を、1日1回Cloud Schedulerから実行します。`CLEANUP_SECRET`にはSecret Managerの`oto-meishi-moderation-cleanup-secret`と同じ値を一時的に設定してください。

```powershell
$SERVICE_URL = gcloud run services describe oto-meishi --region=asia-northeast1 --format="value(status.url)"
$CLEANUP_SECRET = Read-Host "MODERATION_CLEANUP_SECRET"

gcloud scheduler jobs create http oto-meishi-audio-evidence-cleanup `
  --location=asia-northeast1 `
  --schedule="0 3 * * *" `
  --time-zone="Asia/Tokyo" `
  --uri="$SERVICE_URL/api/internal/moderation/audio-evidence/cleanup" `
  --http-method=POST `
  --headers="Authorization=Bearer $CLEANUP_SECRET" `
  --attempt-deadline=120s `
  --max-retry-attempts=3 `
  --min-backoff=60s

gcloud scheduler jobs create http oto-meishi-moderation-deadlines `
  --location=asia-northeast1 `
  --schedule="10 3 * * *" `
  --time-zone="Asia/Tokyo" `
  --uri="$SERVICE_URL/api/internal/moderation/deadlines" `
  --http-method=POST `
  --headers="Authorization=Bearer $CLEANUP_SECRET" `
  --attempt-deadline=120s `
  --max-retry-attempts=3 `
  --min-backoff=60s

Remove-Variable CLEANUP_SECRET
```

これらのAPIは`MODERATION_CLEANUP_SECRET`が未設定、またはBearerトークンが一致しない場合は`401`を返します。Cloud Schedulerジョブを閲覧・変更できる権限は、運用に必要な管理者だけへ付与してください。シークレットを更新した場合は、Cloud RunのSecret参照とSchedulerのヘッダーを同じ値へ更新します。

期限処理は条件付き更新を使用し、Cloud Schedulerの再試行や重複実行で監査履歴と通知を二重作成しない設計です。2つの処理が同時にCloud Runへ到達しないよう、実行時刻を10分ずらしています。

Cloud Schedulerは現在、請求先アカウントごとに月3ジョブまで無料です。この構成では2ジョブを使用します。料金は変更される可能性があるため、デプロイ時に[Cloud Schedulerの料金](https://cloud.google.com/scheduler/pricing)を確認してください。

初回は手動実行し、結果とCloud Runログを確認します。

```powershell
gcloud scheduler jobs run oto-meishi-audio-evidence-cleanup --location=asia-northeast1
gcloud scheduler jobs run oto-meishi-moderation-deadlines --location=asia-northeast1
gcloud run services logs read oto-meishi --region=asia-northeast1 --limit=100
```

## 11. 費用を確認する

Cloud Runはアクセスがないとき0インスタンスまで縮小するため、最初のアクセスにはコールドスタートが発生します。

Google Cloud Billingで予算アラートを作成し、Cloud Run、Cloud Build、Artifact Registry、Secret Managerの利用額を確認してください。予算アラートは課金を自動停止する機能ではありません。
