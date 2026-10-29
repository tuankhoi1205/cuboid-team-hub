# Cuboid Team Hub — Hướng dẫn cho Nguyễn Tuấn Khôi

## Đăng nhập và kích hoạt

Ứng dụng hiện chạy độc lập trên máy Windows của Khôi, đăng nhập bằng **tên đăng nhập và mật khẩu riêng**. Mở `self-host/StartHub.cmd`. Theo yêu cầu của Khôi, 10 tài khoản hiện tại đã được kích hoạt và cấp mật khẩu ban đầu chung; mỗi người có thể tự chọn **Đổi mật khẩu** sau khi đăng nhập. Không cần tài khoản ChatGPT. Với cơ sở dữ liệu mới, Khôi thiết lập tài khoản **26ai.khoint2** tại `http://127.0.0.1:3210/auth/setup`. Xem [hướng dẫn chạy máy chủ, sao lưu và khôi phục mật khẩu](self-host/README.md).

Máy chủ tự tạo 10 nhân sự và nhập đúng một lần các dữ liệu đã đối chiếu từ hai Google Sheets: 9 task, 18 daily report, 27 bản ghi điểm danh. Khởi tạo và nhập dữ liệu chạy trong một giao dịch, có khóa chống trùng. Chỉ trang trên máy host mới cho thiết lập mật khẩu Lead lần đầu.

10 tài khoản hiện tại có thể đăng nhập trực tiếp. Với thành viên mới, tại **Nhân sự**, chọn **Mời / Phân quyền**, đặt trạng thái **Đã mời**, rồi lưu. Gửi liên kết kích hoạt riêng cho đúng thành viên; người đó mở liên kết và tự đặt mật khẩu. Liên kết dùng một lần, hết hạn sau 7 ngày. Tên đăng nhập là phần trước `@` của email đã khai báo. Lead tạo liên kết khôi phục mật khẩu trong Nhân sự khi cần. Vô hiệu hóa tài khoản sẽ chặn API ngay.

## Phân quyền và phân bổ QA/QC

9 thành viên ban đầu đều là Annotator. Lead chọn hai người và đổi role sang **QA/QC** khi đã quyết định. QA/QC vẫn được nhận task annotation và gửi báo cáo cá nhân, với mục tiêu **50% thời gian annotation / 50% thời gian QC**. Daily report có loại hoạt động riêng, weekly report tổng hợp thời gian thực tế từng phần. Không tự suy ra thời gian từ sản lượng và không giới hạn sản lượng ở mức KPI.

## Điểm danh, đi trễ và tác phong

Mỗi ngày làm việc theo lịch công ty, hệ thống mặc định **Có mặt** và **Đúng quy định** cho thành viên đang hoạt động. Không tạo giờ vào/ra giả. Các trạng thái nghỉ, nửa ngày, đi trễ và tác phong đã được ghi sẽ được giữ nguyên; tác phong còn trống được bổ sung mặc định từ ngày bật tính năng. Hệ thống không sửa dữ liệu lịch sử trước ngày đó.

**Chỉ tài khoản Nguyễn Tuấn Khôi** được sửa ngoại lệ. Thành viên không tự check-in hoặc check-out. Vào **Điểm danh → Ghi điểm danh**, chọn người, ngày, trạng thái, số phút trễ, tác phong và ghi chú. Nghỉ nửa ngày hiển thị ký hiệu **½**; ghi nghỉ sáng/chiều trong ghi chú. Giờ vào/ra là tùy chọn, chỉ nhập khi có thời gian thực tế. Mỗi người có một bản ghi/ngày; sửa sẽ cập nhật và lưu audit.

Thành viên chỉ xem điểm danh của mình; các nút tạo đơn, yêu cầu điều chỉnh và tab đơn nghỉ/điều chỉnh được ẩn. Server cũng chặn tạo đơn từ Annotator và QA/QC. Chỉ Nguyễn Tuấn Khôi được chỉnh điểm danh, tác phong hoặc xử lý các đơn cũ. Khôi mở bản ghi trong bảng/lịch để sửa.

## Dự án và giao task

