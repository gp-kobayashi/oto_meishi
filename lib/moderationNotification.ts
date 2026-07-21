export type NotificationTargetType = "profile" | "audio" | "socialLink";
export type NotificationAction = "hide" | "restore" | "suspend";

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
