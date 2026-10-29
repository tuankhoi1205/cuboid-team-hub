import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'self-host' / 'tool-qc'))
from keyframe_counts import count_dataset, read_json, add_count_sheet

def native():
    def shape(frame, outside=False, **extra):
        return dict(type='cuboid', frame=frame, outside=outside, points=[0] * 9, **extra)
    return dict(tags=[], shapes=[], tracks=[
        dict(id=9001, label_id=1, shapes=[shape(0), shape(1, True), shape(2, keyframe=False)]),
        dict(id=9002, label_id=2, shapes=[shape(0, True), shape(1, True)])])

class Counts(unittest.TestCase):
    def test_native_counts_outside_and_excludes_interpolation(self):
        p = count_dataset(native())
        self.assertTrue(p['usable'])
        self.assertEqual(p['totals'], dict(keyframes=4, visible=1, outside=3, interpolated=1, unknown=0))
        self.assertEqual([(r['id'], r['keyframes'], r['serverId']) for r in p['ids']], [(1, 2, 9001), (2, 2, 9002)])

    def test_duplicate_pair_is_not_double_counted_conflict_is_unusable(self):
        value = native()
        value['tracks'][0]['shapes'].append(copy.deepcopy(value['tracks'][0]['shapes'][0]))
        p = count_dataset(value)
        self.assertEqual(p['duplicates'], 1)
        self.assertEqual(p['totals']['keyframes'], 4)
        self.assertTrue(p['usable'])
        value['tracks'][0]['shapes'][-1]['outside'] = True
        self.assertFalse(count_dataset(value)['usable'])

    def test_backup_preserves_labels_and_requires_job_choice(self):
        value = native()
        value['tracks'][0]['label'] = 'vehicle'
        p = count_dataset([value])
        self.assertEqual(p['format'], 'cvat-backup-json')
        self.assertEqual(p['ids'][0]['label'], 'vehicle')
        with self.assertRaises(ValueError):
            count_dataset([value, value])
        self.assertEqual(count_dataset([value, value], job_index=2)['jobIndex'], 2)

    def test_raw_object_numbers_include_tags_and_shapes_not_database_id(self):
        value = native()
        value['tags'] = [dict(id=4000)]
        value['shapes'] = [dict(type='rectangle', frame=0)]
        p = count_dataset(value)
        self.assertEqual([r['id'] for r in p['ids']], [3, 4])

    def test_datumaro_never_claims_outside_complete_and_missing_flags_not_guessed(self):
        def ann(track, keyframe, outside=False):
            return dict(type='cuboid_3d',label_id=0,attributes=dict(track_id=track,keyframe=keyframe,outside=outside))
        data = dict(categories={'label': {'labels': [{'name':'vehicle'}]}},items=[dict(id='not-a-frame-number',attr={'frame':4},annotations=[ann(0, True), ann(1, True, 'true'), ann(2, False), ann(3, None), ann(4, 'true', 'false')])])
        p = count_dataset(data)
        self.assertFalse(p['usable'])
        self.assertFalse(p['completeOutside'])
        self.assertEqual(p['totals'], dict(keyframes=3, visible=2, outside=1, interpolated=1, unknown=1))

    def test_missing_native_outside_blocks_kpi(self):
        value = native()
        del value['tracks'][0]['shapes'][0]['outside']
        self.assertFalse(count_dataset(value)['usable'])

    def test_datumaro_baseline_counts_all_id_frames_and_keeps_empty_frame_scope(self):
        data = dict(categories={'label': {'labels': [{'name':'vehicle'}]}}, items=[
            dict(id='frame_0', attr={'frame':0}, annotations=[dict(type='cuboid_3d',label_id=0,attributes={'track_id':0,'keyframe':False})]),
            dict(id='frame_1', attr={'frame':1}, annotations=[dict(type='cuboid_3d',label_id=0,attributes={'track_id':0})]),
            dict(id='frame_2', attr={'frame':2}, annotations=[])])
        p = count_dataset(data)
        self.assertTrue(p['datumaroUsable'])
        self.assertEqual(p['ids'][0]['cuboids'], 2)
        self.assertEqual(p['scopeFrames'], [0,1,2])
        self.assertEqual(p['cuboidTotal'], 2)
        data['items'][0]['annotations'][0]['attributes'].pop('track_id')
        self.assertFalse(count_dataset(data)['datumaroUsable'])
        for item in data['items']:
            item['annotations'] = []
        p = count_dataset(data)
        self.assertTrue(p['datumaroUsable'])
        self.assertEqual(p['cuboidTotal'], 0)
        self.assertEqual(p['scopeFrames'], [0,1,2])

    def test_annotation_zip_reads_only_json_and_excel_is_tabular(self):
        root = Path(__file__).resolve().parents[1] / '.sites-runtime'
        root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as directory:
            path = Path(directory) / 'backup.zip'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('annotations.json', json.dumps([native()]))
                archive.writestr('data/private.pcd', 'not read')
                archive.writestr('../ignored.json', '{}')
            p = count_dataset(read_json(path))
            import openpyxl
            workbook = openpyxl.Workbook()
            workbook.remove(workbook.active)
            add_count_sheet(workbook, p)
            self.assertEqual(workbook['Cuboid theo ID']['E2'].value, 2)
            self.assertEqual(workbook['Cuboid theo ID'].freeze_panes, 'C2')
            self.assertEqual(workbook['Cuboid theo ID'].max_column, 10)

if __name__ == '__main__':
    unittest.main()
