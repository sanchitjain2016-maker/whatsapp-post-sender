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
            top: "82px",
            left: "426px",
            width: "300px",
            height: "92px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            wordBreak: "break-word",
            padding: "8px 18px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#d14a87",
              fontSize: "16px",
              fontWeight: 800,
              letterSpacing: "0.4px",
              lineHeight: 1,
              marginBottom: "7px",
              textTransform: "uppercase",
            }}
          >
            Blessings for
          </div>
          <div
            style={{
              display: "flex",
              color: "#143f86",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: "31px",
              fontWeight: 800,
              lineHeight: 1.05,
            }}
          >
            {name}
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
    },
  );
}
