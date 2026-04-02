import pandas as pd
from pathlib import Path
import sys

base = Path(__file__).parent / "Python-Plot"
if not base.exists():
    print(f"Base folder not found: {base}")
    sys.exit(1)

for product in sorted([p for p in base.iterdir() if p.is_dir()]):
    print(f"PRODUCT: {product.name}")
    excel_files = sorted([p for p in product.iterdir() if p.suffix.lower() in ('.xlsx', '.xls')])
    if not excel_files:
        print("  No Excel files found")
        continue
    for f in excel_files:
        try:
            df = pd.read_excel(f)
            cols = list(df.columns)
        except Exception as e:
            cols = f"ERROR: {e}"
        print(f"  FILE: {f.name}")
        print(f"    COLUMNS: {cols}")
    print()