1. Vào **Dự án & Task → Dự án → Tạo dự án**. Chọn đơn vị frame, cuboid hoặc scene; nhập hướng dẫn và chỉ tiêu ngày nếu có.
2. Chọn **Danh sách task → Giao task**. Nhập Task ID hoặc Job ID, người thực hiện, người kiểm tra, khối lượng giao, ngày giao và deadline. Khi đã có Job ID, có thể để trống Task ID và bổ sung sau.
3. Khi nhập cả hai ID, server tự tạo link `https://cvat-test.vantixapps.net/tasks/{Task ID}/jobs/{Job ID}`. Có thể giao nhiều Job khác nhau thuộc cùng một Task. Không tạo trùng cùng cặp Task/Job.
4. Job ID của 10 người đã được đính chính theo ảnh ngày 23/10/2026; Task ID để trống theo yêu cầu của Lead. Link CVAT tự tạo khi bổ sung đủ hai ID. Deadline và khối lượng giao còn thiếu cần được Lead bổ sung trước khi cập nhật tiến độ; hệ thống không tự bịa deadline hoặc coi sản lượng đã làm là tổng khối lượng giao. Người kiểm tra tạm là Lead cho đến khi chọn QA/QC.

## Luồng làm việc và QC vào sáng hôm sau

Annotator mở task → **Cập nhật tiến độ** → **Gửi QA/QC**. QA/QC được phân công hoặc Lead ghi kết quả ở trang **QA/QC**. Chọn đúng **ngày sản lượng được kiểm**: ví dụ kiểm ngày 22/10 cho công việc ngày 21/10. Thời điểm kiểm tra vẫn lưu theo máy chủ.

Ghi số đã kiểm, đạt, cần sửa, kiểm toàn bộ hay mẫu và danh mục lỗi. Khi kiểm mẫu phải mô tả mẫu. Annotator vào **QA/QC**, mở kết quả QC của bài mình để xem lỗi và minh chứng. Sau khi sửa từng lỗi, chọn **Đánh dấu đã sửa**. Khi tất cả lỗi của lượt QC mới nhất đã sửa, chọn **Đã sửa · Gửi kiểm tra lại**. Người khác không được đánh dấu thay annotator. Đã sửa không đồng nghĩa đạt QC; QA/QC hoặc Lead vẫn kiểm tra lại. Các lượt QC cũ được giữ nguyên trong lịch sử.

QC không tự thay thế sản lượng ngày bằng số đã kiểm: kiểm mẫu và sản lượng ngày có phạm vi khác nhau. Nếu cần điều chỉnh daily report, Lead mở lại báo cáo để người báo cáo chỉnh số liệu và gửi lại.

## Báo cáo và xuất dữ liệu

Daily report: một báo cáo/người/ngày, nhiều bài làm. Annotator chọn bài được giao, xem **Task ID / Job ID**, nhập **ID đã làm tới**, số cuboid làm trong ngày và thời gian thực tế. ID cuối là mốc tiến độ, không dùng để tự suy ra cuboid. Server lấy Task/Job từ bài đã giao. Sản lượng trong ngày và sửa lỗi ghi riêng. Với QC chỉ ghi thời gian; kết quả kiểm ghi ở QA/QC. Có lưu nháp và gửi. Báo cáo đã gửi hoặc duyệt bị khóa cho đến khi Lead mở lại.

Danh sách **Daily report của tôi** chỉ hiện báo cáo cá nhân, xếp theo ngày báo cáo mới nhất trước; CSV/Excel cá nhân cũng theo phạm vi này. Lead có tab **Báo cáo toàn team** để xem và duyệt chung. Báo cáo nguồn của người khác được giao kiểm vẫn nằm trong mục **QA/QC**. Trong **Dự án & Task**, bài được giao để kiểm có nhãn **QC**, bài do chính mình annotate có nhãn **Annotation**.

Daily Report tự chuyển sang **Đã duyệt** khi đã QC đủ phần ID của tất cả Job annotation trong báo cáo và không còn lỗi chưa sửa. Nếu có lỗi, annotator xác nhận sửa hết log thì báo cáo được duyệt; nếu lần QC sau ghi lỗi cũ vẫn sai, báo cáo liên quan trở lại chưa duyệt đến khi sửa xong. Việc duyệt không xóa lượt rework và không đánh dấu cả Job hoàn thành. Lead mở lại rồi annotator gửi lại báo cáo thì cần QC cho nội dung mới. ID lịch sử được khôi phục từ mốc ID đã ghi, không tính ngược từ số cuboid.

Ô **Điểm danh của tôi hôm nay** chỉ tính tài khoản đang đăng nhập. Ô **Nhịp làm việc hôm nay** của Lead tính các thành viên đang hoạt động trong toàn team; không dùng danh sách người liên quan đến Job QC để suy ra ai chưa điểm danh.

