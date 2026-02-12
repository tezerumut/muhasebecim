import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: "Bearer " + token } : {};
}

function formatDT(iso) {
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export default function App() {
  // auth
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [mode, setMode] = useState("login"); // login/register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // tx form
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("income");

  // data
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // filters
  const [filterMode, setFilterMode] = useState("month"); // day | month | range
  const [day, setDay] = useState(todayISO());
  const [month, setMonth] = useState(monthISO());
  const [rangeStart, setRangeStart] = useState(todayISO());
  const [rangeEnd, setRangeEnd] = useState(todayISO());

  const signedIn = !!token;

  async function authSubmit() {
    setLoading(true);
    setStatus("");
    try {
      const url = mode === "login" ? "/auth/login" : "/auth/register";
      const res = await fetch(API + url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Hata");
      localStorage.setItem("token", data.token);
      setToken(data.token);
      setStatus("Başarılı ✅");
    } catch (e) {
      setStatus(e.message);
    } finally {
      setLoading(false);
    }
  }

  function getTxQuery() {
    if (filterMode === "day") return { start: day, end: day };

    if (filterMode === "month") {
      const [y, m] = month.split("-");
      const start = `${y}-${m}-01`;
      const lastDate = new Date(Number(y), Number(m), 0);
      const lastDay = String(lastDate.getDate()).padStart(2, "0");
      const end = `${y}-${m}-${lastDay}`;
      return { start, end };
    }

    return { start: rangeStart, end: rangeEnd };
  }

  async function loadSummary(selectedMonth) {
    const res = await fetch(API + `/summary?month=${encodeURIComponent(selectedMonth)}`, {
      headers: { ...authHeaders() },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Özet alınamadı");
    setSummary(data);
  }

  async function loadTxs() {
    setLoading(true);
    setStatus("");
    try {
      const q = getTxQuery();
      const qs = new URLSearchParams();
      if (q.start) qs.set("start", q.start);
      if (q.end) qs.set("end", q.end);

      const res = await fetch(API + `/transactions?` + qs.toString(), {
        headers: { ...authHeaders() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kayıtlar alınamadı");
      setItems(data);

      await loadSummary(month);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addTx() {
    if (!title.trim()) return setStatus("Başlık boş olamaz");
    if (!amount || isNaN(Number(amount))) return setStatus("Tutar sayı olmalı");

    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(API + "/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ title, amount: Number(amount), type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Ekleme başarısız");

      setTitle("");
      setAmount("");
      await loadTxs();
      setStatus("Kayıt eklendi ✅");
    } catch (e) {
      setStatus(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTx(id) {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(API + `/transactions/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Silme başarısız");
      await loadTxs();
    } catch (e) {
      setStatus(e.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setToken("");
    setItems([]);
    setSummary(null);
    setStatus("Çıkış yapıldı");
  }

  useEffect(() => {
    if (signedIn) loadTxs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const totals = useMemo(() => {
    let inc = 0,
      exp = 0;
    for (const t of items) {
      if (t.type === "income") inc += t.amount;
      else exp += t.amount;
    }
    return { inc, exp, net: inc - exp };
  }, [items]);

  if (!signedIn) {
    return (
      <div className="page">
        <div className="authWrap">
          <div className="card auth">
            <div className="brand">
              <div className="logo">₺</div>
              <div>
                <div className="title">Finans Takip</div>
                <div className="sub">Ana kasa • Aylık kasa • Filtre</div>
              </div>
            </div>

            <div className="seg">
              <button className={`segBtn ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>
                Giriş
              </button>
              <button className={`segBtn ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>
                Kayıt
              </button>
            </div>

            <label className="lbl">Email</label>
            <input className="inp" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mail@..." />

            <label className="lbl">Şifre</label>
            <input
              className="inp"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            <button className="btn primary" onClick={authSubmit} disabled={loading}>
              {loading ? "..." : mode === "login" ? "Giriş Yap" : "Kayıt Ol"}
            </button>

            {status && <div className="status">{status}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div className="brandMini">
            <div className="logoSm">₺</div>
            <div>
              <div className="titleSm">Finans Takip</div>
              <div className="subSm">Ana kasa + Aylık kasa + Filtre</div>
            </div>
          </div>

          <div className="topActions">
            <button className="btn ghost" onClick={loadTxs} disabled={loading}>
              ⟳ Yenile
            </button>
            <button className="btn danger" onClick={logout}>
              Çıkış
            </button>
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <div className="sectionTitle">Kasa</div>
            <div className="kasaRow">
              <div className="kasaBox">
                <div className="kasaLabel">Ana Kasa (Tüm varlık)</div>
                <div className="kasaValue">{summary ? summary.ana_kasa.toFixed(2) : "—"} ₺</div>
              </div>

              <div className="kasaBox">
                <div className="kasaLabel">Aylık Kasa ({month})</div>
                <div className="kasaValue">{summary ? summary.aylik_kasa.toFixed(2) : "—"} ₺</div>
                <div className="kasaSub">
                  Gelir: {summary ? summary.income_total.toFixed(2) : "—"} ₺ • Gider:{" "}
                  {summary ? summary.expense_total.toFixed(2) : "—"} ₺
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="sectionTitle">Yeni Kayıt</div>
            <div className="formRow">
              <input
                className="inp"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Başlık (örn. kira, satış...)"
              />
              <input className="inp" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Tutar" />
              <select className="inp" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="income">Gelir</option>
                <option value="expense">Gider</option>
              </select>
              <button className="btn excel" onClick={addTx} disabled={loading}>
                ＋ Ekle
              </button>
            </div>
            <div className="tiny">Kayıt eklenince tarih-saat otomatik atılır.</div>
          </div>

          <div className="card">
            <div className="sectionTitle">Filtre</div>

            <div className="seg">
              <button className={`segBtn ${filterMode === "day" ? "active" : ""}`} onClick={() => setFilterMode("day")}>
                Günlük
              </button>
              <button
                className={`segBtn ${filterMode === "month" ? "active" : ""}`}
                onClick={() => setFilterMode("month")}
              >
                Aylık
              </button>
              <button
                className={`segBtn ${filterMode === "range" ? "active" : ""}`}
                onClick={() => setFilterMode("range")}
              >
                Özel Aralık
              </button>
            </div>

            {filterMode === "day" && (
              <div className="formRow2">
                <input className="inp" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
                <button className="btn primary" onClick={loadTxs} disabled={loading}>
                  Filtrele
                </button>
              </div>
            )}

            {filterMode === "month" && (
              <div className="formRow2">
                <input className="inp" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                <button className="btn primary" onClick={loadTxs} disabled={loading}>
                  Filtrele
                </button>
              </div>
            )}

            {filterMode === "range" && (
              <div className="formRow2">
                <input className="inp" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                <input className="inp" type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                <button className="btn primary" onClick={loadTxs} disabled={loading}>
                  Filtrele
                </button>
              </div>
            )}

            <div className="miniTotals">
              <div>
                Filtre Gelir: <b>{totals.inc.toFixed(2)} ₺</b>
              </div>
              <div>
                Filtre Gider: <b>{totals.exp.toFixed(2)} ₺</b>
              </div>
              <div>
                Net: <b>{totals.net.toFixed(2)} ₺</b>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="sectionTitle">Kayıtlar</div>
            <div className="list">
              {items.length === 0 && <div className="empty">Kayıt yok.</div>}
              {items.map((t) => (
                <div className="row" key={t.id}>
                  <div className="rowLeft">
                    <div className="rowTitle">{t.title}</div>
                    <div className="rowSub">{formatDT(t.created_at)}</div>
                  </div>
                  <div className={`pill ${t.type}`}>
                    {t.type === "income" ? "+" : "-"} {Number(t.amount).toFixed(2)} ₺
                  </div>
                  <button className="btn icon danger" onClick={() => deleteTx(t.id)} title="Sil">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {status && <div className="statusWide">{status}</div>}
        </div>
      </div>
    </div>
  );
}
