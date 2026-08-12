const imageRequestHeaders = {
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get("src")?.trim();

  if (!sourceUrl) {
    return Response.json({ error: "Image URL is required." }, { status: 400 });
  }

  try {
    const parsedSourceUrl = new URL(sourceUrl);

    if (!["http:", "https:"].includes(parsedSourceUrl.protocol)) {
      return Response.json({ error: "Image URL must start with http:// or https://." }, { status: 400 });
    }

    const imageResponse = await fetch(sourceUrl, { headers: imageRequestHeaders });

    if (!imageResponse.ok) {
      return Response.json(
        { error: `Source image could not be loaded. Status ${imageResponse.status}.` },
        { status: 400 },
      );
    }

    const contentType = imageResponse.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
    if (!allowedImageTypes.includes(contentType)) {
      return Response.json(
        { error: `Image URL returned ${contentType || "unknown content"} instead of jpeg, png, or webp.` },
        { status: 400 },
      );
    }

    return new Response(await imageResponse.arrayBuffer(), {
      headers: {
        "Cache-Control": "public, max-age=900",
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Source image could not be loaded." },
      { status: 500 },
    );
  }
}
