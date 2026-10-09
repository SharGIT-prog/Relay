'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api.js';
import { Icon, HeroVisual, ErrorAlert } from '@/components/ui';

export default function SignupPage() {
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (f.password !== f.confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true); setError(null);
    try { setDone(await api('/api/auth/signup', { method: 'POST', body: { name: f.name, email: f.email, password: f.password } })); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-panel">
        <div className="logo"><span className="logo-tile"><Icon name="heart" size={20} /></span>Continuity of Care</div>
        <h1>Join the <span className="gradient-text">care team</span>.</h1>
        <p>Create an account to coordinate discharges, resources and handoffs.</p>
        {done ? (
          <div className="panel stack">
            <div className="alert alert-success" role="status">{done.message}</div>
            <Link href="/login" className="btn btn-primary">Go to sign in</Link>
          </div>
        ) : (
          <form className="panel" onSubmit={submit}>
            <div className="stack" style={{ textAlign: 'left' }}>
              <ErrorAlert error={error} />
              <div><label htmlFor="n">Full name</label><input id="n" required minLength={2} maxLength={150} autoComplete="name" value={f.name} onChange={set('name')} /></div>
              <div><label htmlFor="e">Email</label><input id="e" type="email" required autoComplete="username" value={f.email} onChange={set('email')} /></div>
              <div>
                <label htmlFor="p">Password</label>
                <input id="p" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={f.password} onChange={set('password')} />
                <p className="hint">At least 8 characters, with a letter and a digit.</p>
              </div>
              <div><label htmlFor="c">Confirm password</label><input id="c" type="password" required autoComplete="new-password" value={f.confirm} onChange={set('confirm')} /></div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Creating...' : 'Create account'}</button>
              <p className="small">New accounts are reviewed by an administrator before first sign-in. Already registered? <Link href="/login">Sign in</Link></p>
            </div>
          </form>
        )}
      </div>
      <HeroVisual cards={[
        { icon: 'clipboard', title: 'Role-based access', sub: 'Approved by an admin' },
        { icon: 'activity', title: 'Every action audited', sub: 'Who, what, when' },
        { icon: 'send', title: 'Safe handoffs', sub: 'Confirmed by the receiver' },
      ]} />
    </div>
  );
}