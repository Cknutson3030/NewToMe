"""airpod_time_cost_plot.py

Create a Time vs Cost scatter plot where each point is colored by `Model`.

This file follows the same top-level config / procedural style as `Airpod-plot.py`.
Set `input_file` below to the Excel workbook you want to use.
"""

import os
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import matplotlib.dates as mdates
import numpy as np
from matplotlib.patches import Ellipse

# Config (follow the Airpod-plot.py style)
input_file = "Table-Token-time.xlsx"
output_png = "table_time_cost_plot.png"

# Optional explicit column name overrides (set to a string to force a mapping)
# e.g. time_col_name = "timestamp" ; cost_col_name = "cradle-to-grave (kg CO₂e)" ; model_col_name = "Model"
time_col_name = None
cost_col_name = None
model_col_name = None

# If the explicit input_file is not present, try to auto-find a sensible XLSX in the folder
if not os.path.exists(input_file):
    xlsx_files = [f for f in os.listdir(".") if f.lower().endswith(".xlsx")]
    fallback = None
    # Prefer files that mention 'time' (e.g., 'Table-Token,time.xlsx'), then 'table'
    for pattern in ("time", "token,time", "table"):
        for f in xlsx_files:
            if pattern in f.lower():
                fallback = f
                break
        if fallback:
            break
    if fallback is None and xlsx_files:
        fallback = xlsx_files[0]
    if fallback:
        print(f"input_file '{input_file}' not found; using '{fallback}' instead.")
        input_file = fallback
    else:
        raise FileNotFoundError(f"Could not find {input_file} or any .xlsx in {os.getcwd()}")

df = pd.read_excel(input_file)

# Candidate detection helpers
def find_column_like(df_cols, candidates):
    for col in df_cols:
        for cand in candidates:
            if cand.lower() in col.lower():
                return col
    return None


# Detect columns (allow explicit overrides)
if time_col_name is not None:
    if time_col_name not in df.columns:
        raise KeyError(f"time_col_name '{time_col_name}' not found in Excel columns: {list(df.columns)}")
    time_col = time_col_name
else:
    time_col = find_column_like(df.columns, ["time", "timestamp", "date", "datetime", "processing", "processing_ms", "ms", "duration", "latency", "elapsed"]) 

if cost_col_name is not None:
    if cost_col_name not in df.columns:
        raise KeyError(f"cost_col_name '{cost_col_name}' not found in Excel columns: {list(df.columns)}")
    cost_col = cost_col_name
else:
    cost_col = find_column_like(df.columns, ["cost", "price", "value", "predicted", "kg_co2e", "co2e", "emissions", "cradle"]) 

if model_col_name is not None:
    if model_col_name not in df.columns:
        raise KeyError(f"model_col_name '{model_col_name}' not found in Excel columns: {list(df.columns)}")
    model_col = model_col_name
else:
    model_col = find_column_like(df.columns, ["model", "model_name", "model id"]) 
    if model_col is None and "Model" in df.columns:
        model_col = "Model"

# If cost is missing, try to compute it from token counts and pricing rates
if cost_col is None:
    # possible token columns
    input_tokens_col = find_column_like(df.columns, ["input tokens", "input_tokens", "inputtokens", "input token", "input_token"]) 
    output_tokens_col = find_column_like(df.columns, ["output tokens", "output_tokens", "outputtokens", "output token", "output_token"]) 

    # find pricing/rate columns by searching for 'input'/'output' + ('price'|'pricing'|'rate')
    input_rate_col = None
    output_rate_col = None
    for col in df.columns:
        low = col.lower().replace(" ", "")
        if ("input" in low or "inputtokens" in low) and ("price" in low or "pricing" in low or "rate" in low):
            input_rate_col = col
            break
    for col in df.columns:
        low = col.lower().replace(" ", "")
        if ("output" in low or "outputtokens" in low) and ("price" in low or "pricing" in low or "rate" in low):
            output_rate_col = col
            break

    cost_series = None
    if input_tokens_col and input_rate_col:
        s_in = pd.to_numeric(df[input_tokens_col], errors="coerce") * pd.to_numeric(df[input_rate_col], errors="coerce")
        cost_series = s_in if cost_series is None else cost_series + s_in
        df["__input_cost__"] = s_in
    if output_tokens_col and output_rate_col:
        s_out = pd.to_numeric(df[output_tokens_col], errors="coerce") * pd.to_numeric(df[output_rate_col], errors="coerce")
        cost_series = s_out if cost_series is None else cost_series + s_out
        df["__output_cost__"] = s_out

    if cost_series is not None:
        df["__computed_cost__"] = cost_series
        cost_col = "__computed_cost__"

