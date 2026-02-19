import { useEffect, useState, useMemo } from "react";
import "./App.css";

// --- API ADRESİ ---
const API = "https://muhasebecim-backend.onrender.com";

export default function App() {
  const [jwt, setJwt] = useState(localStorage.getItem("token") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(""); 
  const [isRegister, setIsRegister] = useState(false); 

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [searchTerm, setSearchTerm] = useState("");

  const [items, setItems] = useState([]);
  const [group, setGroup] = useState("ciro"); 
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [ciroType, setCiroType] = useState("Nakit");

  const signedIn = !!jwt;

  useEffect(() => {
    if (msg) {
      const timer = setTimeout(() => setMsg(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [msg]);

  const setQuickFilter = (range) => {
    const d = new Date();
    if (range === 'bugun') { setStartDate(todayStr); setEndDate(todayStr); }
    else if (range === 'dun') {
      const yesterday = new Date(); yesterday.setDate(d.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      setStartDate(yStr); setEndDate(yStr);
    }
    else if (range === 'hafta') {
      const week = new Date(); week.setDate(d.getDate() - 7);
      setStartDate(week.toISOString().split('T')[0]); setEndDate(todayStr);
    }
    else if (range === 'ay') { setStartDate(firstDay); setEndDate(todayStr); }
  };

  async function refreshData() {
    if (!jwt) return;
    setLoading(true);
    try {
      const headers = { 
        "Authorization": `Bearer ${jwt}`,
        "Cache-Control": "no-cache"
      };
      const tRes = await fetch(`${API}/api/transactions?start_date=${startDate}&end_date=${endDate}`, { headers });
      if (tRes.status === 401) return logout();
      const data = await tRes.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) { setMsg("Bağlantı hatası!"); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (signedIn) refreshData(); }, [signedIn, startDate, endDate]);

  const filteredItems = useMemo(() => {
    return items
      .filter(t => (t.title || "").toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [items, searchTerm]);

  const dataMap = useMemo(() => {
    let s = { nakit: 0, kart: 0, yemek: 0, platform: 0, dGelir: 0, dGider: 0 };
    filteredItems.forEach(t => {
      const baslik = (t.title || "").toLowerCase();
      const metod = (t.payment_method || "").toLowerCase();
      const aciklama = (t.description || "").toLowerCase();
      const miktar = Number(t.amount) || 0;
      const isCiro = baslik.includes("[ciro]") || aciklama === "ciro" || aciklama.includes("ciro");

      if (isCiro) {
        if (metod.includes("kart") || metod.includes("card") || baslik.includes("kart") || baslik.includes("card")) {
          if (metod.includes("yemek") || baslik.includes("yemek") || metod.includes("meal")) s.yemek += miktar;
          else s.kart += miktar;
        } 
        else if (metod.includes("plat") || baslik.includes("plat")) s.platform += miktar;
        else s.nakit += miktar;
      } else {
        if (t.type === 'income') s.dGelir += miktar;
        else s.dGider += miktar;
      }
    });
    return s;
  }, [filteredItems]);

  async function login() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password.trim() })
      });
      const data = await res.json();
      if (res.ok && data.token) { 
        localStorage.setItem("token", data.token); 
        setJwt(data.token); 
        setMsg("Giriş yapıldı!");
      } else { setMsg(data.detail || "Hatalı giriş!"); }
    } catch (e) { setMsg("Sunucu hatası!"); }
    finally { setLoading(false); }
  }

  async function register() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password.trim() })
      });
      if (res.ok) { 
        setMsg("Kayıt başarılı! Giriş yapın."); 
        setIsRegister(false); 
      } else { setMsg("Kayıt başarısız!"); }
    } catch (e) { setMsg("Bağlantı hatası!"); }
    finally { setLoading(false); }
  }

  const logout = () => { localStorage.removeItem("token"); setJwt(""); };

  if (!signedIn) {
    return (
      <div style={{ padding: 40, maxWidth: 350, margin: "80px auto", borderRadius: 25, textAlign: 'center', fontFamily: 'sans-serif', backgroundColor: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
        <h2>{isRegister ? "Hesap Oluştur" : "Esnaf Paneli"}</h2>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="E-posta" style={{ width: '90%', padding: 12, marginBottom: 10, borderRadius: 12, border: '1px solid #ddd' }} />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Şifre" style={{ width: '90%', padding: 12, marginBottom: 20, borderRadius: 12, border: '1px solid #ddd' }} />
        <button onClick={isRegister ? register : login} style={{ width: '100%', padding: 15, background: "#000", color: "#fff", border: 'none', borderRadius: 12, fontWeight: 'bold' }}>
          {loading ? "Bekleyin..." : (isRegister ? "KAYIT OL" : "GİRİŞ YAP")}
        </button>
        <p onClick={() => setIsRegister(!isRegister)} style={{ marginTop: 20, fontSize: '0.8rem', color: '#666', cursor: 'pointer', textDecoration: 'underline' }}>
          {isRegister ? "Zaten hesabım var, giriş yap" : "Yeni hesap oluştur"}
        </p>
        {msg && <div style={{ marginTop: 10, color: "red", fontSize: '0.9rem' }}>{msg}</div>}
      </div>
    );
  }

  return (
    <div style={{ padding: '15px 10px', maxWidth: 500, margin: "0 auto", fontFamily: "sans-serif", backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <div style={{ background: '#000', color: '#fff', padding: 25, borderRadius: 30, marginBottom: 20, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{startDate} / {endDate}</span>
          <button onClick={logout} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ff4d4d', padding: '5px 10px', borderRadius: 10, fontSize: '0.7rem' }}>Çıkış</button>
        </div>
        <small style={{ opacity: 0.6 }}>NET KASA (FİLTRELİ)</small>
        <h1 style={{ margin: '5px 0', fontSize: '2.5rem' }}>{(dataMap.nakit + dataMap.kart + dataMap.yemek + dataMap.platform + dataMap.dGelir - dataMap.dGider).toFixed(2)} ₺</h1>
      </div>

      <div style={{ background: '#fff', padding: 15, borderRadius: 25, marginBottom: 15, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        <h4 style={{ margin: '0 0 12px 0' }}>📂 Filtrele & Ara</h4>
        <div style={{ display: 'flex', gap: 5, marginBottom: 12, overflowX: 'auto', paddingBottom: 5 }}>
          {['bugun', 'dun', 'hafta', 'ay'].map(r => (
            <button key={r} onClick={() => setQuickFilter(r)} style={{ padding: '6px 12px', borderRadius: 10, border: '1px solid #eee', background: '#f8f9fa', fontSize: '0.75rem' }}>
              {r === 'bugun' ? 'Bugün' : r === 'dun' ? 'Dün' : r === 'hafta' ? '7 Gün' : 'Bu Ay'}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: 8, borderRadius: 10, border: '1px solid #eee' }} />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: 8, borderRadius: 10, border: '1px solid #eee' }} />
        </div>
        <button onClick={refreshData} style={{ width: '100%', padding: '10px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 'bold', marginBottom: 10 }}>LİSTEYİ GÜNCELLE</button>
        <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Arama (Su, Kira...)" style={{ width: '93%', padding: 10, borderRadius: 10, border: '1px solid #eee' }} />
      </div>

      <div style={{ background: '#fff', padding: 15, borderRadius: 25, marginBottom: 15 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: '#e8f5e9', padding: 12, borderRadius: 15 }}><small>Nakit</small><br/><b>{dataMap.nakit.toFixed(2)} ₺</b></div>
          <div style={{ background: '#e3f2fd', padding: 12, borderRadius: 15 }}><small>Kart</small><br/><b>{dataMap.kart.toFixed(2)} ₺</b></div>
          <div style={{ background: '#f3e5f5', padding: 12, borderRadius: 15 }}><small>Yemek</small><br/><b>{dataMap.yemek.toFixed(2)} ₺</b></div>
          <div style={{ background: '#fff3e0', padding: 12, borderRadius: 15 }}><small>Giderler</small><br/><b style={{color:'#c62828'}}>-{dataMap.dGider.toFixed(2)} ₺</b></div>
        </div>
      </div>

      <div style={{ background: '#fff', padding: 20, borderRadius: 25, marginBottom: 15 }}>
        <div style={{ display: 'flex', background: '#f0f0f0', borderRadius: 15, padding: 5, marginBottom: 15 }}>
          <button onClick={() => setGroup("ciro")} style={{ flex: 1, padding: 10, borderRadius: 12, border: 'none', background: group === 'ciro' ? '#000' : 'none', color: group === 'ciro' ? '#fff' : '#000', fontWeight: 'bold' }}>CİRO</button>
          <button onClick={() => setGroup("diger")} style={{ flex: 1, padding: 10, borderRadius: 12, border: 'none', background: group === 'diger' ? '#000' : 'none', color: group === 'diger' ? '#fff' : '#000', fontWeight: 'bold' }}>GİDER / DİĞER</button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {group === 'ciro' ? (
            <select value={ciroType} onChange={e => setCiroType(e.target.value)} style={{ padding: 12, borderRadius: 12, border: '1px solid #ddd' }}>
              <option value="Nakit">Nakit Satış</option>
              <option value="Kredi Kartı">Kredi Kartı</option>
              <option value="Yemek Kartı">Yemek Kartı</option>
              <option value="Platform">Yemek Platformu</option>
            </select>
          ) : (
            <>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Su, Kira, Personel..." style={{ padding: 12, borderRadius: 12, border: '1px solid #ddd' }} />
              <select value={type} onChange={e => setType(e.target.value)} style={{ padding: 12, borderRadius: 12, border: '1px solid #ddd' }}>
                <option value="expense">Gider (-)</option>
                <option value="income">Ek Gelir (+)</option>
              </select>
            </>
          )}
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Tutar ₺" style={{ padding: 12, borderRadius: 12, border: '1px solid #ddd', fontSize: '1.2rem', fontWeight: 'bold' }} />
          <button onClick={async () => {
            if(!amount) return;
            const finalTitle = group === 'ciro' ? `[Ciro] ${ciroType}` : title;
            await fetch(`${API}/api/transactions`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
              body: JSON.stringify({ title: finalTitle, amount: Number(amount), type: group === 'ciro' ? 'income' : type, payment_method: group === 'ciro' ? ciroType : 'Nakit', description: group })
            });
            setTitle(""); setAmount(""); refreshData(); setMsg("Kaydedildi!");
          }} style={{ padding: 15, background: '#000', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 'bold' }}>KAYDET</button>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 25, overflow: 'hidden' }}>
        <div style={{ padding: 15, borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
          <b>İşlemler</b>
          <span style={{fontSize:'0.8rem'}}>{filteredItems.length} Kayıt</span>
        </div>
        {filteredItems.map(t => {
          const currentId = t._id || t.id;
          return (
            <div key={currentId} style={{ display: 'flex', justifyContent: 'space-between', padding: 15, borderBottom: '1px solid #f8f8f8' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{(t.title || "").replace('[Ciro] ', '')}</div>
                <small style={{ color: '#bbb', fontSize: '0.7rem' }}>{new Date(t.created_at).toLocaleDateString('tr-TR')} - {t.payment_method}</small>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b style={{ color: t.type === 'income' ? '#2e7d32' : '#c62828', fontSize: '1rem' }}>
                    {t.type === 'income' ? '+' : '-'}{Number(t.amount).toFixed(2)} ₺
                </b>
                <br/>
                <button 
                  onClick={async (e) => {
                    const originalText = e.target.innerText;
                    e.target.innerText = "...";
                    try {
                      const res = await fetch(`${API}/api/transactions/${currentId}`, { 
                        method: "DELETE", 
                        headers: { "Authorization": `Bearer ${jwt}` } 
                      });
                      if(res.ok) {
                        refreshData(); 
                      } else {
                        alert("Silinemedi!");
                        e.target.innerText = originalText;
                      }
                    } catch (err) {
                      e.target.innerText = originalText;
                    }
                  }} 
                  style={{ background: 'none', border: 'none', color: '#ff4d4d', fontSize: '0.75rem', fontWeight:'bold', textDecoration:'underline', cursor: 'pointer' }}
                >
                  Sil
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}