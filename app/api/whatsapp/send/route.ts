type SendPayload = {
  apiKey?: string;
  templateId?: string;
  to?: string;
  mediaLink?: string;
  bodyParam1?: string;
  bodyParam2?: string;
  campaignName?: string;
  scheduleDateTime?: string;
};

const virtualPracharUrl =
  "https://api.virtualprachar.com/api/whatsapp-business/v1/send-template-message";
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const imageRequestHeaders = {
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

async function validateMediaLink(mediaLink: string) {
  const headResponse = await fetch(mediaLink, { method: "HEAD", headers: imageRequestHeaders }).catch(() => null);
  const response =
    headResponse?.ok
      ? headResponse
      : await fetch(mediaLink, {
          method: "GET",
          headers: { ...imageRequestHeaders, Range: "bytes=0-1023" },
        });

  if (!response.ok) {
    throw new Error(`Image URL could not be reached by the server. Status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
  if (!allowedImageTypes.includes(contentType)) {
    throw new Error(
      `Image URL is returning ${contentType || "unknown content"} instead of a direct jpeg, png, or webp image.`,
    );
  }
}

function isPersonalizedImageFromThisApp(mediaLink: string, request: Request) {
  try {
    const mediaUrl = new URL(mediaLink);
    const requestUrl = new URL(request.url);
    return mediaUrl.origin === requestUrl.origin && mediaUrl.pathname === "/api/media/personalized";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SendPayload;
    const apiKey = payload.apiKey?.trim();
    const templateId = payload.templateId?.trim();
    const to = payload.to?.replace(/[^\d]/g, "");
    const mediaLink = payload.mediaLink?.trim();
    const bodyParam1 = payload.bodyParam1?.trim() ?? "";
    const bodyParam2 = payload.bodyParam2?.trim() ?? "";
    const campaignName = payload.campaignName?.trim() || "whatsapp-post-campaign";
    const scheduleDateTime = payload.scheduleDateTime?.trim();

    if (!apiKey || !templateId || !to || !mediaLink) {
      return Response.json(
        { error: "API key, template ID, recipient number, and media link are required." },
        { status: 400 },
      );
    }

    try {
      new URL(mediaLink);
      if (!isPersonalizedImageFromThisApp(mediaLink, request)) {
        await validateMediaLink(mediaLink);
      }
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Image URL is not valid." },
        { status: 400 },
      );
    }

    const requestBody: Record<string, unknown> = {
      template_id: templateId,
      recipients: [to],
      components: [
        {
          type: "HEADER",
          parameters: [
            {
              type: "image",
              image: {
                link: mediaLink,
              },
            },
          ],
        },
        {
          type: "BODY",
          parameters: [
            {
              type: "text",
              text: bodyParam1,
            },
            {
              type: "text",
              text: bodyParam2,
            },
          ],
        },
      ],
      campaign_name: campaignName,
      message_priority: 1,
      media_link: mediaLink,
      media_type: "image",
    };

    if (scheduleDateTime) {
      requestBody.schedule_date_time = scheduleDateTime;
    }

    const response = await fetch(virtualPracharUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return Response.json(
        { error: String(result.error ?? result.message ?? "VirtualPrachar send failed."), providerResponse: result },
        { status: response.status || 502 },
      );
    }

    const providerStatus = String(result.status ?? result.success ?? result.code ?? "").toLowerCase();
    const providerMessage = String(result.message ?? result.error ?? "");
    const providerText = `${providerStatus} ${providerMessage}`.toLowerCase();

    if (
      providerStatus === "false" ||
      providerStatus === "failed" ||
      providerStatus === "error" ||
      providerText.includes("invalid") ||
      providerText.includes("fail") ||
      providerText.includes("error")
    ) {
      return Response.json(
        {
          error: providerMessage || "VirtualPrachar did not accept this message.",
          providerResponse: result,
        },
        { status: 502 },
      );
    }

    return Response.json({ result, sentPayload: requestBody });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "VirtualPrachar send failed." },
      { status: 500 },
    );
  }
}
