# Netlify Deployment

This frontend is a Create React App site. Netlify should build the project and publish the `build` folder.

## Netlify Settings

Use the included `netlify.toml`, or set these manually in Netlify:

```text
Build command: npm run build
Publish directory: build
```

For manual drag-and-drop deploy, run this locally first:

```powershell
npm.cmd run build
```

Then upload the `build` folder to Netlify.

## Domain Files

Do not edit files inside `build/` directly. They are generated and will be overwritten on every build.

Update source files instead:

```text
public/index.html
public/sitemap.xml
public/robots.txt
```

The production domain is set to:

```text
https://www.prakashshop.in
```

## Backend / Admin Note

Netlify static hosting will not run the Express server in `server/`.

If you need admin panel, database content, image uploads, OTP, and API routes, deploy the backend separately on a Node host such as Render/Railway and set this in Netlify environment variables before building:

```text
REACT_APP_API_URL=https://<your-backend-domain>/api
```

If you only deploy the static frontend, pages can deploy on Netlify, but backend-powered features will not work until an API backend is available.
