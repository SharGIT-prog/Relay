'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV_ITEMS } from '@/lib/nav.js';
import { useAuth } from './AuthProvider';
import { Icon } from './ui';

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 50);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (i) => (i.href === '/' ? pathname === '/' : pathname.startsWith(i.match ?? i.href));

  return (
    <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="container nav-inner">
        <Link href="/" className="logo"><span className="logo-tile"><Icon name="heart" size={20} /></span>Continuity of Care</Link>
        <button className={`hamburger ${open ? 'open' : ''}`} aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span /><span /><span />
        </button>
        <ul className={`nav-links ${open ? 'open' : ''}`}>
          {/* {NAV_ITEMS.map((i) => ( */}
          {NAV_ITEMS.filter((i) => !i.roles || i.roles.some((r) => user.roles.includes(r))).map((i) => (
            <li key={i.href}><Link href={i.href} className={isActive(i) ? 'active' : ''}>{i.label}</Link></li>
          ))}
          <li className="nav-user">
            <span>{user.name}</span>
            <button className="link-btn" onClick={logout}>Sign out</button>
          </li>
        </ul>
      </div>
    </header>
  );
}