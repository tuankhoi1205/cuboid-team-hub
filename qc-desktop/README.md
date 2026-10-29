# Cuboid QC offline

App nhỏ chạy độc lập; **mở Datumaro từ CVAT hoặc tạo bảng trắng, không đăng nhập, không nạp phân công, không kết nối web**. Dùng cùng giao diện trên Windows, Ubuntu và macOS. Runtime kiểm Datumaro đi kèm bộ cài; người QC không cần cài Node/Python.

## Cách dùng

1. Xuất Datumaro 3D từ CVAT: JSON, hoặc ZIP có một JSON trong `annotations/`.
2. Mở app → **Mở Datumaro**. Mặc định `+1` để Object ID khớp CVAT; chọn `0` nếu cần ID gốc của Datumaro.
3. App tạo ma trận toàn bộ ID thực có trong file, giữ nguyên khoảng trống ID/frame. **Kéo chuột** hoặc **Shift + click** để chọn vùng; bấm **tên ID** chọn cả hàng. Không có file: chọn **Tạo bảng trắng**, nhập **Job ID, số frame, số ID**; bảng có ID 1–N và frame 0–F−1.
4. **Bấm một frame** hoặc **kéo chọn nhiều frame rồi thả chuột** để tự mở bảng nhập log. Cũng có thể chọn **Ghi log**. Nhập một dòng giải thích lỗi; **hướng giải quyết tùy chọn**, không có loại lỗi hoặc mức độ.
5. **Enter chỉ lưu log hiện tại**, thu bảng nhập và giữ nguyên ID để chọn frame khác ghi thêm log. Một ID có thể có nhiều log độc lập. Enter trống không đánh dấu Done. Chọn **Done ID →** khi đã kiểm xong toàn bộ ID để xác nhận và chuyển sang ID chưa QC tiếp theo; app không tự đánh dấu toàn bộ file đã QC.
6. **Thanh nổi** hiện tiêu đề ma trận và một dòng ID, rộng tới mép màn hình, luôn nằm trên CVAT. Mép phải có nút nhỏ **← ID trước** phía trên **Done ID →**; cả hai cố định khi cuộn. Done ID lưu nội dung đang nhập nếu có và xác nhận ID; khi đủ ID hiện **Đã xong ✓**. Đặt chuột trên thanh và **lăn xuống để cuộn frame sang phải, lăn lên để quay lại trái**. Kéo hai ô tiêu đề đầu để di chuyển. Bấm **…** để ghim trên/dưới, mở bảng đầy đủ, xuất Excel hoặc đổi bài. Bấm/kéo frame để mở log; Enter lưu rồi thu lại. Kéo tới mép phải/trái của vùng frame để tự cuộn chọn các frame tiếp theo.
7. Muốn thêm/sửa log của ID trước: quay lại bằng **← ID trước**; các log đã lưu hiện ở bảng đầy đủ. Thêm/sửa/xóa log mở lại trạng thái đang QC; chọn **Done ID →** để xác nhận lại khi xong. Cần lưu hoặc hủy log đang nhập trước khi quay lại ID trước.
8. Khi đủ ID, chọn **Xuất Excel ↓** hoặc **Hoàn tất & mở bài khác**. File `.qc-result.xlsx` gồm **Matrix**, **Log QC**, **QC tung ID** và hướng dẫn, dùng màu/định dạng của báo cáo web; không có loại lỗi/mức độ. Tải chính file Excel này lên web hoặc gửi riêng cho annotator. Minh chứng cần cho upload được giữ trong worksheet ẩn của file.

Mỗi thay đổi tự lưu tiến độ trên máy, có bản dự phòng. **Mở bài khác** dùng được cả khi chưa QC xong, tự giữ bài cũ, không bắt xuất nháp. **Bài gần đây** mở lại tối đa 50 bài cùng log, vùng chọn và tiến độ. **Hoàn tất & mở bài khác** xuất Excel rồi về màn hình nhỏ để mở bài tiếp theo; hủy hộp xuất sẽ giữ bài hiện tại. **Lưu nháp ra file / Mở nháp** vẫn dùng để chuyển máy.

Các cảnh báo S/K/Z/H/O/D và lỗi cấu trúc vẫn dùng bộ kiểm `self-host/tool-qc/datumaro_qa.py` hiện tại. Cảnh báo tool không tự trở thành log lỗi. Có thể xuất Excel Tool_QC riêng.

Giới hạn: JSON 30 MB, ZIP 100 MB; tối đa 2.000 frame, 100.000 cuboid không outside, ma trận 500.000 ô, 5.000 ID và 2.000 log. File có cuboid thiếu ID cần sửa nguồn trước khi tạo bảng QC.

## Web

