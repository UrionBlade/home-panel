import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import "@fontsource-variable/fraunces";
import "@fontsource-variable/geist";

import "./styles/tokens.css";
import "./styles/night-mode.css";

import { initAudioPrimer } from "./lib/timers/alertSound";

// Unlock the AudioContext on first user interaction
initAudioPrimer();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
