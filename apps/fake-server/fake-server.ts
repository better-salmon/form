import { createServer } from "node:http";
import { parse } from "node:url";

const PORT = 3001;

const server = createServer((req, res) => {
  const parsedUrl = parse(req.url ?? "", true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Parse delay from query params
  const delay = query["delay"]
    ? Number.parseInt(query["delay"] as string, 10)
    : 0;

  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const sendResponse = (statusCode: number, message: string) => {
    setTimeout(() => {
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          message,
          delay,
          timestamp: new Date().toISOString(),
        }),
      );
    }, delay);
  };

  switch (pathname) {
    case "/ok": {
      const delayMsg = delay ? `(delay: ${delay}ms)` : "";
      console.log(`[${new Date().toISOString()}] GET /ok ${delayMsg}`);
      sendResponse(200, "Success");
      break;
    }

    case "/error": {
      const delayMsg = delay ? `(delay: ${delay}ms)` : "";
      console.log(`[${new Date().toISOString()}] GET /error ${delayMsg}`);
      sendResponse(500, "Internal Server Error");
      break;
    }

    default: {
      const sanitizedPathname = pathname?.replace(/[\n\r]/g, "") ?? "";
      console.log(
        `[${new Date().toISOString()}] GET ${sanitizedPathname} - Not Found`,
      );
      sendResponse(404, "Not Found");
      break;
    }
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Fake server running on http://localhost:${PORT}`);
  console.log(`📍 Available routes:`);
  console.log(`   GET http://localhost:${PORT}/ok`);
  console.log(`   GET http://localhost:${PORT}/error`);
  console.log(`💡 Add ?delay=1000 to simulate network delay`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down fake server...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
