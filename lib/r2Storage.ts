import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs/promises";
import path from "path";

// R2設定の型定義
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region?: string;
}

// R2クライアントのシングルトン
let r2Client: S3Client | null = null;

/**
 * R2クライアントを初期化する
 */
function getR2Client(): S3Client {
  if (!r2Client) {
    const config: R2Config = {
      accountId: process.env.R2_ACCOUNT_ID || "",
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      bucketName: process.env.R2_BUCKET || "",  // .envの変数名に合わせて R2_BUCKET を使用
      region: process.env.R2_REGION || "auto",
    };

    if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
      throw new Error("Missing required R2 configuration. Please check environment variables.");
    }

    if (!process.env.R2_PUBLIC_URL) {
      throw new Error("R2_PUBLIC_URL is required. Please set it in your environment variables.");
    }

    r2Client = new S3Client({
      region: config.region,
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return r2Client;
}

/**
 * ファイルをR2ストレージにアップロードする
 * @param filePath アップロードするファイルのローカルパス
 * @param key R2内のオブジェクトキー（ファイルパス）
 * @param contentType MIMEタイプ
 * @returns アップロードされたファイルの公開URL
 */
export async function uploadToR2(
  filePath: string,
  key: string,
  contentType: string = "audio/mp4",
): Promise<string> {
  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET!;  // .envの変数名に合わせて R2_BUCKET を使用
  const r2PublicUrl = process.env.R2_PUBLIC_URL || "";

  // ファイルを読み込む
  const fileBuffer = await fs.readFile(filePath);

  // R2にアップロード
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  });

  await client.send(command);

  // 公開URLを返す（R2_PUBLIC_URLから生成）
  return `${r2PublicUrl}/${key}`;
}

/**
 * ユーザーIDに基づいた一意のファイルキーを生成する
 * @param userId ユーザーID
 * @param originalFilename 元のファイル名
 * @returns R2オブジェクトキー
 */
export function generateAudioKey(userId: string, originalFilename: string): string {
  const timestamp = Date.now();
  const ext = path.extname(originalFilename);
  const baseName = path.basename(originalFilename, ext);
  return `audio/${userId}/${baseName}-${timestamp}.m4a`;
}

/**
 * R2からファイルを削除する
 * @param key R2内のオブジェクトキー（ファイルパス）
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET!;

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await client.send(command);
}

/**
 * URLからR2オブジェクトキーを抽出する
 * @param url R2公開URL
 * @returns R2オブジェクトキー
 */
export function extractKeyFromUrl(url: string): string {
  const r2PublicUrl = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");
  if (url.startsWith(`${r2PublicUrl}/`)) {
    return url.substring(r2PublicUrl.length + 1);
  }
  if (url === r2PublicUrl) {
    return "";
  }
  return url;
}
