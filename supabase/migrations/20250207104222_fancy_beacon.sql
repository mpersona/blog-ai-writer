/*
  # Add RLS policies for blog_posts table

  1. Security
    - Enable RLS on blog_posts table if not already enabled
    - Add policy for anonymous users to insert blog posts
    - Add policy for anonymous users to read blog posts
*/

-- Enable RLS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to insert blog posts
CREATE POLICY "Anyone can insert blog posts"
ON blog_posts
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anonymous users to read blog posts
CREATE POLICY "Anyone can read blog posts"
ON blog_posts
FOR SELECT
TO anon
USING (true);