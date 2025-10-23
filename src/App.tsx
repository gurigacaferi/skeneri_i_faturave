import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Index from "./pages/index"; // Changed from Index
import Login from "./pages/login"; // Changed from Login
import Register from "./pages/register"; // Changed from Register
import Admin from "./pages/admin"; // Changed from Admin
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