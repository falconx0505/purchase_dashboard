import polars as pl
import numpy as np


def detect_multiple_groupby_columns(df, min_entities=3):
    """
    Detect multiple valid group-by (entity) columns in AUTO mode.
    
    A column is valid if:
    - It's non-numeric and non-datetime
    - Has reasonable uniqueness (between min_entities and max_entities)
    - Creates distinct business entities for analysis
    
    Args:
        df: Input dataframe
        min_entities: Minimum number of unique values required
    
    Returns:
        List of tuples: (column_name, uniqueness_ratio) sorted by quality
    """
    candidates = []
    n_rows = len(df)
    
    # Adaptive thresholds based on dataset size
    min_ratio = max(0.001, min_entities / n_rows)  # At least min_entities
    max_ratio = 0.95  # Allow up to 95% unique (very high uniqueness like IDs)
    
    for col in df.columns:
        # Skip numeric and datetime columns
        if df[col].dtype in pl.NUMERIC_DTYPES:
            continue
        if df[col].dtype in [pl.Date, pl.Datetime, pl.Time, pl.Duration]:
            continue
        
        # Try to convert to string and check uniqueness
        try:
            n_unique = df[col].n_unique()
            uniq_ratio = n_unique / n_rows
            
            # Skip columns with too many nulls (likely not useful for grouping)
            null_ratio = df[col].null_count() / n_rows
            if null_ratio > 0.2:  # More than 20% nulls
                continue
            
            # Valid if: has at least min_entities AND falls in reasonable range
            # More permissive: allow from very few (1% of rows) to very many (95% of rows)
            # BUT exclude if it's EXACTLY unique (100% - like invoice IDs at transaction level)
            # OR if it has way too few unique values (< 0.1%)
            if n_unique >= min_entities and min_ratio <= uniq_ratio < 0.95:
                # Additional filter: skip if it looks like a transaction ID 
                # (too unique - more than 80% unique)
                if uniq_ratio > 0.8:
                    # Could be a transaction ID - still include but lower priority
                    quality_score = abs(uniq_ratio - 0.4) + 0.3  # Penalize very unique columns
                else:
                    quality_score = abs(uniq_ratio - 0.4)
                
                candidates.append((col, uniq_ratio, quality_score, n_unique))
        except:
            continue
    
    if not candidates:
        return []
    
    # Sort by quality (lower score = better), then by number of entities (more is better)
    candidates_sorted = sorted(candidates, key=lambda x: (x[2], -x[3]))
    
    print(f"🔍 Detected {len(candidates_sorted)} valid group-by columns for AUTO mode:")
    for col, ratio, score, n_unique in candidates_sorted:
        print(f"   • {col}: {n_unique} unique values ({ratio*100:.1f}%)")
    
    return [(col, ratio) for col, ratio, score, n_unique in candidates_sorted]


def build_entity_dataframe_for_groupby(df, groupby_col, numeric_cols):
    """
    Helper function to build entity dataframe for a specific group-by column.
    Used internally for AUTO mode with multiple group-by columns.
    
    Args:
        df: Input dataframe
        groupby_col: Column to group by
        numeric_cols: List of numeric columns to aggregate
    
    Returns:
        Tuple: (entity_df, selected_features)
    """
    # Filter to only truly numeric columns that exist in the dataframe
    available_numeric_cols = [col for col in numeric_cols if col in df.columns]
    
    # Group by and sum numeric features
    if available_numeric_cols:
        entity_df = df.group_by(groupby_col).agg([
            pl.col(col).sum() for col in available_numeric_cols
        ])
    else:
        entity_df = df.group_by(groupby_col).agg(pl.len().alias('count'))
        entity_df = entity_df.drop('count')
    
    # Add frequency
    frequency_df = df.group_by(groupby_col).agg(pl.len().alias('FREQUENCY'))
    entity_df = entity_df.join(frequency_df, on=groupby_col, how='left')
    
    # Select important features based on coefficient of variation
    feature_cols = [c for c in entity_df.columns if c != groupby_col]
    
    # Calculate coefficient of variation for each feature
    feature_importance = {}
    for col in feature_cols:
        try:
            # Only process numeric columns
            if entity_df[col].dtype not in pl.NUMERIC_DTYPES:
                feature_importance[col] = 0
                continue
                
            mean_val = entity_df[col].mean()
            if mean_val != 0 and mean_val is not None and not np.isnan(mean_val):
                cv = entity_df[col].std() / mean_val
                feature_importance[col] = abs(cv)
            else:
                feature_importance[col] = 0
        except:
            feature_importance[col] = 0
    
    # Sort and select features with non-zero variance
    sorted_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
    selected_features = [col for col, importance in sorted_features if importance > 0]
    
    # Ensure FREQUENCY is included
    if "FREQUENCY" in entity_df.columns and "FREQUENCY" not in selected_features:
        selected_features.insert(0, "FREQUENCY")
    
    return entity_df, selected_features


