import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";

// This comment is added to force a new commit and resolve the synchronization issue.
createRoot(document.getElementById("root")!).render(<App />);