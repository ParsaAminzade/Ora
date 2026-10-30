# Ora source (2.5.0)

The full source of the Chrome extension and the phone/web app.

- `npm ci`
- `npm run build` → `dist/` (Chrome extension; load it in chrome://extensions)
- `npm run build:web` → `dist-web/` (phone app, served at /app by the server in `../server`)

`.env` holds only the public server address.
