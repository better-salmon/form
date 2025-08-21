import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/app.tsx";
import "@/index.css";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
