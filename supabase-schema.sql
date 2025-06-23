-- Optimized Tweet Performance Predictor Database Schema for Supabase
-- Combines best features from both schemas with additional optimizations

-- ============================================================================
-- TABLES
-- ============================================================================

-- Enhanced user profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    full_name TEXT,
    email TEXT UNIQUE NOT NULL,
    plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'pack', 'pro')),
    
    -- Usage tracking
    analyses_remaining INTEGER DEFAULT 3,
    pack_analyses_remaining INTEGER DEFAULT 0,
    total_analyses_used INTEGER DEFAULT 0,
    daily_reset_date DATE DEFAULT CURRENT_DATE,
    
    -- Subscription management
    subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'cancelled', 'past_due', 'unpaid')),
    subscription_id TEXT, -- Stripe subscription ID
    customer_id TEXT, -- Stripe customer ID
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced tweet analyses table
CREATE TABLE IF NOT EXISTS public.tweet_analyses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Tweet content and analysis
    tweet_content TEXT NOT NULL,
    tweet_length INTEGER GENERATED ALWAYS AS (LENGTH(tweet_content)),
    
    -- Scores and levels with validation
    overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
    engagement_level TEXT CHECK (engagement_level IN ('Low', 'Medium', 'High', 'Very High')),
    reach_level TEXT CHECK (reach_level IN ('Limited', 'Moderate', 'Good', 'Excellent')),
    
    -- Analysis results
    detailed_analysis JSONB NOT NULL DEFAULT '{}',
    suggestions JSONB DEFAULT '[]',
    optimal_posting_time TEXT,
    
    -- Metadata and tracking
    analysis_metadata JSONB DEFAULT '{}',
    analysis_version TEXT DEFAULT '1.0', -- Track analysis algorithm version
    processing_time_ms INTEGER, -- Track performance
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced usage logs table
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Action tracking
    action_type TEXT NOT NULL CHECK (action_type IN ('analysis', 'login', 'signup', 'subscription_created', 'subscription_updated', 'subscription_cancelled', 'payment_succeeded', 'payment_failed', 'pack_purchased')),
    resource_id UUID, -- Reference to related resource (e.g., analysis_id)
    
    -- Request tracking
    ip_address INET,
    user_agent TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscription events table for Stripe webhook handling
