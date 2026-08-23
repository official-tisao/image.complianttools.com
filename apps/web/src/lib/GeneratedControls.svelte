<script lang="ts">
  import type { OptionDescription } from '@complianttools/image-engine';
  import { translate, type Locale } from './i18n';
  let {
    descriptions,
    values,
    onChange,
    locale = 'en',
  } = $props<{
    descriptions: Readonly<Record<string, OptionDescription>>;
    values: Record<string, unknown>;
    onChange: (path: string, value: unknown) => void;
    locale?: Locale;
  }>();
  let advancedOpen = $state(false);
  const entries = $derived(Object.entries(descriptions) as Array<[string, OptionDescription]>);
  const visible = $derived(entries.filter(([, description]) => !description.advanced));
  const advanced = $derived(entries.filter(([, description]) => description.advanced));
  const current = (path: string, description: OptionDescription) =>
    values[path] ?? description.defaultValue;
</script>

{#snippet control(path: string, description: OptionDescription)}
  <div class="generated-control" data-testid={`option-${path.replaceAll('.', '-')}`}>
    <div class="control-heading">
      <label for={`control-${path}`}>{description.label}</label><button
        class:reset-hidden={current(path, description) === description.defaultValue}
        class="reset"
        type="button"
        disabled={current(path, description) === description.defaultValue}
        aria-hidden={current(path, description) === description.defaultValue}
        onclick={() => onChange(path, description.defaultValue)}
        >{translate(locale, 'control.reset', 'Reset')}</button
      >
    </div>
    {#if description.help}<p>{description.help}</p>{/if}
    {#if description.control === 'toggle'}
      <input
        id={`control-${path}`}
        type="checkbox"
        checked={Boolean(current(path, description))}
        onchange={(event) => onChange(path, event.currentTarget.checked)}
      />
    {:else if description.control === 'slider'}
      <div class="range-pair">
        <input
          id={`control-${path}`}
          type="range"
          min={description.min}
          max={description.max}
          step={description.step}
          value={Number(current(path, description))}
          oninput={(event) => onChange(path, Number(event.currentTarget.value))}
        /><input
          aria-label={`${description.label} value`}
          type="number"
          min={description.min}
          max={description.max}
          step={description.step}
          value={Number(current(path, description))}
          oninput={(event) => onChange(path, Number(event.currentTarget.value))}
        /><span>{description.unit}</span>
      </div>
    {:else if description.control === 'number'}
      <div class="number-pair">
        <input
          id={`control-${path}`}
          type="number"
          min={description.min}
          max={description.max}
          step={description.step}
          value={Number(current(path, description))}
          oninput={(event) => onChange(path, Number(event.currentTarget.value))}
        /><span>{description.unit}</span>
      </div>
    {:else if description.control === 'segmented' && (description.options?.length ?? 0) <= 4}
      <div class="segments">
        {#each description.options ?? [] as option (option)}<button
            type="button"
            aria-pressed={current(path, description) === option}
            onclick={() => onChange(path, option)}>{option}</button
          >{/each}
      </div>
    {:else if description.control === 'select' || description.control === 'segmented'}
      <select
        id={`control-${path}`}
        value={String(current(path, description))}
        onchange={(event) => onChange(path, event.currentTarget.value)}
        >{#each description.options ?? [] as option (option)}<option value={option}
            >{description.optionLabels?.[option] ?? option}</option
          >{/each}</select
      >
    {:else}
      <input
        id={`control-${path}`}
        type={description.control === 'color' ? 'color' : 'text'}
        value={String(current(path, description))}
        oninput={(event) => onChange(path, event.currentTarget.value)}
      />
    {/if}
  </div>
{/snippet}

{#each visible as [path, description] (path)}{@render control(path, description)}{/each}
{#if advanced.length > 0}<details bind:open={advancedOpen}>
    <summary>{translate(locale, 'control.advanced', 'Advanced')}</summary
    >{#each advanced as [path, description] (path)}{@render control(path, description)}{/each}
  </details>{/if}
