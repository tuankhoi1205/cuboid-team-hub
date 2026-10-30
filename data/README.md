# Dữ liệu thường — không cần khóa

Bản đang công bố nằm trong **plain/**, xuất ngày 30/10/2026 theo yêu cầu không mã hóa:

- **plain/cuboid.sqlite**: SQLite đầy đủ, mở trực tiếp bằng SQLite/DB Browser.
- **plain/files/**: đủ 43 tệp đính kèm, tên UUID được giữ để khớp records.
- **plain/manifest.json**: thông tin full backup cho công cụ admin.
- **plain/checksums.json**: kiểm tra toàn vẹn từng tệp.
- **team-data-release.json**: chọn storage=plain, không dùng khóa hay file .enc khi nạp bản này.

Gồm 10 thành viên, 293 bản ghi, 59 Daily Report: 9 báo cáo 26/10, 9 báo cáo 27/10, 8 báo cáo 28/10 và 10 tổng tuần 19–25/10 đã chốt theo số liệu đã chỉnh. Không tạo báo cáo cho người/ngày thiếu số liệu.

SQLite giữ hash mật khẩu để dùng tài khoản hiện tại. Phiên đăng nhập, token và giới hạn đăng nhập tạm đã loại khỏi bản xuất. Không sao chép thư mục .runtime hoặc khóa vào đây.

Bạn host có thể xử lý SQLite trực tiếp, hoặc pull/cài web/restart service để server tự sao lưu DB cũ rồi nhận bản này một lần. Đây là snapshot thay toàn bộ, không gộp hai DB. Xuất bản mới: node scripts/export-plain-data.mjs, commit/push cả plain/ và team-data-release.json.

initial-import.json chỉ là seed ban đầu. Các file team-backup.cuboid.enc* cũ không phải nguồn đang được manifest chọn. [Hướng dẫn VPS](../self-host/VPS.md).
