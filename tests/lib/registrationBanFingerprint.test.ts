import { describe, expect, it } from "vitest";
import { createRegistrationBanFingerprints } from "@/lib/registrationBanFingerprint";

const secret = "registration-ban-test-secret-at-least-32-characters";

describe("createRegistrationBanFingerprints", () => {
  it("メールとFacebook識別子を生値を含まない照合値にする", () => {
    const result = createRegistrationBanFingerprints(
      {
        email: " User@Example.COM ",
        identities: [
          {
            provider: "facebook",
            id: "fallback-id",
            identity_data: { provider_id: "facebook-user-123" },
          },
        ],
      },
      secret,
    );

    expect(result).toEqual([
      {
        identifierType: "email",
        provider: null,
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      {
        identifierType: "providerIdentity",
        provider: "facebook",
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("user@example.com");
    expect(JSON.stringify(result)).not.toContain("facebook-user-123");
  });

  it("メールの前後空白と大文字小文字を正規化する", () => {
    const first = createRegistrationBanFingerprints(
      { email: "User@Example.com" },
      secret,
    );
    const second = createRegistrationBanFingerprints(
      { email: " user@example.COM " },
      secret,
    );

    expect(first[0].fingerprint).toBe(second[0].fingerprint);
  });

  it("provider_idがなければsubを使用し同一識別子を重複させない", () => {
    const identity = {
      provider: "facebook",
      identity_data: { sub: "facebook-sub-1" },
    };

    const result = createRegistrationBanFingerprints(
      { identities: [identity, identity] },
      secret,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      identifierType: "providerIdentity",
      provider: "facebook",
    });
  });

  it("メールidentityと識別子を取得できないidentityは対象外にする", () => {
    const result = createRegistrationBanFingerprints(
      {
        identities: [
          { provider: "email", id: "auth-user-id" },
          { provider: "facebook", identity_data: {} },
        ],
      },
      secret,
    );

    expect(result).toEqual([]);
  });

  it.each(["", "short-secret"])(
    "32文字未満の秘密値では生成しない",
    (configuredSecret) => {
      expect(() =>
        createRegistrationBanFingerprints(
          { email: "user@example.com" },
          configuredSecret,
        ),
      ).toThrow("ACCOUNT_BAN_HASH_SECRET must be at least 32 characters.");
    },
  );

  it("秘密値が異なれば同じ利用者でも異なる照合値になる", () => {
    const subject = { email: "user@example.com" };

    const first = createRegistrationBanFingerprints(subject, secret);
    const second = createRegistrationBanFingerprints(
      subject,
      "another-registration-ban-secret-at-least-32-characters",
    );

    expect(first[0].fingerprint).not.toBe(second[0].fingerprint);
  });
});
