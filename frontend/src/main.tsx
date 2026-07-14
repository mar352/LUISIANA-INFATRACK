import React from "react";
import ReactDOM from "react-dom/client";
import App from "./ui/App";
import { initTheme } from "./lib/theme";
import "./ui/styles.css";

initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

