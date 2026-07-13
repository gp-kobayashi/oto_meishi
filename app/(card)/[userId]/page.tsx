import Image from "next/image";
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

  if (!profile) {
    notFound();
  }

  return (
    <main className={styles.main}>
      <a href="/" className={styles.logo}>
        <Image src="/logo-title.svg" alt="Logo" width={140} height={24} />
      </a>
      <Card link={profile as ProfileData} />
    </main>
  );
};
export default UserIdPage;
