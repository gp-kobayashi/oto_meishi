import styles from "./page.module.css";
import Image from "next/image";

export default function Home() {
  return (
    <section className={styles.main}>
      <section className={styles.hero} aria-label="oto_meishi introduction">
        <div className={styles.backgroundAura}>
          <div className={`${styles.blob} ${styles.back}`} />
          <div className={`${styles.blob} ${styles.middle}`} />
          <div className={`${styles.blob} ${styles.front}`} />
        </div>

        <p className={styles.lead}>音と名刺でoto_meishiです。</p>

        <div className={styles.introGrid}>
          <div className={styles.descriptionBox}>
            <p>
              お名前とSNSやサイトのリンク
              <br />
              それだけで伝わらない部分を
              <br />
              音声を使って伝えられます。
            </p>
            <p>
              例えば
              <br />
              3分で自己紹介をしてみたり
              <br />
              自作曲のクロスフェードをつけたり
            </p>
            <p>
              音を付けることで
              <br />
              あなたについてわかりやすく
              <br />
              名刺のようにふるまうページを
              <br />
              簡単に作成できます。
            </p>
          </div>

          <div
            className={styles.meishiPreview}
            aria-label="profile card preview"
          >
            <Image
              src="/meishi_demo.png"
              alt="profile card preview"
              width={216}
              height={326}
            />
          </div>
        </div>

        <div className={styles.referenceBox}>
          <span>参考用にこのサイトの製作者の名刺をどうぞ</span>
          <a href="https://www.oto_meishi/seisakusya">
            https://www.oto_meishi/seisakusya
          </a>
        </div>

        <p className={styles.startText}>まずは登録から</p>
        <p className={styles.note}>
          （googleかFacebookのアカウント。もしくは、メールアドレスで）
        </p>

        <div className={styles.arrow} aria-hidden="true" />

        <a className={styles.registerButton} href="/signup">
          アカウント登録ページへ
        </a>
      </section>
    </section>
  );
}
