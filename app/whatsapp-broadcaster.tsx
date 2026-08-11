"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type ContactRow = Record<string, string>;

type SendState = {
  status: "ready" | "uploading" | "sending" | "done" | "error";
  index: number;
  total: number;
  log: string[];
};

const defaultTemplate = "Hello {name}, please check this post.";

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function downloadCsv(rows: ContactRow[], nameColumn: string, phoneColumn: string, template: string) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = [["Name", "Phone", "Caption"].map(escape).join(",")];

  rows.forEach((row) => {
    const name = row[nameColumn] ?? "";
    const phone = normalizePhone(row[phoneColumn] ?? "");
    const caption = template.replaceAll("{name}", name);
    lines.push([name, phone, caption].map(escape).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "whatsapp-post-send-list.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function WhatsAppBroadcaster() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [nameColumn, setNameColumn] = useState("");
  const [phoneColumn, setPhoneColumn] = useState("");
  const [template, setTemplate] = useState(defaultTemplate);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [token, setToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("/default-post.png");
  const [imageFileName, setImageFileName] = useState("Screenshot 2026-08-07 122712.png");
  const [sendState, setSendState] = useState<SendState>({
    status: "ready",
    index: 0,
    total: 0,
    log: [],
  });

  const validRows = useMemo(
    () =>
      rows
        .map((row) => ({
          row,
          name: row[nameColumn] ?? "",
          phone: normalizePhone(row[phoneColumn] ?? ""),
        }))
        .filter((item) => item.name && item.phone.length >= 10),
    [nameColumn, phoneColumn, rows],
  );

  const sampleCaption = validRows[0]
    ? template.replaceAll("{name}", validRows[0].name)
    : template.replaceAll("{name}", "Customer Name");

  async function handleExcelUpload(file: File) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<ContactRow>(sheet, { defval: "" });
    const headers = parsed[0] ? Object.keys(parsed[0]) : [];

    setRows(parsed);
    setColumns(headers);
    setNameColumn(headers.find((header) => /name/i.test(header)) ?? headers[0] ?? "");
    setPhoneColumn(
      headers.find((header) => /(phone|mobile|number|whatsapp)/i.test(header)) ??
        headers[1] ??
        headers[0] ??
        "",
    );
    setSendState({ status: "ready", index: 0, total: parsed.length, log: [] });
  }

  async function handleImageUpload(file: File) {
    setImageFileName(file.name);
    setImageDataUrl(await fileToDataUrl(file));
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
  }

  async function uploadMedia() {
    const response = await fetch("/api/whatsapp/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        phoneNumberId,
        imageDataUrl,
        fileName: imageFileName,
      }),
    });
    const result = (await response.json()) as { mediaId?: string; error?: string };
    if (!response.ok || !result.mediaId) {
      throw new Error(result.error ?? "Image upload failed");
    }
    return result.mediaId;
  }

  async function sendAll() {
    if (!token.trim() || !phoneNumberId.trim()) {
      setSendState((current) => ({
        ...current,
        status: "error",
        log: ["Add your WhatsApp token and phone number ID first."],
      }));
      return;
    }

    setSendState({ status: "uploading", index: 0, total: validRows.length, log: ["Uploading image to WhatsApp..."] });

    try {
      const mediaId = await uploadMedia();
      const log = ["Image uploaded. Starting messages..."];
      setSendState({ status: "sending", index: 0, total: validRows.length, log });

      for (let index = 0; index < validRows.length; index += 1) {
        const item = validRows[index];
        const caption = template.replaceAll("{name}", item.name);
        const response = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            phoneNumberId,
            to: item.phone,
            mediaId,
            caption,
          }),
        });
        const result = (await response.json()) as { error?: string };

        if (!response.ok) {
          log.push(`${item.name}: ${result.error ?? "Failed"}`);
        } else {
          log.push(`${item.name}: sent to ${item.phone}`);
        }

        setSendState({
          status: "sending",
          index: index + 1,
          total: validRows.length,
          log: [...log],
        });
      }

      setSendState((current) => ({ ...current, status: "done" }));
    } catch (error) {
      setSendState((current) => ({
        ...current,
        status: "error",
        log: [...current.log, error instanceof Error ? error.message : "Sending failed"],
      }));
    }
  }

  const canSend = validRows.length > 0 && token.trim() && phoneNumberId.trim() && sendState.status !== "sending";

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-[#20201d]">
      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7f5c2d]">WhatsApp sender</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">Personalized post broadcast</h1>
          </div>

          <div className="panel">
            <h2>Settings</h2>
            <label>
              WhatsApp access token
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste token here"
              />
            </label>
            <label>
              Phone number ID
              <input
                value={phoneNumberId}
                onChange={(event) => setPhoneNumberId(event.target.value)}
                placeholder="Meta phone_number_id"
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
            <label className="file-input">
              Post image
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImageUpload(file);
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
            <div className="post-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageDataUrl} alt="Post preview" />
            </div>
            <div className="panel message-panel">
              <h2>Message caption</h2>
              <textarea
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                rows={7}
                placeholder="Use {name} where the Excel name should appear"
              />
              <div className="caption-preview">
                <span>Preview</span>
                <p>{sampleCaption}</p>
              </div>
            </div>
          </div>

          <div className="actions">
            <div>
              <strong>{validRows.length}</strong> ready from <strong>{rows.length}</strong> Excel rows
            </div>
            <button
              type="button"
              onClick={() => downloadCsv(rows, nameColumn, phoneColumn, template)}
              disabled={!rows.length}
            >
              Export CSV
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
                    <th>Caption</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows.slice(0, 8).map((item, index) => (
                    <tr key={`${item.phone}-${index}`}>
                      <td>{item.name}</td>
                      <td>{item.phone}</td>
                      <td>{template.replaceAll("{name}", item.name)}</td>
                    </tr>
                  ))}
                  {!validRows.length ? (
                    <tr>
                      <td colSpan={3}>Upload an Excel sheet with name and WhatsApp number columns.</td>
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
              {sendState.status === "ready"
                ? "Ready"
                : `${sendState.status}: ${sendState.index}/${sendState.total}`}
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
