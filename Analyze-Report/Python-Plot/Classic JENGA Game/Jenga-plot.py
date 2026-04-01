import os
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Config
input_file = "Jenga-All-Models-For-Analyze.xlsx"
# Set to 'mean', 'median', 'both', or 'none' (default: mean)
summary_measure = "mean"

if not os.path.exists(input_file):
    raise FileNotFoundError(f"Could not find {input_file} in current directory: {os.getcwd()}")

df = pd.read_excel(input_file)

# Auto-fix column name (important)
for col in df.columns:
    if "cradle" in col.lower():
        df = df.rename(columns={col: "value"})
# Fallback: normalize any case-variant 'value'
if "value" not in df.columns:
    for col in df.columns:
        if col.lower() == "value":
            df = df.rename(columns={col: "value"})
            break

if "Model" not in df.columns:
    raise KeyError("No 'Model' column found in the Excel file")

# True value (adjust as needed)
TRUE_VALUE = 0.1278

# Compute model means and sort by signed distance (mean - TRUE_VALUE)
means = df.groupby("Model")["value"].mean()
diffs = means - TRUE_VALUE
ordered = diffs.sort_values(na_position="last")
models = ordered.index.tolist()
if len(models) == 0:
    raise ValueError("No models found in the 'Model' column")

print("Model order (mean - TRUE_VALUE):")
for m in models:
    m_mean = means.get(m, float("nan"))
    if pd.isna(m_mean):
        print(f"  {m}: NaN")
    else:
        print(f"  {m}: {m_mean - TRUE_VALUE:+.2f}")

# Colors (generate after ordering)
palette = sns.color_palette("Set2", len(models))

# Create one row per model
n = len(models)
fig_height = max(1.5 * n, 6)
fig, axes = plt.subplots(nrows=n, ncols=1, sharex=True, figsize=(10, fig_height))
if n == 1:
    axes = [axes]

for i, model in enumerate(models):
    ax = axes[i]
    subset = df[df["Model"] == model]
    if subset.empty or "value" not in subset.columns:
        ax.text(0.5, 0.5, "No data", ha="center", va="center")
        ax.set_yticks([])
        continue

    values = subset["value"].dropna()
    # If too few points for KDE, fall back to a histogram/rug
    if len(values) < 2:
        sns.histplot(values, ax=ax, color=palette[i])
    else:
        sns.kdeplot(
            data=subset,
            x="value",
            fill=True,
            alpha=0.6,
            linewidth=1.5,
            bw_adjust=1.5,
            cut=0,
            color=palette[i],
            ax=ax,
        )

    # True value line
    ax.axvline(TRUE_VALUE, linestyle="--", linewidth=2, color="black")

    # Summary statistics lines
    mean_val = float(values.mean()) if len(values) > 0 else None
    median_val = float(values.median()) if len(values) > 0 else None
    mae_val = float((values - TRUE_VALUE).abs().mean()) if len(values) > 0 else None
    ymin, ymax = ax.get_ylim()
    if summary_measure in ("mean", "both") and mean_val is not None:
        ax.axvline(mean_val, color="navy", linestyle="-", linewidth=1.5)
        ax.text(mean_val, ymax * 0.9, f"{mean_val:.1f}", rotation=90, va="top", ha="right", fontsize=8, color="navy")
    if summary_measure in ("median", "both") and median_val is not None:
        ax.axvline(median_val, color="darkgreen", linestyle=":", linewidth=1.5)
        ax.text(median_val, ymax * 0.75, f"{median_val:.1f}", rotation=90, va="top", ha="right", fontsize=8, color="darkgreen")

    # Title includes MAE
    title_text = str(model)
    if mae_val is not None:
        title_text = f"{title_text} — MAE={mae_val:.2f}"

    ax.set_ylabel("")
    ax.set_yticks([])
    ax.set_title(title_text, loc="left", fontsize=10)

axes[-1].set_xlabel("Predicted CO₂e (kg)")
fig.suptitle("Evaluation of 12 Language Models' Predictions of Jenga Carbon Footprint (kg CO₂e)", fontsize=12)
plt.tight_layout()

# Make room for the top label then set global x-limits
fig.subplots_adjust(top=0.90)
x_min, x_max = 0, 10
for ax in axes:
    ax.set_xlim(x_min, x_max)

# Add a global 'True' label aligned with the TRUE_VALUE
fig.text((TRUE_VALUE - x_min) / (x_max - x_min), 0.95, f"True = {TRUE_VALUE}", ha="center", va="bottom", fontsize=9, color="black")

# Save output (include summary tag)
tag = summary_measure if summary_measure in ("mean", "median") else ("both" if summary_measure == "both" else "none")
output_png = f"jenga_models_rows_{tag}.png"
fig.savefig(output_png, dpi=150, bbox_inches="tight")
print(f"Saved plot to {output_png}")

plt.close(fig)