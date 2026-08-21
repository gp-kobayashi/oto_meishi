import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Card from "@/components/card/Card";
import styles from "./page.module.css";
import { getPublicProfile } from "@/lib/publicProfile";

const UserIdPage = async ({
  params,
}: {
  params: Promise<{ userId: string }>;
}) => {
  const { userId } = await params;
  const publicProfile = await getPublicProfile(userId);

  if (!publicProfile) notFound();

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
