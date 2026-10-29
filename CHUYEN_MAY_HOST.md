# Chuyển Cuboid Team Hub sang máy host khác

## Gói Windows bàn giao riêng

Gói ZIP bàn giao chứa mã nguồn, bản web đã build, Node 24, Python/openpyxl, cloudflared và bản dữ liệu mã hóa hiện tại. Khóa giải mã nằm trong `self-host/.runtime/repo-backup-key.json`. Gói này cần gửi riêng cho người host; không đăng ZIP hoặc khóa lên kho công khai.

1. Giải nén toàn bộ ZIP vào một thư mục trên máy Windows x64; không chạy từ bên trong ZIP.
2. Mở `self-host/RestoreAndStartLocal.cmd`. Lần đầu script khôi phục snapshot nếu chưa có DB, sau đó mở web local. Nếu đã có DB, giữ nguyên và dùng DB đó.
3. Kiểm tra `http://127.0.0.1:3210/api/health`, rồi đăng nhập bằng tài khoản/mật khẩu hiện tại. Không dùng `/auth/setup` để tạo team mới khi đang chuyển dữ liệu.
4. Để truy cập Internet, cấu hình mạng/tunnel của máy host. `self-host/StartHub.cmd` có thể bật Cloudflare Tunnel khi môi trường cho phép; lấy URL mới từ `self-host/data/public-url.txt`. Link cũ không chuyển theo máy.

Gói Windows chạy web không cần cài npm, Node hay Python riêng. Mã nguồn app QC desktop cũng được kèm; bộ cài desktop là phần riêng, xem `qc-desktop/README.md`.

## Chạy từ bản clone GitHub

Cần Node.js 24; Python và openpyxl cho các bộ xử lý file. Clone repo, cài dependencies và chép khóa được gửi riêng vào đúng vị trí trước khi khôi phục:

```powershell
git clone https://github.com/tuankhoi1205/cuboid-team-hub.git
cd cuboid-team-hub
npm ci
node self-host/repo-backup.mjs restore-new
node self-host/build.mjs
py -3 -m pip install -r self-host/tool-qc/requirements.txt
py -3 self-host/tool-qc/setup_runtime.py
node self-host/launcher.mjs start --no-tunnel --no-browser
```

`restore-new` chỉ dành cho máy chưa có DB. Node có sẵn trên PATH được dùng khi không có bộ chạy portable. Trên Linux/macOS, chuẩn bị Python venv theo `self-host/tool-qc/README.md`; web vẫn dùng Node 24. cloudflared hoặc reverse proxy HTTPS của máy host cần được chuẩn bị riêng nếu triển khai từ mã nguồn.

## Máy host đã có dữ liệu

Giữ một bản sao đầy đủ của máy đích. Dừng đúng Hub của máy đích, chạy `node self-host/repo-backup.mjs unpack` để giải mã snapshot vào thư mục backup. Dùng `node self-host/admin.mjs restore "<thư mục vừa giải mã>" KHOI_PHUC`, rồi khởi động lại. Công cụ tự sao lưu dữ liệu hiện có trước khi thay thế. Không chép đè trực tiếp SQLite khi server đang chạy.

## Kiểm tra sau chuyển máy

- Đối chiếu số bản ghi với `data/team-backup.cuboid.enc.json` và đăng nhập bằng mật khẩu của snapshot.
- Kiểm tra Daily Report, báo cáo tuần, mức KPI/lịch miễn KPI, phân công và lịch sử QC, Q&A cùng tệp đính kèm.
- Giữ sao lưu và khóa ở nơi riêng tư; snapshot trên GitHub không tự đồng bộ các báo cáo phát sinh về sau.
- Sau khi máy mới đã được kiểm tra, dừng máy cũ để team nhập tập trung vào một DB.
