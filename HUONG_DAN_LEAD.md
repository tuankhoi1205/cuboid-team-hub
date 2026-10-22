# Cuboid Team Hub — Hướng dẫn cho Nguyễn Tuấn Khôi

## Đăng nhập và kích hoạt

Ứng dụng dùng đăng nhập Sites/ChatGPT, không lưu hoặc tạo mật khẩu riêng. Dùng tài khoản ChatGPT có email **26ai.khoint2@vinuni.edu.vn**. Tên đăng nhập trong danh sách là **26ai.khoint2**. Khôi phục mật khẩu tại màn hình đăng nhập ChatGPT.

Lần đầu, chọn **Thiết lập Cuboid Team Hub**. Thao tác này tạo 10 nhân sự và nhập đúng một lần các dữ liệu đã đối chiếu từ hai Google Sheets: 9 task, 18 daily report, 27 bản ghi điểm danh. Chỉ email Lead đã cấu hình được thiết lập team. Khởi tạo và nhập dữ liệu chạy trong một giao dịch, có khóa chống trùng.

Tại **Nhân sự**, chọn **Mời / Phân quyền**, đặt trạng thái **Đã mời**, rồi lưu. Người đó đăng nhập bằng đúng email đã khai báo và chọn **Chấp nhận lời mời**. Lời mời ứng dụng hết hạn sau 7 ngày. Quyền mở Site được quản lý riêng bởi phần Chia sẻ của Sites; cấp đúng email, không công khai Site. Vô hiệu hóa tài khoản trong ứng dụng sẽ chặn API ngay cả khi người đó vẫn còn quyền mở Site.

## Phân quyền và phân bổ QA/QC

9 thành viên ban đầu đều là Annotator. Lead chọn hai người và đổi role sang **QA/QC** khi đã quyết định. QA/QC vẫn được nhận task annotation và gửi báo cáo cá nhân, với mục tiêu **50% thời gian annotation / 50% thời gian QC**. Daily report có loại hoạt động riêng, weekly report tổng hợp thời gian thực tế từng phần. Không tự suy ra thời gian từ sản lượng và không giới hạn sản lượng ở mức KPI.

## Điểm danh, đi trễ và tác phong

Theo yêu cầu cập nhật, **chỉ tài khoản Nguyễn Tuấn Khôi** được ghi/sửa các mục này. Thành viên không tự check-in hoặc check-out. Vào **Điểm danh → Ghi điểm danh**, chọn người, ngày, trạng thái, số phút trễ, tác phong và ghi chú. Giờ vào/ra là tùy chọn, chỉ nhập khi có thời gian thực tế. Thời điểm thực hiện và người đánh được lưu theo máy chủ. Mỗi người chỉ có một bản ghi mỗi ngày; sửa sẽ cập nhật và lưu audit.

Thành viên chỉ xem điểm danh của mình và gửi đơn nghỉ hoặc yêu cầu điều chỉnh. Chỉ Nguyễn Tuấn Khôi được xử lý đơn. Mở bản ghi trong bảng/lịch để sửa điểm danh và tác phong.

## Dự án và giao task

1. Vào **Dự án & Task → Dự án → Tạo dự án**. Chọn đơn vị frame, cuboid hoặc scene; nhập hướng dẫn và chỉ tiêu ngày nếu có.
2. Chọn **Danh sách task → Giao task**. Nhập Task ID, Job ID, người thực hiện, người kiểm tra, khối lượng giao, ngày giao và deadline.
3. Khi nhập cả hai ID, server tự tạo link `https://cvat-test.vantixapps.net/tasks/{Task ID}/jobs/{Job ID}`. Có thể giao nhiều Job khác nhau thuộc cùng một Task. Không tạo trùng cùng cặp Task/Job.
4. Các task nhập từ Sheets chưa có Job ID, deadline và khối lượng giao. Lead bổ sung các mục đó trước khi tiếp tục quy trình; hệ thống không tự bịa deadline hoặc coi sản lượng đã làm là tổng khối lượng giao. Người kiểm tra tạm là Lead cho đến khi chọn QA/QC.

## Luồng làm việc và QC vào sáng hôm sau

Annotator mở task → **Cập nhật tiến độ** → **Gửi QA/QC**. QA/QC được phân công hoặc Lead ghi kết quả ở trang **QA/QC**. Chọn đúng **ngày sản lượng được kiểm**: ví dụ kiểm ngày 22/10 cho công việc ngày 21/10. Thời điểm kiểm tra vẫn lưu theo máy chủ.

Ghi số đã kiểm, đạt, cần sửa, kiểm toàn bộ hay mẫu và danh mục lỗi. Khi kiểm mẫu phải mô tả mẫu. Task trả sửa có thể gửi kiểm tra lại. Chỉ xác nhận hoàn thành khi làm đủ khối lượng và lượt kiểm không còn đơn vị cần sửa. Các lượt kiểm lại không đi vào mẫu số tỷ lệ đạt lần đầu.

QC không tự thay thế sản lượng ngày bằng số đã kiểm: kiểm mẫu và sản lượng ngày có phạm vi khác nhau. Nếu cần điều chỉnh daily report, Lead mở lại báo cáo để người báo cáo chỉnh số liệu và gửi lại.

