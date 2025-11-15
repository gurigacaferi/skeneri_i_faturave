import { SessionContextProvider } from '@/components/SessionContextProvider';
import { ReceiptProcessingProvider } from '@/components/ReceiptProcessingContext'; // Import the new provider
import { Toaster } from '@/components/ui/toaster';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Expense Tracker',
  description: 'Track your expenses and manage receipts with AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SessionContextProvider>
            <ReceiptProcessingProvider> {/* Wrap with the new provider */}
              <div className="flex flex-col min-h-screen">
                <Header />
                <main className="flex-grow container mx-auto p-4 sm:p-6">
                  {children}
                </main>
                <Footer />
              </div>
            </ReceiptProcessingProvider>
          </SessionContextProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}