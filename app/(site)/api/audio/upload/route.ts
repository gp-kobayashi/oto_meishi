import { NextRequest, NextResponse } from "next/server";
import {
  convertToAac,
  MAX_CONVERTED_AUDIO_FILE_SIZE_BYTES,
} from "@/lib/audioConverter";
import {
  deleteFromR2,
  extractKeyFromUrl,
  generateAudioKey,
  uploadToR2,
} from "@/lib/r2Storage";
import path from "path";
import fs from "fs/promises";
import { AUDIO_TEMP_ROOT } from "@/lib/audioTempDirectory";
import { createServerSupabaseClient } from "@/lib/supabaseClient";
import { prisma } from "@/lib/prisma";
import { inspectAudioFile } from "@/lib/audioInspector";
import {
  validateAudioMetadata,
  validateConvertedAudioMetadata,
} from "@/lib/audioUploadPolicy";
import { MAX_AUDIO_FILE_SIZE_BYTES } from "@/lib/audioUploadConstraints";
import { tryAcquireAudioConversionSlot } from "@/lib/audioConversionGuard";
import {
  consumeAudioUploadIpRateLimit,
  consumeAudioUploadUserRateLimit,
} from "@/lib/audioUploadRateLimit";
import { getClientIp } from "@/lib/clientIp";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  compareModeratedContentHashes,
  createModerationContentHash,
  getModerationDeadline,
} from "@/lib/moderationRemediation";
import {
  canDeleteAudioObject,
  getAudioObjectReferenceState,
} from "@/lib/moderationAudioEvidence";

const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const MAX_REQUEST_BODY_SIZE_BYTES =
  MAX_AUDIO_FILE_SIZE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;

function exceedsRequestSizeLimit(contentLength: string | null): boolean {
  if (!contentLength) {
    return false;
  }

  const size = Number(contentLength);
  return Number.isSafeInteger(size) && size > MAX_REQUEST_BODY_SIZE_BYTES;
}

