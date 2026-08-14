"use client";
import styles from "./Card.module.css";
import Background from "./background/Background";
import AudioPlayer from "./audioPlayer/AudioPlayer";
import SocialLink from "../card/socialLink/SocialLink";
import ProfileShare from "./profileShare/ProfileShare";
import type { ProfileData } from "@/lib/mock/profileData";
import ReportMenu from "./reportMenu/ReportMenu";

const Card = ({
  link,
  showReportMenu = false,
  previewAudioUrl = "",
  displayMode = "responsive",
}: {
  link: ProfileData;
  showReportMenu?: boolean;
  previewAudioUrl?: string;
  displayMode?: "responsive" | "mobile";
}) => {
  const {
    userId,
    displayName,
    bio,
    audioUrl,
    audioKey,
    hasAudio,
    audioTitle,
    sns,
    theme = "normal",
  } = link;
  const themeClass = styles[theme] || styles.normal;

  return (
    <div
      className={`${styles.card} ${themeClass} ${
        displayMode === "mobile" ? styles.mobileMode : ""
      }`}
      data-display-mode={displayMode}
    >
      <Background theme={theme} />
      {showReportMenu ? <ReportMenu profileId={link.id} /> : null}
      <h2 id="profile-title" className={styles.title}>
        {displayName}
      </h2>
      <p className={styles.bio}>{bio}</p>
      {(hasAudio || audioKey || audioUrl) && (
        <AudioPlayer
          userId={userId}
          audioTitle={audioTitle}
          previewAudioUrl={previewAudioUrl}
        />
      )}
      <ul className={styles.snsList}>
        {sns.map((link) => (
          <li key={link.service} className={styles.snsItem}>
            <SocialLink link={link} />
          </li>
        ))}
      </ul>
      <ProfileShare username={userId} />
    </div>
  );
};

export default Card;
