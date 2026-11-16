export type ComputerTheme = "light" | "dark";

export const COMPUTER_THEME_KEY = "undery-computer-theme";
export const COMPUTER_THEME_EVENT = "undery:computer-theme";
export const COMPUTER_DARK_MEDIA = "(prefers-color-scheme: dark)";

// Runs while the document is parsed, before the saved theme can flash to light.
// Only trusted constants are interpolated into this script.
export const computerThemeScript = `(function(){
  var saved = null;
  try { saved = localStorage.getItem(${JSON.stringify(COMPUTER_THEME_KEY)}); } catch {}
  var theme = saved === "light" || saved === "dark" ? saved
    : window.matchMedia(${JSON.stringify(COMPUTER_DARK_MEDIA)}).matches ? "dark" : "light";
  document.documentElement.setAttribute("data-computer-theme", theme);
})();`;
