type SendPayload = {
  token?: string;
  phoneNumberId?: string;
  to?: string;
  mediaId?: string;
  caption?: string;
};

const graphVersion = "v26.0";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SendPayload;
    const token = payload.token?.trim();
    const phoneNumberId = payload.phoneNumberId?.trim();
    const to = payload.to?.replace(/[^\d]/g, "");
    const mediaId = payload.mediaId?.trim();
    const caption = payload.caption?.trim() ?? "";

    if (!token || !phoneNumberId || !to || !mediaId) {
      return Response.json(
        { error: "Token, phone number ID, recipient number, and media ID are required." },
        { status: 400 },
      );
    }

    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "image",
        image: {
          id: mediaId,
          caption,
        },
      }),
    });

    const result = (await response.json()) as { messages?: Array<{ id: string }>; error?: { message?: string } };

    if (!response.ok) {
      return Response.json(
        { error: result.error?.message ?? "WhatsApp send failed." },
        { status: response.status || 502 },
      );
    }

    return Response.json({ messageId: result.messages?.[0]?.id ?? null });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "WhatsApp send failed." },
      { status: 500 },
    );
  }
}
