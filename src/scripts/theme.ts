export const THEMES = ['auriu', 'albastru', 'verde', 'violet'];

/** Applies the organiser's accent colour; anything unknown means the default one. */
export function setTheme(theme: string) {
  if (THEMES.includes(theme)) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
