import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs/promises";
import { randomUUID } from "crypto";

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

export const DEFAULT_AUDIO_URL_EXPIRY_SECONDS = 60;
const MAX_AUDIO_URL_EXPIRY_SECONDS = 300;

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
  if (!process.env.R2_PUBLIC_URL) {
    throw new Error("R2_PUBLIC_URL is required while uploads return a public URL.");
  }

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
 * 音声オブジェクトを一時的に再生できる署名付きURLを生成する
 * @param key R2内の音声オブジェクトキー
 * @param expiresInSeconds URLの有効期限（秒）
 */
export async function createSignedAudioUrl(
  key: string,
  expiresInSeconds: number = DEFAULT_AUDIO_URL_EXPIRY_SECONDS,
): Promise<string> {
  const pathSegments = key.split("/");
  const isAudioKey =
    key.startsWith("audio/") &&
    !key.includes("\\") &&
    !pathSegments.includes("..") &&
    pathSegments.every(Boolean);

  if (!isAudioKey) {
    throw new Error("Invalid audio object key.");
  }

  if (
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > MAX_AUDIO_URL_EXPIRY_SECONDS
  ) {
    throw new Error(
      `Audio URL expiry must be an integer between 1 and ${MAX_AUDIO_URL_EXPIRY_SECONDS} seconds.`,
    );
  }

  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * ユーザーIDに基づいた一意のファイルキーを生成する
 * @param userId ユーザーID
 * @returns R2オブジェクトキー
 */
export function generateAudioKey(userId: string): string {
  return `audio/${encodeURIComponent(userId)}/${randomUUID()}.m4a`;
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
