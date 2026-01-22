# Fix Netlify "refs/heads/main" Deploy Error

If your Netlify build fails with:

```
User git error while checking for ref refs/heads/main
Failing build: Failed to prepare repo
```

**Cause:** Netlify is set to deploy branch `main`, but that branch doesn't exist in the connected GitHub repo (or the repo uses `master` as default).

---

## Deploy your latest commit now (manual deploy)

**Use this to get your latest code live without fixing Git.** Builds locally and uploads `dist/` to your existing Netlify site. No Git checkout on Netlify.

### One-time setup

1. **Login to Netlify** (opens browser):
   ```bash
   cd frontend
   npx netlify-cli login
   ```

2. **Link this folder to your live site** (pick the site that’s already live):
   ```bash
   npx netlify-cli link
   ```
   Choose your team → select your **StockTake frontend** site.

### Deploy

```bash
cd frontend
npm run deploy:netlify
```

This runs `npm run build` then `netlify deploy --prod --dir=dist`. Your latest local code goes live.

**Repeat whenever you want to deploy:** commit and push to GitHub as usual, then run `npm run deploy:netlify` from `frontend/`.

---

## Fix in Netlify (Recommended)

1. Open [Netlify Dashboard](https://app.netlify.com) → your site.
2. Go to **Site configuration** → **Build & deploy** → **Continuous deployment**.
3. Under **Build settings**, find **Branch to deploy** (or **Production branch**).
4. Change it to match your GitHub repo:
   - If your repo uses **`master`**: set **Branch to deploy** → `master`.
   - If your repo uses **`main`**: set **Branch to deploy** → `main`.
5. Click **Save**.
6. Trigger a new deploy (**Deploys** → **Trigger deploy** → **Deploy site**).

---

## Fix on GitHub (If You Use `master`)

If you prefer to use `main` everywhere:

1. Open your repo on GitHub (e.g. `kaushalp3005/StockTake_frontend`).
2. Go to **Settings** → **General** → **Default branch**.
3. If it shows `master`, use **Switch to another branch** and select `main` (or create `main` from `master` first, then switch).
4. Ensure **Branch to deploy** in Netlify is set to `main` (see above).

---

## "Main" exists and settings look correct — deploy still fails

If GitHub has `main`, Netlify is set to `main`, but you still get the same error, the link between Netlify and GitHub is usually stale or lacking access.

### 1. Re-link the repository (try this first)

1. Netlify → your site → **Site configuration** → **Build & deploy** → **Continuous deployment**.
2. Under **Repository**, click **Manage repository** or **Link to a different repository**.
3. Choose **Link to a different repository**.
4. Re-select the **same** Git provider (GitHub) and the **same** repo (e.g. `kaushalp3005/StockTake_frontend`).
5. Reconnect and **Save**.
6. **Trigger deploy** → **Deploy site** (or **Clear cache and deploy site**).

This refreshes the Git connection and often fixes "refs/heads/main" even when the branch exists.

### 2. Check Netlify’s access to the repo

- **GitHub** → repo → **Settings** → **Integrations** → **Applications**.
- Find **Netlify** and ensure it has access to this repository.
- If the repo was moved, transferred, or permissions changed, **re-install** or **update** the Netlify app for this repo/org.

### 3. Clear cache and deploy

1. Netlify → **Deploys**.
2. **Trigger deploy** → **Clear cache and deploy site**.
3. Run the deploy again.

### 4. Last resort: new site, same repo

If it still fails, create a **new** Netlify site, connect it to the same GitHub repo and `main` branch, then deploy. Old sites can keep a broken Git link even after re-linking.

---

## Verify

- **GitHub:** **Code** tab → branch dropdown. Confirm you have either `main` or `master`.
- **Netlify:** **Branch to deploy** must exactly match that branch name.

After both match (and/or after re-linking), deploys should succeed.
