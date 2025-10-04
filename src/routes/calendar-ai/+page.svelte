<script lang="ts">
  import { onMount } from 'svelte';
  
  let message = '';
  let aiResponse = '';
  let loading = false;
  let calendarEvents = [];
  let participants = [];
  let freeTimeResult = null;
  let scheduleResult = null;
  
  // Event scheduling form
  let eventTitle = '';
  let eventDescription = '';
  let eventDuration = 60;
  let eventAttendees = '';
  let eventLocation = '';
  
  onMount(async () => {
    await loadCalendarData();
  });
  
  async function loadCalendarData() {
    try {
      const response = await fetch('/api/calendar');
      const data = await response.json();
      
      if (data.success) {
        calendarEvents = data.events;
        participants = data.participants;
      }
    } catch (error) {
      console.error('Error loading calendar data:', error);
    }
  }
  
  async function sendMessage() {
    if (!message.trim()) return;
    
    loading = true;
    try {
      const response = await fetch(`/api/ai?message=${encodeURIComponent(message)}`);
      const data = await response.json();
      
      if (data.response) {
        aiResponse = data.response;
      } else {
        aiResponse = 'Error: ' + (data.error || 'Unknown error');
      }
    } catch (error) {
      aiResponse = 'Error: ' + error;
    } finally {
      loading = false;
    }
  }
  
  async function findFreeTime() {
    loading = true;
    try {
      const response = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'findFreeTime',
          duration: eventDuration,
          days: 7
        })
      });
      
      const data = await response.json();
      freeTimeResult = data;
    } catch (error) {
      freeTimeResult = { success: false, message: 'Error: ' + error };
    } finally {
      loading = false;
    }
  }
  
  async function scheduleEvent() {
    if (!eventTitle.trim()) {
      alert('Please enter an event title');
      return;
    }
    
    loading = true;
    try {
      const response = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'scheduleEvent',
          title: eventTitle,
          description: eventDescription,
          duration: eventDuration,
          attendees: eventAttendees.split(',').map(email => email.trim()).filter(Boolean),
          location: eventLocation
        })
      });
      
      const data = await response.json();
      scheduleResult = data;
      
      if (data.success) {
        // Clear form
        eventTitle = '';
        eventDescription = '';
        eventDuration = 60;
        eventAttendees = '';
        eventLocation = '';
        
        // Reload calendar data
        await loadCalendarData();
      }
    } catch (error) {
      scheduleResult = { success: false, message: 'Error: ' + error };
    } finally {
      loading = false;
    }
  }
</script>

