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

    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      status?: string;
    };

    if (!response.ok) {
      return Response.json(
        { error: result.error ?? result.message ?? "VirtualPrachar send failed." },
        { status: response.status || 502 },
      );
    }

    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "VirtualPrachar send failed." },
      { status: 500 },
    );
  }
}
