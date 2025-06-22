-- Tweet Performance Predictor Database Schema for Supabase

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'SUPABASE_JWT_SECRET';

-- Users table (extends Supabase auth.users)
CREATE TABLE public.user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
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
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    tweet_content TEXT NOT NULL,
    overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
    engagement_level TEXT CHECK (engagement_level IN ('Low', 'Medium', 'High', 'Very High')),
    reach_level TEXT CHECK (reach_level IN ('Limited', 'Moderate', 'Good', 'Excellent')),
    detailed_analysis TEXT,
    suggestions TEXT[],
    optimal_posting_time TEXT,
    analysis_metadata JSONB, -- Store additional analysis data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage tracking table for analytics
CREATE TABLE public.usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('analysis', 'login', 'signup')),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscription events table
CREATE TABLE public.subscription_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'cancelled', 'payment_succeeded', 'payment_failed')),
    stripe_event_id TEXT UNIQUE,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX idx_tweet_analyses_user_id ON public.tweet_analyses(user_id);
CREATE INDEX idx_tweet_analyses_created_at ON public.tweet_analyses(created_at DESC);
CREATE INDEX idx_usage_logs_user_id ON public.usage_logs(user_id);
CREATE INDEX idx_usage_logs_created_at ON public.usage_logs(created_at DESC);

-- Row Level Security Policies
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tweet_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- User profiles policies
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Tweet analyses policies
CREATE POLICY "Users can view own analyses" ON public.tweet_analyses
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses" ON public.tweet_analyses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analyses" ON public.tweet_analyses
    FOR UPDATE USING (auth.uid() = user_id);

-- Usage logs policies
CREATE POLICY "Users can view own usage logs" ON public.usage_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage logs" ON public.usage_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Subscription events policies
CREATE POLICY "Users can view own subscription events" ON public.subscription_events
    FOR SELECT USING (auth.uid() = user_id);

-- Functions for daily usage reset
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
    AND plan_type IN ('free', 'pro');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on user_profiles
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create a scheduled job to reset daily analyses (requires pg_cron extension)
-- Run this separately if you have pg_cron enabled:
-- SELECT cron.schedule('reset-daily-analyses', '0 0 * * *', 'SELECT reset_daily_analyses();');


