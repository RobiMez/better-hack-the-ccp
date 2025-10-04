# Multi-User Google Calendar Free Time Finder

This tool reads Google Calendars for multiple users and finds common free time slots where ALL users are available for the next 7 days. It also supports single-user mode for personal calendar analysis.

## Setup Instructions

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the Google Calendar API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

4. Create OAuth 2.0 Credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Desktop app" as the application type
   - Name it (e.g., "Calendar Free Time Finder")
   - Click "Create"
   - Download or copy the Client ID and Client Secret

5. Configure your `.env` file with these variables:
   ```
   # Google Calendar OAuth
   GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
   
   # Google AI (Gemini) - Optional, can use GOOGLE_GENERATIVE_AI_API_KEY instead
   GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key_here
   ```

### 3. Run the Application

#### Single User Mode (Personal Calendar)
```bash
pnpm dev
```

#### Multi-User Mode (Find Common Free Time)
```bash
# For 2 users
pnpm dev -- --multi-user 2

# For 3 users  
pnpm dev -- --multi-user 3

# For any number of users
pnpm dev -- --multi-user [number]
```

#### Friends Mode (Show Individual Free Time)
```bash
# Manage your friends list and see their free time
pnpm dev -- --friends
```

**First Time Setup:**
1. **Single User**: You'll see a URL in the console, open it and authorize
2. **Multi-User**: Each user will get a URL to authorize their calendar
3. **Friends Mode**: Interactive friends management system:
   - Add friends by name
   - Each friend gets a URL to authorize their calendar
   - Friends are saved and can be reused
   - Manage your friends list (add/remove)

**Token Storage:**
- Single user: `token.json` file is created
- Multi-user: `token-user-1.json`, `token-user-2.json`, etc. are created
- Friends: `friends-config.json` stores all your friends' tokens
- Tokens are saved automatically - you won't need to authorize again unless you delete these files

## Features

### Single User Mode
- 📅 Fetches events from all your Google Calendars
- 🕒 Calculates free time slots between 9 AM and 5 PM (configurable)
- 📊 Shows free time for the next 7 days
- ⏱️ Displays duration of each free slot

### Multi-User Mode (Common Free Time)
- 👥 Supports multiple users (2, 3, 4+ people)
- 🔍 Finds common free time slots where ALL users are available
- 📅 Fetches events from all calendars for each user
- 🤖 Uses AI to intelligently analyze and find optimal meeting times
- ⏰ Shows only time slots where everyone is free
- 📊 Groups results by day for easy scheduling

### Friends Mode (Individual Free Time)
- 👥 Supports multiple friends/people (2, 3, 4+ people)
- 📅 Shows each person's individual free time slots separately
- 🔍 Perfect for seeing when each friend is available
- 📊 Groups results by person, then by day
- ⏰ Shows all free time for each person (not just common slots)
- 🤖 Uses AI to analyze each person's schedule individually

## Customization

You can customize the work hours by editing `index.ts`:

```typescript
const freeTime = calculateFreeTime(events, 9, 17); // Change 9 and 17 to your preferred hours
```

## Files

- `index.ts` - Main application entry point with multi-user support
- `calendar-utils.ts` - Calendar API utilities for single and multi-user scenarios
- `token.json` - Saved OAuth token for single user (auto-generated, don't commit!)
- `token-user-*.json` - Saved OAuth tokens for multi-user mode (auto-generated, don't commit!)
- `.env` - Your API credentials (don't commit!)

## Examples

### Find free time for yourself
```bash
pnpm dev
```

### Find common free time for 2 people
```bash
pnpm dev -- --multi-user 2
```

### Find common free time for a team of 4
```bash
pnpm dev -- --multi-user 4
```

### See individual free time for your friends
```bash
pnpm dev -- --friends
```

