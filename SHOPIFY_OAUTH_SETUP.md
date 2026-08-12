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

`JWT_SECRET` should already be set — it's reused to sign the short-lived OAuth
state token, no new secret needed there.

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
