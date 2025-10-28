import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import SessionContextProvider from './components/SessionContextProvider';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Header from './components/Header';
import ReceiptReviewScreen from './pages/ReceiptReviewScreen'; // Import the new screen

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
  // In a real app, you'd have a more robust auth check
  // For now, we'll just check if there's a session in a context or similar
  // This is a placeholder for the logic you'd use with your auth provider
  const accessToken = localStorage.getItem('supabase.auth.token'); // Example check
  return accessToken ? children : <Navigate to="/login" />;
};

export default App;