<script lang="ts">
	import { page } from '$app/state';
</script>

<h1>{page.status}</h1>

{#if page.error}
	<span style="font-size: 10em">
		{page.error.message}
	</span>
{/if}
