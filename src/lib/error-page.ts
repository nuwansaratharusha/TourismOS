export function renderErrorPage(error?: any): string {
  const message = error instanceof Error ? error.message : (typeof error === "string" ? error : "");
  const stack = error instanceof Error ? error.stack : "";
  const errorDetailsHtml = message ? `
    <div style="margin-top: 1.5rem; padding: 1rem; background: #fef2f2; border: 1px solid #fee2e2; border-radius: 0.5rem; text-align: left; font-family: monospace; font-size: 0.75rem; white-space: pre-wrap; overflow-x: auto; max-height: 24rem;">
      <p style="color: #dc2626; font-weight: bold; margin: 0 0 0.5rem;">Error: ${message}</p>
      <div style="color: #4b5563; line-height: 1.5;">${stack || ""}</div>
    </div>
  ` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 32rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; margin-top: 1.5rem; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      ${errorDetailsHtml}
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
