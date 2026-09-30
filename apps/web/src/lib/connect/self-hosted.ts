/**
 * P5-14 — `/connect-ai/self-hosted` content (README §17.4), with every command verified.
 *
 * ## Verification
 *
 * Each entry below was checked against that project's own documentation or source on the date in
 * `verifiedOn`, and the exact place it was read is in `source`. The command strings are the ones the
 * upstream docs or code actually contain — not a plausible reconstruction.
 *
 * Three of the four runtimes turned out differently from what README §17.4's table shows. Those
 * differences are recorded in `differsFromReadme` with the reason, and the page prints them, because
 * publishing §17.4's table verbatim would mean publishing a command that does not work:
 *
 * - **LiteLLM** — §17.4 says `--config` with `general_settings.cors_origins`. The proxy reads
 *   `LITELLM_CORS_ORIGINS` from the environment (`_get_cors_config` in `litellm/proxy/proxy_server.py`);
 *   no config-file key named `cors_origins` is read from `general_settings`. Documented as env var.
 * - **LM Studio** — §17.4 says "Server tab → enable CORS → set the allowed origin". LM Studio has an
 *   **Enable CORS** switch and a `--cors` flag, but no per-origin allowlist setting. There is nothing
 *   to set an origin to, so the instruction is to enable the switch, and to read the security note
 *   that comes with it.
 * - **vLLM** — §17.4's `--allowed-origins '["https://…"]'` matches upstream exactly, and is
 *   verified at source level in `vllm/entrypoints/launchers/cli_args.py`.
 *
 * Anything not verified is marked `verified: false` and the page says so rather than implying
 * otherwise. Nothing here is marked verified on the strength of a search result.
 */

/** The day every command in this file was checked against upstream. */
export const VERIFIED_ON = '2026-09-29';

/** One runtime's CORS setup, with the exact commands and where they were verified. */
export type RuntimeGuide = {
  readonly id: string;
  readonly name: string;
  /** What this runtime is, in one sentence, for someone who has not used it. */
  readonly blurb: string;
  /** Default port, as the project's own documentation states it. */
  readonly defaultPort: string;
  /** Base URL to paste into the walkthrough's base-URL field. */
  readonly baseUrl: string;
  /** Ordered steps. `command` is copy-pasteable; `note` is prose. */
  readonly steps: readonly {
    readonly label: string;
    readonly command?: string;
    readonly note?: string;
    /** Set on the step that must be run last, so the UI can render it distinctly. */
    readonly restart?: boolean;
  }[];
  /** True only when the commands above were read out of upstream docs or source. */
  readonly verified: boolean;
  /** Exactly where. Rendered next to the commands so a reader can check them. */
  readonly source: string;
  readonly sourceUrl: string;
  /** How §17.4's summary differs, when it does. */
  readonly differsFromReadme?: string;
  /** The upstream security note, quoted rather than paraphrased. */
  readonly securityNote?: string;
};

