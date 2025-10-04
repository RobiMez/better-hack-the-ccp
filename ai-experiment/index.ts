import 'dotenv/config';
import * as fs from 'fs/promises';
import * as readline from 'readline';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import {
  createOAuth2Client,
  getAuthUrl,
  getMultiUserCalendarEvents,
  formatIndividualFreeTimeForAI,
  createCalendarEvent,
  findFirstAvailableTime,
  getPrimaryCalendarId,
} from './calendar-utils.js';

const MULTI_USER_TOKEN_PATH = './multi-user-tokens.json';
const FRIENDS_CONFIG_PATH = './friends-config.json';


/**
 * Load or get new tokens for multiple users
 */
async function authorizeMultipleUsers(userCount: number) {
  const oauth2Clients: any[] = [];

  for (let i = 0; i < userCount; i++) {
    console.log(`\n=== Setting up authentication for User ${i + 1} ===`);
    const oauth2Client = createOAuth2Client();
    
    try {
      // Try to load existing token for this user
      const tokenPath = `./token-user-${i + 1}.json`;
      const token = await fs.readFile(tokenPath, 'utf-8');
      oauth2Client.setCredentials(JSON.parse(token));
      console.log(`Loaded existing token for User ${i + 1}`);
    } catch (error) {
      console.log(`No existing token found for User ${i + 1}, getting new token...`);
      await getAccessTokenForUser(oauth2Client, i + 1);
    }
    
    oauth2Clients.push(oauth2Client);
  }

  return oauth2Clients;
}

/**
 * Load friends configuration and tokens
 */
async function loadFriendsConfig() {
  try {
    const config = await fs.readFile(FRIENDS_CONFIG_PATH, 'utf-8');
    return JSON.parse(config);
  } catch (error) {
    return { friends: [] };
  }
}

/**
 * Save friends configuration
 */
async function saveFriendsConfig(config: any) {
  await fs.writeFile(FRIENDS_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Add a new friend to the friends list
 */
async function addFriend(friendName: string) {
  console.log(`\n=== Adding ${friendName} to your friends list ===`);
  const oauth2Client = createOAuth2Client();
  
  const authUrl = getAuthUrl(oauth2Client);
  console.log(`${friendName} - Please visit this URL to authorize calendar access:`);
  console.log(authUrl);
  console.log('\nAfter authorization, you\'ll get a code. Please share that code with you.');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question(`Enter the authorization code for ${friendName}: `, async (code) => {
      rl.close();
      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        
        // Load existing config
        const config = await loadFriendsConfig();
        
        // Add new friend
        const friendId = `friend-${Date.now()}`;
        config.friends.push({
          id: friendId,
          name: friendName,
          tokens: tokens
        });
        
        // Save updated config
        await saveFriendsConfig(config);
        console.log(`✅ ${friendName} added successfully!`);
        resolve(oauth2Client);
      } catch (error) {
        console.error(`❌ Failed to add ${friendName}:`, error);
        reject(error);
      }
    });
  });
}

/**
 * Load friends and their tokens
 */
async function loadFriends() {
  const config = await loadFriendsConfig();
  const oauth2Clients: any[] = [];
  
  for (const friend of config.friends) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(friend.tokens);
    oauth2Clients.push(oauth2Client);
  }
  
  return { clients: oauth2Clients, friends: config.friends };
}

/**
 * Interactive friends management
 */
