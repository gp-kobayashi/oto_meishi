import type { Prisma, SocialService } from "@/lib/generated/prisma/client";
import {
  compareModeratedUrls,
  createModeratedUrlHash,
} from "@/lib/moderationRemediation";
import { recordModeratedLinkCorrection } from "@/lib/profile/profileModeration";

export type ComparableSocialLink = {
  id?: string;
  service: SocialService;
  url: string;
  label: string;
  sortOrder: number;
};
export type ExistingSocialLink = ComparableSocialLink & {
  id: string;
  status: "active" | "hidden";
};
type ProfileTransaction = Prisma.TransactionClient;
type LinkModerationCase = {
  snapshots: { content: unknown; contentHash: string | null }[];
};

export function areSocialLinksUnchanged(
  existingLinks: ComparableSocialLink[],
  requestedLinks: ComparableSocialLink[],
) {
  if (existingLinks.length !== requestedLinks.length) {
    return false;
  }
  const sortedExisting = [...existingLinks].sort(
    (x, y) =>
      x.sortOrder - y.sortOrder || (x.id ?? "").localeCompare(y.id ?? ""),
  );
  const sortedRequested = [...requestedLinks].sort(
    (x, y) => x.sortOrder - y.sortOrder,
  );
  return sortedExisting.every((existingLink, index) => {
    const requestedLink = sortedRequested[index];
    return (
      !!requestedLink &&
      existingLink.service === requestedLink.service &&
      existingLink.url === requestedLink.url &&
      existingLink.label === requestedLink.label &&
      existingLink.sortOrder === requestedLink.sortOrder
    );
  });
}
function findRequestedExistingLink(
  existingLinks: ExistingSocialLink[],
  requestedLink: ComparableSocialLink,
) {
  return requestedLink.id
    ? existingLinks.find((link) => link.id === requestedLink.id)
    : existingLinks.find(
        (link) =>
          link.status === "active" &&
          link.sortOrder === requestedLink.sortOrder,
      );
}
function isSocialLinkContentUnchanged(
  existingLink: ComparableSocialLink,
  requestedLink: ComparableSocialLink,
) {
  return (
    existingLink.service === requestedLink.service &&
    existingLink.url === requestedLink.url &&
    existingLink.label === requestedLink.label
  );
}
async function hasMatchingModeratedLinkUrl(
  moderationCases: LinkModerationCase[],
  requestedUrl: string,
) {
  const requestedHash = await createModeratedUrlHash(requestedUrl);
  if (!requestedHash) {
    return false;
  }
  return moderationCases.some((moderationCase) =>
    moderationCase.snapshots.some(
      (snapshot) =>
        snapshot.contentHash === requestedHash ||
        (typeof snapshot.content === "object" &&
          snapshot.content !== null &&
          !Array.isArray(snapshot.content) &&
          typeof (snapshot.content as Record<string, unknown>).url ===
            "string" &&
          compareModeratedUrls(
            (snapshot.content as Record<string, string>).url,
            requestedUrl,
          ) === "same"),
    ),
  );
}

export async function syncSocialLinks({
  transaction,
  profileId,
  existingLinks,
  requestedLinks,
  actorId,
}: {
  transaction: ProfileTransaction;
  profileId: string;
  existingLinks: ExistingSocialLink[];
  requestedLinks: ComparableSocialLink[];
  actorId: string;
}) {
  const retainedLinkIds = new Set<string>();
  for (const requestedLink of requestedLinks) {
    const existingLink = findRequestedExistingLink(
      existingLinks,
      requestedLink,
    );
    if (!existingLink) {
      await transaction.socialLink.create({
        data: {
          profileId,
          service: requestedLink.service,
          url: requestedLink.url,
          label: requestedLink.label,
          sortOrder: requestedLink.sortOrder,
        },
      });
      continue;
    }
    retainedLinkIds.add(existingLink.id);
    if (
      isSocialLinkContentUnchanged(existingLink, requestedLink) &&
      existingLink.sortOrder === requestedLink.sortOrder
    ) {
      continue;
    }
    let nextStatus = existingLink.status;
    if (!isSocialLinkContentUnchanged(existingLink, requestedLink)) {
      const correction = await recordModeratedLinkCorrection({
        transaction,
        profileId,
        link: existingLink,
        requestedLink,
        actorId,
        deleted: false,
      });
      if (correction) {
        nextStatus = "hidden";
      }
    }
    await transaction.socialLink.update({
      where: { id: existingLink.id },
      data: {
        service: requestedLink.service,
        url: requestedLink.url,
        label: requestedLink.label,
        sortOrder: requestedLink.sortOrder,
        status: nextStatus,
      },
    });
  }
  for (const existingLink of existingLinks) {
    if (retainedLinkIds.has(existingLink.id)) {
      continue;
    }
    await recordModeratedLinkCorrection({
      transaction,
      profileId,
      link: existingLink,
      actorId,
      deleted: true,
    });
    await transaction.socialLink.delete({ where: { id: existingLink.id } });
  }
}
export async function validateSocialLinks(
  existingLinks: ExistingSocialLink[],
  requestedLinks: ComparableSocialLink[],
  moderationCases: LinkModerationCase[],
) {
  for (const requestedLink of requestedLinks) {
    if (
      requestedLink.id &&
      !existingLinks.some((link) => link.id === requestedLink.id)
    ) {
      return {
        ok: false as const,
        status: 403,
        error: "プロフィールに属さないリンクは変更できません。",
      };
    }
    const existingLink = findRequestedExistingLink(
      existingLinks,
      requestedLink,
    );
    if (
      !existingLink &&
      (await hasMatchingModeratedLinkUrl(moderationCases, requestedLink.url))
    ) {
      return {
        ok: false as const,
        status: 409,
        error:
          "過去に非公開となったリンクと同じURLです。別のURLを登録してください。",
      };
    }
    if (
      existingLink?.status === "hidden" &&
      !isSocialLinkContentUnchanged(existingLink, requestedLink) &&
      compareModeratedUrls(existingLink.url, requestedLink.url) !== "changed"
    ) {
      return {
        ok: false as const,
        status: 409,
        error: "非公開前と同じリンクです。別のURLへ変更してください。",
      };
    }
  }
  return { ok: true as const };
}
