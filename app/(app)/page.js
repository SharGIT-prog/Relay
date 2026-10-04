'use client';
import Link from 'next/link';
import { NAV_ITEMS } from '@/lib/nav.js';
import { useAuth } from '@/components/AuthProvider';
import { FadeIn, SectionHeader, Icon, HeroVisual } from '@/components/ui';

const STEPS = [
  'Admit the patient and assign doctors',
  'Plan the discharge and set the destination',
  'Define what must be in place (transition requirements)',
  'Check resource availability for the time window',
  'Allocate resources without double-booking',
  'Track the patient through the recovery episode',
  'Find the right care documents by meaning, not keywords',
  'Hand off to the receiving facility and wait for acknowledgement',
];

export default function Home() {
  const { user } = useAuth();
  const modules = NAV_ITEMS.filter((i) => i.group);
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="tag">Welcome back, {user.name.split(' ')[0]}</span>
            <h1>Care that does not stop at the <span className="gradient-text">hospital door</span></h1>
            <p className="lead">Follow every patient from admission through discharge, recovery and handoff, with the resources and documents that keep the transition safe.</p>
            <div className="row">
              <Link href="/dashboard" className="btn btn-primary">Open the dashboard</Link>
              <Link href="/discharge-plans/new" className="btn btn-secondary">Plan a discharge</Link>
            </div>
          </div>
          <HeroVisual cards={[
            { icon: 'clipboard', title: 'Discharge planning', sub: 'Requirements tracked' },
            { icon: 'box', title: 'Resources', sub: 'No double-booking' },
            { icon: 'send', title: 'Care handoff', sub: 'Acknowledged' },
          ]} />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeader tag="Workspace" title="Everything the transition needs" sub="Each area below is one step of the continuity-of-care workflow." />
          <div className="grid grid-3">
            {modules.map((m, i) => (
              <FadeIn key={m.href} delay={i * 80}>
                <Link href={m.href} className="card">
                  <div className="icon"><Icon name={m.icon} size={28} /></div>
                  <h3>{m.label}</h3>
                  <p>{m.desc}</p>
                </Link>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--pale-blue)' }}>
        <div className="container grid grid-2" style={{ alignItems: 'center', gap: 60 }}>
          <FadeIn>
            <SectionHeader left tag="The workflow" title="One connected sequence" sub="Nothing is handed off until its requirements are met, its resources are booked and the receiving facility confirms." />
          </FadeIn>
          <FadeIn delay={120}>
            <div className="panel">
              <ul className="checklist">
                {STEPS.map((s) => <li key={s}><span className="tick"><Icon name="check" size={14} /></span>{s}</li>)}
              </ul>
            </div>
          </FadeIn>
        </div>
      </section>
    </>
  );
}