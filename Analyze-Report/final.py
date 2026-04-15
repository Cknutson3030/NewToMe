import os
import re
import unicodedata
import warnings
from pathlib import Path
import pandas as pd
import numpy as np

"""
Robust final evaluator for model predictions across products.

This script expects each product folder inside `Python-Plot/` to contain
two Excel files:
 - one with predictions (has a column with 'predict' / 'prediction')
 - one with metrics (processing time, token counts, token rates)

It computes MAE, per-product SD, Adjusted Accuracy, normalized metrics,
an efficiency score, final score, and writes both CSV and XLSX outputs.
"""

# ===== CONFIG =====
BASE_DIR = os.path.join(os.path.dirname(__file__), "Python-Plot")
LAMBDA = 0.3
EPS = 1e-12
# alpha for combining normalized adjusted-MAE and normalized RMSE (recommended 0.4-0.6)
ALPHA = 0.6

# Optional: set known ground-truth values here (keys must match folder names)
TRUE_VALUES = {
    "Airpod": 13,
    "Asics Gel-LyTE III": 1.95,
    "Classic JENGA Game": 0.1278,
    "Herman Miller Aeron Chair": 87,
    "Landscape Forms Carousel Table": 400,
    "SodaStream-Fizzi": 17.1
}

OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "final_model_evaluation.csv")
OUTPUT_XLSX = os.path.join(os.path.dirname(__file__), "final_model_evaluation.xlsx")


def find_first_in_cols(cols, variants):
    """Return the first column name where any variant (list of keywords)
    all appear in the column lower-case name.
    `variants` is a list of lists, each inner list contains keywords that must all appear.
    """
    lower_cols = [c for c in cols]
    for variant in variants:
        for col in lower_cols:
            low = col.lower()
            if all(k in low for k in variant):
                return col
    return None


def read_excel_safe(path):
    try:
        return pd.read_excel(path)
    except Exception as e:
        warnings.warn(f"Failed to read {path}: {e}")
        return None


def normalize_name_key(text):
    """Normalize names for tolerant matching (case/quote/punctuation-insensitive)."""
    t = unicodedata.normalize('NFKD', str(text)).lower()
    t = t.replace('“', '').replace('”', '').replace('"', '').replace("'", '')
    return re.sub(r'[^a-z0-9]+', '', t)


def get_true_value(product_name, carbon_df):
    """Get true value from configured mapping first, then from a true-value column if present."""
    # 1) direct match
    val = TRUE_VALUES.get(product_name)
    if val is not None:
        return float(val)

    # 2) normalized name match (handles case and smart quote differences)
    wanted = normalize_name_key(product_name)
    for key, mapped in TRUE_VALUES.items():
        if normalize_name_key(key) == wanted:
            return float(mapped)

    # 3) fallback: infer from file if it contains a true/actual column
    true_col = find_first_in_cols(carbon_df.columns, [['true value'], ['true'], ['actual'], ['ground'], ['expected']])
    if true_col is not None:
        vals = carbon_df[true_col].dropna().unique()
        if len(vals) >= 1:
            return float(vals[0])

    return None


def normalize_df_columns(df, kind='auto'):
    """Normalize common column name variants to canonical names used by this script.

    kind: 'prediction', 'metrics', or 'auto'. Returns a DataFrame with renamed columns.
    """
    rename_map = {}
    for col in list(df.columns):
        low = str(col).lower().strip()

        # Model column
        if 'model' in low or low == 'name' or 'model name' in low:
            rename_map[col] = 'Model'
            continue

        # Prediction-like columns
        if kind in ('prediction', 'auto'):
            if any(k in low for k in ('cradle', 'cradle-to-grave', 'cradle to grave', 'prediction', 'predicted', 'co2', 'co₂', 'co2e', 'kg')):
                rename_map[col] = 'prediction'
                continue

        # Metrics-like columns
        if kind in ('metrics', 'auto'):
            if 'processing' in low and ('ms' in low or 'processing_ms' in low):
                rename_map[col] = 'processing_ms'
                continue
            if 'input' in low and 'token' in low and 'pricing' not in low:
                rename_map[col] = 'input_tokens'
                continue
            if 'output' in low and 'token' in low and 'pricing' not in low:
                rename_map[col] = 'output_tokens'
                continue
            if 'input' in low and ('pricing' in low or 'rate' in low or 'price' in low):
                rename_map[col] = 'input_rate'
                continue
            if 'output' in low and ('pricing' in low or 'rate' in low or 'price' in low):
                rename_map[col] = 'output_rate'
                continue

    if rename_map:
        return df.rename(columns=rename_map)
    return df


