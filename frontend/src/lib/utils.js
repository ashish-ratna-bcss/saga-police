import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function getScrollParent(el) {
  if (!el || typeof el.parentElement === "undefined") return null;

  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.getAttribute?.("data-radix-scroll-area-viewport") != null) {
      return node;
    }

    const style = typeof window !== "undefined" ? window.getComputedStyle(node) : null;
    const overflowY = style?.overflowY || "";
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }

    node = node.parentElement;
  }

  const main = typeof document !== "undefined" ? document.querySelector("main") : null;
  if (main && main.scrollHeight > main.clientHeight + 1) return main;
  return null;
}
