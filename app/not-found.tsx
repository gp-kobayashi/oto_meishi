import type { Metadata } from "next";
import ErrorPage from "@/components/error/ErrorPage";

export const metadata: Metadata = {
  title: "ページが見つかりません | oto_meishi",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <ErrorPage
      heading="ページが見つかりません"
      description="お探しのページは存在しないか、移動した可能性があります。"
    />
  );
}