def collect_product_summaries(base_dir):
    all_products = []
    base = Path(base_dir)
    if not base.exists():
        raise FileNotFoundError(f"Base directory not found: {base_dir}")

    for product in sorted([p for p in base.iterdir() if p.is_dir()]):
        name = product.name
        print(f"Processing: {name}")

        excel_files = [p for p in product.iterdir() if p.suffix.lower() in ('.xlsx', '.xls')]
        if len(excel_files) < 2:
            warnings.warn(f"Expected 2 Excel files in {product} — found {len(excel_files)}. Skipping.")
            continue

        carbon_df = None
        metrics_df = None

        # classify files by columns (prediction vs metrics)
        pred_keywords = ['predict', 'prediction', 'cradle', 'cradle-to-grave', 'co2', 'co₂', 'co2e', 'kg', 'carbon']
        metrics_keywords = ['token', 'tokens', 'processing', 'processing_ms', 'time', 'latency', 'rate', 'pricing', 'price', 'cost', 'input', 'output']
        for f in excel_files:
            df = read_excel_safe(f)
            if df is None:
                continue
            # quick header check
            cols = [str(c).strip() for c in df.columns]
            cols_low = [c.lower() for c in cols]

            is_pred = any(any(k in c for k in pred_keywords) for c in cols_low)
            is_metrics = any(any(k in c for k in metrics_keywords) for c in cols_low)

            if is_pred and not is_metrics:
                carbon_df = df.copy()
                continue
            if is_metrics and not is_pred:
                metrics_df = df.copy()
                continue

            # if both or neither matched, use heuristics:
            # prefer file with numeric columns named like 'cradle' or containing 'kg' as prediction
            if any('cradle' in c or 'kg' in c for c in cols_low):
                carbon_df = df.copy()
                continue
            # prefer file with tokens/processing as metrics
            if any('token' in c or 'processing' in c or 'processing_ms' in c for c in cols_low):
                metrics_df = df.copy()
                continue

            # last resort: assign larger-table file to metrics
            if len(cols_low) > 2:
                metrics_df = df.copy()
                continue

            # fallback: treat as prediction file
            carbon_df = df.copy()

        if carbon_df is None or metrics_df is None:
            warnings.warn(f"Could not identify both prediction and metrics files in {product}. Skipping.")
            continue

        # normalize column names (strip whitespace and map variants to canonical names)
        carbon_df.columns = carbon_df.columns.astype(str).str.strip()
        metrics_df.columns = metrics_df.columns.astype(str).str.strip()

        carbon_df = normalize_df_columns(carbon_df, kind='prediction')
        metrics_df = normalize_df_columns(metrics_df, kind='metrics')

        # find model & prediction columns (prefer canonical names)
        model_col = 'Model' if 'Model' in carbon_df.columns else find_first_in_cols(carbon_df.columns, [['model'], ['model name'], ['name']])
        if model_col is None:
            model_col = 'Model' if 'Model' in metrics_df.columns else find_first_in_cols(metrics_df.columns, [['model'], ['model name'], ['name']])
        if model_col is None:
            warnings.warn(f"No model column found for {product}. Skipping.")
            continue

        pred_col = 'prediction' if 'prediction' in carbon_df.columns else find_first_in_cols(carbon_df.columns, [['prediction'], ['predict'], ['cradle-to-grave'], ['cradle'], ['co2'], ['co2e'], ['kg'], ['carbon']])
        if pred_col is None:
            warnings.warn(f"No prediction column found in prediction file for {product}. Skipping.")
            continue

        # determine true value
        true_value = get_true_value(name, carbon_df)
        if true_value is None:
            warnings.warn(f"Missing true value for {name}. Skipping product.")
            continue

        # prepare carbon summary
        carbon_df[model_col] = carbon_df[model_col].astype(str).str.strip()
        carbon_df[pred_col] = pd.to_numeric(carbon_df[pred_col], errors='coerce')
        carbon_df = carbon_df.dropna(subset=[pred_col])

        # compute residuals relative to true value (signed residual)
        tv = float(true_value)
        carbon_df['resid'] = carbon_df[pred_col] - tv
        carbon_df['error'] = carbon_df['resid'].abs()
        carbon_df['sq_err'] = carbon_df['resid'] ** 2

        # per-model summary: MAE, RMSE, residual SD, and sample count
        carbon_summary = carbon_df.groupby(model_col).agg(
            MAE=('error', 'mean'),
            RMSE=('sq_err', lambda s: np.sqrt(s.mean())),
            SD_resid=('resid', 'std'),
            count=(pred_col, 'size')
        ).reset_index().rename(columns={model_col: 'Model'})

        # adjusted MAE/RMSE and normalized metrics (guard against zero true value)
        den = tv if abs(tv) > EPS else EPS
        # Adjusted MAE: MAE penalized by residual variability
        carbon_summary['Adjusted_MAE'] = carbon_summary['MAE'] + (LAMBDA * carbon_summary['SD_resid'])
        # Adjusted RMSE: combine RMSE and SD_resid in quadrature to penalize variability
        carbon_summary['Adjusted_RMSE'] = np.sqrt(carbon_summary['RMSE'] ** 2 + (LAMBDA * carbon_summary['SD_resid']) ** 2)
        carbon_summary['norm_MAE'] = carbon_summary['MAE'] / den
        carbon_summary['norm_RMSE'] = carbon_summary['RMSE'] / den
        carbon_summary['norm_Adjusted_MAE'] = carbon_summary['Adjusted_MAE'] / den
        carbon_summary['norm_Adjusted_RMSE'] = carbon_summary['Adjusted_RMSE'] / den

        # prepare metrics summary
        # detect likely metric columns (prefer canonical names if present)
        proc_col = 'processing_ms' if 'processing_ms' in metrics_df.columns else find_first_in_cols(metrics_df.columns, [['processing', 'ms'], ['processing'], ['time', 'ms'], ['latency', 'ms'], ['processing_time']])
        in_tok_col = 'input_tokens' if 'input_tokens' in metrics_df.columns else find_first_in_cols(metrics_df.columns, [['input', 'token'], ['input_tokens'], ['input tokens']])
        out_tok_col = 'output_tokens' if 'output_tokens' in metrics_df.columns else find_first_in_cols(metrics_df.columns, [['output', 'token'], ['output_tokens'], ['output tokens']])
        in_rate_col = 'input_rate' if 'input_rate' in metrics_df.columns else find_first_in_cols(metrics_df.columns, [['input', 'rate'], ['input', 'price'], ['input', 'cost']])
        out_rate_col = 'output_rate' if 'output_rate' in metrics_df.columns else find_first_in_cols(metrics_df.columns, [['output', 'rate'], ['output', 'price'], ['output', 'cost']])

        # fallback defaults for missing rates
        if in_rate_col is None:
            in_rate_col = None
        if out_rate_col is None:
            out_rate_col = None

        # ensure model col exists in metrics file
        metrics_model_col = 'Model' if 'Model' in metrics_df.columns else find_first_in_cols(metrics_df.columns, [['model'], ['name']])
        if metrics_model_col is None:
            warnings.warn(f"No model column in metrics file for {product}. Skipping.")
            continue

        # make numeric and sane defaults
        metrics_df[metrics_model_col] = metrics_df[metrics_model_col].astype(str).str.strip()
        if proc_col is not None:
            metrics_df[proc_col] = pd.to_numeric(metrics_df[proc_col], errors='coerce')
        if in_tok_col is not None:
            metrics_df[in_tok_col] = pd.to_numeric(metrics_df[in_tok_col], errors='coerce').fillna(0)
        if out_tok_col is not None:
            metrics_df[out_tok_col] = pd.to_numeric(metrics_df[out_tok_col], errors='coerce').fillna(0)
        if in_rate_col is not None:
            metrics_df[in_rate_col] = pd.to_numeric(metrics_df[in_rate_col], errors='coerce').fillna(0)
        if out_rate_col is not None:
            metrics_df[out_rate_col] = pd.to_numeric(metrics_df[out_rate_col], errors='coerce').fillna(0)

        # compute cost (if rates or tokens missing, treat as zero)
        def safe_col(df, col):
            return df[col] if (col is not None and col in df.columns) else 0

        metrics_df['cost'] = (
            safe_col(metrics_df, in_tok_col) * safe_col(metrics_df, in_rate_col) +
            safe_col(metrics_df, out_tok_col) * safe_col(metrics_df, out_rate_col)
        )

        # Avg_Time in seconds
        if proc_col is None:
            warnings.warn(f"No processing/time column found for {product}; Avg_Time will be NaN.")

        metrics_summary = metrics_df.groupby(metrics_model_col).agg(
            Avg_Time=(proc_col, lambda x: x.mean() / 1000 if x.notna().any() else np.nan),
            Avg_Cost=('cost', 'mean')
        ).reset_index().rename(columns={metrics_model_col: 'Model'})

        # merge per-product summaries
        merged = pd.merge(carbon_summary, metrics_summary, on='Model', how='inner')
        if merged.empty:
            warnings.warn(f"No overlapping models between prediction and metrics for {product}. Skipping.")
            continue
        merged['Product'] = name
        all_products.append(merged)

    return all_products


