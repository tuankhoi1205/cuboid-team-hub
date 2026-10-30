# Cuboid Team Hub

**VPS Linux:** xem [hướng dẫn cập nhật VPS](self-host/VPS.md). Git đã kèm bản UI/server build trong `self-host/web-release`; sau pull chạy `node self-host/web-release.mjs` rồi restart đúng PM2/systemd app. `npm start` chạy bản self-host. `/api/health` trả `buildId` để đối chiếu đúng bản UI đang phục vụ.

Chuyển sang máy host khác: xem [hướng dẫn bàn giao](CHUYEN_MAY_HOST.md). Bản GitHub hiện có SQLite/tệp thường trong `data/plain`, không cần khóa giải mã. Gói Windows riêng cũ vẫn có runtime và snapshot tại thời điểm bàn giao.

App QC offline mới nằm ở [qc-desktop](qc-desktop/README.md): mở Datumaro hoặc tạo bảng trắng, kéo chọn frame, ghi log bằng Enter, thanh nổi một ID trên CVAT, xuất Excel và hoàn tất/đổi bài với tiến độ tự lưu. App không dùng phân công hoặc đăng nhập. Web QA/QC được thu gọn thành quản lý Job, nhận kết quả và tải log; đã triển khai lên localhost ngày 28/10/2026.

Bản đang sử dụng chạy độc lập trên máy Windows hiện tại. Mở **self-host/StartHub.cmd**; đăng nhập bằng tên được cấp và mật khẩu riêng. Xem [hướng dẫn tự host](self-host/README.md) và [hướng dẫn nghiệp vụ cho Lead](HUONG_DAN_LEAD.md).

## Dữ liệu trên GitHub

Theo yêu cầu ngày **30/10/2026**, bản đang công bố là **SQLite và tệp thường, không mã hóa, không cần khóa giải mã**:

- [data/plain/cuboid.sqlite](data/plain/cuboid.sqlite): DB đầy đủ.
- [data/plain/files](data/plain/files): 43 tệp đính kèm.
- [data/plain/checksums.json](data/plain/checksums.json): số bản ghi và SHA-256 từng tệp.
- [data/team-data-release.json](data/team-data-release.json): phiên bản dữ liệu nạp một lần khi host khởi động.

Đã đối chiếu 10 thành viên, 293 bản ghi, 59 Daily Report, gồm 9 báo cáo ngày 26/10, 9 ngày 27/10, 8 ngày 28/10 và tổng tuần 19–25/10 đã chỉnh. Tài khoản/mật khẩu hiện có được giữ bằng giá trị băm; phiên đăng nhập, token và giới hạn đăng nhập tạm không nằm trong bản xuất.

VPS pull rồi cài web và khởi động lại đúng service:

```bash
git pull --ff-only
node self-host/web-release.mjs
# Restart đúng PM2/systemd service đang dùng.
```

Server sao lưu DB/tệp cũ rồi nhận dữ liệu từ `data/plain` một lần. Đây là thay toàn bộ theo snapshot, không gộp hai DB; dữ liệu mới nhập riêng ở máy host nằm trong bản sao trước thay thế. Những lần mở sau và push chỉ sửa code giữ dữ liệu mới. DB đang chạy vẫn ở `self-host/data/cuboid.sqlite`, không commit trực tiếp.

Muốn xuất bản dữ liệu thường mới từ máy có DB đầy đủ:

```bash
node scripts/export-plain-data.mjs
git add data/plain data/team-data-release.json
git commit -m "Update plain team data snapshot"
git push origin main
```

`self-host/BackupGitHub.cmd` cũng xuất theo cách này. Các file `.enc` cũ được giữ để tương thích lịch sử, không phải dữ liệu đang được manifest lựa chọn. VPS hiện tại không cần lấy khóa.

## Khôi phục dữ liệu thủ công

`data/plain` là một thư mục full backup tương thích `self-host/admin.mjs`. Trên máy đã có DB, dừng đúng Hub, chép cả thư mục này vào `self-host/data/backups/`, chạy `node self-host/admin.mjs restore "<thư mục backup vừa chép>" KHOI_PHUC`, rồi khởi động lại. Công cụ sao lưu hiện trạng trước khi thay. Với máy mới, server tự nạp snapshot khi khởi động.

Xem [hướng dẫn VPS](self-host/VPS.md) và [hướng dẫn chuyển máy](CHUYEN_MAY_HOST.md).

Bản mới đã [triển khai ngày 26/10/2026](PENDING_DEPLOY.md), gồm Tool_QC cơ bản trước QC chi tiết. Sản lượng và KPI cũ giữ nguyên. **Weekly Report, UI danh sách chưa gửi và KPI theo mốc Datumaro + ID mới đã triển khai**: Lead xác nhận file ban đầu, file sau bổ sung ID mới; Daily Report nhập ID đã làm tới tự tính cuboid và gợi ý ID đủ KPI theo đúng người, đúng ngày. Xem [hướng dẫn bộ đếm](self-host/tool-qc/README.md). Link Internet hiện tại luôn nằm trong `self-host/data/public-url.txt` trên máy host.

---

Phần dưới đây là tài liệu của starter Sites được giữ lại để tham khảo mã nguồn cũ. Không cần Sites/ChatGPT để chạy bản trong `self-host`.

# vinext-starter

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git and `tar` (including Windows `tar.exe`) are required for publishing; portable publication does not require Bash

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

Publish archives outside the source checkout or under its ignored `outputs/` directory. Local `.env*`, `.dev.vars*`, TypeScript build state, and tool runtime directories are ignored; keep the hosting manifest, migrations, and authored scripts in source control.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. The legacy Sites preview uses `npm run build:sites` and `npm run start:sites`; the default `npm start` now runs the independent self-host server described above.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `worker/index.ts` is the production Worker entrypoint and preserves request-scoped connector bindings
- `scripts/vite/` contains the maintained Vite integrations and the vendored Sites plugin license
- `scripts/connector-preview/` contains the local connector preview Worker and session helpers
- the remaining `scripts/` files select execution profiles and run installation, development, and builds; the plugin's helpers orchestrate the Sites lifecycle
- `dist/` contains generated deployment output; `.vinext/`, `.wrangler/`, and `.sites-runtime/` contain ignored local tool state
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
