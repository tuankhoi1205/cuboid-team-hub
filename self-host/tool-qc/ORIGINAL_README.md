# datumaro_qa — kiểm tra chất lượng dữ liệu 3D LiDAR (Datumaro 1.0)

Đọc file JSON Datumaro 3D (`cuboid_3d`) và xuất báo cáo Excel.

## Cài đặt trên Ubuntu

```bash
tar xzf datumaro_qa_ubuntu.tar.gz
cd datumaro_qa_ubuntu
bash setup_ubuntu.sh
```

Script tự tạo môi trường ảo `.venv` và cài `openpyxl` (Ubuntu 23.04+ chặn `pip install` vào Python hệ thống).
Nếu báo thiếu `python3-venv`, chạy: `sudo apt install -y python3-venv python3-pip`
(hoặc đơn giản hơn: `sudo apt install -y python3-openpyxl`, khi đó không cần venv).

Hộp thoại chọn file là tuỳ chọn: có `zenity` (có sẵn trên Ubuntu Desktop) hoặc `python3-tk` là dùng được.
Nếu không có, công cụ tự chuyển sang nhập đường dẫn bằng tay.

## Sử dụng

```bash
bash run_qa.sh                        # hộp thoại chọn file JSON, rồi đặt tên file Excel
bash run_qa.sh file.json              # báo cáo: file_qa_report.xlsx cạnh file JSON
bash run_qa.sh file.json -o ten_report   # đặt tên báo cáo (tự thêm .xlsx)
bash run_qa.sh file.json -c qa_config.json
bash run_qa.sh --dump-config > qa_config.json   # xuất ngưỡng mặc định để chỉnh
bash run_qa.sh --doctor               # kiểm tra môi trường
```

Chạy qua SSH/không có màn hình: luôn truyền đường dẫn file trên dòng lệnh.

## Các kiểm tra (sheet trong Excel)

Sáu kiểm tra (ký hiệu dùng trong sheet Matrix):

| Ký hiệu | Kiểm tra |
|---|---|
| S | Scale không đồng bộ: track (vehicle) có scale thay đổi qua các frame |
| K | Kích thước ngoài ngưỡng của từng class |
| Z | z < -3 hoặc z > 3 (cao/thấp hơn mặt đường) |
| H | Yaw đổi > 75° so với frame liền trước (đổi hướng đột ngột) |
| O | Chồng lấn trên mặt phẳng nhìn từ trên xuống (IoU) |
| D | Tâm obj cách gốc tọa độ > 100 m |

Các sheet trong file Excel:

| Sheet | Dùng để |
|---|---|
| Summary | Tổng số issue mỗi loại, hướng dẫn các sheet, ngưỡng đang dùng |
| By_Track | Xem theo **từng track**: mỗi dòng 1 track, mỗi cột 1 loại kiểm tra, ô ghi danh sách frame bị issue và (số frame) |
| By_Frame | Xem theo **từng frame**: mỗi dòng 1 frame, mỗi cột 1 loại kiểm tra, ô ghi các Track ID bị issue (chồng lấn ghi cặp `A&B`) |
| Matrix | Ma trận Track ID × Frame, ô ghi ký hiệu và tô màu (xanh nhạt: có mặt, không lỗi; vàng: 1 loại lỗi; cam: từ 2 loại) |
| All_Issues | Mọi issue, mỗi dòng 1 track tại 1 frame (mô tả, giá trị, ngưỡng). Lọc theo cột Frame hoặc Track ID |
| Data_Issues | Thiếu track_id, track_id trùng trong frame, class lạ |

**Track ID** hiển thị = `track_id` trong JSON + 1, để khớp số thứ tự trên CVAT (Datumaro đánh từ 0, CVAT từ 1).
Đổi bằng `--track-offset N` hoặc `"track_id_offset"` trong file config (`0` = giữ nguyên giá trị trong JSON).

Mọi ngưỡng nằm trong `DEFAULT_CONFIG` (xem bằng `--dump-config`) và ghi đè được bằng `--config`.

## Xử lý sự cố

Chạy `bash run_qa.sh --doctor` và gửi kết quả nếu vẫn lỗi. Một số lỗi hay gặp:

- `externally-managed-environment` khi `pip install`: dùng `bash setup_ubuntu.sh` (venv) thay vì pip hệ thống.
- `No module named openpyxl`: chạy `bash setup_ubuntu.sh`.
- `python: command not found`: Ubuntu dùng `python3` (hoặc dùng `bash run_qa.sh`).
- Báo "Class không nhận dạng": thêm tên label của bạn vào `class_groups` trong file config.
