'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Moon, Sun, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ModeChip, REPO } from './ModeChip';
import { useStudio } from './Studio';
import { HOSTED_EXAMPLE } from '@/lib/hosted';
import { PERSONAS, type Persona } from '@/lib/types';

const NAV = [
  { href: '/', label: 'Portfolio' },
  { href: '/queue/', label: 'Early warning' },
  { href: '/workbench/', label: 'Model workbench' },
  { href: '/model-card/', label: 'Model card' },
  { href: '/monitoring/', label: 'Monitoring' },
];

// Generic monogram: a rising score curve inside a rounded tile (no Snowflake marks).
function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="w-8 h-8" aria-hidden>
      <defs><linearGradient id="mk" x1="0" x2="1" y1="1" y2="0"><stop offset="0" stopColor="var(--emerald)" /><stop offset="1" stopColor="var(--indigo)" /></linearGradient></defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#mk)" />
      <path d="M7 22 C 12 21, 14 12, 18 13 S 23 9, 25 8" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="25" cy="8" r="2.4" fill="#fff" />
    </svg>
  );
}

export function TopBar() {
  const path = usePathname();
  const { persona, setPersona, theme, toggleTheme } = useStudio();
  const norm = (p: string) => (p.endsWith('/') ? p : `${p}/`);
  const active = (href: string) => (href === '/' ? norm(path) === '/' : norm(path).startsWith(href) || (href === '/queue/' && norm(path).startsWith('/account/')));
  // Below lg the nav and "View as" move into a menu opened from the header.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>('a, select')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); menuBtn.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const personaSelect = (
    <select value={persona} onChange={(e) => setPersona(e.target.value as Persona)}
      className="appearance-none pl-8 pr-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer"
      style={{ background: 'var(--bg-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}>
      {(Object.keys(PERSONAS) as Persona[]).map((p) => <option key={p} value={p}>View as: {PERSONAS[p].label}</option>)}
    </select>
  );

  return (
    <header className="topbar">
      <div className="mx-auto max-w-[1440px] px-4 md:px-8 py-2.5 lg:py-0 lg:h-16 flex flex-wrap lg:flex-nowrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="Credit Risk Model Studio home">
          <Mark />
          <span className="leading-tight hidden sm:block">
            <span className="font-display text-[17px] text-ink block">Credit Risk Model Studio</span>
            <span className="text-[10.5px] font-semibold tracking-wide text-muted">Governed ML on Snowflake · example</span>
          </span>
        </Link>
        <nav className="hidden lg:block lg:flex-1 overflow-x-auto lg:mx-2 -mx-1 px-1" aria-label="Main">
          <ul className="flex items-center gap-1 min-w-max">
            {NAV.map((n) => (
              <li key={n.href}><Link href={n.href} className="navlink" aria-current={active(n.href) ? 'page' : undefined}>{n.label}</Link></li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <label className="relative hidden lg:flex items-center" title="View as: changes emphasis and which actions are enabled">
            <UserRound className="w-3.5 h-3.5 absolute left-2.5 text-muted pointer-events-none" aria-hidden />
            <span className="sr-only">View as</span>
            {personaSelect}
          </label>
          <button className="btn !p-2 !rounded-full" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <ModeChip />
          <button ref={menuBtn} className="btn !p-2 !rounded-full lg:!hidden" onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div ref={menuRef} id="mobile-menu" hidden={!menuOpen} className="lg:hidden border-t px-4 md:px-8 py-3" style={{ borderColor: 'var(--line)' }}>
        <nav aria-label="Main">
          <ul className="flex flex-col gap-1">
            {NAV.map((n) => (
              <li key={n.href}><Link href={n.href} onClick={() => setMenuOpen(false)} className="navlink block" aria-current={active(n.href) ? 'page' : undefined}>{n.label}</Link></li>
            ))}
          </ul>
        </nav>
        <label className="relative flex items-center mt-3" title="View as: changes emphasis and which actions are enabled">
          <UserRound className="w-3.5 h-3.5 absolute left-2.5 text-muted pointer-events-none" aria-hidden />
          <span className="sr-only">View as</span>
          {personaSelect}
        </label>
      </div>
      <div className="border-t text-[11.5px] text-muted" style={{ borderColor: 'var(--line)' }}>
        <div className="mx-auto max-w-[1440px] px-4 md:px-8 py-1.5 flex flex-wrap items-center gap-x-2">
          {HOSTED_EXAMPLE ? (
            <><strong className="text-ink-2">Hosted example in Sample mode.</strong> Runs in your browser on synthetic loans; AI answers are scripted samples.
              <a className="underline underline-offset-2" href={`${REPO}#live-mode-deploy-to-your-account`}>Run it live in your own account</a></>
          ) : (
            <>Synthetic data and an illustrative model. Not a validated credit model, and not regulatory, model risk, or lending advice.</>
          )}
        </div>
      </div>
    </header>
  );
}
