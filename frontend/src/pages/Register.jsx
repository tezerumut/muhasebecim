import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPost } from "../services/api";

export default function Register() {
  const nav = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const r = await apiPost("/register", {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      localStorage.setItem("token", r.access_token);
      localStorage.setItem("user", JSON.stringify(r.user || {}));
      nav("/");
    } catch (e2) {
      setErr(e2.message || "Kayıt başarısız");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="authWrap">
      <div className="authCard">
        <h2>Kayıt</h2>

        <form onSubmit={submit} className="authForm">
          <input
            className="input"
            placeholder="Ad Soyad"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
          />
          <input
            className="input"
            placeholder="E-posta"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="input"
            placeholder="Şifre"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />

          {err ? <div className="alert">{err}</div> : null}

          <button className="btn primary" disabled={loading} type="submit">
            {loading ? "..." : "Kayıt Ol"}
          </button>
        </form>

        <div style={{ marginTop: 12 }}>
          Zaten hesabın var mı? <Link to="/login">Giriş</Link>
        </div>
      </div>
    </div>
  );
}
