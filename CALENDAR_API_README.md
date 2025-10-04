# 🤖 AI Calendar API - SvelteKit Integration

This document explains how to use the converted SvelteKit API endpoints for calendar operations and AI-powered scheduling.

## 📁 File Structure

```
src/routes/api/
├── ai/
│   ├── +server.ts          # AI chat endpoint
│   └── calendar-utils.ts   # Calendar utility functions
├── calendar/
│   └── +server.ts          # Calendar operations endpoint
└── events/
    └── +server.ts          # Existing events endpoint

src/routes/calendar-ai/
└── +page.svelte            # UI for calendar AI features
```

## 🚀 API Endpoints

### 1. AI Chat Endpoint
**GET** `/api/ai?message=<your_message>`

Get AI responses with calendar context.

**Example:**
```javascript
const response = await fetch('/api/ai?message=When can we all meet?');
const data = await response.json();
console.log(data.response); // AI response
```

### 2. Calendar Operations Endpoint
**GET** `/api/calendar`

Get calendar events for all participants.

**Response:**
```json
{
  "success": true,
  "events": [...],
  "formattedEvents": "...",
  "participants": ["User1", "User2"]
}
```

**POST** `/api/calendar`

Find free time or schedule events.

**Find Free Time:**
```javascript
const response = await fetch('/api/calendar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'findFreeTime',
    duration: 60,  // minutes
    days: 7        // days to look ahead
  })
});
```

**Schedule Event:**
```javascript
const response = await fetch('/api/calendar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'scheduleEvent',
    title: 'Team Meeting',
    description: 'Weekly team sync',
    duration: 60,
    attendees: ['john@example.com', 'jane@example.com'],
    location: 'Conference Room A'
  })
});
```

## 🎯 Features

### ✅ Converted from Node.js to SvelteKit
- **Before**: Standalone Node.js script with command-line interface
- **After**: SvelteKit API endpoints with web interface

### ✅ AI-Powered Calendar Operations
- 🤖 **AI Chat**: Natural language calendar queries
- 🔍 **Find Free Time**: Automatically find available slots
- 📅 **Schedule Events**: Book meetings for all participants
- 👥 **Multi-User Support**: Handle multiple participants

### ✅ SvelteKit Integration
- **API Routes**: RESTful endpoints for calendar operations
- **Type Safety**: Full TypeScript support
- **Error Handling**: Proper HTTP status codes and error messages
- **Authentication**: Integrates with existing auth system

## 🛠️ Setup Instructions

### 1. Environment Variables
Make sure you have these in your `.env` file:
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5173/oauth2callback
```

### 2. Friends Configuration
The system uses a `friends-config.json` file to store participant information:
```json
{
  "friends": [
    {
      "id": "friend-123",
      "name": "John Doe",
      "tokens": {
        "access_token": "...",
        "refresh_token": "..."
      }
    }
  ]
}
```

### 3. Usage Examples

#### Frontend Integration
```svelte
<script>
  let message = '';
  let aiResponse = '';
  
  async function sendMessage() {
    const response = await fetch(`/api/ai?message=${encodeURIComponent(message)}`);
    const data = await response.json();
    aiResponse = data.response;
  }
  
  async function findFreeTime() {
    const response = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'findFreeTime',
        duration: 60,
        days: 7
      })
    });
    const data = await response.json();
    console.log('Available time:', data.availableTime);
  }
</script>

<input bind:value={message} placeholder="Ask about scheduling..." />
<button on:click={sendMessage}>Send</button>
<div>{aiResponse}</div>
```

#### Direct API Usage
```javascript
// Find free time
const freeTime = await fetch('/api/calendar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'findFreeTime',
    duration: 90,
    days: 14
  })
}).then(r => r.json());

// Schedule a meeting
const meeting = await fetch('/api/calendar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'scheduleEvent',
    title: 'Project Review',
    description: 'Weekly project status review',
    duration: 60,
    attendees: ['team@company.com']
  })
}).then(r => r.json());
```

## 🔧 Key Differences from Original

### Original Node.js Script
- Command-line interface with readline
- Interactive chat loop
- File-based token storage
- Direct console output

### Converted SvelteKit API
- RESTful API endpoints
- JSON request/response format
- Web-based interface
- Integrated with SvelteKit routing
- Type-safe with TypeScript

## 🎉 Benefits of SvelteKit Conversion

1. **Web Integration**: Works seamlessly with your SvelteKit app
2. **API-First**: Can be used by any frontend framework
3. **Type Safety**: Full TypeScript support
4. **Error Handling**: Proper HTTP status codes
5. **Scalability**: Can be deployed to any SvelteKit-compatible platform
6. **Maintainability**: Follows SvelteKit conventions and best practices

## 🚀 Next Steps

1. **Test the API**: Visit `/calendar-ai` to test the interface
2. **Integrate**: Use the API endpoints in your existing components
3. **Customize**: Modify the UI and add your own features
4. **Deploy**: Deploy your SvelteKit app with the new calendar functionality

The conversion is complete and ready to use! 🎯
