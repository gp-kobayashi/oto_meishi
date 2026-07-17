import { authorizeAdminRequest } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    const { profileId } = await params;
    if (!profileId) {
      return Response.json({ error: "プロフィールIDが不正です。" }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
        displayName: true,
        bio: true,
        theme: true,
        status: true,
        audioUrl: true,
        audioTitle: true,
        audioStatus: true,
        createdAt: true,
        updatedAt: true,
        sns: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            service: true,
            label: true,
            url: true,
            sortOrder: true,
            status: true,
          },
        },
      },
    });

    if (!profile) {
      return Response.json(
        { error: "プロフィールが見つかりません。" },
        { status: 404 },
      );
    }

    const history = await prisma.moderationAction.findMany({
      where: { profileId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        action: true,
        previousStatus: true,
        newStatus: true,
        reason: true,
        createdAt: true,
        adminUser: { select: { authId: true, role: true } },
      },
    });

    return Response.json({
      profile: {
        id: profile.id,
        userId: profile.userId,
        displayName: profile.displayName,
        bio: profile.bio,
        theme: profile.theme,
        status: profile.status,
        audioUrl: profile.audioUrl,
        audioTitle: profile.audioTitle,
        audioStatus: profile.audioStatus,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
        links: profile.sns,
        history: history.map((entry) => ({
          id: entry.id,
          targetType: entry.targetType,
          targetId: entry.targetId,
          action: entry.action,
          previousStatus: entry.previousStatus,
          newStatus: entry.newStatus,
          reason: entry.reason,
          adminIdentifier: entry.adminUser.authId.slice(0, 8),
          adminRole: entry.adminUser.role,
          createdAt: entry.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Failed to load moderation detail", error);
    return Response.json(
      { error: "管理対象の詳細を取得できませんでした。" },
      { status: 500 },
    );
  }
}