## Báo cáo và xuất dữ liệu

Daily report: một báo cáo/người/ngày, nhiều dòng công việc. Chọn Annotation hoặc QC. Với QC, chỉ ghi thời gian; kết quả kiểm ghi ở QA/QC. Sản lượng mới và sửa lỗi ghi riêng. Có lưu nháp và gửi. Báo cáo đã gửi hoặc duyệt bị khóa cho đến khi Lead yêu cầu bổ sung/mở lại.

Lead nhấn báo cáo → **Duyệt / Mở lại**. Với weekly report, chọn nhân sự hoặc **Toàn team** để tổng hợp. Bản weekly gửi đi lưu số liệu và danh sách nguồn tại thời điểm gửi; phần tổng hợp trên trang phản ánh dữ liệu hiện tại. Chất lượng tính theo dự án: đạt lần đầu / đã kiểm lần đầu, luôn giữ mẫu số.

Dùng bộ lọc rồi chọn **CSV** hoặc **Excel**. Backend áp dụng cùng quyền truy cập và bộ lọc. Sản lượng các đơn vị khác nhau được giữ riêng. Excel xuất định dạng `.xlsx`; CSV có UTF-8 BOM và chống công thức được chèn từ văn bản.

## Dữ liệu nhập và các phần còn thiếu

- Nguồn: hai Google Sheets người dùng đã cung cấp. Snapshot nhập là dữ liệu thực tế đã đọc, không phải dữ liệu demo và chưa có đồng bộ Google Sheets tự động.
- Ngày điểm danh 21/11 và 22/11 được sửa thành **21/10 và 22/10/2026** theo xác nhận của Lead.
- Tổng ngày **20/10: 5.520**, **21/10: 11.280 cuboid**. Đã dùng giá trị sản lượng ngày trong sheet, không cộng trực tiếp ID cộng dồn. Lead xác nhận tổng này đã trừ phần lỗi. Đây không phải tỷ lệ chất lượng QC.
- Giữ nguyên ghi chú nguồn. Chuẩn hóa “Cầm Vũ Ngọc Thạch” và “Phạm Nguyễn Tuấn” theo danh sách nhân sự đã xác nhận.
- Chưa có giờ làm, số sửa lỗi cụ thể, deadline, khối lượng giao và kết quả kiểm có mẫu số: hiển thị thiếu dữ liệu tương ứng. Không tự tạo giờ công hoặc điểm chất lượng.
- 2 ghi nhận rework trong báo cáo tuần chưa có ngày bắt đầu tuần được giữ riêng, chưa cộng vào tổng hợp.

## Sao lưu và khôi phục

**Cài đặt → Sao lưu JSON** tải dữ liệu nhân sự, dữ liệu nghiệp vụ, nguồn nhập và nhật ký. Lưu bản sao ở vị trí riêng tư trước các thay đổi lớn và định kỳ theo nhu cầu team. Bản sao chứa dữ liệu nội bộ và liên kết định danh tài khoản.

Tệp minh chứng nằm trong R2; bản JSON chứa metadata, không chứa nội dung tệp. Tải các tệp qua liên kết minh chứng trong ứng dụng và cất cùng bản JSON. Khôi phục DB không phục hồi các object R2 đã bị xóa. Ứng dụng không cung cấp thao tác xóa tệp nên các bản sao DB thông thường vẫn dùng object R2 hiện có.

**Khôi phục bản sao lưu** chỉ dành cho Nguyễn Tuấn Khôi, chỉ nhận bản cùng Site, giữ tài khoản Lead hiện tại và đòi nhập `KHOI PHUC`. Thao tác thay thế dữ liệu nghiệp vụ/nhân sự trong giao dịch; nhật ký hiện tại được giữ và thêm sự kiện khôi phục. Tải bản sao hiện tại trước khi thực hiện. Phiên bản mã nguồn Sites không thay thế bản sao dữ liệu D1/R2.

## Cấu hình kỹ thuật

- Runtime: Vinext/React trên Cloudflare Workers qua Sites; D1 binding `DB`, R2 binding `BUCKET`.
- Secret runtime `LEAD_EMAIL=26ai.khoint2@vinuni.edu.vn` được cấu hình tại Sites, không nằm trong frontend.
- Identity do Sites xác thực; backend liên kết `auth_id` ổn định với nhân sự và kiểm tra từng thao tác. Không chấp nhận tên người báo cáo từ client.
- `.dev.vars` chỉ dùng cục bộ và bị Git bỏ qua. Local preview mô phỏng đăng nhập theo starter; production không có giả lập này.
- Migration schema tại `drizzle/`. Dữ liệu nhập tại `data/initial-import.json`, chỉ nạp ở backend trong thiết lập lần đầu.
- Kiểm tra: `node node_modules/typescript/bin/tsc --noEmit` và `node --experimental-transform-types --test tests/domain.test.ts`.
- Cài dependency/build theo skill Sites đi kèm. Nguồn và artifact phải trùng commit đã push khi triển khai.
