<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Calendar, MapPin, User, Clock, Check, X, GoogleLogo, ChatCircle } from 'phosphor-svelte';
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

	let { data }: { data: any } = $props();

	let loading = $state(false);
	let responseSubmitted = $state(false);
	let authLoading = $state(false);
	let calendarLoading = $state(false);

	// Chat interface state
	let showChat = $state(false);
	let visibleMessages = $state<
		Array<{ key: string; value: string; name: string; avatar?: string }>
	>([]);

	// Chat conversation history for AI
	let conversationHistory = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

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

		// If user has already accepted, show chat interface
		if (data.invite.status === 'accepted') {
			showChat = true;
			const welcomeMessage = `Welcome back! You've already accepted the invitation to "${data.event.name}". I'm here to help you find the perfect time for this event. What time works best for you?`;

			visibleMessages = [
				{
					key: 'welcome',
					value: welcomeMessage,
					name: 'AI Assistant',
					avatar: undefined
				}
			];

			conversationHistory = [{ role: 'assistant', content: welcomeMessage }];
		}
	});

	async function handleSubmit(message: PromptInputMessage) {
		let hasText = Boolean(message.text);
		let hasAttachments = Boolean(message.files?.length);

		if (!(hasText || hasAttachments)) {
			return;
		}

		if (!hasText || !message.text) {
			return;
		}

		const userMessage = message.text;
		status = 'submitted';

		// Add user message to chat
		visibleMessages = [
			...visibleMessages,
			{
				key: `user-${Date.now()}`,
				value: userMessage,
				name: session?.data?.user?.name || session?.data?.user?.email || 'User',
				avatar: undefined
			}
		];

		// Add to conversation history
		conversationHistory = [...conversationHistory, { role: 'user', content: userMessage }];

		// Clear the input
		text = '';

		setTimeout(() => {
			status = 'streaming';
		}, SUBMITTING_TIMEOUT);

		try {
			// Call the AI API
			const response = await fetch('/api/chat-rsvp', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					messages: conversationHistory,
					eventId: data.event._id,
					inviteCode: data.inviteCode
				})
			});

			if (!response.ok) {
				throw new Error('Failed to get AI response');
			}

			// Stream the response
			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			if (!reader) {
				throw new Error('No response body');
			}

			let assistantMessage = '';
			const assistantKey = `assistant-${Date.now()}`;

			// Add placeholder for assistant message
			visibleMessages = [
				...visibleMessages,
				{
					key: assistantKey,
					value: '',
					name: 'AI Assistant',
					avatar: undefined
				}
			];

			let done = false;
			while (!done) {
				const { value, done: readerDone } = await reader.read();
				done = readerDone;

				if (value) {
					const chunk = decoder.decode(value, { stream: true });
					const lines = chunk.split('\n');

					for (const line of lines) {
						if (line.startsWith('0:')) {
							// Text chunk
							const textData = line.slice(2);
							try {
								assistantMessage += JSON.parse(textData);

								// Update the assistant message in the UI
								visibleMessages = visibleMessages.map((msg) =>
									msg.key === assistantKey ? { ...msg, value: assistantMessage } : msg
								);
							} catch (e) {
								// Ignore parsing errors
							}
						}
					}
				}
			}

			// Add complete assistant message to history
			conversationHistory = [
				...conversationHistory,
				{ role: 'assistant', content: assistantMessage }
			];

			status = 'idle';
		} catch (error) {
			console.error('Chat error:', error);

			// Add error message
			visibleMessages = [
				...visibleMessages,
				{
					key: `error-${Date.now()}`,
					value: 'Sorry, I encountered an error. Please try again.',
					name: 'AI Assistant',
					avatar: undefined
				}
			];

			status = 'idle';
		}
	}

	async function handleGoogleSignIn() {
		if (session?.data?.session) {
			console.log('User is already signed in, skipping sign in');
			return;
		}

		authLoading = true;
		try {
			await authClient.signIn.social({
				provider: 'google',
				callbackURL: window.location.href // Redirect back to this invite page
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
				scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
				callbackURL: window.location.href // Redirect back to this invite page
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

				// Show chat interface after successful RSVP
				showChat = true;

				// Add initial welcome message
				const welcomeMessage =
					response === 'accepted'
						? `Great! You've accepted the invitation to "${data.event.name}". I'm here to help you find the perfect time for this event. What time works best for you?`
						: `Thanks for letting us know you can't make it to "${data.event.name}". Is there anything you'd like to discuss about the event?`;

				visibleMessages = [
					{
						key: 'welcome',
						value: welcomeMessage,
						name: 'AI Assistant',
						avatar: undefined
					}
				];

				// Add to conversation history
				conversationHistory = [{ role: 'assistant', content: welcomeMessage }];
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

	// Check if user can respond (authenticated + is invited user + has calendar access)
	let canRespond = $derived(session?.data?.session && isInvitedUser && hasCalendarAccess);
</script>

<svelte:head>
	<title>Event Invitation - {data.event.name}</title>
</svelte:head>

<div class="bg-background min-h-screen">
	<div class="container mx-auto max-w-2xl px-4 py-8">
		<div class="bg-card border-border overflow-hidden rounded-lg border shadow-lg">
			<!-- Header -->
			<div class="bg-primary/5 border-border border-b p-6">
				<h1 class="text-card-foreground mb-2 text-2xl font-bold">You're Invited!</h1>
				<p class="text-muted-foreground">
					You have been invited to <strong>{data.event.name}</strong>
				</p>
			</div>

			<!-- Event Details -->
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
							<span>{data.event.organizer_id?.name || 'Unknown'}</span>
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
							onclick={() => (window.location.href = '/auth/login')}
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
		</div>

		<!-- Chat Interface - Shows after RSVP -->
		{#if showChat && data.invite.status === 'accepted'}
			<div class="bg-card border-border mt-6 overflow-hidden rounded-lg border shadow-lg">
				<div class="bg-primary/5 border-border border-b p-4">
					<h2 class="text-card-foreground flex items-center gap-2 text-lg font-semibold">
						<ChatCircle size={20} class="text-primary" />
						Event Planning Chat
					</h2>
					<p class="text-muted-foreground mt-1 text-sm">
						Let's discuss your preferred time for "{data.event.name}"
					</p>
				</div>

			<div class="flex h-96 flex-col">
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
											{#if messageData.name === 'AI Assistant'}
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
											<div class="text-card-foreground/90 text-sm">
												{messageData.value}
											</div>
										</div>
									</div>
								{/each}
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
							<PromptInputTools>
								<!-- <PromptInputActionMenu>
										<PromptInputActionMenuTrigger />
										<PromptInputActionMenuContent>
											<PromptInputActionAddAttachments />
										</PromptInputActionMenuContent>
									</PromptInputActionMenu> -->
							</PromptInputTools>
							<PromptInputSubmit {status} />
						</PromptInputToolbar>
					</PromptInput>
				</div>
			</div>
		</div>
		{/if}
	</div>
</div>
