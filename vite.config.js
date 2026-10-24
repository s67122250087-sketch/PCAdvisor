import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serveStatic = require("serve-static");

export default defineConfig({
  plugins: [react(), {
    name: "pcadvisor-public-assets-dev",
    configureServer(server) {
      const publicPath = path.resolve(process.cwd(), "public");
      server.middlewares.use("/image", serveStatic(path.join(publicPath, "image")));
      const serveLogo = serveStatic(publicPath);
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] === "/logo01.png") return serveLogo(request, response, next);
        next();
      });
    }
  }],
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
