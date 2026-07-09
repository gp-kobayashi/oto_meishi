"use client";
import styles from "./Card.module.css";
import Background from "./background/Background";
import AudioPlayer from "./audioPlayer/AudioPlayer";
import SocialLink from "../card/socialLink/SocialLink";
import QRCode from "./QRCode/QRCode";
import type { ProfileData } from "../../lib/mock/profileData";

const Card = ({ link }: { link: ProfileData }) => {
  const {
    userId,
    displayName,
    bio,
    audioUrl,
    audioTitle,
    sns,
    theme = "normal",
  } = link;
  const themeClass = styles[theme] || styles.normal;

  return (
    <div className={`${styles.card} ${themeClass}`}>
      <Background theme={theme} />
      <h2 id="profile-title" className={styles.title}>
        {displayName}
      </h2>
      <p className={styles.bio}>{bio}</p>
      <AudioPlayer audioUrl={audioUrl} audioTitle={audioTitle} />
      <ul className={styles.snsList}>
        {sns.map((link) => (
          <li key={link.service} className={styles.snsItem}>
            <SocialLink link={link} />
          </li>
        ))}
      </ul>
      <div className={styles.qrCodeContainer}>
        <p>QRコードで名刺を共有</p>
        <QRCode username={userId} />
      </div>
    </div>
  );
};

export default Card;
