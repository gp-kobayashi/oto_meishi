import type { SocialLink as SocialLinkType } from "../../../lib/mock/profileData";
import styles from "./SocialLink.module.css";
import { socialIcons } from "../../../lib/socialIcons";


const SocialLink = ({ link }: { link: SocialLinkType }) => {
  const { service, url, label } = link;
  const Icon = socialIcons[service];

  return (
    <a
      href={url}
      className={styles.snsLink}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className={styles.textContainer}>
        <Icon className={styles.icon} />
        <p className={styles.labelText}>{label}</p>
      </div>
    </a>
  );
};

export default SocialLink;
