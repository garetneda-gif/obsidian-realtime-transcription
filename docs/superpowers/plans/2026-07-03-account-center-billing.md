# Account Center Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recharge usable through the common Obsidian paid-plugin pattern: plugin opens a browser account center, while payment, orders, balance, and usage live on the billing server.

**Architecture:** Reuse the existing Flask billing server and prepaid order flow. Add one server-hosted account page with HttpOnly cookie login for browser use; keep plugin API calls bearer-token based. Remove the plugin's embedded payment-state UI and replace it with an account-center button.

**Tech Stack:** Flask, SQLAlchemy, HttpOnly cookies, existing Xunhu payment wrapper, TypeScript, Obsidian settings UI, pytest, node:test.

---

## File Structure

- `billing-server/account_center.py`: Serve the account center HTML.
- `billing-server/account_center.html`: Browser UI for login/register/logout, balance, usage, order creation, and order refresh.
- `billing-server/auth.py`: Add browser-session cookies without changing plugin token responses.
- `billing-server/billing.py`: Let read-only account/usage endpoints accept browser cookies; keep report settlement bearer-only.
- `billing-server/payment_xunhu.py`: Use server-owned account-center return URL and allow account-center cookie auth for recharge/order endpoints.
- `billing-server/config.py`: Require `BS_PUBLIC_SERVER_URL` in production so payment returns to the trusted account page.
- `billing-server/app.py`: Register the account-center route.
- `billing-server/tests/test_account_center.py`: Cover the browser page and cookie auth contract.
- `billing-server/tests/test_payment.py`: Cover trusted return URL and cookie-authenticated recharge.
- `src/services/CloudAuthService.ts`: Add account-center URL helper; remove plugin-side recharge/order helpers.
- `src/settings.ts`: Replace embedded recharge/check-order UI with one account-center button.
- `src/i18n.ts`: Add account-center labels and remove stale recharge labels.
- `tests/cloudAuthService.test.ts`, `tests/aiBackendConnection.test.ts`: Update client expectations.
- `README.md`, `README_EN.md`: Document account-center billing deployment.

---

### Task 1: Browser Account Auth

- [x] Add HttpOnly `rt_access` and `rt_refresh` cookies for `/api/auth/register`, `/api/auth/login`, and `/api/auth/refresh` when `browser_session` is true.
- [x] Add `/api/auth/logout` to clear those cookies.
- [x] Add a cookie-only auth helper for account-center endpoints.
- [x] Keep existing JSON token responses unchanged for plugin login/register/refresh.
- [x] Verify: `billing-server/.venv311/bin/python -m pytest billing-server/tests/test_auth.py billing-server/tests/test_account_center.py -q` exits 0 and browser-session JSON omits token fields.

### Task 2: Account Center Page

- [x] Serve `/account` from Flask.
- [x] Implement a static page that logs in/registers with `browser_session: true`, refreshes account/usage, creates a recharge order, opens the payment URL, refreshes order status, and logs out.
- [x] Do not store access tokens in localStorage or expose bearer tokens in page JS.
- [x] Verify: `billing-server/.venv311/bin/python -m pytest billing-server/tests/test_account_center.py -q` exits 0 and page source contains the expected billing API paths but not `Authorization` or `rtCloudToken`.

### Task 3: Trusted Recharge Flow

- [x] Generate payment return URLs from `BS_PUBLIC_SERVER_URL + /account?order=<id>`.
- [x] Ignore client-supplied return URLs for recharge.
- [x] Require `BS_PUBLIC_SERVER_URL` in production config.
- [x] Keep ASR signing and usage settlement bearer-only.
- [x] Verify: `billing-server/.venv311/bin/python -m pytest billing-server/tests/test_payment.py billing-server/tests/test_config.py -q` exits 0 and malicious client `return_url` is ignored.

### Task 4: Plugin Settings Entry

- [x] Add an “Account Center” button next to the cloud server URL/account state.
- [x] Remove plugin-side create-order, pending-order, and check-order UI.
- [x] Keep plugin login/register/refresh/balance behavior for hosted cloud ASR.
- [x] Verify: `npm run build`, `node --test tests/cloudAuthService.test.ts tests/aiBackendConnection.test.ts`, and `npx tsc --noEmit --outDir /tmp/rt-tsc-check` exit 0.

### Task 5: Verification

- [x] Run `billing-server/.venv311/bin/python -m pytest billing-server/tests -q`.
- [x] Run `npm run build`.
- [x] Run `node --test tests/*.test.ts`.
- [x] Run `npx tsc --noEmit --outDir /tmp/rt-tsc-check`.
- [x] Run `cd billing-server && .venv311/bin/python self_check.py`.
- [x] Start Flask with a temp SQLite DB and `BS_PUBLIC_SERVER_URL=http://127.0.0.1:<port>`; verify `/account` loads, browser-session register can read `/api/billing/me`, logout makes `/api/billing/me` return 401, and normal JSON-token registration still returns `token`.
- [x] Run `bash scripts/post-sync-refresh.sh --vault "/Users/jikunren/笔记/大二下笔记" --vault-name "大二下笔记"`; expected output says the plugin was synced/reloaded.
