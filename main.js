// === Enhanced Tweet Performance Predictor with Supabase Integration ===
// Import Supabase helpers (assumes supabase-config.js is loaded)
// Make sure to include: <script src="supabase-config.js"></script> before this file

import { authHelpers, dbHelpers, initAuthListener } from './supabase-config.js'

class TweetPredictor {
  constructor() {
    this.config = {
      maxTweetLength: 280,
      analysisDelay: 2000
    };

    this.state = {
      currentUser: null,
      userProfile: null,
      analysisHistory: [],
      isAnalyzing: false,
      isLoading: false
    };

    this.elements = {};
    this.eventHandlers = new Map();
    
    this.init();
  }

  // === Core Initialization ===
  async init() {
    try {
      this.injectSchemas();
      this.cacheElements();
      this.setupEventListeners();
      
      // Initialize Supabase auth listener
      this.initSupabaseAuth();
      
      // Check for existing session
      await this.checkExistingSession();
      
      console.log('Tweet Predictor with Supabase initialized successfully');
    } catch (error) {
      this.handleError('Failed to initialize application', error);
    }
  }

  // === Supabase Authentication Integration ===
  initSupabaseAuth() {
    if (typeof initAuthListener === 'function') {
      initAuthListener();
    }

    // Override the global auth handlers to use our methods
    window.handleSignIn = this.handleSupabaseSignIn.bind(this);
    window.handleSignOut = this.handleSupabaseSignOut.bind(this);
  }

  async checkExistingSession() {
    try {
      const { session, error } = await authHelpers.getSession();
      if (error) {
        console.error('Error checking session:', error);
        return;
      }

      if (session?.user) {
        await this.handleSupabaseSignIn(session.user);
      } else {
        this.updateUI();
      }
    } catch (error) {
      console.error('Error checking existing session:', error);
    }
  }

  async handleSupabaseSignIn(user) {
    try {
      this.state.currentUser = user;
      
      // Load user profile from Supabase
      await this.loadUserProfile();
      
      // Load analysis history
      await this.loadAnalysisHistory();
      
      this.updateUI();
      
      // Log the sign-in action
      if (typeof dbHelpers !== 'undefined') {
        await dbHelpers.logUserAction(user.id, 'sign_in');
      }
      
    } catch (error) {
      this.handleError('Error handling sign in', error);
    }
  }

  async handleSupabaseSignOut() {
    this.state.currentUser = null;
    this.state.userProfile = null;
    this.state.analysisHistory = [];
    this.updateUI();
    this.hideResults();
  }

