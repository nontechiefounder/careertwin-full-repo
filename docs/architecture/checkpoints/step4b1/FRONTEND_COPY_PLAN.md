# Frontend Copy Plan (Step 4B1)

**Source Directory:** `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/live-mvp-readonly`  
**Target Destination:** `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/apps/web`  
**Phase:** Source Preservation Only  

---

## 1. Copy Objectives & Boundaries

The goal of Step 4B1 is to copy the existing live Next.js web application into `careertwin-monorepo/apps/web` exactly as it exists in the source repository, maintaining 100% file content and hash parity for all application assets while excluding build artifacts, local secrets, temporary scripts, and obsolete files.

### Strictly Preserved Items
1. Directory structure and path layout under `app/`, `components/`, `hooks/`, `lib/`, `public/`, `data/`, `__tests__/`
2. Package manifest (`package.json`) and exact package lockfile (`package-lock.json`)
3. Next.js configuration (`next.config.mjs`), PostCSS config (`postcss.config.mjs`), ESLint config (`eslint.config.mjs`), Vitest config (`vitest.config.mjs`), JSConfig (`jsconfig.json`)
4. All application pages, API route handlers, UI component wrappers, styling files (`app/globals.css`), and public SVG/logo assets
5. Existing JavaScript/JSX code formats, imports, and business logic
6. Source `AGENTS.md` file

### Target Placeholder Removal
- `careertwin-monorepo/apps/web/.gitkeep` will be removed upon copying the frontend folder contents into `apps/web`.

---

## 2. Copy Command & Operation Sequence

The copying operation will be performed cleanly via shell file copying excluding git metadata, build directories, local environment secrets, node_modules, and obsolete items:

```bash
# Target directory setup
mkdir -p "careertwin-monorepo/apps/web"
rm -f "careertwin-monorepo/apps/web/.gitkeep"

# Copy frontend source files selectively
rsync -av --exclude='.git' \
          --exclude='.next' \
          --exclude='.vercel' \
          --exclude='.vscode' \
          --exclude='node_modules' \
          --exclude='.env' \
          --exclude='.env.local' \
          --exclude='.env.production' \
          --exclude='.DS_Store' \
          --exclude='__MACOSX' \
          --exclude='test-ai.js' \
          --exclude='app/api/dev' \
          --exclude='components/NaiveShell.jsx' \
          --exclude='scratch' \
          "live-mvp-readonly/" "careertwin-monorepo/apps/web/"
```

---

## 3. Post-Copy Actions

1. Create `careertwin-monorepo/apps/web/.env.example` containing only blank variable names and concise category comments based on static code analysis.
2. Run static file comparison comparing source and destination file sizes and SHA-256 hashes.
3. Write file manifest to `docs/architecture/checkpoints/step4b1/FRONTEND_COPY_MANIFEST.txt`.
4. Perform destination-only secret scan.
5. Create local git commit `chore: preserve live frontend in apps web` and lightweight tag `step4b1-frontend-copy`.
