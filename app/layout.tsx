import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "oto_meishi - 音声付き名刺",
  description: "音声ファイルを添付できるデジタル名刺アプリ",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
