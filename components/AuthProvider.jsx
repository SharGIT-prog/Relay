'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export default function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [failed, setFailed] = useState(false);

  // A 401 redirects to /login inside api(); anything else shows a message instead of a blank page.
  useEffect(() => { api('/api/auth/me').then((d) => setUser(d.user)).catch((e) => { if (e.status !== 401) setFailed(true); }); }, []);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
  }

  if (failed) return <div className="splash"><p>The server is not responding. Check that the API and databases are running.</p></div>;
  if (!user) return <div className="splash"><div><div className="spinner" /><p>Loading...</p></div></div>;
  return <Ctx.Provider value={{ user, logout }}>{children}</Ctx.Provider>;
}