import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'Continuity of Care',
  description: 'Continuity-of-Care Hospital Resource Management System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.variable} ${inter.className}`}>{children}</body>
    </html>
  );
}