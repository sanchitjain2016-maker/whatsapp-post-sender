"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type ContactRow = Record<string, string>;

type SendState = {
  status: "ready" | "sending" | "done" | "error";
  index: number;
  total: number;
  log: string[];
};

const defaultTemplateId = "2118674012004505";

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

function resolveValue(row: ContactRow, column: string, fallback: string) {
  return column ? row[column] ?? "" : fallback;
}

function downloadCsv(
  rows: ContactRow[],
  nameColumn: string,
  phoneColumn: string,
  bodyParam1Column: string,
  bodyParam2Column: string,
  bodyParam2Text: string,
) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = [["Name", "Phone", "Body Param 1", "Body Param 2"].map(escape).join(",")];

  rows.forEach((row) => {
    const name = row[nameColumn] ?? "";
    const phone = normalizePhone(row[phoneColumn] ?? "");
    const bodyParam1 = resolveValue(row, bodyParam1Column, name);
    const bodyParam2 = resolveValue(row, bodyParam2Column, bodyParam2Text);
    lines.push([name, phone, bodyParam1, bodyParam2].map(escape).join(","));
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
  const [bodyParam1Column, setBodyParam1Column] = useState("");
  const [bodyParam2Column, setBodyParam2Column] = useState("");
  const [bodyParam2Text, setBodyParam2Text] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [campaignName, setCampaignName] = useState("personalized-post-campaign");
  const [mediaLink, setMediaLink] = useState("");
  const [scheduleDateTime, setScheduleDateTime] = useState("");
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
            bodyParam1: resolveValue(row, bodyParam1Column, name),
            bodyParam2: resolveValue(row, bodyParam2Column, bodyParam2Text),
          };
        })
        .filter((item) => item.name && item.phone.length >= 10),
    [bodyParam1Column, bodyParam2Column, bodyParam2Text, nameColumn, phoneColumn, rows],
  );

  const previewRecipient = validRows[0];

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
    setBodyParam1Column(nextNameColumn);
    setSendState({ status: "ready", index: 0, total: parsed.length, log: [] });
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
    setBodyParam1Column(bodyParam1Column || nextNameColumn);
    setManualName("");
    setManualPhone("");
    setSendState({ status: "ready", index: 0, total: nextRows.length, log: [`Added ${name}.`] });
  }

  async function sendAll() {
    if (!apiKey.trim() || !templateId.trim() || !mediaLink.trim()) {
      setSendState((current) => ({
        ...current,
        status: "error",
        log: ["Add API key, template ID, and image URL first."],
      }));
      return;
    }

    const log = ["Starting VirtualPrachar template messages..."];
    setSendState({ status: "sending", index: 0, total: validRows.length, log });

    for (let index = 0; index < validRows.length; index += 1) {
      const item = validRows[index];
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          templateId,
          to: item.phone,
          mediaLink,
          bodyParam1: item.bodyParam1,
          bodyParam2: item.bodyParam2,
          campaignName,
          scheduleDateTime,
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
  }

  const canSend =
    validRows.length > 0 &&
    Boolean(apiKey.trim()) &&
    Boolean(templateId.trim()) &&
    Boolean(mediaLink.trim()) &&
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
          </div>

          <div className="panel">
            <h2>Image and schedule</h2>
            <label>
              Image URL
              <input
                value={mediaLink}
                onChange={(event) => setMediaLink(event.target.value)}
                placeholder="https://..."
              />
            </label>
            <label>
              Schedule date time
              <input
                value={scheduleDateTime}
                onChange={(event) => setScheduleDateTime(event.target.value)}
                placeholder="Optional"
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
            <label>
              Body param 1
              <select value={bodyParam1Column} onChange={(event) => setBodyParam1Column(event.target.value)}>
                <option value="">Use recipient name</option>
                {columns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Body param 2 column
              <select value={bodyParam2Column} onChange={(event) => setBodyParam2Column(event.target.value)}>
                <option value="">Use fixed text</option>
                {columns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Body param 2 text
              <input value={bodyParam2Text} onChange={(event) => setBodyParam2Text(event.target.value)} />
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
              {mediaLink ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaLink} alt="Post preview" />
              ) : (
                <span>Image URL preview</span>
              )}
            </div>
            <div className="panel message-panel">
              <h2>Template payload</h2>
              <div className="payload-preview">
                <span>Recipient</span>
                <p>{previewRecipient?.phone ?? "No recipient selected"}</p>
              </div>
              <div className="payload-preview">
                <span>Body param 1</span>
                <p>{previewRecipient?.bodyParam1 || "Recipient name"}</p>
              </div>
              <div className="payload-preview">
                <span>Body param 2</span>
                <p>{previewRecipient?.bodyParam2 || "Fixed text or selected column"}</p>
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
                downloadCsv(rows, nameColumn, phoneColumn, bodyParam1Column, bodyParam2Column, bodyParam2Text)
              }
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
                    <th>Body param 1</th>
                    <th>Body param 2</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows.slice(0, 8).map((item, index) => (
                    <tr key={`${item.phone}-${index}`}>
                      <td>{item.name}</td>
                      <td>{item.phone}</td>
                      <td>{item.bodyParam1}</td>
                      <td>{item.bodyParam2}</td>
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
