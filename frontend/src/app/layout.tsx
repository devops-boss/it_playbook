import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/layout/toaster';

/**
 * The two typefaces, served from the machine itself.
 *
 * `next/font/local` is the local variant of the font loader: it reads
 * the file from this repository, fingerprints it, and writes a
 * `@font-face` rule with the file on the server. Nothing is fetched from
 * a font service, which matters because the application has to work on a
 * server with no route to the internet.
 *
 * The module has a single default export - `localFont` - and no named
 * ones, so both families are declared with it.
 */
const inter = localFont({
  src: '../../public/fonts/InterVariable.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900',
  preload: true,
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

const jetbrains = localFont({
  src: [
    { path: '../../public/fonts/JetBrainsMono-Regular.woff2', weight: '400' },
    { path: '../../public/fonts/JetBrainsMono-Medium.woff2', weight: '500' },
    { path: '../../public/fonts/JetBrainsMono-Bold.woff2', weight: '700' },
  ],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'monospace'],
});

const APP_NAME = 'IT Operations Playbook';

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: 'Searchable IT incident playbook and knowledge base for Big Outsource',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:text-primary-foreground focus:shadow-md"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
