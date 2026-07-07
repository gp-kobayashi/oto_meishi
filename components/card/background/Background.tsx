import styles from "./Background.module.css";
import type { ProfileData } from "../../../lib/mock/profileData";

const Background = ({ theme = "normal" }: { theme?: ProfileData["theme"] }) => {
  const themeClass = styles[theme] || styles.normal;

  if (theme === "normal") {
    return (
      <div className={`${styles.backgroundContainer} ${themeClass}`}>
        <div className={`${styles.blob} ${styles.back}`} />
        <div className={`${styles.blob} ${styles.middle}`} />
        <div className={`${styles.blob} ${styles.front}`} />
      </div>
    );
  }

  if (theme === "dark") {
    return (
      <div className={`${styles.backgroundContainer} ${themeClass}`}>
        <div className={`${styles.darkBlob} ${styles.darkBack}`} />
        <div className={`${styles.darkBlob} ${styles.darkMiddle}`} />
        <div className={`${styles.darkBlob} ${styles.darkFront}`} />
      </div>
    );
  }

  if (theme === "light") {
    return (
      <div className={`${styles.backgroundContainer} ${themeClass}`}>
        <div className={`${styles.lightBlob} ${styles.lightBack}`} />
        <div className={`${styles.lightBlob} ${styles.lightMiddle}`} />
        <div className={`${styles.lightBlob} ${styles.lightFront}`} />
      </div>
    );
  }

  if (theme === "colorful") {
    return (
      <div className={`${styles.backgroundContainer} ${themeClass}`}>
        <div className={`${styles.colorfulBlob} ${styles.color1}`} />
        <div className={`${styles.colorfulBlob} ${styles.color2}`} />
        <div className={`${styles.colorfulBlob} ${styles.color3}`} />
        <div className={`${styles.colorfulBlob} ${styles.color4}`} />
        <div className={styles.gridOverlay} />
      </div>
    );
  }

  return null;
};

export default Background;

