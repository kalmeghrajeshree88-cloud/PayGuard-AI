import { useState } from 'react';
import { api, setToken } from '../api.js';

const DEMO = { email: 'demo@payguard.ai', password: 'Demo@1234' };

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState(DEMO.email);
  const [password, setPassword] = useState(DEMO.password);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function switchMode(next) {
    setMode(next);
    setError('');
    setConfirm('');
    if (next === 'register') {
      setName('');
      setEmail('');
      setPassword('');
    } else {
      setEmail(DEMO.email);
      setPassword(DEMO.password);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (mode === 'register') {
      if (password.length < 8) return setError('Password must be at least 8 characters');
      if (password !== confirm) return setError('Passwords do not match');
    }
    setBusy(true);
    try {
      const { token, user } = mode === 'register' ? await api.register(name, email, password) : await api.login(email, password);
      setToken(token);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === 'register';

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>🛡️ PayGuard AI</h1>
        <p className="muted">Adaptive Payment Risk &amp; Intent Engine</p>
        <h3>{isRegister ? 'Create your account' : 'Log in'}</h3>

        {isRegister && (
          <>
            <label>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={60} />
          </>
        )}

        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={isRegister ? 'email' : 'username'} required />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          required
          minLength={isRegister ? 8 : undefined}
        />

        {isRegister && (
          <>
            <label>Confirm password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            <p className="muted small">At least 8 characters.</p>
          </>
        )}

        {error && <div className="alert error">{error}</div>}

        <button className="btn primary" disabled={busy}>
          {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Login'}
        </button>

        <p className="muted small">
          {isRegister ? 'Already have an account? ' : 'New here? '}
          <a href="#" onClick={(e) => { e.preventDefault(); switchMode(isRegister ? 'login' : 'register'); }}>
            {isRegister ? 'Log in' : 'Create an account'}
          </a>
        </p>
        {!isRegister && <p className="muted small">Demo account is pre-filled.</p>}
      </form>
    </div>
  );
}