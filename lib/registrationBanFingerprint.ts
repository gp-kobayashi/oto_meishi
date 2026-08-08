import { createHmac } from "node:crypto";

const MINIMUM_SECRET_LENGTH = 32;

type SupabaseIdentityLike = {
  id?: string;
  provider?: string;
  identity_data?: Record<string, unknown>;
};

export type RegistrationBanSubject = {
  email?: string | null;
  identities?: readonly SupabaseIdentityLike[] | null;
};

export type RegistrationBanFingerprint = {
  identifierType: "email" | "providerIdentity";
  provider: string | null;
  fingerprint: string;
};

function getFingerprintSecret(configuredSecret?: string): string {
  const secret = configuredSecret?.trim();
  if (!secret || secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(
      `ACCOUNT_BAN_HASH_SECRET must be at least ${MINIMUM_SECRET_LENGTH} characters.`,
    );
  }
  return secret;
}

function fingerprint(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function readProviderIdentifier(identity: SupabaseIdentityLike): string | null {
  const providerId = identity.identity_data?.provider_id;
  if (typeof providerId === "string" && providerId.trim()) {
    return providerId.trim().normalize("NFC");
  }

  const subject = identity.identity_data?.sub;
  if (typeof subject === "string" && subject.trim()) {
    return subject.trim().normalize("NFC");
  }

  if (typeof identity.id === "string" && identity.id.trim()) {
    return identity.id.trim().normalize("NFC");
  }

  return null;
}

/**
 * 生のメールアドレスや外部認証IDを永続化せず、照合専用のHMACだけを返す。
 * メールアドレスは大文字小文字を区別しないが、外部認証IDは提供元の値を保つ。
 */
export function createRegistrationBanFingerprints(
  subject: RegistrationBanSubject,
  configuredSecret = process.env.ACCOUNT_BAN_HASH_SECRET,
): RegistrationBanFingerprint[] {
  const secret = getFingerprintSecret(configuredSecret);
  const fingerprints = new Map<string, RegistrationBanFingerprint>();
  const normalizedEmail = subject.email?.trim().normalize("NFC").toLowerCase();

  if (normalizedEmail) {
    const value = fingerprint(`email:${normalizedEmail}`, secret);
    fingerprints.set(value, {
      identifierType: "email",
      provider: null,
      fingerprint: value,
    });
  }

  for (const identity of subject.identities ?? []) {
    const provider = identity.provider?.trim().toLowerCase();
    if (!provider || provider === "email") continue;

    const providerIdentifier = readProviderIdentifier(identity);
    if (!providerIdentifier) continue;

    const value = fingerprint(
      `provider:${provider}:${providerIdentifier}`,
      secret,
    );
    fingerprints.set(value, {
      identifierType: "providerIdentity",
      provider,
      fingerprint: value,
    });
  }

  return [...fingerprints.values()];
}
