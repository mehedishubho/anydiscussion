# Umami Analytics Deploy Runbook

Deploying Umami as a self-hosted analytics service on Coolify, wiring its script
into the public blog via the Phase 6 analytics-injection mechanism, and securing
the default credentials.

> References: ANAL-02 (Umami deployment), D-24 (Coolify Docker service),
> D-25 (same Postgres, separate database), D-26 (settings-stored script
> injection), D-27 (analytics.anydiscussion.com subdomain), Pitfall 5 (default
> admin/umami password must change immediately). The injection mechanism is
> `src/components/site/Analytics.tsx`, which reads the `analytics.script` (URL)
> and `analytics.umami_id` settings and renders a validated `<script>` tag.

## Prerequisites

- A working Coolify project with the blog deployed (see coolify-deploy.md).
- The managed Postgres service reachable from Coolify services (shared instance,
  D-25). You will create a SEPARATE database named `umami` on the SAME Postgres
  server -- do not reuse the blog database.
- The `analytics.anydiscussion.com` DNS record (A/AAAA) pointing at the Coolify
  VPS.
- A password manager entry ready to store the new Umami admin password.

## Steps

### 1. Create the Umami database (separate database, shared Postgres -- D-25)

Connect to the managed Postgres and create a dedicated database for Umami. It
shares the Postgres server with the blog but is a separate database so analytics
queries and tables never affect the blog schema or performance.

```
psql "<blog-postgres-connection-string>" -c "CREATE DATABASE umami;"
```

Record the Umami connection string (same host/user/password as the blog
Postgres, but database name `umami`):

```
postgresql://<user>:<pw>@<postgres-host>:5432/umami
```

### 2. Create the Umami Coolify service (D-24)

1. In Coolify: **Services -> Add Service** (or **New Resource -> Docker Compose
   empty**), then configure the Umami service.
2. Image (official, verified source -- T-07-04-SC mitigation):

   ```
   docker.umami.is/umami-software/umami:postgresql-latest
   ```

