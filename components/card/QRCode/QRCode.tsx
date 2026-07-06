import { QRCodeCanvas } from "qrcode.react";
import styles from "./QRCode.module.css";
const QRCode = ({ username }: { username: string }) => {
  return (
    <div className={styles.qrCode}>
      <QRCodeCanvas value={"https://oto_meishi.com/" + username} />
    </div>
  );
};

export default QRCode;
