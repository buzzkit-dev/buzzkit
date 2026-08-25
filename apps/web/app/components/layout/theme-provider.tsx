import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'dark' | 'light';
};

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  resolvedTheme: 'light',
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

const STORAGE_KEY = 'buzzkit-ui-theme';

function systemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = STORAGE_KEY,
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
  });

  const [resolved, setResolved] = useState<'dark' | 'light'>(() =>
    theme === 'system' ? systemTheme() : theme
  );

  useEffect(() => {
    const root = window.document.documentElement;
    const apply = (next: 'dark' | 'light') => {
      root.classList.remove('light', 'dark');
      root.classList.add(next);
      setResolved(next);
    };

    if (theme !== 'system') {
      apply(theme);
      return;
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => apply(query.matches ? 'dark' : 'light');
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [theme]);

  const value = {
    theme,
    resolvedTheme: resolved,
    setTheme: (next: Theme) => {
      localStorage.setItem(storageKey, next);
      setTheme(next);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
