"""Headless web adapter; the six checks come from the supplied datumaro_qa tool."""
import json
import math
from pathlib import Path
import sys
import zipfile
from collections import Counter
from datetime import datetime, timezone, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent))
import datumaro_qa as tool

LIMIT = 30 * 1024 * 1024

def read_input(source):
    if zipfile.is_zipfile(source):
        with zipfile.ZipFile(source) as archive:
            candidates = [i for i in archive.infolist() if not i.is_dir() and i.filename.replace('\\', '/').endswith('.json') and 'annotations' in i.filename.replace('\\', '/').split('/')[:-1]]
            if len(candidates) != 1:
                raise ValueError("ZIP phải có đúng một file JSON trong annotations/. Nếu có nhiều subset, tải riêng JSON của Job cần kiểm.")
            entry = candidates[0]
            if entry.file_size > LIMIT:
                raise ValueError("JSON trong ZIP vượt 30 MB.")
            with archive.open(entry) as stream:
                content = stream.read(LIMIT + 1)
    else:
        with open(source, 'rb') as stream:
            content = stream.read(LIMIT + 1)
    if len(content) > LIMIT:
        raise ValueError("File JSON vượt 30 MB.")
    data = json.loads(content.decode('utf-8-sig'), parse_constant=lambda v: (_ for _ in ()).throw(ValueError("Giá trị số không hữu hạn: " + v)))
    if not isinstance(data, dict) or not isinstance(data.get('items'), list) or not isinstance(data.get('categories'), dict):
        raise ValueError("Cần file Datumaro 3D có items và categories, không phải CVAT XML hoặc bản sao lưu của web.")
    if not data['items'] or len(data['items']) > 2000:
        raise ValueError("File phải có 1–2.000 frame.")
    outside, outside_ids, annotations, cuboids = 0, set(), 0, 0
    for item in data['items']:
        if not isinstance(item, dict) or not isinstance(item.get('annotations', []), list):
            raise ValueError("Cấu trúc annotation không hợp lệ.")
        current = 0
        for ann in item.get('annotations', []):
            if not isinstance(ann, dict):
                raise ValueError("Annotation phải là object.")
            if ann.get('type') != 'cuboid_3d':
                continue
            cuboids += 1
            attrs = ann.get('attributes') or {}
            if not isinstance(attrs, dict):
                raise ValueError("attributes phải là object.")
            if attrs.get('outside'):
                outside += 1
                if attrs.get('track_id') is not None:
                    outside_ids.add(str(attrs['track_id']))
                continue
            current += 1
            annotations += 1
            for field in ['position', 'rotation', 'scale']:
                values = ann.get(field)
                if isinstance(values, list) and any(isinstance(v, (int, float)) and (not math.isfinite(v) or abs(v) > 1e9) for v in values):
                    raise ValueError("Tọa độ/kích thước không hữu hạn hoặc vượt phạm vi xử lý.")
        if current > 1500:
            raise ValueError("Một frame vượt 1.500 cuboid; hãy chia nhỏ dữ liệu trước khi kiểm.")
    if annotations > 100000 or not cuboids:
        raise ValueError("Cần dữ liệu cuboid_3d, tối đa 100.000 box không outside.")
    return data, outside, len(outside_ids)

def main():
    source, result_path, excel_path, offset = sys.argv[1:]
    config = dict(tool.DEFAULT_CONFIG, track_id_offset=int(offset))
    data, outside, outside_tracks = read_input(source)
    normalized = Path(source).with_name('normalized.json')
    normalized.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    objects, data_issues, meta = tool.load_objects(str(normalized), config)
    if meta['n_tracks'] * len(meta['frame_items']) > 500000:
        raise ValueError("Ma trận ID × frame quá lớn; hãy chia nhỏ Job trước khi kiểm.")
    results = tool.run_checks(objects, data_issues, config)
    rows = []
    for key, name, code in tool.CHECKS:
        for issue in results[key]:
            rows.append(dict(issue, code=code, checkName=name))
    for issue in data_issues:
        rows.append(dict(check='data', checkName=issue['kind'], code='!', track='', label='', frame=issue['frame'], detail=issue['detail'], value='', ref='', other='', item_id=issue['item_id'], ann_id=issue['ann_id']))
    if len(rows) > 100000:
        raise ValueError("Quá 100.000 cảnh báo; hãy chia nhỏ dữ liệu.")
    counts = {key:len(results[key]) for key, _, _ in tool.CHECKS}
    counts['data'] = len(data_issues)
    summary = dict(frames=meta['n_items'], cuboids=meta['n_objs'], tracks=meta['n_tracks'], outsideCuboids=outside, outsideTracks=outside_tracks, warnings=len(rows), affectedTracks=len({r['track'] for r in rows if r['track']}), counts=counts, trackOffset=int(offset))
    tool.write_report(excel_path, results, objects, meta, 'Datumaro upload', config)
    # Uploaded text remains literal in Excel; no uploaded formula is executed.
    import openpyxl
    workbook = openpyxl.load_workbook(excel_path)
    for sheet in workbook:
        for row in sheet:
            for cell in row:
                if isinstance(cell.value, str) and cell.value.startswith(('=', '+', '-', '@', '\t', '\r')):
                    cell.value = "'" + cell.value
    workbook['Summary']['B3'] = 'File Datumaro đã tải lên từ web'
    workbook['Summary']['B4'] = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=7))).strftime('%d/%m/%Y %H:%M:%S UTC+7')
    workbook['Summary'].append(['Box outside không kiểm tra', outside])
    workbook['Summary'].append(['KPI', 'Số ID làm trong ngày × frame Job × 0,85; không trừ box outside. Thống kê tool không thay sản lượng/KPI.'])
    workbook.save(excel_path)
    Path(result_path).write_text(json.dumps(dict(summary=summary, config=config, rows=rows), ensure_ascii=False, allow_nan=False), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
