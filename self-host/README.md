# Cuboid Team Hub — chạy trên máy Windows của Khôi

Ứng dụng, dữ liệu SQLite, tài khoản và tệp minh chứng chạy trên máy này. Không cần ChatGPT để đăng nhập hoặc duy trì máy chủ. Cloudflare Tunnel cung cấp đường dẫn HTTPS để team truy cập từ Internet; không cần mua tên miền hay mở cổng trên router.

## Bắt đầu

1. Mở `StartHub.cmd` trong thư mục này. Máy chủ chạy nền; trình duyệt mở địa chỉ `http://127.0.0.1:3210/`.
2. Tài khoản **26ai.khoint2** dùng mật khẩu riêng. Theo yêu cầu của Khôi ngày 22/10/2026, cả 10 tài khoản hiện tại đã được kích hoạt và cấp mật khẩu ban đầu chung; Lead cung cấp riêng thông tin đăng nhập cho team. Mỗi người có thể chọn **Đổi mật khẩu** sau khi đăng nhập. Ứng dụng chấp nhận mật khẩu dài 3–128 ký tự. Với cơ sở dữ liệu mới, Khôi tự đặt mật khẩu tại `http://127.0.0.1:3210/auth/setup`; trang này chỉ mở trên máy host.
3. Cửa sổ khởi chạy in dòng **Internet app**. Sao chép địa chỉ HTTPS đó gửi cho team. Địa chỉ hiện tại cũng nằm trong `data/public-url.txt`.
4. Trong **Nhân sự → Mời / Phân quyền**, đặt thành viên thành **Đã mời** rồi lưu. Sao chép liên kết kích hoạt riêng và gửi đúng người. Thành viên mở liên kết, tự đặt mật khẩu rồi dùng tên đăng nhập là phần trước `@` trong email. Liên kết kích hoạt chỉ dùng một lần, hết hạn sau 7 ngày. Ứng dụng không tự gửi email.

9 thành viên ban đầu đã có thể đăng nhập; chưa gán hai QA/QC. Sau khi chọn người, đổi vai trò trong Nhân sự. QA/QC vẫn có mục tiêu 50% thời gian annotation và 50% QC. Chỉ tài khoản Nguyễn Tuấn Khôi được đánh điểm danh, đi trễ, tác phong và duyệt điều chỉnh điểm danh.

Điểm danh mặc định **Có mặt / Đúng quy định** theo ngày làm việc. Khôi chỉ sửa ngoại lệ; hệ thống giữ các bản ghi nghỉ/trễ đã có. Không tạo giờ vào/ra tự động. Daily Report có Task ID, Job ID, ID đã làm tới và số cuboid trong ngày. Sau QC, annotator mở kết quả bài của mình, đánh dấu từng lỗi đã sửa rồi gửi kiểm tra lại.

KPI lũy kế cộng **1.200 cuboid/ngày tính KPI**, mặc định từ **20/10/2026**. Thứ Hai–thứ Sáu luôn tính, Chủ nhật không tính; thứ Bảy luân phiên theo mốc **24/10 làm, 31/10 nghỉ, 07/11 làm**. Khôi đổi mốc tại **Cài đặt → Quy tắc làm việc**, hoặc chọn **Không tính KPI ngày…** cho toàn team hay một người. Miễn KPI không làm mất sản lượng hoặc đổi điểm danh. Excel xuất thành các bảng có cột, bộ lọc và định dạng; không xuất nội dung nghiệp vụ thành cột JSON. Xem chi tiết trong [hướng dẫn Lead](../HUONG_DAN_LEAD.md).

Khôi chọn **Chỉnh KPI** ở từng dòng nhân sự để đặt mức riêng và ngày hiệu lực, ví dụ QA/QC 600 cuboid/ngày; ngày trước đó giữ mức cũ. Tại **Daily Report → Xuất báo cáo buổi sáng**, tải bản tổng hợp ngày làm việc trước và kế hoạch hôm nay, có Task/Job/ID, sản lượng, vấn đề và hỗ trợ. Kế hoạch lấy từ trường **Kế hoạch ngày làm việc tiếp theo** trong báo cáo của annotator.