def build_entity_dataframe(df, mode, groupby_col=None, sum_cols=None, frequency_cols=None, extra_numeric_cols=None):
    """
    Build entity-level dataframe for anomaly detection.
    Now properly handles user selections in FIXED mode.
    
    Args:
        df: Input dataframe
        mode: "AUTO", "FIXED", or "SEMI_FIXED"
        groupby_col: Column to group by (required for FIXED/SEMI_FIXED)
        sum_cols: List of columns to sum (for FIXED mode)
        frequency_cols: List of columns to count unique values (for FIXED mode)
        extra_numeric_cols: Additional numeric columns (for SEMI_FIXED mode)
    """
    # Make a working copy and remove duplicate columns
    df_fixed = df.clone()
    # Polars doesn't allow duplicate column names by default, so this is handled automatically

    print("DEBUG columns:", df_fixed.columns)

    if mode == "AUTO":
        numeric_cols = [col for col in df.columns if df[col].dtype in pl.NUMERIC_DTYPES]

        # Exclude GST-related and other tax columns
        exclude_keywords = ['gst', 'cgst', 'sgst', 'igst', 'tax', 'vat']
        numeric_cols = [
            col for col in numeric_cols
            if not any(keyword in col.lower() for keyword in exclude_keywords)
        ]

        print(f"📊 Using {len(numeric_cols)} numeric columns (excluded tax columns)")

        # Detect multiple valid group-by columns
        groupby_candidates = detect_multiple_groupby_columns(df, min_entities=3)
        
        if not groupby_candidates:
            raise ValueError("No suitable grouping column found. Please use FIXED mode and select a grouping column manually.")
        
        # Build entity dataframes for all candidates
        results = {}  # {groupby_col: (entity_df, features)}
        
        for groupby_col, uniq_ratio in groupby_candidates:
            try:
                entity_df, features = build_entity_dataframe_for_groupby(df, groupby_col, numeric_cols)
                
                # Validate that we have enough entities (relaxed - allow down to 3)
                if len(entity_df) < 3:
                    print(f"   ⚠️ Skipping '{groupby_col}': Only {len(entity_df)} entities (need at least 3)")
                    continue
                
                # Validate that we have enough features (need at least 2)
                if len(features) < 2:
                    print(f"   ⚠️ Skipping '{groupby_col}': Only {len(features)} features (need at least 2)")
                    continue
                
                results[groupby_col] = (entity_df, features)
                print(f"   ✅ '{groupby_col}': {len(entity_df)} entities, {len(features)} features")
                
            except Exception as e:
                print(f"   ⚠️ Skipping '{groupby_col}': {str(e)}")
                continue
        
        if not results:
            raise ValueError("No valid group-by column configurations found after validation.")
        
        # Return multi-analysis mode indicator with results
        # Return a special indicator that this is multi-entity mode
        print(f"\n✅ AUTO mode: Analyzing {len(results)} entity groupings")
        return results, None, None  # Return dict as first item

    elif mode == "FIXED":
        """
        FIXED mode: User specifies exactly which columns to use
        - groupby_col: Column to group by (e.g., PARTY_NAME, CUSTOMER_ID)
        - sum_cols: Columns to sum up (e.g., QTY, NET_AMT, AMOUNT)
        - frequency_cols: Columns to count unique values (e.g., INVOICE_NO, ORDER_ID)
        """
        if not groupby_col:
            raise ValueError("Groupby column is required for FIXED mode")
        
        if groupby_col not in df.columns:
            raise ValueError(f"Groupby column '{groupby_col}' not found in dataset")
        
        # Validate user selections
        sum_cols = sum_cols or []
        frequency_cols = frequency_cols or []
        
        if not sum_cols and not frequency_cols:
            raise ValueError("Please select at least one Sum column or Frequency column")
        
        # Check if selected columns exist
        missing_sum = [col for col in sum_cols if col not in df.columns]
        missing_freq = [col for col in frequency_cols if col not in df.columns]
        
        if missing_sum:
            raise ValueError(f"Sum columns not found: {', '.join(missing_sum)}")
        if missing_freq:
            raise ValueError(f"Frequency columns not found: {', '.join(missing_freq)}")
        
        print(f"🔧 FIXED mode configuration:")
        print(f"   Group by: {groupby_col}")
        print(f"   Sum columns: {sum_cols}")
        print(f"   Frequency columns: {frequency_cols}")
        
        # Build aggregation list
        agg_exprs = []
        feature_names = []
        
        # Add sum columns
        for col in sum_cols:
            agg_exprs.append(pl.col(col).sum().alias(f"TOTAL_{col}"))
            feature_names.append(f"TOTAL_{col}")
        
        # Add frequency columns (count unique values)
        for col in frequency_cols:
            agg_exprs.append(pl.col(col).n_unique().alias(f"FREQ_{col}"))
            feature_names.append(f"FREQ_{col}")
        
        # Perform aggregation
        entity_df = df.group_by(groupby_col).agg(agg_exprs)
        
        print(f"✅ Created entity dataframe with {len(entity_df)} entities")
        print(f"   Features: {feature_names}")
        
        # Warn if too few entities
        if len(entity_df) < 10:
            print(f"⚠️ Warning: Only {len(entity_df)} unique entities found after grouping by '{groupby_col}'")
            print(f"   Consider selecting a different grouping column with more unique values")
            print(f"   Unique values in '{groupby_col}': {df[groupby_col].n_unique()}")
        
        return entity_df, groupby_col, feature_names

    elif mode == "SEMI_FIXED":
        """
        SEMI_FIXED mode: Requires specific columns (QTY, RATE) + optional extras
        """
        REQUIRED_COLS = ["QTY", "RATE"]
        
        if not groupby_col:
            raise ValueError("Groupby column is required for SEMI_FIXED mode")

        # Check for required columns
        missing = [col for col in REQUIRED_COLS if col not in df.columns]
        if missing:
            raise ValueError(f"SEMI_FIXED mode requires columns: {', '.join(missing)}")

        # Prepare extra columns
        extra_cols = []
        if extra_numeric_cols:
            extra_cols = [
                c for c in extra_numeric_cols
                if c in df.columns and df[c].dtype in pl.NUMERIC_DTYPES
            ]

        # Build aggregation expressions
        agg_exprs = [
            pl.col("QTY").sum().alias("TOTAL_QTY"),
            pl.col("RATE").mean().alias("AVG_RATE")
        ]

        for c in extra_cols:
            agg_exprs.append(pl.col(c).sum())

        entity_df = df.group_by(groupby_col).agg(agg_exprs)

        # Add frequency
        frequency_df = df.group_by(groupby_col).agg(pl.len().alias("FREQUENCY"))
        entity_df = entity_df.join(frequency_df, on=groupby_col, how='left')

        feature_cols = [c for c in entity_df.columns if c != groupby_col]

        print(f"✅ SEMI_FIXED mode: {len(entity_df)} entities, {len(feature_cols)} features")

        return entity_df, groupby_col, feature_cols

    else:
        raise ValueError("MODE must be AUTO, FIXED, or SEMI_FIXED")