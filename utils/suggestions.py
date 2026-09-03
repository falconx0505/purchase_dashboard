import pandas as pd
import numpy as np


def analyze_columns(df):
    """
    Analyze dataframe columns and provide intelligent suggestions.
    Enhanced ID column detection matching notebook logic.
    
    Args:
        df: pandas DataFrame
    
    Returns:
        Dictionary with suggestions for groupby, sum, and frequency columns
    """
    suggestions = {
        "groupby": [],
        "sum": [],
        "frequency": []
    }

    for col in df.columns:
        try:
            series = df[col].dropna()
            
            if len(series) == 0:
                continue
            
            unique_count = series.nunique()
            unique_ratio = unique_count / len(df)
            missing_ratio = df[col].isna().mean()

            # GROUPBY SUGGESTIONS
            # Match notebook's AUTO mode detection: 0.05 < ratio < 0.8
            # Exclude numeric and datetime columns
            is_numeric = pd.api.types.is_numeric_dtype(df[col])
            is_datetime = pd.api.types.is_datetime64_any_dtype(df[col])
            
            if not is_numeric and not is_datetime:
                if 0.05 < unique_ratio < 0.8 and missing_ratio < 0.4:
                    suggestions["groupby"].append({
                        "col": col,
                        "cardinality": unique_count,
                        "ratio": unique_ratio
                    })

            # SUM SUGGESTIONS
            # Look for numeric columns with variance
            if pd.api.types.is_numeric_dtype(series):
                try:
                    variance = series.var()
                    if variance > 0 and not np.isinf(variance):
                        # Exclude GST/tax columns
                        gst_keywords = ['gst', 'cgst', 'sgst', 'igst', 'tax']
                        if not any(kw in col.lower() for kw in gst_keywords):
                            suggestions["sum"].append(col)
                except:
                    pass

            # FREQUENCY SUGGESTIONS
            # Look for high-cardinality columns (potential transaction IDs)
            if unique_ratio > 0.5 and missing_ratio < 0.3:
                suggestions["frequency"].append(col)

        except Exception:
            continue

    # Sort groupby suggestions by ratio (higher = more entities = better)
    # This matches the notebook's preference
    suggestions["groupby"] = sorted(
        suggestions["groupby"], 
        key=lambda x: x["ratio"], 
        reverse=True
    )[:5]  # Top 5 suggestions

    # Sort sum columns by variance
    try:
        sum_cols_with_variance = []
        for col in suggestions["sum"]:
            var = df[col].var()
            sum_cols_with_variance.append((col, var))
        
        sum_cols_with_variance.sort(key=lambda x: x[1], reverse=True)
        suggestions["sum"] = [col for col, _ in sum_cols_with_variance[:10]]  # Top 10
    except:
        suggestions["sum"] = suggestions["sum"][:10]

    # Limit frequency suggestions
    suggestions["frequency"] = suggestions["frequency"][:10]

    return suggestions