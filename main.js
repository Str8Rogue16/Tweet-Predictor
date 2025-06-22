return {
      score: Math.round(score),
      engagement,
      reach,
      analysis: this.generateDetailedAnalysis(score),
      suggestions: this.generateSuggestions(),
      optimalTime: this.getOptimalPostingTime(),
      factors: this.factors
    };
  }

  generateSuggestions() {
    const suggestions = [];
    
    // Length suggestions
    if (this.factors.length.score < 7) {
      if (this.tweet.length < 50) {
        suggestions.push("Consider adding more context or details to make your tweet more engaging");
      } else if (this.tweet.length > 200) {
        suggestions.push("Try shortening your tweet - shorter tweets often get better engagement");
      }
    }
    
    // Hashtag suggestions
    if (this.factors.hashtags.score < 7) {
      const hashtagCount = (this.tweet.match(/#\w+/g) || []).length;
      if (hashtagCount === 0) {
        suggestions.push("Add 1-2 relevant hashtags to increase discoverability");
      } else if (hashtagCount > 3) {
        suggestions.push("Reduce hashtags to 2-3 for better readability and engagement");
      }
    }
    
    // Emoji suggestions
    if (this.factors.emojis.score < 7) {
      const emojiCount = (this.tweet.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
      if (emojiCount === 0) {
        suggestions.push("Add an emoji or two to make your tweet more visually appealing");
      } else if (emojiCount > 3) {
        suggestions.push("Consider reducing emojis for better professional appearance");
      }
    }
    
    // Engagement suggestions
    if (this.factors.engagement.score < 7) {
      suggestions.push("Try asking a question or including a call-to-action to boost engagement");
      suggestions.push("Consider adding words like 'What do you think?' or 'Share your experience'");
    }
    
    // Sentiment suggestions
    if (this.factors.sentiment.score < 7) {
      suggestions.push("Try using more positive or exciting language to improve sentiment");
    }
    
    // Structure suggestions
    if (this.factors.structure.score < 7) {
      suggestions.push("Break up long sentences or add line breaks for better readability");
    }
    
    // General suggestions if score is low
    if (this.calculateOverallScore() < 60) {
      suggestions.push("Consider sharing a personal story or insight to make it more relatable");
      suggestions.push("Try including numbers or statistics if relevant to your topic");
    }
    
    return suggestions.slice(0, 4); // Limit to top 4 suggestions
  }

  analyzeLengthFactor() {
    const length = this.tweet.length;
    let score = 5; // Base score
    
    if (length >= 71 && length <= 100) {
      score = 10; // Sweet spot
    } else if (length >= 50 && length <= 140) {
      score = 8;
    } else if (length >= 140 && length <= 200) {
      score = 7;
    } else if (length < 30) {
      score = 4; // Too short
    } else if (length > 250) {
      score = 3; // Too long
    }
    
    this.factors.length.score = score;
  }

  analyzeHashtagFactor() {
    const hashtags = this.tweet.match(/#\w+/g) || [];
    const count = hashtags.length;
    let score = 5;
    
    if (count === 1 || count === 2) {
      score = 10; // Optimal
    } else if (count === 3) {
      score = 8;
    } else if (count === 0) {
      score = 6; // Missing hashtags
    } else if (count > 3) {
      score = 4; // Too many hashtags
    }
    
    this.factors.hashtags.score = score;
  }

  analyzeEmojiFactor() {
    const emojis = this.tweet.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || [];
    const count = emojis.length;
    let score = 5;
    
    if (count === 1 || count === 2) {
      score = 10; // Good balance
    } else if (count === 3) {
      score = 8;
    } else if (count === 0) {
      score = 6; // No emojis
    } else if (count > 4) {
      score = 4; // Too many emojis
    }
    
    this.factors.emojis.score = score;
  }

  analyzeEngagementFactor() {
    const engagementWords = [
      'what', 'how', 'why', 'when', 'where', 'think', 'thoughts', 'opinion',
      'agree', 'disagree', 'comment', 'share', 'retweet', 'like', 'follow',
      'check out', 'look at', 'see', 'amazing', 'incredible', 'awesome',
      'love', 'hate', 'best', 'worst', 'favorite', 'poll', 'vote', 'choose'
    ];
    
    const questionMarks = (this.tweet.match(/\?/g) || []).length;
    const exclamationMarks = (this.tweet.match(/!/g) || []).length;
    
    let score = 5;
    let engagementWordCount = 0;
    
    engagementWords.forEach(word => {
      if (this.tweet.toLowerCase().includes(word)) {
        engagementWordCount++;
      }
    });
    
    if (questionMarks > 0) score += 2;
    if (exclamationMarks > 0 && exclamationMarks <= 2) score += 1;
    if (engagementWordCount >= 1) score += 2;
    if (engagementWordCount >= 3) score += 1;
    
    this.factors.engagement.score = Math.min(score, 10);
  }

  analyzeSentimentFactor() {
    const positiveWords = [
      'amazing', 'awesome', 'brilliant', 'excellent', 'fantastic', 'great',
      'incredible', 'outstanding', 'perfect', 'wonderful', 'love', 'best',
      'excited', 'thrilled', 'happy', 'successful', 'achievement', 'win',
      'victory', 'breakthrough', 'innovation', 'growth', 'progress'
    ];
    
    const negativeWords = [
      'awful', 'terrible', 'horrible', 'worst', 'hate', 'disgusting',
      'annoying', 'frustrated', 'angry', 'disappointed', 'failed', 'failure',
      'problem', 'issue', 'crisis', 'disaster', 'unfortunate'
    ];
    
    let score = 5;
    let positiveCount = 0;
    let negativeCount = 0;
    
    const lowerTweet = this.tweet.toLowerCase();
    
    positiveWords.forEach(word => {
      if (lowerTweet.includes(word)) positiveCount++;
    });
    
    negativeWords.forEach(word => {
      if (lowerTweet.includes(word)) negativeCount++;
    });
    
    if (positiveCount > negativeCount) {
      score = 8 + Math.min(positiveCount, 2);
    } else if (negativeCount > positiveCount) {
      score = 4 - Math.min(negativeCount, 2);
    }
    
    this.factors.sentiment.score = Math.max(1, Math.min(score, 10));
  }

  analyzeStructureFactor() {
    let score = 5;
    
    // Check for good structure elements
    const sentences = this.tweet.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const hasLineBreaks = this.tweet.includes('\n');
    const hasNumbers = /\d/.test(this.tweet);
    const hasCapitalization = /[A-Z]/.test(this.tweet);
    
    if (sentences.length >= 2 && sentences.length <= 4) score += 2;
    if (hasLineBreaks && this.tweet.length > 100) score += 1;
    if (hasNumbers) score += 1;
    if (hasCapitalization) score += 1;
    
    // Penalize poor structure
    if (this.tweet === this.tweet.toLowerCase()) score -= 2; // All lowercase
    if (this.tweet === this.tweet.toUpperCase()) score -= 3; // All uppercase
    
    this.factors.structure.score = Math.max(1, Math.min(score, 10));
  }

  calculateOverallScore() {
    let weightedSum = 0;
    let totalWeight = 0;
    
    Object.values(this.factors).forEach(factor => {
      weightedSum += factor.score * factor.weight;
      totalWeight += factor.weight;
    });
    
    return (weightedSum / totalWeight) * 10;
  }

  getEngagementLevel(score) {
    if (score >= 80) return 'Very High';
    if (score >= 65) return 'High';
    if (score >= 50) return 'Medium';
    if (score >= 35) return 'Low';
    return 'Very Low';
  }

  getReachLevel(score) {
    if (score >= 80) return 'Viral Potential';
    if (score >= 65) return 'High Reach';
    if (score >= 50) return 'Good Reach';
    if (score >= 35) return 'Limited Reach';
    return 'Low Reach';
  }

  generateDetailedAnalysis(score) {
    const analyses = [];
    
    if (score >= 80) {
      analyses.push("Excellent tweet! This has strong viral potential with great engagement factors.");
    } else if (score >= 65) {
      analyses.push("Strong tweet with good engagement potential. Minor improvements could boost performance.");
    } else if (score >= 50) {
      analyses.push("Decent tweet that should perform reasonably well. Consider the suggestions to improve reach.");
    } else if (score >= 35) {
      analyses.push("This tweet needs improvement in several areas to maximize engagement.");
    } else {
      analyses.push("Significant improvements needed. Consider rewriting with engagement and structure in mind.");
    }
    
    // Add specific factor analysis
    const weakFactors = Object.entries(this.factors)
      .filter(([_, factor]) => factor.score < 6)
      .map(([name, _]) => name);
    
    if (weakFactors.length > 0) {
      analyses.push(`Areas needing improvement: ${weakFactors.join(', ')}.`);
    }
    
    const strongFactors = Object.entries(this.factors)
      .filter(([_, factor]) => factor.score >= 8)
      .map(([name, _]) => name);
    
    if (strongFactors.length > 0) {
      analyses.push(`Strong points: ${strongFactors.join(', ')}.`);
    }
    
    return analyses.join(' ');
  }

  getOptimalPostingTime() {
    const times = [
      "9:00 AM - 10:00 AM (Peak morning engagement)",
      "12:00 PM - 1:00 PM (Lunch break peak)",
      "3:00 PM - 4:00 PM (Afternoon engagement)",
      "7:00 PM - 9:00 PM (Evening social media peak)"
    ];
    
    // Simple logic based on tweet characteristics
    const hasHashtags = (this.tweet.match(/#\w+/g) || []).length > 0;
    const isQuestion = this.tweet.includes('?');
    
    if (isQuestion) {
      return times[3]; // Evening for discussion
    } else if (hasHashtags) {
      return times[1]; // Lunch for discovery
    } else {
      return times[0]; // Morning for general content
    }
  }
}

// === Initialize Application ===
document.addEventListener('DOMContentLoaded', () => {
  // Check if required dependencies are available
  if (typeof authHelpers === 'undefined' || typeof dbHelpers === 'undefined') {
    console.warn('Supabase helpers not found. Make sure supabase-config.js is loaded first.');
  }
  
  window.tweetPredictor = new TweetPredictor();
});

// === Global Demo Functions ===
window.loadDemo = (index) => {
  if (window.tweetPredictor) {
    window.tweetPredictor.loadDemo(index);
  }
};

// === Cleanup on page unload ===
window.addEventListener('beforeunload', () => {
  if (window.tweetPredictor) {
    window.tweetPredictor.destroy();
  }
});