- Lead giao Job và người QC. QA/QC xem những Job được giao; annotator xem QC bài của mình.
- Sau khi QC offline, chọn **Tải kết quả lên** ở đúng hàng Job. Hộp kiểm tra hiển thị Job được chọn, người làm, người QC, tên file, số ID/log và SHA-256 trước khi lưu.
- App không thể biết phân công hoặc xác minh Job của Datumaro. Người tải lên xác nhận file thuộc đúng Job. Web lấy thông tin người làm/người QC từ phân công hiện tại, kiểm tra quyền và revision.
- Gửi lại cùng mã kết quả và nội dung không tạo bản trùng; thay nội dung với cùng mã hoặc gắn cùng kết quả sang Job khác bị từ chối.
- **Excel kết quả** tải xuống được bởi Lead và người liên quan, bổ sung thông tin Job/nhân sự. Web vẫn nhận file JSON của app 1.0 để giữ tương thích. Bảng trắng phải khớp Job ID khi tải lên. Nếu sửa log bằng Excel/LibreOffice, giữ nguyên tên các worksheet và danh sách ID; web đọc nội dung ở bảng Log QC.
- QC lại một ID sẽ đối chiếu log cũ ở frame có trong file mới. Lỗi ở ID/frame vắng trong file mới vẫn được giữ. Lịch sử log không bị xóa.
- Bản offline không tự đổi sản lượng/KPI hoặc duyệt Daily Report; Lead xử lý nghiệm thu như công việc quản lý.
- Phiên QC web cũ đang mở: Lead dùng **Chuyển sang app offline** để lưu vào lịch sử, giữ nguyên nháp cũ. Sau đó tải kết quả app lên.

## Bộ cài

| Hệ điều hành | Gói tạo ra |
| --- | --- |
| Windows x64 | Bộ cài `.exe` và ZIP chạy nguyên thư mục |
| Ubuntu x64 | `.AppImage` và `.deb` |
| macOS Intel | `.dmg` và `.zip`, kiến trúc x64 |
| macOS Apple Silicon | `.dmg` và `.zip`, kiến trúc arm64 |

Windows ZIP: giải nén **toàn bộ**, mở `Cuboid QC.exe`; không tách riêng EXE khỏi `resources/`. Windows kèm CPython chính thức và openpyxl. Mac/Linux kèm bộ kiểm được PyInstaller đóng gói theo đúng hệ điều hành và kiến trúc.

Trên Ubuntu, app dùng X11/XWayland khi có `DISPLAY` để hỗ trợ vị trí thanh nổi. Giới hạn tọa độ cửa sổ của Wayland được mô tả trong [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window). Máy chỉ có Wayland cần phiên Xorg/XWayland cho chức năng ghim vị trí.

Bộ cài phân phối hiện chưa dùng chứng thư của tổ chức. Máy công ty yêu cầu chữ ký cần bộ cài được IT ký/chấp thuận. Không thay cài đặt bảo vệ hệ điều hành để chạy app.

## Build trên máy phát triển

Cần Node 24, pnpm 11.25.0, Python 3.12. Chạy từ thư mục gốc repo:

```sh
npm ci
pnpm --dir qc-desktop install --frozen-lockfile
python -m pip install -r qc-desktop/requirements-build.txt
node qc-desktop/build.mjs
node qc-desktop/build-worker.mjs
pnpm --dir qc-desktop dist
```

Linux/macOS: bộ đóng gói tự dùng `python3`; Windows dùng `python`. Nếu cần chỉ định đường dẫn, đặt biến `QC_PYTHON` trước khi build. Gói đầu ra ở `qc-desktop/release/`.

Build trên đúng OS/kiến trúc đích. [Giới hạn build đa nền tảng của electron-builder](https://www.electron.build/docs/features/multi-platform-build/) áp dụng cho bộ kiểm native và ký macOS.

Workflow [Build QC offline apps](../.github/workflows/qc-desktop.yml) chạy thủ công (`workflow_dispatch`) hoặc khi push tag `qc-v*`, gồm Windows x64, Ubuntu x64, Mac Intel và Mac Apple Silicon. File workflow và source phải có trên GitHub trước khi chạy. Workflow chỉ tạo artifact, không tự phát hành hay deploy web.

Kiểm tra từ thư mục gốc:

```sh
node --experimental-transform-types --test tests/qc-offline.test.ts
node tests/qc-desktop.smoke.mjs
```

Smoke test dùng bộ kiểm thật, user-data riêng trong `.sites-runtime/`, xác nhận Datumaro/bảng trắng, kéo chọn hai chiều/Shift/cả ID/tự cuộn, Enter lưu nhiều log cùng ID, Done riêng, nút ID trước, thanh nổi trên/dưới, Excel, hủy xuất, hoàn tất/đổi bài và Bài gần đây. Linux chạy smoke qua `xvfb-run -a`. Đặt `QC_SMOKE_PACKAGED=1` để tìm app trong thư mục release, hoặc `QC_ELECTRON_EXECUTABLE` để chỉ định bộ app đã đóng gói; workflow dùng app đóng gói cho kiểm thử này.

## Trạng thái triển khai

Bản QA/QC mới đã được triển khai trên `http://127.0.0.1:3210` ngày 28/10/2026. Sau cập nhật cần tải lại trang để nhận giao diện mới. Lịch sử QC và các API cũ còn được giữ để bảo toàn dữ liệu; công cụ ghi QC trên giao diện web đã được thay bằng hàng đợi và upload offline. Xem bằng chứng và thông tin bản sao lưu trong [nhật ký triển khai](../PENDING_DEPLOY.md).