async function manageFriends() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    const config = await loadFriendsConfig();
    console.log('\n=== Friends Management ===');
    console.log('Current friends:');
    if (config.friends.length === 0) {
      console.log('  No friends added yet.');
    } else {
      config.friends.forEach((friend: any, index: number) => {
        console.log(`  ${index + 1}. ${friend.name}`);
      });
    }
    
    console.log('\nOptions:');
    console.log('1. Add a new friend');
    console.log('2. Remove a friend');
    console.log('3. Continue with current friends');
    console.log('4. Exit');
    
    const choice = await new Promise<string>((resolve) => {
      rl.question('Choose an option (1-4): ', resolve);
    });
    
    switch (choice) {
      case '1':
        const friendName = await new Promise<string>((resolve) => {
          rl.question('Enter friend\'s name: ', resolve);
        });
        try {
          await addFriend(friendName);
        } catch (error) {
          console.error('Failed to add friend:', error);
        }
        break;
      case '2':
        if (config.friends.length === 0) {
          console.log('No friends to remove.');
          break;
        }
        const removeIndex = await new Promise<string>((resolve) => {
          rl.question(`Enter friend number to remove (1-${config.friends.length}): `, resolve);
        });
        const index = parseInt(removeIndex) - 1;
        if (index >= 0 && index < config.friends.length) {
          config.friends.splice(index, 1);
          await saveFriendsConfig(config);
          console.log('Friend removed successfully!');
        } else {
          console.log('Invalid friend number.');
        }
        break;
      case '3':
        rl.close();
        return await loadFriends();
      case '4':
        rl.close();
        process.exit(0);
      default:
        console.log('Invalid option. Please choose 1-4.');
    }
  }
}

/**
 * Get OAuth token from user for specific user number
 */
async function getAccessTokenForUser(oauth2Client: any, userNumber: number): Promise<void> {
  const authUrl = getAuthUrl(oauth2Client);
  console.log(`User ${userNumber} - Authorize this app by visiting this url:`, authUrl);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question(`User ${userNumber} - Enter the code from that page here: `, async (code) => {
      rl.close();
      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        const tokenPath = `./token-user-${userNumber}.json`;
        await fs.writeFile(tokenPath, JSON.stringify(tokens));
        console.log(`Token stored to ${tokenPath}`);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}


/**
 * Book an event for all participants at the first available time
 */
async function bookEventForAllParticipants(authClients: any[], events: any[]) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // Get event details from user
    const eventTitle = await new Promise<string>((resolve) => {
      rl.question('Enter event title: ', resolve);
    });

    const eventDescription = await new Promise<string>((resolve) => {
      rl.question('Enter event description (optional): ', resolve);
    });

    const durationInput = await new Promise<string>((resolve) => {
      rl.question('Enter event duration in minutes (default: 60): ', resolve);
    });

    const duration = parseInt(durationInput) || 60;

    // Find the first available time
    console.log('\nFinding the first available time for all participants...');
    const availableTime = findFirstAvailableTime(events, duration);

    if (!availableTime) {
      console.log('❌ No available time found for all participants in the next 7 days.');
      return;
    }

    console.log(`✅ Found available time:`);
    console.log(`   Start: ${availableTime.startTime.toLocaleString()}`);
    console.log(`   End: ${availableTime.endTime.toLocaleString()}`);
    console.log(`   Duration: ${duration} minutes`);

    const confirm = await new Promise<string>((resolve) => {
      rl.question('\nDo you want to create this event? (y/n): ', resolve);
    });

    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('Event booking cancelled.');
      return;
    }

    // Create the event for each participant
    console.log('\nCreating events for all participants...');
    const createdEvents = [];

    for (let i = 0; i < authClients.length; i++) {
      try {
        const calendarId = await getPrimaryCalendarId(authClients[i]);
        const event = await createCalendarEvent(authClients[i], {
          summary: eventTitle,
          description: eventDescription,
          startTime: availableTime.startTime,
          endTime: availableTime.endTime,
          calendarId: calendarId,
        });

        createdEvents.push({
          user: i + 1,
          eventId: event.id,
          calendarId: calendarId,
        });

        console.log(`✅ Event created for User ${i + 1}`);
      } catch (error) {
        console.error(`❌ Failed to create event for User ${i + 1}:`, error);
      }
    }

    if (createdEvents.length > 0) {
      console.log(`\n🎉 Successfully created ${createdEvents.length} events!`);
      console.log('Event details:');
      console.log(`- Title: ${eventTitle}`);
      console.log(`- Start: ${availableTime.startTime.toLocaleString()}`);
      console.log(`- End: ${availableTime.endTime.toLocaleString()}`);
      console.log(`- Duration: ${duration} minutes`);
    } else {
      console.log('❌ No events were created successfully.');
    }

  } catch (error) {
    console.error('Error booking event:', error);
  } finally {
    rl.close();
  }
}

