import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "nz.leadstory.breakingnews",
  appName: "Breaking News",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // Uncomment for live reload during development:
    // url: "http://YOUR_LOCAL_IP:5173",
    // cleartext: true,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    StatusBar: {
      style: "dark",
      backgroundColor: "#000000",
    },
  },
};

export default config;
