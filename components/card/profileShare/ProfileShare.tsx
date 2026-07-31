import QRCode from "../QRCode/QRCode";
import { buildSiteUrl } from "@/lib/siteUrl";
import styles from "./ProfileShare.module.css";

export default function ProfileShare({ username }: { username: string }) {
  const profileUrl = buildSiteUrl(username);

  return (
    <section className={styles.container} aria-labelledby="profile-share-title">
      <p id="profile-share-title" className={styles.title}>
        QRコード・URLで名刺を共有
      </p>
      <QRCode username={username} />
      <a
        className={styles.profileUrl}
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {profileUrl}
      </a>
    </section>
  );
}
