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
            top: "94px",
            left: "512px",
            width: "260px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            wordBreak: "break-word",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#e66216",
              fontSize: "18px",
              fontWeight: 800,
              letterSpacing: "0.6px",
              lineHeight: 1,
              marginBottom: "8px",
              textTransform: "uppercase",
              textShadow: "0 1px 4px rgba(255, 255, 255, 0.95)",
            }}
          >
            Blessings for
          </div>
          <div
            style={{
              display: "flex",
              color: "#1d4c94",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: "34px",
              fontWeight: 800,
              lineHeight: 1.05,
              textShadow: "0 1px 5px rgba(255, 255, 255, 0.95)",
            }}
          >
            {name}
          </div>
          <div
            style={{
              width: "174px",
              height: "3px",
              display: "flex",
              marginTop: "9px",
              borderRadius: "999px",
              background: "linear-gradient(90deg, #ec6c16, #d91b88, #0753a3)",
            }}
          />
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
    },
  );
}
