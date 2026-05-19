import { useEffect, useState } from "react";
import { Button } from "@ci/shadcn";
import type { LogEntry, LogLevel } from "@/lib/log";

interface DiagnosticsProps {
  onBack: () => void;
}

const LEVELS: ReadonlyArray<LogLevel | "all"> = [
  "all",
  "debug",
  "info",
  "warn",
  "error",
];

export default function Diagnostics({ onBack }: DiagnosticsProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Esc returns to the main popup.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onBack();
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [onBack]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const data = await browser.storage.local.get([
        "logRing",
        "pendingCaptures",
      ]);
      if (cancelled) {
        return;
      }

      const ring = (data.logRing as LogEntry[] | undefined) ?? [];
      setEntries(ring.slice().reverse());
      const pending = (data.pendingCaptures as unknown[] | undefined) ?? [];
      setPendingCount(pending.length);
    };

    void refresh();
    const interval = setInterval(refresh, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const filtered =
    filter === "all" ? entries : entries.filter((e) => e.level === filter);

  const copyAsJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(filtered, null, 2));
    } catch {
      // Clipboard write failed (permission denied etc.) — fall back below.
      const textarea = document.createElement("textarea");
      textarea.value = JSON.stringify(filtered, null, 2);
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  };

  const clearLogs = async () => {
    await browser.storage.local.remove("logRing");
    setEntries([]);
  };

  const clearPending = async () => {
    await browser.storage.local.remove("pendingCaptures");
    setPendingCount(0);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label="Back"
          title="Back (Esc)"
          className="text-[#888] text-lg leading-none px-2"
        >
          ←
        </button>
        <h2 className="text-[#4ba7a6] text-base font-semibold m-0">
          Diagnostics
        </h2>
      </div>

      <div className="text-[0.85em] text-[#888] flex flex-wrap gap-x-4 gap-y-1">
        <span>
          Logs: <strong className="text-[#4ba7a6]">{entries.length}</strong>
        </span>
        <span>
          Pending captures:{" "}
          <strong className="text-[#4ba7a6]">{pendingCount}</strong>
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <label htmlFor="diag-level" className="text-[0.85em] text-[#888]">
          Filter:
        </label>
        <select
          id="diag-level"
          value={filter}
          onChange={(e) => setFilter(e.target.value as LogLevel | "all")}
          className="bg-transparent text-[#fff] border border-[#333] rounded px-2 py-1 text-[0.85em]"
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <Button
          onClick={copyAsJson}
          variant="outline"
          className="text-xs px-2 py-1 min-h-[32px]"
        >
          Copy JSON
        </Button>
        <Button
          onClick={clearLogs}
          variant="outline"
          className="text-xs px-2 py-1 min-h-[32px]"
        >
          Clear logs
        </Button>
        {pendingCount > 0 && (
          <Button
            onClick={clearPending}
            variant="destructive"
            className="text-xs px-2 py-1 min-h-[32px]"
          >
            Clear pending
          </Button>
        )}
      </div>

      <div className="max-h-[400px] overflow-y-auto rounded border border-[#333] bg-[#0e0e0e] font-mono text-[11px] leading-[1.4]">
        {filtered.length === 0 ? (
          <div className="p-3 text-[#666] italic">No log entries yet.</div>
        ) : (
          filtered.map((e, idx) => (
            <div
              key={`${e.ts}-${idx}`}
              className="px-2 py-1 border-b border-[#222] last:border-b-0"
            >
              <span
                className={
                  e.level === "error"
                    ? "text-[#dc3545]"
                    : e.level === "warn"
                      ? "text-[#ffc107]"
                      : e.level === "info"
                        ? "text-[#4ba7a6]"
                        : "text-[#888]"
                }
              >
                [{e.level}]
              </span>{" "}
              <span className="text-[#aaa]">{e.event}</span>
              {Object.keys(e.fields).length > 0 && (
                <span className="text-[#666]"> {JSON.stringify(e.fields)}</span>
              )}
              <div className="text-[#555] text-[10px]">{e.ts}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
