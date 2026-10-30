"""Prepare the Hub's private Python runtime on Linux/macOS or Windows."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import sysconfig

target = Path(__file__).resolve().parents[1] / ".runtime" / "qc-python"
probe = "import sys,json,openpyxl,et_xmlfile; print(json.dumps({'ready':True,'python':sys.version.split()[0],'openpyxl':openpyxl.__version__}))"
runtime_python = target / ("python.exe" if os.name == "nt" else "bin/python")
if "--check" in sys.argv:
    executable = os.environ.get("HUB_QC_PYTHON") or (str(runtime_python) if runtime_python.is_file() else sys.executable)
    raise SystemExit(subprocess.run([executable, "-I", "-X", "utf8", "-c", probe], check=False).returncode)
if os.name != "nt":
    import venv
    if sys.version_info < (3, 10):
        raise SystemExit("Tool_QC needs Python 3.10 or newer.")
    if target.exists() and ((target / "python.exe").exists() or not (target / "pyvenv.cfg").is_file()):
        raise SystemExit("Runtime folder is not a Linux/macOS venv; it was kept unchanged: " + str(target))
    try:
        has_pip = runtime_python.is_file() and subprocess.run(
            [str(runtime_python), "-m", "pip", "--version"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
        ).returncode == 0
        if not has_pip:
            venv.EnvBuilder(with_pip=True).create(target)
    except (OSError, subprocess.CalledProcessError) as error:
        raise SystemExit("Cannot create venv. On Ubuntu/Debian install: sudo apt-get install python3 python3-venv python3-pip; then rerun this script. " + str(error))
    subprocess.run([str(runtime_python), "-m", "pip", "install", "-r", str(Path(__file__).with_name("requirements.txt"))], check=True)
    subprocess.run([str(runtime_python), "-I", "-X", "utf8", "-c", probe], check=True)
    print("QC runtime ready: " + str(runtime_python))
    print("Restart the existing web service. The local venv is detected automatically.")
    if os.environ.get("HUB_QC_PYTHON") and os.environ["HUB_QC_PYTHON"] != str(runtime_python):
        print("Update the service HUB_QC_PYTHON override to: " + str(runtime_python))
    raise SystemExit(0)
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
