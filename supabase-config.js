// supabase-config.js
import { createClient } from '@supabase/supabase-js'

// Supabase configuration - Replace with your actual values
const supabaseUrl = 'SUPABASE_URL'
const supabaseAnonKey = 'SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Authentication helper functions
export const authHelpers = {
  // Sign up new user
  async signUp(email, password, fullName) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      })
      return { data, error }
    } catch (err) {
      return { data: null, error: err }
    }
  },

  // Sign in user
  async signIn(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      return { data, error }
    } catch (err) {
      return { data: null, error: err }
    }
  },

  // Sign out user
  async signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      return { error }
    } catch (err) {
      return { error: err }
    }
  },

  // Get current user
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      return { user, error }
    } catch (err) {
      return { user: null, error: err }
    }
  },

  // Get user session
  async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      return { session, error }
    } catch (err) {
      return { session: null, error: err }
    }
  }
}

// Database helper functions
export const dbHelpers = {
  // Get user profile
  async getUserProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId) // Using consistent field name
        .single()
      return { data, error }
    } catch (err) {
      return { data: null, error: err }
    }
  },

  // Update user profile
  async updateUserProfile(userId, updates) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('user_id', userId)
        .select()
        .single()
      return { data, error }
    } catch (err) {
      return { data: null, error: err }
    }
  },

  // Check if user can perform analysis
  async canPerformAnalysis(userId) {
    try {
      const { data: profile, error } = await this.getUserProfile(userId)
      if (error) return { canAnalyze: false, error }

      const now = new Date()
      const today = now.toISOString().split('T')[0]

      // Check based on plan type
      if (profile.plan_type === 'free') {
        // Free users: 3 analyses per day
        const { data: todayAnalyses, error: countError } = await supabase
          .from('tweet_analyses')
          .select('id')
          .eq('user_id', userId)
          .gte('created_at', today + 'T00:00:00')
          .lt('created_at', today + 'T23:59:59')

        if (countError) return { canAnalyze: false, error: countError }
        
        const remainingAnalyses = 3 - (todayAnalyses?.length || 0)
        return {
          canAnalyze: remainingAnalyses > 0,
          remainingAnalyses,
          planType: 'free'
        }
      } else if (profile.plan_type === 'pack') {
        // Pack users: limited analyses
        const remaining = profile.pack_analyses_remaining || 0
        return {
          canAnalyze: remaining > 0,
          remainingAnalyses: remaining,
          packAnalyses: remaining,
          planType: 'pack'
        }
      } else if (profile.plan_type === 'pro') {
        // Pro users: unlimited
        return {
          canAnalyze: true,
          remainingAnalyses: -1, // -1 indicates unlimited
          planType: 'pro'
        }
      }

      return { canAnalyze: false, error: 'Invalid plan type' }
    } catch (err) {
      return { canAnalyze: false, error: err }
    }
  },

  // Consume analysis credit
  async consumeAnalysisCredit(userId) {
    try {
      const { data: profile, error } = await this.getUserProfile(userId)
      if (error) return { success: false, error }

      if (profile.plan_type === 'pack') {
        // Decrement pack analyses
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ 
            pack_analyses_remaining: Math.max(0, (profile.pack_analyses_remaining || 0) - 1),
            total_analyses_used: (profile.total_analyses_used || 0) + 1
          })
          .eq('user_id', userId)
        
        return { success: !updateError, error: updateError }
      }

      // For free users, just increment total count
      if (profile.plan_type === 'free') {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ 
            total_analyses_used: (profile.total_analyses_used || 0) + 1
          })
          .eq('user_id', userId)
        
        return { success: !updateError, error: updateError }
      }

      // Pro users - just increment total count
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ 
          total_analyses_used: (profile.total_analyses_used || 0) + 1
        })
        .eq('user_id', userId)

      return { success: !updateError, error: updateError }
    } catch (err) {
      return { success: false, error: err }
    }
  },

  // Save tweet analysis
  async saveTweetAnalysis(userId, analysisData) {
    try {
      const { data, error } = await supabase
        .from('tweet_analyses')
        .insert({
          user_id: userId,
          tweet_content: analysisData.tweetContent,
          overall_score: analysisData.overallScore,
          engagement_level: analysisData.engagementLevel,
          reach_level: analysisData.reachLevel,
          detailed_analysis: analysisData.detailedAnalysis,
          suggestions: analysisData.suggestions,
          optimal_posting_time: analysisData.optimalPostingTime,
          metadata: analysisData.metadata || {}
        })
        .select()
        .single()

      return { data, error }
    } catch (err) {
      return { data: null, error: err }
    }
  },

  // Get user's analysis history
  async getAnalysisHistory(userId, limit = 10, offset = 0) {
    try {
      const { data, error } = await supabase
        .from('tweet_analyses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      return { data, error }
    } catch (err) {
      return { data: null, error: err }
    }
  },

  // Log user action
  async logUserAction(userId, actionType, metadata = {}) {
    try {
      const { data, error } = await supabase
        .from('usage_logs')
        .insert({
          user_id: userId,
          action_type: actionType,
          metadata,
          created_at: new Date().toISOString()
        })

      return { data, error }
    } catch (err) {
      return { data: null, error: err }
    }
  },

  // Get usage statistics
  async getUsageStats(userId, days = 30) {
    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const { data, error } = await supabase
        .from('usage_logs')
        .select('action_type, created_at')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })

      return { data, error }
    } catch (err) {
      return { data: null, error: err }
    }
  }
}

