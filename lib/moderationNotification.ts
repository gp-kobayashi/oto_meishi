export type NotificationTargetType = "profile" | "audio" | "socialLink";
export type NotificationAction = "hide" | "restore" | "suspend";
export type NotificationReviewMode = "postReview" | "preReview" | null;

const targetLabels: Record<NotificationTargetType, string> = {
  profile: "プロフィール",
  audio: "音声",
  socialLink: "リンク",
};

export function getModerationNotification(
  targetType: NotificationTargetType,
  action: NotificationAction,
) {
  const targetLabel = targetLabels[targetType];

  if (action === "restore") {
    return {
      title: `${targetLabel}の公開状態について`,
      message: `確認の結果、${targetLabel}を再公開しました。`,
    };
  }

  if (action === "suspend") {
    return {
      title: "プロフィールの利用停止について",
      message:
        "規約違反が確認されたため、プロフィールを利用停止にしました。",
    };
  }

  return {
    title: `${targetLabel}の公開状態について`,
    message: `規約違反が確認されたため、${targetLabel}を非公開にしました。`,
  };
}

const actionLabels: Record<NotificationAction, string> = {
  hide: "非公開",
  restore: "再公開",
  suspend: "利用停止",
};

export function getModerationNotificationGuidance(
  targetType: NotificationTargetType,
  action: NotificationAction,
  reviewMode: NotificationReviewMode,
) {
  if (action === "restore") {
    return {
      actionLabel: actionLabels[action],
      guidance: "対応は完了しています。現在の登録内容を確認できます。",
      actionUrl: "/profile/edit",
      actionLinkLabel: "登録内容を確認",
    };
  }

  if (action === "suspend") {
    return {
      actionLabel: actionLabels[action],
      guidance:
        "利用停止中は通常の編集を行えません。対応方法を確認してください。",
      actionUrl: "/help",
      actionLinkLabel: "対応方法を確認",
    };
  }

  const targetLabel = targetLabels[targetType];
  if (reviewMode === "postReview") {
    return {
      actionLabel: actionLabels[action],
      guidance: `${targetLabel}を修正すると公開され、管理者が事後確認を行います。`,
      actionUrl: "/profile/edit",
      actionLinkLabel: `${targetLabel}を修正`,
    };
  }
  if (reviewMode === "preReview") {
    return {
      actionLabel: actionLabels[action],
      guidance: `${targetLabel}を修正しても、管理者の確認が完了するまで公開されません。`,
      actionUrl: "/profile/edit",
      actionLinkLabel: `${targetLabel}を修正`,
    };
  }

  return {
    actionLabel: actionLabels[action],
    guidance: `${targetLabel}を修正してください。変更内容は管理者が確認します。`,
    actionUrl: "/profile/edit",
    actionLinkLabel: `${targetLabel}を修正`,
  };
}