export const RUNTIMES: readonly RuntimeGuide[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    blurb:
      'The simplest way to run a model on your own machine. Install it, pull a model, and it serves an API on your machine with no account.',
    defaultPort: '11434',
    baseUrl: 'http://localhost:11434/v1',
    steps: [
      {
        label: 'macOS — set the origin for the app',
        command: 'launchctl setenv OLLAMA_ORIGINS "https://image.complianttools.com"',
        note: 'Run this in a terminal, then quit and reopen Ollama. The variable is read at startup, so a running Ollama will not notice the change.',
      },
      {
        label: 'Linux — set the origin in the systemd unit',
        command: 'systemctl edit ollama.service',
        note: 'This opens an editor. Add one line under [Service], then save and exit.',
        restart: false,
      },
      {
        label: 'Linux — the line to add',
        command: '[Service]\nEnvironment="OLLAMA_ORIGINS=https://image.complianttools.com"',
        note: 'Ollama allows requests from 127.0.0.1 and 0.0.0.0 by default. OLLAMA_ORIGINS is for additional origins, which is what a web page is.',
      },
      {
        label: 'Linux — reload and restart',
        command: 'sudo systemctl daemon-reload && sudo systemctl restart ollama',
      },
      {
        label: 'Windows — set the origin for your account',
        command: 'setx OLLAMA_ORIGINS "https://image.complianttools.com"',
        note: 'First quit Ollama from the task bar, run this, then start Ollama again from the Start menu. Windows inherits user environment variables at launch.',
      },
      {
        label: 'Pull a model that can see images',
        command: 'ollama pull llama3.2-vision',
        note: 'Ollama’s own docs list model capabilities per model; a model without the vision capability will answer, but not about your images.',
        restart: true,
      },
    ],
    verified: true,
    source:
      'Ollama FAQ, “How can I allow additional web origins to access Ollama?” and “How do I configure Ollama server?” — the latter gives the launchctl, systemctl edit, and Windows environment-variable procedures reproduced above.',
    sourceUrl: 'https://github.com/ollama/ollama/blob/main/docs/faq.mdx',
  },
  {
    id: 'lm-studio',
    name: 'LM Studio',
    blurb:
      'A desktop app that downloads and runs models locally, with a built-in server. Nothing leaves your machine once the model is on disk.',
    defaultPort: '1234',
    baseUrl: 'http://localhost:1234/v1',
    steps: [
      {
        label: 'Turn CORS on in the server settings',
        command: 'lms server start --cors',
        note: 'From the app, the same setting is the Enable CORS switch in the developer server settings. Restart the server after changing it.',
        restart: true,
      },
      {
        label: 'Start the server (GUI equivalent)',
        command: 'lms server start',
        note: 'The same command without --cors leaves CORS disabled, which is the default.',
      },
    ],
    verified: true,
    source:
      'LM Studio docs: the “Enable CORS” switch in the developer server settings, and the `lms server start` reference, which documents --cors as “Enable CORS support for web application development. When not set, CORS is disabled”.',
    sourceUrl: 'https://lmstudio.ai/docs/developer/core/server',
    differsFromReadme:
      'README §17.4 says “Server tab → enable CORS → set the allowed origin”. LM Studio has an Enable CORS switch but no per-origin allowlist — there is no setting to enter an origin into, so the switch is the whole procedure. The upstream warning about what enabling it exposes is reproduced below rather than left out.',
    securityNote:
      '“Enabling CORS can expose your server to security risks; we recommend enabling authentication. Only do this if you know what you’re doing.” — LM Studio docs, `lms server start`.',
  },
  {
    id: 'vllm',
    name: 'vLLM',
    blurb:
      'A server for people already running GPUs, usually on Linux. It serves an OpenAI-compatible API and is the usual choice when a model is too large for a laptop.',
    defaultPort: '8000',
    baseUrl: 'http://localhost:8000/v1',
    steps: [
      {
        label: 'Allow this origin',
        command: `vllm serve <model> --allowed-origins '["${'https://image.complianttools.com'}"]'`,
        note: 'The value is JSON, so it needs the single quotes around it. The default is ["*"], which already allows browser calls — you only need this flag to narrow the list to this site.',
      },
      {
        label: 'Confirm it is up',
        command: 'curl http://localhost:8000/v1/models',
        note: 'If this prints JSON, the server is running. If it prints a CORS error from curl, that is expected and harmless — curl does not enforce CORS, so a JSON reply here means the server is fine.',
      },
    ],
    verified: true,
    source:
      'vLLM source, `vllm/entrypoints/launchers/cli_args.py`: `allowed_origins: list[str] = field(default_factory=lambda: ["*"])` with the comment “Allowed origins.”, and the CLI customisation that runs `json.loads` on it. Verified at source level because the flag is defined in code rather than described in prose on the serving page.',
    sourceUrl:
      'https://github.com/vllm-project/vllm/blob/main/vllm/entrypoints/launchers/cli_args.py',
  },
  {
    id: 'litellm',
    name: 'LiteLLM',
    blurb:
      'A proxy that puts many providers — including Azure, Bedrock, and Vertex — behind one OpenAI-compatible address. Useful for a company deployment you do not want to reach directly from a browser.',
    defaultPort: '4000',
    baseUrl: 'http://localhost:4000/v1',
    steps: [
      {
        label: 'Set the allowed origins',
        command: 'export LITELLM_CORS_ORIGINS="https://image.complianttools.com"',
        note: 'Comma-separated for more than one. This is read from the environment, not from the config file.',
      },
      {
        label: 'Start the proxy',
        command: 'litellm --config config.yaml',
        note: 'Run it in the same shell as the export above, or set the variable in your service definition.',
        restart: true,
      },
    ],
    verified: true,
    source:
      'LiteLLM source, `litellm/proxy/proxy_server.py`, function `_get_cors_config`: reads `LITELLM_CORS_ORIGINS`, splits it on commas, trims each entry, and falls back to `["*"]` when unset. `LITELLM_CORS_ALLOW_CREDENTIALS` is a separate flag and is off whenever the origins are `*`.',
    sourceUrl: 'https://github.com/BerriAI/litellm/blob/main/litellm/proxy/proxy_server.py',
    differsFromReadme:
      'README §17.4 says “`--config` with `general_settings.cors_origins`”. LiteLLM reads the allowed origins from the `LITELLM_CORS_ORIGINS` environment variable; `general_settings` in the config file does not carry a CORS key. The environment variable is what is documented here because it is the one the code reads.',
  },
];

