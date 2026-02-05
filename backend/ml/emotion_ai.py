#!/usr/bin/env python3
"""
Emotion AI Engine for BLACKONN
Sentiment analysis and emotional intelligence for customer interactions
"""

import json
import sys
import re
from datetime import datetime
from collections import defaultdict

# ==========================================
# EMOTION AI ENGINE
# ==========================================

class EmotionAIEngine:
    """AI engine for emotional intelligence and sentiment analysis"""
    
    def __init__(self):
        self.model_version = "2.0.0"
        self.emotion_lexicon = self._build_emotion_lexicon()
        self.intensity_modifiers = self._build_intensity_modifiers()
    
    def _build_emotion_lexicon(self):
        """Build emotion word mappings"""
        return {
            'joy': ['happy', 'love', 'excellent', 'amazing', 'wonderful', 'great', 'fantastic', 
                   'awesome', 'perfect', 'beautiful', 'best', 'thank', 'thanks', 'pleased', 'delighted'],
            'trust': ['reliable', 'quality', 'trust', 'recommend', 'professional', 'genuine',
                     'authentic', 'honest', 'dependable', 'consistent', 'safe', 'secure'],
            'anticipation': ['excited', 'waiting', 'eager', 'looking forward', 'can\'t wait', 
                            'hopeful', 'expecting', 'curious'],
            'surprise': ['unexpected', 'surprised', 'wow', 'unbelievable', 'incredible', 
                        'astonished', 'amazed', 'shocked'],
            'sadness': ['disappointed', 'sad', 'unhappy', 'regret', 'sorry', 'miss', 'upset',
                       'let down', 'frustrated', 'dissatisfied'],
            'anger': ['angry', 'furious', 'terrible', 'worst', 'hate', 'awful', 'horrible',
                     'unacceptable', 'outraged', 'disgusted', 'ridiculous', 'scam', 'fraud'],
            'fear': ['worried', 'concerned', 'afraid', 'scared', 'anxious', 'nervous',
                    'uncertain', 'risky', 'dangerous'],
            'disgust': ['gross', 'disgusting', 'nasty', 'repulsive', 'offensive', 'cheap',
                       'fake', 'trash', 'garbage']
        }
    
    def _build_intensity_modifiers(self):
        """Build intensity modifier words"""
        return {
            'amplifiers': ['very', 'extremely', 'incredibly', 'absolutely', 'really', 'so',
                          'totally', 'completely', 'highly', 'super', 'utterly'],
            'diminishers': ['slightly', 'somewhat', 'a bit', 'kind of', 'sort of', 'barely',
                           'hardly', 'a little', 'marginally']
        }
    
    def analyze_sentiment(self, text):
        """Analyze sentiment of text"""
        if not text:
            return {"success": False, "error": "No text provided"}
        
        text_lower = text.lower()
        words = re.findall(r'\b\w+\b', text_lower)
        
        # Count emotions
        emotion_scores = defaultdict(float)
        total_emotion_words = 0
        
        for emotion, keywords in self.emotion_lexicon.items():
            for keyword in keywords:
                count = text_lower.count(keyword)
                if count > 0:
                    emotion_scores[emotion] += count
                    total_emotion_words += count
        
        # Check for intensity modifiers
        intensity_modifier = 1.0
        for amp in self.intensity_modifiers['amplifiers']:
            if amp in text_lower:
                intensity_modifier = 1.3
                break
        for dim in self.intensity_modifiers['diminishers']:
            if dim in text_lower:
                intensity_modifier = 0.7
                break
        
        # Negation detection
        negation_words = ['not', "n't", 'no', 'never', 'neither', 'nobody', 'nothing']
        has_negation = any(neg in text_lower for neg in negation_words)
        
        # Calculate overall sentiment
        positive_emotions = ['joy', 'trust', 'anticipation', 'surprise']
        negative_emotions = ['sadness', 'anger', 'fear', 'disgust']
        
        positive_score = sum(emotion_scores[e] for e in positive_emotions)
        negative_score = sum(emotion_scores[e] for e in negative_emotions)
        
        if has_negation:
            positive_score, negative_score = negative_score * 0.7, positive_score * 0.7
        
        total_score = positive_score + negative_score
        if total_score > 0:
            sentiment_score = (positive_score - negative_score) / total_score
        else:
            sentiment_score = 0
        
        sentiment_score *= intensity_modifier
        sentiment_score = max(-1, min(1, sentiment_score))
        
        # Determine sentiment label
        if sentiment_score > 0.3:
            sentiment_label = "positive"
        elif sentiment_score < -0.3:
            sentiment_label = "negative"
        else:
            sentiment_label = "neutral"
        
        # Get dominant emotion
        dominant_emotion = max(emotion_scores.items(), key=lambda x: x[1])[0] if emotion_scores else "neutral"
        
        return {
            "success": True,
            "sentiment": {
                "score": round(sentiment_score, 3),
                "label": sentiment_label,
                "confidence": min(0.95, 0.5 + abs(sentiment_score) * 0.5)
            },
            "emotions": {k: round(v * intensity_modifier, 2) for k, v in emotion_scores.items() if v > 0},
            "dominantEmotion": dominant_emotion,
            "analysis": {
                "wordCount": len(words),
                "emotionalWords": total_emotion_words,
                "intensity": "high" if intensity_modifier > 1 else ("low" if intensity_modifier < 1 else "normal"),
                "hasNegation": has_negation
            },
            "timestamp": datetime.now().isoformat()
        }
    
    def analyze_customer_feedback(self, feedbacks):
        """Analyze batch of customer feedback"""
        if not feedbacks:
            return {"success": False, "error": "No feedback provided"}
        
        results = []
        emotion_totals = defaultdict(float)
        sentiment_sum = 0
        
        for feedback in feedbacks:
            text = feedback.get('text', feedback) if isinstance(feedback, dict) else feedback
            analysis = self.analyze_sentiment(text)
            
            if analysis['success']:
                results.append({
                    "id": feedback.get('id') if isinstance(feedback, dict) else None,
                    "sentiment": analysis['sentiment']['label'],
                    "score": analysis['sentiment']['score'],
                    "dominantEmotion": analysis['dominantEmotion']
                })
                sentiment_sum += analysis['sentiment']['score']
                for emotion, score in analysis['emotions'].items():
                    emotion_totals[emotion] += score
        
        # Calculate averages
        count = len(results)
        avg_sentiment = sentiment_sum / count if count > 0 else 0
        
        # Determine overall mood
        if avg_sentiment > 0.2:
            overall_mood = "positive"
            recommendation = "Customers are happy - leverage for testimonials"
        elif avg_sentiment < -0.2:
            overall_mood = "negative"
            recommendation = "Address customer concerns urgently"
        else:
            overall_mood = "neutral"
            recommendation = "Improve engagement to boost satisfaction"
        
        return {
            "success": True,
            "summary": {
                "totalFeedback": count,
                "averageSentiment": round(avg_sentiment, 3),
                "overallMood": overall_mood,
                "recommendation": recommendation
            },
            "emotionBreakdown": {k: round(v / count, 2) for k, v in emotion_totals.items()} if count > 0 else {},
            "distribution": {
                "positive": len([r for r in results if r['sentiment'] == 'positive']),
                "neutral": len([r for r in results if r['sentiment'] == 'neutral']),
                "negative": len([r for r in results if r['sentiment'] == 'negative'])
            },
            "details": results[:20],  # Return first 20 for brevity
            "timestamp": datetime.now().isoformat()
        }
    
    def detect_customer_intent(self, message):
        """Detect customer intent from message"""
        if not message:
            return {"success": False, "error": "No message provided"}
        
        message_lower = message.lower()
        
        # Intent patterns
        intents = {
            'purchase': ['buy', 'order', 'purchase', 'add to cart', 'checkout', 'want to get', 'interested in buying'],
            'inquiry': ['price', 'cost', 'how much', 'available', 'stock', 'size', 'color', 'details', 'information'],
            'complaint': ['problem', 'issue', 'broken', 'damaged', 'wrong', 'missing', 'complaint', 'not working'],
            'return': ['return', 'refund', 'exchange', 'send back', 'money back', 'replace'],
            'support': ['help', 'assist', 'support', 'question', 'how do i', 'can you', 'need help'],
            'shipping': ['delivery', 'shipping', 'when will', 'track', 'arrive', 'shipped', 'dispatch'],
            'feedback': ['feedback', 'suggest', 'improve', 'love', 'hate', 'think', 'opinion'],
            'cancellation': ['cancel', 'stop', 'don\'t want', 'change my mind', 'revoke']
        }
        
        detected_intents = []
        for intent, keywords in intents.items():
            for keyword in keywords:
                if keyword in message_lower:
                    detected_intents.append(intent)
                    break
        
        # Get primary intent
        primary_intent = detected_intents[0] if detected_intents else 'general'
        
        # Urgency detection
        urgency_words = ['urgent', 'asap', 'immediately', 'now', 'emergency', 'quickly', 'fast']
        is_urgent = any(word in message_lower for word in urgency_words)
        
        # Get sentiment
        sentiment = self.analyze_sentiment(message)
        
        # Determine priority
        if is_urgent or sentiment['sentiment']['label'] == 'negative':
            priority = "high"
        elif primary_intent in ['complaint', 'return', 'cancellation']:
            priority = "high"
        elif primary_intent in ['support', 'shipping']:
            priority = "medium"
        else:
            priority = "normal"
        
        # Generate response suggestion
        response_templates = {
            'purchase': "Thank you for your interest! I'd be happy to help you complete your purchase.",
            'inquiry': "I'll provide you with the information you need right away.",
            'complaint': "I'm sorry to hear about this issue. Let me help resolve it immediately.",
            'return': "I understand. Let me guide you through our return process.",
            'support': "I'm here to help! What specific assistance do you need?",
            'shipping': "Let me check the status of your order for you.",
            'feedback': "Thank you for your feedback! We really value your input.",
            'cancellation': "I understand. Let me help process this for you.",
            'general': "Thank you for reaching out. How can I assist you today?"
        }
        
        return {
            "success": True,
            "intent": {
                "primary": primary_intent,
                "all": list(set(detected_intents)),
                "confidence": round(0.4 + (0.45 if detected_intents else 0.1), 2)
            },
            "urgency": {
                "isUrgent": is_urgent,
                "priority": priority
            },
            "sentiment": sentiment['sentiment'],
            "suggestedResponse": response_templates.get(primary_intent, response_templates['general']),
            "timestamp": datetime.now().isoformat()
        }
    
    def generate_empathetic_response(self, customer_message, context=None):
        """Generate an empathetic response based on customer emotion"""
        context = context or {}
        
        # Analyze customer emotion
        analysis = self.analyze_sentiment(customer_message)
        intent = self.detect_customer_intent(customer_message)
        
        sentiment = analysis['sentiment']['label']
        dominant_emotion = analysis['dominantEmotion']
        customer_intent = intent['intent']['primary']
        
        # Build empathetic opening
        openings = {
            'positive': {
                'joy': "I'm so glad to hear that! ",
                'trust': "Thank you for your confidence in us! ",
                'anticipation': "We're excited too! ",
                'surprise': "That's wonderful! "
            },
            'negative': {
                'anger': "I completely understand your frustration, and I sincerely apologize. ",
                'sadness': "I'm truly sorry to hear this. ",
                'fear': "I understand your concerns, and let me reassure you. ",
                'disgust': "I deeply apologize for this experience. "
            },
            'neutral': {
                'default': "Thank you for reaching out to us. "
            }
        }
        
        # Select appropriate opening
        if sentiment in openings and dominant_emotion in openings[sentiment]:
            opening = openings[sentiment][dominant_emotion]
        elif sentiment in openings:
            opening = list(openings[sentiment].values())[0]
        else:
            opening = openings['neutral']['default']
        
        # Action phrases based on intent
        actions = {
            'complaint': "Let me personally ensure this is resolved for you right away.",
            'return': "I'll guide you through our hassle-free return process.",
            'inquiry': "I have all the details you need right here.",
            'support': "I'm fully committed to helping you with this.",
            'purchase': "Let me make this purchase as smooth as possible for you.",
            'shipping': "I'll check on this immediately and get you an update.",
            'general': "How can I make your experience better today?"
        }
        
        action = actions.get(customer_intent, actions['general'])
        
        # Build full response
        response = opening + action
        
        return {
            "success": True,
            "response": response,
            "emotionalContext": {
                "customerSentiment": sentiment,
                "dominantEmotion": dominant_emotion,
                "detectedIntent": customer_intent
            },
            "tone": "empathetic" if sentiment == 'negative' else "warm",
            "confidence": round(0.5 + (abs(analysis['sentiment']['score']) * 0.4), 2),
            "timestamp": datetime.now().isoformat()
        }
    
    def analyze_review_emotions(self, reviews):
        """Analyze emotions in product reviews"""
        if not reviews:
            return {"success": False, "error": "No reviews provided"}
        
        emotion_timeline = []
        product_emotions = defaultdict(lambda: defaultdict(float))
        
        for review in reviews:
            text = review.get('text', '')
            product_id = review.get('productId', 'unknown')
            rating = review.get('rating', 3)
            date = review.get('date', datetime.now().isoformat())
            
            analysis = self.analyze_sentiment(text)
            
            # Track by product
            for emotion, score in analysis.get('emotions', {}).items():
                product_emotions[product_id][emotion] += score
            
            emotion_timeline.append({
                "date": date,
                "productId": product_id,
                "rating": rating,
                "sentiment": analysis['sentiment']['score'],
                "emotion": analysis['dominantEmotion']
            })
        
        # Find products needing attention
        products_needing_attention = []
        for product_id, emotions in product_emotions.items():
            negative = emotions.get('anger', 0) + emotions.get('sadness', 0) + emotions.get('disgust', 0)
            positive = emotions.get('joy', 0) + emotions.get('trust', 0)
            
            if negative > positive:
                products_needing_attention.append({
                    "productId": product_id,
                    "negativeScore": round(negative, 2),
                    "positiveScore": round(positive, 2)
                })
        
        products_needing_attention.sort(key=lambda x: x['negativeScore'], reverse=True)
        
        return {
            "success": True,
            "summary": {
                "totalReviews": len(reviews),
                "productsAnalyzed": len(product_emotions)
            },
            "productsNeedingAttention": products_needing_attention[:10],
            "recentEmotions": emotion_timeline[-20:],
            "timestamp": datetime.now().isoformat()
        }


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    engine = EmotionAIEngine()
    
    if len(sys.argv) > 1:
        task = sys.argv[1]
        try:
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            if task == "sentiment":
                result = engine.analyze_sentiment(input_data.get('text', ''))
            elif task == "feedback":
                result = engine.analyze_customer_feedback(input_data.get('feedbacks', []))
            elif task == "intent":
                result = engine.detect_customer_intent(input_data.get('message', ''))
            elif task == "empathy":
                result = engine.generate_empathetic_response(
                    input_data.get('message', ''),
                    input_data.get('context', {})
                )
            elif task == "reviews":
                result = engine.analyze_review_emotions(input_data.get('reviews', []))
            elif task == "status" or task == "health":
                result = {"status": "healthy", "version": engine.model_version}
            else:
                result = {"error": f"Unknown task: {task}"}
            
            print(json.dumps(result))
        except Exception as e:
            import traceback
            print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
    else:
        print(json.dumps({
            "engine": "Emotion AI Engine",
            "version": engine.model_version,
            "tasks": ["sentiment", "feedback", "intent", "empathy", "reviews"],
            "status": "healthy"
        }))