  async loadUserProfile() {
    if (!this.state.currentUser || typeof dbHelpers === 'undefined') return;

    try {
      const { data: profile, error } = await dbHelpers.getUserProfile(this.state.currentUser.id);
      if (error) {
        console.error('Error loading user profile:', error);
        return;
      }
      
      this.state.userProfile = profile;
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }

  async loadAnalysisHistory() {
    if (!this.state.currentUser || typeof dbHelpers === 'undefined') return;

    try {
      const { data: analyses, error } = await dbHelpers.getAnalysisHistory(this.state.currentUser.id, 10);
      if (error) {
        console.error('Error loading analysis history:', error);
        return;
      }
      
      this.state.analysisHistory = analyses || [];
    } catch (error) {
      console.error('Error loading analysis history:', error);
    }
  }

  // === Authentication Handlers ===
  async handleLogin() {
    const credentials = this.getLoginCredentials();
    if (!this.validateLoginInput(credentials)) return;

    const messageEl = document.getElementById('loginMessage');
    
    try {
      this.showLoading('loginSpinner', 'loginBtnText', 'Signing In...');
      
      const { data, error } = await authHelpers.signIn(credentials.email, credentials.password);
      
      if (error) {
        throw new Error(error.message);
      }
      
      this.showMessage(messageEl, 'Login successful!', 'success');
      
      setTimeout(() => {
        this.hideAuthModal();
      }, 1000);
      
    } catch (error) {
      this.showMessage(messageEl, error.message, 'error');
    } finally {
      this.hideLoading('loginSpinner', 'loginBtnText', 'Sign In');
    }
  }

  async handleRegister() {
    const userData = this.getRegistrationData();
    if (!this.validateRegistrationInput(userData)) return;

    const messageEl = document.getElementById('registerMessage');
    
    try {
      this.showLoading('registerSpinner', 'registerBtnText', 'Creating Account...');
      
      const { data, error } = await authHelpers.signUp(userData.email, userData.password, userData.name);
      
      if (error) {
        throw new Error(error.message);
      }
      
      this.showMessage(messageEl, 'Account created! Please check your email to verify your account.', 'success');
      
      setTimeout(() => {
        this.hideAuthModal();
      }, 3000);
      
    } catch (error) {
      this.showMessage(messageEl, error.message, 'error');
    } finally {
      this.hideLoading('registerSpinner', 'registerBtnText', 'Create Account');
    }
  }

  async handleSignOut() {
    try {
      const { error } = await authHelpers.signOut();
      if (error) {
        console.error('Error signing out:', error);
      }
    } catch (error) {
      console.error('Error during sign out:', error);
    }
  }

  // === Tweet Analysis System ===
  async analyzeTweet() {
    if (!this.state.currentUser) {
      this.showAuthModal();
      return;
    }

    const tweet = this.elements.tweetInput?.value?.trim();
    if (!tweet || tweet.length > this.config.maxTweetLength) {
      this.showMessage(null, 'Please enter a valid tweet', 'error');
      return;
    }

    // Check if user can perform analysis
    const canAnalyze = await this.canUserAnalyze();
    if (!canAnalyze.allowed) {
      this.showMessage(null, canAnalyze.message, 'error');
      return;
    }

    try {
      this.state.isAnalyzing = true;
      this.showLoading('btnSpinner', 'btnText', 'Analyzing...');

      // Perform the analysis
      const analyzer = new TweetAnalyzer(tweet);
      const analysis = analyzer.analyze();

      // Consume analysis credit
      if (typeof dbHelpers !== 'undefined') {
        await dbHelpers.consumeAnalysisCredit(this.state.currentUser.id);
      }

      // Save analysis to database
      await this.saveAnalysisToDatabase(tweet, analysis);

      // Display results
      this.displayResults(analysis);

      // Refresh user profile and history
      await this.loadUserProfile();
      await this.loadAnalysisHistory();

      // Log the analysis action
      if (typeof dbHelpers !== 'undefined') {
        await dbHelpers.logUserAction(this.state.currentUser.id, 'tweet_analysis', {
          tweet_length: tweet.length,
          score: analysis.score
        });
      }

    } catch (error) {
      this.handleError('Analysis failed', error);
    } finally {
      this.state.isAnalyzing = false;
      this.hideLoading('btnSpinner', 'btnText', 'Analyze Tweet');
      this.updateUI();
    }
  }

  async canUserAnalyze() {
    if (!this.state.currentUser || typeof dbHelpers === 'undefined') {
      return { allowed: false, message: 'Please sign in to analyze tweets' };
    }

    try {
      const { canAnalyze, remainingAnalyses, packAnalyses, planType, error } = 
        await dbHelpers.canPerformAnalysis(this.state.currentUser.id);

      if (error) {
        return { allowed: false, message: 'Error checking analysis limit' };
      }

      if (!canAnalyze) {
        let message = 'Analysis limit reached!';
        
        if (planType === 'free') {
          message = 'Daily limit reached! You can analyze 3 tweets per day on the free plan.';
        } else if (planType === 'pack') {
          message = 'Pack analyses exhausted! Please purchase another pack or upgrade to Pro.';
        }
        
        return { allowed: false, message };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking analysis permission:', error);
      return { allowed: false, message: 'Error checking analysis limit' };
    }
  }

  async saveAnalysisToDatabase(tweet, analysis) {
    if (!this.state.currentUser || typeof dbHelpers === 'undefined') return;

    try {
      const analysisData = {
        tweetContent: tweet,
        overallScore: analysis.score,
        engagementLevel: analysis.engagement,
        reachLevel: analysis.reach,
        detailedAnalysis: analysis.analysis,
        suggestions: analysis.suggestions,
        optimalPostingTime: analysis.optimalTime,
        metadata: {
          factors: analysis.factors,
          timestamp: new Date().toISOString()
        }
      };

      const { data, error } = await dbHelpers.saveTweetAnalysis(this.state.currentUser.id, analysisData);
      
      if (error) {
        console.error('Error saving analysis:', error);
      }
    } catch (error) {
      console.error('Error saving analysis to database:', error);
    }
  }

  // === UI Management ===
  updateUI() {
    this.updateAuthUI();
    this.updateUsageDisplay();
    this.updateTweetInput();
    this.updateHistoryDisplay();
  }

  updateAuthUI() {
    const isAuthenticated = !!this.state.currentUser;
    
    this.toggleElement(this.elements.userInfo, isAuthenticated);
    this.toggleElement(this.elements.signInHeader, !isAuthenticated);
    
    if (isAuthenticated) {
      this.elements.protectedWrapper?.classList.remove('protected-content');
      this.elements.accessOverlay && (this.elements.accessOverlay.style.display = 'none');
      
      const displayName = this.state.currentUser.user_metadata?.full_name || 
                          this.state.currentUser.email?.split('@')[0] || 
                          'User';
      this.elements.userDisplay && (this.elements.userDisplay.textContent = `Welcome, ${displayName}`);
    } else {
      this.elements.protectedWrapper?.classList.add('protected-content');
      this.elements.accessOverlay && (this.elements.accessOverlay.style.display = 'block');
    }
  }

  updateUsageDisplay() {
    if (!this.elements.usageCount) return;

    if (!this.state.currentUser) {
      this.elements.usageCount.textContent = 'Sign in to track usage';
      this.elements.usageCount.className = 'text-sm text-slate-600';
      return;
    }

    if (!this.state.userProfile) {
      this.elements.usageCount.textContent = 'Loading usage...';
      this.elements.usageCount.className = 'text-sm text-slate-600';
      return;
    }

    const profile = this.state.userProfile;
    let usageText = '';
    let className = 'text-sm text-slate-600';

    if (profile.plan_type === 'free') {
      const remaining = profile.analyses_remaining || 0;
      usageText = `${remaining}/3 free analyses remaining today`;
      if (remaining === 0) className = 'text-sm text-red-600';
    } else if (profile.plan_type === 'pack') {
      const remaining = profile.pack_analyses_remaining || 0;
      usageText = `${remaining} analyses remaining in pack`;
      if (remaining <= 5) className = 'text-sm text-orange-600';
      if (remaining === 0) className = 'text-sm text-red-600';
    } else if (profile.plan_type === 'pro') {
      usageText = 'Unlimited analyses (Pro plan)';
      className = 'text-sm text-green-600';
    }

    this.elements.usageCount.textContent = usageText;
    this.elements.usageCount.className = className;
  }

  updateHistoryDisplay() {
    const container = document.getElementById('historyList');
    if (!container) return;

    if (!this.state.analysisHistory || this.state.analysisHistory.length === 0) {
      this.elements.historySection?.classList.add('hidden');
      return;
    }

    container.innerHTML = '';
    
    this.state.analysisHistory.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item p-4 rounded-lg border border-gray-200 mb-3';
      div.innerHTML = this.getHistoryItemHTML(item);
      container.appendChild(div);
    });

    this.elements.historySection?.classList.remove('hidden');
  }

