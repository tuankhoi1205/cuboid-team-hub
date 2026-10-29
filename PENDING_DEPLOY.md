# Trạng thái bản bàn giao — 29/10/2026

Web local đã được cập nhật và kiểm tra. Mã nguồn hiện có toàn bộ chức năng đã hoàn thiện; dữ liệu nghiệp vụ, tài khoản và tệp được chuyển bằng snapshot mã hóa trong data/. Nhật ký chi tiết có số liệu cá nhân và nội dung nội bộ được giữ riêng trên máy, ngoài Git.

## Web

- Daily Report: quyền nhập/sửa theo người, hạn gửi, Lead viết thay ngày cũ, mốc ID và bảng đếm Datumaro, bảo toàn số đã lưu.
- KPI: mức theo người/ngày, lịch thứ Bảy luân phiên, ngày miễn, thành viên xem tuần và Lead xem lũy kế. QC lịch sử chỉ tính KPI khi có xác nhận đã lưu của Lead; API không nhận credit tự khai.
- Weekly Report: tiến độ ngày, một cột KPI chung, số bài/lượt QC, rework, chuyên cần và quality; tổng tuần lịch sử có thể chốt riêng khi thiếu phân bổ.
- QA/QC: app offline xuất Excel/JSON, web nhận kết quả theo Job, giữ log và quyền sửa/xác nhận. Báo cáo số bài QC không tạo kết quả Đạt hoặc quality.
- Hỏi đáp: câu hỏi, trả lời, tìm kiếm không dấu cả nội dung, chủ đề/trạng thái, lời giải đáp được chọn và FAQ do Lead duyệt.
- Sao lưu: SQLite, tài khoản và tệp; snapshot AES-256-GCM dùng khóa riêng. Phiên đăng nhập và token khôi phục không có trong snapshot Git.

## QC desktop

Mã nguồn phiên bản 1.1.2: ma trận ID/frame, kéo chọn, nhiều log trên một ID, Enter lưu log, Done riêng và ID trước, thanh nổi, đổi bài/khôi phục bài gần đây và Excel. Workflow GitHub có thể build Windows/Linux/macOS theo yêu cầu. Windows Device Guard đã chặn executable 1.1.2 chưa ký trên máy kiểm thử; mã nguồn đã kiểm tra, cần ký hoặc được IT chấp thuận để xác nhận chạy bộ cài trên máy có chính sách đó.

## Kiểm tra và vận hành

Đã kiểm tra TypeScript, staged build, nghiệp vụ, HTTP/phân quyền/sao lưu và định dạng Excel. Lần nhập dữ liệu gần nhất chạy thử trên DB riêng, kiểm tra lần hai không trùng và bảo toàn toàn bộ dữ liệu cũ trước khi áp dụng nguyên tử. Bản web đang phục vụ trùng hash build đã kiểm thử. Không thay mạng/tunnel khi cập nhật dữ liệu. Xem CHUYEN_MAY_HOST.md để chạy trên máy khác.

GitHub chưa nhận bản này nếu kết nối Git lỗi chứng chỉ. Kết nối tại máy chuẩn bị bị lỗi chuỗi chứng chỉ Vingroup Web Gateway; không tắt xác minh TLS. Người dùng chọn nhận file bàn giao và tự push sau.
