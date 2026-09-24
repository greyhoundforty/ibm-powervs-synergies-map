# Deploying to Vercel

This repository contains a static, zero-build web application (`index.html`, `css/`, `js/`, `data/`, `fonts/`). It can be deployed directly to Vercel either via the **Vercel Web Dashboard (Git Integration)** or the **Vercel CLI**.

---

## Option 1: Deploy via Vercel Web Dashboard (Recommended)

1. **Push your code to GitHub / GitLab / Bitbucket**:
   ```bash
   git add .
   git commit -m "feat: PowerVS Synergies Map v1"
   git push origin main
   ```

2. **Import into Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new).
   - Under **Import Git Repository**, select your repository (`powervs-synergies-map`).

3. **Configure Project Settings**:
   - **Framework Preset**: Select `Other` (or leave default).
   - **Root Directory**: `./` (leave default).
   - **Build Command**: Leave empty or `node -e "console.log('static')"` (already configured in [`package.json`](package.json:9)).
   - **Output Directory**: `./` (leave empty / default, since root contains `index.html`).
   - **Install Command**: Leave empty (no npm packages required).

4. **Click Deploy**:
   - Vercel will deploy the site in ~10 seconds and provide a production URL (e.g., `https://powervs-synergies-map.vercel.app`).

---

## Option 2: Deploy via Vercel CLI (Manual Terminal Flow)

If you have Node.js installed, you can deploy straight from your command line:

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Log in to your Vercel account**:
   ```bash
   vercel login
   ```

3. **Deploy Preview**:
   Run the `vercel` command from the root of this project:
   ```bash
   vercel
   ```
   Answer the interactive prompts:
   - *Set up and deploy “~/projects/powervs-synergies-map”?* → **Y**
   - *Which scope do you want to deploy to?* → Select your personal or team account.
   - *Link to existing project?* → **N** (for first-time setup).
   - *What’s your project’s name?* → `powervs-synergies-map` (or press Enter).
   - *In which directory is your code located?* → `./` (press Enter).
   - *Want to modify these settings?* → **N** (press Enter).

4. **Deploy to Production**:
   Once preview is verified, promote it to production:
   ```bash
   vercel --prod
   ```

---

## Verification Checklist after Deployment

- [ ] Open the deployment URL in browser.
- [ ] Verify the link to [`IBM Cloud IaaS Map`](https://ibm-cloud-synergies-map.vercel.app/?view=iaas) opens properly.
- [ ] Test node selection (e.g. clicking **PowerVS (IBM Data Center)** lights up connections).
- [ ] Test lane filter buttons (e.g. clicking **Operating Systems** or **Backups** filters lanes).
- [ ] Test search bar (e.g. searching `HANA`, `BRMS`, or `mksysb`).
- [ ] Test dark/light mode toggle.
