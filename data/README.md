# Dữ liệu của team

- `initial-import.json`: dữ liệu nhập ban đầu, không phải DB hiện tại.
- `team-backup.cuboid.enc`: bản sao đầy đủ hiện tại, đã nén và mã hóa AES-256-GCM.
- `team-backup.cuboid.enc.json`: thời điểm sao lưu, số thành viên/báo cáo/tệp và SHA-256 của bản mã hóa; không chứa dữ liệu từng người.

DB đang chạy nằm tại `self-host/data/cuboid.sqlite`, tệp đính kèm tại `self-host/data/files`. Hai thư mục này được Git bỏ qua. Push mã nguồn không tự sao lưu các thay đổi trong DB.

Bản mã hóa chứa dữ liệu nghiệp vụ, lịch sử, cấu hình, giá trị băm mật khẩu và tệp đính kèm. Không chứa phiên đăng nhập hoặc token kích hoạt/khôi phục còn dùng được. Khóa giải mã nằm riêng tại `self-host/.runtime/repo-backup-key.json`, được Git bỏ qua. Cần giữ riêng một bản khóa để khôi phục trên máy khác.

Tạo snapshot mới bằng `node self-host/repo-backup.mjs export` hoặc `self-host/BackupGitHub.cmd`, rồi commit/push cả hai tệp `team-backup.cuboid.enc*`. Đây là snapshot tại thời điểm xuất, chưa có đồng bộ DB tự động lên GitHub.

Xem cách khôi phục tại [README dự án](../README.md#khôi-phục-dữ-liệu-từ-github).
