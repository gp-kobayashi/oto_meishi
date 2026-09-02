import Link from "next/link";
import type { ModerationDetailResponse } from "@/lib/adminModeration";
import styles from "./page.module.css";
import { targetTypeLabels } from "./moderationPresentation";

type Profile = ModerationDetailResponse["profile"];

const reviewWaitingStatuses = new Set([
  "preReviewPending",
  "postReviewPending",
]);

export default function AdminModerationAttentionSummary({
  profile,
}: {
  profile: Profile;
}) {
  const pendingReports = profile.reports.filter(
    (report) => report.status === "pending" || report.status === "reviewed",
  ).length;
  const reviewWaitingCases = profile.moderationCases.filter((moderationCase) =>
    reviewWaitingStatuses.has(moderationCase.status),
  ).length;
  const pendingIdentityVerification = (
    profile.identityVerificationRequests ?? []
  ).filter((request) => request.status === "pending").length;
  const pendingModerationRequests = profile.moderationRequests.filter(
    (request) => request.status === "pending",
  ).length;

  const attentionTargets = new Map<string, { label: string; href: string }>();
  for (const moderationCase of profile.moderationCases) {
    if (moderationCase.status === "confirmed") continue;
    if (moderationCase.targetType === "socialLink") {
      const link = profile.links.find(
        (profileLink) => profileLink.id === moderationCase.targetId,
      );
      attentionTargets.set(`socialLink:${moderationCase.targetId}`, {
        label: link?.label || targetTypeLabels.socialLink,
        href: link ? `#link-${link.id}` : "#links-heading",
      });
      continue;
    }
    attentionTargets.set(moderationCase.targetType, {
      label: targetTypeLabels[moderationCase.targetType],
      href: `#${moderationCase.targetType}-heading`,
    });
  }

  const tasks = [
    { label: "通報", count: pendingReports, href: "#reports-heading" },
    {
      label: "修正内容と審査状況",
      count: reviewWaitingCases,
      href: "#cases-heading",
    },
    {
      label: "本人確認申請",
      count: pendingIdentityVerification,
      href: "#identity-verification-heading",
    },
    {
      label: "問い合わせ・解除申請",
      count: pendingModerationRequests,
      href: "#requests-heading",
    },
  ].filter((task) => task.count > 0);
  const hasActionableItems = tasks.length > 0 || attentionTargets.size > 0;

  return (
    <section
      className={`${styles.attentionSummary} ${
        hasActionableItems ? "" : styles.attentionSummarySuccess
      }`}
      data-status={hasActionableItems ? "action-required" : "clear"}
      aria-labelledby="attention-summary-heading"
    >
      <div className={styles.attentionSummaryHeader}>
        <div>
          <p className={styles.attentionEyebrow}>ACTION REQUIRED</p>
          <h2 id="attention-summary-heading">要対応サマリー</h2>
        </div>
        {tasks.length ? (
          <span
            className={styles.attentionCount}
            aria-label={`要対応${tasks.length}項目`}
          >
            要対応 {tasks.length}項目
          </span>
        ) : null}
      </div>
      <nav aria-label="要対応項目">
        {tasks.length ? (
          <ul className={styles.attentionTaskList}>
            {tasks.map((task) => (
              <li key={task.href}>
                <Link href={task.href} className={styles.attentionTaskLink}>
                  <span>{task.label}</span>
                  <strong>{task.count}件</strong>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.noAttention}>現在、要対応の項目はありません。</p>
        )}
      </nav>
      {attentionTargets.size ? (
        <div className={styles.attentionTargets}>
          <h3>対応対象</h3>
          <ul>
            {[...attentionTargets.values()].map((target) => (
              <li key={target.href + target.label}>
                <Link href={target.href}>{target.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