Form Daily không còn các ô Công việc đã làm, Link minh chứng, Kết quả đã hoàn thành, Vấn đề đang chặn công việc và Hỗ trợ cần thiết. Ghi vấn đề tại **Vướng mắc / cần hỏi** của từng Task/Job; kế hoạch ngày tiếp theo vẫn giữ. Nội dung kết quả trong Excel tự tổng hợp từ Task/Job, ID cuối và sản lượng khi không có mô tả cũ.

Lead nhấn báo cáo → **Duyệt / Mở lại**. Với weekly report, chọn nhân sự hoặc **Toàn team** để tổng hợp. Bản weekly gửi đi lưu số liệu và danh sách nguồn tại thời điểm gửi; phần tổng hợp trên trang phản ánh dữ liệu hiện tại. Chất lượng tính theo dự án: đạt lần đầu / đã kiểm lần đầu, luôn giữ mẫu số.

Dùng bộ lọc rồi chọn **CSV** hoặc **Excel**. Backend áp dụng cùng quyền truy cập và bộ lọc. Excel có tiêu đề, độ rộng cột, hàng xen màu, bộ lọc và cố định dòng đầu. Điểm danh tách từng cột; Daily có các tab tổng hợp ngày, chi tiết Task/Job/ID và KPI lũy kế; QC tách kết quả và từng lỗi; Weekly tách báo cáo và sản lượng theo dự án. Không có cột dữ liệu JSON trong các báo cáo Excel. Bản sao lưu JSON ở Cài đặt vẫn dùng cho khôi phục.

## KPI ngày và lũy kế

Mỗi ngày tính KPI cộng mức KPI của người đó vào mục tiêu lũy kế; mặc định **1.200 cuboid/người**. Khôi chọn **Chỉnh KPI** ở dòng nhân sự trong bảng lũy kế để tăng/giảm, ví dụ QA/QC **600 cuboid/ngày**, và chọn **Áp dụng từ ngày**. Lịch sử trước ngày hiệu lực giữ mức cũ. Xem/sửa các mốc tại **Cài đặt → Mức KPI riêng theo người**. Đổi vai trò QA/QC không tự đổi KPI; Khôi chọn mức phù hợp.

Tính thứ Hai–thứ Sáu; Chủ nhật không tính. Thứ Bảy làm/nghỉ cách tuần, mốc hiện tại là **24/10/2026 làm**, **31/10 nghỉ**, **07/11 làm**. Ngày bắt đầu lũy kế mặc định **20/10/2026**. Khôi đổi ngày bắt đầu và một thứ Bảy làm việc tại **Cài đặt → Quy tắc làm việc → Chỉnh sửa**.

Ở **Tổng quan / Daily Report → Không tính KPI ngày…**, Khôi chọn ngày và **Toàn team** hoặc một người. Ngày loại trừ không cộng KPI, không xóa sản lượng và không đổi điểm danh thành nghỉ. Xem danh sách tại **Cài đặt → Lịch KPI và ngày không tính**; chọn **Tính lại KPI** để bỏ ngoại lệ. Mục tiêu không tự giảm theo nghỉ nửa ngày; Khôi chủ động đặt mức riêng hoặc chọn ngày miễn KPI.

Bảng **Cuboid đã làm / KPI lũy kế** dùng sản lượng cuboid từ báo cáo đã gửi/duyệt và dữ liệu lịch sử đang giữ. Nháp không cộng vào lũy kế; QC và sửa lỗi không được cộng thêm vào sản lượng mới. Ngày không tính KPI có mục tiêu bằng 0; không chia cho 0 khi hiển thị phần trăm. Sản lượng làm thêm vào ngày đó vẫn được ghi nhận.

## Xuất báo cáo vào buổi sáng

Vào **Daily Report → Xuất báo cáo buổi sáng**, chọn ngày báo cáo và ngày sản lượng rồi tải Excel. Mặc định lấy ngày làm việc gần nhất: sáng 22/10 lấy kết quả 21/10; sáng thứ Hai lấy thứ Bảy hoặc thứ Sáu tùy lịch công ty. Có thể chọn lại ngày.

File có các cột **hôm qua đã làm gì, Task ID, Job ID, ID đã làm tới, cuboid, KPI ngày, hôm nay dự kiến làm gì, vấn đề và hỗ trợ**. Tab thứ hai tách từng dòng công việc. Cả hai tab bỏ cột **Trạng thái báo cáo**. Người chưa gửi báo cáo được ghi rõ; sản lượng thiếu giữ trống.

