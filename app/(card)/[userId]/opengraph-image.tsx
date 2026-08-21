import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/publicProfile";
import { createProfileOgPresentation } from "@/lib/publicProfileOg";

export const alt = "oto_meishi 公開プロフィール";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type ProfileOgImageProps = {
  params: Promise<{ userId: string }>;
};

export default async function ProfileOgImage({ params }: ProfileOgImageProps) {
  const { userId } = await params;
  const profile = await getPublicProfile(userId);

  if (!profile) notFound();

  const { displayName, bio, palette } = createProfileOgPresentation(profile);

  return new ImageResponse(
    <div
      style={{
        background: palette.background,
        color: palette.foreground,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 84px",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          color: palette.accent,
          fontSize: 32,
          fontWeight: 700,
          display: "flex",
        }}
      >
        oto_meishi
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.15,
            display: "flex",
          }}
        >
          {displayName}
        </div>
        <div
          style={{
            color: palette.muted,
            fontSize: 30,
            lineHeight: 1.4,
            display: "flex",
            maxWidth: 1000,
          }}
        >
          {bio}
        </div>
      </div>
      <div
        style={{
          color: palette.accent,
          fontSize: 24,
          display: "flex",
        }}
      >
        音声付きプロフィール
      </div>
    </div>,
    size,
  );
}
