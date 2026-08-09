import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "利用規約 | oto_meishi",
  description: "oto_meishiを安心してご利用いただくためのルールをご案内します。",
};

const sections = [
  { id: "about", title: "この規約について" },
  { id: "account", title: "アカウントとユーザーID" },
  { id: "content", title: "掲載する内容について" },
  { id: "prohibited", title: "禁止していること" },
  { id: "handling", title: "コンテンツの取り扱い" },
  { id: "moderation", title: "公開停止・削除等の対応" },
  { id: "service", title: "サービスの変更・停止" },
  { id: "backup", title: "データの保管" },
  { id: "external", title: "外部サービス・リンク" },
  { id: "responsibility", title: "利用上の責任" },
  { id: "changes", title: "規約の変更" },
] as const;

export default function TermsPage() {
  return (
    <div className={styles.main}>
      <div className={styles.backgroundAura} aria-hidden="true">
        <div className={`${styles.blob} ${styles.back}`} />
        <div className={`${styles.blob} ${styles.middle}`} />
        <div className={`${styles.blob} ${styles.front}`} />
      </div>

      <article className={styles.terms}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>OTO_MEISHI TERMS</p>
          <h1>利用規約</h1>
          <p className={styles.lead}>
            oto_meishiを、誰もが安心して自分を紹介できる場所にするためのルールです。
            サービスを利用する前に、以下の内容をご確認ください。
          </p>
          <p className={styles.date}>
            制定日：2026年7月17日／最終更新日：2026年8月9日
          </p>
        </header>

        <nav className={styles.tableOfContents} aria-label="利用規約の目次">
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
          <section id="about" className={styles.section}>
            <div className={styles.sectionNumber}>01</div>
            <div>
              <h2>この規約について</h2>
              <p>
                この利用規約は、oto_meishiが提供するサービスを利用する際のルールを定めるものです。
                アカウントを登録し、サービスを利用した時点で、この規約の内容に同意したものとします。
              </p>
            </div>
          </section>

          <section id="account" className={styles.section}>
            <div className={styles.sectionNumber}>02</div>
            <div>
              <h2>アカウントとユーザーID</h2>
              <ul>
                <li>登録情報は、正確な内容を入力してください。</li>
                <li>アカウントやパスワードは、利用者自身の責任で安全に管理してください。</li>
                <li>アカウントを第三者へ譲渡したり、共同で使用したりしないでください。</li>
                <li>ユーザーIDはmeishiのURLに使用され、登録後は変更できません。</li>
                <li>アカウントの不正利用に気付いた場合は、速やかに運営へお知らせください。</li>
              </ul>
            </div>
          </section>

          <section id="content" className={styles.section}>
            <div className={styles.sectionNumber}>03</div>
            <div>
              <h2>掲載する内容について</h2>
              <p>
                表示名、自己紹介、音声、サービスリンクなど、meishiへ掲載する内容は利用者自身が用意し、
                その内容について責任を持つものとします。
              </p>
              <p>
                他者が作成した楽曲や音源、他者の声・名前・写真などを使用する場合は、
                公開や利用に必要な許可を得たものだけを掲載してください。
              </p>
            </div>
          </section>

          <section id="prohibited" className={`${styles.section} ${styles.highlightSection}`}>
            <div className={styles.sectionNumber}>04</div>
            <div>
              <h2>禁止していること</h2>
              <p>
                oto_meishiでは、次のような行為やコンテンツの掲載を禁止します。
              </p>
              <ul className={styles.prohibitedList}>
                <li>公序良俗に反する内容を掲載すること</li>
                <li>他者への誹謗中傷、差別、脅迫、嫌がらせを行うこと</li>
                <li>他者の著作物、音源、声、名前、プライバシーなどを無断で使用すること</li>
                <li>他者になりすましたり、誤解を招く情報を意図的に掲載したりすること</li>
                <li>アカウントを利用する本人以外の人物を主体としたプロフィールを作成すること</li>
                <li>政党・政治団体・宗教団体への勧誘または宣伝を行うこと</li>
                <li>他の宗教、政党またはその支持者を攻撃したり、誹謗中傷したりすること</li>
                <li>過度に性的、暴力的、または閲覧者へ強い不快感を与える内容を掲載すること</li>
                <li>詐欺、フィッシング、マルウェアなど、危険なサイトへ誘導するリンクを掲載すること</li>
                <li>スパム、大量のアカウント作成、自動操作などにより不正に利用すること</li>
                <li>サービスへ過度な負荷をかけたり、動作やセキュリティを妨げたりすること</li>
                <li>ほかの利用者や第三者へ不利益または損害を与えること</li>
                <li>運営が不適切と判断する行為を行うこと</li>
              </ul>
              <p>
                個人として政治・宗教上の所属や信条を紹介することは禁止しません。
                ただし、思想や教義の正しさを争う場として利用することはできません。
              </p>
            </div>
          </section>

          <section id="handling" className={styles.section}>
            <div className={styles.sectionNumber}>05</div>
            <div>
              <h2>コンテンツの取り扱い</h2>
              <p>
                利用者が掲載したコンテンツは、原則として利用者に帰属します。
                oto_meishiはサービスの提供に必要な範囲で、コンテンツを保存、公開、配信、表示します。
              </p>
              <p>
                アップロードされた音声は、再生しやすくするために音量調整やファイル形式の変換を行います。
                これらの処理によって、元の音質やファイル形式がそのまま維持されない場合があります。
              </p>
            </div>
          </section>

          <section id="moderation" className={styles.section}>
            <div className={styles.sectionNumber}>06</div>
            <div>
              <h2>公開停止・削除等の対応</h2>
              <p>
                規約に反する利用が確認された場合や、サービス・利用者・第三者を守るために必要な場合、
                運営はコンテンツの非公開・削除、機能の制限、アカウントの停止または削除を行うことがあります。
              </p>
              <p>
                緊急性がある場合や被害の拡大を防ぐ必要がある場合は、事前のお知らせなく対応することがあります。
              </p>
            </div>
          </section>

          <section id="service" className={styles.section}>
            <div className={styles.sectionNumber}>07</div>
            <div>
              <h2>サービスの変更・停止</h2>
              <p>
                機能の改善、メンテナンス、障害対応、運営上の都合などにより、
                サービスの内容を変更したり、一時的または継続的に提供を停止したりする場合があります。
                重要な変更については、可能な範囲で事前にお知らせします。
              </p>
            </div>
          </section>

          <section id="backup" className={styles.section}>
            <div className={styles.sectionNumber}>08</div>
            <div>
              <h2>データの保管</h2>
              <p>
                障害、操作ミス、アカウント削除、サービス終了などによって、登録データが失われる可能性があります。
                大切な音声や文章の元データは、利用者自身でも保管してください。
              </p>
            </div>
          </section>

          <section id="external" className={styles.section}>
            <div className={styles.sectionNumber}>09</div>
            <div>
              <h2>外部サービス・リンク</h2>
              <p>
                meishiに掲載されたリンク先や、Google、Facebook、各SNSなどの外部サービスは、
                それぞれの提供者が管理しています。リンク先の内容、安全性、継続的な利用を
                oto_meishiが保証するものではありません。
              </p>
            </div>
          </section>

          <section id="responsibility" className={styles.section}>
            <div className={styles.sectionNumber}>10</div>
            <div>
              <h2>利用上の責任</h2>
              <p>
                利用者同士または利用者と第三者との間で問題が生じた場合は、当事者間で解決してください。
                oto_meishiは安定したサービス提供に努めますが、常に完全・正確・安全に利用できることや、
                すべての端末で同じように動作することを保証するものではありません。
              </p>
            </div>
          </section>

          <section id="changes" className={styles.section}>
            <div className={styles.sectionNumber}>11</div>
            <div>
              <h2>規約の変更</h2>
              <p>
                サービス内容や運営方法の変更に合わせて、この規約を更新する場合があります。
                大きな変更を行う場合は、サービス内などでお知らせします。
                変更後もサービスを利用した場合は、更新された内容に同意したものとします。
              </p>
            </div>
          </section>
        </div>

        <footer className={styles.footerNote}>
          <p>最後までお読みいただきありがとうございます。</p>
          <h2>お互いを尊重し、安心して使えるmeishiを作りましょう。</h2>
          <div className={styles.actions}>
            <Link href="/help">使い方を見る</Link>
            <Link href="/signup">アカウント登録へ</Link>
          </div>
        </footer>
      </article>
    </div>
  );
}
