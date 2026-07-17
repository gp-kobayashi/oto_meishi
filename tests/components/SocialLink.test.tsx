import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SocialLink from "@/components/card/socialLink/SocialLink";

describe("SocialLink", () => {
  it("HTTPSリンクを別タブで安全に開く", () => {
    render(
      <SocialLink
        link={{
          service: "youtube",
          url: "https://www.youtube.com/@testuser",
          label: "YouTube",
        }}
      />,
    );

    const link = screen.getByRole("link", { name: "YouTube" });
    expect(link.getAttribute("href")).toBe(
      "https://www.youtube.com/@testuser",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
