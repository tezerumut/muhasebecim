import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navbar = ({ user, onLogout }) => {
  const location = useLocation();

  return (
    <nav className="navbar">
      <div className="nav-brand">
        <h2>🏪 Dijital Esnaf Defteri</h2>
        <span>Hoşgeldin, {user?.full_name}</span>
      </div>
      
      <div className="nav-links">
        <Link to="/dashboard" className={location.pathname === '/dashboard' ? 'active' : ''}>
          📊 Dashboard
        </Link>
        <Link to="/transactions" className={location.pathname === '/transactions' ? 'active' : ''}>
          💰 Kasa
        </Link>
        <Link to="/invoices" className={location.pathname === '/invoices' ? 'active' : ''}>
          📄 Faturalar
        </Link>
        <button onClick={onLogout} className="logout-btn">
          🚪 Çıkış
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
