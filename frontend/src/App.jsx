import { useEffect, useRef, useState } from 'react';
import { api, hasToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Pay from './pages/Pay.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [banner, setBanner] = useState(null);
  const handledReturn = useRef(false);

  // Restore session, then handle the redirect back from PayPal Sandbox.
  useEffect(() => {
    async function boot() {
      if (hasToken()) {
        try {
          const { user } = await api.me();
          setUser(user);
          await handlePayPalReturn();
        } catch {
          setToken(null);
        }
      }
      setReady(true);
    }
    boot();
  }, []);

  async function handlePayPalReturn() {
    if (handledReturn.current) return;
    const p = new URLSearchParams(window.location.search);
    const kind = p.get('paypal');
    if (!kind) return;
    handledReturn.current = true;
    const txn = p.get('txn');
    const orderId = p.get('token');
    window.history.replaceState({}, '', '/');
    if (kind === 'cancel') {
      try {
        await api.cancel({ transactionId: txn });
      } catch {}
      setBanner({ type: 'warn', text: 'PayPal payment was cancelled.' });
    } else {
      try {
        const { transaction } = await api.capture({ transactionId: txn, orderId });
        setBanner({ type: 'success', text: `✅ Transaction protected successfully: ${transaction.recipient} (risk ${transaction.riskScore}/100).` });
      } catch (e) {
        setBanner({ type: 'error', text: `Payment could not be completed: ${e.message}` });
      }
    }
    setRefreshKey((k) => k + 1);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  if (!ready) return <div className="center muted">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <header>
        <div className="brand">🛡️ PayGuard AI</div>
        <nav>
          <button className={view === 'dashboard' ? 'tab active' : 'tab'} onClick={() => setView('dashboard')}>
            Dashboard
          </button>
          <button className={view === 'pay' ? 'tab active' : 'tab'} onClick={() => setView('pay')}>
            Make payment
          </button>
        </nav>
        <div className="who">
          <span className="muted small">{user.name}</span>
          <button className="btn small" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main>
        {banner && (
          <div className={`alert ${banner.type}`} onClick={() => setBanner(null)}>
            {banner.text}
          </div>
        )}
        {view === 'dashboard' ? <Dashboard refreshKey={refreshKey} /> : <Pay onDone={() => setRefreshKey((k) => k + 1)} />}
      </main>
    </div>
  );
}
