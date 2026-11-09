const RELOAD_KEY = "bica-module-reload";

export function takeReloadToken() {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function clearModuleReloadToken() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* private mode */
  }
}
