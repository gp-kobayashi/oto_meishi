import Header from "../../components/header/Header";
import Footer from "../../components/footer/Footer";
import Card from "../../components/card/Card";
import styles from "./page.module.css";
import demoProfile from "../../lib/mock/profile";
import type { ProfileData } from "../../lib/mock/profileData";
export default function ProfilePage() {
  const link = demoProfile as ProfileData;
  return (
    <main className={styles.main}>
      <Header />
      <section className={styles.profile} aria-labelledby="profile-title">
        {/* Background effect, same pattern as home page */}
        <div className={styles.backgroundAura}>
          <div className={`${styles.blob} ${styles.back}`} />
          <div className={`${styles.blob} ${styles.middle}`} />
          <div className={`${styles.blob} ${styles.front}`} />
        </div>

        {/* Profile information */}
        <Card link={link} />
      </section>
      <Footer />
    </main>
  );
}
