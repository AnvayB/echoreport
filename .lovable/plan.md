

# Productivity Journal & Weekly Report App

## Overview
A personal work journal with AI-powered weekly report generation. Google login, daily accomplishment tracking, next-day task retrieval, and a Friday weekly email draft generator.

## Architecture
- **Frontend**: React + Tailwind + shadcn/ui
- **Backend**: Lovable Cloud (Supabase) — database, auth, edge functions
- **AI**: Lovable AI Gateway for daily recaps, task breakdowns, and weekly report generation
- **Auth**: Google login via Lovable Cloud

## Database Schema

### `daily_entries` table
- `id`, `user_id`, `entry_date`, `accomplishments` (text), `pending_tasks` (text), `blockers` (text), `notes` (text), `created_at`, `updated_at`
- RLS: users can only access their own entries

### `weekly_reports` table
- `id`, `user_id`, `week_start`, `week_end`, `report_draft` (text), `email_template` (text), `created_at`, `updated_at`
- RLS: users can only access their own reports

### `user_settings` table
- `id`, `user_id`, `email_template` (text — configurable weekly report format/style prompt)
- RLS: users can only access their own settings

## Pages & Components

### 1. Login Page
- Google sign-in button, minimal branding

### 2. Dashboard (Current Week)
- Week label (e.g., "April 6–10, 2026")
- Day cards (Mon–Fri) showing entry status (completed/empty)
- Click a day to open the daily entry form
- "What are my tasks for today?" button — fetches yesterday's pending items via AI summary
- "Generate Weekly Report" button (visible on Friday or anytime)

### 3. Daily Entry Form
- Date header
- Text areas for: Accomplishments, Pending Tasks, Blockers/Notes
- Voice input button (Web Speech API) that transcribes into the active text field
- Save button → persists to `daily_entries`

### 4. "Tasks for Today" View
- AI reads yesterday's entry and presents: what was completed, what's still pending, carryover items
- Clean card/list layout

### 5. Weekly Report Generator
- Collects all daily entries for the selected week
- Sends to AI with the user's email template/prompt
- Displays editable text area with the generated email draft
- Copy-to-clipboard button
- Save draft button → persists to `weekly_reports`

### 6. Settings Page
- Editable email template/prompt textarea
- Example default template provided

## Edge Functions

### `ai-daily-tasks`
- Input: previous day's entry
- Output: structured task breakdown for today

### `ai-weekly-report`
- Input: all daily entries for the week + user's email template
- Output: formatted weekly email draft

## Voice Input
- Browser Web Speech API (`SpeechRecognition`)
- Microphone button on each text field in the daily entry form
- Transcribed text appended to the active field
- Graceful fallback if browser doesn't support it

## Key UX Details
- Week navigation (prev/next week)
- Auto-save or explicit save for daily entries
- Toast notifications for save confirmations
- Mobile-responsive layout
- Clean, minimal design — light theme, card-based layout

## Implementation Order
1. Set up Lovable Cloud + Google auth + database tables with RLS
2. Login page + auth flow
3. Dashboard with week view and day cards
4. Daily entry form (text input + save/retrieve)
5. "Tasks for today" AI assistant view
6. Weekly report generator with editable draft
7. Settings page for email template
8. Voice input enhancement

