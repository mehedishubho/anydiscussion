# DNS + Email Deliverability Runbook (DKIM / SPF / DMARC)

Publishing DKIM, SPF, and DMARC DNS records at Cloudflare for the Resend email
channel, then verifying real-inbox delivery of the auth emails (password-reset
and email-verification). This closes the AUTH-06/07 verification debt (D-33)
that has been parked since Phase 2.

> References: D-33 (close AUTH-06/07 inbox-delivery debt), Pitfall 6 (Resend
> auto-generates DKIM + SPF but does NOT auto-generate DMARC -- the operator
> authors it manually). The email channel is Resend SMTP via
> `src/lib/email/index.ts`, and the from-address is the `EMAIL_FROM` env var
> (e.g. `no-reply@mail.anydiscussion.com`). Without these records, auth emails
> land in spam or are rejected.

## Prerequisites

- A Resend account with the mail-sending domain added (e.g.
  `mail.anydiscussion.com` or `anydiscussion.com`). Resend generates the DKIM
  and SPF records for this domain in its dashboard.
- Access to the Cloudflare DNS dashboard for `anydiscussion.com`.
- A REAL inbox you control at a major provider (Gmail or Outlook) for the
  deliverability test. A disposable/throwaway inbox is not sufficient -- it must
  be a primary inbox where you can see spam vs. primary placement.
- The blog deployed to production (see coolify-deploy.md), so you can trigger
  real auth emails from `https://anydiscussion.com`.
- `EMAIL_FROM` set in Coolify to the verified from-domain (e.g.
  `no-reply@mail.anydiscussion.com`), and `RESEND_API_KEY` set.

## Steps

### 1. Retrieve the DKIM and SPF records from Resend

Resend auto-generates DKIM and SPF for the mail-sending domain.

1. Log in to the Resend dashboard.
2. Go to **Domains**, select the mail-sending domain (e.g.
   `mail.anydiscussion.com`).
3. Open the **DNS Records** section. Resend shows:
   - A **DKIM** record (typically a CNAME pointing at a Resend/AWS SES host).
   - An **SPF** TXT record (including the `amazonses.com` mechanism, because
     Resend sends via AWS SES).
4. Copy both record values exactly. Do NOT modify them -- they are
  cryptographically tied to your Resend account.

### 2. Publish the DKIM record (CNAME) at Cloudflare

1. In the Cloudflare dashboard: **DNS -> Records -> Add record**.
2. Type: **CNAME**.
3. Name: the host Resend specifies (e.g. the selector prefix, such as
   `resend._domainkey` -- use exactly what Resend shows for the domain).
4. Target: the Resend-provided DKIM target.
5. **Proxy status: DNS only** (grey cloud). Email-verification DNS records must
  NOT be proxied through Cloudflare's HTTP proxy.
6. Save.

### 3. Publish the SPF record (TXT) at the domain

1. Cloudflare: **DNS -> Records -> Add record**.
2. Type: **TXT**.
3. Name: the host Resend specifies for SPF (often the mail-sending subdomain or
   the domain apex -- use exactly what Resend shows).
4. Value: the SPF record Resend provides. It includes the `amazonses.com`
   mechanism because Resend relays through AWS SES. Example shape (use the exact
   value Resend gives you, do not hand-edit):

   ```
   v=spf1 include:amazonses.com ~all
   ```

5. Save.

> If the host already has an SPF TXT record (e.g. for another sender), you MUST
> merge the mechanisms into a SINGLE SPF record. Multiple SPF records on one host
> cause SPF to fail. Merge, do not add a second.

### 4. Author and publish the DMARC record (TXT) at _dmarc.<domain> (Pitfall 6)

Resend does NOT auto-generate a DMARC record. The operator authors it manually
(Pitfall 6). Start in MONITORING mode -- `p=none` -- so you can observe
alignment without risking legitimate mail being rejected. You will tighten it in
step 8 after the inbox test passes.

1. Cloudflare: **DNS -> Records -> Add record**.
2. Type: **TXT**.
3. Name: `_dmarc.<mail-sending-domain>` -- e.g. `_dmarc.mail.anydiscussion.com`
   (use the exact domain Resend verified; if Resend verified the apex, use
   `_dmarc.anydiscussion.com`).
4. Value (monitoring mode -- START HERE):

   ```
   v=DMARC1; p=none; rua=mailto:<operator-email>;
   ```

   Replace `<operator-email>` with a real inbox you monitor. The `rua` address
   receives aggregate DMARC reports.
5. Save.

> Do NOT start at `p=quarantine` or `p=reject`. A misaligned record in
> enforcement mode can send your own auth emails to spam or reject them outright.
> Always begin with `p=none` and tighten only after the inbox test passes.

### 5. Wait for DNS propagation + Resend verification

1. Wait for DNS to propagate (typically 5-30 minutes; can be longer for some
   resolvers). Verify with a public DNS lookup:

   ```
   dig _dmarc.<mail-sending-domain> TXT +short
   ```

   It must return the DMARC record from step 4. Also confirm the DKIM CNAME and
   SPF TXT resolve.
2. In the Resend dashboard, the domain's **Status** column should move to
   **Verified** once Resend detects the DKIM and SPF records. If it stays
   unverified, re-check the record values and the DNS-only proxy status.

### 6. Real-inbox test -- password-reset email

1. Visit `https://anydiscussion.com/forget-password`.
2. Enter the email address of a REAL inbox you control (Gmail or Outlook primary
   inbox -- not a throwaway). Use an address that is a registered user, OR an
   unknown address (Better Auth returns the same response either way due to
   email-enumeration protection in `src/lib/auth/index.ts`); to actually inspect
   the email, use a registered user address.
