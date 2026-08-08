import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, extractKeyFromUrl } from "@/lib/r2Storage";
import { createServerSupabaseClient } from "@/lib/supabaseClient";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { getModerationDeadline } from "@/lib/moderationRemediation";

export async function DELETE(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid token" },
      { status: 401 },
    );
  }

  const token = authHeader.slice("Bearer ".length);
  const supabaseServer = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseServer.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid token" },
      { status: 401 },
    );
  }

  const profile = await prisma.profile.findUnique({
    where: { authId: user.id },
    select: {
      id: true,
      audioUrl: true,
      audioKey: true,
      audioContentHash: true,
      audioTitle: true,
      audioStatus: true,
      accountModerationStatus: true,
    },
  });

  if (!profile) {
    return NextResponse.json({ error: "profile not found" }, { status: 404 });
  }

  if (profile.accountModerationStatus === "deletionPending") {
    return NextResponse.json(
      { error: "削除手続き中のため、音声を削除できません。" },
      { status: 403 },
    );
  }

  if (!profile.audioKey && !profile.audioUrl) {
    if (profile.audioStatus === "hidden") {
      const deadline = getModerationDeadline();
      let recoveryResult: { count: number };
      try {
        recoveryResult = await prisma.$transaction(async (tx) => {
          const updateResult = await tx.profile.updateMany({
            where: {
              authId: user.id,
              audioUrl: "",
              audioKey: "",
              audioStatus: "hidden",
            },
            data: { audioStatus: "removed" },
          });

          if (updateResult.count !== 1) return updateResult;

          await recordModeratedAudioDeletion({
            tx,
            profile,
            actorId: user.id,
            deadline,
            audioKey: null,
          });

          return updateResult;
        });
      } catch (error) {
        console.error("Failed to repair deleted audio state:", error);
        return NextResponse.json(
          { error: "音源情報の更新に失敗しました。" },
          { status: 500 },
        );
      }

      if (recoveryResult.count !== 1) {
        return NextResponse.json(
          { error: "音源の状態が更新されているため削除を中止しました。" },
          { status: 409 },
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        audioUrl: "",
        audioTitle: "",
        audioStatus:
          profile.audioStatus === "hidden" ? "removed" : profile.audioStatus,
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const audioKey = profile.audioKey || extractKeyFromUrl(profile.audioUrl);
  if (!audioKey) {
    return NextResponse.json(
      { error: "音源情報が不正なため削除できませんでした。" },
      { status: 500 },
    );
  }

  let updateResult: { count: number };
  try {
    const deadline = getModerationDeadline();
    updateResult = await prisma.$transaction(async (tx) => {
      const result = await tx.profile.updateMany({
        where: {
          authId: user.id,
          audioUrl: profile.audioUrl,
          audioKey: profile.audioKey,
          audioStatus: profile.audioStatus,
        },
        data: {
          audioUrl: "",
          audioKey: "",
          audioTitle: "",
          audioStatus:
            profile.audioStatus === "hidden" ? "removed" : profile.audioStatus,
        },
      });

      if (result.count !== 1 || profile.audioStatus !== "hidden") {
        return result;
      }

      await recordModeratedAudioDeletion({
        tx,
        profile,
        actorId: user.id,
        deadline,
        audioKey,
      });

      return result;
    });
  } catch (error) {
    console.error("Failed to clear profile audio:", error);
    return NextResponse.json(
      { error: "音源情報の更新に失敗しました。" },
      { status: 500 },
    );
  }

  if (updateResult.count !== 1) {
    return NextResponse.json(
      { error: "音源が更新されているため削除を中止しました。" },
      { status: 409 },
    );
  }

  if (profile.audioStatus !== "hidden") {
    try {
      await deleteFromR2(audioKey);
    } catch (error) {
      console.error("Failed to delete unreferenced audio file from R2:", error);
    }
  }

  return NextResponse.json(
    {
      success: true,
      audioUrl: "",
      audioTitle: "",
      audioStatus:
        profile.audioStatus === "hidden" ? "removed" : profile.audioStatus,
    },
    { headers: PRIVATE_NO_STORE_HEADERS },
  );
}

type AudioDeletionProfile = {
  id: string;
  audioUrl: string;
  audioKey: string;
  audioContentHash: string | null;
  audioTitle: string;
  audioStatus: "active" | "hidden" | "removed";
};

type ModerationTransaction = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

async function recordModeratedAudioDeletion({
  tx,
  profile,
  actorId,
  deadline,
  audioKey,
}: {
  tx: ModerationTransaction;
  profile: AudioDeletionProfile;
  actorId: string;
  deadline: Date;
  audioKey: string | null;
}) {
  const existingCase = await tx.moderationCase.findFirst({
    where: {
      targetType: "audio",
      targetId: profile.id,
      status: {
        in: [
          "correctionRequired",
          "postReviewPending",
          "preReviewPending",
        ],
      },
    },
    select: { id: true, status: true },
  });

  const moderationCase = existingCase
    ? await tx.moderationCase.update({
        where: { id: existingCase.id },
        data: {
          reviewMode: "preReview",
          status: "preReviewPending",
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
          reviewMode: "preReview",
          status: "preReviewPending",
          userMessage: "非公開音声が削除されました。",
          reviewDueAt: deadline,
          retentionExpiresAt: deadline,
        },
        select: { id: true },
      });

  const reportedSnapshot = await tx.moderationSnapshot.findFirst({
    where: { moderationCaseId: moderationCase.id, kind: "reported" },
    select: { id: true },
  });

  if (!reportedSnapshot) {
    await tx.moderationSnapshot.create({
      data: {
        moderationCaseId: moderationCase.id,
        kind: "reported",
        content: {
          audioUrl: profile.audioUrl,
          audioTitle: profile.audioTitle,
          audioStatus: profile.audioStatus,
          legacyMissingAudio: !audioKey,
        },
        storageObjectKey: audioKey,
        contentHash: profile.audioContentHash,
        expiresAt: deadline,
      },
    });
  }

  await tx.moderationSnapshot.create({
    data: {
      moderationCaseId: moderationCase.id,
      kind: "corrected",
      content: { deleted: true },
      expiresAt: deadline,
    },
  });

  await tx.moderationCaseEvent.create({
    data: {
      moderationCaseId: moderationCase.id,
      eventType: "contentDeleted",
      actorType: "user",
      actorId,
      previousStatus: existingCase?.status ?? "correctionRequired",
      newStatus: "preReviewPending",
      details: { targetType: "audio" },
    },
  });
}
