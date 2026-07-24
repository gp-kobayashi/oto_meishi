import { QRCodeCanvas } from "qrcode.react";
import { buildSiteUrl } from "@/lib/siteUrl";
import styles from "./QRCode.module.css";

const QRCode = ({ username }: { username: string }) => {
  return (
    <div className={styles.qrCode}>
      <QRCodeCanvas value={buildSiteUrl(username)} />
    </div>
  );
};

export default QRCode;
