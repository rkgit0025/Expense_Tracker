# Deployment notes

## File uploads failing in production but not locally (413 / "Upload failed")

**Symptom:** uploading a receipt (or any file) works when running the app
locally, but fails on production with a generic "Upload failed." message —
even for files well under the app's own 5 MB limit.

**Cause:** locally you talk to the Node server directly. In production this
app almost always sits behind a reverse proxy (nginx is the common case for
a self-hosted Node + MySQL deployment like this one). That proxy enforces
**its own** upload size cap before the request ever reaches this app —
nginx's default is `client_max_body_size 1m`, i.e. **1 MB**. Since this
app's own limits are already set to 5 MB in two places:

- `backend/middleware/upload.js` → multer `limits: { fileSize: 5 * 1024 * 1024 }`
- `backend/server.js` → `express.json({ limit: '10mb' })` / `express.urlencoded({ limit: '10mb' })`

...any file between 1 MB and 5 MB will pass every check *in this app* and
still get rejected — by the proxy, before this app ever sees it. Because the
proxy's rejection page is HTML, not JSON, the frontend can't read a
`.message` out of it, which is why the error shown used to be a generic
"Upload failed." with no real explanation. (The frontend now recognizes this
specific failure shape — a 413 with no JSON body, or a request that gets no
response at all — and names the likely cause instead of showing that
generic message; see `frontend/src/components/ExpenseForm/Section7_Receipts.jsx`.)

**Fix — nginx:** in the server block proxying this app, set the body size
limit to match (or exceed) this app's own 5 MB limit:

```nginx
server {
    # ... existing config ...

    client_max_body_size 5m;   # must be >= the app's own upload limit

    location /api/ {
        proxy_pass http://localhost:5000;
        # ... existing proxy config ...
    }
}
```

Then reload nginx: `sudo nginx -t && sudo systemctl reload nginx`.

**If you're using something other than nginx:** the same idea applies —
whatever sits in front of the Node app (Apache, Caddy, a load balancer, a
PaaS platform) has its own body-size setting, and it needs to be at or above
5 MB too. Apache: `LimitRequestBody` in the relevant `<Directory>`/`<Location>`
block. Caddy: `request_body { max_size 5MB }`.

**To confirm this is the cause** before changing anything: try the failing
upload again and check the browser's Network tab (or ask the user to). A
`413` status code on the upload request confirms a proxy-level rejection,
not an app-level one — the app's own multer limit returns a `400` with a
specific JSON message ("File size exceeds 5 MB limit."), not a `413`.

## Other things that differ between local and production for this app

- **CORS**: `backend/.env`'s `CLIENT_URL` must exactly match the production
  frontend's origin (protocol + domain, no trailing slash), or every API
  call — not just uploads — will fail. If uploads are the *only* thing
  failing, CORS is already fine and isn't the cause.
- **Uploaded file storage**: receipts are written to `backend/uploads/` on
  local disk (see `UPLOAD_DIR` in `backend/middleware/upload.js`), not to
  any cloud storage. Make sure that directory persists across deploys/restarts
  and has enough free disk space — a full disk fails uploads with an error
  that also won't look like a size-limit problem at first glance.
