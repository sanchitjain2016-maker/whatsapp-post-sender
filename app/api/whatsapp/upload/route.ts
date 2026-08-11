type UploadPayload = {
  token?: string;
  phoneNumberId?: string;
  imageDataUrl?: string;
  fileName?: string;
};

const graphVersion = "v26.0";

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error("Choose an uploaded image before sending.");
  }

  const contentType = match[1];
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  return { contentType, bytes };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as UploadPayload;
    const token = payload.token?.trim();
    const phoneNumberId = payload.phoneNumberId?.trim();
    const imageDataUrl = payload.imageDataUrl?.trim();

    if (!token || !phoneNumberId || !imageDataUrl) {
      return Response.json(
        { error: "Token, phone number ID, and image are required." },
        { status: 400 },
      );
    }

    let contentType = "image/png";
    let bytes: Uint8Array;

    if (imageDataUrl.startsWith("data:")) {
      const parsed = parseDataUrl(imageDataUrl);
      contentType = parsed.contentType;
      bytes = parsed.bytes;
    } else {
      const imageResponse = await fetch(new URL(imageDataUrl, request.url));
      if (!imageResponse.ok) {
        return Response.json({ error: "Default post image could not be loaded." }, { status: 500 });
      }
      contentType = imageResponse.headers.get("content-type") ?? contentType;
      bytes = new Uint8Array(await imageResponse.arrayBuffer());
    }

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append(
      "file",
      new Blob([bytes.buffer], { type: contentType }),
      payload.fileName?.trim() || "post-image.png",
    );

    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const result = (await response.json()) as { id?: string; error?: { message?: string } };

    if (!response.ok || !result.id) {
      return Response.json(
        { error: result.error?.message ?? "WhatsApp media upload failed." },
        { status: response.status || 502 },
      );
    }

    return Response.json({ mediaId: result.id });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Image upload failed." },
      { status: 500 },
    );
  }
}
