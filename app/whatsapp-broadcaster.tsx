"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type ContactRow = Record<string, string>;

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
  const [imagePreviewError, setImagePreviewError] = useState("");
  const [imageCheckMessage, setImageCheckMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [scheduleDateTime, setScheduleDateTime] = useState("");
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
  const personalizedPreviewUrl =
    cleanMediaLink && previewRecipient
      ? `/api/media/personalized?src=${encodeURIComponent(cleanMediaLink)}&name=${encodeURIComponent(
          previewRecipient.name,
        )}`
      : "";

  useEffect(() => {
    const saved = window.localStorage.getItem(savedStateKey);
    if (!saved) {
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
      setSendState({ status: "ready", index: 0, total: parsed.rows?.length ?? 0, log: ["Saved settings loaded."] });
    } catch {
      setSaveMessage("Saved settings could not be loaded.");
    }
  }, []);

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
    const nextStatuses = validRows.map((item) => ({
      name: item.name,
      phone: item.phone,
      status: "ready" as const,
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

      if (!response.ok) {
        const providerDetail = result.providerResponse ? ` ${JSON.stringify(result.providerResponse)}` : "";
        const detail = `${result.error ?? "Failed"}${providerDetail}`;
        log.push(`${item.name}: ${detail}`);
        setRecipientStatuses((current) =>
          current.map((entry) =>
            entry.phone === item.phone ? { ...entry, status: "failed", detail } : entry,
          ),
        );
      } else {
        const status = getProviderStatus(result);
        const detail = getProviderMessage(result) || "Accepted by provider";
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
    }

    setSendState((current) => ({ ...current, status: "done" }));
  }

  const canSend =
    sendState.status !== "sending";

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-[#20201d]">
      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7f5c2d]">VirtualPrachar sender</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">Personalized post broadcast</h1>
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
              {personalizedPreviewUrl && !imagePreviewError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={personalizedPreviewUrl}
                  alt="Personalized post preview"
                  onLoad={() => setImagePreviewError("")}
                  onError={() => setImagePreviewError("Preview could not load. Use a direct public image URL.")}
                />
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