# Report missing required columns
missing = []
if time_col is None:
    missing.append("time column (e.g., 'time', 'timestamp', 'date', 'processing_ms')")
if cost_col is None:
    missing.append("cost column (e.g., 'cost', 'value', 'predicted' or compute from tokens and pricing rate)")
if model_col is None:
    missing.append("model column (e.g., 'Model', 'model_name')")
if missing:
    print("Could not auto-detect required columns. Available columns:")
    for c in df.columns:
        print(" -", c)
    raise KeyError("Missing columns: " + ", ".join(missing))

# Prepare a minimal DataFrame with only the required columns and normalized names
df_min = df[[time_col, cost_col, model_col]].copy()
df_min.columns = ["time", "cost", "Model"]

# Convert types: cost -> numeric
df_min["cost"] = pd.to_numeric(df_min["cost"], errors="coerce")

# Normalize time: if numeric ms -> seconds, else try parse datetimes
try:
    # If time looks numeric, convert and detect ms
    numeric_time = pd.to_numeric(df_min["time"], errors="coerce")
    if numeric_time.notna().sum() > 0:
        med = numeric_time.median(skipna=True)
        if pd.notna(med) and med > 1000:
            # assume milliseconds -> convert to seconds
            df_min["time"] = numeric_time / 1000.0
        else:
            # try parse to datetime; if parse yields values, use them
            parsed = pd.to_datetime(df_min["time"], errors="coerce")
            if parsed.notna().sum() > 0:
                df_min["time"] = parsed
    else:
        parsed = pd.to_datetime(df_min["time"], errors="coerce")
        if parsed.notna().sum() > 0:
            df_min["time"] = parsed
except Exception:
    try:
        df_min["time"] = pd.to_datetime(df_min["time"], errors="coerce")
    except Exception:
        pass

# Drop rows missing any of the required normalized fields
df_plot = df_min.dropna(subset=["time", "cost", "Model"]) if not df_min.empty else df_min
if df_plot.empty:
    raise ValueError("No rows with non-missing time, cost and model values to plot.")

# Convert time to numeric column for std/mean calculations (seconds when datetime)
if pd.api.types.is_datetime64_any_dtype(df_plot["time"]):
    df_plot["time_numeric"] = df_plot["time"].astype("int64") / 1e9
else:
    df_plot["time_numeric"] = pd.to_numeric(df_plot["time"], errors="coerce")

# Aggregate per-model statistics (means and stds)
group = df_plot.groupby("Model")
agg = group.agg(
    time_mean=("time_numeric", "mean"),
    time_std=("time_numeric", "std"),
    cost_mean=("cost", "mean"),
    cost_std=("cost", "std"),
    n=("cost", "count"),
).reset_index()
agg[["time_std", "cost_std"]] = agg[["time_std", "cost_std"]].fillna(0.0)

# X and Y values (means)
x_vals = agg["time_mean"]
y_vals = agg["cost_mean"]

# Compute ellipse widths (2*std) and heights (2*std) scaled to plot
widths = 2.0 * agg["time_std"].fillna(0.0)
heights = 2.0 * agg["cost_std"].fillna(0.0)

# Axis ranges
x_range = (x_vals.max() - x_vals.min()) if len(x_vals) > 0 else 1.0
y_range = (y_vals.max() - y_vals.min()) if len(y_vals) > 0 else 1.0
if not np.isfinite(x_range) or x_range == 0:
    x_range = 1.0
if not np.isfinite(y_range) or y_range == 0:
    y_range = 1.0

# Desired maximum ellipse size as fraction of axis span
desired_max_frac = 0.25
desired_max_width = x_range * desired_max_frac
desired_max_height = y_range * desired_max_frac

max_w = widths.max() if len(widths) > 0 else 0.0
max_h = heights.max() if len(heights) > 0 else 0.0
scale_x = (desired_max_width / max_w) if max_w > 0 else 1.0
scale_y = (desired_max_height / max_h) if max_h > 0 else 1.0

ellipse_widths = widths * scale_x
ellipse_heights = heights * scale_y

