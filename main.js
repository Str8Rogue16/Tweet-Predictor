// === Enhanced Tweet Performance Predictor with Advanced Security & UX ===
// Import Supabase helpers (assumes supabase-config.js is loaded)
// Make sure to include: <script src="supabase-config.js"></script> before this file

import { authHelpers, dbHelpers, initAuthListener } from './supabase-config.js'

// === Rate Limiter Class ===
class RateLimiter {
  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    this.attempts = new Map();
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  canAttempt(identifier) {
    const now = Date.now();
    const userAttempts = this.attempts.get(identifier) || [];
    const recentAttempts = userAttempts.filter(time => now - time < this.windowMs);
    
    this.attempts.set(identifier, recentAttempts);
    return recentAttempts.length < this.maxAttempts;
  }

  recordAttempt(identifier) {
    const now = Date.now();
    const userAttempts = this.attempts.get(identifier) || [];
    userAttempts.push(now);
    this.attempts.set(identifier, userAttempts);
  }

  getRemainingAttempts(identifier) {
    const now = Date.now();
    const userAttempts = this.attempts.get(identifier) || [];
    const recentAttempts = userAttempts.filter(time => now - time < this.windowMs);
    return Math.max(0, this.maxAttempts - recentAttempts.length);
  }

  getTimeUntilReset(identifier) {
    const now = Date.now();
    const userAttempts = this.attempts.get(identifier) || [];
    const oldestAttempt = Math.min(...userAttempts);
    return Math.max(0, this.windowMs - (now - oldestAttempt));
  }
}

// === Password Strength Validator ===
class PasswordValidator {
  static validateStrength(password) {
    const checks = {
      length: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      noCommonPatterns: !this.hasCommonPatterns(password)
    };

    const score = Object.values(checks).filter(Boolean).length;
    const strength = this.getStrengthLevel(score);

    return {
      isValid: checks.length && score >= 4, // Require at least 4 criteria
      score,
      strength,
      checks,
      suggestions: this.getSuggestions(checks)
    };
  }

  static hasCommonPatterns(password) {
    const commonPatterns = [
      /123456/,
      /password/i,
      /qwerty/i,
      /abc123/i,
      /admin/i,
      /letmein/i
    ];
    return commonPatterns.some(pattern => pattern.test(password));
  }

  static getStrengthLevel(score) {
    if (score >= 6) return 'Very Strong';
    if (score >= 5) return 'Strong';
    if (score >= 4) return 'Good';
    if (score >= 3) return 'Fair';
    return 'Weak';
  }

  static getSuggestions(checks) {
    const suggestions = [];
    if (!checks.length) suggestions.push('Use at least 8 characters');
    if (!checks.hasUpperCase) suggestions.push('Add uppercase letters');
    if (!checks.hasLowerCase) suggestions.push('Add lowercase letters');
    if (!checks.hasNumbers) suggestions.push('Add numbers');
    if (!checks.hasSpecialChar) suggestions.push('Add special characters (!@#$%^&*)');
    if (!checks.noCommonPatterns) suggestions.push('Avoid common patterns like "password" or "123456"');
    return suggestions;
  }
}

// === Form Auto-Save Manager ===
class FormAutoSave {
  constructor(formSelector, saveInterval = 30000) { // 30 seconds
    this.formSelector = formSelector;
    this.saveInterval = saveInterval;
    this.autoSaveTimer = null;
    this.storageKey = `autosave_${formSelector}`;
  }

  startAutoSave() {
    this.loadSavedData();
    
    const form = document.querySelector(this.formSelector);
    if (!form) return;

    // Save on input changes (debounced)
    form.addEventListener('input', this.debounce(() => {
      this.saveFormData();
    }, 2000));

    // Periodic auto-save
    this.autoSaveTimer = setInterval(() => {
      this.saveFormData();
    }, this.saveInterval);
  }

  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  saveFormData() {
    const form = document.querySelector(this.formSelector);
    if (!form) return;

    const formData = {};
    const inputs = form.querySelectorAll('input[type="text"], input[type="email"]');
    
    inputs.forEach(input => {
      if (input.type !== 'password') { // Never save passwords
        formData[input.id] = input.value;
      }
    });

    if (Object.keys(formData).length > 0) {
      try {
        sessionStorage.setItem(this.storageKey, JSON.stringify(formData));
      } catch (e) {
        console.warn('Could not save form data:', e);
      }
    }
  }

