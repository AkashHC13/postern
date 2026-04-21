import { useMemo, useState } from "react";
import type { ResponseData } from "../types";

interface Props {
  response: ResponseData | null;
  error: string | null;
  sending: boolean;
}

type Tab = "body" | "headers";

export function ResponsePanel({ response, error, sending }: Props) {
  const [tab, setTab] = useState<Tab>("body");

  const pretty = useMemo(() => {
    if (!response) return "";
    const ct = response.headers["content-type"] ?? response.headers["Content-Type"] ?? "";
    if (ct.includes("application/json")) {
      try {
        return JSON.stringify(JSON.parse(response.body), null, 2);
      } catch {
        return response.body;
      }
    }
    return response.body;
  }, [response]);

  if (error) {
    return (
      <div className="response-panel">
        <div className="response-meta error">Error: {error}</div>
      </div>
    );
  }
  if (!response) {
    return (
      <div className="response-panel">
        <div className="response-meta placeholder">
          {sending ? "Sending…" : "Send a request to see the response."}
        </div>
      </div>
    );
  }

  const statusClass = `status s-${Math.floor(response.status / 100)}`;

  return (
    <div className="response-panel">
      <div className="response-meta">
        <span className={statusClass}>
          {response.status} {response.statusText}
        </span>
        <span>{response.durationMs} ms</span>
        <span>{formatBytes(response.sizeBytes)}</span>
      </div>
      <div className="tabs">
        <button className={tab === "body" ? "active" : ""} onClick={() => setTab("body")}>
          Body
        </button>
        <button
          className={tab === "headers" ? "active" : ""}
          onClick={() => setTab("headers")}
        >
          Headers ({Object.keys(response.headers).length})
        </button>
      </div>
      <div className="tab-body response-body">
        {tab === "body" ? (
          <pre className="response-pre">{pretty}</pre>
        ) : (
          <pre className="response-pre">
            {Object.entries(response.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
