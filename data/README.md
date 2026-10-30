# Dữ liệu của team

Snapshot xuất ngày 30/10/2026 đã được giải mã đối chiếu: 10 thành viên, 293 bản ghi, 59 Daily Report và đủ 43 tệp đính kèm. Có 9 báo cáo ngày 26/10, 9 báo cáo ngày 27/10, 8 báo cáo ngày 28/10 và 10 tổng tuần 19–25/10 đã chốt theo số liệu chỉnh sửa. Không tự tạo báo cáo cho người/ngày chưa có dữ liệu.

- `initial-import.json`: dữ liệu nhập ban đầu, không phải DB hiện tại.
- `team-backup.cuboid.enc`: bản sao đầy đủ hiện tại, đã nén và mã hóa AES-256-GCM.
- `team-backup.cuboid.enc.json`: thời điểm sao lưu, số thành viên/báo cáo/tệp và SHA-256 của bản mã hóa; không chứa dữ liệu từng người.
- `team-data-release.json`: phiên bản snapshot được máy host áp dụng một lần sau pull/install/restart, có sao lưu DB cũ.

DB đang chạy nằm tại `self-host/data/cuboid.sqlite`, tệp đính kèm tại `self-host/data/files`. Hai thư mục này được Git bỏ qua. Push mã nguồn không tự sao lưu các thay đổi trong DB.

Bản mã hóa chứa dữ liệu nghiệp vụ, lịch sử, cấu hình, giá trị băm mật khẩu và tệp đính kèm. Không chứa phiên đăng nhập hoặc token kích hoạt/khôi phục còn dùng được. Khóa giải mã nằm riêng tại `self-host/.runtime/repo-backup-key.json`, được Git bỏ qua. Cần giữ riêng một bản khóa để khôi phục trên máy khác.

Tạo snapshot mới bằng `node self-host/repo-backup.mjs export` hoặc `self-host/BackupGitHub.cmd`, rồi commit/push cả ba tệp `team-*`. Máy nhận áp dụng một lần khi khởi động, thay toàn bộ sau khi sao lưu DB/tệp cũ; không tự gộp dữ liệu hai máy. Không export snapshot mới khi chỉ muốn gửi code/UI.

Xem cách khôi phục tại [README dự án](../README.md#khôi-phục-dữ-liệu-từ-github).
