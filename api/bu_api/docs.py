"""Swagger UI shell; the specification and API requests still require a password."""

SWAGGER_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BU Student API — Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; background: #fafafa; font-family: sans-serif; }
    .intro { max-width: 1400px; margin: 24px auto; padding: 0 20px; }
    label { display: block; margin-bottom: 8px; }
    input, button { font: inherit; padding: 10px; }
    input { width: min(320px, 80%); }
    button { cursor: pointer; }
    #status { min-height: 1.5em; }
  </style>
</head>
<body>
  <div class="intro">
    <h1>BU Student API documentation</h1>
    <p>Enter the shared API password to load the schema and try requests.
       Each request also needs a user: alex, maya, jordan, sam, or taylor.</p>
    <form id="unlock">
      <label for="password">Shared API password</label>
      <input id="password" type="password" autocomplete="off" required>
      <button type="submit">Authorize &amp; load docs</button>
    </form>
    <p id="status" role="status" aria-live="polite"></p>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    const form = document.getElementById('unlock');
    const status = document.getElementById('status');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.getElementById('password');
      const password = input.value;
      const button = form.querySelector('button');
      button.disabled = true;
      status.textContent = 'Loading documentation…';
      try {
        const response = await fetch('/openapi.json?user=alex', {
          headers: { Authorization: `Bearer ${password}` },
          cache: 'no-store',
          credentials: 'omit'
        });
        if (!response.ok) {
          throw new Error(response.status === 401
            ? 'Incorrect API password. Please try again.'
            : 'Documentation is temporarily unavailable. Please try again.');
        }
        const spec = await response.json();
        const ui = SwaggerUIBundle({
          spec,
          dom_id: '#swagger-ui',
          deepLinking: true,
          docExpansion: 'list',
          filter: true,
          persistAuthorization: false,
          validatorUrl: null,
          presets: [SwaggerUIBundle.presets.apis],
          onComplete: () => ui.preauthorizeApiKey('HTTPBearer', password)
        });
        input.value = '';
        form.hidden = true;
        status.textContent = 'Authorized. Expand an endpoint and choose Try it out. '
          + 'Use the Authorize button to change the password.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>
"""
