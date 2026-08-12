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
            top: "136px",
            right: "96px",
            maxWidth: "330px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            color: "#05245f",
            fontSize: "34px",
            fontWeight: 800,
            letterSpacing: "1px",
            lineHeight: 1.1,
            textAlign: "center",
            wordBreak: "break-word",
            textShadow: "0 2px 6px rgba(255, 255, 255, 0.9)",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#e66216",
              fontSize: "20px",
              fontWeight: 700,
              marginBottom: "6px",
              textTransform: "uppercase",
            }}
          >
            Blessings for
          </div>
          <div style={{ display: "flex" }}>{name}</div>
          <div
            style={{
              width: "160px",
              height: "4px",
              display: "flex",
              marginTop: "10px",
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
