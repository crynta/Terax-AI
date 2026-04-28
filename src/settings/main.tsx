import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "../styles/globals.css";

import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/modules/theme";
import { SettingsApp } from "./SettingsApp";

ReactDOM.createRoot(
  document.getElementById("settings-root") as HTMLElement,
).render(
  <ThemeProvider>
    <SettingsApp />
  </ThemeProvider>,
);
