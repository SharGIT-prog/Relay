import Link from 'next/link';
import { NAV_ITEMS } from '@/lib/nav.js';
import { Icon } from './ui';

export default function Footer() {
  const groups = [...new Set(NAV_ITEMS.filter((i) => i.group).map((i) => i.group))];
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="logo"><span className="logo-tile"><Icon name="heart" size={20} /></span>RELAY</div>
            <p>Keeping a patient's care connected from admission to recovery and the next facility.</p>
          </div>
          {groups.slice(0, 3).map((g) => (
            <div key={g}>
              <h4>{g}</h4>
              <ul>{NAV_ITEMS.filter((i) => i.group === g).map((i) => <li key={i.href}><Link href={i.href}>{i.label}</Link></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom">&copy; {new Date().getFullYear()} Continuity of Care. Demonstration system; not for clinical use.</div>
      </div>
    </footer>
  );
}