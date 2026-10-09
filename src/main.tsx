import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installTextCaret } from "./lib/caret";
import { APPLE } from "./lib/system-font";
import "@fontsource-variable/figtree";
import "./styles.css";
import "./components/refinements.css";
import "./components/playful.css";
import "./components/apple-ui.css";
import "./components/clarity.css";
import "./components/game-type.css";
// Apple devices swap Figtree for their system font (see styles.css).
document.documentElement.classList.toggle("apple", APPLE);
installTextCaret();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
