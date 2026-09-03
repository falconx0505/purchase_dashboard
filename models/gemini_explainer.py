import os
from google import genai
from typing import List, Dict, Any
import json
import polars as pl  # Added for consistency with the rest of the project


class GeminiExplainer:
    """
    Uses Gemini API to provide crisp, specific explanations of anomalies.
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv('GEMINI_API_KEY')
        if not self.api_key:
            raise ValueError("Gemini API key required. Set GEMINI_API_KEY environment variable.")
        
        self.client = genai.Client(api_key=self.api_key)
        self.model_name = "models/gemini-2.5-flash"
    
    # def explain_all_anomalies(self, anomalies: List[Dict[str, Any]], 
    #                          feature_cols: List[str],
    #                          all_entities_stats: Dict[str, Any],
    #                          id_col: str) -> Dict[str, str]:
    #     """
    #     Generate individual explanations for each anomaly.
    #     Process in small batches for better results.
    #     """
    #     explanations = {}
    #     batch_size = 5
        
    #     print(f"\n🤖 Generating individual explanations for {len(anomalies)} anomalies...")
        
    #     for i in range(0, len(anomalies), batch_size):
    #         batch = anomalies[i:i + batch_size]
    #         batch_num = (i // batch_size) + 1
            
    #         print(f"   Processing batch {batch_num}/{(len(anomalies) + batch_size - 1) // batch_size}...")
            
    #         prompt = self._build_individual_batch_prompt(batch, all_entities_stats, id_col, feature_cols)
            
    #         try:
    #             response = self.client.models.generate_content(
    #                 model=self.model_name,
    #                 contents=prompt,
    #                 config={
    #                     'temperature': 0.3,
    #                 }
    #             )
                
    #             batch_explanations = self._parse_individual_response(response.text, batch, id_col)
    #             explanations.update(batch_explanations)
                
    #             print(f"      ✓ Generated {len(batch_explanations)} explanations")
                
    #         except Exception as e:
    #             print(f"      ✗ Batch {batch_num} failed: {str(e)}")
    #             for anomaly in batch:
    #                 entity_id = str(anomaly.get(id_col))
    #                 explanations[entity_id] = f"Unusual pattern detected for {entity_id}"
        
    #     return explanations
    
    def generate_summary_insights(self, summary: Dict[str, Any], 
                                  anomalies: List[Dict[str, Any]],
                                  feature_cols: List[str]) -> str:
        """
        Generate a simple, easy-to-understand summary.
        """
        anomaly_rate = summary['anomaly_rate']
        total = summary['total_entities']
        strong = summary['strong_anomalies']
        
        feature_analysis = self._analyze_anomaly_patterns(anomalies, feature_cols) if anomalies else ""
        
        prompt = f"""Write a clear summary that's easy to understand but still informative.

DATA:
- Total checked: {total} entities
- Found unusual: {strong} entities ({anomaly_rate}%)
- What we checked: {', '.join(feature_cols[:3])}

TOP EXAMPLES:
{json.dumps(anomalies[:3], indent=2)}

PATTERNS:
{feature_analysis}

Write a 4-5 sentence summary in plain English:

1. Opening: What did we find? Use specific numbers (e.g., "We found 5 customers with order volumes 3-8 times higher than normal")
2. Details: Give a concrete example with actual values (e.g., "For instance, Customer_A ordered 850 units compared to their typical 100 units")
3. Pattern: What's the common thread? (e.g., "All flagged customers show sudden spikes in the last month")
4. Recommendation: What should someone do? One clear action (e.g., "Review these accounts to verify if the orders are legitimate or need investigation")

RULES:
- Use conversational language (avoid words like "deviation", "baseline", "parameters")
- Include real numbers from the data
- Keep sentences under 25 words each
- Write like you're explaining to a colleague, not writing a formal report
- Be specific but not overly technical

Example GOOD summary:
"We found 5 customers ordering way more than usual - between 3 to 8 times their normal amounts. Customer_A ordered 850 units when they typically order around 100 units. All these spikes happened in the past two weeks. You should check these orders to make sure they're real and not data errors."

Example BAD summary:
"Comprehensive analysis reveals statistically significant deviations across multiple entities demonstrating behavioral anomalies that necessitate immediate stakeholder engagement and systematic investigation protocols to ensure data integrity and operational compliance."

Be clear, specific, and helpful."""

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config={'temperature': 0.4}
            )
            summary_text = response.text.strip()
            
            # Validate it's not too complex or too simple
            sentences = summary_text.split('.')
            if any(len(s.split()) > 30 for s in sentences):
                print("⚠️ Summary too complex, using fallback")
                return self._simple_fallback_summary(summary, anomalies, feature_cols)
            
            return summary_text
            
        except Exception as e:
            print(f"⚠️ Summary generation failed: {str(e)}")
            return self._simple_fallback_summary(summary, anomalies, feature_cols)
    
    def answer_question(self, question: str, context: Dict[str, Any]) -> str:
        """Answer user questions simply."""
        sample_anomalies = context.get('sample_anomalies', [])
        
        prompt = f"""Answer this question clearly in 2-3 sentences. Be conversational but informative.

DATA:
- Total: {context.get('total_entities')} entities
- Unusual ones: {context.get('strong_anomalies')} ({context.get('anomaly_rate')}%)
- Checked: {', '.join(context.get('feature_cols', [])[:3])}

EXAMPLES:
{json.dumps(sample_anomalies[:2], indent=2)}

QUESTION: {question}

Give a helpful answer with specific numbers. Explain like you're talking to a colleague."""

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt
            )
            return response.text.strip()
        except Exception as e:
            return f"Couldn't answer: {str(e)}"
    
    def _build_individual_batch_prompt(self, batch: List[Dict[str, Any]], 
                                      stats: Dict[str, Any],
                                      id_col: str,
                                      features: List[str]) -> str:
        """Build prompt for individual anomaly explanations."""
        
        normal_ranges = {}
        for feat in features[:3]:
            if feat in stats:
                normal_ranges[feat] = {
                    'normal': f"{stats[feat]['median']:.1f}",
                    'range': f"{stats[feat]['q25']:.1f}-{stats[feat]['q75']:.1f}"
                }
        
        prompt = f"""Explain each anomaly in ONE simple sentence. Write like you're telling a colleague.

WHAT'S NORMAL:
{json.dumps(normal_ranges, indent=2)}

UNUSUAL ONES:
"""
        
        for i, anomaly in enumerate(batch, 1):
            entity_id = anomaly.get(id_col, 'Unknown')
            
            values = {}
            for feat in features[:3]:
                if feat in anomaly:
                    val = anomaly[feat]
                    if isinstance(val, (int, float)):
                        values[feat] = f"{val:.1f}"
            
            prompt += f"""
{i}. ENTITY: {entity_id}
   VALUES: {json.dumps(values)}
"""
        
        prompt += """
For EACH entity, write EXACTLY this format:

ENTITY: [id]
[Write 2-3 clear sentences: (1) What specific metric is unusual and the actual numbers, (2) Compare to what's normal with a simple ratio or percentage, (3) One sentence about what this might mean in plain English]

Example GOOD:
ENTITY: CUSTOMER_123
This customer ordered 850 units this month. That's 8 times higher than their usual 100 units per month. This could be a bulk purchase, seasonal demand, or possibly a data entry mistake worth checking.

Example BAD:
ENTITY: CUSTOMER_123
This entity demonstrates statistically significant deviation from established baseline parameters across multiple dimensional metrics requiring comprehensive investigation and remediation.

Use PLAIN ENGLISH. Avoid jargon. Be specific with numbers. Keep it conversational."""
        
        return prompt
    
    def _parse_individual_response(self, response_text: str, 
                                  batch: List[Dict[str, Any]],
                                  id_col: str) -> Dict[str, str]:
        """Parse AI response into individual explanations."""
        explanations = {}
        
        parts = response_text.split('ENTITY:')
        
        for part in parts[1:]:
            lines = part.strip().split('\n', 1)
            
            if len(lines) >= 2:
                entity_id = lines[0].strip().replace('*', '').replace(':', '').strip()
                explanation = lines[1].strip()
                
                if explanation and len(explanation) > 10:
                    explanations[entity_id] = explanation
        
        print(f"      Parsed {len(explanations)} explanations from response")
        
        # Fill in missing
        for anomaly in batch:
            entity_id = str(anomaly.get(id_col))
            if entity_id not in explanations:
                found = False
                for key in explanations.keys():
                    if entity_id in key or key in entity_id:
                        explanations[entity_id] = explanations[key]
                        found = True
                        break
                
                if not found:
                    explanations[entity_id] = f"This entity shows unusual activity compared to their normal behavior. Values are outside expected range."
        
        return explanations
    
    def _analyze_anomaly_patterns(self, anomalies: List[Dict[str, Any]], 
                                  features: List[str]) -> str:
        """Analyze common patterns in anomalies."""
        if not anomalies:
            return ""
        
        analysis = []
        
        for feat in features[:2]:
            values = []
            for anomaly in anomalies:
                if feat in anomaly and isinstance(anomaly[feat], (int, float)):
                    values.append(anomaly[feat])
            
            if values:
                avg_val = sum(values) / len(values)
                analysis.append(f"{feat}: average {avg_val:.1f}")
        
        return ', '.join(analysis)
    
    def _simple_fallback_summary(self, summary: Dict[str, Any], 
                                  anomalies: List[Dict[str, Any]],
                                  feature_cols: List[str]) -> str:
        """Create a clear fallback summary."""
        rate = summary['anomaly_rate']
        count = summary['strong_anomalies']
        total = summary['total_entities']
        
        # Get examples
        examples = []
        for anomaly in anomalies[:2]:
            entity_id = list(anomaly.values())[0]
            examples.append(str(entity_id))
        
        if len(examples) == 2:
            examples_text = f"{examples[0]} and {examples[1]}"
        elif len(examples) == 1:
            examples_text = examples[0]
        else:
            examples_text = "several entities"
        
        if rate > 10:
            severity = "significant"
            action = "These should be reviewed right away to verify accuracy"
        elif rate > 5:
            severity = "notable"
            action = "Review these within the next few days"
        else:
            severity = "minor"
            action = "Keep monitoring these in your regular checks"
        
        features_text = " and ".join(feature_cols[:2])
        
        return f"We found {count} out of {total} entities showing unusual patterns ({rate}%). For example, {examples_text} have values that differ significantly from their normal behavior in {features_text}. This represents a {severity} deviation from expected patterns. {action}."