  loadSavedData() {
    try {
      const savedData = sessionStorage.getItem(this.storageKey);
      if (savedData) {
        const formData = JSON.parse(savedData);
        Object.entries(formData).forEach(([id, value]) => {
          const input = document.getElementById(id);
          if (input && !input.value) {
            input.value = value;
          }
        });
      }
    } catch (e) {
      console.warn('Could not load saved form data:', e);
    }
  }

  clearSavedData() {
    try {
      sessionStorage.removeItem(this.storageKey);
    } catch (e) {
      console.warn('Could not clear saved form data:', e);
    }
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

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
      isLoading: false,
      rememberMe: false
    };

    this.elements = {};
    this.eventHandlers = new Map();
    
    // Enhanced security and UX features
    this.rateLimiter = new RateLimiter(5, 15 * 60 * 1000); // 5 attempts per 15 minutes
    this.formAutoSave = new FormAutoSave('#authModal');
    this.debounceTimers = new Map();
    
    this.init();
  }

  // === Core Initialization ===
  async init() {
    try {
      this.injectSchemas();
      this.cacheElements();
      this.setupEventListeners();
      this.setupAccessibility();
      
      // Initialize Supabase auth listener
      this.initSupabaseAuth();
      
      // Check for existing session
      await this.checkExistingSession();
      
      // Start form auto-save
      this.formAutoSave.startAutoSave();
      
      console.log('Enhanced Tweet Predictor initialized successfully');
    } catch (error) {
      this.handleError('Failed to initialize application', error);
    }
  }

  // === Enhanced Accessibility Setup ===
  setupAccessibility() {
    // Add ARIA labels and roles
    const inputs = document.querySelectorAll('#authModal input');
    inputs.forEach(input => {
      input.setAttribute('aria-required', 'true');
      
      // Add proper labels if missing
      if (!input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) {
          input.setAttribute('aria-labelledby', label.id);
        } else {
          // Add default aria-label based on input type/id
          const labelText = this.getDefaultAriaLabel(input);
          if (labelText) {
            input.setAttribute('aria-label', labelText);
          }
        }
      }
      
      // Add keyboard navigation
      input.addEventListener('keydown', this.handleKeyboardNavigation.bind(this));
    });

    // Setup modal accessibility
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'authModalTitle');
    }

    // Setup focus trap for modal
    this.setupFocusTrap();
  }

  getDefaultAriaLabel(input) {
    const labelMap = {
      'loginEmail': 'Email address for login',
      'loginPassword': 'Password for login',
      'registerName': 'Full name for registration',
      'registerEmail': 'Email address for registration',
      'registerPassword': 'Password for registration',
      'confirmPassword': 'Confirm password'
    };
    return labelMap[input.id] || null;
  }

  handleKeyboardNavigation(e) {
    // Enter key to submit forms
    if (e.key === 'Enter') {
      const form = e.target.closest('form');
      if (form) {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"], button:not([type])');
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
        }
      }
    }
    
    // Escape key to close modal
    if (e.key === 'Escape') {
      this.hideAuthModal();
    }
  }

  setupFocusTrap() {
    const modal = document.getElementById('authModal');
    if (!modal) return;

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        const focusableElements = modal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    });
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
      
      // Clear form auto-save data on successful login
      this.formAutoSave.clearSavedData();
      
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

  // === Enhanced Authentication Handlers ===
  async handleLogin() {
    const credentials = this.getLoginCredentials();
    if (!this.validateLoginInput(credentials)) return;

    const identifier = credentials.email.toLowerCase();
    const messageEl = document.getElementById('loginMessage');
    
    // Check rate limiting
    if (!this.rateLimiter.canAttempt(identifier)) {
      const timeRemaining = Math.ceil(this.rateLimiter.getTimeUntilReset(identifier) / 60000);
      this.showMessage(messageEl, `Too many login attempts. Please wait ${timeRemaining} minutes before trying again.`, 'error');
      return;
    }
    
    try {
      this.showLoading('loginSpinner', 'loginBtnText', 'Signing In...');
      
      const { data, error } = await authHelpers.signIn(credentials.email, credentials.password);
      
      if (error) {
        // Record failed attempt
        this.rateLimiter.recordAttempt(identifier);
        throw new Error(this.getErrorMessage(error));
      }
      
      this.showMessage(messageEl, 'Login successful!', 'success');
      
      setTimeout(() => {
        this.hideAuthModal();
      }, 1000);
      
    } catch (error) {
      const remainingAttempts = this.rateLimiter.getRemainingAttempts(identifier);
      let errorMessage = error.message;
      
      if (remainingAttempts <= 2 && remainingAttempts > 0) {
        errorMessage += ` (${remainingAttempts} attempts remaining)`;
      }
      
      this.showMessage(messageEl, errorMessage, 'error');
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
        throw new Error(this.getErrorMessage(error));
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

  // === Enhanced Error Message Handler ===
  getErrorMessage(error) {
    const errorMessages = {
      'Invalid login credentials': 'Email or password is incorrect. Please check your credentials and try again.',
      'Email not confirmed': 'Please check your email and click the confirmation link before signing in.',
      'Too many requests': 'Too many requests. Please wait a moment before trying again.',
      'User already registered': 'An account with this email already exists. Try signing in instead.',
      'Password should be at least 6 characters': 'Password must be at least 8 characters long.',
      'Invalid email': 'Please enter a valid email address.',
      'Network error': 'Network connection error. Please check your internet connection.',
      'Signup disabled': 'New registrations are currently disabled. Please contact support.'
    };

    // Check for specific error patterns
    const errorMessage = error.message || error.toString();
    
    // Direct match
    if (errorMessages[errorMessage]) {
      return errorMessages[errorMessage];
    }
    
    // Pattern matching for common error types
    if (errorMessage.includes('Invalid login credentials')) {
      return errorMessages['Invalid login credentials'];
    }
    if (errorMessage.includes('Email not confirmed')) {
      return errorMessages['Email not confirmed'];
    }
    if (errorMessage.includes('too many requests') || errorMessage.includes('rate limit')) {
      return errorMessages['Too many requests'];
    }
    if (errorMessage.includes('User already registered')) {
      return errorMessages['User already registered'];
    }
    if (errorMessage.includes('Password') && errorMessage.includes('6 characters')) {
      return errorMessages['Password should be at least 6 characters'];
    }
    if (errorMessage.includes('Invalid email')) {
      return errorMessages['Invalid email'];
    }
    if (errorMessage.includes('Network') || errorMessage.includes('fetch')) {
      return errorMessages['Network error'];
    }
    
    // Default fallback
    return errorMessage || 'An unexpected error occurred. Please try again.';
  }

  // === Enhanced Input Validation ===
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
    
    if (name.length < 2) {
      this.showMessage(messageEl, 'Name must be at least 2 characters long', 'error');
      return false;
    }
    
    if (!this.isValidEmail(email)) {
      this.showMessage(messageEl, 'Please enter a valid email address', 'error');
      return false;
    }
    
    // Enhanced password validation
    const passwordValidation = PasswordValidator.validateStrength(password);
    if (!passwordValidation.isValid) {
      const suggestions = passwordValidation.suggestions.slice(0, 2).join(', ');
      this.showMessage(messageEl, `Password is too weak. ${suggestions}`, 'error');
      return false;
    }
    
    if (password !== confirmPassword) {
      this.showMessage(messageEl, 'Passwords do not match', 'error');
      return false;
    }
    
    return true;
  }

  // === Password Strength Indicator ===
  setupPasswordStrengthIndicator() {
    const passwordInput = document.getElementById('registerPassword');
    const strengthIndicator = document.getElementById('passwordStrength');
    
    if (!passwordInput || !strengthIndicator) return;

    const updateStrength = this.debounce((password) => {
      if (!password) {
        strengthIndicator.innerHTML = '';
        return;
      }

      const validation = PasswordValidator.validateStrength(password);
      const strengthClass = this.getStrengthClass(validation.strength);
      
      strengthIndicator.innerHTML = `
        <div class="password-strength-bar">
          <div class="strength-meter ${strengthClass}" style="width: ${(validation.score / 6) * 100}%"></div>
        </div>
        <div class="strength-text ${strengthClass}">
          Password Strength: ${validation.strength}
        </div>
        ${validation.suggestions.length > 0 ? `
          <div class="strength-suggestions">
            <small>${validation.suggestions.slice(0, 2).join(', ')}</small>
          </div>
        ` : ''}
      `;
    }, 300);

    passwordInput.addEventListener('input', (e) => {
      updateStrength(e.target.value);
    });
  }

  getStrengthClass(strength) {
    const classMap = {
      'Weak': 'strength-weak',
      'Fair': 'strength-fair',
      'Good': 'strength-good',
      'Strong': 'strength-strong',
      'Very Strong': 'strength-very-strong'
    };
    return classMap[strength] || 'strength-weak';
  }

  // === Tweet Analysis System (unchanged from original) ===
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
            <span>Score: <strong class="text-slate-800">${item.overall_score}/100</strong></span>
            <span>Engagement: <strong class="text-slate-800">${item.engagement_level}</strong></span>
            <span>Reach: <strong class="text-slate-800">${item.reach_level}</strong></span>
            <span class="text-slate-500">${date}</span>
          </div>
        </div>
        <button 
          onclick="tweetPredictor.showHistoryDetails('${item.id}')" 
          class="ml-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
          aria-label="View detailed analysis for this tweet"
        >
          View Details
        </button>
      </div>
    `;
  }

  // === History Details Modal ===
  async showHistoryDetails(analysisId) {
    try {
      const analysis = this.state.analysisHistory.find(item => item.id === analysisId);
      if (!analysis) {
        this.showMessage(null, 'Analysis not found', 'error');
        return;
      }

      // Create and show modal
      const modal = this.createHistoryModal(analysis);
      document.body.appendChild(modal);
      
      // Focus management
      const closeBtn = modal.querySelector('.close-history-modal');
      if (closeBtn) closeBtn.focus();
      
    } catch (error) {
      this.handleError('Error showing analysis details', error);
    }
  }

  createHistoryModal(analysis) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'historyModalTitle');
    
    modal.innerHTML = `
      <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 id="historyModalTitle" class="text-xl font-bold text-slate-800">Analysis Details</h3>
            <button 
              class="close-history-modal text-slate-500 hover:text-slate-700 text-2xl"
              aria-label="Close modal"
            >
              &times;
            </button>
          </div>
          
          <div class="space-y-4">
            <div>
              <h4 class="font-semibold text-slate-700 mb-2">Tweet Content:</h4>
              <p class="text-slate-600 bg-slate-50 p-3 rounded border">${analysis.tweet_content}</p>
            </div>
            
            <div class="grid grid-cols-3 gap-4">
              <div class="text-center p-3 bg-blue-50 rounded">
                <div class="text-2xl font-bold text-blue-600">${analysis.overall_score}</div>
                <div class="text-sm text-slate-600">Overall Score</div>
              </div>
              <div class="text-center p-3 bg-green-50 rounded">
                <div class="text-lg font-semibold text-green-600">${analysis.engagement_level}</div>
                <div class="text-sm text-slate-600">Engagement</div>
              </div>
              <div class="text-center p-3 bg-purple-50 rounded">
                <div class="text-lg font-semibold text-purple-600">${analysis.reach_level}</div>
                <div class="text-sm text-slate-600">Reach</div>
              </div>
            </div>
            
            ${analysis.detailed_analysis ? `
              <div>
                <h4 class="font-semibold text-slate-700 mb-2">Detailed Analysis:</h4>
                <p class="text-slate-600">${analysis.detailed_analysis}</p>
              </div>
            ` : ''}
            
            ${analysis.suggestions ? `
              <div>
                <h4 class="font-semibold text-slate-700 mb-2">Suggestions:</h4>
                <ul class="list-disc list-inside text-slate-600 space-y-1">
                  ${analysis.suggestions.split('\n').map(suggestion => 
                    suggestion.trim() ? `<li>${suggestion.trim()}</li>` : ''
                  ).join('')}
                </ul>
              </div>
            ` : ''}
            
            ${analysis.optimal_posting_time ? `
              <div>
                <h4 class="font-semibold text-slate-700 mb-2">Optimal Posting Time:</h4>
                <p class="text-slate-600">${analysis.optimal_posting_time}</p>
              </div>
            ` : ''}
            
            <div class="text-sm text-slate-500 pt-2 border-t">
              Analyzed on: ${new Date(analysis.created_at).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeHistoryModal(modal);
      }
    });

    modal.querySelector('.close-history-modal').addEventListener('click', () => {
      this.closeHistoryModal(modal);
    });

    // Keyboard support
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeHistoryModal(modal);
      }
    });

    return modal;
  }

  closeHistoryModal(modal) {
    modal.remove();
  }

  // === Enhanced Form Handlers ===
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

  // === Enhanced Utility Methods ===
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // === UI Helper Methods ===
  showLoading(spinnerId, textId, loadingText) {
    const spinner = document.getElementById(spinnerId);
    const text = document.getElementById(textId);
    const button = spinner?.closest('button');
    
    if (spinner) spinner.classList.remove('hidden');
    if (text) text.textContent = loadingText;
    if (button) button.disabled = true;
  }

  hideLoading(spinnerId, textId, originalText) {
    const spinner = document.getElementById(spinnerId);
    const text = document.getElementById(textId);
    const button = spinner?.closest('button');
    
    if (spinner) spinner.classList.add('hidden');
    if (text) text.textContent = originalText;
    if (button) button.disabled = false;
  }

  showMessage(element, message, type = 'info') {
    if (!element) {
      // Create a toast notification if no specific element
      this.showToast(message, type);
      return;
    }
    
    element.textContent = message;
    element.className = `message ${type === 'error' ? 'text-red-600' : type === 'success' ? 'text-green-600' : 'text-blue-600'}`;
    element.classList.remove('hidden');
    
    // Auto-hide success messages
    if (type === 'success') {
      setTimeout(() => {
        element.classList.add('hidden');
      }, 5000);
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${
      type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' :
      type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
      'bg-blue-100 text-blue-800 border border-blue-200'
    }`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  toggleElement(element, show) {
    if (!element) return;
    element.style.display = show ? 'block' : 'none';
  }

  // === Event Listeners Setup ===
  cacheElements() {
    this.elements = {
      tweetInput: document.getElementById('tweetInput'),
      analyzeBtn: document.getElementById('analyzeBtn'),
      results: document.getElementById('results'),
      userInfo: document.getElementById('userInfo'),
      signInHeader: document.getElementById('signInHeader'),
      userDisplay: document.getElementById('userDisplay'),
      usageCount: document.getElementById('usageCount'),
      historySection: document.getElementById('historySection'),
      protectedWrapper: document.getElementById('protectedWrapper'),
      accessOverlay: document.getElementById('accessOverlay'),
      authModal: document.getElementById('authModal')
    };
  }

  setupEventListeners() {
    // Authentication modal events
    this.addEventListener('showLogin', () => this.showAuthModal('login'));
    this.addEventListener('showRegister', () => this.showAuthModal('register'));
    this.addEventListener('closeAuthModal', () => this.hideAuthModal());
    
    // Form submission events
    this.addEventListener('submitLogin', (e) => {
      e.preventDefault();
      this.handleLogin();
    });
    
    this.addEventListener('submitRegister', (e) => {
      e.preventDefault();
      this.handleRegister();
    });
    
    // Tweet analysis
    this.addEventListener('analyzeTweet', () => this.analyzeTweet());
    
    // Sign out
    this.addEventListener('signOut', () => this.handleSignOut());
    
    // Tweet input character counter
    if (this.elements.tweetInput) {
      this.elements.tweetInput.addEventListener('input', this.updateCharacterCount.bind(this));
    }
    
    // Setup password strength indicator
    this.setupPasswordStrengthIndicator();
    
    // Setup form switching
    this.setupFormSwitching();
    
    // Setup modal outside click
    this.setupModalHandlers();
  }

  addEventListener(eventName, handler) {
    const element = document.querySelector(`[data-action="${eventName}"]`);
    if (element) {
      element.addEventListener('click', handler);
      this.eventHandlers.set(eventName, { element, handler });
    }
  }

  setupFormSwitching() {
    const switchToRegister = document.getElementById('switchToRegister');
    const switchToLogin = document.getElementById('switchToLogin');
    
    if (switchToRegister) {
      switchToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchAuthForm('register');
      });
    }
    
    if (switchToLogin) {
      switchToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchAuthForm('login');
      });
    }
  }

  setupModalHandlers() {
    const modal = document.getElementById('authModal');
    if (!modal) return;

    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideAuthModal();
      }
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        this.hideAuthModal();
      }
    });
  }

  // === Modal Management ===
  showAuthModal(type = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) return;

    this.switchAuthForm(type);
    modal.classList.remove('hidden');
    
    // Focus management
    const firstInput = modal.querySelector('input:not([type="hidden"])');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
    
    // Start auto-save
    this.formAutoSave.startAutoSave();
  }

  hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;

    modal.classList.add('hidden');
    this.clearFormMessages();
    
    // Stop auto-save
    this.formAutoSave.stopAutoSave();
  }

  switchAuthForm(type) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const modalTitle = document.getElementById('authModalTitle');
    
    if (type === 'register') {
      loginForm?.classList.add('hidden');
      registerForm?.classList.remove('hidden');
      if (modalTitle) modalTitle.textContent = 'Create Account';
    } else {
      registerForm?.classList.add('hidden');
      loginForm?.classList.remove('hidden');
      if (modalTitle) modalTitle.textContent = 'Sign In';
    }
    
    this.clearFormMessages();
  }

  clearFormMessages() {
    const messages = document.querySelectorAll('#loginMessage, #registerMessage');
    messages.forEach(msg => {
      msg.classList.add('hidden');
      msg.textContent = '';
    });
  }

  // === Tweet Input Management ===
  updateCharacterCount() {
    const input = this.elements.tweetInput;
    const counter = document.getElementById('characterCount');
    
    if (!input || !counter) return;
    
    const length = input.value.length;
    const remaining = this.config.maxTweetLength - length;
    
    counter.textContent = `${remaining} characters remaining`;
    counter.className = remaining < 20 ? 'text-red-600 text-sm' : 'text-slate-600 text-sm';
    
    // Update analyze button state
    if (this.elements.analyzeBtn) {
      this.elements.analyzeBtn.disabled = length === 0 || length > this.config.maxTweetLength || this.state.isAnalyzing;
    }
  }

  updateTweetInput() {
    this.updateCharacterCount();
  }

  // === Results Display ===
  displayResults(analysis) {
    if (!this.elements.results) return;

    this.elements.results.innerHTML = `
      <div class="bg-white rounded-lg shadow-lg p-6">
        <h3 class="text-xl font-bold text-slate-800 mb-4">Analysis Results</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="text-center p-4 bg-blue-50 rounded-lg">
            <div class="text-3xl font-bold text-blue-600">${analysis.score}</div>
            <div class="text-sm text-slate-600">Overall Score</div>
          </div>
          <div class="text-center p-4 bg-green-50 rounded-lg">
            <div class="text-xl font-semibold text-green-600">${analysis.engagement}</div>
            <div class="text-sm text-slate-600">Engagement Level</div>
          </div>
          <div class="text-center p-4 bg-purple-50 rounded-lg">
            <div class="text-xl font-semibold text-purple-600">${analysis.reach}</div>
            <div class="text-sm text-slate-600">Reach Level</div>
          </div>
        </div>
        
        <div class="space-y-4">
          <div>
            <h4 class="font-semibold text-slate-700 mb-2">Analysis:</h4>
            <p class="text-slate-600">${analysis.analysis}</p>
          </div>
          
          <div>
            <h4 class="font-semibold text-slate-700 mb-2">Suggestions for Improvement:</h4>
            <ul class="list-disc list-inside text-slate-600 space-y-1">
              ${analysis.suggestions.split('\n').map(suggestion => 
                suggestion.trim() ? `<li>${suggestion.trim()}</li>` : ''
              ).join('')}
            </ul>
          </div>
          
          <div>
            <h4 class="font-semibold text-slate-700 mb-2">Optimal Posting Time:</h4>
            <p class="text-slate-600">${analysis.optimalTime}</p>
          </div>
        </div>
      </div>
    `;
    
    this.elements.results.classList.remove('hidden');
    this.elements.results.scrollIntoView({ behavior: 'smooth' });
  }

  hideResults() {
    if (this.elements.results) {
      this.elements.results.classList.add('hidden');
    }
  }

  // === Schema Injection ===
  injectSchemas() {
    if (document.querySelector('script[type="application/ld+json"]')) return;

    const schema = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "Tweet Performance Predictor",
      "description": "AI-powered tool to predict and analyze Twitter tweet performance",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web Browser",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      }
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  }

  // === Error Handling ===
  handleError(message, error) {
    console.error(message, error);
    this.showToast(`${message}: ${error.message || 'Unknown error'}`, 'error');
  }

  // === Cleanup ===
  destroy() {
    // Clean up event listeners
    this.eventHandlers.forEach(({ element, handler }) => {
      element.removeEventListener('click', handler);
    });
    this.eventHandlers.clear();
    
    // Stop auto-save
    this.formAutoSave.stopAutoSave();
    
    // Clear any timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
  }
}

// === Tweet Analyzer Class (Mock Implementation) ===
class TweetAnalyzer {
  constructor(tweet) {
    this.tweet = tweet;
  }

  analyze() {
    // Mock analysis - replace with actual ML model
    const score = Math.floor(Math.random() * 40) + 60; // 60-100 range
    
    return {
      score,
      engagement: score > 85 ? 'High' : score > 70 ? 'Medium' : 'Low',
      reach: score > 80 ? 'High' : score > 65 ? 'Medium' : 'Low',
      analysis: this.generateAnalysis(score),
      suggestions: this.generateSuggestions(),
      optimalTime: this.getOptimalTime(),
      factors: this.analyzeFactors()
    };
  }

  generateAnalysis(score) {
    if (score > 85) {
      return "Excellent tweet! Your content has strong engagement potential with good use of relevant keywords and timing.";
    } else if (score > 70) {
      return "Good tweet with solid potential. Consider adding more engaging elements to boost performance.";
    } else {
      return "This tweet has room for improvement. Focus on making it more engaging and relevant to your audience.";
    }
  }

  generateSuggestions() {
    const suggestions = [
      "Add relevant hashtags to increase discoverability",
      "Consider posting during peak engagement hours",
      "Include a call-to-action to encourage interaction",
      "Use emojis to make your tweet more visually appealing",
      "Ask a question to encourage replies"
    ];
    
    return suggestions.slice(0, 3).join('\n');
  }

  getOptimalTime() {
    const times = [
      "9:00 AM - 10:00 AM (High morning engagement)",
      "12:00 PM - 1:00 PM (Lunch break peak)",
      "5:00 PM - 6:00 PM (After work hours)",
      "7:00 PM - 9:00 PM (Evening social time)"
    ];
    
    return times[Math.floor(Math.random() * times.length)];
  }

  analyzeFactors() {
    return {
      length: this.tweet.length,
      hasHashtags: this.tweet.includes('#'),
      hasMentions: this.tweet.includes('@'),
      hasEmojis: /[\u{1F300}-\u{1F9FF}]/u.test(this.tweet),
      hasNumbers: /\d/.test(this.tweet),
      hasQuestions: this.tweet.includes('?')
    };
  }
}

// === Initialize Application ===
let tweetPredictor;

document.addEventListener('DOMContentLoaded', () => {
  tweetPredictor = new TweetPredictor();
});

// === Global Error Handler ===
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  if (tweetPredictor) {
    tweetPredictor.showToast('An unexpected error occurred. Please refresh the page.', 'error');
  }
});

// === Export for module usage ===
export { TweetPredictor, PasswordValidator, RateLimiter, FormAutoSave };