Máy host phải bật, có Internet và không ngủ trong lúc team sử dụng. Có thể đóng Codex/ChatGPT và trình duyệt; tiến trình Node và tunnel vẫn chạy nền. Khi khởi động lại Windows, mở `StartHub.cmd` để bật lại. Chưa cài dịch vụ hoặc tự khởi động cùng Windows.

## Đường dẫn miễn phí và dừng ứng dụng

Đường dẫn `https://…trycloudflare.com` là tạm thời, thay đổi khi tunnel được tạo lại. Khởi chạy lại khi tunnel hiện tại vẫn đang chạy sẽ giữ nguyên đường dẫn. Nếu địa chỉ đổi, gửi địa chỉ mới cho team; dữ liệu và mật khẩu không đổi. Tạo lại lời mời/khôi phục nếu liên kết cũ trỏ về địa chỉ đã ngừng chạy.

Quick Tunnel không có cam kết uptime; xem [tài liệu Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Đây là phương án không cần tên miền để bắt đầu trên máy hiện tại.

Mở `StopHub.cmd` để dừng cả ứng dụng và tunnel. Tệp dữ liệu vẫn được giữ. Không xóa thư mục `data` hoặc `.runtime` để xử lý lỗi khởi chạy.

## Mật khẩu và quyền truy cập

- Mỗi người tự đặt mật khẩu; server lưu giá trị băm scrypt, không lưu mật khẩu rõ.
- Trong ứng dụng, chọn **Đổi mật khẩu** để đổi mật khẩu cá nhân. Các phiên đăng nhập khác bị thu hồi.
- Nếu thành viên quên mật khẩu: Lead vào **Nhân sự → Khôi phục mật khẩu**, gửi liên kết riêng. Liên kết dùng một lần và hết hạn sau 30 phút. Sau khi đổi mật khẩu, các phiên cũ bị đăng xuất.
- Nếu Khôi quên mật khẩu: chạy `ResetLead.cmd` trực tiếp trên máy host. Mở tệp riêng `.runtime/reset-lead-link.txt`, rồi mở liên kết trong trình duyệt trên máy này và tự đặt mật khẩu mới. Không gửi tệp đó cho người khác.
- Vô hiệu hóa tài khoản trong Nhân sự chặn quyền truy cập ngay. Chỉ gửi liên kết kích hoạt/khôi phục riêng cho đúng người; không đăng chung với đường dẫn ứng dụng.

## Dữ liệu và sao lưu

GitHub chỉ theo dõi mã nguồn và snapshot mã hóa; DB đang chạy được bỏ qua trong `.gitignore`. Bản sao trên GitHub ở `data/team-backup.cuboid.enc`, mã hóa AES-256-GCM. Khóa giải mã ở `.runtime/repo-backup-key.json`, giữ riêng và không commit. Mở `BackupGitHub.cmd` hoặc chạy `node self-host/repo-backup.mjs export` từ gốc repo, rồi commit/push cả `data/team-backup.cuboid.enc`, `data/team-backup.cuboid.enc.json` và `data/team-data-release.json`.

Máy host mở `PullAndUpdateLocal.cmd` để pull, build và khởi động lại app. Khi khởi động, server tự kiểm tra snapshot, sao lưu DB/tệp hiện tại vào `data/backups/before-repo-update-*`, rồi thay bằng bản được công bố. Mỗi phiên bản chỉ thay một lần; những lần khởi động tiếp theo giữ báo cáo mới. Máy xuất snapshot được đánh dấu đã có phiên bản đó. Chỉ pull chưa thay DB khi app vẫn đang chạy. Tunnel hiện tại được giữ khi dùng script cập nhật local.

Đây là thay toàn bộ theo snapshot, không tự gộp hai DB: dữ liệu và mật khẩu nhập/đổi ở máy đích sau thời điểm snapshot sẽ chỉ còn trong bản sao DB cũ. Push chỉ sửa code không thay DB nếu manifest dữ liệu không đổi. Thiếu khóa hoặc sai checksum sẽ chặn khởi động trước khi thay DB. Xem [cách nhận dữ liệu từ GitHub](../README.md#khôi-phục-dữ-liệu-từ-github).

`data/cuboid.sqlite` lưu nghiệp vụ và tài khoản. `data/files` lưu tệp minh chứng. Dữ liệu Sheets đã nhập một lần: 10 nhân sự, 9 task, 18 daily report, 27 bản ghi điểm danh. Tổng sản lượng 20/10/2026 là **5.520**, 21/10/2026 là **11.280 cuboid**; đã sửa tháng điểm danh theo xác nhận của Khôi. Chưa có đồng bộ Sheets tự động.

Chạy **BackupHub.cmd** để sao lưu đầy đủ vào `data/backups/<thời-điểm>/`: SQLite, giá trị băm mật khẩu và các tệp minh chứng. Bản sao không chứa phiên đăng nhập hoặc token kích hoạt/khôi phục còn dùng được. Lưu thêm một bản ở thiết bị riêng; bản sao nằm cùng ổ đĩa không bảo vệ khi ổ đĩa hỏng. Thư mục sao lưu chứa dữ liệu nội bộ, cần giữ riêng tư.

**Cài đặt → Sao lưu JSON** chỉ sao lưu dữ liệu nghiệp vụ, không chứa mật khẩu hoặc nội dung tệp. Khôi phục JSON yêu cầu cùng bản tự host, giữ thông tin đăng nhập hiện tại; cần tạo lại các lời mời chưa dùng. Dùng bản sao đầy đủ nếu chuyển máy hoặc khôi phục toàn bộ.

Khôi phục đầy đủ trên máy này:

1. Chạy `StopHub.cmd`.
2. Mở terminal trong `self-host`, chạy lệnh dưới đây, thay thư mục bằng bản sao cần dùng:

   ```powershell
   .\.runtime\node.exe .\admin.mjs restore ".\data\backups\<thời-điểm>" KHOI_PHUC
   ```

3. Script tự tạo thêm bản sao hiện trạng trước khi khôi phục. Chạy `StartHub.cmd` và đăng nhập lại. Mọi người dùng mật khẩu tại thời điểm của bản sao.

## Kiểm tra khi gặp lỗi

- Máy host: mở `http://127.0.0.1:3210/api/health`; kết quả `ok: true` nghĩa là máy chủ đang chạy.
- Đăng nhập được trên máy nhưng team không vào được: kiểm tra Internet, mở lại `StartHub.cmd` và kiểm tra đường dẫn mới trong `data/public-url.txt`.
- Nhật ký kỹ thuật: `.runtime/app.err.log` và `.runtime/tunnel.err.log`. Không gửi toàn bộ thư mục `data`/`.runtime` lên nơi công khai.
- Nếu cổng 3210 bị chiếm bởi tiến trình khác, script báo lỗi và không dừng tiến trình đó. Dừng đúng ứng dụng đang dùng cổng hoặc kiểm tra trước khi đổi cấu hình.
- Bộ chạy Node và cloudflared đã có trong `.runtime`; không cần cài npm để sử dụng bản đã build. Giữ nguyên cả thư mục `self-host` khi di chuyển.

## Dành cho người sửa mã nguồn

Mã React dùng chung nằm ở `app/hub-app.tsx`, nghiệp vụ ở `lib/domain.ts`. Máy chủ riêng ở `self-host/server.ts`, xác thực ở `self-host/auth.ts`, SQLite ở `self-host/sqlite.ts`. Build từ thư mục gốc dự án:

```powershell
node self-host/build.mjs
node node_modules/typescript/bin/tsc --noEmit
node --experimental-transform-types --test tests/domain.test.ts
node --test tests/self-host.test.mjs
```

Dừng máy chủ trước khi thay bản build rồi khởi chạy lại. Không dùng `npm start` cho bản tự host: lệnh cũ thuộc runtime Sites. Bản này không cần `DB`, `BUCKET`, secret hoặc đăng nhập của Sites.
