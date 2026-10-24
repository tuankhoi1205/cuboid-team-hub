"""Copy an installed Windows Python + openpyxl into the Hub's own private runtime."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import sysconfig

target = Path(__file__).resolve().parents[1] / ".runtime" / "qc-python"
if os.name != "nt":
    raise SystemExit("On Linux use a Python venv with openpyxl and set HUB_QC_PYTHON.")
if target.exists():
    raise SystemExit("Runtime already exists; no files were overwritten: " + str(target))
packages = ["openpyxl", "et_xmlfile"]
sources = []
for name in packages:
    spec = importlib.util.find_spec(name)
    if not spec or not spec.origin:
        raise SystemExit("Install openpyxl in this Python before copying the runtime.")
    sources.append(Path(spec.origin).parent)
target.mkdir(parents=True)
base = Path(sys.base_prefix)
for name in ["python.exe", "python3.dll", "LICENSE.txt", "vcruntime140.dll", "vcruntime140_1.dll"]:
    if (base / name).is_file():
        shutil.copy2(base / name, target / name)
for file in base.glob("python3*.dll"):
    shutil.copy2(file, target / file.name)
ignore = shutil.ignore_patterns("__pycache__", "site-packages", "test", "tests", "idlelib", "tkinter", "turtledemo", "ensurepip")
shutil.copytree(Path(sysconfig.get_path("stdlib")), target / "Lib", ignore=ignore)
if (base / "DLLs").is_dir():
    shutil.copytree(base / "DLLs", target / "DLLs", ignore=shutil.ignore_patterns("*tk*", "*tcl*"))
site = target / "Lib" / "site-packages"
site.mkdir()
for source in sources:
    shutil.copytree(source, site / source.name, ignore=shutil.ignore_patterns("__pycache__", "tests"))
    for metadata in source.parent.glob(source.name + "-*.dist-info"):
        shutil.copytree(metadata, site / metadata.name)
subprocess.run([str(target / "python.exe"), "-I", "-c", "import openpyxl; print('QC runtime ready: openpyxl ' + openpyxl.__version__)"], check=True)
print(target)