# Color per model
palette_colors = sns.color_palette("tab10", n_colors=len(agg)) if len(agg) <= 10 else sns.color_palette("hls", n_colors=len(agg))
color_map = dict(zip(agg["Model"], palette_colors))

# Bubble plot using ellipses sized by std(time) and std(cost)
sns.set(style="whitegrid")
fig, ax = plt.subplots(figsize=(12, 7))

# Draw ellipses
for i, row in agg.iterrows():
    xm = x_vals.iloc[i]
    ym = y_vals.iloc[i]
    w = float(ellipse_widths.iloc[i])
    h = float(ellipse_heights.iloc[i])
    col = color_map[row["Model"]]
    e = Ellipse((xm, ym), width=max(w, 0.0), height=max(h, 0.0), facecolor=col, alpha=0.45, edgecolor="k")
    ax.add_patch(e)

# Plot mean points on top
ax.scatter(x_vals, y_vals, s=60, c=[color_map[m] for m in agg["Model"]], edgecolor="w", zorder=3)

def _place_nonoverlapping_labels(ax, x, y, labels, fontsize=9, pad=4, max_iter=200):
    texts = []
    for xi, yi, lab in zip(x, y, labels):
        t = ax.text(xi, yi, f" {lab}", va="center", fontsize=fontsize, zorder=5,
                    bbox=dict(facecolor='white', alpha=0.65, edgecolor='none', pad=0.2))
        texts.append(t)

    fig = ax.figure
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    inv = ax.transData.inverted()

    positions = np.vstack([x, y]).T.astype(float)

    for _ in range(max_iter):
        fig.canvas.draw()
        renderer = fig.canvas.get_renderer()
        bboxes = [t.get_window_extent(renderer) for t in texts]
        moved = False
        for i in range(len(texts)):
            for j in range(i + 1, len(texts)):
                if bboxes[i].overlaps(bboxes[j]):
                    moved = True
                    ci = np.array([bboxes[i].x0 + bboxes[i].width / 2.0, bboxes[i].y0 + bboxes[i].height / 2.0])
                    cj = np.array([bboxes[j].x0 + bboxes[j].width / 2.0, bboxes[j].y0 + bboxes[j].height / 2.0])
                    v = ci - cj
                    if np.allclose(v, 0):
                        v = np.random.RandomState(i + j).randn(2)
                    v = v / (np.linalg.norm(v) + 1e-9)
                    disp_mag = max(bboxes[i].width, bboxes[j].width) * 0.6 + pad
                    disp = v * disp_mag
                    for k, dsign in ((i, 1.0), (j, -1.0)):
                        disp_pos = ax.transData.transform(positions[k]) + dsign * disp * 0.5
                        new_data = inv.transform(disp_pos)
                        positions[k] = new_data
                        texts[k].set_position((new_data[0], new_data[1]))
        if not moved:
            break



# Place model labels without overlap
_place_nonoverlapping_labels(ax, x_vals.values, y_vals.values, agg["Model"].astype(str).tolist(), fontsize=9)

# Additional fine-grained nudges for specific models to sit just left of their ellipse
# This moves the label slightly left by half the ellipse width plus a small margin.
targets = ["gpt-5.4", "grok-4-1-fast-non-reasoning"]
for tname in targets:
    idxs = agg.index[agg["Model"] == tname].tolist()
    if not idxs:
        continue
    i = idxs[0]
    w = float(ellipse_widths.iloc[i]) if i is not None else 0.0
    xm = float(x_vals.iloc[i])
    ym = float(y_vals.iloc[i])
    offset = max(0.5 * w + 0.01 * x_range, 0.0)
    # find the placed text on the axes and shift it left
    for text in ax.texts:
        # text labels were created with a leading space in _place_nonoverlapping_labels
        if tname in text.get_text():
            x0, y0 = text.get_position()
            text.set_position((x0 - offset, y0))
            break

# Labels and (more academic) title
ax.set_xlabel("Latency (s) — mean")
ax.set_ylabel("Cost — mean")
ax.set_title("Model Efficiency Trade-off: Mean Latency vs. Cost for Table")

plt.tight_layout()
bubble_png = "table_models_bubble.png"
fig.savefig(bubble_png, dpi=150, bbox_inches="tight")
print(f"Saved bubble plot to {bubble_png}")

plt.close(fig)
