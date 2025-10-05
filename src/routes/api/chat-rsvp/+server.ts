import { streamText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { connectDB } from '$lib/db';
import { Event } from '$lib/models';
import { json, type RequestEvent } from '@sveltejs/kit';

export const POST = async ({ request }: RequestEvent) => {
	console.log('🤖 Chat API called');
	try {
		await connectDB();
		console.log('✅ DB connected');

		const body = await request.json();
		const { messages, eventId, inviteCode } = body;
		console.log('📝 Request:', { messagesCount: messages?.length, eventId, inviteCode });

		if (!eventId || !inviteCode) {
			console.error('❌ Missing eventId or inviteCode');
			return json({ error: 'Missing eventId or inviteCode' }, { status: 400 });
		}

		// Fetch the event from database
		const event = await Event.findById(eventId).populate('organizer_id', 'name email');
		console.log('📅 Event found:', event?.name);

		if (!event) {
			return json({ error: 'Event not found' }, { status: 404 });
		}

		// Find the specific invite
		const invite = event.inviteList?.find((inv: any) => inv.inviteCode === inviteCode);

		if (!invite) {
			return json({ error: 'Invite not found' }, { status: 404 });
		}

		// Tool: Set preferred time for the event
		const setPreferredTimeTool = tool({
			description:
				'Set the preferred time for when the user wants to attend the event. Use this when the user mentions a specific date/time they prefer.',
			inputSchema: z.object({
				preferredDate: z
					.string()
					.describe('The preferred date in ISO format (YYYY-MM-DD) or relative like "next Monday"'),
				preferredTime: z
					.string()
					.optional()
					.describe('The preferred time in format like "2pm", "14:00", "morning", "afternoon"'),
				notes: z
					.string()
					.optional()
					.describe('Any additional notes or constraints about their availability')
			}),
			execute: async (args: { preferredDate: string; preferredTime?: string; notes?: string }) => {
				try {
					// Update the invite with preferred time
					const currentInvite = event.inviteList?.find((inv: any) => inv.inviteCode === inviteCode);

					if (currentInvite) {
						currentInvite.preferredTime = {
							date: args.preferredDate,
							time: args.preferredTime || 'flexible',
							notes: args.notes || '',
							updatedAt: new Date()
						};

						await event.save();

						const timeStr = args.preferredTime ? `${args.preferredDate} at ${args.preferredTime}` : args.preferredDate;
						const notesStr = args.notes ? ` I've also noted: "${args.notes}"` : '';
						
						return {
							success: true,
							message: `Perfect! I've registered your preferred time as ${timeStr}.${notesStr} We'll do our best to accommodate your schedule for "${event.name}". The organizer will be notified of your preference!`,
							preferredTime: {
								date: args.preferredDate,
								time: args.preferredTime || 'flexible',
								notes: args.notes || ''
							}
						};
					}

					return {
						success: false,
						message: 'Could not save your preferred time. Please try again.'
					};
				} catch (error) {
					console.error('Error setting preferred time:', error);
					return {
						success: false,
						message: 'An error occurred while saving your preference.'
					};
				}
			}
		});

		// Tool: Get event details
		const getEventDetailsTool = tool({
			description: 'Get details about the event including current time bounds and attendees',
			inputSchema: z.object({}),
			execute: async (_args: Record<string, never>) => {
				return {
					eventName: event.name,
					description: event.description || 'No description provided',
					currentStartTime: event.bounds.start,
					currentEndTime: event.bounds.end,
					organizer: event.organizer_id?.name || 'Unknown',
					totalInvites: event.inviteList?.length || 0,
					acceptedCount:
						event.inviteList?.filter((inv: any) => inv.status === 'accepted').length || 0
				};
			}
		});

		// Create system prompt with event context
		const systemPrompt = `You are a helpful AI assistant for the event "${event.name}".

The user ${invite.email} has accepted the invitation. Your job:

1. **If they mention ANY time/date** → Call setPreferredTime tool to save it, THEN say a friendly goodbye
2. **If NO time mentioned** → Ask when they prefer to attend

Event: ${event.name}
Window: ${new Date(event.bounds.start).toLocaleDateString()} to ${new Date(event.bounds.end).toLocaleDateString()}

IMPORTANT: After calling setPreferredTime, ALWAYS add a brief farewell like:
- "Looking forward to seeing you there!"
- "Thanks for letting us know! See you at the event."
- "Great! We'll be in touch soon."

EXAMPLES:
- "Tuesday 2pm" → Call setPreferredTime → "Looking forward to seeing you there!"
- "next week" → Call setPreferredTime → "Thanks! We'll be in touch."
- "hello" → "When would you prefer to attend ${event.name}?"

BE WARM AND CONVERSATIONAL.`;

		// Check if API key is configured
		const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		if (!apiKey) {
			console.error('❌ GOOGLE_GENERATIVE_AI_API_KEY not configured');
			return json({ 
				error: 'AI chatbot not configured. Please set GOOGLE_GENERATIVE_AI_API_KEY in your .env file.' 
			}, { status: 500 });
		}
		console.log('✅ API key found');

		console.log('🚀 Starting AI stream...');
		console.log('Messages to send:', JSON.stringify(messages, null, 2));
		
		// Stream the AI response
		const result = await streamText({
			model: google('gemini-2.5-flash'),
			system: systemPrompt,
			messages,
			tools: {
				setPreferredTime: setPreferredTimeTool,
				getEventDetails: getEventDetailsTool
			},
			maxSteps: 5
		});

		console.log('✅ Stream created, getting full text with tool results');
		
		// Get the full text (includes tool results)
		const fullText = await result.text;
		console.log('📤 Full response text:', fullText);
		
		// Create streaming response
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				try {
					if (fullText && fullText.trim()) {
						// Stream the full text word by word for a nice effect
						const words = fullText.split(' ');
						for (const word of words) {
							console.log('📤 Sending word:', word);
							const data = `0:${JSON.stringify(word + ' ')}\n`;
							controller.enqueue(encoder.encode(data));
							await new Promise(resolve => setTimeout(resolve, 30));
						}
					} else {
						// Fallback message
						const fallback = "Got it! Your preference has been saved.";
						console.log('📤 No text generated, sending fallback');
						const data = `0:${JSON.stringify(fallback)}\n`;
						controller.enqueue(encoder.encode(data));
					}
					
					console.log('✅ Stream complete');
					controller.close();
				} catch (error) {
					console.error('❌ Stream error:', error);
					controller.error(error);
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Transfer-Encoding': 'chunked'
			}
		});
	} catch (error) {
		console.error('❌ Chat API error:', error);
		console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
		return json({ 
			error: 'Internal server error', 
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
};

