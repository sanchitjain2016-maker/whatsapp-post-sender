type CheckPayload = {
  mediaLink?: string;
};

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

async function fetchImageMetadata(mediaLink: string) {
  const headResponse = await fetch(mediaLink, { method: "HEAD" }).catch(() => null);
  if (headResponse?.ok) {
    return headResponse;
  }

  return fetch(mediaLink, {
    method: "GET",
    headers: { Range: "bytes=0-1023" },
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CheckPayload;
    const mediaLink = payload.mediaLink?.trim();

    if (!mediaLink) {
      return Response.json({ error: "Image URL is required." }, { status: 400 });
    }

    let url: URL;
    try {
      url = new URL(mediaLink);
    } catch {
      return Response.json({ error: "Image URL is not valid." }, { status: 400 });
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      return Response.json({ error: "Image URL must start with http:// or https://." }, { status: 400 });
    }

    const response = await fetchImageMetadata(mediaLink);
    if (!response.ok) {
      return Response.json(
        { error: `Image URL could not be reached. Server returned ${response.status}.` },
        { status: 400 },
      );
    }

    const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
    if (!allowedImageTypes.includes(contentType)) {
      return Response.json(
        {
          error: `Image URL returned ${contentType || "unknown content"} instead of jpeg, png, or webp.`,
        },
        { status: 400 },
      );
    }

    return Response.json({
      ok: true,
      contentType,
      finalUrl: response.url || mediaLink,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Image URL check failed." },
      { status: 500 },
    );
  }
}
