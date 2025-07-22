import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, { ReactQueryProvider } from "@/app.tsx";
import "@/index.css";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <div className="flex h-screen w-screen">
      <div className="flex-1 p-4">
        <ReactQueryProvider>
          <App />
        </ReactQueryProvider>
      </div>
    </div>
  </StrictMode>,
);
