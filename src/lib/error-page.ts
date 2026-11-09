/** Standalone 500 page for when SSR itself fails, so no app CSS, fonts or images. */
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load · Viral4All Ads</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <style>
      :root { --bg: hsl(257 47% 97%); --fg: hsl(255 27% 12%); --muted: hsl(253 12% 45%); --border: hsl(260 33% 92%); --surface: #fff; --primary: hsl(262 83% 58%); --on-primary: #fff; }
      @media (prefers-color-scheme: dark) {
        :root { --bg: hsl(258 33% 6%); --fg: hsl(255 38% 96%); --muted: hsl(253 17% 67%); --border: hsl(259 23% 18%); --surface: hsl(259 26% 10%); --primary: hsl(255 92% 76%); --on-primary: hsl(259 35% 9%); }
      }
      body { font: 15px/1.5 Manrope, ui-sans-serif, system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; box-sizing: border-box; }
      main { max-width: 24rem; width: 100%; text-align: center; }
      svg { display: block; margin: 0 auto 2rem; }
      h1 { font-size: 1.5rem; letter-spacing: -0.01em; margin: 0 0 0.5rem; }
      p { color: var(--muted); font-size: 0.875rem; margin: 0 0 2rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { height: 2.5rem; padding: 0 1rem; border-radius: 0.5rem; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; display: inline-flex; align-items: center; }
      a:focus-visible, button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
      .primary { background: var(--primary); color: var(--on-primary); }
      .primary:hover { filter: brightness(1.1); }
      .secondary { background: var(--surface); color: var(--fg); border-color: var(--border); }
    </style>
  </head>
  <body>
    <main>
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" fill="var(--primary)"/><path d="M12 13l8 15 8-15" fill="none" stroke="var(--on-primary)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. Try again or go home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </main>
  </body>
</html>`;
}
