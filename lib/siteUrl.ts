export const DEFAULT_SITE_URL = "https://oto-meishi.com";

const isLocalHttpUrl = (url: URL) =>
  url.protocol === "http:" &&
  (url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1");

export function getSiteUrl(
  configuredUrl = process.env.NEXT_PUBLIC_SITE_URL,
): string {
  const value = configuredUrl?.trim() || DEFAULT_SITE_URL;
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SITE_URLには有効な公開URLを設定してください。",
    );
  }

  if (url.protocol !== "https:" && !isLocalHttpUrl(url)) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URLはHTTPS URLを設定してください。ローカル開発ではHTTPのlocalhostも使用できます。",
    );
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URLにはパスやクエリを含まないオリジンを設定してください。",
    );
  }

  return url.origin;
}

export function buildSiteUrl(
  path: string,
  configuredUrl = process.env.NEXT_PUBLIC_SITE_URL,
): string {
  const normalizedPath = `/${path.replace(/^\/+/, "")}`;
  return new URL(normalizedPath, `${getSiteUrl(configuredUrl)}/`).toString();
}
