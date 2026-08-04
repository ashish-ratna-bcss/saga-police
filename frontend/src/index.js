import React from 'react';
import ReactDOM from 'react-dom/client';

// Globally mute console logs to keep the browser console clean
if (process.env.NODE_ENV === 'production' || true) {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.debug = () => {};
}
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
