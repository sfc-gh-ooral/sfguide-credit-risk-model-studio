import type { Metadata } from 'next';
import './globals.css';
import { StudioProvider } from '@/components/Studio';
import { TopBar } from '@/components/TopBar';

export const metadata: Metadata = {
  title: 'Credit Risk Model Studio · Snowflake example',
  description: 'Build, validate, monitor, and act on a consumer-loan default model in Snowflake, on synthetic data.',
};

// Applies the saved theme (or the OS setting) before first paint, so dark mode never flashes.
const THEME_SCRIPT = `try{var t=localStorage.getItem('crms-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>
        <StudioProvider>
          <TopBar />
          <main className="mx-auto max-w-[1440px] px-4 md:px-8 py-7 md:py-9">{children}</main>
          <footer className="mx-auto max-w-[1440px] px-4 md:px-8 pb-10 text-xs text-muted">
            Illustrative example on synthetic data, provided as-is under the Apache 2.0 license. Not an official Snowflake product and not
            supported by Snowflake Support. Fairness checks are illustrative.
          </footer>
        </StudioProvider>
      </body>
    </html>
  );
}
