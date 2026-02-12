import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../services/api";
import { onDataChanged } from "../events";

function moneyTR(n) {
  const num = Number(n || 0);
  return num.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
}

function MiniBars({ rows }) {
  const max = useMemo(() => {
    let m = 0;
    for (const r of rows) m = Math.max(m, r.ciro || 0, r.gider || 0);
    return m || 1;
  }, [rows]);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 110 }}>
      {rows.map((r) => {
        const hIn = Math.round(((r.ciro || 0) / max) * 100);
        const hOut = Math.round(((r.gider || 0) / max) * 100);
        return (
          <div key={r.date} title={`${r.date}\nGelir: ${moneyTR(r.ciro)}\nGider: ${moneyTR(r.gider)}`}
               style={{ width: 18, display: "flex", gap: 2, alignItems: "flex-end" }}>
            <div style={{ height: `${hIn}%`, width: 8, background: "rgba(34,197,94,0.65)", borderRadius: 6 }} />
            <div style={{ height: `${hOut}%`, width: 8, background: "rgba(239,68,68,0.65)", borderRadius: 6 }} />
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const [sum, setSum] = useState({ ciro: 0, gider: 0, net: 0 });
  const [days, setDays] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await apiGet("/api/summary/today");
      const d = await apiGet("/api/summary/days?days=14");
      setSum(s || { ciro: 0, gider: 0, net: 0 });
      setDays(Array.isArray(d) ? d : []);
    } catch (e) {
      setErr(e.message || "Hata");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ✅ otomatik refresh
  useEffect(() => {
    const off = onDataChanged(() => load());
    return off;
  }, [load]);

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ marginTop: 0 }}>Özet</h1>

      <button onClick={load} disabled={loading}>
        {loading ? "Yükleniyor..." : "Yenile"}
      </button>

      {err && <div style={{ marginTop: 10, color: "#ff8080" }}>{err}</div>}

      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <div style={card}><div style={label}>Gelir</div><div style={value}>{moneyTR(sum.ciro)}</div></div>
        <div style={card}><div style={label}>Gider</div><div style={value}>{moneyTR(sum.gider)}</div></div>
        <div style={card}><div style={label}>Kâr</div><div style={value}>{moneyTR(sum.net)}</div></div>
      </div>

      <div style={{ marginTop: 18, ...card }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 900 }}>Kasa Geçmişi (14 gün)</div>
            <div style={{ opacity: 0.75, fontSize: 12 }}>Yeşil: gelir / Kırmızı: gider</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <MiniBars rows={days} />
        </div>
      </div>
    </div>
  );
}

const card = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 16,
  padding: 16,
  minWidth: 240,
};
const label = { opacity: 0.75, fontSize: 12, marginBottom: 6 };
const value = { fontSize: 22, fontWeight: 900 };