Bạn có log lỗi QC trong ngày hôm qua (theo giờ Việt Nam) sẽ có kế hoạch **“sửa log hôm qua, làm X cuboiz”**. X lấy theo KPI riêng có hiệu lực vào **ngày báo cáo buổi sáng**, gồm lịch làm việc và ngày miễn KPI: ví dụ 1.200 cho annotator, 600 cho người đã đặt KPI 600. Lỗi được tính cho người annotation, không phải người QC. Các bạn còn lại lấy **Kế hoạch ngày làm việc tiếp theo** trong báo cáo ngày trước; nếu chưa nhập thì ghi rõ chưa cập nhật. Quy tắc này chỉ thay đổi file xuất, không ghi đè báo cáo gốc.

Excel Daily thông thường còn có tab **Lịch KPI** theo từng người/ngày. Tổng KPI lũy kế lấy từ tab này nên vẫn đúng khi mức KPI thay đổi giữa kỳ hoặc có ngày miễn KPI.

## Dữ liệu nhập và các phần còn thiếu

- Nguồn: hai Google Sheets người dùng đã cung cấp. Snapshot nhập là dữ liệu thực tế đã đọc, không phải dữ liệu demo và chưa có đồng bộ Google Sheets tự động.
- Dữ liệu này vẫn được giữ theo yêu cầu; các dòng thông báo nguồn nhập được ẩn khỏi giao diện.
- Ngày điểm danh 21/11 và 22/11 được sửa thành **21/10 và 22/10/2026** theo xác nhận của Lead.
- Tổng ngày **20/10: 5.520**, **21/10: 11.280 cuboid**. Đã dùng giá trị sản lượng ngày trong sheet, không cộng trực tiếp ID cộng dồn. Lead xác nhận tổng này đã trừ phần lỗi. Đây không phải tỷ lệ chất lượng QC.
- Giữ nguyên ghi chú nguồn. Chuẩn hóa “Cầm Vũ Ngọc Thạch” và “Phạm Nguyễn Tuấn” theo danh sách nhân sự đã xác nhận.
- Chưa có giờ làm, số sửa lỗi cụ thể, deadline, khối lượng giao và kết quả kiểm có mẫu số: hiển thị thiếu dữ liệu tương ứng. Không tự tạo giờ công hoặc điểm chất lượng.
- 2 ghi nhận rework trong báo cáo tuần chưa có ngày bắt đầu tuần được giữ riêng, chưa cộng vào tổng hợp.

## Giao việc QC, log lỗi và kiểm lại hằng ngày

Mở **QA/QC → Giao việc & tiến độ QC**. Ngày sản lượng mặc định là hôm qua; chọn người annotation để xem Task/Job, cuboid và ID đã làm tới trong Daily Report. Nếu nghỉ cuối tuần, chọn ngày có báo cáo gần nhất.

1. Lead bấm **Giao QC**, chọn người giữ vai trò QA/QC (hoặc Lead), ngày phải kiểm và ghi chú. Có thể đổi người khi việc chưa bắt đầu. Chọn vai trò QA/QC tại Nhân sự trước khi phân công.
2. Người được giao bấm **Bắt đầu QC**. Hệ thống ghi giờ thực tế và chốt ID cuối theo báo cáo nguồn. Nếu báo cáo cũ chưa ghi ID, nhập ID đã xác minh và nguồn xác minh. Phạm vi đã bắt đầu không thay đổi theo báo cáo về sau.
3. Mở **Ghi kết quả** để xem **Bảng kiểm từng Object ID**: mỗi dòng là một ID từ ID bắt đầu đến ID cuối đã chốt. Mặc định ID bắt đầu là sau lần QC trước khi có tiến độ mới; có thể chỉnh trước khi bắt đầu. Chọn **Đạt** hoặc **Có lỗi**, ghi Frame ID, loại lỗi, mức độ và log ngay trên dòng. Có tìm ID, lọc kết quả và phân trang 25 dòng. Nút **Đánh dấu các ID chưa kiểm là đạt** dùng khi đã kiểm xong những ID đó; hệ thống không tự đánh đạt. Chọn **Lưu nháp** để tiếp tục sau, hoặc **Hoàn tất & lưu log QC** khi tất cả ID đã kiểm. ID có lỗi phải có nội dung log. Mỗi lỗi cũ cần kiểm lại đều phải chọn Sửa đúng hoặc Vẫn sai trong bảng riêng; chỉ xác nhận Sửa đúng sau khi annotator đã xác nhận sửa.
4. Annotator vào **Log lỗi & xác nhận sửa**, xem bảng mỗi dòng một Object ID, đọc lỗi, sửa trên CVAT và xác nhận từng lỗi kèm ghi chú ngay trong bảng. Xác nhận của annotator chưa phải kết luận của QC. Các log cũ vẫn giữ nguyên nội dung và được gom theo ID; không tự thêm kết quả Đạt cho ID chưa có log.
5. Hôm sau bắt đầu phiên mới để kiểm lỗi cũ và ID mới. Lỗi cũ vẫn sai tự tạo dòng lỗi mới có liên kết về lỗi gốc; lịch sử xác nhận và kiểm lại trước đó được giữ. Mỗi người mỗi ngày QC có lỗi chỉ cộng 1 rework.

