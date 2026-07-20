export function hasJsonContentType(request: Request) {
  const contentType = request.headers.get("Content-Type");
  if (!contentType) {
    return false;
  }

  const [mediaType] = contentType.split(";", 1);
  return mediaType.trim().toLowerCase() === "application/json";
}