  getHistoryItemHTML(item) {
    const date = new Date(item.created_at).toLocaleDateString();
    const truncatedTweet = item.tweet_content.length > 80 
      ? item.tweet_content.substring(0, 80) + '...' 
      : item.tweet_content;

    return `
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <p class="text-slate-800 mb-2 font-medium">"${truncatedTweet}"</p>
          <div class="flex items-center space-x-4 text-sm text-slate-600">
            <span>${date}</span>
            <span>Engagement: ${item.engagement_level}</span>
            <span>Reach: ${item.reach_level}</span>
          </div>
        </div>
        <div class="score-circle w-12 h-12 ml-4 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
          <span class="text-white font-bold text-sm">${item.overall_score}</span>
        </div>
      </div>
    `;
  }

  // === Element Caching and Event Handling ===
  cacheElements() {
    const elementIds = [
      'authModal', 'protectedWrapper', 'accessOverlay', 'tweetInput',
      'tweetPreview', 'charCount', 'analyzeBtn', 'resultsSection',
      'historySection', 'usageCount', 'closeAuthModal', 'signInHeader',
      'overlaySignUp', 'userInfo', 'userDisplay', 'signOutBtn'
    ];

    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (!element) {
        console.warn(`Element with id '${id}' not found`);
      }
      this.elements[id] = element;
    });

    // Cache form elements
    this.elements.authTabs = document.querySelectorAll('.auth-tab');
    this.elements.authForms = {
      login: document.getElementById('loginForm'),
      register: document.getElementById('registerForm')
    };
  }

  setupEventListeners() {
    const handlers = [
      { element: this.elements.tweetInput, event: 'input', handler: this.handleTweetInput.bind(this) },
      { element: this.elements.analyzeBtn, event: 'click', handler: this.analyzeTweet.bind(this) },
      { element: this.elements.signInHeader, event: 'click', handler: this.showAuthModal.bind(this) },
      { element: this.elements.overlaySignUp, event: 'click', handler: this.showAuthModal.bind(this) },
      { element: this.elements.closeAuthModal, event: 'click', handler: this.hideAuthModal.bind(this) },
      { element: this.elements.signOutBtn, event: 'click', handler: this.handleSignOut.bind(this) },
      { element: this.elements.authModal, event: 'click', handler: this.handleModalBackdrop.bind(this) }
    ];

    handlers.forEach(({ element, event, handler }) => {
      if (element) {
        element.addEventListener(event, handler);
        this.eventHandlers.set(`${element.id}-${event}`, { element, event, handler });
      }
    });

    // Auth tabs
    this.elements.authTabs?.forEach(tab => {
      const handler = () => this.switchAuthTab(tab.dataset.tab);
      tab.addEventListener('click', handler);
      this.eventHandlers.set(`${tab.dataset.tab}-click`, { element: tab, event: 'click', handler });
    });

    // Auth buttons
    this.setupAuthButtonListeners();
  }

  setupAuthButtonListeners() {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');

    if (loginBtn) {
      const handler = this.handleLogin.bind(this);
      loginBtn.addEventListener('click', handler);
      this.eventHandlers.set('loginBtn-click', { element: loginBtn, event: 'click', handler });
    }

    if (registerBtn) {
      const handler = this.handleRegister.bind(this);
      registerBtn.addEventListener('click', handler);
      this.eventHandlers.set('registerBtn-click', { element: registerBtn, event: 'click', handler });
    }
  }

  // === Input Validation and Helpers ===
  getLoginCredentials() {
    return {
      email: document.getElementById('loginEmail')?.value?.trim() || '',
      password: document.getElementById('loginPassword')?.value || ''
    };
  }

  getRegistrationData() {
    return {
      name: document.getElementById('registerName')?.value?.trim() || '',
      email: document.getElementById('registerEmail')?.value?.trim() || '',
      password: document.getElementById('registerPassword')?.value || '',
      confirmPassword: document.getElementById('confirmPassword')?.value || ''
    };
  }

  validateLoginInput({ email, password }) {
    const messageEl = document.getElementById('loginMessage');
    
    if (!email || !password) {
      this.showMessage(messageEl, 'Please fill in all fields', 'error');
      return false;
    }
    
    if (!this.isValidEmail(email)) {
      this.showMessage(messageEl, 'Please enter a valid email address', 'error');
      return false;
    }
    
    return true;
  }

  validateRegistrationInput({ name, email, password, confirmPassword }) {
    const messageEl = document.getElementById('registerMessage');
    
    if (!name || !email || !password || !confirmPassword) {
      this.showMessage(messageEl, 'Please fill in all fields', 'error');
      return false;
    }
    
    if (!this.isValidEmail(email)) {
      this.showMessage(messageEl, 'Please enter a valid email address', 'error');
      return false;
    }
    
    if (password.length < 8) {
      this.showMessage(messageEl, 'Password must be at least 8 characters', 'error');
      return false;
    }
    
    if (password !== confirmPassword) {
      this.showMessage(messageEl, 'Passwords do not match', 'error');
      return false;
    }
    
    return true;
  }

  // === Tweet Input Handling ===
  handleTweetInput() {
    this.updateTweetInput();
  }

  updateTweetInput() {
    if (!this.elements.tweetInput) return;
    
    this.updateCharCount();
    this.updateTweetPreview();
    this.updateAnalyzeButton();
  }

  updateCharCount() {
    if (!this.elements.charCount || !this.elements.tweetInput) return;
    
    const count = this.elements.tweetInput.value.length;
    this.elements.charCount.textContent = `${count}/${this.config.maxTweetLength}`;
    this.elements.charCount.className = count > this.config.maxTweetLength 
      ? 'text-sm text-red-500' 
      : 'text-sm text-slate-500';
  }

  updateTweetPreview() {
    if (!this.elements.tweetPreview || !this.elements.tweetInput) return;
    
    const text = this.elements.tweetInput.value || "What's happening?";
    this.elements.tweetPreview.textContent = text;
  }

  updateAnalyzeButton() {
    if (!this.elements.analyzeBtn || !this.elements.tweetInput) return;
    
    const hasText = this.elements.tweetInput.value.trim().length > 0;
    const withinLimit = this.elements.tweetInput.value.length <= this.config.maxTweetLength;
    const canAnalyze = hasText && withinLimit && this.state.currentUser && !this.state.isAnalyzing;
    
    this.elements.analyzeBtn.disabled = !canAnalyze;
  }

  // === Results Display ===
  displayResults(analysis) {
    // Update score display
    const scoreElement = document.getElementById('overallScore');
    if (scoreElement) {
      scoreElement.textContent = analysis.score;
    }

    // Update engagement level
    const engagementElement = document.getElementById('engagementLevel');
    if (engagementElement) {
      engagementElement.textContent = analysis.engagement;
    }

    // Update reach level
    const reachElement = document.getElementById('reachLevel');
    if (reachElement) {
      reachElement.textContent = analysis.reach;
    }

    // Update detailed analysis
    const analysisElement = document.getElementById('detailedAnalysis');
    if (analysisElement) {
      analysisElement.textContent = analysis.analysis;
    }

    // Update suggestions
    const suggestionsElement = document.getElementById('suggestionsList');
    if (suggestionsElement && analysis.suggestions) {
      suggestionsElement.innerHTML = analysis.suggestions
        .map(suggestion => `<li class="mb-2">${suggestion}</li>`)
        .join('');
    }

    // Update optimal time
    const optimalTimeElement = document.getElementById('optimalTime');
    if (optimalTimeElement) {
      optimalTimeElement.textContent = analysis.optimalTime;
    }

    this.showResults();
  }

  // === Modal Management ===
  showAuthModal() {
    this.elements.authModal?.classList.remove('hidden');
  }

  hideAuthModal() {
    this.elements.authModal?.classList.add('hidden');
    this.clearAuthForms();
  }

  switchAuthTab(tab) {
    this.elements.authTabs?.forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

    Object.entries(this.elements.authForms).forEach(([formType, form]) => {
      if (form) {
        form.classList.toggle('hidden', formType !== tab);
      }
    });
  }

  handleModalBackdrop(e) {
    if (e.target === this.elements.authModal) {
      this.hideAuthModal();
    }
  }

  // === Schema Injection ===
  injectSchemas() {
    const schemas = [
      this.getFAQSchema(),
      this.getOrganizationSchema(),
      this.getWebApplicationSchema()
    ];

    schemas.forEach(schema => this.injectSchema(schema));
  }

  injectSchema(schemaObject) {
    try {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(schemaObject);
      document.head.appendChild(script);
    } catch (error) {
      console.error('Failed to inject schema:', error);
    }
  }

  getFAQSchema() {
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How does the Tweet Performance Predictor work?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Our AI analyzes multiple factors in your tweet including length, hashtags, emojis, engagement words, and timing to predict its potential performance and engagement."
          }
        },
        {
          "@type": "Question",
          "name": "How many free analyses do I get?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Free users get 3 tweet analyses per day. This resets every 24 hours."
          }
        }
      ]
    };
  }

  getOrganizationSchema() {
    return {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Tweet Performance Predictor",
      "description": "AI-powered social media analytics platform",
      "url": window.location.origin,
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "Customer Support",
        "email": "support@tweetpredictor.com"
      }
    };
  }

  getWebApplicationSchema() {
    return {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "Tweet Performance Predictor",
      "description": "AI-powered tool that predicts your tweet's engagement before you publish it.",
      "url": window.location.origin,
      "applicationCategory": "SocialNetworkingApplication",
      "operatingSystem": "Web Browser",
      "browserRequirements": "Requires JavaScript",
      "featureList": [
        "AI-Powered Analysis",
        "Performance Scoring",
        "Engagement Prediction",
        "Improvement Suggestions",
        "Analysis History"
      ]
    };
  }

  // === Utility Functions ===
  showResults() {
    this.elements.resultsSection?.classList.remove('hidden');
    this.elements.resultsSection?.scrollIntoView({ behavior: 'smooth' });
  }

  hideResults() {
    this.elements.resultsSection?.classList.add('hidden');
  }

  showLoading(spinnerId, textId, loadingText) {
    const spinner = document.getElementById(spinnerId);
    const text = document.getElementById(textId);
    
    spinner?.classList.remove('hidden');
    if (text) text.textContent = loadingText;
  }

  hideLoading(spinnerId, textId, originalText) {
    const spinner = document.getElementById(spinnerId);
    const text = document.getElementById(textId);
    
    spinner?.classList.add('hidden');
    if (text) text.textContent = originalText;
  }

  showMessage(element, message, type) {
    if (!element) {
      console.log(`${type.toUpperCase()}: ${message}`);
      return;
    }
    
    const className = type === 'error' ? 'error-message' : 'success-message';
    element.innerHTML = `<div class="${className}">${message}</div>`;
    
    setTimeout(() => {
      element.innerHTML = '';
    }, 5000);
  }

  clearAuthForms() {
    document.querySelectorAll('#authModal input')?.forEach(input => input.value = '');
    document.querySelectorAll('#authModal .error-message, #authModal .success-message')?.forEach(msg => msg.remove());
  }

  toggleElement(element, show) {
    if (element) {
      element.classList.toggle('hidden', !show);
    }
  }

  handleError(message, error) {
    console.error(message, error);
    // In production, you might want to send this to an error tracking service
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // === Demo Functionality ===
  loadDemo(index) {
    if (!this.state.currentUser) {
      this.showAuthModal();
      return;
    }

    const demoTweets = [
      "Just launched my side project after 6 months of late nights! 🚀 It's a simple tool that solves a problem I had daily. Sometimes the best ideas come from your own frustrations. What problem are you solving? #BuildInPublic",
      "Had breakfast this morning. It was okay I guess."
    ];

    if (this.elements.tweetInput && demoTweets[index]) {
      this.elements.tweetInput.value = demoTweets[index];
      this.updateTweetInput();
    }
  }

  // === Cleanup ===
  destroy() {
    // Remove all event listeners
    this.eventHandlers.forEach(({ element, event, handler }) => {
      element?.removeEventListener(event, handler);
    });
    this.eventHandlers.clear();
  }
}

// === Tweet Analysis Engine (unchanged from original) ===
class TweetAnalyzer {
  constructor(tweet) {
    this.tweet = tweet;
    this.factors = {
      length: { weight: 0.2, score: 0 },
      hashtags: { weight: 0.15, score: 0 },
      emojis: { weight: 0.15, score: 0 },
      engagement: { weight: 0.2, score: 0 },
      sentiment: { weight: 0.15, score: 0 },
      structure: { weight: 0.15, score: 0 }
    };
  }

  analyze() {
    this.analyzeLengthFactor();
    this.analyzeHashtagFactor();
    this.analyzeEmojiFactor();
    this.analyzeEngagementFactor();
    this.analyzeSentimentFactor();
    this.analyzeStructureFactor();

    const score = this.calculateOverallScore();
    const engagement = this.getEngagementLevel(score);
    const reach = this.getReachLevel(score);

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
