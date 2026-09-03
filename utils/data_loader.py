import polars as pl
import numpy as np


def detect_table_start(df, min_filled_ratio=0.6):
    """Detect the row where actual table data starts."""
    print(f"🔍 Detecting table start (checking first {min(20, len(df))} rows)...")
    
    for i in range(min(20, len(df))):
        # Get row as a slice and count nulls
        row = df[i]
        null_count = sum(row[col].is_null().sum() for col in row.columns)
        total_cols = len(row.columns)
        filled_ratio = 1 - (null_count / total_cols)
        
        print(f"   Row {i}: {filled_ratio:.1%} filled ({total_cols - null_count}/{total_cols} non-null)")
        
        if filled_ratio >= min_filled_ratio:
            print(f"✅ Table starts at row {i}")
            return i
    
    print(f"⚠️ No row met threshold, defaulting to row 0")
    return 0


def load_file(file_obj, filename):
    """
    Load CSV or Excel file with automatic header detection.
    
    Args:
        file_obj: File object from request
        filename: Original filename
    
    Returns:
        polars DataFrame
    """
    try:
        if filename.lower().endswith(".csv"):
            # First pass: detect header row
            raw_df = pl.read_csv(file_obj, has_header=False, n_rows=20)
            start_row = detect_table_start(raw_df)
            
            # Reset file pointer
            file_obj.seek(0)
            
            # Second pass: read with correct header
            df = pl.read_csv(file_obj, skip_rows=start_row)
            
        elif filename.lower().endswith((".xlsx", ".xls")):
            # Read file content into bytes (polars.read_excel expects string path or bytes)
            file_content = file_obj.read()
            
            # First pass: detect header row
            raw_df = pl.read_excel(file_content, has_header=False, read_options={"n_rows": 20})
            
            print(f"\n📋 Preview of first few rows:")
            print(f"   Columns: {raw_df.columns}")
            for i in range(min(5, len(raw_df))):
                row_preview = raw_df[i].to_dicts()[0]
                non_null_values = [v for v in row_preview.values() if v is not None]
                print(f"   Row {i}: {non_null_values[:5]}...")  # Show first 5 non-null values
            
            start_row = detect_table_start(raw_df)
            
            # Second pass: read with correct header
            df = pl.read_excel(
                file_content, 
                sheet_id=1,
                read_options={"skip_rows": start_row}
            )
        else:
            raise ValueError("Unsupported file type. Please upload CSV or Excel file.")
        
        print(f"\n📊 After loading:")
        print(f"   Shape: {df.shape}")
        print(f"   Columns: {df.columns[:10]}...")  # Show first 10 column names
        
        # Clean column names
        df = df.rename({col: str(col).strip() for col in df.columns})
        
        # Remove completely empty rows
        df = df.filter(~pl.all_horizontal(pl.all().is_null()))
        
        # Reset index (polars doesn't have explicit index, but we can add if needed)
        # No need to reset index in polars as it doesn't have an index like pandas
        
        return df
        
    except Exception as e:
        raise ValueError(f"Error loading file: {str(e)}")


def validate_dataframe(df):
    """
    Validate the loaded dataframe.
    
    Args:
        df: polars DataFrame
    
    Returns:
        (success: bool, error_message: str or None)
    """
    if df is None or df.is_empty():
        return False, "Uploaded file is empty"
    
    if df.shape[0] < 10:
        return False, "At least 10 rows required for anomaly detection"
    
    if df.shape[1] < 2:
        return False, "At least 2 columns required"
    
    # Check if there are any non-null values
    total_non_null = sum(df[col].null_count() for col in df.columns)
    total_cells = df.shape[0] * df.shape[1]
    if total_non_null == total_cells:
        return False, "File contains no valid data"
    
    return True, None


def get_column_types(df):
    """
    Classify columns into numeric, text, and numeric-like text.
    
    Args:
        df: polars DataFrame
    
    Returns:
        Dictionary with 'numeric', 'text', and 'numeric_like_text' lists
    """
    # Get numeric columns
    numeric_cols = [col for col in df.columns if df[col].dtype in pl.NUMERIC_DTYPES]
    
    # Get text columns
    text_cols = [col for col in df.columns if df[col].dtype == pl.Utf8 or df[col].dtype == pl.String]

    numeric_like_text = []
    pure_text = []
    
    for col in text_cols:
        # Check if column contains numeric patterns
        try:
            sample = df[col].drop_nulls().head(100)
            numeric_count = sample.cast(pl.Utf8).str.contains(r'^\d+\.?\d*$').sum()
            
            if numeric_count > len(sample) * 0.5:  # More than 50% numeric
                numeric_like_text.append(col)
            else:
                pure_text.append(col)
        except:
            pure_text.append(col)

    return {
        "numeric": numeric_cols,
        "text": pure_text,
        "numeric_like_text": numeric_like_text
    }