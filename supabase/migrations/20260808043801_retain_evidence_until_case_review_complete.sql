-- 審査未完了の証拠音声は保持し、確認済みになった時点から60日後を保持期限にする。
update public."ModerationCase" as moderation_case
set "retentionExpiresAt" = coalesce(moderation_case."resolvedAt", moderation_case."updatedAt") + interval '60 days'
where moderation_case."status" = 'confirmed';
