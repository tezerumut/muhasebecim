import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "../services/api";
import { emitDataChanged } from "../events";

function moneyTR(n) {
  const num = Number(n || 0);
  return num.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
}

export default function Transactions() {
  const [items, setItems] = useState([]);
  const [descTxt, setDescTxt] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("ciro");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiGet("/api/transactions");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || "Hata");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (saving) return;
    setSaving(true);
    setErr("");
    try {
      await apiPost("/api/transactions", {
        amount: Number(amount),
        type,
        description: descTxt,
      });
      setDescTxt("");
      setAmount("");
      await load();
      emitDataChanged();
    } catch (e) {
      setErr(e.message || "Hata");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ marginTop: 0 }}>İşlemler</h1>

      {err && <div style={{ color: "#ff8080", marginBottom: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={descTxt} onChange={(e) => setDescTxt(e.target.value)} placeholder="Açıklama"
               style={inp} />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Tutar"
               inputMode="decimal" style={inp} />
        <select value={type} onChange={(e) => setType(e.target.value)} style={inp}>
          <option value="ciro">Gelir</option>
          <option value="gider">Gider</option>
        </select>
        <button onClick={add} disabled={saving}>{saving ? "Ekleniyor..." : "Ekle"}</button>
        <button onClick={load} disabled={loading}>{loading ? "Yükleniyor..." : "Yenile"}</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ opacity: 0.8 }}>
              <th style={th}>ID</th>
              <th style={th}>Tür</th>
              <th style={th}>Açıklama</th>
              <th style={{ ...th, textAlign: "right" }}>Tutar</th>
            </tr>
          </thead>
          <tbody>
            {items.map((x) => (
              <tr key={x.id}>
                <td style={td}>{x.id}</td>
                <td style={td}>{x.type}</td>
                <td style={td}>{x.description}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 900 }}>{moneyTR(x.amount)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td style={td} colSpan={4}>{loading ? "Yükleniyor..." : "İşlem yok"}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inp = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(0,0,0,0.15)",
  color: "white",
  outline: "none",
};
const th = { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.10)" };
const td = { padding: "12px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)" };
