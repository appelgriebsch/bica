/**
 * Install hint per platform. Chrome's "Google português do Brasil" is pt-BR, so it
 * never qualifies; Edge's "Online (Natural)" pt-PT voices are network-only and are
 * used only while online — the hints point at the local voices.
 */
export function voiceInstallHint(ua: string, touchMac = false): string {
  if (/iPad|iPhone|iPod/.test(ua) || touchMac)
    return "Settings › Accessibility › Spoken Content › Voices › Portuguese (Portugal): Joana.";
  if (/Android/.test(ua))
    return "Settings › Text-to-speech › Google › Install voice data › Português (Portugal).";
  if (/Mac OS X|Macintosh/.test(ua))
    return "System Settings › Accessibility › Spoken Content › System voice › Manage Voices › Portuguese (Portugal): Joana or Catarina.";
  if (/Windows/.test(ua))
    return "Settings › Time & language › Language › add Português (Portugal) with speech (voice: Helia).";
  return "Install a Portuguese (Portugal) voice, e.g. espeak-ng pt-PT.";
}
