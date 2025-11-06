"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FieldType = "text" | "email" | "tel" | "date" | "number" | "textarea";

type Field = {
  id: string;
  label: string;
  type: FieldType;
};

type Entry = Record<string, string>;

const DEFAULT_FIELDS: Field[] = [
  { id: "name", label: "???", type: "text" },
  { id: "email", label: "????", type: "email" },
  { id: "phone", label: "????", type: "tel" },
  { id: "address", label: "???", type: "textarea" },
  { id: "date", label: "?????", type: "date" },
];

const STORAGE_KEYS = {
  fields: "form_fields_v1",
  entries: "form_entries_v1",
};

function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows: Array<Record<string, string>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: string) => {
    const s = v?.replaceAll('"', '""') ?? "";
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

function parseBookmarkletPairs(text: string): Array<{ selector: string; value: string }> {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [sel, ...rest] = line.split(/\s*[=:]\s*/);
      return { selector: sel, value: rest.join(": ") };
    })
    .filter((p) => p.selector);
}

function buildBookmarklet(pairs: Array<{ selector: string; value: string }>): string {
  const code = `(() => {
    const pairs = ${JSON.stringify(
      pairs.map((p) => ({ s: p.selector, v: p.value }))
    )};
    let filled = 0;
    for (const { s, v } of pairs) {
      try {
        const el = document.querySelector(s);
        if (!el) continue;
        const tag = (el.tagName || "").toLowerCase();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          const type = (el.getAttribute('type') || '').toLowerCase();
          if (type === 'checkbox' || type === 'radio') {
            (el as HTMLInputElement).checked = v === 'true' || v === '1' || v.toLowerCase() === 'yes';
          } else {
            el.value = v;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          (el as HTMLElement).textContent = v;
        }
        filled++;
      } catch {}
    }
    if (filled) console.log('Autofilled', filled, 'fields');
    else alert('??? ?? ?????? ???? ???? (No fields matched).');
  })();`;
  return `javascript:${encodeURIComponent(code)}`;
}