3. Wait up to 2 minutes.
4. Confirm the password-reset email arrives in the PRIMARY inbox (not spam, not
   the Promotions/Updates tab). If it lands in spam, do NOT proceed -- diagnose
   first (typically DMARC/SPF misalignment; check the email's
   Authentication-Results header).

> Triggering the reset goes through Better Auth's `sendResetPassword` hook in
> `src/lib/auth/index.ts`, which calls `sendEmail` from `src/lib/email/index.ts`
> (Resend). The email's from-address is the `EMAIL_FROM` env var.

### 7. Real-inbox test -- email-verification email

1. Trigger an email-verification email. The cleanest path is the dashboard
   user-create flow: create a new user (admin action) which fires
   `sendVerificationEmail` (`sendOnSignUp: true` in `src/lib/auth/index.ts`), OR
   resend verification for an existing unverified user.
2. Use the SAME real inbox as step 6 so the two tests are comparable.
3. Confirm the email-verification email arrives in the PRIMARY inbox (not spam).

### 8. Tighten DMARC to p=quarantine (only after BOTH inbox tests pass)

Once both the password-reset and email-verification emails land in the primary
inbox:

1. Edit the DMARC TXT record at `_dmarc.<mail-sending-domain>` in Cloudflare.
2. Change `p=none` to `p=quarantine`:

   ```
   v=DMARC1; p=quarantine; rua=mailto:<operator-email>;
   ```

3. Save. Wait for propagation.
4. (Optional future hardening, NOT for v1 launch): after a monitoring period
   with no false positives in the `rua` reports, consider `p=reject`. This is a
   later decision -- do not rush it.

### 9. Document the test outcome

Record (in the operator notes / STATE.md verification-debt update):
- Which email provider was used for the inbox test (e.g. Gmail).
- Which emails were tested (password-reset + email-verification).
- Confirmation both landed in the primary inbox (screenshots or text logs).
- The final DMARC record value (`p=quarantine` after tightening).
- Mark the AUTH-06/07 verification-debt note in STATE.md as closed (D-33 done).

## Verification

### V1. DNS records published

From a terminal, confirm all three records resolve (replace
`<mail-sending-domain>`):

```
dig <dkim-host> CNAME +short        # returns the Resend DKIM target
dig <spf-host> TXT +short           # returns the SPF record incl. amazonses.com
dig _dmarc.<mail-sending-domain> TXT +short   # returns v=DMARC1; ...
```

All three must return the expected values.

### V2. Resend domain Verified

The Resend dashboard shows the mail-sending domain status as **Verified**.

### V3. Password-reset email in primary inbox

The password-reset email triggered at `/forget-password` arrived in the PRIMARY
inbox (not spam) of the test email provider. Capture a screenshot or the email
headers showing `Authentication-Results: ... spf=pass dkim=pass dmarc=pass`.

### V4. Email-verification email in primary inbox

The email-verification email triggered via the user-create flow arrived in the
PRIMARY inbox (not spam). Same header check.

### V5. DMARC tightened

`dig _dmarc.<mail-sending-domain> TXT +short` returns a record containing
`p=quarantine` (the post-test value). The original `p=none` monitoring value is
no longer the live record.

## Rollback

### Rollback (emails landing in spam / being rejected)

If tightening to `p=quarantine` causes deliverability problems:

1. Revert the DMARC record to monitoring mode: `v=DMARC1; p=none;
   rua=mailto:<operator-email>;`. Wait for propagation.
2. Inspect the `rua` aggregate reports (emailed to the `rua` address) to find
   which sources are failing DKIM/SPF alignment. Common causes: a second sender
   not covered by SPF, or `EMAIL_FROM` using a domain whose DKIM does not align
   with the `From` header.
3. Do NOT re-tighten until the reports show alignment is clean.

If a DNS record was published incorrectly:
1. Edit the record in Cloudflare to the correct value (do not delete-and-recreate
   unless necessary).
2. Lower the TTL temporarily during diagnosis so changes propagate faster.
3. Re-run the verification dig commands.

### Troubleshooting

- **Resend domain stays Unverified:** confirm the DKIM CNAME and SPF TXT match
  Resend's values EXACTLY (no trailing spaces, correct host), and that the
  Cloudflare proxy is DNS-only (grey cloud) for these records -- proxied records
  break email verification.
- **Emails land in spam despite DKIM/SPF pass:** DMARC is missing or
  misaligned. Confirm the DMARC record is published at the correct host
  (`_dmarc.<mail-sending-domain>` matching the verified domain), and that
  `EMAIL_FROM`'s domain matches the DMARC domain. Check the email's
  `Authentication-Results` header for `dmarc=pass`.
- **Multiple SPF records:** SPF fails if a host has more than one SPF TXT
  record. Merge all senders into a single `v=spf1 ...` record.
- **Reset email never arrives at all (not even in spam):** check that
  `RESEND_API_KEY` and `EMAIL_FROM` are set in Coolify, that the from-domain is
  Resend-verified, and that `src/lib/email/index.ts` is not silently swallowing a
  send error (check the server logs for the structured
  `{level:"error", msg:"email send failed"}` line). The helper logs and does not
  throw (fire-and-forget per R8), so a send failure shows only in logs.
- **Rate limit blocks the test:** the `/forget-password` endpoint is rate-limited
  to 3 requests / 15 min (`src/lib/auth/index.ts` `rateLimit.customRules`). If
  you hit the limit during testing, wait 15 minutes or test from a different IP.