Lead xem việc Chưa bắt đầu / Đang QC / Đã ghi kết quả, ai thao tác, giờ bắt đầu, giờ hoàn tất và log chi tiết. **Excel log QC** xuất bảng phân công/tiến độ, lỗi/xác nhận sửa, kiểm lại lỗi cũ, **QC từng ID** và cách tính. Số ID đạt không phải tỷ lệ cuboid đạt. QC hằng ngày không tự đóng toàn bộ Job; phần **Nghiệm thu toàn bộ Task/Job** vẫn dùng khi hoàn thành cả bài.

## Đánh giá toàn team

Mở **Đánh giá team** ở thanh bên bằng tài khoản Lead. Chọn khoảng ngày, nhân sự, vai trò hoặc trạng thái tài khoản; tìm tên hoặc tên đăng nhập bằng ô tìm kiếm phía trên. Tổng ở đầu trang và file xuất đều theo bộ lọc đang chọn.

- **Tổng hợp**: cuboid đã làm/KPI trong kỳ, tỷ lệ hoàn thành, số Task/Job đã đạt QC, lượt QC trả sửa, đi trễ, vắng, nghỉ phép, nửa ngày và tác phong.
- Rework bổ sung được tính theo ngày, hiển thị số lượt và **Ngày có rework** trong chi tiết. Không hiển thị nguồn của các lượt bổ sung trong giao diện hoặc Excel. Mỗi người mỗi ngày vẫn chỉ tính 1 nếu ngày đó có cả ghi nhận thủ công và log trong ứng dụng. Ghi nhận này không tạo thêm lỗi theo ID, lượt QC đã thực hiện hoặc sản lượng; ghi nhận cũ chưa có ngày vẫn giữ riêng cho đến khi xác minh.
- **Công việc & QC**: tỷ lệ cuboid đạt ở lượt QC đầu, số lượt QC thực hiện, khối lượng sửa đã báo cáo và mức đầy đủ của Daily Report. Không có QC thì chưa có tỷ lệ chất lượng.
- **Chuyên cần**: tách đi trễ, vắng, nghỉ phép, nghỉ nửa ngày và tác phong. Có mặt quy đổi tính ngày đủ + ngày trễ + 0,5 × số lần nửa ngày; đây là thống kê, không phải công thức lương.

Bấm tên để xem các báo cáo, bài hoàn thành, lượt trả sửa và điểm danh nguồn. Số lần rework tính theo người/ngày QC có lỗi, kể cả bài đã sửa xong: một người có nhiều lỗi, nhiều Job hoặc nhiều log trong cùng ngày vẫn chỉ cộng 1. Ngày sau lỗi cũ vẫn sai thì cộng thêm 1 cho ngày sau. Hai ghi nhận cũ chưa có ngày được giữ riêng. Phút trễ, giờ công hoặc ngày hoàn thành chưa biết được ghi rõ, không tự suy ra.

Cuboid sửa lại không cộng thêm vào sản lượng mới; sản lượng hợp lệ trước đó được giữ. Lỗi đã trừ khỏi tổng thì không trừ lần thứ hai. Khi giao riêng thời gian QC/sửa bài, Khôi có thể điều chỉnh mức KPI từ ngày áp dụng; mức đó tiếp tục có hiệu lực đến lần điều chỉnh kế tiếp.

Nút **Excel** xuất bốn bảng: tổng hợp, công việc & QC, chuyên cần, cách tính. Bảng có cột, bộ lọc, tiêu đề cố định và công thức tỷ lệ. Số liệu hôm nay còn đang cập nhật; có thể chọn kết thúc hôm qua để xem kỳ đã qua.

## Sao lưu và khôi phục

**Cài đặt → Sao lưu JSON** tải dữ liệu nhân sự, dữ liệu nghiệp vụ, nguồn nhập và nhật ký; không chứa mật khẩu. Lưu bản sao ở vị trí riêng tư trước các thay đổi lớn và định kỳ theo nhu cầu team.

