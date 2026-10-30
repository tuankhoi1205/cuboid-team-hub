# Tool_QC trên Cuboid Team Hub

Mã kiểm tra gốc do Khôi cung cấp từ `Tool_QC/datumaro_qa_ubuntu/datumaro_qa_ubuntu`. Sáu quy tắc giữ nguyên trong `datumaro_qa.py`; bản web chỉ giới hạn nơi ghi Excel vào thư mục xử lý riêng. `ORIGINAL_README.md` là hướng dẫn gốc. `web_runner.py` là adapter không mở hộp thoại hoặc ghi vào thư mục file đầu vào.

## Quy trình trên web

1. Lead giao QC một lần cho Job. Người QA/QC được giao hoặc Lead mở **Chạy Tool_QC lần đầu**.
2. Save bài trên CVAT, xuất **Datumaro 3D 1.0**. Tải JSON trong `annotations/`, hoặc ZIP có đúng một JSON annotation; tối đa 25 MB. ZIP nhiều subset cần chọn riêng JSON của Job.
3. Đọc các nhóm cảnh báo, lọc Object ID/frame và tải Excel đầy đủ. ID mặc định cộng 1 để đối chiếu CVAT; frame giữ nguyên giá trị trong file.
4. Người QC ghi nhận xét, xác nhận đã xem kết quả và **Hoàn tất bước cơ bản**. Sau đó bắt đầu QC chi tiết trong bảng từng ID. Chỉ lỗi được xác nhận trong QC chi tiết mới tạo luồng sửa/rework.

Những ngày sau không phải chạy Tool_QC lại. Lead có thể chạy lại bằng file mới khi có lý do; giữ lịch sử cũ. File lỗi có thể thử lại. Job đã bắt đầu QC trước khi tích hợp tool tiếp tục phiên cũ.

Tool bỏ qua box có outside khi kiểm hình học, đồng thời hiển thị riêng số bản ghi outside có trong file. Không suy ra các box đã bị định dạng xuất loại bỏ. Số cuboid/cảnh báo của tool không tự ghi sản lượng, không duyệt Daily Report và không đổi KPI. Bảng cuboid theo ID và đối chiếu Daily Report đã triển khai ngày 26/10/2026.

## Python chạy độc lập

Trên **VPS Linux**, dùng Python 3.10+ và cài runtime ngay trong repo:

```bash
# Ubuntu/Debian nếu chưa có Python/venv/pip:
sudo apt-get install -y python3 python3-venv python3-pip
python3 self-host/tool-qc/setup_runtime.py
python3 self-host/tool-qc/setup_runtime.py --check
```

Sau đó restart service web. Bộ cài Linux dùng được cả lần đầu và cập nhật venv cũ. `requirements.txt` ở gốc repo và `self-host/tool-qc/requirements.txt` dùng cùng dependencies đã kiểm thử: openpyxl 3.1.5 và et_xmlfile 2.0.0. Không cần Tkinter/display hay PyInstaller cho web. Đường dẫn venv được web nhận tự động; nếu service có override `HUB_QC_PYTHON` thì cập nhật nó theo [hướng dẫn VPS](../VPS.md).

Máy hiện tại đã chuẩn bị Python + openpyxl riêng trong `self-host/.runtime/qc-python`. Bản này chạy độc lập, không gọi runtime của Codex/ChatGPT. Thư mục runtime không được commit lên Git.

Trên máy Windows mới có Python và openpyxl:

```powershell
py -3 -m pip install -r self-host/tool-qc/requirements.txt
py -3 self-host/tool-qc/setup_runtime.py
```

Trên Windows, script chép bộ chạy riêng và không ghi đè runtime đã có. Hoặc đặt `HUB_QC_PYTHON` tới Python có openpyxl. `--check` chỉ kiểm tra import, không cài hay chép runtime.

Tool chạy trong tiến trình nền riêng, một file mỗi lúc, dừng sau 120 giây nếu vượt thời gian. Kết quả lớn được lưu trong kho tệp riêng và phân trang 25 dòng; không nhúng toàn bộ cảnh báo vào phản hồi workspace. Sau khi server khởi động lại, lượt đang chạy được chuyển sang không hoàn tất để chạy lại.

