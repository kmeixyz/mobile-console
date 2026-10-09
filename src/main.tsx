import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installTextCaret } from "./lib/caret";
import "./styles.css";
import "./components/refinements.css";
import "./components/playful.css";
import "./components/apple-ui.css";
import "./components/clarity.css";
installTextCaret();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