Tệp minh chứng nằm trong `self-host/data/files`; bản JSON chỉ chứa metadata. Chạy **self-host/BackupHub.cmd** để tạo bản sao đầy đủ gồm SQLite, giá trị băm mật khẩu và nội dung tệp. Bản sao đầy đủ không chứa phiên đăng nhập hoặc các token kích hoạt/khôi phục. Cất thêm bản sao ở thiết bị riêng để tránh mất dữ liệu khi máy host hỏng.

**Khôi phục bản sao lưu JSON** chỉ dành cho Nguyễn Tuấn Khôi, chỉ nhận bản cùng ứng dụng tự host, giữ thông tin đăng nhập Lead hiện tại và đòi nhập `KHOI PHUC`. Thao tác thay thế dữ liệu nghiệp vụ/nhân sự trong giao dịch; nhật ký hiện tại được giữ và thêm sự kiện khôi phục. Các phiên của thành viên khác và lời mời chưa dùng bị thu hồi. Tải bản sao hiện tại trước khi thực hiện. Khôi phục đầy đủ bằng script yêu cầu dừng máy chủ; xem hướng dẫn tự host.

## Cấu hình kỹ thuật

- Runtime hiện tại: React/Vite + Node.js 24, SQLite và tệp trên máy host. Server chỉ lắng nghe `127.0.0.1:3210`; Cloudflare Tunnel đưa HTTPS từ Internet về máy.
- Tài khoản Lead cố định là Nguyễn Tuấn Khôi, email `26ai.khoint2@vinuni.edu.vn`. Chỉ Lead được đánh điểm danh, đi trễ và tác phong.
- Backend dùng phiên đăng nhập từ cookie HttpOnly, kiểm tra trạng thái tài khoản và quyền từng thao tác; không chấp nhận header định danh ChatGPT hoặc tên người báo cáo từ client.
- Dữ liệu, bản build và bộ chạy nằm trong thư mục bị Git bỏ qua. Không đưa `self-host/data` hoặc `.runtime` lên kho mã nguồn.
- Migration schema tại `drizzle/`. Dữ liệu nhập tại `data/initial-import.json`, chỉ nạp ở backend trong thiết lập lần đầu.
- Build: `node self-host/build.mjs`. Kiểm tra TypeScript, nghiệp vụ và `node --test tests/self-host.test.mjs` sau khi build.
- Đường dẫn miễn phí thay đổi khi tunnel được tạo lại; máy phải bật, có mạng và không ngủ để team truy cập. Chưa cài tự khởi động cùng Windows.


## Hỏi đáp và câu hỏi thường gặp

Các nội dung Q&A đã được Lead duyệt nằm trong dữ liệu ứng dụng và bản sao mã hóa; không đưa nội dung hướng dẫn nội bộ cụ thể vào tài liệu công khai.

Mở **Hỏi đáp** ở thanh bên. Thành viên tìm từ khóa trước khi đặt câu hỏi; tìm kiếm hỗ trợ tiếng Việt không dấu và tìm cả tiêu đề, nội dung hỏi/trả lời, chủ đề, Job/Object ID/frame đã ghi. Có bộ lọc chủ đề, Chờ trả lời / Đã có trả lời / Đã giải đáp / Thường gặp và Câu hỏi của tôi.

Bấm **Đặt câu hỏi**, nhập tiêu đề, mô tả vấn đề, chủ đề và Job/Object ID/frame nếu có. Mọi thành viên đang hoạt động đều đọc và trả lời được. Tác giả hoặc Lead bấm **Chọn làm câu trả lời** để đánh dấu đã giải đáp; câu trả lời đó được đưa lên trước. Lead bấm **Đánh dấu thường gặp** sau khi đã chọn câu trả lời để đưa vào khối tra cứu chung. Có thể mở lại khi cần trao đổi tiếp.

Chỉ tác giả hoặc Lead được sửa câu hỏi/câu trả lời; hệ thống chặn ghi đè phiên bản cũ. Sửa nội dung câu hỏi hoặc câu trả lời đang được chọn sẽ mở lại và bỏ đánh dấu thường gặp để xác nhận lại. Nội dung được lưu trong SQLite, đi kèm bản sao lưu/khôi phục hiện có. Trang này dùng nội bộ sau đăng nhập; không có bot AI hoặc gọi API CVAT. Không nạp câu hỏi mẫu vào DB thật.

## Weekly Report tự tổng hợp từ Daily Report