DB giữ tóm tắt/lịch sử; JSON gốc, JSON kết quả và Excel lưu trong `self-host/data/files`, cùng cơ chế quyền và sao lưu đầy đủ hiện tại. Chưa đồng bộ trực tiếp với CVAT; người dùng tải file xuất lên.


## KPI Datumaro theo ID — đã triển khai 26/10/2026

1. Khi giao Job, Lead xuất Datumaro 3D JSON/ZIP trước khi annotator làm, mở **Cuboid theo ID / KPI** trong chi tiết Task, QA/QC hoặc Daily Report và xác nhận file ban đầu. Mỗi cặp Object ID/frame được tính một cuboid, gồm cả nội suy có trong Datumaro; không nhân 0,85. File ban đầu và số cuboid của từng ID được giữ cố định.
2. File xuất sau bổ sung số cuboid của các ID mới. Ví dụ ban đầu 3.500, file sau 2.700 gồm 200 cuboid của ID mới thì bảng tính KPI là **3.500 + 200 = 3.700**. Không dùng chênh lệch hai tổng. ID cũ giảm/mất do outside vẫn giữ số ở file ban đầu.
3. ID mới giữ số cuboid lớn nhất quan sát được qua các file trước khi báo hoàn thành, không cộng lại qua từng lần tải. Sau khi ID đã báo hoàn thành, số tính cho ID đó được giữ; sửa/rework không phải sản lượng mới. Các snapshot Daily Report đã chốt không tự tính lại.
4. Mỗi ngày annotator chỉ nhập **ID đã làm tới**, là mốc cuối đã hoàn thành liên tục, không phải số ID riêng hôm nay. Server cộng cuboid của các ID sau mốc ngày trước đến mốc hôm nay. Các bài khác trong ngày cùng đóng góp vào mục tiêu cá nhân.
5. Daily Report hiện mốc ID nhỏ nhất đủ KPI bằng cách cộng đúng số cuboid từng ID. Mục tiêu lấy theo người, ngày hiệu lực, ngày làm việc và ngày được loại KPI. Không dùng số trung bình/ID. Nếu bảng đếm không đủ khối lượng, hiện còn thiếu bao nhiêu thay vì bịa mốc ID.

File ban đầu có thể tiếp tục dùng ở các ngày sau. Chỉ cần file mới khi bổ sung ID mới hoặc đối chiếu số đã quan sát. Với Job đang làm dở, file hiện tại không khôi phục được outside đã bị bỏ trước khi tạo mốc. KPI/báo cáo lịch sử giữ nguyên; không tự đổi sang cách tính mới.

Phải đối chiếu cùng Job và Object ID ổn định. Khác phạm vi frame/offset, thiếu ID/frame, trùng mâu thuẫn, đổi class hay ID mới chen vào khoảng cũ sẽ bị chặn để đối chiếu. Định dạng không chứng minh ai chỉnh prelabel và không tự phát hiện được mọi trường hợp đánh lại số ID. Không dùng file sau khi xóa/gộp/tách/đánh lại số Object mà chưa xác minh định danh.

Chỉ Lead được xác nhận mốc ban đầu; người làm hoặc người QC được giao có thể tải/xác nhận bản cập nhật. Xác nhận có kiểm tra phiên bản nguồn để tránh ghi đè khi hai người thao tác cùng lúc. Không đổi qua cách đếm khác cho Job đã có mốc.

### Bộ đếm JSON gốc để đối chiếu thêm

Mở **Cuboid theo ID / KPI** ở dòng Job trong QA/QC hoặc trong dòng Daily Report. Bộ đếm này chạy riêng với kiểm lỗi cơ bản, có thể cập nhật file hằng ngày mà không bắt chạy lại sáu kiểm tra hình học và không tự hoàn tất bước QC.