def build_final_table(all_products):
    if not all_products:
        raise RuntimeError('No product summaries collected; nothing to aggregate')

    all_data = pd.concat(all_products, ignore_index=True)

    # Aggregate across products (simple mean per product since sample counts are equal)
    final = all_data.groupby('Model', as_index=False).agg(
        ave_MAE=('MAE', 'mean'),
        ave_RMSE=('RMSE', 'mean'),
        ave_SD_resid=('SD_resid', 'mean'),
        ave_Adjusted_MAE=('Adjusted_MAE', 'mean'),
        ave_norm_Adjusted_MAE=('norm_Adjusted_MAE', 'mean'),
        ave_Adjusted_RMSE=('Adjusted_RMSE', 'mean'),
        ave_norm_Adjusted_RMSE=('norm_Adjusted_RMSE', 'mean'),
        ave_norm_RMSE=('norm_RMSE', 'mean'),
        Avg_Time=('Avg_Time', 'mean'),
        Avg_Cost=('Avg_Cost', 'mean'),
        total_count=('count', 'sum')
    )

    # For normalized measures lower is better; convert to benefit (higher is better)
    best_norm_adj = final['ave_norm_Adjusted_MAE'].min()
    best_norm_rmse = final['ave_norm_Adjusted_RMSE'].min()
    fastest_time = final['Avg_Time'].min()
    cheapest_cost = final['Avg_Cost'].min()

    final['S_adj'] = (best_norm_adj + EPS) / (final['ave_norm_Adjusted_MAE'] + EPS)
    final['S_rmse'] = (best_norm_rmse + EPS) / (final['ave_norm_Adjusted_RMSE'] + EPS)

    # combine adjusted-MAE and RMSE into a single error score
    final['S_err'] = ALPHA * final['S_adj'] + (1.0 - ALPHA) * final['S_rmse']

    final['Norm_Time'] = (fastest_time + EPS) / (final['Avg_Time'] + EPS)
    final['Norm_Cost'] = (cheapest_cost + EPS) / (final['Avg_Cost'] + EPS)

    final['Efficiency'] = final['ave_MAE'] * final['Avg_Time'] * final['Avg_Cost']

    # Final score weights: error dominant (0.8), time (0.15), cost (0.05)
    final['Final_Score'] = (
        0.8 * final['S_err'] +
        0.15 * final['Norm_Time'] +
        0.05 * final['Norm_Cost']
    )

    # Higher Final_Score is better now; rank descending (1 = best)
    final['Rank'] = final['Final_Score'].rank(method='min', ascending=False).astype(int)
    final = final.sort_values('Final_Score', ascending=False).reset_index(drop=True)
    # rename averaged columns to make meaning explicit and set friendly display names
    final.rename(columns={
        'ave_MAE': 'ave_MAE',
        'ave_RMSE': 'ave_RMSE',
        'ave_SD_resid': 'ave_SD',
        'ave_Adjusted_MAE': 'Adjusted MAE (kg CO₂e)',
        'ave_norm_Adjusted_MAE': 'Norm. Adjusted MAE',
        'ave_Adjusted_RMSE': 'Adjusted RMSE (kg CO₂e)',
        'ave_norm_Adjusted_RMSE': 'Norm. Adjusted RMSE',
        'ave_norm_RMSE': 'Norm. RMSE'
    }, inplace=True)
    return final


