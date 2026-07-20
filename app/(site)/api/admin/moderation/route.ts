import { authorizeAdminRequest } from "@/lib/adminAuth";
import {
  isModerationFilter,
  type ModerationFilter,
} from "@/lib/adminModeration";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";

const PAGE_SIZE = 20;

function parsePositiveInteger(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function getFilterWhere(filter: ModerationFilter): Prisma.ProfileWhereInput {
  switch (filter) {
    case "attention":
      return {
        OR: [
          { status: { not: "active" } },
          { audioStatus: { not: "active" } },
          { sns: { some: { status: "hidden" } } },
        ],
      };
    case "active":
      return {
        status: "active",
        audioStatus: "active",
        sns: { none: { status: "hidden" } },
      };
    case "hidden":
      return { status: "hidden" };
    case "suspended":
      return { status: "suspended" };
    default:
      return {};
  }
}

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    const url = new URL(request.url);
    const requestedFilter = url.searchParams.get("filter") ?? "all";
    if (!isModerationFilter(requestedFilter)) {
      return Response.json({ error: "絞り込み条件が不正です。" }, { status: 400 });
    }

    const page = parsePositiveInteger(url.searchParams.get("page"));
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const where: Prisma.ProfileWhereInput = {
      AND: [
        getFilterWhere(requestedFilter),
        query
          ? {
              OR: [
                { userId: { contains: query, mode: "insensitive" } },
                { displayName: { contains: query, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const [profiles, total] = await prisma.$transaction([
      prisma.profile.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          userId: true,
          displayName: true,
          status: true,
          audioKey: true,
          audioUrl: true,
          audioTitle: true,
          audioStatus: true,
          updatedAt: true,
          sns: { select: { status: true } },
        },
      }),
      prisma.profile.count({ where }),
    ]);

    return Response.json(
      {
        items: profiles.map((profile) => ({
          id: profile.id,
          userId: profile.userId,
          displayName: profile.displayName,
          status: profile.status,
          hasAudio: Boolean(profile.audioKey || profile.audioUrl),
          audioTitle: profile.audioTitle,
          audioStatus: profile.audioStatus,
          linkCount: profile.sns.length,
          hiddenLinkCount: profile.sns.filter(
            (link) => link.status === "hidden",
          ).length,
          updatedAt: profile.updatedAt.toISOString(),
        })),
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          total,
          totalPages: Math.ceil(total / PAGE_SIZE),
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to load moderation list", error);
    return Response.json(
      { error: "管理対象の一覧を取得できませんでした。" },
      { status: 500 },
    );
  }
}
