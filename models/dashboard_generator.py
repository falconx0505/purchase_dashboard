import polars as pl
import numpy as np
from typing import Dict, List, Any
import json


class DashboardGenerator:
    """
    Generates intelligent dashboard configurations based on user prompts.
    Uses Gemini API to understand user requirements and create custom visualizations.
    """
    
    def __init__(self, gemini_explainer=None):
        self.gemini = gemini_explainer
    
    def analyze_data_structure(self, df: pl.DataFrame) -> Dict[str, Any]:
        """
        Analyze the uploaded dataframe to understand its structure and content.
        """
        analysis = {
            'total_rows': len(df),
            'total_columns': len(df.columns),
            'numeric_columns': [],
            'categorical_columns': [],
            'date_columns': [],
            'column_stats': {}
        }
        
        for col in df.columns:
            col_data = df[col].drop_nulls()
            
            if len(col_data) == 0:
                continue
            
            # Check if date column
            if df[col].dtype in [pl.Date, pl.Datetime, pl.Time]:
                analysis['date_columns'].append(col)
                analysis['column_stats'][col] = {
                    'type': 'date',
                    'min': str(col_data.min()),
                    'max': str(col_data.max()),
                    'unique_count': int(col_data.n_unique())
                }
                continue
            
            # Check if numeric
            if df[col].dtype in pl.NUMERIC_DTYPES:
                analysis['numeric_columns'].append(col)
                analysis['column_stats'][col] = {
                    'type': 'numeric',
                    'min': float(col_data.min()),
                    'max': float(col_data.max()),
                    'mean': float(col_data.mean()),
                    'median': float(col_data.median()),
                    'std': float(col_data.std()),
                    'sum': float(col_data.sum())
                }
            else:
                # Categorical
                unique_count = col_data.n_unique()
                unique_ratio = unique_count / len(df)
                
                analysis['categorical_columns'].append(col)
                
                top_values_series = col_data.value_counts().head(10)
                top_values = {str(row[col]): int(row['count']) for row in top_values_series.iter_rows(named=True)}
                
                analysis['column_stats'][col] = {
                    'type': 'categorical',
                    'unique_count': int(unique_count),
                    'unique_ratio': float(unique_ratio),
                    'top_values': top_values
                }
        
        return analysis
    
    def interpret_user_prompt(self, prompt: str, df: pl.DataFrame, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """
        Use Gemini to interpret user's dashboard requirements from their prompt.
        Returns a structured dashboard specification.
        """
        if not self.gemini:
            return {
                "error": "AI interpretation not available. Please configure Gemini API.",
                "suggested_defaults": self._get_default_dashboard_spec(df, analysis)
            }
        
        # Prepare data context for Gemini
        context = {
            'total_rows': len(df),
            'columns': list(df.columns),
            'numeric_columns': analysis['numeric_columns'][:10],
            'categorical_columns': analysis['categorical_columns'][:10],
            'date_columns': analysis['date_columns'],
            'sample_stats': {}
        }
        
        # Add sample statistics
        for col in analysis['numeric_columns'][:5]:
            context['sample_stats'][col] = {
                'mean': float(df[col].mean()),
                'total': float(df[col].sum()),
                'min': float(df[col].min()),
                'max': float(df[col].max())
            }
        
        interpretation_prompt = f"""You are a business intelligence assistant helping create a custom dashboard.

        IMPORTANT:
- You are ONLY allowed to respond with business intelligence specifications.
- If the request is not about business intelligence, dashboards, analytics, KPIs, charts, or data visualization,
  respond with this exact JSON and nothing else:

{{
  "error": "Unsupported request. Only dashboard-related questions are allowed."
}}



USER'S REQUEST:
"{prompt}"

AVAILABLE DATA:
- Total Records: {context['total_rows']:,}
- Columns: {', '.join(context['columns'])}
- Numeric Metrics: {', '.join(context['numeric_columns'])}
- Categories: {', '.join(context['categorical_columns'])}
- Date Columns: {', '.join(context['date_columns']) if context['date_columns'] else 'None'}

SAMPLE STATISTICS:
{json.dumps(context['sample_stats'], indent=2)}

Based on the user's request and available data, create a dashboard specification in JSON format.

RESPOND ONLY WITH VALID JSON in this exact structure:
{{
  "kpis": [
    {{
      "title": "KPI Title",
      "column": "column_name",
      "aggregation": "sum|avg|count|max|min",
      "icon": "indian-rupee|users|activity|trending-up|trending-down",
      "format": "number|currency|percentage"
    }}
  ],
  "charts": [
    {{
      "type": "line|bar|pie|heatmap",
      "title": "Chart Title",
      "x_column": "column_name or null for pie charts",
      "y_columns": ["column1", "column2"],
      "aggregation": "sum|avg|count",
      "group_by": "column_name for grouping",
      "limit": 10 
      #as per user defined limits
    }}
  ],
  "filters": [
    {{
      "column": "column_name",
      "type": "dropdown|date_range|numeric_range"
      
    }}
  ],
  "summary_focus": ["column1", "column2"]
}}

RULES:
1. Only use columns that exist in the available data
2. Create 3-5 KPIs based on what the user wants to track
3. Create 2-4 charts that visualize the key insights requested
4. Match chart types to the data (line for trends, bar for comparisons, pie for distributions)
5. If user mentions specific metrics or categories, prioritize those
6. If user is vague, infer what would be most useful for their apparent business context

Example prompts and interpretations:
- "Monthly revenue trends" → Line chart of revenue by month, total/avg revenue KPIs

Multi-Series (Complex) Queries:
- "Show me monthly sales region wise" → Line or Bar chart: x_column="Date", group_by="Region", y_columns=["Sales"].
- "Compare order count by category per branch" → Bar chart: x_column="Category", group_by="Branch", y_columns=["Order_ID"], aggregation="count".
- "Total amount across years and products" → Line or Bar chart: x_column="Year", group_by="Product", y_columns=["Amount"].

CRITICAL for Multi-Series:
If the user asks for "X by Y per Z" or "X by Y for each Z", ALWAYS set 'group_by' to 'Z' and 'x_column' to 'Y'."""


        try:
            response = self.gemini.client.models.generate_content(
                model=self.gemini.model_name,
                contents=interpretation_prompt,
                config={'temperature': 0.3}  #auto
            )
            
            # Parse JSON response
            response_text = response.text.strip()
            print(f"📝 Gemini Response (first 500 chars): {response_text[:500]}")
            
            # Remove markdown code blocks if present
            if response_text.startswith('```'):
                response_text = response_text.split('```')[1]
                if response_text.startswith('json'):
                    response_text = response_text[4:]
                response_text = response_text.strip()
            
            dashboard_spec = json.loads(response_text)
            
            print(f"✅ Interpreted user request successfully")
            print(f"   KPIs: {len(dashboard_spec.get('kpis', []))}")
            print(f"   Charts: {len(dashboard_spec.get('charts', []))}")
            
            return dashboard_spec
            
        except Exception as e:
            print(f"⚠️ Prompt interpretation error: {str(e)}")
            print(f"   Response text: {response.text if 'response' in locals() else 'No response'}")
            return {
                "error": f"Could not interpret request: {str(e)}",
                "suggested_defaults": self._get_default_dashboard_spec(df, analysis)
            }
    
    def _get_default_dashboard_spec(self, df: pl.DataFrame, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback default dashboard specification"""
        spec = {
            "kpis": [],
            "charts": [],
            "filters": [],
            "summary_focus": analysis['numeric_columns'][:5]
        }
        
        # Add default KPIs
        if analysis['numeric_columns']:
            spec['kpis'].append({
                "title": f"Total {analysis['numeric_columns'][0]}",
                "column": analysis['numeric_columns'][0],
                "aggregation": "sum",
                "icon": "indian-rupee",
                "format": "number"
            })
        
        # Add default chart
        if analysis['categorical_columns'] and analysis['numeric_columns']:
            spec['charts'].append({
                "type": "bar",
                "title": f"{analysis['numeric_columns'][0]} by {analysis['categorical_columns'][0]}",
                "x_column": analysis['categorical_columns'][0],
                "y_columns": [analysis['numeric_columns'][0]],
                "aggregation": "sum",
                "limit": 10
            })
        
        return spec
    
    def generate_kpis_from_spec(self, df: pl.DataFrame, kpi_specs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Generate KPI cards based on user specifications.
        """
        kpis = []
        
        for spec in kpi_specs:
            try:
                column = spec['column']
                if column not in df.columns:
                    continue
                
                # Ensure numeric column
                if df[column].dtype not in pl.NUMERIC_DTYPES:
                    continue
                
                aggregation = spec.get('aggregation', 'sum')
                
                if aggregation == 'sum':
                    value = df[column].sum()
                elif aggregation == 'avg':
                    value = df[column].mean()
                elif aggregation == 'count':
                    value = df[column].count()
                elif aggregation == 'max':
                    value = df[column].max()
                elif aggregation == 'min':
                    value = df[column].min()
                else:
                    value = df[column].sum()
                
                # Handle None/null
                if value is None:
                    value = 0
                
                # Format value
                format_type = spec.get('format', 'number')
                if format_type == 'currency':
                    if value > 1000000:
                        value_str = f"${value/1000000:.2f}M"
                    elif value > 1000:
                        value_str = f"${value/1000:.1f}K"
                    else:
                        value_str = f"${value:,.0f}"
                elif format_type == 'percentage':
                    value_str = f"{value:.1f}%"
                else:
                    value_str = f"{value:,.0f}"
                
                kpis.append({
                    'title': spec['title'],
                    'value': value_str,
                    'icon': spec.get('icon', 'activity')
                })
                
            except Exception as e:
                print(f"   ⚠️ KPI generation error for {spec.get('title')}: {str(e)}")
                continue
        
        return kpis
    
    def generate_charts_from_spec(self, df: pl.DataFrame, chart_specs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Generate chart configurations based on user specifications.
        """
        charts = []
        
        for spec in chart_specs:
            try:
                chart_type = spec['type']
                
                if chart_type == 'line':
                    chart = self._generate_line_chart(df, spec)
                elif chart_type == 'bar':
                    chart = self._generate_bar_chart(df, spec)
                elif chart_type == 'pie':
                    chart = self._generate_pie_chart(df, spec)
                elif chart_type == 'heatmap':
                    chart = self._generate_heatmap(df, spec)
                else:
                    continue
                
                if chart:
                    charts.append(chart)
                    
            except Exception as e:
                print(f"   ⚠️ Chart generation error for {spec.get('title')}: {str(e)}")
                continue
        
        return charts
    
    def _generate_line_chart(self, df: pl.DataFrame, spec: Dict[str, Any]) -> Dict[str, Any]:
        """Generate line chart data with optional group_by support"""
        try:
            x_col = spec['x_column']
            y_cols = spec['y_columns']
            group_by = spec.get('group_by')
            
            if x_col not in df.columns:
                return None
            
            # Validate y_columns are numeric
            y_cols = [col for col in y_cols if col in df.columns and df[col].dtype in pl.NUMERIC_DTYPES]
            if not y_cols:
                return None
            
            df_processed = df.clone()
            
            # If x is date, normalize to month start
            if df_processed[x_col].dtype in [pl.Date, pl.Datetime]:
                df_processed = df_processed.with_columns(
                    pl.col(x_col).dt.strftime('%Y-%m').alias(x_col)
                )
            
            chart_data = []
            final_y_axes = []
            
            if group_by and group_by in df.columns:
                # Multi-series line chart
                y_col = y_cols[0]
                
                # Group and aggregate
                grouped = df_processed.group_by([x_col, group_by]).agg(
                    pl.col(y_col).sum()
                )
                
                # Pivot: rows=x_col, columns=group_by, values=y_col
                pivot_df = grouped.pivot(
                    index=x_col,
                    columns=group_by,
                    values=y_col
                ).fill_null(0)
                
                # Convert to list of dicts
                for row in pivot_df.iter_rows(named=True):
                    record = {'x': str(row[x_col])}
                    for col in pivot_df.columns:
                        if col != x_col:
                            record[str(col)] = float(row[col])
                    chart_data.append(record)
                
                final_y_axes = [col for col in pivot_df.columns if col != x_col]
            else:
                # Single series or multiple metric columns
                grouped = df_processed.group_by(x_col).agg([
                    pl.col(col).sum() for col in y_cols
                ]).sort(x_col)
                
                for row in grouped.iter_rows(named=True):
                    record = {'x': str(row[x_col])}
                    for y_col in y_cols:
                        val = row[y_col]
                        record[y_col] = float(val) if val is not None else 0
                    chart_data.append(record)
                
                final_y_axes = y_cols
            
            return {
                'type': 'line',
                'title': spec['title'],
                'data': chart_data,
                'x_axis': 'x',
                'y_axes': final_y_axes
            }
        except Exception as e:
            print(f"      Line chart error: {str(e)}")
            return None
    
    def _generate_bar_chart(self, df: pl.DataFrame, spec: Dict[str, Any]) -> Dict[str, Any]:
        """Generate bar chart data with optional group_by support"""
        try:
            x_col = spec['x_column']
            y_cols = spec['y_columns']
            group_by = spec.get('group_by')
            aggregation = spec.get('aggregation', 'sum')
            limit = spec.get('limit', 10)
            
            if x_col not in df.columns:
                return None
            
            # Validate y_columns are numeric
            y_cols = [col for col in y_cols if col in df.columns and df[col].dtype in pl.NUMERIC_DTYPES]
            if not y_cols:
                return None
            
            chart_data = []
            final_y_axes = []
            
            if group_by and group_by in df.columns:
                # Multi-series bar chart
                y_col = y_cols[0]
                df_processed = df.clone()
                
                # If x is date, normalize
                if df_processed[x_col].dtype in [pl.Date, pl.Datetime]:
                    df_processed = df_processed.with_columns(
                        pl.col(x_col).dt.strftime('%Y-%m').alias(x_col)
                    )
                
                # Aggregate based on method
                if aggregation == 'sum':
                    grouped = df_processed.group_by([x_col, group_by]).agg(pl.col(y_col).sum())
                elif aggregation == 'avg':
                    grouped = df_processed.group_by([x_col, group_by]).agg(pl.col(y_col).mean())
                else:
                    grouped = df_processed.group_by([x_col, group_by]).agg(pl.col(y_col).count())
                
                # Pivot
                pivot_df = grouped.pivot(
                    index=x_col,
                    columns=group_by,
                    values=y_col
                ).fill_null(0)
                
                # Limit to top N
                if len(pivot_df) > limit:
                    # Calculate total across all columns except x_col
                    value_cols = [col for col in pivot_df.columns if col != x_col]
                    pivot_df = pivot_df.with_columns(
                        pl.sum_horizontal([pl.col(c) for c in value_cols]).alias('total')
                    ).sort('total', descending=True).head(limit).drop('total')
                
                for row in pivot_df.iter_rows(named=True):
                    record = {'category': str(row[x_col])}
                    for col in pivot_df.columns:
                        if col != x_col:
                            record[str(col)] = float(row[col])
                    chart_data.append(record)
                
                final_y_axes = [col for col in pivot_df.columns if col != x_col]
            else:
                # Standard bar chart
                if aggregation == 'sum':
                    grouped = df.group_by(x_col).agg([pl.col(col).sum() for col in y_cols])
                elif aggregation == 'avg':
                    grouped = df.group_by(x_col).agg([pl.col(col).mean() for col in y_cols])
                else:
                    grouped = df.group_by(x_col).agg([pl.col(col).count() for col in y_cols])
                
                grouped = grouped.sort(y_cols[0], descending=True).head(limit)
                
                for row in grouped.iter_rows(named=True):
                    record = {'category': str(row[x_col])}
                    for y_col in y_cols:
                        val = row[y_col]
                        record[y_col] = float(val) if val is not None else 0
                    chart_data.append(record)
                
                final_y_axes = y_cols
            
            return {
                'type': 'bar',
                'title': spec['title'],
                'data': chart_data,
                'x_axis': 'category',
                'y_axes': final_y_axes,
                'is_multi_series': bool(group_by)
            }
        except Exception as e:
            print(f"      Bar chart error: {str(e)}")
            return None
    
    def _generate_pie_chart(self, df: pl.DataFrame, spec: Dict[str, Any]) -> Dict[str, Any]:
        """Generate pie chart data"""
        try:
            group_by = spec.get('group_by')
            y_col = spec['y_columns'][0] if spec['y_columns'] else None
            
            if not group_by or group_by not in df.columns:
                return None
            
            if y_col and y_col in df.columns and df[y_col].dtype in pl.NUMERIC_DTYPES:
                grouped = df.group_by(group_by).agg(pl.col(y_col).sum()).sort(y_col, descending=True).head(8)
                pie_data = [
                    {'name': str(row[group_by]), 'value': int(row[y_col]) if row[y_col] is not None else 0}
                    for row in grouped.iter_rows(named=True)
                ]
            else:
                value_counts = df[group_by].value_counts().head(8)
                pie_data = [
                    {'name': str(row[group_by]), 'value': int(row['count'])}
                    for row in value_counts.iter_rows(named=True)
                ]
            
            return {
                'type': 'pie',
                'title': spec['title'],
                'data': pie_data
            }
        except Exception as e:
            print(f"      Pie chart error: {str(e)}")
            return None
    
    def _generate_heatmap(self, df: pl.DataFrame, spec: Dict[str, Any]) -> Dict[str, Any]:
        """Generate heatmap data"""
        try:
            y_cols = spec['y_columns']
            
            if len(y_cols) < 2:
                return None
            
            # Validate numeric columns
            y_cols = [col for col in y_cols if col in df.columns and df[col].dtype in pl.NUMERIC_DTYPES]
            if len(y_cols) < 2:
                return None
            
            # Calculate correlation matrix using pandas for corr() method
            # Convert to pandas temporarily for correlation calculation
            import pandas as pd
            numeric_df = df.select(y_cols).to_pandas()
            corr_matrix = numeric_df.corr()
            
            heatmap_data = []
            for i, row_name in enumerate(corr_matrix.index):
                for j, col_name in enumerate(corr_matrix.columns):
                    val = corr_matrix.iloc[i, j]
                    heatmap_data.append({
                        'x': col_name,
                        'y': row_name,
                        'value': float(val) if pd.notna(val) else 0
                    })
            
            return {
                'type': 'heatmap',
                'title': spec['title'],
                'data': heatmap_data
            }
        except Exception as e:
            print(f"      Heatmap error: {str(e)}")
            return None
    
    def generate_summary_stats(self, df: pl.DataFrame, focus_columns: List[str]) -> Dict[str, Any]:
        """
        Generate summary statistics focused on specific columns.
        """
        total_nulls = sum(df[col].null_count() for col in df.columns)
        total_cells = len(df) * len(df.columns)
        
        summary = {
            'data_quality': {
                'total_rows': len(df),
                'total_columns': len(df.columns),
                'missing_values': int(total_nulls),
                'duplicate_rows': int(df.is_duplicated().sum()),
                'completeness': f"{(1 - total_nulls / total_cells) * 100:.1f}%"
            },
            'numeric_summary': {},
            'categorical_summary': {}
        }
        
        # Focus on requested columns
        numeric_cols = [col for col in focus_columns if col in df.columns and df[col].dtype in pl.NUMERIC_DTYPES]
        categorical_cols = [col for col in focus_columns if col in df.columns and df[col].dtype not in pl.NUMERIC_DTYPES]
        
        for col in numeric_cols[:5]:
            try:
                col_sum = df[col].sum()
                col_mean = df[col].mean()
                col_min = df[col].min()
                col_max = df[col].max()
                
                summary['numeric_summary'][col] = {
                    'total': float(col_sum) if col_sum is not None else 0,
                    'average': float(col_mean) if col_mean is not None else 0,
                    'min': float(col_min) if col_min is not None else 0,
                    'max': float(col_max) if col_max is not None else 0
                }
            except:
                continue
        
        for col in categorical_cols[:5]:
            try:
                value_counts = df[col].value_counts()
                if len(value_counts) > 0:
                    first_row = value_counts[0]
                    mode_val = first_row[col] if isinstance(first_row, dict) else value_counts.item(0, col)
                    mode_count = first_row['count'] if isinstance(first_row, dict) else value_counts.item(0, 'count')
                else:
                    mode_val = 'N/A'
                    mode_count = 0
                
                summary['categorical_summary'][col] = {
                    'unique_values': int(df[col].n_unique()),
                    'most_common': str(mode_val),
                    'most_common_count': int(mode_count)
                }
            except:
                continue
        
        return summary
    
    def create_dashboard_from_prompt(self, df: pl.DataFrame, user_prompt: str) -> Dict[str, Any]:
        """
        Main method to create dashboard from user prompt.
        """
        print(f"\n📊 Creating custom dashboard from prompt...")
        print(f"   Prompt: {user_prompt[:100]}...")

        
          
        # Analyze data structure
        analysis = self.analyze_data_structure(df)
        print(f" ✓ Analyzed {len(df.columns)} columns")
        
        # Interpret user's requirements
        dashboard_spec = self.interpret_user_prompt(user_prompt, df, analysis)
        
        if "error" in dashboard_spec:
            print(f" ⚠️ {dashboard_spec['error']}")
            dashboard_spec = dashboard_spec.get('suggested_defaults', {})
        
        # Generate components from specification
        kpis = self.generate_kpis_from_spec(df, dashboard_spec.get('kpis', []))
        print(f" ✓ Generated {len(kpis)} KPIs")
        
        charts = self.generate_charts_from_spec(df, dashboard_spec.get('charts', []))
        print(f" ✓ Generated {len(charts)} charts")
        
        summary = self.generate_summary_stats(df, dashboard_spec.get('summary_focus', []))
        print(f" ✓ Compiled summary statistics")
        
        dashboard_config = {
            'kpis': kpis,
            'charts': charts,
            'summary': summary,
            'specification': dashboard_spec,
            'data_analysis': analysis
        }
        
        print("✅ Custom dashboard configuration ready!")
        return dashboard_config