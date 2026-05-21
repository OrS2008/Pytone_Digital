import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nova Stream',
  description: 'The next generation of streaming.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#06070A] text-white antialiased">{children}</body>
    </html>
  );
}
