import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { buildSiteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const profiles = await prisma.profile.findMany({
    where: {
      status: "active",
      accountModerationStatus: "active",
    },
    select: {
      userId: true,
      updatedAt: true,
    },
    orderBy: { userId: "asc" },
  });

  return [
    {
      url: buildSiteUrl(""),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...profiles.map((profile) => ({
      url: buildSiteUrl(encodeURIComponent(profile.userId)),
      lastModified: profile.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
