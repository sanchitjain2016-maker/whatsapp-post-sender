import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get("src")?.trim();
  const name = url.searchParams.get("name")?.trim();

  if (!sourceUrl || !name) {
    return Response.json({ error: "Image URL and name are required." }, { status: 400 });
  }

  try {
    new URL(sourceUrl);
  } catch {
    return Response.json({ error: "Image URL is not valid." }, { status: 400 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1080px",
          height: "1080px",
          display: "flex",
          position: "relative",
          backgroundColor: "#ffffff",
        }}
      >
        <img
          src={sourceUrl}
          alt=""
          width="1080"
          height="1080"
          style={{
            position: "absolute",
            inset: 0,
            width: "1080px",
            height: "1080px",
            objectFit: "contain",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "116px",
            right: "80px",
            maxWidth: "360px",
            minWidth: "220px",
            display: "flex",
            justifyContent: "center",
            borderRadius: "22px",
            border: "2px solid rgba(2, 50, 120, 0.18)",
            backgroundColor: "rgba(255, 255, 255, 0.86)",
            color: "#05245f",
            fontSize: "42px",
            fontWeight: 800,
            lineHeight: 1.2,
            padding: "18px 26px",
            textAlign: "center",
            wordBreak: "break-word",
            boxShadow: "0 12px 34px rgba(0, 0, 0, 0.12)",
          }}
        >
          {name}
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
    },
  );
}
