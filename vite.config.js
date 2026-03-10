import { defineConfig, loadEnv } from "vite";
import process from "node:process";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const config = {
    plugins: [react()],
    base: "/",
  };

  // Production base path for GitHub Pages or custom domain.
  if (command !== "serve") {
    config.base = env.VITE_APP_BASE || "/PCcollecting/";
  }

  return config;
});
