import type { Metadata } from "next";
import Link from "next/link";
import { buildSiteUrl } from "@/lib/siteUrl";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "ヘルプ | oto_meishi",
  description: "oto_meishiの登録方法とmeishiの編集方法をご案内します。",
};

const editSections = [
  { id: "theme", label: "テーマ" },
  { id: "profile", label: "表示名・自己紹介" },
  { id: "audio-title", label: "音声タイトル" },
  { id: "audio", label: "音声ファイル" },
  { id: "links", label: "サービスリンク" },
  { id: "save", label: "変更を保存" },
  { id: "qr-code", label: "QRコード" },
] as const;

export default function HelpPage() {
  const exampleProfileUrl = buildSiteUrl("/user_id1234");

  return (
    <div className={styles.main}>
      <div className={styles.backgroundAura} aria-hidden="true">
        <div className={`${styles.blob} ${styles.back}`} />
        <div className={`${styles.blob} ${styles.middle}`} />
        <div className={`${styles.blob} ${styles.front}`} />
      </div>

      <article className={styles.help}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>OTO_MEISHI GUIDE</p>
          <h1>ヘルプ</h1>
          <p className={styles.introduction}>
            oto_meishiは、SNSなどのリンクと音声を使ってあなたを紹介する、
            オンラインの名刺を作れるサービスです。完成したカードを、このサイトでは
            <strong>「meishi」</strong>と呼びます。
          </p>
          <Link className={styles.startButton} href="/signup">
            アカウント登録を始める
          </Link>
        </header>

        <nav className={styles.tableOfContents} aria-label="ヘルプ目次">
          <p>このページの内容</p>
          <div className={styles.tocLinks}>
            <a href="#getting-started">登録から編集まで</a>
            <a href="#edit-guide">編集画面の説明</a>
            <a href="#qr-code">QRコードの使い方</a>
            <a href="#moderation-support">非公開・利用停止への対応</a>
          </div>
        </nav>

        <section
          id="getting-started"
          className={styles.section}
          aria-labelledby="getting-started-title"
        >
          <div className={styles.sectionHeading}>
            <span>01</span>
            <div>
              <p>GETTING STARTED</p>
              <h2 id="getting-started-title">登録から編集まで</h2>
            </div>
          </div>

          <ol className={styles.steps}>
            <li>
              <div className={styles.stepNumber}>1</div>
              <div>
                <h3>アカウントを登録する</h3>
                <p>
                  Google、Facebook、またはメールアドレスで登録できます。Googleと
                  Facebookは、ボタンを押した後の確認画面で使用するアカウントを選択してください。
                </p>
                <p>
                  メールアドレスを使う場合は、メールアドレスとパスワードを入力して登録します。
                  届いた確認メールを開き、案内に沿って登録を完了してください。
                </p>
              </div>
            </li>
            <li>
              <div className={styles.stepNumber}>2</div>
              <div>
                <h3>ユーザーIDを決める</h3>
                <p>
                  登録後に表示される画面で、meishiのURLに使うユーザーIDを英数字で入力します。
                  ほかのユーザーが使用しているIDは登録できません。
                </p>
                <div className={styles.example}>
                  <span>URLの例</span>
                  <code>{exampleProfileUrl}</code>
                </div>
                <p className={styles.warning}>
                  ユーザーIDは登録後に変更できません。内容をよく確認してから登録してください。
                </p>
                <p>
                  途中でページを閉じても、ログイン中であればマイページからユーザーID登録画面へ戻れます。
                </p>
              </div>
            </li>
            <li>
              <div className={styles.stepNumber}>3</div>
              <div>
                <h3>meishiを編集する</h3>
                <p>
                  ヘッダーの「マイページ」を押すと、現在のmeishiを確認できます。
                  「カードを編集する」ボタンから編集画面へ進んでください。
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section
          id="edit-guide"
          className={styles.section}
          aria-labelledby="edit-guide-title"
        >
          <div className={styles.sectionHeading}>
            <span>02</span>
            <div>
              <p>EDIT YOUR MEISHI</p>
              <h2 id="edit-guide-title">編集画面の説明</h2>
            </div>
          </div>

          <nav className={styles.editNav} aria-label="編集項目の目次">
            {editSections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
          </nav>

          <div className={styles.guideGrid}>
            <section id="theme" className={styles.guideCard}>
              <p className={styles.cardLabel}>DESIGN</p>
              <h3>テーマ</h3>
              <p>
                「標準」「ダーク」「ライト」「カラフル」からデザインを選べます。
                ボタンを押すと、背景や文字色などが切り替わります。
              </p>
              <div className={styles.themeSamples} aria-label="選択できるテーマ">
                <span>標準</span><span>ダーク</span><span>ライト</span><span>カラフル</span>
              </div>
            </section>

            <section id="profile" className={styles.guideCard}>
              <p className={styles.cardLabel}>PROFILE</p>
              <h3>表示名・自己紹介</h3>
              <p>
                表示名はユーザーIDとは別に、meishi上へ表示する名前です。
                英数字だけでなく、ひらがなや漢字も使用できます。
              </p>
              <p>
                自己紹介には、活動内容やお知らせを簡潔に書けます。内容はいつでも更新できます。
              </p>
              <blockquote>
                音楽を作っています！○○日にライブがあります。ぜひ遊びに来てください！
              </blockquote>
            </section>

            <section id="audio-title" className={styles.guideCard}>
              <p className={styles.cardLabel}>AUDIO TITLE</p>
              <h3>音声タイトル</h3>
              <p>
                オーディオプレイヤーの下に表示されるタイトルです。
                アップロードするファイル名とは別の名前を付けられます。
              </p>
            </section>

            <section id="audio" className={`${styles.guideCard} ${styles.wideCard}`}>
              <p className={styles.cardLabel}>AUDIO FILE</p>
              <h3>音声ファイル</h3>
              <p>
                「ここに音声ファイルをドロップ、またはクリックして選択」の欄へ、
                自己紹介や短い音源など、アップロードしたいファイルを渡してください。
              </p>
              <div className={styles.audioFacts}>
                <div><strong>3分以内</strong><span>アップロードできる音声の長さ</span></div>
                <div><strong>AAC形式</strong><span>アップロード時に自動変換</span></div>
                <div><strong>音量を均一化</strong><span>聞きやすい音量へ自動調整</span></div>
              </div>
              <p className={styles.note}>
                高音質な音源も保存時にAAC形式へ変換されるため、元の形式や音質のままでは再生されません。
              </p>
              <p>
                ファイルを選ぶとオーディオプレイヤーが表示されます。内容を確認してから
                「変更を保存」を押してください。成功すると完了メッセージが表示されます。
              </p>
            </section>

            <section id="links" className={`${styles.guideCard} ${styles.wideCard}`}>
              <p className={styles.cardLabel}>SERVICE LINKS</p>
              <h3>サービスリンク</h3>
              <p>
                YouTubeやInstagramなどのサービスを選択し、リンクを登録できます。
                選択したサービスのアイコンがリンクの左側に表示されます。
              </p>
              <dl className={styles.fieldList}>
                <div><dt>ラベル</dt><dd>「猫の動画を投稿中！」など、リンクの横に添える短いコメントです。</dd></div>
                <div><dt>URL</dt><dd>リンクを押したときに移動するページのURLを入力します。</dd></div>
                <div><dt>登録数</dt><dd>サービスリンクは4つまで登録できます。</dd></div>
              </dl>
            </section>

            <section id="save" className={styles.guideCard}>
              <p className={styles.cardLabel}>SAVE</p>
              <h3>「変更を保存」ボタン</h3>
              <p>
                編集欄を書き換えただけでは内容は保存されません。
                変更や追加を行ったら、忘れずに「変更を保存」を押してください。
              </p>
            </section>

            <section id="qr-code" className={styles.guideCard}>
              <p className={styles.cardLabel}>SHARE</p>
              <h3>QRコード</h3>
              <p>
                meishi下部のQRコードには、あなたのmeishiのURLが設定されています。
                相手のスマートフォンで読み取ってもらえば、簡単にページを共有できます。
              </p>
              <p>
                イベントではQRコードを印刷して掲示するなど、オンライン以外の場でも活用できます。
              </p>
            </section>
          </div>
        </section>

        <section
          id="moderation-support"
          className={styles.section}
          aria-labelledby="moderation-support-title"
        >
          <div className={styles.sectionHeading}>
            <span>03</span>
            <div>
              <p>MODERATION SUPPORT</p>
              <h2 id="moderation-support-title">
                非公開・利用停止への対応
              </h2>
            </div>
          </div>
          <div className={`${styles.guideCard} ${styles.wideCard}`}>
            <h3>通知で対象と理由を確認してください</h3>
            <p>
              音声やリンクが非公開になった場合は、ベルの通知とプロフィール編集画面に対象・理由・必要な対応が表示されます。
              通常の違反は修正後に公開され、管理者が事後確認します。誹謗中傷やなりすましなどは、管理者の確認が完了するまで非公開です。
            </p>
            <p>
              修正方法について確認したい場合や、利用停止の解除を申請する場合は、対応状況と申請画面を利用してください。
              利用停止の解除申請期間は、利用停止から60日間です。
            </p>
            <Link className={styles.supportLink} href="/support">
              対応状況と申請を確認
            </Link>
          </div>
        </section>

        <section className={styles.cta} aria-labelledby="help-cta-title">
          <p>準備ができたら</p>
          <h2 id="help-cta-title">あなたのmeishiを作ってみましょう</h2>
          <div className={styles.ctaLinks}>
            <Link href="/signup">アカウント登録へ</Link>
            <Link href="/profile">マイページへ</Link>
          </div>
        </section>
      </article>
    </div>
  );
}
