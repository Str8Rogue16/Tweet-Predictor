-- Tweet Performance Predictor Database Schema for Supabase

-- Users table (extends Supabase auth.users)
CREATE TABLE public.user_profiles (
    user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
    full_name TEXT,
    email TEXT UNIQUE NOT NULL,
    plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'pack', 'pro')),
    analyses_remaining INTEGER DEFAULT 3,
    total_analyses_used INTEGER DEFAULT 0,
    daily_reset_date DATE DEFAULT CURRENT_DATE,
    pack_analyses_remaining INTEGER DEFAULT 0, -- For one-time pack purchases
    subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'cancelled')),
    subscription_id TEXT, -- Stripe subscription ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tweet analyses table
CREATE TABLE public.tweet_analyses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    tweet_content TEXT NOT NULL,
    overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
    engagement_level TEXT CHECK (engagement_level IN ('Low', 'Medium', 'High', 'Very High')),
    reach_level TEXT CHECK (reach_level IN ('Limited', 'Moderate', 'Good', 'Excellent')),
    detailed_analysis TEXT,
    suggestions JSONB,
    optimal_posting_time TEXT,
    analysis_metadata JSONB, -- Store additional analysis data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage tracking table for analytics
CREATE TABLE public.usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('analysis', 'login', 'signup')),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscription events table
CREATE TABLE public.subscription_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'cancelled', 'payment_succeeded', 'payment_failed')),
    stripe_event_id TEXT UNIQUE,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX idx_tweet_analyses_user_id ON public.tweet_analyses(user_id);
CREATE INDEX idx_tweet_analyses_created_at ON public.tweet_analyses(created_at DESC);
CREATE INDEX idx_usage_logs_user_id ON public.usage_logs(user_id);
CREATE INDEX idx_usage_logs_created_at ON public.usage_logs(created_at DESC);

-- Note: Row Level Security policies removed for compatibility
-- If using Supabase/PostgreSQL, you can add RLS policies through the dashboard

-- Note: PostgreSQL-specific functions and triggers removed for compatibility
-- If using Supabase/PostgreSQL, you can add these through the SQL editor:

-- Example function for daily reset (PostgreSQL only):
-- CREATE OR REPLACE FUNCTION reset_daily_analyses() RETURNS void AS $
-- BEGIN
--     UPDATE public.user_profiles 
--     SET analyses_remaining = CASE 
--         WHEN plan_type = 'free' THEN 3
--         WHEN plan_type = 'pro' THEN 999999
--         ELSE analyses_remaining
--     END,
--     daily_reset_date = CURRENT_DATE
--     WHERE daily_reset_date < CURRENT_DATE;
-- END;
-- $ LANGUAGE plpgsql;
