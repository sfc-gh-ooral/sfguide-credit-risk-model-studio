'use client';

// App-wide UI state kept in the browser: the persona ("View as"), the theme, and which story beats
// the reader has reached. Personas change emphasis and which actions are enabled in the UI; they are
// not Snowflake roles (live mode always runs as CREDIT_RISK_STUDIO_ROLE).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Persona } from '@/lib/types';

type Beat = 'psi' | 'workbench' | 'queue-after';
interface Ctx {
  persona: Persona; setPersona: (p: Persona) => void;
  theme: 'light' | 'dark'; toggleTheme: () => void;
  beats: Record<Beat, boolean>; markBeat: (b: Beat) => void; resetBeats: () => void;
}
const StudioCtx = createContext<Ctx | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [persona, setPersonaState] = useState<Persona>('validator');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [beats, setBeats] = useState<Record<Beat, boolean>>({ psi: false, workbench: false, 'queue-after': false });

  useEffect(() => {
    const p = window.localStorage.getItem('crms-persona') as Persona | null;
    if (p) setPersonaState(p);
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    try { setBeats((b) => ({ ...b, ...JSON.parse(window.localStorage.getItem('crms-beats') ?? '{}') })); } catch { /* ignore */ }
  }, []);

  const setPersona = (p: Persona) => { setPersonaState(p); window.localStorage.setItem('crms-persona', p); };
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('crms-theme', next);
  };
  const markBeat = useCallback((b: Beat) => setBeats((prev) => {
    if (prev[b]) return prev;
    const next = { ...prev, [b]: true };
    window.localStorage.setItem('crms-beats', JSON.stringify(next));
    return next;
  }), []);
  const resetBeats = () => { setBeats({ psi: false, workbench: false, 'queue-after': false }); window.localStorage.removeItem('crms-beats'); };

  return <StudioCtx.Provider value={{ persona, setPersona, theme, toggleTheme, beats, markBeat, resetBeats }}>{children}</StudioCtx.Provider>;
}

export function useStudio() {
  const c = useContext(StudioCtx);
  if (!c) throw new Error('useStudio must be used inside StudioProvider');
  return c;
}
