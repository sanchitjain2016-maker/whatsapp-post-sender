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
          alignItems: "flex-end",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          backgroundImage: `url(${sourceUrl})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
          paddingBottom: "94px",
        }}
      >
        <div
          style={{
            maxWidth: "820px",
            minWidth: "360px",
            display: "flex",
            justifyContent: "center",
            borderRadius: "30px",
            backgroundColor: "rgba(17, 17, 17, 0.76)",
            color: "#ffffff",
            fontSize: "54px",
            fontWeight: 800,
            lineHeight: 1.2,
            padding: "26px 42px",
            textAlign: "center",
            wordBreak: "break-word",
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
