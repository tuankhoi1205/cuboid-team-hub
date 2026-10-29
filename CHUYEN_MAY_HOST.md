# Chuyển Cuboid Team Hub sang máy host khác

**VPS Linux:** dùng [hướng dẫn VPS](self-host/VPS.md). Repo có sẵn bản web/server portable trong `self-host/web-release`; không chép runtime Windows sang Linux. Sau pull phải cài bản release và khởi động lại đúng service.

## Gói Windows bàn giao riêng

Gói ZIP bàn giao chứa mã nguồn, bản web đã build, Node 24, Python/openpyxl, cloudflared và bản dữ liệu mã hóa hiện tại. Khóa giải mã nằm trong `self-host/.runtime/repo-backup-key.json`. Gói này cần gửi riêng cho người host; không đăng ZIP hoặc khóa lên kho công khai.

1. Giải nén toàn bộ ZIP vào một thư mục trên máy Windows x64; không chạy từ bên trong ZIP.
2. Mở `self-host/RestoreAndStartLocal.cmd`. Nếu gói có manifest `data/team-data-release.json`, server áp dụng snapshot một lần trước khi chạy; DB/tệp cũ được sao lưu vào `self-host/data/backups/before-repo-update-*`. Những lần mở tiếp theo giữ nguyên dữ liệu nhập thêm. Với gói cũ chưa có manifest, script chỉ khôi phục khi chưa có DB.
3. Kiểm tra `http://127.0.0.1:3210/api/health`, rồi đăng nhập bằng tài khoản/mật khẩu hiện tại. Không dùng `/auth/setup` để tạo team mới khi đang chuyển dữ liệu.
4. Để truy cập Internet, cấu hình mạng/tunnel của máy host. `self-host/StartHub.cmd` có thể bật Cloudflare Tunnel khi môi trường cho phép; lấy URL mới từ `self-host/data/public-url.txt`. Link cũ không chuyển theo máy.

Gói Windows chạy web không cần cài npm, Node hay Python riêng. Mã nguồn app QC desktop cũng được kèm; bộ cài desktop là phần riêng, xem `qc-desktop/README.md`.

## Chạy từ bản clone GitHub

Cần Node.js 24; Python và openpyxl cho các bộ xử lý file. Clone repo, cài dependencies và chép khóa được gửi riêng vào đúng vị trí trước khi khôi phục:

```powershell
git clone https://github.com/tuankhoi1205/cuboid-team-hub.git
cd cuboid-team-hub
npm ci
node self-host/build.mjs
py -3 -m pip install -r self-host/tool-qc/requirements.txt
py -3 self-host/tool-qc/setup_runtime.py
node self-host/launcher.mjs start --no-tunnel --no-browser
```

Server tự áp dụng manifest dữ liệu trước khi mở cổng; `restore-new` vẫn chỉ dành cho khôi phục thủ công ở máy chưa có DB. Node có sẵn trên PATH được dùng khi không có bộ chạy portable. Trên Linux/macOS, chuẩn bị Python venv theo `self-host/tool-qc/README.md`; web vẫn dùng Node 24. cloudflared hoặc reverse proxy HTTPS của máy host cần được chuẩn bị riêng nếu triển khai từ mã nguồn.

## Máy host đã có dữ liệu

Mở `self-host/PullAndUpdateLocal.cmd` để pull, build và khởi động lại app. Tunnel đang chạy được giữ nguyên. Snapshot mới tự thay toàn bộ DB/tệp cũ một lần, sau khi lưu DB/tệp cũ trong `self-host/data/backups/before-repo-update-*`. Máy đích phải có khóa giải mã riêng. Chỉ pull mà chưa build/khởi động lại chưa thay DB.

Nếu anh tiếp tục xuất snapshot trên máy mình rồi push, lần cập nhật tiếp theo ở máy bạn sẽ thay dữ liệu bằng snapshot đó. Dữ liệu mới nhập riêng ở máy bạn sau thời điểm snapshot không được gộp vào DB mới; vẫn có trong bản sao trước cập nhật. Những lần push chỉ sửa code, không export snapshot mới, giữ dữ liệu trên máy host.

Để quay lại DB cũ: dừng đúng Hub của máy đích, dùng `node self-host/admin.mjs restore "<thư mục before-repo-update cần dùng>" KHOI_PHUC`, rồi khởi động lại. Công cụ tự sao lưu hiện trạng trước khi khôi phục. Marker dữ liệu vẫn giữ nên không tự ghi đè lại cùng phiên bản sau khi khôi phục thủ công.

## Kiểm tra sau chuyển máy

- Đối chiếu số bản ghi với `data/team-backup.cuboid.enc.json` và đăng nhập bằng mật khẩu của snapshot.
- Kiểm tra Daily Report, báo cáo tuần, mức KPI/lịch miễn KPI, phân công và lịch sử QC, Q&A cùng tệp đính kèm.
- Giữ sao lưu và khóa ở nơi riêng tư; muốn gửi dữ liệu mới lên GitHub cần export, commit/push cả snapshot và manifest. Đây là thay thế theo phiên bản, không phải đồng bộ hai chiều.
- Sau khi máy mới đã được kiểm tra, dừng máy cũ để team nhập tập trung vào một DB.