export default function Home() {
  const [fields, setFields] = useState<Field[]>(DEFAULT_FIELDS);
  const [entry, setEntry] = useState<Entry>(() => {
    const obj: Entry = {};
    for (const f of DEFAULT_FIELDS) obj[f.id] = "";
    return obj;
  });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [bmText, setBmText] = useState<string>("");
  const bookmarklet = useMemo(() => buildBookmarklet(parseBookmarkletPairs(bmText)), [bmText]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const f = localStorage.getItem(STORAGE_KEYS.fields);
      const e = localStorage.getItem(STORAGE_KEYS.entries);
      if (f) {
        const parsed = JSON.parse(f) as Field[];
        if (Array.isArray(parsed) && parsed.length) setFields(parsed);
      }
      if (e) {
        const parsed = JSON.parse(e) as Entry[];
        if (Array.isArray(parsed)) setEntries(parsed);
      }
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.fields, JSON.stringify(fields));
    } catch {}
  }, [fields]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
    } catch {}
  }, [entries]);

  // Ensure entry has keys for current fields
  useEffect(() => {
    setEntry((prev) => {
      const next: Entry = { ...prev };
      for (const f of fields) if (!(f.id in next)) next[f.id] = "";
      for (const k of Object.keys(next)) if (!fields.find((f) => f.id === k)) delete next[k];
      return next;
    });
  }, [fields]);

  function updateValue(fieldId: string, value: string) {
    setEntry((e) => ({ ...e, [fieldId]: value }));
  }

  function addField() {
    const id = uid("field");
    setFields((fs) => [...fs, { id, label: "??? ??????", type: "text" }]);
  }

  function removeField(id: string) {
    setFields((fs) => fs.filter((f) => f.id !== id));
  }

  function saveEntry() {
    setEntries((list) => [entry, ...list]);
    setEntry(Object.fromEntries(fields.map((f) => [f.id, ""])));
  }

  function exportEntriesCSV() {
    if (!entries.length) return;
    const heads = fields.map((f) => f.label);
    const mapRows = entries.map((en) =>
      Object.fromEntries(fields.map((f) => [f.label, en[f.id] ?? ""]))
    );
    const csv = toCSV(mapRows);
    download("data.csv", csv, "text/csv;charset=utf-8");
  }

  function exportEntriesJSON() {
    download("data.json", JSON.stringify({ fields, entries }, null, 2), "application/json");
  }

  function importJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result || "{}"));
        if (Array.isArray(obj.fields) && Array.isArray(obj.entries)) {
          setFields(obj.fields);
          setEntries(obj.entries);
        } else if (Array.isArray(obj)) {
          setEntries(obj);
        }
      } catch {}
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">??????? ??? ???? ????</h1>
        <p className="mt-1 text-zinc-600">????? ????, ??? ????, ?????????/???????? ???? ?? ??????????? ?? ???? ?? ???? ?? ???-??? ?????</p>

        {/* Form Builder */}
        <section className="mt-8 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-xl font-medium">?????</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <input
                    className="w-1/2 rounded-md border px-2 py-1 text-sm"
                    value={f.label}
                    onChange={(e) =>
                      setFields((fs) => fs.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <select
                    className="rounded-md border px-2 py-1 text-sm"
                    value={f.type}
                    onChange={(e) =>
                      setFields((fs) => fs.map((x) => (x.id === f.id ? { ...x, type: e.target.value as FieldType } : x)))
                    }
                  >
                    <option value="text">???????</option>
                    <option value="email">????</option>
                    <option value="tel">????</option>
                    <option value="date">?????</option>
                    <option value="number">????</option>
                    <option value="textarea">??????? ?????</option>
                  </select>
                </div>
                {f.type === "textarea" ? (
                  <textarea
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    rows={3}
                    placeholder={f.label}
                    value={entry[f.id] || ""}
                    onChange={(e) => updateValue(f.id, e.target.value)}
                  />
                ) : (
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    type={f.type}
                    placeholder={f.label}
                    value={entry[f.id] || ""}
                    onChange={(e) => updateValue(f.id, e.target.value)}
                  />
                )}
                <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>??: {f.id}</span>
                  <button
                    className="rounded bg-red-50 px-2 py-1 text-red-600 hover:bg-red-100"
                    onClick={() => removeField(f.id)}
                  >
                    ?????
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="rounded-md bg-zinc-900 px-4 py-2 text-white hover:bg-black" onClick={saveEntry}>
              ??? ??????
            </button>
            <button className="rounded-md bg-zinc-100 px-4 py-2 hover:bg-zinc-200" onClick={() => setEntry(Object.fromEntries(fields.map((f) => [f.id, ""])))}>
              ???? ????
            </button>
            <button className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700" onClick={addField}>
              ??? ?????? ??????
            </button>
          </div>
        </section>

        {/* Saved Entries */}
        <section className="mt-8 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium">??? ?? ?? ??????</h2>
            <div className="flex gap-2">
              <button
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-black"
                onClick={exportEntriesCSV}
                disabled={!entries.length}
              >
                CSV ?????????
              </button>
              <button
                className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm hover:bg-zinc-200"
                onClick={exportEntriesJSON}
                disabled={!entries.length}
              >
                JSON ?????????
              </button>
              <button
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                onClick={() => fileInputRef.current?.click()}
              >
                JSON ????????
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importJSON(file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          </div>

          {entries.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">??? ??? ?????? ??? ???? ???</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-zinc-100 text-left">
                    {fields.map((f) => (
                      <th key={f.id} className="whitespace-nowrap px-3 py-2 font-medium">
                        {f.label}
                      </th>
                    ))}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((en, idx) => (
                    <tr key={idx} className="border-t">
                      {fields.map((f) => (
                        <td key={f.id} className="whitespace-pre-wrap px-3 py-2 align-top">
                          {en[f.id] || ""}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <button
                          className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                          onClick={() => setEntries((list) => list.filter((_, i) => i !== idx))}
                        >
                          ?????
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Bookmarklet Builder */}
        <section className="mt-8 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-xl font-medium">??????????? ?????? (???-???)</h2>
          <p className="mt-1 text-sm text-zinc-600">
            ?? ???? ?? ?? ???? ?????: <span className="font-mono">???????? = ??????</span> ?? <span className="font-mono">????????: ??????</span>.
            ??????: <span className="font-mono">input[name=email] = user@example.com</span>
          </p>
          <textarea
            className="mt-3 w-full rounded-md border px-3 py-2 font-mono text-sm"
            rows={6}
            value={bmText}
            onChange={(e) => setBmText(e.target.value)}
            placeholder={`input[name=name] = ??? ?????\ninput[name=email] = ram@example.com\n#address = ???? 10, ??????`}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              className="rounded-md bg-amber-600 px-4 py-2 text-white hover:bg-amber-700"
              href={bookmarklet}
            >
              ?? ???? ?? ???????? ??? ??? ??????
            </a>
            <button
              className="rounded-md bg-zinc-100 px-3 py-2 text-sm hover:bg-zinc-200"
              onClick={() => navigator.clipboard.writeText(bookmarklet)}
            >
              ??????????? ???? ????
            </button>
          </div>
        </section>

        <footer className="mt-10 text-center text-xs text-zinc-500">
          ? {new Date().getFullYear()} ???? ???? ???
        </footer>
      </div>
    </div>
  );
}
