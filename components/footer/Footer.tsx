import styles from "./Footer.module.css";

const Footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <p className={styles.copy}>&copy; {new Date().getFullYear()} oto_meishi. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
