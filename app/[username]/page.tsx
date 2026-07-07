import Image from "next/image";
import Card from "../../components/card/Card";
import demoProfile from "../../lib/mock/profile";
import styles from "./page.module.css";
import type { ProfileData } from "../../lib/mock/profileData";

const UsernamePage = async ({
  params,
}: {
  params: Promise<{ username: string }>;
}) => {
  const { username } = await params;
  const link = demoProfile as ProfileData;

  return (
    <main className={styles.main}>
      <a href="/" className={styles.logo}>
        <Image src="/TitleLogo.svg" alt="Logo" width={160} height={160} />
      </a>
      <Card link={link} />
    </main>
  );
};
export default UsernamePage;
