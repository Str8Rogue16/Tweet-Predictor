// supabase-config.js
// Supabase configuration - Replace with your actual values
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'SUPABASE_URL'
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'SUPABASE_ANON_KEY'

// Validate configuration
if (supabaseUrl.includes('SUPABASE_URL') || supabaseAnonKey.includes('SUPABASE_ANON_KEY')) {
  console.error('Please update your Supabase credentials in the configuration file')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Add debug mode for troubleshooting
    debug: process.env.NODE_ENV === 'development'
  }
})

// Authentication helper functions
export const authHelpers = {
  // Sign up new user with profile creation
  async signUp(email, password, fullName) {
    try {
      console.log('Attempting to sign up user:', email)
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      })

      if (error) {
        console.error('Sign up error:', error)
        return { data: null, error }
      }

      // Create user profile after successful signup
      if (data.user && !data.user.email_confirmed_at) {
        console.log('User created, email confirmation required')
      } else if (data.user) {
        await this.createUserProfile(data.user.id, fullName, email)
      }

      return { data, error: null }
    } catch (err) {
      console.error('Sign up exception:', err)
      return { data: null, error: err }
    }
  },

  // Create user profile
  async createUserProfile(userId, fullName, email) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          user_id: userId,
          full_name: fullName,
          email: email,
          plan_type: 'free',
          pack_analyses_remaining: 0,
          total_analyses_used: 0,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating user profile:', error)
      }

      return { data, error }
    } catch (err) {
      console.error('Create profile exception:', err)
      return { data: null, error: err }
    }
  },

  // Sign in user
  async signIn(email, password) {
    try {
      console.log('Attempting to sign in user:', email)
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        console.error('Sign in error:', error)
        return { data: null, error }
      }

      console.log('Sign in successful:', data.user?.email)
      
      // Ensure user profile exists
      if (data.user) {
        const { data: profile } = await dbHelpers.getUserProfile(data.user.id)
        if (!profile) {
          console.log('Creating missing user profile')
          await this.createUserProfile(
            data.user.id, 
            data.user.user_metadata?.full_name || 'User', 
            data.user.email
          )
        }
      }

      return { data, error: null }
    } catch (err) {
      console.error('Sign in exception:', err)
      return { data: null, error: err }
    }
  },

  // Sign out user
  async signOut() {
    try {
      console.log('Signing out user')
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        console.error('Sign out error:', error)
      }
      
      return { error }
    } catch (err) {
      console.error('Sign out exception:', err)
      return { error: err }
    }
  },

  // Get current user
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error) {
        console.error('Get user error:', error)
      }
      
      return { user, error }
    } catch (err) {
      console.error('Get user exception:', err)
      return { user: null, error: err }
    }
  },

  // Get user session
  async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Get session error:', error)
      }
      
      return { session, error }
    } catch (err) {
      console.error('Get session exception:', err)
      return { session: null, error: err }
    }
  },

  // Test connection
  async testConnection() {
    try {
      const { data, error } = await supabase.from('user_profiles').select('count').limit(1)
      
      if (error) {
        console.error('Connection test failed:', error)
        return { connected: false, error }
      }
      
      console.log('Supabase connection successful')
      return { connected: true, error: null }
    } catch (err) {
      console.error('Connection test exception:', err)
      return { connected: false, error: err }
    }
  }
}

// Database helper functions (existing code with error handling improvements)
export const dbHelpers = {
  // Get user profile with better error handling
  async getUserProfile(userId) {
    try {
      if (!userId) {
        return { data: null, error: 'User ID is required' }
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single()
        
      if (error && error.code === 'PGRST116') {
        // No rows returned - profile doesn't exist
        console.log('User profile not found for:', userId)
        return { data: null, error: 'Profile not found' }
      }
      
      return { data, error }
    } catch (err) {
      console.error('Get user profile exception:', err)
      return { data: null, error: err }
    }
  },

  // Update user profile
  async updateUserProfile(userId, updates) {
    try {
      if (!userId) {
        return { data: null, error: 'User ID is required' }
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('user_id', userId)
        .select()
        .single()
        
      return { data, error }
    } catch (err) {
      console.error('Update user profile exception:', err)
      return { data: null, error: err }
    }
  },

  // Check if user can perform analysis
  async canPerformAnalysis(userId) {
    try {
      if (!userId) {
        return { canAnalyze: false, error: 'User ID is required' }
      }

      const { data: profile, error } = await this.getUserProfile(userId)
      if (error || !profile) {
        return { canAnalyze: false, error: error || 'Profile not found' }
      }

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

        if (countError) {
          console.error('Error counting analyses:', countError)
          return { canAnalyze: false, error: countError }
        }
        
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
      console.error('Can perform analysis exception:', err)
      return { canAnalyze: false, error: err }
    }
  },

  // Rest of your existing dbHelpers methods...
  // (keeping them as they are since they look correct)
  
  async consumeAnalysisCredit(userId) {
    try {
      const { data: profile, error } = await this.getUserProfile(userId)
      if (error) return { success: false, error }

      if (profile.plan_type === 'pack') {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ 
            pack_analyses_remaining: Math.max(0, (profile.pack_analyses_remaining || 0) - 1),
            total_analyses_used: (profile.total_analyses_used || 0) + 1
          })
          .eq('user_id', userId)
        
        return { success: !updateError, error: updateError }
      }

      if (profile.plan_type === 'free') {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ 
            total_analyses_used: (profile.total_analyses_used || 0) + 1
          })
          .eq('user_id', userId)
        
        return { success: !updateError, error: updateError }
      }

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

// Rest of your existing code (realtimeHelpers, uiHelpers, etc.)
// ... keeping as they are

// Initialize auth state listener with better error handling
export function initAuthListener() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state changed:', event, session?.user?.email)
    
    try {
      switch (event) {
        case 'SIGNED_IN':
          console.log('User signed in:', session.user.email)
          if (typeof uiHelpers !== 'undefined') {
            uiHelpers.handleSignIn(session.user)
          }
          break
        case 'SIGNED_OUT':
          console.log('User signed out')
          if (typeof uiHelpers !== 'undefined') {
            uiHelpers.handleSignOut()
          }
          break
        case 'TOKEN_REFRESHED':
          console.log('Token refreshed')
          break
        default:
          console.log('Unhandled auth event:', event)
      }
    } catch (err) {
      console.error('Error in auth state change handler:', err)
    }
  })
}

// For browser environments, make available globally
if (typeof window !== 'undefined') {
  window.supabase = supabase
  window.authHelpers = authHelpers
  window.dbHelpers = dbHelpers
  window.initAuthListener = initAuthListener
}
