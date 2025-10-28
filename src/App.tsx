import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import SessionContextProvider from '@/components/SessionContextProvider';
import Auth from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import Header from '@/components/Header';
import ReceiptReviewScreen from '@/pages/ReceiptReviewScreen';

function App() {
  return (
    <Router>
      <SessionContextProvider>
        <div className="flex flex-col h-screen bg-background text-foreground">
          <Header />
          <main className="flex-grow">
            <Routes>
              <Route path="/login" element={<Auth />} />
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Dashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/review-receipt/:receiptId"
                element={
                  <PrivateRoute>
                    <ReceiptReviewScreen />
                  </PrivateRoute>
                }
              />
            </Routes>
          </main>
        </div>
      </SessionContextProvider>
    </Router>
  );
}

const PrivateRoute = ({ children }: { children: JSX.Element }) => {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return <div>Loading...</div>; // Or a spinner component
  }

  return session ? children : <Navigate to="/login" />;
};

export default App;