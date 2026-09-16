# ICA Unified Desktop

Lightweight Tauri wrapper for the production ICA Unified workspace.

## What it does

- Opens the production ICA Unified login/workspace at `https://unified.icomputeranything.com`.
- Uses the same organization identity, roles, workflow data, learning data, credentials, documents, and billing state as the browser product.
- Provides a native Windows/macOS application shell without creating a separate data store or desktop-only product fork.

## Local development

1. Install the Tauri prerequisites for your operating system.
2. From `desktop/`, run `npm install`.
3. Run `npm run dev`.

## Production packages

Run `npm run build` from `desktop/`.

The resulting packages are **not public-release ready until signed**:

- macOS: Apple Developer signing + notarization are required.
- Windows: a trusted code-signing certificate is required for a clean production installer reputation.
- The public ICA Downloads page should only receive installer URLs after those signed artifacts are created and verified.

## Release rule

Do not publish unsigned installer URLs into `ICA_WINDOWS_DOWNLOAD_URL` or `ICA_MAC_DOWNLOAD_URL`.
