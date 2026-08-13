import type { ModerationDetailResponse } from "@/lib/adminModeration";
import styles from "./page.module.css";
import {
  moderationReasonLabels,
  targetTypeLabels,
} from "./moderationPresentation";

const actionLabels = {
  hide: "非公開",
  restore: "復旧",
  suspend: "利用停止",
  scheduleDeletion: "削除予定化",
  remove: "削除",
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

interface AdminModerationHistoryPanelsProps {
  violationSummary: ModerationDetailResponse["profile"]["violationSummary"];
  violationEvents: ModerationDetailResponse["profile"]["violationEvents"];
  history: ModerationDetailResponse["profile"]["history"];
}

export default function AdminModerationHistoryPanels({
  violationSummary,
  violationEvents,
  history,
}: AdminModerationHistoryPanelsProps) {
  return (
    <>
      <section
        className={styles.panel}
        aria-labelledby="violation-history-heading"
      >
        <div className={styles.sectionHeading}>
          <h2 id="violation-history-heading">違反履歴</h2>
          <span>有効 {violationSummary.activeCount}件</span>
        </div>
        {Object.keys(violationSummary.countsByReason).length ? (
          <dl className={styles.violationSummary}>
            {Object.entries(violationSummary.countsByReason).map(
              ([reasonCode, count]) => (
                <div key={reasonCode}>
                  <dt>
                    {moderationReasonLabels[
                      reasonCode as keyof typeof moderationReasonLabels
                    ] ?? reasonCode}
                  </dt>
                  <dd>{count}件</dd>
                </div>
              ),
            )}
          </dl>
        ) : (
          <p className={styles.emptyHistory}>
            現在の違反回数に含まれる事案はありません。
          </p>
        )}
        {violationEvents.length ? (
          <ol className={styles.violationHistoryList}>
            {violationEvents.map((event) => (
              <li
                key={event.id}
                className={event.isActive ? styles.activeViolation : ""}
              >
                <div className={styles.historyHeader}>
                  <div>
                    <span className={styles.historyTarget}>
                      {event.eventType === "revoked"
                        ? "取り消し"
                        : event.isActive
                          ? "有効"
                          : "取消済み"}
                    </span>
                    <strong>
                      {event.eventType === "revoked"
                        ? "違反回数の取り消し"
                        : moderationReasonLabels[event.reasonCode]}
                    </strong>
                  </div>
                  <time dateTime={event.createdAt}>
                    {formatDate(event.createdAt)}
                  </time>
                </div>
                <p className={styles.historyReason}>{event.note}</p>
                {event.suspensionTriggered ? (
                  <p className={styles.suspensionTrigger}>
                    この違反確定により利用停止
                  </p>
                ) : null}
                <p className={styles.historyAdmin}>
                  担当者: {event.adminRole ?? "不明"} /{" "}
                  {event.adminIdentifier ?? "記録なし"}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.emptyHistory}>違反履歴はありません。</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="history-heading">
        <div className={styles.sectionHeading}>
          <h2 id="history-heading">管理操作履歴</h2>
          <span>最新{history.length}件</span>
        </div>
        {history.length ? (
          <ol className={styles.historyList}>
            {history.map((entry) => (
              <li key={entry.id}>
                <div className={styles.historyHeader}>
                  <div>
                    <span className={styles.historyTarget}>
                      {targetTypeLabels[entry.targetType]}
                    </span>
                    <strong>{actionLabels[entry.action]}</strong>
                  </div>
                  <time dateTime={entry.createdAt}>
                    {formatDate(entry.createdAt)}
                  </time>
                </div>
                <p className={styles.statusChange}>
                  {entry.previousStatus} → {entry.newStatus}
                </p>
                <p className={styles.historyReason}>{entry.reason}</p>
                <p className={styles.historyAdmin}>
                  {entry.actorType === "system"
                    ? "実行者: システム"
                    : `実行者: ${entry.adminRole ?? "不明"} / ${entry.adminIdentifier ?? "記録なし"}`}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.emptyHistory}>管理操作履歴はありません。</p>
        )}
        {history.length === 50 ? (
          <p className={styles.historyNote}>最新50件を表示しています。</p>
        ) : null}
      </section>
    </>
  );
}
