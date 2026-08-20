const RESERVED_USER_IDS = [
  "admin",
  "api",
  "forgot-password",
  "help",
  "login",
  "logout",
  "privacy",
  "profile",
  "reset-password",
  "signup",
  "support",
  "terms",
  "useridInput",
  "_next",
] as const;

const reservedUserIds = new Set(
  RESERVED_USER_IDS.map((userId) => userId.toLowerCase()),
);

export function isReservedUserId(userId: string): boolean {
  return reservedUserIds.has(userId.trim().toLowerCase());
}