- Đọc Datumaro 3D JSON/ZIP hoặc `annotations.json` từ bản Backup CVAT được phép xuất. File tối đa 25 MB; JSON tối đa 30 MB sau giải nén. Không cần ảnh/point cloud. Không kết nối, gọi API, đăng nhập hoặc giữ token của CVAT công ty.
- Backup Task thông thường có thể chứa media gốc. Lightweight chỉ bỏ media khi nguồn Task là cloud storage; không cam kết backup chỉ có JSON. Chỉ dùng file annotation được công ty cho phép xử lý trên máy host.
- `annotations.json` của backup chứa một danh sách Job. Nếu nhiều Job, nhập thứ tự Job trong danh sách (1, 2, ...), không nhập Job ID. Không gộp dữ liệu các Job. Nhãn được giữ theo file.
- Raw track lưu các keyframe gốc; mỗi cặp Object ID/frame keyframe tính 1 cuboid, gồm `outside=true`. `keyframe=false` là nội suy, không tính. Trùng cặp chỉ tính một lần; thiếu cờ hoặc cờ mâu thuẫn không được chốt KPI.
- Raw JSON dùng thứ tự Object khi mở lại Job (tags, shapes, tracks), bắt đầu mặc định từ 1. Database ID không phải Object ID. Save/mở lại Job rồi đối chiếu đúng Job, Object ID và mốc hoàn thành trước khi xác nhận bảng đếm. Xóa/gộp/tách Object có thể đổi số ID; cần Lead đối chiếu mốc cũ, không suy ra số đã làm từ database ID.
- Datumaro có thể bỏ hoàn toàn outside khi xuất, kể cả ID chỉ có outside. Số keyframe của riêng một file không đại diện đầy đủ outside; cách tính mốc Datumaro ở trên giữ khối lượng ban đầu thay vì khôi phục outside từ file sau.
- Bảng từng ID có keyframe hiện, outside, tổng, nội suy, thiếu cờ và frame đầu/cuối. Excel có cột rõ ràng; bản tải từ web có thêm đối chiếu từng Daily Report.
- Khoảng sản lượng ngày là `(mốc cao nhất của báo cáo các ngày trước, ID làm tới hôm nay]` trong cùng Job/người làm. Ví dụ 20 → 80 thì cộng ID 21–80. Rework không cộng lại ID cũ. Nếu báo cáo cũ thiếu mốc ID, yêu cầu Lead bổ sung mốc, không tự giả định bắt đầu từ 1.
- Báo cáo mới có thể gửi tiến độ trước file. Khi thiếu file đầy đủ/mốc cũ, sản lượng chờ đếm và KPI hiển thị **Chờ bảng đếm**; không dùng 0,85 để đoán. Khi file đã được xác nhận, mở lại báo cáo chờ đếm để chốt (thành viên trước 17:00 cùng ngày, Lead được bổ sung ngày cũ).
- Server tính số cuboid, bỏ qua số lượng do client gửi. Lưu phạm vi ID, số hiện/outside, mã file và phiên bản nguồn cùng báo cáo. Tải file mới chỉ đối chiếu lại, không tính lại báo cáo đã chốt. Báo cáo lịch sử/công thức cũ giữ nguyên và không tự chuyển sang keyframe.
- Keyframe đo khối lượng của các ID được khai hoàn thành; prelabel cũng có keyframe nên số đếm không chứng minh ai đã chỉnh box. QC chi tiết vẫn xác nhận chất lượng bài.

Các file input/kết quả/Excel ở `self-host/data/files` chỉ được đọc bởi người làm, người QC được giao và Lead. `kpi-count` giữ lịch sử upload, `kpi-source` giữ bảng đếm hiện hành của từng Job/người làm. Không push dữ liệu thô, DB hoặc file công ty lên GitHub. Các kiểm thử dùng fixture giả trong `.sites-runtime`, độc lập DB thật.