export async function POST(request: NextRequest) {
  try {
    // Authorizationヘッダーの検証
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid token" },
        { status: 401 },
      );
    }

    if (exceedsRequestSizeLimit(request.headers.get("Content-Length"))) {
      return NextResponse.json(
        { error: "音声ファイルは64MB以下にしてください。" },
        { status: 413 },
      );
    }

    const token = authHeader.split(" ")[1];

    let authenticatedUserId: string;
    try {
      const supabaseServer = createServerSupabaseClient();
      const { data: { user }, error } = await supabaseServer.auth.getUser(token);
      if (error || !user) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid token" },
          { status: 401 },
        );
      }
      authenticatedUserId = user.id;
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Token verification failed" },
        { status: 401 },
      );
    }

    const rateLimit = consumeAudioUploadUserRateLimit(authenticatedUserId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "音声アップロードの回数が上限に達しました。しばらく待ってから再度お試しください。",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
          },
        },
      );
    }

    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const ipRateLimit = consumeAudioUploadIpRateLimit(clientIp);
      if (!ipRateLimit.allowed) {
        return NextResponse.json(
          {
            error:
              "この接続元からの音声アップロードが集中しています。しばらく待ってから再度お試しください。",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(ipRateLimit.retryAfterSeconds),
              "X-RateLimit-Limit": String(ipRateLimit.limit),
              "X-RateLimit-Remaining": String(ipRateLimit.remaining),
              "X-RateLimit-Reset": String(
                Math.ceil(ipRateLimit.resetAt / 1000),
              ),
            },
          },
        );
      }
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const userId = formData.get("userId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "空の音声ファイルはアップロードできません。" },
        { status: 400 },
      );
    }

    if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "音声ファイルは64MB以下にしてください。" },
        { status: 413 },
      );
    }

    if (typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: {
        id: true,
        authId: true,
        status: true,
        accountModerationStatus: true,
        audioStatus: true,
        audioKey: true,
        audioContentHash: true,
        audioUrl: true,
        moderationCases: {
          where: {
            targetType: "audio",
            OR: [
              {
                status: {
                  in: [
                    "correctionRequired",
                    "postReviewPending",
                    "preReviewPending",
                  ],
                },
              },
              { retentionExpiresAt: { gt: new Date() } },
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            status: true,
            snapshots: {
              where: { kind: "reported" },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { contentHash: true },
            },
          },
        },
      },
    });

    if (!profile) {
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }

    if (profile.authId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "このプロフィールに音声をアップロードする権限がありません。" },
        { status: 403 },
      );
    }

    if (profile.accountModerationStatus === "deletionPending") {
      return NextResponse.json(
        { error: "削除手続き中のため、音声をアップロードできません。" },
        { status: 403 },
      );
    }

    if (
      !["active", "hidden", "removed"].includes(
        profile.audioStatus ?? "active",
      )
    ) {
      return NextResponse.json(
        { error: "音声の状態が不正なため、音声をアップロードできません。" },
        { status: 403 },
      );
    }

    const releaseConversionSlot = tryAcquireAudioConversionSlot();
    if (!releaseConversionSlot) {
      return NextResponse.json(
        {
          error:
            "ほかの音声を変換中です。しばらく待ってから再度お試しください。",
        },
        { status: 429, headers: { "Retry-After": "30" } },
      );
    }

    let tempDir: string | null = null;
    try {
      await fs.mkdir(AUDIO_TEMP_ROOT, { recursive: true });
      tempDir = await fs.mkdtemp(path.join(AUDIO_TEMP_ROOT, "upload-"));

      // クライアント提供のファイル名をパスに使用せず、固定名で保存する
      const inputPath = path.join(tempDir, "input.bin");
      const outputPath = path.join(tempDir, "output.m4a");

      // アップロードされたファイルを一時ファイルとして保存
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(inputPath, buffer);

      const metadata = await inspectAudioFile(inputPath);
      const policyResult = validateAudioMetadata(metadata);

      if (!policyResult.valid) {
        return NextResponse.json(
          { error: policyResult.message, code: policyResult.code },
          { status: 422 },
        );
      }

      // FFmpegでAAC形式（.m4a）に変換（128kbps・全ブラウザ対応）
      const convertedPath = await convertToAac({
        inputPath,
        outputPath,
        bitrate: "128k",
        audioStreamIndex: policyResult.audioStreamIndex,
        outputSampleRate: policyResult.outputSampleRate,
        outputChannels: policyResult.outputChannels,
      });

      const convertedFile = await fs.stat(convertedPath);
      if (
        convertedFile.size <= 0 ||
        convertedFile.size > MAX_CONVERTED_AUDIO_FILE_SIZE_BYTES
      ) {
        throw new Error("Converted audio file size is invalid.");
      }

      const convertedMetadata = await inspectAudioFile(convertedPath);
      const convertedPolicyResult = validateConvertedAudioMetadata(
        convertedMetadata,
      );
      if (!convertedPolicyResult.valid) {
        throw new Error(
          `Converted audio validation failed: ${convertedPolicyResult.code}`,
        );
      }

      const convertedAudio = await fs.readFile(convertedPath);
      const contentHash = await createModerationContentHash(convertedAudio);
      const matchingReportedAudio = profile.moderationCases.some(
        (moderationCase) =>
          moderationCase.snapshots.some(
            (snapshot) =>
              snapshot.contentHash &&
              compareModeratedContentHashes(
                snapshot.contentHash,
                contentHash,
              ) === "same",
          ),
      );
      if (
        matchingReportedAudio
      ) {
        return NextResponse.json(
          {
            error:
              "非公開前と同じ音声です。別の音声へ変更してください。",
          },
          { status: 409 },
        );
      }

      // R2ストレージにアップロード
      const audioKey = generateAudioKey(userId);
      await uploadToR2(convertedPath, audioKey, "audio/mp4");

      try {
        const deadline = getModerationDeadline();
        await prisma.$transaction(async (tx) => {
          const existingCase = profile.moderationCases.find(
            (moderationCase) =>
              moderationCase.status === "correctionRequired" ||
              moderationCase.status === "postReviewPending" ||
              moderationCase.status === "preReviewPending",
          );
          const reviewMode = "preReview" as const;
          const pendingStatus = "preReviewPending" as const;
          const isModeratedReplacement =
            Boolean(existingCase) || profile.audioStatus !== "active";

          await tx.profile.update({
            where: {
              userId,
              authId: authenticatedUserId,
              audioStatus: profile.audioStatus,
            },
            data: {
              audioKey,
              audioContentHash: contentHash,
              audioUrl: "",
              audioStatus: isModeratedReplacement ? "hidden" : "active",
            },
          });

          if (!isModeratedReplacement) return;

          const moderationCase = existingCase
            ? await tx.moderationCase.update({
                where: { id: existingCase.id },
                data: {
                  reviewMode,
                  status: pendingStatus,
                  reviewDueAt: deadline,
                  retentionExpiresAt: deadline,
                  resolvedAt: null,
                },
                select: { id: true },
              })
            : await tx.moderationCase.create({
                data: {
                  profileId: profile.id,
                  targetType: "audio",
                  targetId: profile.id,
                  reasonCode: "other",
                  reviewMode,
                  status: pendingStatus,
                  userMessage: "非公開後に新しい音声が登録されました。",
                  reviewDueAt: deadline,
                  retentionExpiresAt: deadline,
                },
                select: { id: true },
              });

          await tx.moderationSnapshot.create({
            data: {
              moderationCaseId: moderationCase.id,
              kind: "corrected",
              content: {
                audioKey,
                replacedDeletedAudio: true,
              },
              contentHash,
              expiresAt: deadline,
            },
          });

          await tx.moderationCaseEvent.create({
            data: {
              moderationCaseId: moderationCase.id,
              eventType: "contentChanged",
              actorType: "user",
              actorId: authenticatedUserId,
              previousStatus: existingCase?.status ?? "correctionRequired",
              newStatus: pendingStatus,
              details: { targetType: "audio" },
            },
          });
        });
      } catch (databaseError) {
        try {
          await deleteFromR2(audioKey);
        } catch (cleanupError) {
          console.error(
            "Failed to delete unlinked audio file:",
            cleanupError,
          );
        }
        throw databaseError;
      }

      const oldAudioKey =
        profile.audioKey ||
        (profile.audioUrl ? extractKeyFromUrl(profile.audioUrl) : "");
      if (oldAudioKey && oldAudioKey !== audioKey) {
        try {
          const referenceState = await getAudioObjectReferenceState(
            prisma,
            oldAudioKey,
          );
          if (canDeleteAudioObject(referenceState)) {
            await deleteFromR2(oldAudioKey);
          }
        } catch (cleanupError) {
          console.error(
            "Failed to safely delete replaced audio file:",
            cleanupError,
          );
        }
      }

      console.log("Audio uploaded successfully:", { audioKey });

      return NextResponse.json(
        {
          success: true,
          audioKey,
        },
        { headers: PRIVATE_NO_STORE_HEADERS },
      );
    } finally {
      if (tempDir) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error("Failed to cleanup audio upload directory:", cleanupError);
        }
      }
      releaseConversionSlot();
    }
  } catch (error) {
    console.error("Audio upload failed:", error);
    return NextResponse.json(
      { error: "音声アップロードの処理中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}
