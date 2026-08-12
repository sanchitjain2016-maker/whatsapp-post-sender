"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type ContactRow = Record<string, string>;

type DetectedTextBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
};

type SendState = {
  status: "ready" | "sending" | "done" | "error";
  index: number;
  total: number;
  log: string[];
};

type RecipientStatus = {
  phone: string;
  name: string;
  status: "ready" | "in process" | "sent" | "delivered" | "failed";
  detail: string;
};

type ScheduledPostRecord = {
  id: string;
  createdAt: string;
  campaignName: string;
  scheduleDateTime: string;
  mediaLink: string;
  messageText: string;
  recipients: RecipientStatus[];
};

const defaultTemplateId = "2118674012004505";
const savedStateKey = "virtualprachar-post-sender-settings";

type SavedState = {
  rows?: ContactRow[];
  columns?: string[];
  nameColumn?: string;
  phoneColumn?: string;
  apiKey?: string;
  templateId?: string;
  campaignName?: string;
  mediaLink?: string;
  messageText?: string;
  scheduleDateTime?: string;
  scheduledPosts?: ScheduledPostRecord[];
};

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

function getProviderMessage(result: unknown) {
  if (!result || typeof result !== "object") {
    return "";
  }

  const payload = result as Record<string, unknown>;
  const nested = payload.result && typeof payload.result === "object" ? (payload.result as Record<string, unknown>) : payload;
  const value = nested.message ?? nested.status ?? nested.error ?? nested.id ?? nested.request_id;
  return typeof value === "string" ? value : JSON.stringify(nested);
}

function getProviderStatus(result: unknown): RecipientStatus["status"] {
  const text = getProviderMessage(result).toLowerCase();

  if (text.includes("deliver")) {
    return "delivered";
  }

  if (text.includes("fail") || text.includes("error") || text.includes("reject")) {
    return "failed";
  }

  return "sent";
}

function isCanvasPixelDark(data: Uint8ClampedArray, index: number) {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  return red < 55 && green < 55 && blue < 55;
}

