import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Index from "./pages/Index"; // Corrected to capital 'I'
import Login from "./pages/Login"; // Corrected to capital 'L'
import Register from "./pages/Register"; // Corrected to capital 'R'
import Admin from "./pages/Admin"; // Corrected to capital 'A'
import { SessionContextProvider } from "./components/SessionContextProvider";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <SessionContextProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Router>
      <Toaster />
    </SessionContextProvider>
  );
}

export default App;