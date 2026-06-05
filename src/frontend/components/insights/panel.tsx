import { useEffect, useState } from "react";
import type { UsageBucket, UsageStats } from "../../../shared/types.ts";
import { invoke } from "../../transport.ts";
import { Modal } from "../modal.tsx";

const usd = (n: number): string => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;
const tk = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

const Col = ({ title, rows }: { title: string; rows: UsageBucket[] }) => (
  <div className="insightcol">
    <div className="insighthead">{title}</div>
    {rows.length === 0 ? (
      <div className="memempty">No usage yet.</div>
    ) : (
      rows.map((b) => (
        <div className="insightrow" key={b.id}>
          <span className="insightname">{b.name}</span>
          <span className="dim">
            {tk(b.tokens)} · {usd(b.costUsd)}
          </span>
        </div>
      ))
    )}
  </div>
);

export const InsightsPanel = () => {
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    void invoke("usage:stats", undefined).then(setStats);
  }, []);

  return (
    <Modal
      title="Usage & cost"
      subtitle="Estimated from text length — streaming responses don't report exact token counts."
      wide
    >
      {!stats ? (
        <div className="memempty">Loading…</div>
      ) : (
        <>
          <div className="insightstotals">
            <div className="insightstat">
              <span className="big">{usd(stats.totalCostUsd)}</span>
              <span className="dim">estimated spend</span>
            </div>
            <div className="insightstat">
              <span className="big">{tk(stats.totalTokens)}</span>
              <span className="dim">tokens</span>
            </div>
          </div>
          <div className="insightcols">
            <Col title="By agent" rows={stats.byAgent} />
            <Col title="By channel" rows={stats.byChannel} />
          </div>
        </>
      )}
    </Modal>
  );
};
