function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get("src")?.trim();
  const name = url.searchParams.get("name")?.trim();

  if (!sourceUrl || !name) {
    return Response.json({ error: "Image URL and name are required." }, { status: 400 });
  }

  let imageUrl: URL;
  try {
    imageUrl = new URL(sourceUrl);
  } catch {
    return Response.json({ error: "Image URL is not valid." }, { status: 400 });
  }

  const safeName = escapeXml(name);
  const safeImageUrl = escapeXml(imageUrl.toString());
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <image href="${safeImageUrl}" x="0" y="0" width="1080" height="1080" preserveAspectRatio="xMidYMid slice"/>
  <rect x="140" y="882" width="800" height="104" rx="28" fill="#111111" fill-opacity="0.72"/>
  <text x="540" y="948" text-anchor="middle" dominant-baseline="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700" fill="#ffffff">${safeName}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
