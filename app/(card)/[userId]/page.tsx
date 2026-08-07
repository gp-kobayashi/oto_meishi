import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Card from "@/components/card/Card";
import styles from "./page.module.css";
import { prisma } from "@/lib/prisma";
import type { ProfileData } from "@/lib/mock/profileData";

const UserIdPage = async ({
  params,
}: {
  params: Promise<{ userId: string }>;
}) => {
  const { userId } = await params;
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: { sns: true },
  });

  if (
    !profile ||
    profile.status !== "active" ||
    profile.accountModerationStatus !== "active"
  ) {
    notFound();
  }

  const hasAudio =
    profile.audioStatus === "active" &&
    Boolean(profile.audioKey || profile.audioUrl);
  const publicProfile: ProfileData = {
    id: profile.id,
    userId: profile.userId,
    theme: profile.theme,
    displayName: profile.displayName,
    bio: profile.bio,
    audioUrl: "",
    hasAudio,
    audioTitle: hasAudio ? profile.audioTitle : "",
    sns: profile.sns
      .filter((link) => link.status === "active")
      .map(({ service, url, label }) => ({ service, url, label })),
  };

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.logo}>
        <Image src="/logo-title.svg" alt="Logo" width={140} height={24} />
      </Link>
      <Card link={publicProfile} showReportMenu />
    </main>
  );
};
export default UserIdPage;
