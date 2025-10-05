import { streamText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { connectDB } from '$lib/db';
import { Event } from '$lib/models';
import { json, type RequestEvent } from '@sveltejs/kit';

export const POST = async ({ request }: RequestEvent) => {
	try {
		await connectDB();

		const body = await request.json();
		const { messages, eventId, inviteCode } = body;

		if (!eventId || !inviteCode) {
			return json({ error: 'Missing eventId or inviteCode' }, { status: 400 });
		}

		// Fetch the event from database
		const event = await Event.findById(eventId).populate('organizer_id', 'name email');

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

						return {
							success: true,
							message: `Great! I've noted that you prefer ${args.preferredDate}${args.preferredTime ? ' at ' + args.preferredTime : ''}. ${args.notes ? 'Notes: ' + args.notes : ''}`,
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
		const systemPrompt = `You are a friendly AI assistant helping ${invite.email} plan their attendance for the event "${event.name}".

Event Details:
- Name: ${event.name}
- Description: ${event.description || 'No description'}
- Organizer: ${event.organizer_id?.name || 'Unknown'}
- Current Time Window: ${new Date(event.bounds.start).toLocaleString()} to ${new Date(event.bounds.end).toLocaleString()}

Your goal is to:
1. Have a friendly conversation with the attendee
2. Ask about their preferred time for the event
3. Use the setPreferredTime tool to save their preference when they mention a specific time
4. Answer any questions they have about the event

Be conversational and helpful. When they mention a time preference, immediately use the setPreferredTime tool to save it.

Examples of when to use setPreferredTime:
- User: "I prefer Tuesday afternoon" → Call tool with preferredDate: "Tuesday" and preferredTime: "afternoon"
- User: "How about next Friday at 2pm?" → Call tool with preferredDate: "next Friday" and preferredTime: "2pm"
- User: "I'm free anytime on March 15th" → Call tool with preferredDate: "March 15th" and preferredTime: "flexible"

Remember: ${invite.email} has already accepted the invitation, so focus on helping them specify their preferred time.`;

		// Stream the AI response
		const result = streamText({
			model: google('gemini-2.0-flash-exp'),
			system: systemPrompt,
			messages,
			tools: {
				setPreferredTime: setPreferredTimeTool,
				getEventDetails: getEventDetailsTool
			}
		});

		return result.toTextStreamResponse();
	} catch (error) {
		console.error('Chat API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

