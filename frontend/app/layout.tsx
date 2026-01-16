import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EtymoGraph - Etymology Explorer',
  description: 'Explore the origins and connections of English words',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
          <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <a href="/" className="flex items-center space-x-2">
                  <span className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                    EtymoGraph
                  </span>
                </a>
                <nav className="flex space-x-6">
                  <a
                    href="/"
                    className="text-gray-600 hover:text-primary-600 transition-colors"
                  >
                    Search
                  </a>
                  <a
                    href="/history"
                    className="text-gray-600 hover:text-primary-600 transition-colors"
                  >
                    History
                  </a>
                </nav>
              </div>
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
