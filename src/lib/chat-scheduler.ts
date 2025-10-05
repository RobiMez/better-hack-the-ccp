import { generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

import {
	getMultiUserCalendarEvents,
	formatIndividualFreeTimeForAI,
	createCalendarEvent,
	findFirstAvailableTime,
	getPrimaryCalendarId
} from './utils/calendar.js';

// Global variables for authentication and friends
let accessTokens: string[] = [];
let friends: { name: string; accessToken: string }[] = [];

/**
 * Initialize authentication and load friends with access tokens
 */
export async function initializeAuth(friendsData: { name: string; accessToken: string }[]) {
	console.log('🔐 Setting up authentication...\n');

	if (friendsData.length === 0) {
		console.log('No friends configured yet. Please provide friends with access tokens.\n');
		return false;
	}

	friends = friendsData;
	accessTokens = friendsData.map((friend) => friend.accessToken);

	console.log(`✅ Loaded ${friends.length} friends: ${friends.map((f) => f.name).join(', ')}\n`);
	return true;
}

/**
 * Vercel AI SDK Tool: Find free time for all participants
 */
const findFreeTimeTool = tool({
	description: 'Find free time slots for all participants',
	inputSchema: z.object({
		duration: z.number().describe('Duration in minutes to find free time for'),
		days: z.number().optional().describe('Number of days to look ahead (default: 7)')
	}),
	execute: async ({ duration, days = 7 }: { duration: number; days?: number }) => {
		try {
			console.log(`🔍 Finding free time for ${duration} minutes in the next ${days} days...`);

			// Get calendar events
			const events = await getMultiUserCalendarEvents(accessTokens);

			// Find available time
			const endDate = new Date();
			endDate.setDate(endDate.getDate() + days);
			const availableTime = findFirstAvailableTime(events, duration, new Date(), endDate);

			if (!availableTime) {
				return {
					success: false,
					message: `No available time found for ${duration} minutes in the next ${days} days.`,
					availableTime: null
				};
			}

			return {
				success: true,
				message: `Found available time: ${availableTime.startTime.toLocaleString()} to ${availableTime.endTime.toLocaleString()}`,
				availableTime: {
					startTime: availableTime.startTime.toISOString(),
					endTime: availableTime.endTime.toISOString(),
					duration: duration
				}
			};
		} catch (error) {
			return {
				success: false,
				message: `Error finding free time: ${error}`,
				availableTime: null
			};
		}
	}
});

/**
 * Vercel AI SDK Tool: Schedule an event
 */
const scheduleEventTool = tool({
	description: 'Schedule an event for all participants',
	inputSchema: z.object({
		title: z.string().describe('The title of the event to schedule'),
		description: z.string().optional().describe('Optional description of the event'),
		duration: z.number().describe('Duration of the event in minutes')
	}),
	execute: async ({
		title,
		description = '',
		duration
	}: {
		title: string;
		description?: string;
		duration: number;
	}) => {
		try {
			console.log(`📅 Scheduling event: "${title}" for ${duration} minutes...`);

			// Get calendar events to find available time
			const events = await getMultiUserCalendarEvents(accessTokens);
			const availableTime = findFirstAvailableTime(events, duration);

			if (!availableTime) {
				return {
					success: false,
					message: 'No available time found for all participants.',
					eventId: null
				};
			}

			// Create events for all participants
			const createdEvents = [];
			for (let i = 0; i < accessTokens.length; i++) {
				try {
					const calendarId = await getPrimaryCalendarId(accessTokens[i]);
					const event = await createCalendarEvent(accessTokens[i], {
						summary: title,
						description: description,
						startTime: availableTime.startTime,
						endTime: availableTime.endTime,
						calendarId: calendarId
					});

					createdEvents.push({
						user: friends[i].name,
						eventId: event.id,
						calendarId: calendarId
					});
				} catch (error) {
					console.error(`Failed to create event for ${friends[i].name}:`, error);
				}
			}

			if (createdEvents.length > 0) {
				return {
					success: true,
					message: `Successfully scheduled "${title}" for ${createdEvents.length} participants`,
					eventId: createdEvents[0].eventId,
					startTime: availableTime.startTime.toISOString(),
					endTime: availableTime.endTime.toISOString(),
					participants: createdEvents.map((e) => e.user)
				};
			} else {
				return {
					success: false,
					message: 'Failed to create events for any participants.',
					eventId: null
				};
			}
		} catch (error) {
			return {
				success: false,
				message: `Error scheduling event: ${error}`,
				eventId: null
			};
		}
	}
});

/**
 * Get calendar context for AI
 */
async function getCalendarContext(): Promise<string> {
	try {
		const events = await getMultiUserCalendarEvents(accessTokens);
		return formatIndividualFreeTimeForAI(events);
	} catch (error) {
		return `Error loading calendar data: ${error}`;
	}
}

/**
 * Chat with AI using calendar context and tools
 */
export async function chatWithAI(
	userInput: string,
	conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{
	text: string;
	toolCalls?: unknown[];
	steps?: unknown[];
}> {
	// Add user message to history
	conversationHistory.push({ role: 'user', content: userInput });

	// Get calendar context
	const calendarContext = await getCalendarContext();

	// Build conversation context
	const conversationContext = conversationHistory
		.slice(-6) // Last 6 messages (3 exchanges)
		.map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
		.join('\n');

	// Use Vercel AI SDK with tool calling
	const result = await generateText({
		model: google('gemini-2.5-flash'),
		system: `You are a friendly, helpful AI assistant with calendar superpowers. You chat naturally but ACTUALLY execute calendar actions when needed.

IMPORTANT RULES:
1. Chat naturally about any topic
2. When user wants to schedule/book/create event → CALL scheduleEvent tool immediately
3. When user wants to find free time/availability → CALL findFreeTime tool immediately  
4. When user says "do it", "yes", "book it", "go ahead" after discussing scheduling → CALL the appropriate tool RIGHT NOW

ACTION TRIGGERS (you MUST call tools for these):
- "schedule", "book", "create event", "set up meeting" → scheduleEvent
- "find time", "when available", "free slots", "when can we meet" → findFreeTime
- "do it", "yes", "go ahead", "book it" (after scheduling talk) → scheduleEvent

Don't just talk about doing things - actually DO them by calling the tools!

Calendar data available:
${calendarContext}`,
		prompt: conversationContext + `\nUser: ${userInput}\nAssistant:`,
		tools: {
			findFreeTime: findFreeTimeTool,
			scheduleEvent: scheduleEventTool
		}
	});

	// Add assistant response to history
	conversationHistory.push({ role: 'assistant', content: result.text });

	return {
		text: result.text,
		toolCalls: result.toolCalls,
		steps: result.steps
	};
}

/**
 * Main chat loop interface (for console usage)
 */
export async function startChatInterface(
	friendsData: { name: string; accessToken: string }[],
	readline: { question: (prompt: string, callback: (answer: string) => void) => void }
) {
	const authSuccess = await initializeAuth(friendsData);
	if (!authSuccess) {
		console.log('Please provide friends with access tokens.');
		return;
	}

	console.log('🤖 Hey there! I\'m your friendly AI chatbot with calendar superpowers!');
	console.log('💬 I can chat about anything, and I also help with scheduling and meetings.');
	console.log('Type "help" to see what I can do, or just start chatting!\n');

	// Track conversation history
	const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

	let shouldContinue = true;
	while (shouldContinue) {
		const userInput = await new Promise<string>((resolve) => {
			readline.question('You: ', resolve);
		});

		if (userInput.toLowerCase() === 'quit' || userInput.toLowerCase() === 'exit') {
			console.log('👋 Goodbye!');
			shouldContinue = false;
			break;
		}

		if (userInput.toLowerCase() === 'help') {
			console.log('\n🤖 I\'m a friendly AI chatbot with calendar superpowers!');
			console.log('\n💬 I can chat about anything:');
			console.log('- Ask me questions about anything');
			console.log('- Have normal conversations');
			console.log('- Get help with various topics');
			console.log('\n📅 I also have special calendar abilities:');
			console.log('- "When can we all meet?" → Find free time');
			console.log('- "Schedule a team call" → Book meetings');
			console.log('- "What\'s everyone\'s schedule?" → Check availability');
			console.log('\nType "quit" to exit\n');
			continue;
		}

		try {
			const result = await chatWithAI(userInput, conversationHistory);

			console.log(`\n🤖 Assistant: ${result.text}`);

			// Display tool results if any tools were called
			if (result.toolCalls && result.toolCalls.length > 0) {
				console.log(`\n🔧 (I used my calendar powers to help you!)`);
				console.log(`   Tools called: ${result.toolCalls.map((tc: any) => tc.toolName).join(', ')}`);
			}

			// Debug: Show if tools were available but not called
			if (result.steps && result.steps.length > 1) {
				console.log(`\n💭 (Processing steps: ${result.steps.length})`);
			}

			console.log(''); // Add spacing
		} catch (error) {
			console.error('❌ Error:', error);
			console.log('');
		}
	}
}

/**
 * Get current friends and their access tokens
 */
export function getCurrentFriends() {
	return friends;
}

/**
 * Get current access tokens
 */
export function getCurrentAccessTokens() {
	return accessTokens;
}
