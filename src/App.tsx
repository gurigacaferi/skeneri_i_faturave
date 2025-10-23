import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Index from "./pages/index";
import Login from "./pages/login";
import Register from "./pages/register";
import Admin from "./pages/admin";
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