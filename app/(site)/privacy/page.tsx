import type { Metadata } from "next";
import Link from "next/link";
import styles from "../terms/page.module.css";

export const metadata: Metadata = {
  title: "プライバシーポリシー | oto_meishi",
  description: "oto_meishiにおける利用者情報の取り扱いをご案内します。",
};

const sections = [
  { id: "information", title: "取得する情報" },
  { id: "purpose", title: "情報の利用目的" },
  { id: "public", title: "公開される情報" },
  { id: "services", title: "外部サービスの利用" },
  { id: "storage", title: "Cookie等の利用" },
  { id: "sharing", title: "第三者への提供" },
  { id: "retention", title: "情報の保管と削除" },
  { id: "security", title: "安全管理" },
  { id: "requests", title: "利用者による確認・変更" },
  { id: "changes", title: "ポリシーの変更" },
] as const;

export default function PrivacyPage() {
  return (
    <div className={styles.main}>
      <div className={styles.backgroundAura} aria-hidden="true">
        <div className={`${styles.blob} ${styles.back}`} />
        <div className={`${styles.blob} ${styles.middle}`} />
        <div className={`${styles.blob} ${styles.front}`} />
      </div>

      <article className={styles.terms}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>OTO_MEISHI PRIVACY POLICY</p>
          <h1>プライバシーポリシー</h1>
          <p className={styles.lead}>
            oto_meishiで取り扱う利用者情報と、その利用目的について説明します。
            サービスを利用する前に、以下の内容をご確認ください。
          </p>
          <p className={styles.date}>制定日：2026年7月24日</p>
        </header>

        <nav
          className={styles.tableOfContents}
          aria-label="プライバシーポリシーの目次"
        >
          <p>目次</p>
          <ol>
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className={styles.content}>
          <section id="information" className={styles.section}>
            <div className={styles.sectionNumber}>01</div>
            <div>
              <h2>取得する情報</h2>
              <p>oto_meishiでは、サービスの提供に必要な範囲で次の情報を取得します。</p>
              <ul>
                <li>メールアドレス、認証サービスのユーザーIDなどのアカウント情報</li>
                <li>ユーザーID、表示名、自己紹介、テーマなどのプロフィール情報</li>
                <li>アップロードした音声、音声タイトル、登録したサービスリンク</li>
                <li>通報内容、運営からの通知、対応履歴などのサービス利用情報</li>
                <li>IPアドレス、アクセス日時、端末やブラウザの情報、エラーログなど</li>
              </ul>
            </div>
          </section>

          <section id="purpose" className={styles.section}>
            <div className={styles.sectionNumber}>02</div>
            <div>
              <h2>情報の利用目的</h2>
              <p>取得した情報は、次の目的で利用します。</p>
              <ul>
                <li>アカウントの作成、本人確認、ログイン状態の維持</li>
                <li>meishiの作成、公開、編集、音声再生などの機能提供</li>
                <li>重要な変更や運営上のお知らせの表示</li>
                <li>不正利用、規約違反、危険な音声やリンクへの調査・対応</li>
                <li>障害の調査、セキュリティの確保、サービスの改善</li>
              </ul>
            </div>
          </section>

          <section id="public" className={`${styles.section} ${styles.highlightSection}`}>
            <div className={styles.sectionNumber}>03</div>
            <div>
              <h2>公開される情報</h2>
              <p>
                公開中のmeishiに設定したユーザーID、表示名、自己紹介、音声、
                音声タイトル、サービスリンク、テーマは、URLを知っている人を含む
                インターネット上の利用者が閲覧または再生できます。
              </p>
              <p>
                メールアドレスや認証情報はmeishiには表示しません。
                公開したくない情報は、プロフィールや音声、リンクへ入力しないでください。
              </p>
            </div>
          </section>

          <section id="services" className={styles.section}>
            <div className={styles.sectionNumber}>04</div>
            <div>
              <h2>外部サービスの利用</h2>
              <p>
                oto_meishiは、認証とデータベースにSupabase、音声の保管にCloudflare R2、
                アプリケーションの実行環境にGoogle Cloudを利用します。
                GoogleまたはFacebookで登録・ログインする場合は、選択した認証サービスでも
                情報が取り扱われます。
              </p>
              <p>
                各サービスにおける情報の取り扱いは、それぞれの提供者が定める規約や
                プライバシーポリシーも適用されます。
              </p>
            </div>
          </section>

          <section id="storage" className={styles.section}>
            <div className={styles.sectionNumber}>05</div>
            <div>
              <h2>Cookie等の利用</h2>
              <p>
                ログイン状態の維持や認証処理のため、ブラウザのCookieまたは
                ローカルストレージ等を使用します。これらを無効にすると、
                ログインを必要とする機能が利用できない場合があります。
              </p>
            </div>
          </section>

          <section id="sharing" className={styles.section}>
            <div className={styles.sectionNumber}>06</div>
            <div>
              <h2>第三者への提供</h2>
              <p>
                oto_meishiは、利用者の同意がある場合、サービス提供に必要な外部サービスへ
                処理を委託する場合、または安全確保や不正利用への対応に必要な場合を除き、
                取得した個人情報を第三者へ提供しません。
              </p>
              <p>
                統計情報を作成する場合は、個人を直接識別できない形で取り扱います。
              </p>
            </div>
          </section>

          <section id="retention" className={styles.section}>
            <div className={styles.sectionNumber}>07</div>
            <div>
              <h2>情報の保管と削除</h2>
              <p>
                取得した情報は、サービスの提供や安全な運営に必要な期間保管します。
                プロフィールや音声を削除した場合も、障害対策のバックアップや
                不正利用への対応記録に一定期間残ることがあります。
              </p>
              <p>
                現在、利用者自身によるアカウント削除機能は提供していません。
                この機能を提供する場合は、サービス内で操作方法を案内します。
              </p>
            </div>
          </section>

          <section id="security" className={styles.section}>
            <div className={styles.sectionNumber}>08</div>
            <div>
              <h2>安全管理</h2>
              <p>
                認証情報へのアクセス制限、非公開ストレージ、期限付きの音声再生URLなどを使用し、
                情報への不正アクセス、漏えい、改ざん、消失を防ぐための対策に努めます。
                ただし、インターネット上の通信や保管について完全な安全性を保証するものではありません。
              </p>
            </div>
          </section>

          <section id="requests" className={styles.section}>
            <div className={styles.sectionNumber}>09</div>
            <div>
              <h2>利用者による確認・変更</h2>
              <p>
                プロフィール情報、音声、サービスリンクは、ログイン後の編集画面から
                確認・変更できます。パスワードを忘れた場合は、
                ログイン画面から再設定できます。
              </p>
              <p>
                編集画面で変更できないアカウント情報や運営上の記録については、
                現在、利用者自身が変更・削除する機能を提供していません。
              </p>
            </div>
          </section>

          <section id="changes" className={styles.section}>
            <div className={styles.sectionNumber}>10</div>
            <div>
              <h2>ポリシーの変更</h2>
              <p>
                サービス内容や利用する外部サービスの変更に合わせて、
                このポリシーを更新する場合があります。重要な変更を行う場合は、
                サービス内などでお知らせします。
              </p>
            </div>
          </section>

        </div>

        <footer className={styles.footerNote}>
          <p>利用者情報を大切に取り扱います。</p>
          <h2>安心して自分を紹介できるサービスを目指します。</h2>
          <div className={styles.actions}>
            <Link href="/terms">利用規約を見る</Link>
            <Link href="/signup">アカウント登録へ</Link>
          </div>
        </footer>
      </article>
    </div>
  );
}