<div class="container mx-auto p-6 max-w-4xl">
  <h1 class="text-3xl font-bold mb-6">🤖 AI Calendar Assistant</h1>
  
  <!-- AI Chat Section -->
  <div class="bg-white rounded-lg shadow-md p-6 mb-6">
    <h2 class="text-xl font-semibold mb-4">💬 Chat with AI</h2>
    
    <div class="mb-4">
      <input
        type="text"
        bind:value={message}
        placeholder="Ask me about scheduling, free time, or anything else..."
        class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        on:keydown={(e) => e.key === 'Enter' && sendMessage()}
      />
    </div>
    
    <button
      on:click={sendMessage}
      disabled={loading || !message.trim()}
      class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? 'Thinking...' : 'Send Message'}
    </button>
    
    {#if aiResponse}
      <div class="mt-4 p-4 bg-gray-50 rounded-lg">
        <h3 class="font-semibold mb-2">AI Response:</h3>
        <p class="whitespace-pre-wrap">{aiResponse}</p>
      </div>
    {/if}
  </div>
  
  <!-- Calendar Operations Section -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Find Free Time -->
    <div class="bg-white rounded-lg shadow-md p-6">
      <h2 class="text-xl font-semibold mb-4">🔍 Find Free Time</h2>
      
      <div class="mb-4">
        <label class="block text-sm font-medium mb-2">Duration (minutes):</label>
        <input
          type="number"
          bind:value={eventDuration}
          min="15"
          max="480"
          class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>
      
      <button
        on:click={findFreeTime}
        disabled={loading}
        class="w-full bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50"
      >
        {loading ? 'Searching...' : 'Find Free Time'}
      </button>
      
      {#if freeTimeResult}
        <div class="mt-4 p-4 rounded-lg {freeTimeResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
          <h3 class="font-semibold mb-2">{freeTimeResult.success ? '✅ Available Time Found' : '❌ No Time Found'}</h3>
          <p class="text-sm">{freeTimeResult.message}</p>
          {#if freeTimeResult.availableTime}
            <div class="mt-2 text-sm">
              <p><strong>Start:</strong> {new Date(freeTimeResult.availableTime.startTime).toLocaleString()}</p>
              <p><strong>End:</strong> {new Date(freeTimeResult.availableTime.endTime).toLocaleString()}</p>
              <p><strong>Duration:</strong> {freeTimeResult.availableTime.duration} minutes</p>
            </div>
          {/if}
        </div>
      {/if}
    </div>
    
    <!-- Schedule Event -->
    <div class="bg-white rounded-lg shadow-md p-6">
      <h2 class="text-xl font-semibold mb-4">📅 Schedule Event</h2>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2">Event Title:</label>
          <input
            type="text"
            bind:value={eventTitle}
            placeholder="Team Meeting"
            class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Description:</label>
          <textarea
            bind:value={eventDescription}
            placeholder="Optional description..."
            class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            rows="2"
          ></textarea>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Duration (minutes):</label>
          <input
            type="number"
            bind:value={eventDuration}
            min="15"
            max="480"
            class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Attendees (emails, comma-separated):</label>
          <input
            type="text"
            bind:value={eventAttendees}
            placeholder="john@example.com, jane@example.com"
            class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Location:</label>
          <input
            type="text"
            bind:value={eventLocation}
            placeholder="Conference Room A"
            class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      
      <button
        on:click={scheduleEvent}
        disabled={loading || !eventTitle.trim()}
        class="w-full mt-4 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Scheduling...' : 'Schedule Event'}
      </button>
      
      {#if scheduleResult}
        <div class="mt-4 p-4 rounded-lg {scheduleResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
          <h3 class="font-semibold mb-2">{scheduleResult.success ? '✅ Event Scheduled' : '❌ Scheduling Failed'}</h3>
          <p class="text-sm">{scheduleResult.message}</p>
          {#if scheduleResult.success && scheduleResult.startTime}
            <div class="mt-2 text-sm">
              <p><strong>Start:</strong> {new Date(scheduleResult.startTime).toLocaleString()}</p>
              <p><strong>End:</strong> {new Date(scheduleResult.endTime).toLocaleString()}</p>
              <p><strong>Participants:</strong> {scheduleResult.participants?.join(', ')}</p>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
  
  <!-- Calendar Events Display -->
  {#if calendarEvents.length > 0}
    <div class="bg-white rounded-lg shadow-md p-6 mt-6">
      <h2 class="text-xl font-semibold mb-4">📅 Recent Calendar Events</h2>
      <div class="text-sm text-gray-600 mb-4">
        Showing events for: {participants.join(', ')}
      </div>
      
      <div class="space-y-2">
        {#each calendarEvents.slice(0, 10) as event}
          <div class="p-3 bg-gray-50 rounded-lg">
            <div class="font-medium">{event.summary || 'Untitled Event'}</div>
            <div class="text-sm text-gray-600">
              {new Date(event.start?.dateTime || event.start?.date).toLocaleString()} - 
              {new Date(event.end?.dateTime || event.end?.date).toLocaleString()}
            </div>
            <div class="text-xs text-gray-500">Owner: {event.calendarOwner}</div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .container {
    font-family: system-ui, -apple-system, sans-serif;
  }
</style>