Báo cáo lịch sử đã được bổ sung theo số liệu Lead xác nhận. Khối lượng QC được chấp nhận tính KPI vẫn lưu là QC, không tạo kết quả kiểm tra hoặc quality. ID cuối, Job, giờ làm và số bài chưa được cung cấp vẫn để trống. Các số ước lượng có ghi chú riêng; lịch/mức KPI và ngày miễn được giữ nguyên.

Bản mới có tab tổng hợp tuần, KPI từng ngày, điểm danh/tác phong và lượt QC/chất lượng. Chọn tuần Thứ Hai–Chủ Nhật và toàn team hoặc từng người, rồi bấm **Excel báo cáo tuần**. Không cần viết Weekly Report thủ công trước.

KPI tuần là tổng KPI từng ngày của đúng người đó: áp dụng mức riêng theo ngày hiệu lực, lịch thứ Bảy cách tuần, Chủ nhật và ngày miễn KPI. Ví dụ hai ngày 1.200 và ba ngày 600 cho KPI tuần 4.200. Bảng tổng hợp và Excel chỉ có **một cột KPI chung**, sau tên/vai trò, rồi các cột tiến độ T2–T6 và T7 khi là tuần làm thứ Bảy. QA/QC có KPI dạng `600/2`: 600 cuboid theo mức Lead đặt và 2 bài cần QC mỗi ngày. Nếu mức đổi trong tuần, một ô ghi các mức và khoảng ngày áp dụng. Ngày chưa gửi hoặc chưa đến để trống tiến độ. Bảng chi tiết KPI từng ngày vẫn giữ số liệu ngày để đối chiếu; việc gộp cột không đổi công thức hay sản lượng.

Tiến độ ngày của QA/QC ghi `600/2`, nghĩa là 600 cuboid annotation và 2 Job khác nhau đã QC trong ngày. Lượt QC tuần đếm từng lượt đã ghi kết quả, gồm kiểm lại; phân công chưa thực hiện chưa tính. Đã bỏ các cột KPI ngày chốt, Job đã QC theo tuần và Số kiểm lần đầu. Quality dùng kết quả QC lần đầu, không cộng trùng lượt sửa hay trộn ID với cuboid. Thiếu mẫu số thì để trống.

Nghỉ quy đổi = nghỉ phép cả ngày + vắng cả ngày + 0,5 × số lần nghỉ nửa ngày. Một ngày và một nửa ngày hiển thị 1,5. Rework mỗi người mỗi ngày có lỗi tính một lần.

Excel có bảng tổng hợp, KPI từng ngày, log QC/chất lượng, điểm danh/tác phong và công việc trong tuần; tiêu đề/bộ lọc, cố định tên/vai trò và dòng tổng có công thức. Có thể bổ sung dữ liệu còn thiếu trong Excel; sửa file không tự ghi vào DB. KPI trong ứng dụng đổi bằng chức năng chỉnh KPI của Lead.

Tuần lịch sử được Lead xác nhận có thể dùng tổng đã chốt riêng. Khi chưa có phân bổ, các ô ngày để trống; không tự chia đều, sửa Daily Report hay thay mức KPI/lũy kế của các kỳ khác. Tổng đã chốt nằm trong SQLite và bản sao mã hóa.

## KPI từ Datumaro và hướng dẫn mốc ID

Đã triển khai ngày 26/10/2026. Khi giao Job, mở chi tiết Task → **Cuboid theo ID / KPI**, tải Datumaro trước khi annotator làm và xác nhận file ban đầu. Các file sau chỉ bổ sung ID mới; số cuboid của ID cũ giữ theo file đầu dù file sau giảm do outside. Ví dụ 3.500 ban đầu, file sau 2.700 có 200 mới thì bảng tính là 3.700. Một cặp ID/frame trong Datumaro tính một cuboid; không nhân 0,85, không cộng trùng qua các lần tải.

Mỗi ngày thành viên nhập **ID đã làm tới** là ID cuối đã hoàn thành liên tục của Job. Hệ thống cộng số cuboid của từng ID sau mốc báo ngày trước đến mốc hôm nay. Thẻ hướng dẫn hiện **Để đủ KPI hôm nay: làm tới ID X**, dựa trên KPI của đúng người, đúng ngày và sản lượng các bài khác. Nếu file chưa đủ ID/khối lượng, hệ thống báo cần bổ sung thay vì ước lượng mốc.

ID mới giữ số lớn nhất đã thấy trước khi báo hoàn thành; khi đã báo, phần sửa lại không cộng thêm. Báo cáo đã chốt giữ snapshot, không đổi khi tải file sau. Các KPI và công thức báo cáo cũ giữ nguyên. File phải cùng Job, cùng frame và ID ổn định; đổi số ID/gộp/xóa/tách cần đối chiếu trước. File ban đầu bị thiếu outside từ trước không khôi phục được bằng cách này. Không gọi API CVAT.
## KPI tuần của thành viên và KPI lũy kế của Lead

