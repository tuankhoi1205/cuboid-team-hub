# Chạy và cập nhật trên VPS Linux

Repo có mã nguồn, bản web đã build tại `self-host/web-release` và DB/tệp đính kèm không mã hóa tại `data/plain/`. Pull không thay tiến trình đang chạy. Bản web đã build dùng được trên Linux/Windows với Node.js 24, không cần npm ci hoặc Vite trên VPS để chạy.

## VPS đã có ứng dụng

Trong đúng thư mục repo đang được service sử dụng:

```bash
git pull --ff-only
node self-host/web-release.mjs
```

Khởi động lại đúng ứng dụng bằng trình quản lý hiện tại. Với PM2, lấy tên bằng `pm2 list`, rồi chạy:

```bash
pm2 restart TEN_APP_DANG_CHAY --update-env
```

Hoặc dùng một lệnh sau khi đã pull lần đầu để có script:

```bash
bash self-host/update-vps.sh TEN_APP_DANG_CHAY
```

Với systemd: khởi động lại đúng unit hiện tại bằng `sudo systemctl restart TEN_SERVICE`. Nếu service đang chạy `npm start`, lệnh này nay chạy bản self-host, không còn chạy runtime Sites cũ. Entry được khuyến nghị là đường dẫn tuyệt đối tới `self-host/start.mjs` với Node 24.

Service phải tiếp tục dùng đúng `HUB_DATA_DIR` hiện có. Bản công bố ngày 30/10 dùng `data/plain/cuboid.sqlite` và `data/plain/files`, không cần khóa giải mã. Phiên bản dữ liệu mới sẽ sao lưu và thay DB một lần khi server khởi động; dữ liệu sau lần nhận đó được giữ ở các lần mở tiếp theo. Cơ chế này thay toàn bộ theo snapshot, không tự gộp hai DB.

## VPS mới với PM2

Cài Node 24 và PM2 bằng công cụ quản trị VPS hiện có. Clone repo rồi:

```bash
node self-host/web-release.mjs
pm2 start self-host/ecosystem.config.cjs
pm2 save
```

Nếu chưa dùng trình quản lý tiến trình, chạy `node self-host/start.mjs` để kiểm tra; đưa vào service sau. Cấu hình Nginx/Caddy hiện có trỏ tới `127.0.0.1:3210`. Không dùng `npm run dev` hoặc `next start` để phục vụ bản self-host này. Không khởi chạy thêm app thứ hai trên cùng DB/cổng.

Giữ URL HTTPS công khai của VPS trong `self-host/data/public-url.txt` hoặc biến `HUB_PUBLIC_ORIGIN`. Điều này cho phép kiểm tra Origin/Host và tạo liên kết đăng nhập đúng tên miền. Không chép URL Cloudflare tạm từ máy Windows vào VPS.

## Kiểm tra đã nhận đúng UI mới

```bash
git rev-parse --short HEAD
curl -fsS http://127.0.0.1:3210/api/health
node -p "JSON.parse(require('fs').readFileSync('self-host/web-release/build-manifest.json','utf8')).buildId"
```

`buildId` ở health phải khớp manifest. Nếu health không có `buildId` thì VPS còn chạy server cũ hoặc reverse proxy đang trỏ nhầm app/cổng. Nếu local health đúng nhưng URL công khai sai, kiểm tra upstream của reverse proxy. Sau đó tải lại trình duyệt bằng Ctrl+F5. Trang HTML không cache; các asset có tên chứa hash.

Node/Python của Windows không được chuyển sang VPS. Tool_QC và bộ đếm cần Python 3.10+ với openpyxl. Trên Ubuntu/Debian cài điều kiện hệ thống rồi chạy bộ cài venv dùng chung:

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip
python3 self-host/tool-qc/setup_runtime.py
python3 self-host/tool-qc/setup_runtime.py --check
```

Bộ cài tạo/cập nhật `self-host/.runtime/qc-python/bin/python`, cài các phiên bản đã kiểm thử từ requirements và kiểm tra import trước khi báo thành công. Web tự nhận venv này, hoặc Python hệ thống nếu chưa có venv. File `requirements.txt` tại gốc repo cũng trỏ tới cùng bộ dependencies; web không cần tkinter, display hay PyInstaller.

Khởi động lại đúng service sau khi cài. Nếu PM2/service từng đặt `HUB_QC_PYTHON`, cập nhật đường dẫn override đó. Với PM2:

```bash
HUB_QC_PYTHON="$(pwd)/self-host/.runtime/qc-python/bin/python" pm2 restart TEN_APP_DANG_CHAY --update-env
```

Kiểm tra môi trường giờ thực sự chạy `import openpyxl, et_xmlfile`, không chỉ kiểm tra file Python tồn tại. Nếu vẫn lỗi, chạy lệnh `--check` ở trên bằng cùng user chạy service. Bộ đếm Datumaro/KPI và Tool_QC dùng chung Python.

## Khi sửa code

Máy phát triển có dependencies chạy `npm run build:host` rồi `npm run package:host`, commit/push cả `self-host/web-release`. Máy host cài bản release bằng lệnh ở trên. Chỉ xuất DB mới bằng `node scripts/export-plain-data.mjs` khi muốn gửi bản dữ liệu thay thế; commit cả `data/plain/` và `data/team-data-release.json`.
