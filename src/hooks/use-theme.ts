import { useSyncExternalStore } from "react";

export const THEME_KEY = "v4a-theme";

const isDark = () => document.documentElement.classList.contains("dark");

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Light/dark theme. The class on <html> is the source of truth; the choice is saved per browser. */
export function useTheme() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const setDark = (next: boolean) => {
    const root = document.documentElement;
    root.classList.toggle("dark", next);
    root.style.colorScheme = next ? "dark" : "light";
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // private mode: the choice just lasts for this page
    }
  };
  return { dark, setDark, toggle: () => setDark(!isDark()) };
}