// Real-time subscriptions helper
export const realtimeHelpers = {
  // Subscribe to user profile changes
  subscribeToProfile(userId, callback) {
    return supabase
      .channel(`profile:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_profiles',
        filter: `user_id=eq.${userId}`
      }, callback)
      .subscribe()
  },

  // Subscribe to analysis history
  subscribeToAnalyses(userId, callback) {
    return supabase
      .channel(`analyses:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'tweet_analyses',
        filter: `user_id=eq.${userId}`
      }, callback)
      .subscribe()
  }
}

// UI Helper Functions for Auth State Management
export const uiHelpers = {
  // Handle successful sign in
  handleSignIn(user) {
    // Show authenticated UI elements
    const userInfo = document.getElementById('userInfo')
    const signInHeader = document.getElementById('signInHeader')
    const accessOverlay = document.getElementById('accessOverlay')
    const userDisplay = document.getElementById('userDisplay')
    
    if (userInfo) userInfo.classList.remove('hidden')
    if (signInHeader) signInHeader.classList.add('hidden')
    if (accessOverlay) accessOverlay.style.display = 'none'
    if (userDisplay) userDisplay.textContent = user.email
    
    // Load user data
    this.loadUserProfile(user.id)
  },

  // Handle sign out
  handleSignOut() {
    // Show unauthenticated UI elements
    const userInfo = document.getElementById('userInfo')
    const signInHeader = document.getElementById('signInHeader')
    const accessOverlay = document.getElementById('accessOverlay')
    
    if (userInfo) userInfo.classList.add('hidden')
    if (signInHeader) signInHeader.classList.remove('hidden')
    if (accessOverlay) accessOverlay.style.display = 'flex'
    
    // Clear user data
    this.clearUserData()
  },

  // Load user profile and update UI
  async loadUserProfile(userId) {
    const { data: profile, error } = await dbHelpers.getUserProfile(userId)
    if (error) {
      console.error('Error loading profile:', error)
      return
    }
    
    // Update usage count display
    this.updateUsageDisplay(profile)
    
    // Load analysis history
    this.loadAnalysisHistory(userId)
  },

  // Update usage display in UI
  updateUsageDisplay(profile) {
    const usageElement = document.getElementById('usageCount')
    if (!usageElement) return
    
    let usageText = ''
    
    if (profile.plan_type === 'free') {
      // Calculate remaining analyses for today
      const today = new Date().toISOString().split('T')[0]
      // You might want to fetch actual count here for accuracy
      usageText = 'Free plan - 3 analyses per day'
    } else if (profile.plan_type === 'pack') {
      usageText = `${profile.pack_analyses_remaining || 0} analyses remaining in pack`
    } else if (profile.plan_type === 'pro') {
      usageText = 'Unlimited analyses'
    }
    
    usageElement.textContent = usageText
  },

  // Load and display analysis history
  async loadAnalysisHistory(userId) {
    const { data: analyses, error } = await dbHelpers.getAnalysisHistory(userId)
    if (error) {
      console.error('Error loading history:', error)
      return
    }
    
    this.displayAnalysisHistory(analyses)
  },

  // Display analysis history in UI
  displayAnalysisHistory(analyses) {
    const historyList = document.getElementById('historyList')
    const historySection = document.getElementById('historySection')
    
    if (!historyList || !historySection) return
    
    if (analyses && analyses.length > 0) {
      historySection.classList.remove('hidden')
      historyList.innerHTML = analyses.map(analysis => `
        <div class="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div class="flex justify-between items-start mb-2">
            <div class="font-medium text-slate-800 truncate mr-4">
              "${analysis.tweet_content.substring(0, 60)}${analysis.tweet_content.length > 60 ? '...' : ''}"
            </div>
            <div class="text-sm text-slate-500 whitespace-nowrap">
              ${new Date(analysis.created_at).toLocaleDateString()}
            </div>
          </div>
          <div class="flex items-center space-x-4 text-sm">
            <span class="text-blue-600 font-semibold">Score: ${analysis.overall_score}</span>
            <span class="text-slate-600">Engagement: ${analysis.engagement_level}</span>
            <span class="text-slate-600">Reach: ${analysis.reach_level}</span>
          </div>
        </div>
      `).join('')
    } else {
      historySection.classList.add('hidden')
    }
  },

  // Clear user data from UI
  clearUserData() {
    const usageCount = document.getElementById('usageCount')
    const historySection = document.getElementById('historySection')
    
    if (usageCount) usageCount.textContent = 'Sign in to track usage'
    if (historySection) historySection.classList.add('hidden')
  }
}

// Initialize auth state listener
export function initAuthListener() {
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event, session)
    
    // Handle auth events
    switch (event) {
      case 'SIGNED_IN':
        console.log('User signed in:', session.user)
        uiHelpers.handleSignIn(session.user)
        break
      case 'SIGNED_OUT':
        console.log('User signed out')
        uiHelpers.handleSignOut()
        break
      case 'TOKEN_REFRESHED':
        console.log('Token refreshed')
        break
    }
  })
}

// For browser environments, make available globally
if (typeof window !== 'undefined') {
  window.supabase = supabase
  window.authHelpers = authHelpers
  window.dbHelpers = dbHelpers
  window.realtimeHelpers = realtimeHelpers
  window.uiHelpers = uiHelpers
  window.initAuthListener = initAuthListener
}
