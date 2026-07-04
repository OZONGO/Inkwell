import React from "react";
import ReactDOM from "react-dom/client";
import { SettingsApp } from "./components/SettingsApp";
import "./styles/base.css";
import "./styles/settings.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>,
);