3. Port: expose Umami on `3001` internally. Coolify's proxy routes
   `https://analytics.anydiscussion.com` to this port (D-27). (Umami listens on
   3000 by default; map/host as 3001 or whatever the Coolify service expects --
   the external port is irrelevant because Coolify's proxy terminates TLS.)
4. Set the domain: `https://analytics.anydiscussion.com`. Coolify auto-provisions
   the Let's Encrypt certificate for this subdomain (D-27).
5. Set the restart policy to `unless-stopped`.

### 3. Configure the Umami environment

Set the Umami service environment variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://<user>:<pw>@<postgres-host>:5432/umami` (the `umami` database from step 1) |
| `APP_SECRET` | `openssl rand -base64 32` (Umami's own session/secret) |

Note: Umami ships as a prebuilt image and DOES include its own schema
migration -- on first boot Umami auto-migrates the `umami` database. There is NO
manual migration step (D-25 confirmed: docs.umami.is/docs/install).

### 4. First boot and IMMEDIATE password change (Pitfall 5)

Umami ships with default credentials `admin` / `umami`
(docs.umami.is/docs/install). Anyone who finds `analytics.anydiscussion.com` can
log in until the password is changed.

1. Start the Umami service. Confirm
   `https://analytics.anydiscussion.com` shows the Umami login screen.
2. Log in with username `admin` and password `umami`.
3. IMMEDIATELY change the default password: **Profile -> Settings -> Password**
   (or the user profile page). Choose a strong, unique password.
4. Store the new password in the operator's password manager.

> This is a hard requirement (Pitfall 5 / T-07-04-02). Do not leave the default
> password in place, even briefly. The Task 2 acceptance criterion is that the
> operator confirms the default password is changed.

### 5. Register the website and retrieve the script tag

1. Still logged into Umami, go to **Settings -> Websites -> Add website**.
2. Set the website:
   - **Name:** `Any Discussion`
   - **Domain:** `anydiscussion.com` (Umami accepts the apex; it tracks both
     `anydiscussion.com` and `www.anydiscussion.com`).
3. Save. Umami generates a tracking script and a website id. The script tag has
   the form:

   ```
   <script async defer src="https://analytics.anydiscussion.com/script.js" data-website-id="<WEBSITE_ID>"></script>
   ```

4. Copy the `src` URL (`https://analytics.anydiscussion.com/script.js`) and the
   `data-website-id` value (`<WEBSITE_ID>`). You need these two values, not the
   raw HTML.

### 6. Wire the script into the public blog (D-26 -- configuration only)

The Phase 6 analytics-injection mechanism is already coded
(`src/components/site/Analytics.tsx`). It reads two settings keys and renders a
validated `<script>` tag. This step is configuration only -- NO code change.

1. In the blog admin, navigate to **/dashboard/settings/seo**.
2. In the analytics injection fields, set:
   - `analytics.script` = `https://analytics.anydiscussion.com/script.js`
     (the `src` URL from step 5)
   - `analytics.umami_id` = `<WEBSITE_ID>` (the `data-website-id` from step 5)
3. Save the settings.

How injection works (so you know what to expect):
- `src/components/site/Analytics.tsx` reads `analytics.script` and
  `analytics.umami_id` from the `settings` table, then emits
  `<script async src={url} data-website-id={id} />`.
- It VALIDATES that the script URL uses the `https:` scheme (T-06-05 mitigation).
  If you accidentally enter an `http:`, `data:`, or `javascript:` URL, the
  component renders nothing -- so use the `https://analytics.anydiscussion.com/`
  URL exactly.
- If both settings are empty, Analytics renders nothing (the pre-configure
  default). This is why the blog shipped without analytics in earlier phases.

### 7. Confirm SSL for the analytics subdomain (D-27)

Coolify's proxy auto-provisions the Let's Encrypt certificate for
`analytics.anydiscussion.com`. Confirm `https://analytics.anydiscussion.com`
loads over TLS with a valid certificate. No manual cert step is needed.

## Verification

### V1. Umami is reachable

Open `https://analytics.anydiscussion.com`. The Umami login screen must load
over HTTPS with a valid certificate. Log in with the NEW password (not the
default).

### V2. The script loads on the public site

1. Visit `https://anydiscussion.com`.
2. Open the browser DevTools Network tab.
3. Confirm a request to `https://analytics.anydiscussion.com/script.js` is made
   (status 200) and the `data-website-id` attribute matches `<WEBSITE_ID>`.
4. Back in the Umami dashboard, open the website's real-time / visitors view.
   Trigger a pageview (reload the public site) and confirm Umami records the
   visit within a few seconds.

### V3. Default password is changed

Confirm you can no longer log in with `admin` / `umami`, and that the new
password works. The operator records the new password in the password manager.

### V4. Settings are persisted

In `/dashboard/settings/seo`, confirm `analytics.script` and
`analytics.umami_id` are saved with the correct values. If the public site is
not loading the script, this is the first place to check.

## Rollback

### Rollback (disable analytics)

To stop loading Umami without taking the service down:
1. In `/dashboard/settings/seo`, clear the `analytics.script` and
   `analytics.umami_id` values and save.
2. The `Analytics` component renders nothing (its default behavior) -- no script
   loads on the public site.
3. To fully remove Umami: stop and delete the Umami Coolify service, and
   optionally `DROP DATABASE umami;` on the shared Postgres. Keep the database
   if you may redeploy later (it holds historical analytics data).

### Troubleshooting

- **Login fails with `admin` / `umami`:** the password was already changed (good)
  -- use the password manager. If the password manager is also unavailable, you
  can reset it via the Umami database (Umami stores user records in the `umami`
  database) -- but this is an operator emergency step, document it carefully.
- **`https://analytics.anydiscussion.com` does not load:** confirm DNS resolves
  to the Coolify VPS, the Umami service is running, and the Coolify proxy routes
  the subdomain to the Umami container port. Check Coolify logs for the Umami
  service.
- **Umami first-boot migration error:** confirm `DATABASE_URL` points at the
  `umami` database (not the blog database) and that the Postgres user can create
  tables in it. Umami auto-migrates; if it errors, the connection string or
  permissions are wrong.
- **Script not loading on the public site:** check (a) the settings are saved in
  `/dashboard/settings/seo`, (b) the URL is `https:` (the component rejects
  non-https), (c) `src/components/site/Analytics.tsx` is rendered in the
  `(site)` layout, (d) the `cacheTag("seo-settings")` revalidation fired after
  you saved settings (run `saveSeoSettings` which calls
  `revalidateTag("seo-settings","max")`).
- **No visits recorded despite the script loading:** confirm the `data-website-id`
  matches the website registered in Umami, and that the Umami domain setting
  matches `anydiscussion.com`.

### Backup note

The `umami` database holds historical analytics data. Include it in the Phase 8
backup scope (it is on the shared Postgres, so a full Postgres dump covers it --
just ensure the dump includes all databases, not only the blog database).
