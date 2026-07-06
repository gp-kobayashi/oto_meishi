import {
  FaXTwitter,
  FaInstagram,
  FaYoutube,
  FaTiktok,
  FaGithub,
  FaDiscord,
  FaFacebook,
  FaLinkedin,
} from "react-icons/fa6";

import { SiBluesky, SiThreads, SiNote } from "react-icons/si";

import { FaGlobe, FaLink } from "react-icons/fa";

export const socialIcons = {
  x: FaXTwitter,
  instagram: FaInstagram,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  github: FaGithub,
  discord: FaDiscord,
  facebook: FaFacebook,
  linkedin: FaLinkedin,
  bluesky: SiBluesky,
  threads: SiThreads,
  note: SiNote,
  website: FaGlobe,
  other: FaLink,
} as const;
