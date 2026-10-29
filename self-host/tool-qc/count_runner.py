"""Daily production counting does not rerun or complete initial geometry QC."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from keyframe_counts import read_json, count_dataset, add_count_sheet

def main():
    source, result, excel, offset, *rest = sys.argv[1:]
    production = count_dataset(read_json(source), int(offset), int(rest[0]) if rest and rest[0] else None)
    import openpyxl
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)
    add_count_sheet(workbook, production)
    workbook.save(excel)
    Path(result).write_text(json.dumps({'production': production}, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    print(json.dumps(production['totals']))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
