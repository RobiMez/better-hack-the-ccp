<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	import { authClient } from '$lib/auth-client';
	import { Separator } from '$lib/components/ui/separator';
	import { GoogleLogo } from 'phosphor-svelte';

	let loading = $state(false);

	async function handleSocialSignUp(provider: string) {
		loading = true;
		try {
			switch (provider) {
				case 'google':
					await authClient.signIn.social({
						provider: 'google'
					});
					break;
				case 'github':
					await authClient.signIn.social({
						provider: 'github'
					});
					break;
			}
		} catch (error) {
			console.error('Social sign up failed:', error);
		} finally {
			loading = false;
		}
	}
</script>

<div class="container mx-auto flex min-h-[90vh] items-center justify-center border border-black">
	<div class="w-full p-4 lg:p-8">
		<div class="mx-auto flex w-full flex-col items-center justify-center space-y-6 sm:w-[350px]">
			<div class="flex flex-col space-y-2 text-center">
				<h1 class="text-2xl font-semibold tracking-tight">Welcome back</h1>
				<p class="text-muted-foreground text-sm">Use google oauth to sign in</p>
				<small>You will be asked for calendar permissions and scopes.</small>
			</div>

			<div class="relative w-full">
				<div class="absolute inset-0 flex items-center">
					<Separator />
				</div>
			</div>

			<div>
				<Button
					variant="secondary"
					onclick={() => handleSocialSignUp('google')}
					disabled={loading}
					type="button"
				>
					<GoogleLogo />
					Google
				</Button>
			</div>
		</div>
	</div>
</div>
