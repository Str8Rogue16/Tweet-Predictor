// supabase-config.js
import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = 'SUPABASE_URL'
const supabaseAnonKey = 'SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Auth helper functions
export const authHelpers = {
  // Sign up new user
  async signUp(email, password, fullName) {
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
  },

  // Sign in user
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    return { data, error }
  },

  // Sign out user
  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Get current user
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  // Get user session
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession()
    return { session, error }
  }
}

// Database helper functions
export const dbHelpers = {
  // Get user profile
  async getUserProfile(userId) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return { data, error }
  },

  // Update user profile
  async updateUserProfile(userId, updates) {
    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()
    return { data, error }
  },

  // Check if user can perform analysis
  async canPerformAnalysis(userId) {
    const { data: profile, error } = await this.getUserProfile(userId)
    if (error) return { canAnalyze: false, error }

    // Reset daily count if needed
    const today = new Date().toISOString().split('T')[0]
    if (profile.daily_reset_date !== today) {
      await this.resetDailyAnalyses(userId)
      // Refetch profile after reset
      const { data: updatedProfile } = await this.getUserProfile(userId)
      profile = updatedProfile
    }

    let canAnalyze = false
    if (profile.plan_type === 'free') {
      canAnalyze = profile.analyses_remaining > 0
    } else if (profile.plan_type === 'pack') {
      canAnalyze = profile.pack_analyses_remaining > 0
    } else if (profile.plan_type === 'pro') {
      canAnalyze = true // Unlimited
    }

    return { 
      canAnalyze, 
      remainingAnalyses: profile.analyses_remaining,
      packAnalyses: profile.pack_analyses_remaining,
      planType: profile.plan_type 
    }
  },

  // Reset daily analyses
  async resetDailyAnalyses(userId) {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        analyses_remaining: 3, // Reset to 3 for free users
        daily_reset_date: today
      })
      .eq('id', userId)
      .eq('plan_type', 'free')
    return { data, error }
  },

  // Consume analysis credit
  async consumeAnalysisCredit(userId) {
    const { data: profile, error: profileError } = await this.getUserProfile(userId)
    if (profileError) return { success: false, error: profileError }

    let updateData = {
      total_analyses_used: profile.total_analyses_used + 1
    }

    if (profile.plan_type === 'free') {
      updateData.analyses_remaining = Math.max(0, profile.analyses_remaining - 1)
    } else if (profile.plan_type === 'pack') {
      updateData.pack_analyses_remaining = Math.max(0, profile.pack_analyses_remaining - 1)
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId)

    return { success: !error, error }
  },

  // Save tweet analysis
  async saveTweetAnalysis(userId, analysisData) {
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
        analysis_metadata: analysisData.metadata || {}
      })
      .select()
      .single()

    return { data, error }
  },

  // Get user's analysis history
  async getAnalysisHistory(userId, limit = 10, offset = 0) {
    const { data, error } = await supabase
      .from('tweet_analyses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    return { data, error }
  },

  // Log user action
  async logUserAction(userId, actionType, metadata = {}) {
    const { data, error } = await supabase
      .from('usage_logs')
      .insert({
        user_id: userId,
        action_type: actionType,
        metadata
      })

    return { data, error }
  },

  // Get usage statistics
  async getUsageStats(userId, days = 30) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data, error } = await supabase
      .from('usage_logs')
      .select('action_type, created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })

    return { data, error }
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
        filter: `id=eq.${userId}`
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

// Initialize auth state listener
export function initAuthListener() {
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event, session)
    
    // Handle auth events
    switch (event) {
      case 'SIGNED_IN':
        console.log('User signed in:', session.user)
        // Update UI to show authenticated state
        handleSignIn(session.user)
        break
      case 'SIGNED_OUT':
        console.log('User signed out')
        // Update UI to show unauthenticated state
        handleSignOut()
        break
      case 'TOKEN_REFRESHED':
        console.log('Token refreshed')
        break
    }
  })
}

// UI update functions (to be implemented in your main.js)
function handleSignIn(user) {
  // Show authenticated UI elements
  document.getElementById('userInfo').classList.remove('hidden')
  document.getElementById('signInHeader').classList.add('hidden')
  document.getElementById('accessOverlay').style.display = 'none'
  document.getElementById('userDisplay').textContent = user.email
  
  // Load user data
  loadUserProfile(user.id)
}

function handleSignOut() {
  // Show unauthenticated UI elements
  document.getElementById('userInfo').classList.add('hidden')
  document.getElementById('signInHeader').classList.remove('hidden')
  document.getElementById('accessOverlay').style.display = 'flex'
  
  // Clear user data
  clearUserData()
}

async function loadUserProfile(userId) {
  const { data: profile, error } = await dbHelpers.getUserProfile(userId)
  if (error) {
    console.error('Error loading profile:', error)
    return
  }
  
  // Update usage count display
  updateUsageDisplay(profile)
  
  // Load analysis history
  loadAnalysisHistory(userId)
}

function updateUsageDisplay(profile) {
  const usageElement = document.getElementById('usageCount')
  let usageText = ''
  
  if (profile.plan_type === 'free') {
    usageText = `${profile.analyses_remaining}/3 analyses remaining today`
  } else if (profile.plan_type === 'pack') {
    usageText = `${profile.pack_analyses_remaining} analyses remaining in pack`
  } else if (profile.plan_type === 'pro') {
    usageText = 'Unlimited analyses'
  }
  
  usageElement.textContent = usageText
}

async function loadAnalysisHistory(userId) {
  const { data: analyses, error } = await dbHelpers.getAnalysisHistory(userId)
  if (error) {
    console.error('Error loading history:', error)
    return
  }
  
  // Display history in UI
  displayAnalysisHistory(analyses)
}

function displayAnalysisHistory(analyses) {
  const historyList = document.getElementById('historyList')
  const historySection = document.getElementById('historySection')
  
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
  }
}

function clearUserData() {
  document.getElementById('usageCount').textContent = 'Sign in to track usage'
  document.getElementById('historySection').classList.add('hidden')
}