Thành viên (Annotator và QA/QC) xem **KPI tuần này** ở Tổng quan và Daily Report, chỉ của bản thân. Tuần tính từ thứ Hai đến Chủ nhật, bắt đầu lại mỗi thứ Hai. Sản lượng chỉ cộng Daily Report đã gửi trong tuần đến hôm nay, không cộng lại tuần trước, nháp, giờ QC hoặc rework.

Mục tiêu là tổng KPI của cả tuần: cộng mức riêng theo từng ngày, lịch thứ Bảy luân phiên và ngày miễn KPI. Ví dụ tuần 26/10–01/11 nghỉ thứ Bảy có 5 ngày: 1.200/ngày là 6.000, hoặc 600/ngày là 3.000; nếu có thay đổi giữa tuần thì cộng từng mức ngày tương ứng.

Chỉ Lead xem bảng KPI lũy kế từ ngày bắt đầu theo dõi. API và Excel Daily Report của thành viên cung cấp KPI tuần; yêu cầu lũy kế bị từ chối. Lead vẫn xuất được lũy kế. Lịch sử Daily Report và sản lượng đã lưu được giữ nguyên.
## Ma trận QC như Excel

Trong QA/QC, chọn **Ghi kết quả → Ma trận ID × Frame → Mở rộng bảng**. Mỗi dòng là một Object ID, mỗi cột là frame; ba cột đầu được cố định khi cuộn ngang. Chọn một ô để đọc cảnh báo Tool_QC, hoặc kéo nhiều frame trên cùng ID để tạo một log cho cả vùng. Có thể chỉnh frame đầu/cuối và ghi nhiều log trên cùng ID. **Lưu log vào nháp** lưu ngay để quay lại tiếp tục; **Hoàn tất & lưu log QC** mới gửi cho annotator.

**Xuất Excel ma trận** tải bảng đã lưu với mã/màu lỗi, viền trạng thái sửa, bảng log (một dòng cho một phạm vi) và kết quả kiểm của từng ID. Khi đang QC, nút xuất lấy nháp đã lưu. Annotator chỉ xem/xuất kết quả đã hoàn tất của bản thân và xác nhận sửa một lần cho mỗi log phạm vi. Cảnh báo tool không tự tạo rework; mỗi người mỗi ngày QC có lỗi vẫn chỉ cộng một rework.

Đẩy mã nguồn lên GitHub không kèm DB và file công ty. Khi chuyển sang máy host khác, chuyển bản sao lưu đầy đủ của `self-host/admin.mjs backup` riêng và khôi phục theo hướng dẫn self-host; giữ dữ liệu thô ngoài Git.
## Giao task kèm Datumaro và mốc ID đủ KPI

Trong **Giao task**, chọn dự án cuboid, nhập Task/Job và người làm. Phần **File Datumaro ban đầu của Job** nhận JSON/ZIP. Chọn file rồi bấm **Đếm ID và cuboid** để xem tổng ID, tổng cuboid, số frame và bảng số cuboid từng ID. Có nút Excel theo ID. Chỉ xử lý file trên máy host, không kết nối CVAT công ty.

Đối chiếu đúng Job/Object ID và xác nhận đây là file xuất trước khi annotator làm. Bấm **Lưu thay đổi** để lưu task và mốc ban đầu cùng một lần. Khối lượng/số frame được điền từ file. Đóng form trước khi lưu chưa tạo task; có thể mở lại, nhập cùng Job và chọn **Tiếp tục file đã đếm cho Job này**. File đang xem trước chỉ Lead thấy. Job đã có bảng đếm giữ nguyên mốc ban đầu; file sau dùng cập nhật ID mới.

Annotator thấy **Hôm nay làm tới ID bao nhiêu?** ở Tổng quan, Dự án & Task và chi tiết bài, đồng thời thấy gợi ý trong Daily Report. Mốc dùng số cuboid của từng ID, ID đã báo các ngày trước, KPI riêng theo ngày, các bài khác đã gửi, lịch thứ Bảy luân phiên và ngày miễn KPI. Nếu Job còn thiếu khối lượng, ghi rõ số còn thiếu. Nhập ID cuối đã hoàn thành liên tục trong Daily Report để tính sản lượng; rework không cộng lại ID cũ. KPI/báo cáo đã lưu không tự tính lại khi thêm file.
