'use client';
import { useEffect, useRef, useState } from 'react';

const ICONS = {
  heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  layout: 'M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z',
  clipboard: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
  box: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12',
  trend: 'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
  send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  check: 'M20 6L9 17l-5-5',
};

export function Icon({ name, size = 24 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] ?? ICONS.activity} />
    </svg>
  );
}

function useInView(threshold = 0.1) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!('IntersectionObserver' in window)) { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen];
}

/** Scroll-triggered reveal: opacity 0 + translateY(30px) -> visible. */
export function FadeIn({ children, delay = 0, className = '' }) {
  const [ref, seen] = useInView(0.1);
  return <div ref={ref} className={`fade-in ${seen ? 'visible' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

/** Count-up from 0 to `value` over 2 s, started once when scrolled into view. */
export function Counter({ value, label }) {
  const [ref, seen] = useInView(0.3);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return undefined;
    const target = Number(value) || 0;
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 2000);
      setN(Math.round(target * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value]);
  return <div ref={ref}><div className="stat-num">{n}</div><div className="stat-label">{label}</div></div>;
}

export function SectionHeader({ tag, title, sub, left = false }) {
  return (
    <div className={`section-header ${left ? 'left' : ''}`}>
      {tag && <span className="tag">{tag}</span>}
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}

const BADGE = {
  green: ['READY', 'FULFILLED', 'ACKNOWLEDGED', 'COMPLETED', 'APPROVED', 'ACTIVE', 'AVAILABLE'],
  blue: ['PLANNED', 'PENDING', 'PREPARED', 'DRAFT', 'ALLOCATED', 'SENT', 'AWAITING_HANDOFF'],
  amber: ['REQUIREMENTS_OUTSTANDING', 'NO_REQUIREMENTS', 'MAINTENANCE'],
  red: ['REJECTED', 'HANDOFF_REJECTED', 'UNAVAILABLE'],
};
export function StatusBadge({ status }) {
  if (!status) return <span className="badge badge-gray">NONE</span>;
  const colour = Object.keys(BADGE).find((c) => BADGE[c].includes(status)) ?? 'gray';
  return <span className={`badge badge-${colour}`}>{status.replaceAll('_', ' ')}</span>;
}

export function ErrorAlert({ error }) {
  if (!error) return null;
  const e = typeof error === 'string' ? { message: error } : error;
  return (
    <div className="alert alert-error" role="alert">
      <strong>{e.message}</strong>
      {e.details?.length > 0 && <ul>{e.details.map((d, i) => <li key={i}>{d.path ? `${d.path}: ` : ''}{d.message}</li>)}</ul>}
    </div>
  );
}

export function HeroVisual({ cards }) {
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="blob" />
      <div className="blob-icon"><Icon name="heart" size={72} /></div>
      {cards.map((c, i) => (
        <div key={c.title} className={`float-card fc${i + 1}`}>
          <span className="fc-icon"><Icon name={c.icon} size={18} /></span>
          <span><strong>{c.title}</strong><small>{c.sub}</small></span>
        </div>
      ))}
    </div>
  );
}

export const fmtDateTime = (s) => (s ? s.slice(0, 16) : '');