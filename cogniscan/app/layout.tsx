import './globals.css';
import { Syne, DM_Sans } from 'next/font/google';

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-syne',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-sans',
});

export const metadata = {
  title: 'CogniScan — Cognitive Load Evaluator',
  description: 'AI-powered tool to detect information overload in web interfaces',
};

// Declaring the explicit React children type for Next.js Layouts
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}