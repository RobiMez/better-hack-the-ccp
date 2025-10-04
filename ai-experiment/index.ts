/**
 * Multi-User Calendar Free Time Finder
 * 
 * Usage:
 * - Single user: npm run dev
 * - Multi-user (common free time): npm run dev -- --multi-user [number_of_users]
 * - Friends mode (individual free time): npm run dev -- --friends
 * 
 * Examples:
 * - npm run dev -- --multi-user 2    (find common free time for 2 users)
 * - npm run dev -- --friends        (show individual free time for your friends)
 * 
 * The app will:
 * 1. For friends mode: Manage your friends list (add/remove friends)
 * 2. Authenticate with Google Calendar for each friend
 * 3. Fetch events from all calendars for each friend
 * 4. Use AI to find either:
 *    - Common free time slots (--multi-user) where ALL users are available
 *    - Individual free time slots (--friends) for each friend separately
 */

import 'dotenv/config';
import * as fs from 'fs/promises';
import * as readline from 'readline';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import {
  createOAuth2Client,
  getAuthUrl,
  getCalendarEvents,
  getMultiUserCalendarEvents,
  formatEventsForAI,
  formatMultiUserEventsForAI,
  formatIndividualFreeTimeForAI,
} from './calendar-utils.js';

const TOKEN_PATH = './token.json';
const MULTI_USER_TOKEN_PATH = './multi-user-tokens.json';
const FRIENDS_CONFIG_PATH = './friends-config.json';

/**
 * Get OAuth token from user
 */
async function getAccessToken(oauth2Client: any): Promise<void> {
  const authUrl = getAuthUrl(oauth2Client);
  console.log('Authorize this app by visiting this url:', authUrl);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the code from that page here: ', async (code) => {
      rl.close();
      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
        console.log('Token stored to', TOKEN_PATH);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Load or get new token for a single user
 */
async function authorize() {
  const oauth2Client = createOAuth2Client();

  try {
    const token = await fs.readFile(TOKEN_PATH, 'utf-8');
    oauth2Client.setCredentials(JSON.parse(token));
  } catch (error) {
    await getAccessToken(oauth2Client);
  }

  return oauth2Client;
}

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
 * Main function with multi-user support
 */
async function main() {
  try {
    // Check command line arguments
    const args = process.argv.slice(2);
    const isMultiUser = args.includes('--multi-user');
    const isFriendsMode = args.includes('--friends');
    const userCount = isMultiUser || isFriendsMode ? 
      parseInt(args[args.indexOf(isMultiUser ? '--multi-user' : '--friends') + 1]) || 2 : 1;

    if (isMultiUser) {
      console.log(`Setting up multi-user calendar access for ${userCount} users...\n`);
      const authClients = await authorizeMultipleUsers(userCount);

      console.log('Fetching calendar events from all users for the next 7 days...\n');
      const events = await getMultiUserCalendarEvents(authClients);

      console.log(`Found ${events.length} events across all users and calendars\n`);

      // Format events for AI with multi-user context
      const eventsContext = formatMultiUserEventsForAI(events);

      console.log('Analyzing calendars and finding common free time slots...\n');

      // Use AI to analyze and find common free time
      const result = await generateText({
        model: google('gemini-2.0-flash-exp'),
        prompt: `${eventsContext}

Please analyze the calendar events for all users and identify common free time slots where ALL users are available for the next 7 days.

Requirements:
- Only show time slots where ALL users are free (no conflicts)
- Consider typical work hours (9 AM to 5 PM) unless there are events outside these hours
- List common free time slots day by day
- Only show slots that are at least 30 minutes long
- Format each slot showing the date, start time, end time, and duration
- Group by day with the day name and date as headers
- Be concise and clear
- Do not use any icons or emojis in your response
- If no common free time is found, clearly state this`,
      });

      console.log('='.repeat(60));
      console.log('COMMON FREE TIME SLOTS FOR ALL USERS');
      console.log('='.repeat(60));
      console.log('\n' + result.text + '\n');
    } else if (isFriendsMode) {
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

      console.log('Analyzing calendars and finding individual free time slots...\n');

      // Use AI to analyze and find individual free time for each person
      const result = await generateText({
        model: google('gemini-2.0-flash-exp'),
        prompt: `${eventsContext}

Please analyze the calendar events for each person and identify their individual free time slots for the next 7 days.

Requirements:
- Show free time slots for EACH person separately
- Consider typical work hours (9 AM to 5 PM) unless there are events outside these hours
- List free time slots day by day for each person
- Only show slots that are at least 30 minutes long
- Format each slot showing the date, start time, end time, and duration
- Group by person, then by day with clear headers
- Be concise and clear
- Do not use any icons or emojis in your response
- Show each person's free time in separate sections`,
      });

      console.log('='.repeat(60));
      console.log('INDIVIDUAL FREE TIME SLOTS FOR EACH PERSON');
      console.log('='.repeat(60));
      console.log('\n' + result.text + '\n');
    } else {
      console.log('Authenticating with Google Calendar...\n');
      const auth = await authorize();

      console.log('Fetching calendar events from all calendars for the next 7 days...\n');
      const events = await getCalendarEvents(auth);

      console.log(`Found ${events.length} events across all calendars\n`);

      // Format events for AI
      const eventsContext = formatEventsForAI(events);

      console.log('Analyzing calendar and finding free time slots...\n');

      // Use AI to analyze and find free time
      const result = await generateText({
        model: google('gemini-2.0-flash-exp'),
        prompt: `${eventsContext}

Please analyze my calendar events and identify all available free time slots for the next 7 days.

Requirements:
- Consider typical work hours (9 AM to 5 PM) unless there are events outside these hours
- List free time slots day by day
- Only show slots that are at least 30 minutes long
- Format each slot showing the date, start time, end time, and duration
- Group by day with the day name and date as headers
- Be concise and clear
- Do not use any icons or emojis in your response`,
      });

      console.log('='.repeat(60));
      console.log('FREE TIME SLOTS FOR THE NEXT 7 DAYS');
      console.log('='.repeat(60));
      console.log('\n' + result.text + '\n');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();