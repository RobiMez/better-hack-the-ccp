<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		Calendar,
		MapPin,
		User,
		Clock,
		Check,
		X,
		GoogleLogo,
		ChatCircle,
		CaretDown,
		CaretUp
	} from 'phosphor-svelte';
	import { EventStatus } from '$lib/models/event.model.types.js';
	import { authClient } from '$lib/auth-client.js';
	import { onMount } from 'svelte';
	import {
		Conversation,
		ConversationContent,
		ConversationEmptyState,
		ConversationScrollButton
	} from '$lib/components/ai-elements/conversation/index';
	import {
		PromptInput,
		PromptInputActionAddAttachments,
		PromptInputActionMenu,
		PromptInputActionMenuContent,
		PromptInputActionMenuTrigger,
		PromptInputAttachment,
		PromptInputAttachments,
		PromptInputBody,
		PromptInputButton,
		type PromptInputMessage,
		PromptInputModelSelect,
		PromptInputModelSelectContent,
		PromptInputModelSelectItem,
		PromptInputModelSelectTrigger,
		PromptInputModelSelectValue,
		PromptInputSubmit,
		PromptInputTextarea,
		PromptInputToolbar,
		PromptInputTools,
		type ChatStatus,
		MicIcon,
		GlobeIcon
	} from '$lib/components/ai-elements/prompt-input';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	// Import calendar components
	import { Calendar as EventCalendar, TimeGrid, Interaction } from '@event-calendar/core';

	let { data }: { data: any } = $props();

	let loading = $state(false);
	let responseSubmitted = $state(false);
	let authLoading = $state(false);
	let calendarLoading = $state(false);

	// Event card collapse state
	let isEventCardCollapsed = $state(false);

	// Chat interface state
	let showChat = $state(false);
	let visibleMessages = $state<
		Array<{ key: string; value: string; name: string; avatar?: string }>
	>([]);

	// Calendar and free time state
	let freeTimeSlots = $state<Array<{ start: Date; end: Date; duration: number }>>([]);
	let partialAvailabilitySlots = $state<
		Array<{
			start: Date;
			end: Date;
			duration: number;
			conflicts?: Array<{
				start: Date;
				end: Date;
				conflictingParticipants: string[];
			}>;
		}>
	>([]);
	let calendarAnalysisLoading = $state(false);
	let conversationHistory = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
	let showCalendarVisualization = $state(false);
	let calendarEvents = $state<Array<any>>([]);
	let calendarOptions = $state<any>(null);
	let selectedTimeSlot = $state<{
		dayOfWeek: string;
		date: string;
		startTime: string;
		endTime: string;
		startISO: string;
		endISO: string;
		duration: string;
		durationMinutes: number;
		eventId: string;
		title: string;
	} | null>(null);

	// Function to clear time slot selection
	function clearTimeSlotSelection() {
		selectedTimeSlot = null;
	}

	// Function to confirm and save preferred time slot
	async function confirmPreferredTime() {
		if (!selectedTimeSlot) {
			console.error('No time slot selected');
			return;
		}

		try {
			console.log('Confirming preferred time slot:', selectedTimeSlot);

			const response = await fetch('/api/time-slot-preference', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					timeSlot: selectedTimeSlot,
					eventId: data.event._id
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to save preference');
			}

			console.log('Time slot preference saved successfully:', result.preference);

			// Add success message to chat
			visibleMessages = [
				...visibleMessages,
				{
					key: `preference-saved-${Date.now()}`,
					value: `Your preferred time has been saved!\n\n**${selectedTimeSlot.dayOfWeek}, ${selectedTimeSlot.date}**\n**${selectedTimeSlot.startTime} - ${selectedTimeSlot.endTime}**\n\nThe organizer will be notified of your preference.`,
					name: 'Assistant',
					avatar: undefined
				}
			];

			// Optionally clear the selection after saving
			// clearTimeSlotSelection();
		} catch (error) {
			console.error('Error saving time slot preference:', error);

			// Add error message to chat
			visibleMessages = [
				...visibleMessages,
				{
					key: `preference-error-${Date.now()}`,
					value: `Sorry, there was an error saving your preferred time. Please try again.`,
					name: 'Assistant',
					avatar: undefined
				}
			];
		}
	}

	// Chat input state
	let models = [
		{ id: 'gpt-4', name: 'GPT-4' },
		{ id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
		{ id: 'claude-2', name: 'Claude 2' },
		{ id: 'claude-instant', name: 'Claude Instant' },
		{ id: 'palm-2', name: 'PaLM 2' },
		{ id: 'llama-2-70b', name: 'Llama 2 70B' },
		{ id: 'llama-2-13b', name: 'Llama 2 13B' },
		{ id: 'cohere-command', name: 'Command' },
		{ id: 'mistral-7b', name: 'Mistral 7B' }
	];

	let SUBMITTING_TIMEOUT = 200;
	let STREAMING_TIMEOUT = 2000;

	let text = $state<string>('');
	let model = $state<string>(models[0].id);
	let model_name = $state<string>(models[0].name);
	let status = $state<ChatStatus>('idle');

	// Initialize from server data
	let session = $state(
		data.authStatus.isAuthenticated ? { data: { session: true, user: data.authStatus.user } } : null
	);
	let hasCalendarAccess = $state(data.authStatus.hasCalendarAccess);
	let isInvitedUser = $state(data.authStatus.isInvitedUser);

	// Log initial status from server
	onMount(() => {
		if (data.authStatus.isAuthenticated) {
			console.log('✅ Client: User is authenticated from server:', data.authStatus.user.email);
			if (data.authStatus.isInvitedUser) {
				console.log('✅ Client: User is the invited user');
				if (data.authStatus.hasCalendarAccess) {
					console.log('✅ Client: User has calendar access from server');
				} else {
					console.log('⚠️ Client: User needs calendar access');
				}
			} else {
				console.log('❌ Client: User is NOT the invited user');
			}
		} else {
			console.log('⚠️ Client: User not authenticated from server');
		}

		// If user has already RSVP'd AND is authenticated, collapse the event card and show chat
		if (data.invite.status !== 'pending' && data.authStatus.isAuthenticated) {
			isEventCardCollapsed = true;
			showChat = true;

			// Add initial welcome message based on existing status
			visibleMessages = [
				{
					key: 'welcome',
					value:
						data.invite.status === 'accepted'
							? `Welcome back! You've already accepted the invitation to "${data.event.name}". Let's continue planning together!`
							: `Thanks for letting us know you can't make it to "${data.event.name}". Is there anything you'd like to discuss about the event?`,
					name: 'Assistant',
					avatar: undefined
				}
			];

			// Analyze calendar for users who have already accepted
			if (
				data.invite.status === 'accepted' &&
				data.authStatus.isAuthenticated &&
				data.authStatus.hasCalendarAccess
			) {
				setTimeout(() => {
					fetchUserCalendarAndAnalyzeFreeTime();
				}, 1500); // Wait for UI to load
			}
		}
	});

	let handleSubmit = async (message: PromptInputMessage) => {
		let hasText = Boolean(message.text);
		let hasAttachments = Boolean(message.files?.length);

		if (!(hasText || hasAttachments)) {
			return;
		}

		status = 'submitted';

		// Add user message to chat
		if (hasText && message.text) {
			visibleMessages = [
				...visibleMessages,
				{
					key: `user-${Date.now()}`,
					value: message.text,
					name: session?.data?.user?.name || session?.data?.user?.email || 'User',
					avatar: undefined
				}
			];

			// Add to conversation history
			conversationHistory = [...conversationHistory, { role: 'user', content: message.text }];
		}

		console.log('Submitting message:', message);

		setTimeout(() => {
			status = 'streaming';
		}, SUBMITTING_TIMEOUT);

		// Call AI API for conversational response
		try {
			// Prepare event context
			const eventContext = {
				eventId: data.event._id,
				eventName: data.event.name,
				organizerName: data.event.organizerId?.name || 'Event Organizer',
				startTime: new Date(data.event.bounds.start).toLocaleString(),
				endTime: new Date(data.event.bounds.end).toLocaleString(),
				isOrganizer: data.authStatus.user?.email === data.event.organizerId?.email
			};

			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					messages: conversationHistory,
					eventContext
				})
			});

			if (!response.ok) {
				throw new Error('Failed to get AI response');
			}

			// Handle streaming response
			const reader = response.body?.getReader();
			const decoder = new TextDecoder();
			let assistantMessage = '';
			const assistantKey = `assistant-${Date.now()}`;

			if (reader) {
				// Add empty assistant message that will be updated
				visibleMessages = [
					...visibleMessages,
					{
						key: assistantKey,
						value: '',
						name: 'Assistant',
						avatar: undefined
					}
				];

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					assistantMessage += chunk;

					// Update the assistant message in place
					visibleMessages = visibleMessages.map((msg) =>
						msg.key === assistantKey ? { ...msg, value: assistantMessage } : msg
					);
				}

				// Add final message to conversation history
				conversationHistory = [
					...conversationHistory,
					{ role: 'assistant', content: assistantMessage }
				];
			}

			status = 'idle';
			text = '';
		} catch (error) {
			console.error('AI Chat error:', error);
			status = 'idle';
			text = '';

			// Fallback response if AI fails
			const responseText = `I'm having trouble connecting to my AI service right now. I'll help you plan "${data.event.name}" the best I can! Click "Check Free Times" above to see your available time slots, or let me know what you'd like to discuss about the event.`;

			visibleMessages = [
				...visibleMessages,
				{
					key: `assistant-${Date.now()}`,
					value: responseText,
					name: 'Assistant',
					avatar: undefined
				}
			];

			// Update conversation history
			conversationHistory = [...conversationHistory, { role: 'assistant', content: responseText }];
		}
	};
	function generateDynamicCallbackURL(): string {
		// Example logic to generate a dynamic URL
		const baseURL = window.location.origin;
		const dynamicPath = `/rsvp/${page.params.code}`;
		return `${baseURL}${dynamicPath}`;
	}
	async function handleGoogleSignIn() {
		// Only skip if the user is already signed in AND is the correct invited user
		if (session?.data?.session && isInvitedUser) {
			console.log('Correct user is already signed in, skipping sign in');
			return;
		}

		authLoading = true;
		try {
			await authClient.signIn.social({
				provider: 'google',
				callbackURL: generateDynamicCallbackURL()
			});
		} catch (error) {
			console.error('Google sign in failed:', error);
			alert('Failed to sign in with Google');
			authLoading = false;
		}
	}

	async function requestCalendarAccess() {
		if (hasCalendarAccess) {
			console.log('User already has calendar access, skipping request');
			return;
		}

		calendarLoading = true;
		try {
			await authClient.linkSocial({
				provider: 'google',
				callbackURL: generateDynamicCallbackURL(),
				scopes: ['https://www.googleapis.com/auth/calendar.readonly']
			});
		} catch (error) {
			console.error('Calendar access request failed:', error);
			alert('Failed to request calendar access');
			calendarLoading = false;
		}
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	async function fetchUserCalendarAndAnalyzeFreeTime() {
		if (!session?.data?.user || !hasCalendarAccess) {
			console.log('No calendar access available');
			return;
		}

		calendarAnalysisLoading = true;
		try {
			// Call our API route that handles multi-user calendar analysis
			const response = await fetch(`/api/calendar/free-times?eventId=${data.event._id}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				const errorData = await response.json();
				console.error('API Error:', errorData);
				throw new Error(errorData.error || 'Failed to fetch calendar data');
			}

			const apiResponse = await response.json();

			if (!apiResponse.success) {
				throw new Error(apiResponse.error || 'Failed to analyze calendar');
			}

			// Convert ISO strings back to Date objects for display
			const slots = apiResponse.freeTimeSlots.map((slot: any) => ({
				start: new Date(slot.start),
				end: new Date(slot.end),
				duration: slot.duration
			}));

			const partialSlots = (apiResponse.partialAvailability || []).map((slot: any) => ({
				start: new Date(slot.start),
				end: new Date(slot.end),
				duration: slot.duration,
				conflicts:
					slot.conflicts?.map((conflict: any) => ({
						start: new Date(conflict.start),
						end: new Date(conflict.end),
						conflictingParticipants: conflict.conflictingParticipants
					})) || []
			}));

			freeTimeSlots = slots;
			partialAvailabilitySlots = partialSlots;

			// Generate AI message about free times
			if (slots.length > 0) {
				const freeTimeMessage = generateMultiUserFreeTimeMessage(slots, apiResponse);

				visibleMessages = [
					...visibleMessages,
					{
						key: `calendar-analysis-${Date.now()}`,
						value: freeTimeMessage,
						name: 'Assistant',
						avatar: undefined
					}
				];
			} else if (partialSlots.length > 0) {
				// Show partial availability with conflict details
				const partialMessage = generatePartialAvailabilityMessage(partialSlots, apiResponse);
				visibleMessages = [
					...visibleMessages,
					{
						key: `calendar-partial-${Date.now()}`,
						value: partialMessage,
						name: 'Assistant',
						avatar: undefined
					}
				];
			} else {
				// 0 events means everyone is completely free during the entire window
				const allFreeMessage = generateAllFreeTimeMessage(apiResponse);
				visibleMessages = [
					...visibleMessages,
					{
						key: `calendar-all-free-${Date.now()}`,
						value: allFreeMessage,
						name: 'Assistant',
						avatar: undefined
					}
				];
			}
		} catch (error) {
			console.error('Error analyzing calendar:', error);

			visibleMessages = [
				...visibleMessages,
				{
					key: `calendar-error-${Date.now()}`,
					value:
						"I'm having trouble accessing your calendar right now. Let's continue planning manually!",
					name: 'Assistant',
					avatar: undefined
				}
			];
		} finally {
			calendarAnalysisLoading = false;
		}
	}

	function generateFreeTimeMessage(
		slots: Array<{ start: Date; end: Date; duration: number }>
	): string {
		let message = "I've analyzed your calendar and found some great free time slots! 📅\n\n";

		slots.forEach((slot, index) => {
			const startFormatted = slot.start.toLocaleDateString('en-US', {
				weekday: 'long',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});

			const endFormatted = slot.end.toLocaleDateString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});

			message += `${index + 1}. **${startFormatted}** to **${endFormatted}** (${slot.duration} minutes)\n`;
		});

		message +=
			'\nWould you like to mark any of these as your preferred times for the event? Just let me know which ones work best for you!';

		return message;
	}

	function generateCalendarVisualization(responseData: any) {
		const events: any[] = [];
		const eventBounds = {
			start: new Date(responseData.eventDetails?.bounds?.start),
			end: new Date(responseData.eventDetails?.bounds?.end)
		};

		// Add event bounds as red background events (out of bounds areas)
		const dayBefore = new Date(eventBounds.start);
		dayBefore.setDate(dayBefore.getDate() - 1);
		const dayAfter = new Date(eventBounds.end);
		dayAfter.setDate(dayAfter.getDate() + 1);

		// Out of bounds - before event window
		events.push({
			id: 'out-of-bounds-before',
			start: dayBefore.toISOString(),
			end: eventBounds.start.toISOString(),
			title: 'Out of Event Window',
			display: 'background',
			backgroundColor: '#fca5a5', // red-300
			classNames: ['out-of-bounds']
		});

		// Out of bounds - after event window
		events.push({
			id: 'out-of-bounds-after',
			start: eventBounds.end.toISOString(),
			end: dayAfter.toISOString(),
			title: 'Out of Event Window',
			display: 'background',
			backgroundColor: '#fca5a5', // red-300
			classNames: ['out-of-bounds']
		});

		// Add one green background bar for the entire event window
		events.push({
			id: 'event-window',
			start: eventBounds.start.toISOString(),
			end: eventBounds.end.toISOString(),
			title: 'Event Time Window',
			display: 'background',
			backgroundColor: '#86efac', // green-300
			classNames: ['event-window']
		});

		calendarEvents = events;

		// Set up calendar options
		calendarOptions = {
			view: 'timeGridWeek',
			height: '500px',
			headerToolbar: {
				start: 'prev,next today',
				center: 'title',
				end: 'timeGridWeek,timeGridDay'
			},
			date: eventBounds.start,
			events: calendarEvents,
			editable: true,
			selectable: true,
			selectMirror: true,
			dayMaxEvents: false,
			allDaySlot: false,
			slotMinTime: '00:00:00',
			slotMaxTime: '24:00:00',
			slotDuration: '00:30:00',
			eventTimeFormat: {
				hour: 'numeric' as const,
				minute: '2-digit' as const
			},
			select: (info: any) => {
				console.log('SELECTED TIME RANGE:', info);

				const startTime = new Date(info.start);
				const endTime = new Date(info.end);

				// Format the date and time details
				const dayOfWeek = startTime.toLocaleDateString('en-US', { weekday: 'long' });
				const date = startTime.toLocaleDateString('en-US', {
					month: 'long',
					day: 'numeric',
					year: 'numeric'
				});
				const startFormatted = startTime.toLocaleTimeString('en-US', {
					hour: 'numeric',
					minute: '2-digit',
					hour12: true
				});
				const endFormatted = endTime.toLocaleTimeString('en-US', {
					hour: 'numeric',
					minute: '2-digit',
					hour12: true
				});

				// Calculate duration in minutes
				const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
				const hours = Math.floor(durationMinutes / 60);
				const minutes = durationMinutes % 60;
				const durationText =
					hours > 0
						? `${hours} hour${hours !== 1 ? 's' : ''}${minutes > 0 ? ` ${minutes} minutes` : ''}`
						: `${minutes} minute${minutes !== 1 ? 's' : ''}`;

				console.log('Custom Time Selection:');
				console.log('================================');
				console.log('Day:', dayOfWeek);
				console.log('Full Date:', date);
				console.log('Start Time:', startFormatted, `(${startTime.toISOString()})`);
				console.log('End Time:', endFormatted, `(${endTime.toISOString()})`);
				console.log('Duration:', durationText, `(${durationMinutes} minutes)`);
				console.log('================================');

				// Update selected time slot
				selectedTimeSlot = {
					dayOfWeek,
					date,
					startTime: startFormatted,
					endTime: endFormatted,
					startISO: startTime.toISOString(),
					endISO: endTime.toISOString(),
					duration: durationText,
					durationMinutes,
					eventId: 'custom-selection',
					title: 'Custom Selection'
				};

				const message =
					`**Custom Time Selected**\n\n` +
					`**Date:** ${dayOfWeek}, ${date}\n` +
					`**Time:** ${startFormatted} - ${endFormatted}\n` +
					`**Duration:** ${durationText}\n\n` +
					`You've selected a custom time range. Details are shown below the calendar.`;

				visibleMessages = [
					...visibleMessages,
					{
						key: `calendar-select-${Date.now()}`,
						value: message,
						name: 'Assistant',
						avatar: undefined
					}
				];
			}
		};

		showCalendarVisualization = true;
	}

	function generateMultiUserFreeTimeMessage(
		slots: Array<{ start: Date; end: Date; duration: number }>,
		responseData: any
	): string {
		const participantCount = responseData.participants?.length || 0;
		const withCalendarAccess = responseData.participantsWithCalendarAccess?.length || 0;

		let message = `Great news! I've analyzed everyone's calendars and found times when all ${participantCount} participants are free! 🎉\n\n`;

		if (withCalendarAccess < participantCount) {
			message += `📋 Note: ${withCalendarAccess} out of ${participantCount} participants have calendar access.\n\n`;
		}

		message += `I've generated a visual calendar below showing:\n`;
		message += `🟢 **Green areas**: Times when everyone is available\n`;
		message += `🔴 **Red areas**: Outside the event time window\n\n`;
		message += `Click on any green time slot to select it for the event! 📅`;

		// Generate calendar visualization
		generateCalendarVisualization(responseData);

		return message;
	}

	function generatePartialAvailabilityMessage(
		partialSlots: Array<{
			start: Date;
			end: Date;
			duration: number;
			conflicts?: Array<{
				start: Date;
				end: Date;
				conflictingParticipants: string[];
			}>;
		}>,
		responseData: any
	): string {
		const participantCount = responseData.participants?.length || 0;
		const withCalendarAccess = responseData.participantsWithCalendarAccess?.length || 0;

		let message = `I found some potential time slots, but some participants have conflicts. Here's a visual breakdown: 📅⚠️\n\n`;

		if (withCalendarAccess < participantCount) {
			message += `📋 Note: ${withCalendarAccess} out of ${participantCount} participants have calendar access.\n\n`;
		}

		message += `I've generated a visual calendar below showing:\n`;
		message += `🟢 **Green areas**: Times when everyone is available\n`;
		message += `🟡 **Yellow areas**: Times with some conflicts\n`;
		message += `🟠 **Orange events**: Specific conflicts (hover to see who's busy)\n`;
		message += `🔴 **Red areas**: Outside the event time window\n\n`;
		message += `Click on any available time slot to select it for the event! 🤔`;

		// Generate calendar visualization
		generateCalendarVisualization(responseData);

		return message;
	}

	function generateAllFreeTimeMessage(responseData: any): string {
		const participantCount = responseData.participants?.length || 0;
		const withCalendarAccess = responseData.participantsWithCalendarAccess?.length || 0;

		let message = `Excellent news! 🎉 I've analyzed everyone's calendars and found that all ${participantCount} participants are completely free during the entire event window!\n\n`;

		if (withCalendarAccess < participantCount) {
			message += `📋 Note: ${withCalendarAccess} out of ${participantCount} participants have calendar access.\n\n`;
		}

		// Format the event bounds nicely
		const eventStart = new Date(responseData.eventDetails?.bounds?.start);
		const eventEnd = new Date(responseData.eventDetails?.bounds?.end);

		if (eventStart && eventEnd) {
			const startFormatted = eventStart.toLocaleDateString('en-US', {
				weekday: 'long',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});

			const endFormatted = eventEnd.toLocaleDateString('en-US', {
				weekday: 'long',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});

			message += `**Available Time Window:**\n`;
			message += `From **${startFormatted}** to **${endFormatted}**\n\n`;
		}

		message +=
			'Since everyone is free during this entire period, you can choose any time within this window that works best for the group! 🗓️✨\n\n';
		message += 'What time would you prefer for the event?';

		return message;
	}

	function generateNoAvailableTimeMessage(responseData: any): string {
		const participantCount = responseData.participants?.length || 0;
		const withCalendarAccess = responseData.participantsWithCalendarAccess?.length || 0;

		let message = `I've checked everyone's calendars, but unfortunately couldn't find any time slots where all ${participantCount} participants are completely free. 😔\n\n`;

		if (withCalendarAccess < participantCount) {
			message += `📋 Note: Only ${withCalendarAccess} out of ${participantCount} participants have calendar access, which might limit the analysis.\n\n`;
		}

		message += '**Here are some options:**\n';
		message += "• Let me know if you'd like to check for partial availability\n";
		message += '• Consider adjusting the event time bounds\n';
		message += '• Manually coordinate with participants about their availability\n\n';
		message += 'What would you like to do next? 🤔';

		return message;
	}

	async function respondToInvite(response: 'accepted' | 'declined') {
		loading = true;
		try {
			const res = await fetch(`/api/rsvp/${data.inviteCode}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					response,
					userEmail: session?.data?.user?.email
				})
			});

			if (res.ok) {
				data.invite.status = response;
				responseSubmitted = true;

				// Collapse the event card and show chat interface
				isEventCardCollapsed = true;
				showChat = true;

				// Add initial welcome message
				visibleMessages = [
					{
						key: 'welcome',
						value:
							response === 'accepted'
								? `Great! You've accepted the invitation to "${data.event.name}". Let's start planning together!`
								: `Thanks for letting us know you can't make it to "${data.event.name}". Is there anything you'd like to discuss about the event?`,
						name: 'Assistant',
						avatar: undefined
					}
				];

				// Scroll to chat interface after a brief delay
				setTimeout(() => {
					const chatSection = document.querySelector('#chat-interface');
					if (chatSection) {
						chatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
					}
				}, 300);

				// Analyze calendar for free times after accepting
				if (response === 'accepted' && hasCalendarAccess) {
					setTimeout(() => {
						fetchUserCalendarAndAnalyzeFreeTime();
					}, 1000); // Wait a bit for UI to settle
				}
			} else {
				const error = await res.json();
				alert('Error: ' + error.message);
			}
		} catch (error) {
			console.error('Error responding to invite:', error);
			alert('Failed to respond to invitation');
		} finally {
			loading = false;
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'accepted':
				return 'text-green-600';
			case 'declined':
				return 'text-red-600';
			default:
				return 'text-yellow-600';
		}
	}

	function getStatusText(status: string) {
		switch (status) {
			case 'accepted':
				return 'Accepted';
			case 'declined':
				return 'Declined';
			default:
				return 'Pending Response';
		}
	}

	function toggleEventCard() {
		isEventCardCollapsed = !isEventCardCollapsed;

		// If expanding, scroll to top of event card
		if (!isEventCardCollapsed) {
			setTimeout(() => {
				const eventCard = document.querySelector('#event-card');
				if (eventCard) {
					eventCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			}, 100);
		}
		// If collapsing and chat is visible, scroll to chat
		else if (showChat) {
			setTimeout(() => {
				const chatSection = document.querySelector('#chat-interface');
				if (chatSection) {
					chatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			}, 100);
		}
	}

	// Check if user can respond (authenticated + is invited user + has calendar access)
	let canRespond = $derived(session?.data?.session && isInvitedUser && hasCalendarAccess);
</script>

<svelte:head>
	<title>Event Invitation - {data.event.name}</title>
</svelte:head>

<div class="bg-background maxw-4xl container mx-auto flex min-h-screen flex-row gap-4 px-4 py-8">
	<div class="w-5/12">
		<div id="event-card" class="bg-card border-border overflow-hidden rounded-lg border shadow-lg">
			<!-- Header -->
			<div class="bg-primary/5 border-border border-b p-6">
				<div class="flex items-center justify-between">
					<div>
						<h1 class="text-card-foreground mb-2 text-2xl font-bold">You're Invited!</h1>
						<p class="text-muted-foreground">
							You have been invited to <strong>{data.event.name}</strong>
						</p>
					</div>

					<!-- Collapse/Expand button - only show if user has RSVP'd -->
					{#if data.invite.status !== 'pending' || responseSubmitted}
						<Button
							variant="ghost"
							size="sm"
							onclick={toggleEventCard}
							class="flex items-center gap-2"
						>
							{#if isEventCardCollapsed}
								<CaretDown size={16} />
							{:else}
								<CaretUp size={16} />
							{/if}
						</Button>
					{/if}
				</div>

				<!-- Collapsed state - show minimal info -->
				{#if isEventCardCollapsed}
					<div class="mt-4 space-y-2">
						<div class="flex items-center gap-2 text-sm">
							<Calendar size={16} class="text-primary" />
							<span class="font-medium">{data.event.name}</span>
							<span class="text-muted-foreground">•</span>
							<span class="font-medium {getStatusColor(data.invite.status)}">
								{getStatusText(data.invite.status)}
							</span>
						</div>
					</div>
				{/if}
			</div>

			<!-- Event Details - hidden when collapsed -->
			{#if !isEventCardCollapsed}
				<div class="space-y-4 p-6">
					<div class="space-y-3">
						<h2 class="text-card-foreground text-xl font-semibold">{data.event.name}</h2>

						{#if data.event.description}
							<p class="text-muted-foreground">{data.event.description}</p>
						{/if}

						<div class="space-y-2">
							<div class="flex items-center gap-2 text-sm">
								<Calendar size={16} class="text-primary" />
								<span class="font-medium">When:</span>
								<span>{formatDate(data.event.bounds.start)}</span>
							</div>

							<div class="flex items-center gap-2 text-sm">
								<Clock size={16} class="text-primary" />
								<span class="font-medium">Duration:</span>
								<span>
									{formatDate(data.event.bounds.start)} - {formatDate(data.event.bounds.end)}
								</span>
							</div>

							<div class="flex items-center gap-2 text-sm">
								<User size={16} class="text-primary" />
								<span class="font-medium">Organizer:</span>
								<span>{data.event.organizerId?.name || 'Unknown'}</span>
							</div>
						</div>
					</div>

					<!-- Invite Details -->
					<div class="bg-muted/50 rounded-lg p-4">
						<h3 class="mb-2 font-medium">Invitation Details</h3>
						<div class="space-y-1 text-sm">
							<div class="flex justify-between">
								<span class="text-muted-foreground">Invited Email:</span>
								<span class="font-medium">{data.invite.email}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">Status:</span>
								<span class="font-medium {getStatusColor(data.invite.status)}">
									{getStatusText(data.invite.status)}
								</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">Invited On:</span>
								<span class="font-medium">
									{new Date(data.invite.createdAt).toLocaleDateString()}
								</span>
							</div>
						</div>
					</div>

					<!-- Authentication and Calendar Access Steps -->
					{#if !session?.data?.session}
						<!-- Step 1: Google Sign In -->
						<div class="bg-primary/5 border-primary/20 mb-4 rounded-lg border p-4">
							<h3 class="mb-2 flex items-center gap-2 font-medium">
								<User size={16} class="text-primary" />
								Step 1: Sign in with Google
							</h3>
							<p class="text-muted-foreground mb-3 text-sm">
								You need to sign in with Google to respond to this invitation.
							</p>
							<Button
								onclick={handleGoogleSignIn}
								disabled={authLoading}
								class="flex items-center gap-2"
							>
								<GoogleLogo size={16} />
								{authLoading ? 'Signing in...' : 'Sign in with Google'}
							</Button>
						</div>
					{:else if !isInvitedUser}
						<!-- Wrong User Warning -->
						<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
							<h3 class="mb-2 flex items-center gap-2 font-medium text-red-700">
								<X size={16} />
								Wrong Account
							</h3>
							<p class="mb-2 text-sm text-red-600">
								You are signed in as <strong>{session.data.user.email}</strong>, but this invitation
								is for <strong>{data.authStatus.invitedEmail}</strong>.
							</p>
							<p class="mb-3 text-sm text-red-600">
								Please sign in with the correct Google account to respond to this invitation.
							</p>
							<Button
								onclick={handleGoogleSignIn}
								variant="outline"
								class="flex items-center gap-2 border-red-300 text-red-700 hover:bg-red-50"
							>
								<GoogleLogo size={16} />
								Sign in with different account
							</Button>
						</div>
					{:else if !hasCalendarAccess}
						<!-- Step 2: Calendar Access -->
						<div class="bg-secondary/5 border-secondary/20 mb-4 rounded-lg border p-4">
							<h3 class="mb-2 flex items-center gap-2 font-medium">
								<Calendar size={16} class="text-secondary" />
								Step 2: Grant Calendar Access
							</h3>
							<p class="text-muted-foreground mb-3 text-sm">
								To accept this invitation, we need access to your Google Calendar to check for
								conflicts.
							</p>
							<div class="text-muted-foreground mb-3 text-xs">
								Currently signed in as: <strong>{session.data.user.email}</strong>
							</div>
							<Button
								onclick={requestCalendarAccess}
								disabled={calendarLoading}
								variant="secondary"
								class="flex items-center gap-2"
							>
								<Calendar size={16} />
								{calendarLoading ? 'Requesting access...' : 'Grant Calendar Access'}
							</Button>
						</div>
					{:else}
						<!-- Authentication Success -->
						<div class="mb-4 rounded-lg border border-green-200 bg-green-50 p-4">
							<h3 class="mb-2 flex items-center gap-2 font-medium text-green-700">
								<Check size={16} />
								Ready to Respond
							</h3>
							<p class="text-sm text-green-600">
								Signed in as <strong>{session.data.user.email}</strong> with calendar access.
							</p>
						</div>
					{/if}

					<!-- Response Buttons -->
					{#if data.invite.status === 'pending' && !responseSubmitted && canRespond}
						<div class="flex gap-3 pt-4">
							<Button
								onclick={() => respondToInvite('accepted')}
								disabled={loading}
								class="flex flex-1 items-center justify-center gap-2"
							>
								<Check size={16} />
								{loading ? 'Responding...' : 'Accept Invitation'}
							</Button>
							<Button
								variant="outline"
								onclick={() => respondToInvite('declined')}
								disabled={loading}
								class="flex flex-1 items-center justify-center gap-2"
							>
								<X size={16} />
								Decline
							</Button>
						</div>
					{:else if data.invite.status === 'pending' && !canRespond}
						<div class="py-4 text-center">
							<p class="text-muted-foreground text-sm">
								Complete the steps above to respond to this invitation.
							</p>
						</div>
					{:else}
						<div class="py-4 text-center">
							{#if data.invite.status === 'accepted'}
								<div class="flex items-center justify-center gap-2 font-medium text-green-600">
									<Check size={20} />
									You have accepted this invitation
								</div>
							{:else if data.invite.status === 'declined'}
								<div class="flex items-center justify-center gap-2 font-medium text-red-600">
									<X size={20} />
									You have declined this invitation
								</div>
							{/if}

							{#if responseSubmitted}
								<p class="text-muted-foreground mt-2 text-sm">Thank you for your response!</p>
							{/if}
						</div>
					{/if}

					<!-- Event Status -->
					{#if data.event.status === EventStatus.CANCELLED}
						<div class="bg-destructive/10 border-destructive/20 rounded-lg border p-4 text-center">
							<p class="text-destructive font-medium">This event has been cancelled</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Chat Interface - Shows after RSVP and when authenticated -->
		{#if showChat && data.authStatus.isAuthenticated}
			<div
				id="chat-interface"
				class="bg-card border-border mt-6 overflow-hidden rounded-lg border shadow-lg"
			>
				<div class="bg-primary/5 border-border border-b p-4">
					<h2 class="text-card-foreground flex items-center gap-2 text-lg font-semibold">
						<ChatCircle size={20} class="text-primary" />
						Event Planning Chat
					</h2>
					<div class="flex items-center justify-between">
						<p class="text-muted-foreground mt-1 text-sm">
							Let's discuss "{data.event.name.trim()}"
						</p>

						<!-- Manual calendar analysis trigger -->
						{#if hasCalendarAccess && data.invite.status === 'accepted'}
							<Button
								variant="ghost"
								size="sm"
								onclick={fetchUserCalendarAndAnalyzeFreeTime}
								disabled={calendarAnalysisLoading}
								class="flex items-center gap-2 text-xs"
							>
								<Calendar size={14} />
								{calendarAnalysisLoading ? 'Analyzing...' : 'Check Free Times'}
							</Button>
						{/if}
					</div>
				</div>

				<!-- Main content area with side-by-side layout -->
				<div class="flex h-[600px]">
					<!-- Chat section (left side) -->
					<div class="flex flex-1 flex-col">
						<div class="flex-1 overflow-hidden">
							<Conversation class="h-full">
								<ConversationContent>
									{#if visibleMessages.length === 0}
										<ConversationEmptyState
											description="Messages will appear here as the conversation progresses."
											title="Start a conversation"
										>
											{#snippet icon()}
												<ChatCircle class="size-6" />
											{/snippet}
										</ConversationEmptyState>
									{:else}
										{#each visibleMessages as messageData, index (messageData.key)}
											<div class="flex gap-3 p-4 {index % 2 === 0 ? 'bg-muted/20' : ''}">
												<div
													class="bg-primary/10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
												>
													{#if messageData.name === 'Assistant'}
														<ChatCircle size={16} class="text-primary" />
													{:else}
														<User size={16} class="text-primary" />
													{/if}
												</div>
												<div class="min-w-0 flex-1">
													<div class="mb-1 flex items-center gap-2">
														<span class="text-card-foreground text-sm font-medium"
															>{messageData.name}</span
														>
													</div>
													<div class="text-card-foreground/90 text-sm whitespace-pre-line">
														{messageData.value}
													</div>
												</div>
											</div>
										{/each}

										<!-- Calendar analysis loading indicator -->
										{#if calendarAnalysisLoading}
											<div class="flex gap-3 p-4">
												<div
													class="bg-primary/10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
												>
													<ChatCircle size={16} class="text-primary" />
												</div>
												<div class="min-w-0 flex-1">
													<div class="mb-1 flex items-center gap-2">
														<span class="text-card-foreground text-sm font-medium">Assistant</span>
													</div>
													<div class="text-card-foreground/90 flex items-center gap-2 text-sm">
														<div
															class="border-primary h-4 w-4 animate-spin rounded-full border-b-2"
														></div>
														Analyzing everyone's calendars for free time slots...
													</div>
												</div>
											</div>
										{/if}
									{/if}
								</ConversationContent>
								<ConversationScrollButton />
							</Conversation>
						</div>

						<!-- Chat Input Interface -->
						<div class="border-border border-t p-4">
							<PromptInput globalDrop multiple onSubmit={handleSubmit}>
								<PromptInputBody>
									<PromptInputAttachments>
										{#snippet children(attachment)}
											<PromptInputAttachment data={attachment} />
										{/snippet}
									</PromptInputAttachments>
									<PromptInputTextarea
										bind:value={text}
										onchange={(e) => (text = (e.target as HTMLTextAreaElement).value)}
										placeholder="Type your message about the event..."
									/>
								</PromptInputBody>
								<PromptInputToolbar>
									<PromptInputTools></PromptInputTools>
									<PromptInputSubmit {status} />
								</PromptInputToolbar>
							</PromptInput>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
	<!-- Calendar visualization (right side) -->
	{#if showCalendarVisualization && calendarOptions}
		<div class="border-border flex h-screen w-full flex-col border-l">
			<div class="bg-muted/30 border-border border-b p-3">
				<h3 class="text-card-foreground flex items-center gap-2 text-sm font-medium">
					<Calendar size={16} class="text-primary" />
					Availability Calendar
				</h3>
				<div class="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
					<span class="flex items-center gap-1">
						<span class="inline-block h-2 w-2 rounded-full bg-green-300"></span>
						Event Time Window
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-2 w-2 rounded-full bg-red-300"></span>
						Out of bounds
					</span>
				</div>
				<div class="text-muted-foreground mt-2 text-xs font-medium">
					Click and drag on the green area to select your preferred time
				</div>
			</div>
			<div class="flex-1 overflow-hidden p-2">
				<EventCalendar plugins={[TimeGrid, Interaction]} options={calendarOptions} />
			</div>

			<!-- Selected Time Slot Details Panel -->
			{#if selectedTimeSlot}
				<div class="border-border bg-card border-t p-4">
					<h4 class="text-card-foreground mb-3 text-sm font-semibold">Selected Time Slot</h4>
					<div class="space-y-2 text-sm">
						<div class="flex items-start justify-between">
							<span class="text-muted-foreground">Day:</span>
							<span class="text-card-foreground font-medium">{selectedTimeSlot.dayOfWeek}</span>
						</div>
						<div class="flex items-start justify-between">
							<span class="text-muted-foreground">Date:</span>
							<span class="text-card-foreground font-medium">{selectedTimeSlot.date}</span>
						</div>
						<div class="flex items-start justify-between">
							<span class="text-muted-foreground">Time:</span>
							<span class="text-card-foreground font-medium"
								>{selectedTimeSlot.startTime} - {selectedTimeSlot.endTime}</span
							>
						</div>
						<div class="flex items-start justify-between">
							<span class="text-muted-foreground">Duration:</span>
							<span class="text-card-foreground font-medium">{selectedTimeSlot.duration}</span>
						</div>
						<div class="border-border mt-3 border-t pt-3">
							<div class="text-muted-foreground mb-1 text-xs">ISO Timestamps:</div>
							<div class="bg-muted rounded p-2 text-xs">
								<div class="mb-1">
									<span class="text-muted-foreground">Start:</span>
									<code class="text-foreground ml-1">{selectedTimeSlot.startISO}</code>
								</div>
								<div>
									<span class="text-muted-foreground">End:</span>
									<code class="text-foreground ml-1">{selectedTimeSlot.endISO}</code>
								</div>
							</div>
						</div>
						<div class="mt-3 flex gap-2">
							<Button class="flex-1" size="sm" variant="outline" onclick={clearTimeSlotSelection}>
								Clear Selection
							</Button>
							<Button class="flex-1" size="sm" onclick={confirmPreferredTime}>
								Confirm Preferred Time
							</Button>
						</div>
					</div>
				</div>
			{:else}
				<div class="border-border bg-muted/20 border-t p-4 text-center">
					<p class="text-muted-foreground text-xs">
						Drag on the green area to select your preferred time
					</p>
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex flex-1 items-center justify-center">loading calendar</div>
	{/if}
</div>
