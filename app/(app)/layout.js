import AuthProvider from '@/components/AuthProvider';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function AppLayout({ children }) {
  return (
    <AuthProvider>
      <Navbar />
      <main className="app-main">{children}</main>
      <Footer />
    </AuthProvider>
  );
}