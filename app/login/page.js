'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api.js';
import { Icon, HeroVisual, ErrorAlert } from '@/components/ui';
import Link from 'next/link';


export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: { email, password } });
      router.replace('/');
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-panel">
        <div className="logo"><span className="logo-tile"><Icon name="heart" size={20} /></span>Continuity of Care</div>
        <h1>Care, <span className="gradient-text">connected</span> end to end.</h1>
        <p>Sign in to coordinate discharges, resources and handoffs.</p>
        <form className="panel" onSubmit={submit}>
          <div className="stack" style={{ textAlign: 'left' }}>
            <ErrorAlert error={error} />
            <div><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
          </div>
        </form>
        <p className="small" style={{ marginTop: 16 }}>No account yet? <Link href="/signup">Create one</Link></p>
      </div>
      <HeroVisual cards={[
        { icon: 'activity', title: 'Live readiness', sub: 'Know what is outstanding' },
        { icon: 'search', title: 'Semantic search', sub: 'Find documents by meaning' },
        { icon: 'send', title: 'Safe handoffs', sub: 'Confirmed by the receiver' },
      ]} />
    </div>
  );
}