Nguồn định dạng: [CVAT Backup](https://docs.cvat.ai/docs/dataset_management/backup/), [bộ xuất backup](https://github.com/cvat-ai/cvat/blob/develop/cvat/apps/engine/backup.py), [ánh xạ Object ID](https://github.com/cvat-ai/cvat/blob/develop/cvat-core/src/annotations-collection.ts), [bộ xuất Datumaro](https://github.com/cvat-ai/cvat/blob/develop/cvat/apps/dataset_manager/bindings.py).
## Ma trận QC và log theo phạm vi frame

Ở bước kiểm cơ bản, tab **Ma trận ID × Frame** hiển thị cảnh báo S/K/Z/H/O/D với màu xanh nhạt, vàng và cam. Kết quả cũ đọc lại sheet Matrix đã lưu, không chạy lại kiểm tra hình học. Chọn **Danh sách cảnh báo** để xem các cảnh báo thiếu ID hoặc dữ liệu không hợp lệ.

Ở bước QC chi tiết, mỗi dòng là Object ID trong phạm vi đang kiểm. Bấm **Mở rộng bảng** để xem nhiều dòng/frame. Kéo qua nhiều frame trên cùng ID rồi nhập log: toàn bộ vùng là **một log**, lưu ngay vào nháp. Có thể chỉnh frame đầu/cuối, thêm nhiều log hoặc xóa log nháp. Hoàn tất lượt QC mới gửi lỗi cho annotator; không tự kết luận Đạt từ ô xanh. Nháp có kiểm tra phiên bản chống ghi đè từ cửa sổ khác.

**Xuất Excel ma trận** xuất phần nháp đã lưu hoặc kết quả QC hoàn tất. File có Matrix (mã, màu và viền trạng thái sửa), Log QC (một dòng cho một phạm vi), QC tung ID (kết quả Đạt/Có lỗi/Chưa kiểm) và Huong dan. Cố định ba cột đầu, hàng tiêu đề và có bộ lọc; giữ số frame 0. Nháp chỉ Lead/người QC được giao được xuất; annotator chỉ xuất kết quả hoàn tất của mình. Annotator xác nhận sửa một lần cho cả phạm vi, người QC kiểm lại ở phiên sau; lỗi cũ vẫn sai giữ nguyên phạm vi trong log tiếp theo.

Ma trận web tải tối đa 50 ID × 60 frame mỗi trang để tránh hiển thị quá nhiều ô cùng lúc; xuất Excel tối đa 500.000 ô. File đối chiếu được chốt vào phiên khi lưu nháp/hoàn tất. Không gọi API CVAT, không đổi cách tính hoặc số KPI đã lưu.
## Xem trước Datumaro khi giao task

Form Giao task tích hợp `kpi-count/preview` (Lead), trả bảng 25 ID/trang, số cuboid theo từng ID, tổng ID/cuboid/frame và mốc đủ KPI theo người/ngày. Xem trước chỉ tạo bản đếm/file riêng của Lead, không tạo task hay thông báo phân công. `kpi-count/assign` xác nhận file và ghi task, source, bản đếm/files cho annotator cùng một giao dịch. Kiểm tra đúng context Task/Job/dự án, giữ mốc cũ và dùng CAS để chống sử dụng lại file vào hai phân công. Gửi lại cùng yêu cầu trả task đã lưu, không tạo trùng. Không tin số lượng do client gửi; lấy từ file đã đếm trên server.

File xem trước chưa gắn task chỉ Lead được đọc/xuất. Khi lưu, annotator và người QC được giao nhận bản đếm của Job; không được đọc preview riêng của Lead. Các tệp vật lý dùng chung khóa trong kho riêng, metadata quyền đọc tách biệt. Sao lưu/khôi phục đầy đủ vẫn giữ các tệp này.

`taskDailyGuide` dùng cùng phép tính với Daily Report: cộng lượng từng ID tiếp theo sau báo cáo ngày trước, trừ KPI đã đạt từ các Job cuboid khác trong ngày; bỏ dòng QC, đơn vị frame/scene và nháp chưa gửi. Đọc mức KPI có hiệu lực từng ngày, lịch/ngày miễn và giữ KPI cũ. UI hiển thị mốc ở Tổng quan, Dự án & Task và chi tiết bài. Không đủ khối lượng thì hiển thị còn thiếu, không dùng hệ số hoặc số trung bình để đoán ID.