/**
 * Main function for multi-user calendar management
 */
async function main() {
  try {
    console.log('Setting up friends calendar access...\n');
    
    // Check if we have friends configured
    const config = await loadFriendsConfig();
    if (config.friends.length === 0) {
      console.log('No friends configured yet. Let\'s add some friends!\n');
      const { clients: authClients } = await manageFriends();
      
      if (authClients.length === 0) {
        console.log('No friends added. Exiting...');
        return;
      }
    } else {
      console.log(`Found ${config.friends.length} friends in your list.`);
      const { clients: authClients } = await loadFriends();
      
      console.log('\nOptions:');
      console.log('1. Use current friends');
      console.log('2. Manage friends (add/remove)');
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      const choice = await new Promise<string>((resolve) => {
        rl.question('Choose an option (1-2): ', resolve);
      });
      rl.close();
      
      if (choice === '2') {
        const { clients: authClients } = await manageFriends();
        if (authClients.length === 0) {
          console.log('No friends available. Exiting...');
          return;
        }
      }
    }

    const { clients: authClients } = await loadFriends();
    console.log(`\nFetching calendar events from ${authClients.length} friends for the next 7 days...\n`);
    const events = await getMultiUserCalendarEvents(authClients);

    console.log(`Found ${events.length} events across all friends and calendars\n`);

    // Format events for AI with individual free time context
    const eventsContext = formatIndividualFreeTimeForAI(events);

    console.log('Analyzing calendars and finding free time slots...\n');

    // Use AI to analyze and find both individual and common free time
    const result = await generateText({
      model: google('gemini-2.0-flash-exp'),
      prompt: `${eventsContext}

Please analyze the calendar events for all friends and provide TWO sections:

SECTION 1: COMMON FREE TIME (where ALL friends are available)
- Find time slots where ALL friends are free (no conflicts)
- Consider typical work hours (9 AM to 5 PM) unless there are events outside these hours
- List common free time slots day by day
- Only show slots that are at least 30 minutes long
- Format each slot showing the date, start time, end time, and duration
- Group by day with the day name and date as headers
- If no common free time is found, suggest the best alternative times where most people are free

SECTION 2: INDIVIDUAL FREE TIME (each person's free time separately)
- Show free time slots for EACH person separately
- Consider typical work hours (9 AM to 5 PM) unless there are events outside these hours
- List free time slots day by day for each person
- Only show slots that are at least 30 minutes long
- Format each slot showing the date, start time, end time, and duration
- Group by person, then by day with clear headers

Section 3: INDIVIDUAL CALENDAR EVENTS
- Show the calendar events for each person separately
- Show the calendar events for each person day by day
- Show the calendar events for each person in the format of the date, start time, end time, and duration
- Group by person, then by day with clear headers

Requirements:
- Be concise and clear
- Do not use any icons or emojis in your response
- Show both sections clearly separated
- Prioritize longer time slots (1+ hours) over shorter ones`,
    });

    console.log('='.repeat(60));
    console.log('FREE TIME ANALYSIS FOR ALL FRIENDS');
    console.log('='.repeat(60));
    console.log('\n' + result.text + '\n');

    // Ask if user wants to book an event
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const shouldBook = await new Promise<string>((resolve) => {
      rl.question('Would you like to book an event for the first available time? (y/n): ', resolve);
    });

    if (shouldBook.toLowerCase() === 'y' || shouldBook.toLowerCase() === 'yes') {
      await bookEventForAllParticipants(authClients, events);
    }

    rl.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Call the main function
main().catch(console.error);

