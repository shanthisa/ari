// Client-side event-mode flags (no React / Hono).

/** sessionStorage flag set on "Exit event mode" so auto-detect doesn't bounce
 * the user straight back into the capture screen. */
export const EXIT_FLAG = "ari:exited-capture";

/** localStorage preference: when "1", never auto-open capture on mobile. */
export const NO_AUTO_CAPTURE = "ari:no-auto-capture";
