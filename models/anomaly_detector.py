import numpy as np
import polars as pl
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor


class AnomalyDetector:
    """
    Anomaly detector using Isolation Forest and Local Outlier Factor.
    Improved to handle various dataset structures and edge cases.
    """

    def __init__(self):
        self.scaler = StandardScaler()
        self.imputer = SimpleImputer(strategy="median")

    def detect_anomalies(self, df, feature_cols, mode):
        """
        Detect anomalies using Isolation Forest and LOF.
        
        Args:
            df: DataFrame with entity-level data
            feature_cols: List of feature column names to use for detection
            mode: Detection mode (AUTO, FIXED, SEMI_FIXED)
        
        Returns:
            DataFrame with anomaly detection results
        """
        df = df.clone()
        
        # Validate inputs
        if not feature_cols:
            raise ValueError("No feature columns provided for anomaly detection")
        
        missing_cols = [col for col in feature_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Feature columns not found: {', '.join(missing_cols)}")
        
        n_samples = len(df)
        
        # Check if we have enough data - more lenient now
        if n_samples < 3:
            raise ValueError(f"Need at least 3 entities for anomaly detection. Currently have {n_samples} entities after grouping. Try selecting a different grouping column that creates more groups.")
        
        # Warning for small datasets but continue
        if n_samples < 10:
            print(f"⚠️ Warning: Only {n_samples} entities found. Results may be less reliable with small datasets.")
            print(f"   Consider selecting a grouping column that creates more unique groups.")

        # Preprocess features
        X = df.select(feature_cols).to_numpy()
        
        # Handle missing values
        X = self.imputer.fit_transform(X)
        
        # Check for constant features (no variance)
        feature_variance = np.var(X, axis=0)
        non_constant_features = feature_variance > 1e-10
        
        if not np.any(non_constant_features):
            raise ValueError("All features have constant values (no variation). Cannot detect anomalies. Try selecting different columns or a different grouping column.")
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Configure models based on dataset size and mode
        
        # Adjust contamination based on mode and sample size
        if n_samples < 20:
            # For very small datasets, use fixed contamination
            contamination = min(0.1, 1.0 / n_samples)  # At least 1 potential anomaly
        elif mode in ["FIXED", "SEMI_FIXED"]:
            contamination = "auto"  # 5% expected anomalies
        else:
            contamination = "auto"  # Let algorithm decide
        
        # Adjust n_neighbors for LOF based on dataset size
        # For small datasets: use max(2, n_samples // 3)
        # For larger datasets: use 5-10% of samples, but between 5 and 50
        if n_samples < 10:
            n_neighbors = max(2, n_samples // 3)
        else:
            n_neighbors = min(50, max(5, int(n_samples * 0.1)))
        
        n_neighbors = min(n_neighbors, n_samples - 1)  # Must be less than n_samples
        
        print(f"🔧 Model configuration:")
        print(f"   Samples: {n_samples}")
        print(f"   Features: {len(feature_cols)}")
        print(f"   Contamination: {contamination}")
        print(f"   LOF neighbors: {n_neighbors}")

        # Isolation Forest
        try:
            iso = IsolationForest(
                contamination=contamination,
                random_state=42,
                n_estimators=min(100, max(50, n_samples * 2))  # Adjust estimators for small datasets
            )
            iso_predictions = iso.fit_predict(X_scaled)
            df = df.with_columns(pl.Series("ISO", iso_predictions == -1))
        except Exception as e:
            print(f"⚠️ Isolation Forest failed: {str(e)}")
            # Fallback: use simple statistical approach
            df = df.with_columns(pl.Series("ISO", self._simple_statistical_anomaly(X_scaled)))

        # Local Outlier Factor
        try:
            lof = LocalOutlierFactor(
                contamination=min(0.1, contamination + 0.05),  # Slightly more lenient for LOF
                n_neighbors=n_neighbors
            )
            lof_predictions = lof.fit_predict(X_scaled)
            df = df.with_columns(pl.Series("LOF", lof_predictions == -1))
        except Exception as e:
            print(f"⚠️ LOF failed: {str(e)}")
            # Fallback: use simple statistical approach
            df = df.with_columns(pl.Series("LOF", self._simple_statistical_anomaly(X_scaled)))

        # For small datasets, be more lenient with anomaly detection
        if n_samples < 10:
            # Strong anomaly = detected by at least one method (not both)
            df = df.with_columns(
                (pl.col("ISO") | pl.col("LOF")).alias("STRONG_ANOMALY")
            )
        else:
            # Strong anomaly = detected by both methods
            df = df.with_columns(
                (pl.col("ISO") & pl.col("LOF")).alias("STRONG_ANOMALY")
            )

        # Backward compatibility
        df = df.with_columns([
            pl.col("ISO").alias("ISO_ANOMALY"),
            pl.col("LOF").alias("LOF_ANOMALY")
        ])
        
        # Log results
        iso_count = int(df["ISO"].sum())
        lof_count = int(df["LOF"].sum())
        strong_count = int(df["STRONG_ANOMALY"].sum())
        
        print(f"📊 Detection results:")
        print(f"   Isolation Forest: {iso_count} anomalies")
        print(f"   LOF: {lof_count} anomalies")
        print(f"   Strong (combined): {strong_count} anomalies")
        
        if strong_count == 0:
            print(f"✅ No anomalies detected - all entities appear normal!")

        return df

    def _simple_statistical_anomaly(self, X_scaled):
        """
        Fallback method: simple statistical anomaly detection using z-scores.
        Used when ML models fail on very small datasets.
        """
        # Calculate z-scores for each feature
        z_scores = np.abs(X_scaled)
        # Mark as anomaly if any feature has z-score > 2.5
        anomalies = np.any(z_scores > 2.5, axis=1)
        return anomalies

    def explain_anomalies(self, df, feature_cols):
        """
        Generate simple, natural language explanations for each anomaly.
        
        Args:
            df: DataFrame with anomaly detection results
            feature_cols: List of feature column names
        
        Returns:
            DataFrame with REASON and ANOMALY_REASON columns added
        """
        reasons = []
        
        # Calculate statistics for each feature
        stats = {}
        for col in feature_cols:
            try:
                stats[col] = {
                    'median': df[col].median(),
                    'mean': df[col].mean(),
                    'std': df[col].std(),
                    'q25': df[col].quantile(0.25),
                    'q75': df[col].quantile(0.75),
                    'min': df[col].min(),
                    'max': df[col].max()
                }
            except:
                stats[col] = {
                    'median': 0,
                    'mean': 0,
                    'std': 0,
                    'q25': 0,
                    'q75': 0,
                    'min': 0,
                    'max': 0
                }

        # Iterate through rows
        for row in df.iter_rows(named=True):
            if not row["STRONG_ANOMALY"]:
                reasons.append("This looks normal - no issues detected")
                continue

            issues = []
            
            for col in feature_cols:
                try:
                    value = row[col]
                    median = stats[col]['median']
                    mean = stats[col]['mean']
                    std = stats[col]['std']
                    q75 = stats[col]['q75']
                    q25 = stats[col]['q25']
                    col_max = stats[col]['max']
                    col_min = stats[col]['min']
                    
                    # Skip if no variation in data or invalid values
                    if std == 0 or (value is None) or (isinstance(value, float) and np.isnan(value)):
                        continue
                    
                    # Clean column name for display
                    col_name = col.replace('TOTAL_', '').replace('FREQ_', '').replace('_', ' ').title()
                    
                    # For small datasets, use simpler comparisons
                    if len(df) < 10:
                        # Compare to max/min
                        if value == col_max and value > median * 1.5:
                            issues.append(f"{col_name} is the highest value in the dataset")
                        elif value == col_min and value < median * 0.7:
                            issues.append(f"{col_name} is the lowest value in the dataset")
                        elif value > mean + 2 * std:
                            issues.append(f"{col_name} is much higher than average")
                        elif value < mean - 2 * std:
                            issues.append(f"{col_name} is much lower than average")
                    else:
                        # Standard comparisons for larger datasets
                        if median > 0:
                            if value > median * 3:
                                times = round(value / median, 1)
                                issues.append(f"{col_name} is way too high (about {times}x more than usual)")
                            elif value > median * 2:
                                times = round(value / median, 1)
                                issues.append(f"{col_name} is much higher than normal (about {times}x the usual amount)")
                            elif value > q75 * 1.5:
                                issues.append(f"{col_name} is higher than expected")
                            elif value < median * 0.3:
                                issues.append(f"{col_name} is way too low (much less than usual)")
                            elif value < median * 0.5:
                                issues.append(f"{col_name} is much lower than normal")
                except:
                    continue

            # Build simple, conversational explanation
            if len(issues) == 0:
                explanation = "⚠️ This entity shows an unusual pattern that doesn't match typical behavior"
            elif len(issues) == 1:
                explanation = f"⚠️ Issue found: {issues[0]}"
            elif len(issues) == 2:
                explanation = f"⚠️ Issues found: {issues[0]}, and {issues[1]}"
            else:
                main_issues = issues[:2]
                remaining = len(issues) - 2
                explanation = f"⚠️ Multiple issues: {main_issues[0]}, {main_issues[1]}, plus {remaining} more unusual pattern(s)"

            reasons.append(explanation)

        df = df.with_columns(pl.Series("REASON", reasons))
        df = df.with_columns(pl.col("REASON").alias("ANOMALY_REASON"))
        return df

    def summary(self, df):
        """
        Generate summary statistics for the anomaly detection results.
        Required by frontend.
        
        Args:
            df: DataFrame with anomaly detection results
        
        Returns:
            Dictionary with summary statistics
        """
        total = len(df)
        iso_count = int(df["ISO_ANOMALY"].sum()) if "ISO_ANOMALY" in df.columns else 0
        lof_count = int(df["LOF_ANOMALY"].sum()) if "LOF_ANOMALY" in df.columns else 0
        strong_count = int(df["STRONG_ANOMALY"].sum()) if "STRONG_ANOMALY" in df.columns else 0

        anomaly_rate = round((strong_count / total * 100) if total > 0 else 0, 2)

        return {
            # Original keys (frontend safe)
            "total_entities": total,
            "iso_anomalies": iso_count,
            "lof_anomalies": lof_count,
            "strong_anomalies": strong_count,
            "anomaly_rate": anomaly_rate,

            # Explainable summary (NEW, OPTIONAL)
            "explanation": {
                "what_was_analyzed": f"{total} entities were analyzed for abnormal behavior.",
                "isolation_forest": f"{iso_count} entities showed unusual patterns globally.",
                "local_outlier_factor": f"{lof_count} entities behaved differently compared to their neighbors.",
                "strong_anomalies": f"{strong_count} entities were confirmed as anomalies by both models.",
                "risk_level": (
                    "High" if anomaly_rate > 10 else
                    "Medium" if anomaly_rate > 5 else
                    "Low"
                ),
                "interpretation": (
                    f"{anomaly_rate}% of entities show strong anomalous behavior "
                    "and may require further investigation."
                )
            }
        }