def explanation_table():
    rows = [
        {"Column": "Model",
         "How it is Calculated": "Just the model name",
         "What it means": "Name of the LLM"},
        {"Column": "ave_MAE (Accuracy)",
         "How it is Calculated": "Average of the absolute errors from the predictions in each product file",
         "What it means": "Average prediction error in kg CO₂e (per product true value used)"},
        {"Column": "ave_RMSE (Large-error sensitivity)",
         "How it is Calculated": "Root mean square error across sample residuals (sensitive to large mistakes)",
         "What it means": "Typical magnitude of errors with emphasis on large deviations"},
        {"Column": "ave_SD (Prediction Stability)",
         "How it is Calculated": "AVERAGE(std of residuals across products) — std(prediction - true)",
         "What it means": "Variation of model residuals around the truth (higher = less stable)"},
        {"Column": "Adjusted MAE (kg CO₂e)",
         "How it is Calculated": "Adjusted MAE = MAE + (λ × SD_resid); λ = 0.3",
         "What it means": "MAE penalized by residual variance (lower is better)"},
        {"Column": "Adjusted RMSE (kg CO₂e)",
         "How it is Calculated": "Adjusted RMSE = sqrt(RMSE**2 + (λ × SD_resid)**2); λ = 0.3",
         "What it means": "RMSE penalized by residual variance (lower is better)"},
        {"Column": "Avg Time (sec)(speed)",
         "How it is Calculated": "Average of the processing_ms column ÷ 1000 (converted to seconds)",
         "What it means": "How many seconds the model takes per prediction"},
        {"Column": "Avg Cost ($)",
         "How it is Calculated": "(Input Tokens × Input rate) + (Output Tokens × Output rate)",
         "What it means": "Average cost in US dollars per prediction"},
        {"Column": "Norm. Adjusted MAE",
         "How it is Calculated": "Adjusted MAE ÷ product true value (normalized per product) then averaged across products",
         "What it means": "Scale-invariant adjusted error used to compute S_adj (lower = better)"},
        {"Column": "Norm. Adjusted RMSE",
         "How it is Calculated": "Adjusted RMSE ÷ product true value (normalized per product) then averaged across products",
         "What it means": "Scale-invariant adjusted RMSE used to compute S_rmse (lower = better)"},
        {"Column": "S_adj (error score from adjusted MAE)",
         "How it is Calculated": "best(ave_norm_Adjusted_MAE) ÷ model's ave_norm_Adjusted_MAE (higher = better)",
         "What it means": "Benefit-style score derived from normalized Adjusted MAE (1 = best)"},
        {"Column": "S_rmse (error score from adjusted RMSE)",
         "How it is Calculated": "best(ave_norm_Adjusted_RMSE) ÷ model's ave_norm_Adjusted_RMSE (higher = better)",
         "What it means": "Benefit-style score derived from normalized Adjusted RMSE (1 = best)"},
        {"Column": "S_err (Combined error)",
         "How it is Calculated": "S_err = ALPHA × S_adj + (1-ALPHA) × S_rmse (ALPHA default 0.6)",
         "What it means": "Combined error score balancing typical and large-error sensitivity (higher = better)"},
        {"Column": "Norm. Time",
         "How it is Calculated": "Fastest Avg Time ÷ Model's Avg Time (higher = better)",
         "What it means": "Normalized speed where higher is better (faster = higher)"},
        {"Column": "Norm. Cost",
         "How it is Calculated": "Lowest Avg Cost ÷ Model's Avg Cost (higher = better)",
         "What it means": "Normalized cost-efficiency where higher is better (cheaper = higher)"},
        {"Column": "Efficiency score",
         "How it is Calculated": "Avg MAE × Avg Time × Avg Cost",
         "What it means": "Overall real-world cost combining error, latency, and monetary cost"},
        {"Column": "Final Score",
         "How it is Calculated": "0.8 × S_err + 0.15 × Norm. Time + 0.05 × Norm. Cost",
         "What it means": "Combined final performance score using combined error, speed and cost (higher = better)"},
        {"Column": "Rank",
         "How it is Calculated": "Ordering by Final Score (highest = best)",
         "What it means": "Final ranking of models (1 = best)"}
    ]
    return pd.DataFrame(rows)


def main():
    all_products = collect_product_summaries(BASE_DIR)
    if not all_products:
        print("No valid product summaries collected. Exiting.")
        return

    final = build_final_table(all_products)

    # save CSV and Excel (with explanation sheet)
    final.to_csv(OUTPUT_CSV, index=False)
    try:
        # try to remove existing file if possible to avoid openpyxl permission issues
        if os.path.exists(OUTPUT_XLSX):
            try:
                os.remove(OUTPUT_XLSX)
            except Exception:
                # ignore remove failures (file may be locked)
                pass

        with pd.ExcelWriter(OUTPUT_XLSX) as w:
            final.to_excel(w, sheet_name='evaluation', index=False)
            explanation_table().to_excel(w, sheet_name='explanation', index=False)
        print(f"\n✅ DONE — outputs saved to:\n - {OUTPUT_CSV}\n - {OUTPUT_XLSX}\n")
    except PermissionError:
        warnings.warn(f"Could not write Excel file {OUTPUT_XLSX} (permission denied). CSV saved to {OUTPUT_CSV} instead.")
        print(f"\n✅ DONE — outputs saved to:\n - {OUTPUT_CSV}\n")

    print(final)


if __name__ == '__main__':
    main()