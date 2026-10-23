# Bản chờ triển khai — 24/10/2026

**Chưa deploy theo yêu cầu của Khôi: để team nhập xong KPI hôm qua trước.** Không thay bản build đang phục vụ, không khởi động lại app/tunnel và không áp dụng hạn 17:00 vào DB thật cho đến khi Khôi yêu cầu triển khai.

Bản mới có:

- Số frame của Job trong giao/cập nhật Task và giao QC; chỉ Lead được đổi. Giữ số frame đã biết của các Job cũ.
- Báo cáo mới nhập số ID làm riêng trong ngày, tự tính cuboid = ID × frame × 0,85 ở server. Lưu số frame/hệ số cùng báo cáo; thay số frame của Job không tính lại KPI cũ. Báo cáo lịch sử giữ nguyên sản lượng đã nhập; chỉ dùng công thức mới khi chủ động nhập số ID cho dòng đó. ID đã làm tới vẫn là mốc tiến độ riêng.
- Phần vàng bên trong thanh sản lượng cho lượng cần sửa: số Object ID còn lỗi × frame của từng Job. Một ID nhiều lỗi chỉ tính một lần trong Job; log lỗi cũ được ghi tiếp không cộng trùng. Xác nhận sửa hết lỗi sẽ giảm phần vàng. Thiếu ID/frame được ghi rõ, không đoán số.
- Thành viên nhập/sửa báo cáo của mình trước 17:00 trong chính ngày báo cáo, theo giờ Việt Nam. Khóa từ đúng 17:00, gồm cả lưu nháp, gửi và tệp đính kèm; biểu mẫu đang mở cũng bị khóa.
- Lead viết thay và sửa báo cáo của mọi người, cả ngày cũ và ngoài giờ. Người hưởng sản lượng vẫn là chủ báo cáo; người nhập/sửa được ghi trong audit.
- Báo cáo đã gửi được chỉnh trước hạn; chỉnh báo cáo đã duyệt sẽ cần duyệt/QC cho nội dung mới. Phát hiện bản ghi đã bị người khác sửa để tránh ghi đè.
- Lead xem danh sách chưa gửi hôm nay ở Tổng quan và Daily Report, có nút Viết thay. Chỉ tính người đang hoạt động; nháp vẫn là chưa gửi.

Build kiểm thử riêng: `.sites-runtime/staged-selfhost`, tạo bằng biến môi trường `HUB_BUILD_DIR`. Kiểm thử HTTP dùng `HUB_TEST_BUILD_DIR` trỏ đến đó. Không chạy build mặc định khi đang giữ deploy vì `self-host/dist/client` được server thật phục vụ trực tiếp.

Khi được yêu cầu triển khai: sao lưu đầy đủ trước, kiểm tra lại các thay đổi phát sinh, build/chuyển bản đã kiểm thử vào `self-host/dist`, rồi khởi động lại riêng app và giữ tunnel. Lần đầu chạy bản mới sẽ nâng chính sách Daily Report cũ lên hạn 17:00; không đổi sản lượng hay lịch sử báo cáo.

Ngoại lệ dữ liệu đã được Khôi yêu cầu áp dụng ngay: 9 phiên QC chuyển từ 23/10 sang 24/10/2026. Giữ nguyên ngày sản lượng, trạng thái và giờ bắt đầu thực tế. Đã sao lưu trước tại `self-host/data/backups/2026-10-24T02-30-48-804Z`. Chưa deploy tính năng và chưa áp dụng chính sách Daily Report mới vào DB thật.

QC Ngọc Hòa (Job 1514) đã được cập nhật trực tiếp tới ID 80 theo báo cáo 23/10, thay phạm vi 56 cũ; giữ 1.152 cuboid đã gửi. Phiên có snapshot các báo cáo cũ nằm trong phạm vi mở rộng để bản mới đối chiếu duyệt theo đúng phần ID.

Phân công QC bản mới theo Job, giao một lần (`qc-assignment`). Mỗi lượt kiểm vẫn lưu lịch sử riêng, tự lấy ID cuối của Daily Report gần nhất trước hôm nay; mốc tiếp theo từ ID đã QC và sửa xong, ví dụ 20 → 80. Phân công cũ tự gộp theo Job khi bản mới chạy, không xóa log/lượt cũ.

## Tạm dừng theo yêu cầu của Khôi

Đã lưu toàn bộ mã nguồn. Chưa deploy, chưa đổi hạn Daily Report trên DB thật. Kiểm thử mới nhất: 44 domain tests đạt, TypeScript đạt. 12 kiểm thử HTTP đã đạt trước thay đổi phân công QC một lần; cần build riêng và chạy lại HTTP/UI cho phần QC theo Job khi tiếp tục. Bản preview cổng 43210 đã được yêu cầu dừng; giữ nguyên app/tunnel production.
