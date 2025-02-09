/*
  # Create blog_posts table

  1. New Tables
    - `blog_posts`
      - `id` (uuid, primary key)
      - `slug` (text, unique)
      - `headline` (text)
      - `primary_keywords` (text array)
      - `secondary_keywords` (text array)
      - `outline` (text array)
      - `created_at` (timestamp with time zone)

  2. Security
    - Enable RLS on blog_posts table
    - Add policies for anonymous access
*/

-- Create the blog_posts table
CREATE TABLE IF NOT EXISTS blog_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL,
    headline text NOT NULL,
    primary_keywords text[] NOT NULL,
    secondary_keywords text[] NOT NULL,
    outline text[] NOT NULL,
    created_at timestamptz DEFAULT now()
);

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