function detectCanvasTextBox(data: Uint8ClampedArray, width: number, height: number): DetectedTextBox {
  const visited = new Uint8Array(width * height);
  const candidates: DetectedTextBox[] = [];
  const queue = new Int32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || !isCanvasPixelDark(data, start * 4)) {
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
          if (next < 0 || visited[next] || !isCanvasPixelDark(data, next * 4)) {
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

function drawPersonalizedText(context: CanvasRenderingContext2D, name: string, box: DetectedTextBox) {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const labelFont = Math.max(10, Math.min(18, Math.floor(box.height * 0.18)));
  const nameFont = Math.max(18, Math.min(34, Math.floor(box.height * 0.34)));

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `800 ${labelFont}px Arial, Helvetica, sans-serif`;
  context.fillStyle = "#d14a87";
  context.fillText("BLESSINGS FOR", centerX, centerY - nameFont * 0.45);
  context.font = `800 ${nameFont}px Arial, Helvetica, sans-serif`;
  context.fillStyle = "#143f86";
  context.fillText(name, centerX, centerY + nameFont * 0.55, box.width * 0.86);
}

function downloadCsv(
  rows: ContactRow[],
  nameColumn: string,
  phoneColumn: string,
  messageText: string,
) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = [["Name", "Phone", "Message"].map(escape).join(",")];

  rows.forEach((row) => {
    const name = row[nameColumn] ?? "";
    const phone = normalizePhone(row[phoneColumn] ?? "");
    const message = messageText.replaceAll("{name}", name);
    lines.push([name, phone, message].map(escape).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "virtualprachar-send-list.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function WhatsAppBroadcaster() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [hasLoadedSavedState, setHasLoadedSavedState] = useState(false);
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [nameColumn, setNameColumn] = useState("");
  const [phoneColumn, setPhoneColumn] = useState("");
  const [messageText, setMessageText] = useState("Hello {name}, please check this post.");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [campaignName, setCampaignName] = useState("personalized-post-campaign");
  const [mediaLink, setMediaLink] = useState("");
  const [clientPreviewUrl, setClientPreviewUrl] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [imagePreviewError, setImagePreviewError] = useState("");
  const [imageCheckMessage, setImageCheckMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPostRecord[]>([]);
  const [recipientStatuses, setRecipientStatuses] = useState<RecipientStatus[]>([]);
  const [sendState, setSendState] = useState<SendState>({
    status: "ready",
    index: 0,
    total: 0,
    log: [],
  });

  const validRows = useMemo(
    () =>
      rows
        .map((row) => {
          const name = row[nameColumn] ?? "";
          const phone = normalizePhone(row[phoneColumn] ?? "");
          return {
            row,
            name,
            phone,
            message: messageText.replaceAll("{name}", name),
          };
        })
        .filter((item) => item.name && item.phone.length >= 10),
    [messageText, nameColumn, phoneColumn, rows],
  );

  const previewRecipient = validRows[0];
  const cleanMediaLink = mediaLink.trim();
  const previewName = previewRecipient?.name ?? "";
  const proxiedMediaLink = cleanMediaLink ? `/api/media/source?src=${encodeURIComponent(cleanMediaLink)}` : "";
  const shouldShowSourcePreview = cleanMediaLink && !clientPreviewUrl;

  useEffect(() => {
    setIsAuthenticated(window.localStorage.getItem("whatsapp-sender-auth") === "true");
    const saved = window.localStorage.getItem(savedStateKey);
    if (!saved) {
      setHasLoadedSavedState(true);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as SavedState;
      setRows(parsed.rows ?? []);
      setColumns(parsed.columns ?? []);
      setNameColumn(parsed.nameColumn ?? "");
      setPhoneColumn(parsed.phoneColumn ?? "");
      setApiKey(parsed.apiKey ?? "");
      setTemplateId(parsed.templateId ?? defaultTemplateId);
      setCampaignName(parsed.campaignName ?? "personalized-post-campaign");
      setMediaLink(parsed.mediaLink ?? "");
      setMessageText(parsed.messageText ?? "Hello {name}, please check this post.");
      setScheduleDateTime(parsed.scheduleDateTime ?? "");
      setScheduledPosts(parsed.scheduledPosts ?? []);
      setSendState({ status: "ready", index: 0, total: parsed.rows?.length ?? 0, log: ["Saved settings loaded."] });
    } catch {
      setSaveMessage("Saved settings could not be loaded.");
    } finally {
      setHasLoadedSavedState(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedSavedState) {
      return;
    }

    const payload: SavedState = {
      rows,
      columns,
      nameColumn,
      phoneColumn,
      apiKey,
      templateId,
      campaignName,
      mediaLink,
      messageText,
      scheduleDateTime,
      scheduledPosts,
    };

    window.localStorage.setItem(savedStateKey, JSON.stringify(payload));
  }, [
    apiKey,
    campaignName,
    columns,
    hasLoadedSavedState,
    mediaLink,
    messageText,
    nameColumn,
    phoneColumn,
    rows,
    scheduleDateTime,
    scheduledPosts,
    templateId,
  ]);

  useEffect(() => {
    setClientPreviewUrl("");
    setImagePreviewError("");
    setIsPreviewLoading(false);

    if (!cleanMediaLink || !previewName) {
      return;
    }

    let isActive = true;
    const image = new Image();
    image.crossOrigin = "anonymous";
    setIsPreviewLoading(true);

    image.onload = () => {
      try {
        const canvasSize = 1080;
        const canvas = document.createElement("canvas");
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Preview canvas could not be started.");
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvasSize, canvasSize);

        const scale = Math.min(canvasSize / image.naturalWidth, canvasSize / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;
        const drawX = (canvasSize - drawWidth) / 2;
        const drawY = (canvasSize - drawHeight) / 2;
        context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

        const pixels = context.getImageData(0, 0, canvasSize, canvasSize).data;
        const box = detectCanvasTextBox(pixels, canvasSize, canvasSize);
        drawPersonalizedText(context, previewName, box);

        if (isActive) {
          setClientPreviewUrl(canvas.toDataURL("image/png"));
          setIsPreviewLoading(false);
        }
      } catch {
        if (isActive) {
          setImagePreviewError("Personalized preview could not be created in the browser.");
          setIsPreviewLoading(false);
        }
      }
    };

    image.onerror = () => {
      if (isActive) {
        setImagePreviewError("Direct image URL could not load in the browser.");
        setIsPreviewLoading(false);
      }
    };

    image.src = proxiedMediaLink;

    return () => {
      isActive = false;
    };
  }, [cleanMediaLink, previewName, proxiedMediaLink]);

  function saveSettings() {
    const payload: SavedState = {
      rows,
      columns,
      nameColumn,
      phoneColumn,
      apiKey,
      templateId,
      campaignName,
      mediaLink,
      messageText,
      scheduleDateTime,
      scheduledPosts,
    };

    window.localStorage.setItem(savedStateKey, JSON.stringify(payload));
    setSaveMessage("Settings saved on this browser.");
  }

  async function checkImageUrl() {
    setImageCheckMessage("Checking image URL...");
    const response = await fetch("/api/media/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaLink: cleanMediaLink }),
    });
    const result = (await response.json()) as {
      ok?: boolean;
      error?: string;
      contentType?: string;
    };

    if (!response.ok || !result.ok) {
      setImageCheckMessage(result.error ?? "Image URL check failed.");
      return;
    }

    setImageCheckMessage(`Image URL is valid (${result.contentType}).`);
  }

  async function handleExcelUpload(file: File) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<ContactRow>(sheet, { defval: "" });
    const headers = parsed[0] ? Object.keys(parsed[0]) : [];
    const nextNameColumn = headers.find((header) => /name/i.test(header)) ?? headers[0] ?? "";
    const nextPhoneColumn =
      headers.find((header) => /(phone|mobile|number|whatsapp)/i.test(header)) ?? headers[1] ?? headers[0] ?? "";

    setRows(parsed);
    setColumns(headers);
    setNameColumn(nextNameColumn);
    setPhoneColumn(nextPhoneColumn);
    setSendState({ status: "ready", index: 0, total: parsed.length, log: [] });
    setRecipientStatuses([]);
  }

  function addManualRecipient() {
    const name = manualName.trim();
    const phone = normalizePhone(manualPhone);

    if (!name || phone.length < 10) {
      setSendState((current) => ({
        ...current,
        status: "error",
        log: ["Enter a valid name and WhatsApp number."],
      }));
      return;
    }

    const nextNameColumn = nameColumn || "ManualName";
    const nextPhoneColumn = phoneColumn || "ManualNumber";
    const manualRow = { [nextNameColumn]: name, [nextPhoneColumn]: phone };
    const nextRows = [...rows, manualRow];
    const nextColumns = Array.from(new Set([...columns, nextNameColumn, nextPhoneColumn]));

    setRows(nextRows);
    setColumns(nextColumns);
    setNameColumn(nextNameColumn);
    setPhoneColumn(nextPhoneColumn);
    setManualName("");
    setManualPhone("");
    setSendState({ status: "ready", index: 0, total: nextRows.length, log: [`Added ${name}.`] });
    setRecipientStatuses((current) => [
      ...current,
      { name, phone, status: "ready", detail: "Ready to send" },
    ]);
  }

  function deleteContact(indexToDelete: number) {
    const rowToDelete = validRows[indexToDelete];
    const nextRows = rows.filter((row) => row !== rowToDelete?.row);

    setRows(nextRows);
    setRecipientStatuses((current) =>
      current.filter((entry) => entry.phone !== rowToDelete?.phone),
    );
    setSendState({
      status: "ready",
      index: 0,
      total: nextRows.length,
      log: rowToDelete ? [`Removed ${rowToDelete.name}.`] : [],
    });
  }

  function clearContacts() {
    setRows([]);
    setRecipientStatuses([]);
    setSendState({ status: "ready", index: 0, total: 0, log: ["All contacts removed."] });
  }

  async function sendAll() {
    if (!apiKey.trim() || !templateId.trim() || !cleanMediaLink) {
      setSendState((current) => ({
        ...current,
        status: "error",
        log: ["Add API key, template ID, and image URL first."],
      }));
      return;
    }

    if (!validRows.length) {
      setSendState((current) => ({
        ...current,
        status: "error",
        log: ["Add at least one valid name and WhatsApp number."],
      }));
      return;
    }

    const rowsWithMissingMessage = validRows.filter((item) => !item.message.trim());
    if (rowsWithMissingMessage.length) {
      setSendState((current) => ({
        ...current,
        status: "error",
        log: ["Custom message cannot be empty."],
      }));
      return;
    }

    setImageCheckMessage("Checking image URL before send...");
    const mediaCheckResponse = await fetch("/api/media/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaLink: cleanMediaLink }),
    });
    const mediaCheckResult = (await mediaCheckResponse.json()) as { ok?: boolean; error?: string };

    if (!mediaCheckResponse.ok || !mediaCheckResult.ok) {
      setImageCheckMessage(mediaCheckResult.error ?? "Image URL check failed.");
      setSendState((current) => ({
        ...current,
        status: "error",
        log: [mediaCheckResult.error ?? "Image URL check failed."],
      }));
      return;
    }

    setImageCheckMessage("Image URL is valid.");

    const log = ["Starting VirtualPrachar template messages..."];
    const nextStatuses: RecipientStatus[] = validRows.map((item) => ({
      name: item.name,
      phone: item.phone,
      status: "ready",
      detail: "Waiting",
    }));
    setRecipientStatuses(nextStatuses);
    setSendState({ status: "sending", index: 0, total: validRows.length, log });

    for (let index = 0; index < validRows.length; index += 1) {
      const item = validRows[index];
      const personalizedImageUrl = new URL(
        `/api/media/personalized?src=${encodeURIComponent(cleanMediaLink)}&name=${encodeURIComponent(item.name)}`,
        window.location.origin,
      ).toString();
      setRecipientStatuses((current) =>
        current.map((entry) =>
          entry.phone === item.phone ? { ...entry, status: "in process", detail: "Sending request..." } : entry,
        ),
      );
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          templateId,
          to: item.phone,
          mediaLink: personalizedImageUrl,
          bodyParam1: item.name,
          bodyParam2: item.message,
          campaignName,
          scheduleDateTime,
        }),
      });
      const result = (await response.json()) as { error?: string; result?: unknown; providerResponse?: unknown };
      let finalStatus: RecipientStatus["status"];
      let finalDetail: string;

      if (!response.ok) {
        const providerDetail = result.providerResponse ? ` ${JSON.stringify(result.providerResponse)}` : "";
        const detail = `${result.error ?? "Failed"}${providerDetail}`;
        finalStatus = "failed";
        finalDetail = detail;
        log.push(`${item.name}: ${detail}`);
        setRecipientStatuses((current) =>
          current.map((entry) =>
            entry.phone === item.phone ? { ...entry, status: "failed", detail } : entry,
          ),
        );
      } else {
        const status = getProviderStatus(result);
        const detail = getProviderMessage(result) || "Accepted by provider";
        finalStatus = status;
        finalDetail = detail;
        log.push(`${item.name}: ${status === "sent" ? "accepted by provider" : status} to ${item.phone}`);
        setRecipientStatuses((current) =>
          current.map((entry) =>
            entry.phone === item.phone ? { ...entry, status, detail } : entry,
          ),
        );
      }

      setSendState({
        status: "sending",
        index: index + 1,
        total: validRows.length,
        log: [...log],
      });

      nextStatuses[index] = {
        name: item.name,
        phone: item.phone,
        status: finalStatus,
        detail: finalDetail,
      };
    }

    const completedRecord: ScheduledPostRecord = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      campaignName,
      scheduleDateTime: scheduleDateTime || "Send now",
      mediaLink: cleanMediaLink,
      messageText,
      recipients: nextStatuses,
    };
    setScheduledPosts((current) => [completedRecord, ...current].slice(0, 20));
    setSendState((current) => ({ ...current, status: "done" }));
  }

  function clearScheduledPosts() {
    setScheduledPosts([]);
    setSendState((current) => ({ ...current, log: ["Scheduled post history cleared."] }));
  }

  const canSend =
    sendState.status !== "sending";

  function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loginUsername.trim() === "admin" && loginPassword === "sanchit074") {
      window.localStorage.setItem("whatsapp-sender-auth", "true");
      setIsAuthenticated(true);
      setLoginError("");
      return;
    }

    setLoginError("Invalid username or password.");
  }

  function logout() {
    window.localStorage.removeItem("whatsapp-sender-auth");
    setIsAuthenticated(false);
    setLoginPassword("");
  }

  if (!isAuthenticated) {
    return (
      <main className="login-page">
        <form className="login-panel" onSubmit={handleLogin}>
          <div>
            <p className="login-kicker">Secure access</p>
            <h1>WhatsApp Post Sender</h1>
          </div>
          <label>
            Username
            <input
              value={loginUsername}
              onChange={(event) => setLoginUsername(event.target.value)}
              autoComplete="username"
              placeholder="Username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Password"
            />
          </label>
          {loginError ? <p className="login-error">{loginError}</p> : null}
          <button type="submit" className="primary wide-button">
            Login
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-[#20201d]">
      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7f5c2d]">VirtualPrachar sender</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">Personalized post broadcast</h1>
            <button type="button" className="logout-button" onClick={logout}>
              Logout
            </button>
          </div>

          <div className="panel">
            <h2>Settings</h2>
            <label>
              VirtualPrachar API key
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste API key"
              />
            </label>
            <label>
              Template ID
              <input value={templateId} onChange={(event) => setTemplateId(event.target.value)} />
            </label>
            <label>
              Campaign name
              <input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} />
            </label>
            <button type="button" className="wide-button" onClick={saveSettings}>
              Save settings
            </button>
            {saveMessage ? <p className="helper-text">{saveMessage}</p> : null}
          </div>

          <div className="panel">
            <h2>Image and schedule</h2>
            <label>
              Image URL for post background
              <input
                value={mediaLink}
                onChange={(event) => {
                  setMediaLink(event.target.value);
                  setImagePreviewError("");
                  setImageCheckMessage("");
                }}
                placeholder="https://..."
              />
            </label>
            <button type="button" className="wide-button" onClick={() => void checkImageUrl()}>
              Check image URL
            </button>
            {imageCheckMessage ? <p className="helper-text">{imageCheckMessage}</p> : null}
            <label>
              Schedule date time
              <input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(event) => setScheduleDateTime(event.target.value)}
              />
            </label>
          </div>

          <div className="panel">
            <h2>Files</h2>
            <label className="file-input">
              Excel contacts
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleExcelUpload(file);
                }}
              />
            </label>
          </div>

          <div className="panel">
            <h2>Excel columns</h2>
            <label>
              Name column
              <select value={nameColumn} onChange={(event) => setNameColumn(event.target.value)}>
                {columns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
            <label>
              WhatsApp number column
              <select value={phoneColumn} onChange={(event) => setPhoneColumn(event.target.value)}>
                {columns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="panel">
            <h2>Add manually</h2>
            <label>
              Name
              <input
                value={manualName}
                onChange={(event) => setManualName(event.target.value)}
                placeholder="Recipient name"
              />
            </label>
            <label>
              WhatsApp number
              <input
                value={manualPhone}
                onChange={(event) => setManualPhone(event.target.value)}
                placeholder="Country code + number"
              />
            </label>
            <button type="button" className="wide-button" onClick={addManualRecipient}>
              Add recipient
            </button>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="preview-grid">
            <div className="post-preview empty-preview">
              {clientPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={clientPreviewUrl}
                  alt="Personalized post preview"
                />
              ) : shouldShowSourcePreview ? (
                <div className="source-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proxiedMediaLink || cleanMediaLink}
                    alt="Post background preview"
                    onError={() => setImagePreviewError("Direct image URL could not load in the browser.")}
                  />
                  {isPreviewLoading ? <span className="preview-loading-note">Preparing preview...</span> : null}
                </div>
              ) : imagePreviewError ? (
                <div className="preview-message">
                  <strong>Image preview unavailable</strong>
                  <span>{imagePreviewError}</span>
                  <a href={cleanMediaLink} target="_blank" rel="noreferrer">
                    Open image link
                  </a>
                </div>
              ) : (
                <span>Image URL preview</span>
              )}
            </div>
            <div className="panel message-panel">
              <h2>Custom message</h2>
              <label>
                Message text
                <textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Write the full message. Use {name} where the recipient name should appear."
                />
              </label>
              <div className="payload-preview">
                <span>Recipient</span>
                <p>{previewRecipient?.phone ?? "No recipient selected"}</p>
              </div>
              <div className="payload-preview">
                <span>Message preview</span>
                <p>{previewRecipient?.message || messageText.replaceAll("{name}", "Customer Name")}</p>
              </div>
            </div>
          </div>

          <div className="actions">
            <div>
              <strong>{validRows.length}</strong> ready from <strong>{rows.length}</strong> recipients
            </div>
            <button
              type="button"
              onClick={() =>
                downloadCsv(rows, nameColumn, phoneColumn, messageText)
              }
              disabled={!rows.length}
            >
              Export CSV
            </button>
            <button type="button" onClick={clearContacts} disabled={!rows.length || sendState.status === "sending"}>
              Clear contacts
            </button>
            <button type="button" className="primary" onClick={() => void sendAll()} disabled={!canSend}>
              Send on WhatsApp
            </button>
          </div>

          <div className="panel">
            <h2>Recipients</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Number</th>
                    <th>Message</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows.slice(0, 8).map((item, index) => (
                    <tr key={`${item.phone}-${index}`}>
                      <td>{item.name}</td>
                      <td>{item.phone}</td>
                      <td>{item.message}</td>
                      <td>
                        <button
                          type="button"
                          className="small-button danger-button"
                          onClick={() => deleteContact(index)}
                          disabled={sendState.status === "sending"}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!validRows.length ? (
                    <tr>
                      <td colSpan={4}>Upload Excel contacts or add a recipient manually.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h2>Message status</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Number</th>
                    <th>Status</th>
                    <th>Provider response</th>
                  </tr>
                </thead>
                <tbody>
                  {(recipientStatuses.length
                    ? recipientStatuses
                    : validRows.map((item) => ({
                        name: item.name,
                        phone: item.phone,
                        status: "ready" as const,
                        detail: "Ready to send",
                      }))
                  ).map((item, index) => (
                    <tr key={`${item.phone}-${item.status}-${index}`}>
                      <td>{item.name}</td>
                      <td>{item.phone}</td>
                      <td>
                        <span className={`status-badge status-${item.status.replace(" ", "-")}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>{item.detail}</td>
                    </tr>
                  ))}
                  {!validRows.length && !recipientStatuses.length ? (
                    <tr>
                      <td colSpan={4}>Statuses will appear here while sending.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading-row">
              <h2>Scheduled post history</h2>
              <button
                type="button"
                className="small-button"
                onClick={clearScheduledPosts}
                disabled={!scheduledPosts.length || sendState.status === "sending"}
              >
                Clear history
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Schedule</th>
                    <th>Recipients</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledPosts.map((post) => (
                    <tr key={post.id}>
                      <td>{post.campaignName}</td>
                      <td>{post.scheduleDateTime}</td>
                      <td>{post.recipients.length}</td>
                      <td>{post.messageText}</td>
                    </tr>
                  ))}
                  {!scheduledPosts.length ? (
                    <tr>
                      <td colSpan={4}>Scheduled sends will be saved here after you send.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h2>Sending progress</h2>
            <div className="progress-track">
              <div
                className="progress-bar"
                style={{ width: `${sendState.total ? (sendState.index / sendState.total) * 100 : 0}%` }}
              />
            </div>
            <p className="status-line">
              {sendState.status === "ready" ? "Ready" : `${sendState.status}: ${sendState.index}/${sendState.total}`}
            </p>
            <div className="log">
              {sendState.log.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
