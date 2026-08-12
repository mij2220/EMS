# Shopify OAuth setup (replaces the old "paste a token" flow)

What changed: EMS no longer asks you to paste a Shopify Admin API token.
Instead, clicking "Connect Shopify" redirects to Shopify, you approve access,
and Shopify redirects back with a code that EMS exchanges for a real token
automatically. This matches how the "EMS" app in Shopify's Dev Dashboard
actually works — that app type never exposes a copy-pasteable static token.

## 1. Set the app's scopes (Dev Dashboard)

In the "EMS" app (dev.shopify.com/dashboard → your app → Versions), the
scopes must be exactly:

```
read_products,write_products
```

Save/create a new version so it's Active.

## 2. Set the redirect URL (Dev Dashboard)

In the app's Configuration, find "Allowed redirection URL(s)" and add:

```
https://ems-production-786.up.railway.app/api/admin/integrations/shopify/callback
```

This must match exactly what EMS sends — a mismatch is one of the most common
OAuth errors ("redirect_uri is not allowed").

## 3. Set environment variables in Railway

From the app's Settings → Credentials page:

| Railway variable | Value |
|---|---|
| `SHOPIFY_CLIENT_ID` | the app's Client ID |
| `SHOPIFY_CLIENT_SECRET` | the app's Secret |
| `APP_URL` | `https://ems-production-786.up.railway.app` (no trailing slash) |

`JWT_SECRET` should already be set — it's reused to sign the short-lived OAuth
state token, no new secret needed there.

`APP_URL` matters more than it looks: Railway's proxy setup means the app
can't reliably detect its own public URL from the incoming request (it was
resolving to `localhost`, which Shopify then rejected as an unwhitelisted
redirect_uri). `APP_URL` is the fix — it must exactly match the domain used
in the Shopify app's "Redirect URLs" field.

The `set-shopify-credentials.sh` script sets all three for you.

## 4. Connect

In EMS: Admin → Integrations → "Connect Shopify" → enter `aimexa.myshopify.com`
→ "Continue to Shopify" → approve on the Shopify screen that appears → you're
redirected back to EMS automatically. Then click "Test Connection" to confirm
Shopify accepts the new token, and retry Sync on the Inventory page.

## Why this was necessary

Shopify's Dev Dashboard app model (the only option now — the old "Develop
apps" checkbox flow with a visible static token has been retired on this
store) only issues access tokens through a real OAuth code exchange. There's
no field anywhere in Shopify's UI containing a copy-pasteable token for this
app type — the Client ID/Secret pair you may have pasted before is for
authenticating the OAuth exchange itself, not for calling the Admin API
directly, which is why Shopify was rejecting it outright.

## 5. If Shopify still redirects to the wrong store

If, after fixing the redirect URL, clicking "Continue to Shopify" for
`aimexa.myshopify.com` still lands you on a *different* store's authorize
page (e.g. a dev store), the app itself likely isn't set up to be installed
on a real merchant store yet — Dev Dashboard apps often default to only
authorizing against your own development stores until distribution is
configured for a specific merchant. Look for a "Distribution" section in the
app's settings and check whether it's scoped to your dev store only rather
than to `aimexa.myshopify.com`.