CREATE TABLE IF NOT EXISTS public.subscription_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Stripe event details
    event_type TEXT NOT NULL CHECK (event_type IN ('customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_succeeded', 'invoice.payment_failed', 'checkout.session.completed')),
    stripe_event_id TEXT UNIQUE NOT NULL,
    subscription_id TEXT,
    customer_id TEXT,
    
    -- Event data
    event_data JSONB NOT NULL DEFAULT '{}',
    processed BOOLEAN DEFAULT FALSE,
    processing_error TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User settings table for preferences
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    
    -- Notification preferences
    email_notifications BOOLEAN DEFAULT TRUE,
    analysis_reminders BOOLEAN DEFAULT TRUE,
    
    -- UI preferences
    theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
    timezone TEXT DEFAULT 'UTC',
    
    -- Analysis preferences
    default_posting_schedule JSONB DEFAULT '{}', -- Store preferred posting times
    analysis_depth TEXT DEFAULT 'standard' CHECK (analysis_depth IN ('quick', 'standard', 'detailed')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- User profiles indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_plan_type ON public.user_profiles(plan_type);
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_status ON public.user_profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_daily_reset ON public.user_profiles(daily_reset_date) WHENEVER (plan_type = 'free');

-- Tweet analyses indexes
CREATE INDEX IF NOT EXISTS idx_tweet_analyses_user_id ON public.tweet_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_tweet_analyses_created_at ON public.tweet_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweet_analyses_overall_score ON public.tweet_analyses(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_tweet_analyses_user_created ON public.tweet_analyses(user_id, created_at DESC);

-- Usage logs indexes
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON public.usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON public.usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action_type ON public.usage_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_action ON public.usage_logs(user_id, action_type, created_at DESC);

-- Subscription events indexes
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON public.subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_stripe_id ON public.subscription_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_processed ON public.subscription_events(processed, created_at) WHERE NOT processed;

-- User settings indexes
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tweet_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- User profiles policies
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Tweet analyses policies
CREATE POLICY "Users can view own analyses" ON public.tweet_analyses
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses" ON public.tweet_analyses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analyses" ON public.tweet_analyses
    FOR UPDATE USING (auth.uid() = user_id);

-- Usage logs policies (read-only for users)
CREATE POLICY "Users can view own usage logs" ON public.usage_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert usage logs" ON public.usage_logs
    FOR INSERT WITH CHECK (true); -- Allow system/service to insert logs

-- Subscription events policies (read-only for users)
CREATE POLICY "Users can view own subscription events" ON public.subscription_events
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can manage subscription events" ON public.subscription_events
    FOR ALL WITH CHECK (true); -- Allow webhook handlers to manage events

-- User settings policies
CREATE POLICY "Users can manage own settings" ON public.user_settings
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create user profile and settings on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Create user profile
    INSERT INTO public.user_profiles (user_id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
        NEW.email
    );
    
    -- Create default user settings
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id);
    
    -- Log the signup
    INSERT INTO public.usage_logs (user_id, action_type, metadata)
    VALUES (
        NEW.id,
        'signup',
        jsonb_build_object(
            'signup_method', COALESCE(NEW.raw_user_meta_data->>'provider', 'email'),
            'created_at', NEW.created_at
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile and settings on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to reset daily analyses for free users
CREATE OR REPLACE FUNCTION reset_daily_analyses()
RETURNS void AS $$
BEGIN
    UPDATE public.user_profiles 
    SET 
        analyses_remaining = CASE 
            WHEN plan_type = 'free' THEN 3
            WHEN plan_type = 'pro' THEN 999999
            ELSE analyses_remaining
        END,
        daily_reset_date = CURRENT_DATE
    WHERE daily_reset_date < CURRENT_DATE
    AND plan_type IN ('free');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrement analysis count
CREATE OR REPLACE FUNCTION decrement_analysis_count(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_plan TEXT;
    remaining_analyses INTEGER;
    pack_remaining INTEGER;
BEGIN
    -- Get current user data
    SELECT plan_type, analyses_remaining, pack_analyses_remaining 
    INTO user_plan, remaining_analyses, pack_remaining
    FROM public.user_profiles 
    WHERE user_id = user_uuid;
    
    -- Pro users have unlimited analyses
    IF user_plan = 'pro' THEN
        UPDATE public.user_profiles 
        SET total_analyses_used = total_analyses_used + 1
        WHERE user_id = user_uuid;
        RETURN TRUE;
    END IF;
    
    -- Use pack analyses first if available
    IF pack_remaining > 0 THEN
        UPDATE public.user_profiles 
        SET 
            pack_analyses_remaining = pack_analyses_remaining - 1,
            total_analyses_used = total_analyses_used + 1
        WHERE user_id = user_uuid;
        RETURN TRUE;
    END IF;
    
    -- Use daily analyses for free users
    IF user_plan = 'free' AND remaining_analyses > 0 THEN
        UPDATE public.user_profiles 
        SET 
            analyses_remaining = analyses_remaining - 1,
            total_analyses_used = total_analyses_used + 1
        WHERE user_id = user_uuid;
        RETURN TRUE;
    END IF;
    
    -- No analyses remaining
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- User analytics view
CREATE OR REPLACE VIEW user_analytics AS
SELECT 
    up.user_id,
    up.full_name,
    up.email,
    up.plan_type,
    up.subscription_status,
    up.total_analyses_used,
    up.created_at as user_created_at,
    COUNT(ta.id) as total_analyses,
    AVG(ta.overall_score) as avg_score,
    MAX(ta.created_at) as last_analysis_date,
    COUNT(CASE WHEN ta.created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as analyses_last_30_days
FROM public.user_profiles up
LEFT JOIN public.tweet_analyses ta ON up.user_id = ta.user_id
GROUP BY up.user_id, up.full_name, up.email, up.plan_type, up.subscription_status, up.total_analyses_used, up.created_at;

-- Recent analyses view
CREATE OR REPLACE VIEW recent_analyses AS
SELECT 
    ta.id,
    ta.user_id,
    up.full_name,
    ta.tweet_content,
    ta.overall_score,
    ta.engagement_level,
    ta.reach_level,
    ta.created_at
FROM public.tweet_analyses ta
JOIN public.user_profiles up ON ta.user_id = up.user_id
ORDER BY ta.created_at DESC;

-- ============================================================================
-- INITIAL DATA AND SETUP
-- ============================================================================

-- Create a function to set up initial data (run once)
CREATE OR REPLACE FUNCTION setup_initial_data()
RETURNS void AS $$
BEGIN
    -- Any initial data setup can go here
    -- For example, default settings, admin users, etc.
    
    RAISE NOTICE 'Database schema setup completed successfully!';
END;
$$ LANGUAGE plpgsql;

-- Uncomment to run initial setup
-- SELECT setup_initial_data();
