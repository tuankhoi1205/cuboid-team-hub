"""Bundle the official installed CPython runtime unchanged, plus only QC dependencies."""
from pathlib import Path
import importlib.util
import os
import shutil
import sys
import sysconfig

if os.name != "nt":
    raise SystemExit("This runtime packager is Windows-only")
root = Path(__file__).resolve().parent
target = root / "worker" / "qc-worker"
target.mkdir(parents=True, exist_ok=True)
legacy = (target / "_internal").resolve()
if not legacy.is_relative_to((root / "worker").resolve()) or legacy.name != "_internal":
    raise SystemExit("Unexpected generated worker path")
if legacy.exists():
    shutil.rmtree(legacy)
if (target / "qc-worker.exe").exists():
    (target / "qc-worker.exe").unlink()
base = Path(sys.base_prefix)
for name in ["python.exe", "python3.dll", "LICENSE.txt", "vcruntime140.dll", "vcruntime140_1.dll"]:
    if (base / name).is_file():
        shutil.copy2(base / name, target / name)
for source in base.glob("python3*.dll"):
    shutil.copy2(source, target / source.name)
ignore = shutil.ignore_patterns("__pycache__", "site-packages", "test", "tests", "idlelib", "tkinter", "turtledemo", "ensurepip", "*.pem")
shutil.copytree(Path(sysconfig.get_path("stdlib")), target / "Lib", ignore=ignore, dirs_exist_ok=True)
if (base / "DLLs").is_dir():
    shutil.copytree(base / "DLLs", target / "DLLs", ignore=shutil.ignore_patterns("*tk*", "*tcl*"), dirs_exist_ok=True)
site = target / "Lib" / "site-packages"
site.mkdir(exist_ok=True)
for name in ["openpyxl", "et_xmlfile"]:
    spec = importlib.util.find_spec(name)
    if not spec or not spec.origin:
        raise SystemExit("Missing dependency: " + name)
    source = Path(spec.origin).parent
    shutil.copytree(source, site / name, ignore=shutil.ignore_patterns("__pycache__", "tests"), dirs_exist_ok=True)
    for metadata in source.parent.glob(name + "-*.dist-info"):
        shutil.copytree(metadata, site / metadata.name, dirs_exist_ok=True)
tool = target / "tool"
tool.mkdir(exist_ok=True)
for name in ["web_runner.py", "datumaro_qa.py", "keyframe_counts.py"]:
    shutil.copy2(root.parent / "self-host" / "tool-qc" / name, tool / name)
print("Bundled official CPython + openpyxl: " + str(target))
