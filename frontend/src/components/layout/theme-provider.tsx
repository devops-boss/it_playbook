'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { hexToHsl } from '@/lib/utils';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  /** Applies an admin-configured accent color to the CSS variables. */
  applyAccent: (hex: string) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'bos-playbook-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>('light');
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('light');

  // Read the persisted preference before paint to avoid a flash.
  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const preferred =
      stored ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setThemeState(preferred);
  }, []);

  // Ensure document title always reflects "IT Operations Playbook" in the browser tab
  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    const enforcePlaybookTitle = () => {
      const current = document.title;
      if (!current || current === 'BOS Playbook') {
        document.title = 'IT Operations Playbook';
      } else if (current.includes('BOS Playbook')) {
        document.title = current.replace(/BOS Playbook/g, 'IT Operations Playbook');
      }
    };

    enforcePlaybookTitle();

    const titleEl = document.querySelector('title');
    if (!titleEl) return;

    const observer = new MutationObserver(() => {
      enforcePlaybookTitle();
    });

    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      setResolvedTheme(resolved);
      root.classList.toggle('dark', resolved === 'dark');
    };

    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const resolved = next === 'system' ? (media.matches ? 'dark' : 'light') : next;
      root.classList.toggle('dark', resolved === 'dark');
      setResolvedTheme(resolved);
    }
    setThemeState(next);
  }, []);

  const applyAccent = React.useCallback((hex: string) => {
    if (!hex) return;
    try {
      const { h, s, l } = hexToHsl(hex);
      const root = document.documentElement;
      root.style.setProperty('--primary', `${h} ${s}% ${l}%`);
      root.style.setProperty('--ring', `${h} ${s}% ${l}%`);
      // A light accent needs dark text on top of it.
      root.style.setProperty(
        '--primary-foreground',
        l > 55 ? '222 47% 11%' : '0 0% 100%',
      );
    } catch {
      // Invalid color from the database: keep the default accent.
    }
  }, []);

  const value = React.useMemo(
    () => ({ theme, setTheme, resolvedTheme, applyAccent }),
    [theme, setTheme, resolvedTheme, applyAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
