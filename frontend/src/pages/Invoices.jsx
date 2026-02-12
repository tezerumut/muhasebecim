import React, { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../services/api";
import { emitDataChanged } from "../events";

function moneyTR(n) {
  const num = Number(n || 0);
  return num.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
}

export default function Invoices() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");

  // filters
  const [status, setStatus] = useState("all");

  // create form
  const [companyName, setCompanyName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  // edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editCompany, setEditCompany] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDesc, setEditDesc] = useState("");

  async function load(nextStatus = status) {
    setLoading(true);
    setErr("");
    try {
      const data = await apiGet(`/api/invoices?status=${encodeURIComponent(nextStatus)}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.message || "Hata");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [status]);

  const hasOverdue = useMemo(() => items.some((x) => x.is_overdue && !x.is_paid), [items]);

  async function addInvoice() {
    setErr("");
    try {
      await apiPost("/api/invoices", {
        company_name: companyName,
        amount: Number(amount),
        due_date: dueDate,
        description,
      });

      setCompanyName("");
      setAmount("");
      setDueDate("");
      setDescription("");

      await load();
      emitDataChanged();
    } catch (e) {
      setErr(e?.message || "Hata");
    }
  }

  async function pay(id) {
    if (busyId) return;
    setBusyId(id);
    setErr("");
    try {
      await apiPut(`/api/invoices/${id}/pay`, {});
      await load();
      emitDataChanged();
    } catch (e) {
      setErr(e?.message || "Hata");
    } finally {
      setBusyId(null);
    }
  }

  async function unpay(id) {
    if (busyId) return;
    setBusyId(id);
    setErr("");
    try {
      await apiPut(`/api/invoices/${id}/unpay`, {});
      await load();
      emitDataChanged();
    } catch (e) {
      setErr(e?.message || "Hata");
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(inv) {
    setEditId(inv.id);
    setEditCompany(inv.company_name || "");
    setEditAmount(String(inv.amount ?? ""));
    setEditDueDate(inv.due_date || "");
    setEditDesc(inv.description || "");
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditId(null);
  }

  async function saveEdit() {
    if (!editId) return;
    setErr("");
    try {
      await apiPut(`/api/invoices/${editId}`, {
        company_name: editCompany,
        amount: Number(editAmount),
        due_date: editDueDate,
        description: editDesc,
      });
      closeEdit();
      await load();
      emitDataChanged();
    } catch (e) {
      setErr(e?.message || "Hata");
    }
  }

  async function removeInvoice(inv) {
    setErr("");
    const ok = window.confirm(`Silinsin mi?\n\n${inv.company_name} - ${moneyTR(inv.amount)}`);
    if (!ok) return;

    try {
      await apiDelete(`/api/invoices/${inv.id}`);
      await load();
      emitDataChanged();
    } catch (e) {
      setErr(e?.message || "Hata");
    }
  }

  const S = {
    page: { padding: 20 },
    row: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
    inp: {
      flex: "1 1 160px",
      minWidth: 160,
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(0,0,0,0.15)",
      color: "white",
      outline: "none",
    },
    card: {
      marginTop: 12,
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 16,
      padding: 16,
    },
    th: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.10)" },
    td: { padding: "12px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)" },
    badge: (bg) => ({
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      background: bg,
      border: "1px solid rgba(255,255,255,0.14)",
      fontSize: 12,
      fontWeight: 800,
    }),
    modalBack: {
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, zIndex: 9999,
    },
    modal: {
      width: "min(900px, 100%)",
      background: "rgba(17,24,39,0.98)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 16,
      padding: 16,
    },
  };

  return (
    <div style={S.page}>
      <h1 style={{ marginTop: 0 }}>Faturalar</h1>
      <div style={{ opacity: 0.75, marginBottom: 10 }}>
        Fatura ekle, öde, geri al. Filtrele: bekleyen / ödendi / gecikmiş.
      </div>

      {hasOverdue && (
        <div style={{ color: "#ffd38a", marginBottom: 10, fontWeight: 800 }}>
          ⚠️ Gecikmiş fatura var
        </div>
      )}
      {err && <div style={{ color: "#ff8080", marginBottom: 10 }}>{err}</div>}

      <div style={S.card}>
        <div style={S.row}>
          <select style={S.inp} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tümü</option>
            <option value="pending">Bekleyen</option>
            <option value="paid">Ödendi</option>
            <option value="overdue">Gecikmiş</option>
          </select>

          <button onClick={() => load()} disabled={loading}>
            {loading ? "Yükleniyor..." : "Yenile"}
          </button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.row}>
          <input style={S.inp} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Firma adı" />
          <input style={S.inp} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Tutar" inputMode="decimal" />
          <input style={S.inp} value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" />
          <input style={{ ...S.inp, flex: "2 1 260px" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Açıklama (opsiyonel)" />
          <button onClick={addInvoice}>Fatura Ekle</button>
        </div>
      </div>

      <div style={S.card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ opacity: 0.85 }}>
              <th style={S.th}>ID</th>
              <th style={S.th}>Firma</th>
              <th style={S.th}>Vade</th>
              <th style={{ ...S.th, textAlign: "right" }}>Tutar</th>
              <th style={S.th}>Durum</th>
              <th style={{ ...S.th, textAlign: "right" }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td style={S.td} colSpan={6}>{loading ? "Yükleniyor..." : "Fatura yok"}</td></tr>
            ) : (
              items.map((x) => (
                <tr key={x.id}>
                  <td style={S.td}>{x.id}</td>
                  <td style={{ ...S.td, fontWeight: 900 }}>{x.company_name}</td>
                  <td style={S.td}>{x.due_date}</td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 900 }}>{moneyTR(x.amount)}</td>
                  <td style={S.td}>
                    {x.is_paid ? (
                      <span style={S.badge("rgba(34,197,94,0.18)")}>Ödendi</span>
                    ) : x.is_overdue ? (
                      <span style={S.badge("rgba(239,68,68,0.18)")}>Gecikmiş</span>
                    ) : (
                      <span style={S.badge("rgba(255,255,255,0.10)")}>Bekliyor</span>
                    )}
                  </td>
                  <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {!x.is_paid ? (
                      <>
                        <button onClick={() => pay(x.id)} disabled={busyId === x.id}>
                          {busyId === x.id ? "..." : "Öde"}
                        </button>{" "}
                        <button onClick={() => openEdit(x)} className="secondary">Düzenle</button>{" "}
                        <button onClick={() => removeInvoice(x)} className="danger">Sil</button>
                      </>
                    ) : (
                      <button onClick={() => unpay(x.id)} disabled={busyId === x.id}>
                        {busyId === x.id ? "..." : "Geri Al"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
          Not: Ödenmiş faturayı düzenlemek/silmek için önce “Geri Al” yap.
        </div>
      </div>

      {editOpen && (
        <div style={S.modalBack} onMouseDown={closeEdit}>
          <div style={S.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Fatura Düzenle</h3>
              <button onClick={closeEdit}>Kapat</button>
            </div>

            <div style={{ ...S.row, marginTop: 12 }}>
              <input style={S.inp} value={editCompany} onChange={(e) => setEditCompany(e.target.value)} placeholder="Firma adı" />
              <input style={S.inp} value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="Tutar" inputMode="decimal" />
              <input style={S.inp} value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} type="date" />
              <input style={{ ...S.inp, flex: "2 1 260px" }} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Açıklama" />
            </div>

            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button onClick={saveEdit}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
