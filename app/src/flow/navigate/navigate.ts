export function navigate(url: string): void {
  window.location.assign(url);
}

// Callback exits replace their history entry so Back never re-runs the callback (04 EidCallback).
export function navigateReplace(url: string): void {
  window.location.replace(url);
}
