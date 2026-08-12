import sharp from "sharp";

const canvasSize = 1080;
const imageRequestHeaders = {
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isDark(data: Buffer, index: number) {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  return red < 55 && green < 55 && blue < 55;
}

function detectTextBox(data: Buffer, width: number, height: number): Box {
  const visited = new Uint8Array(width * height);
  const candidates: Box[] = [];
  const queue = new Int32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || !isDark(data, start * 3)) {
        continue;
      }

      let head = 0;
      let tail = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;

      visited[start] = 1;
      queue[tail] = start;
      tail += 1;

      while (head < tail) {
        const current = queue[head];
        head += 1;
        count += 1;

        const currentX = current % width;
        const currentY = Math.floor(current / width);
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);

        const neighbors = [
          currentX > 0 ? current - 1 : -1,
          currentX < width - 1 ? current + 1 : -1,
          currentY > 0 ? current - width : -1,
          currentY < height - 1 ? current + width : -1,
        ];

        for (const next of neighbors) {
          if (next < 0 || visited[next] || !isDark(data, next * 3)) {
            continue;
          }
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const area = boxWidth * boxHeight;
      const density = count / area;
      const aspect = boxWidth / boxHeight;

      if (
        boxWidth >= 120 &&
        boxWidth <= 460 &&
        boxHeight >= 42 &&
        boxHeight <= 170 &&
        aspect >= 1.8 &&
        aspect <= 6 &&
        density >= 0.025 &&
        density <= 0.35
      ) {
        const centerBonus = 1 - Math.abs(minX + boxWidth / 2 - width / 2) / width;
        const outlineScore = boxWidth * boxHeight * (1 - density) * (1 + centerBonus);
        candidates.push({
          x: minX,
          y: minY,
          width: boxWidth,
          height: boxHeight,
          score: outlineScore,
        });
      }
    }
  }

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  return best ?? { x: 145, y: 882, width: 220, height: 76, score: 0 };
}

function buildOverlay(name: string, box: Box) {
  const safeName = escapeXml(name);
  const labelFont = Math.max(10, Math.min(18, Math.floor(box.height * 0.18)));
  const nameFont = Math.max(18, Math.min(34, Math.floor(box.height * 0.34)));
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const labelY = centerY - nameFont * 0.45;
  const nameY = centerY + nameFont * 0.55;

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">
  <text x="${centerX}" y="${labelY}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${labelFont}" font-weight="800"
    fill="#d14a87" letter-spacing="0.4" text-transform="uppercase">BLESSINGS FOR</text>
  <text x="${centerX}" y="${nameY}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${nameFont}" font-weight="800"
    fill="#143f86">${safeName}</text>
</svg>`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get("src")?.trim();
  const name = url.searchParams.get("name")?.trim();

  if (!sourceUrl || !name) {
    return Response.json({ error: "Image URL and name are required." }, { status: 400 });
  }

  try {
    new URL(sourceUrl);
    const imageResponse = await fetch(sourceUrl, { headers: imageRequestHeaders });
    if (!imageResponse.ok) {
      return Response.json(
        { error: `Source image could not be loaded. Status ${imageResponse.status}.` },
        { status: 400 },
      );
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const base = sharp(imageBuffer)
      .resize(canvasSize, canvasSize, {
        fit: "contain",
        background: "#ffffff",
      })
      .png();
    const { data, info } = await base.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const box = detectTextBox(data, info.width, info.height);
    const output = await base
      .composite([{ input: buildOverlay(name, box), left: 0, top: 0 }])
      .png()
      .toBuffer();

    return new Response(output, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Personalized image could not be generated." },
      { status: 500 },
    );
  }
}