/**
 * Models that are actually good at vision, with the honest caveat.
 *
 * These are the model families the runtimes above are commonly used with. The caveat is not
 * decoration: a local vision model on a laptop is usually good at reading clear printed text and
 * mediocre at fine detail, so a page that implied parity with a hosted frontier model would be
 * lying about the thing the user is about to pay for.
 */
export const LOCAL_VISION_NOTES: readonly {
  family: string;
  note: string;
  caveat: string;
  unverified?: boolean;
}[] = [
  {
    family: 'Llama 3.2 Vision (11B / 90B)',
    note: 'The default choice for Ollama and LM Studio users. Reads printed text, describes photographs, and answers questions about an image.',
    caveat:
      'On a laptop it will be slow and will not match a frontier model on fine detail. It is very good at ordinary alt-text work.',
  },
  {
    family: 'Qwen2.5-VL',
    note: 'Strong at reading text inside images, including rotated and photographed text, which is where OCR-style work gets hard.',
    caveat:
      'Sizes vary a lot; the small variants are usable on modest hardware and the large ones are not.',
  },
  {
    family: 'Models without a vision capability',
    note: 'A text-only model will still answer, and will answer from the text alone.',
    caveat:
      'It will describe a photo it was never shown. If results look confidently wrong, check the model’s capabilities before assuming the tool is broken.',
  },
];

/**
 * Mixed content, per browser (README §14.10).
 *
 * The engine carries `LOCALHOST_MIXED_CONTENT_GUIDANCE` for the same reason and is explicitly
 * flagged there as written from observed behaviour rather than verified. These entries follow that
 * status: they are labelled with what is known and what is not, rather than presented as a settled
 * cross-browser rule. The honest position is that Chrome treats `http://localhost` as a potentially
 * trustworthy origin, and that the other engines have varied.
 */
export const MIXED_CONTENT_NOTES: readonly {
  browser: string;
  behaviour: string;
  confident: boolean;
}[] = [
  {
    browser: 'Chrome and Edge',
    behaviour:
      'Treat http://localhost and http://127.0.0.1 as potentially-trustworthy origins, so a page on https can usually reach a local server over plain HTTP.',
    confident: false,
  },
  {
    browser: 'Firefox',
    behaviour:
      'Has also treated localhost as a secure context, but the rules here have changed between versions.',

    confident: false,
  },
  {
    browser: 'Safari',
    behaviour:
      'Has not consistently allowed https pages to reach a plain-HTTP localhost server. This is the engine most likely to need a workaround.',

    confident: false,
  },
];

/** How to check the server from a terminal before suspecting the page. */
export const CURL_CHECKS: readonly { runtime: string; command: string; expected: string }[] = [
  {
    runtime: 'Ollama',
    command: 'curl http://localhost:11434/v1/models',
    expected:
      'JSON listing the models you have pulled. If this fails, the server is the problem, not the browser.',
  },
  {
    runtime: 'LM Studio',
    command: 'curl http://localhost:1234/v1/models',
    expected:
      'JSON, if a model is loaded. LM Studio serves the endpoint whether or not a model is downloaded.',
  },
  {
    runtime: 'vLLM',
    command: 'curl http://localhost:8000/v1/models',
    expected: 'JSON listing the served model.',
  },
  {
    runtime: 'LiteLLM',
    command: 'curl http://localhost:4000/v1/models',
    expected: 'JSON listing the models the proxy is configured to serve.',
  },
];

/** The troubleshooting decision tree, as ordered checks rather than prose. */
export const TROUBLESHOOTING_STEPS: readonly { check: string; if: string }[] = [
  {
    check: 'Does curl from a terminal reach the server?',
    if: 'If not, the server is not running or the port is wrong. Nothing about the browser is relevant yet.',
  },
  {
    check: 'Does the CORS preflight succeed?',
    if: 'In the Network tab, look for an OPTIONS request with a 2xx. A failed preflight is the browser refusing before the real request.',
  },
  {
    check: 'Is the origin in the server’s list, exactly?',
    if: 'Scheme, host, and port must match the page you are on, character for character. A trailing slash makes it a different origin.',
  },
  {
    check: 'Was the server restarted after the setting changed?',
    if: 'All four runtimes read the CORS setting at startup. A running server will not pick up a change to its environment.',
  },
  {
    check: 'Is the page https and the server http?',
    if: 'That combination is blocked in some browsers. Serve the local server over TLS, or use a browser that permits it.',
  },
  {
    check: 'Is the model a vision model?',
    if: 'A text-only model answers anyway, from the text alone. Results that ignore your image usually mean this, not a broken connection.',
  },
];
