import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Card from "@/components/card/Card";
import styles from "./page.module.css";
import { getPublicProfile } from "@/lib/publicProfile";
import { createPublicProfileMetadata } from "@/lib/publicProfileMetadata";
import { createPublicReportToken } from "@/lib/publicReportToken";

type UserIdPageProps = {
  params: Promise<{ userId: string }>;
};

export async function generateMetadata({
  params,
}: UserIdPageProps): Promise<Metadata> {
  const { userId } = await params;
  const publicProfile = await getPublicProfile(userId);

  if (!publicProfile) notFound();

  return createPublicProfileMetadata(publicProfile, userId);
}

const UserIdPage = async ({ params }: UserIdPageProps) => {
  const { userId } = await params;
  const publicProfile = await getPublicProfile(userId);

  if (!publicProfile) notFound();

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.logo}>
        <Image src="/logo-title.svg" alt="Logo" width={140} height={24} />
      </Link>
      <Card
        link={publicProfile}
        showReportMenu
        reportToken={createPublicReportToken(publicProfile.id)}
      />
    </main>
  );
};
export default UserIdPage;
