import { DEFAULT_AI_PROVIDER, DEFAULT_OLLAMA_URL, DEFAULT_MODELS, getAiConfig, readAiSettings, type AiProvider } from "./shared/ai-defaults";
import { PRO_GET_KEY_URL, canGetProKey, proStatus, tryUnlock, type ProStatus } from "./shared/pro";
import { ARTICLE_URL } from "./shared/whats-new"
import { readStreamLines } from "./shared/stream-lines";
import React, { useState, useEffect, useRef } from "react";
import './options.css';
import iconUrl from "data-base64:../assets/icon.png";
import { ollamaPermissionPattern } from "./shared/site-access";

type Capability = {
	key: string;
	label: string;
	description: string;
};

const CAPABILITIES: Capability[] = [
	{
		key: "aiSummaryEnabled",
		label: "AI Summary",
		description: "Adds \"Summarize with AI\" to the right-click menu and the keyboard shortcut.",
	},
	{
		key: "obsidianClipperEnabled",
		label: "Save to Obsidian",
		description: 'Adds "Send to Obsidian" next to the Markdown download. Needs Obsidian with the Advanced URI plugin.',
	},
	{
		key: "selfCiteEnabled",
		label: "Cite My Story",
		description: "In the Medium editor, suggests your own related past stories to link.",
	},
];

const BOOL_DEFAULTS: Record<string, boolean> = CAPABILITIES.reduce((acc, c) => {
	// Save to Obsidian is opt-in: without Obsidian and the Advanced URI plugin
	// the export would go nowhere.
	acc[c.key] = c.key !== "obsidianClipperEnabled";
	return acc;
}, {} as Record<string, boolean>);

const DEFAULT_OLLAMA_MODEL = DEFAULT_MODELS.ollama;
const DEFAULT_TRANSLATION_LANGUAGE = "";   // off by default: the audience reads English
const DEFAULT_OBSIDIAN_FOLDER = "clippers";
const DEFAULT_OBSIDIAN_PATH_TEMPLATE = "clippers/{title}.md";

// Empty string = translation column disabled.
const TRANSLATION_LANGUAGES: { value: string; label: string }[] = [
	{ value: "", label: "Off (no translation)" },
	{ value: "Simplified Chinese", label: "简体中文 (Simplified Chinese)" },
	{ value: "Traditional Chinese", label: "繁體中文 (Traditional Chinese)" },
	{ value: "English", label: "English" },
	{ value: "Japanese", label: "日本語 (Japanese)" },
	{ value: "Korean", label: "한국어 (Korean)" },
	{ value: "Spanish", label: "Español (Spanish)" },
	{ value: "French", label: "Français (French)" },
	{ value: "German", label: "Deutsch (German)" },
];

// Mirror of NativeMind's OllamaModelInfo (subset we actually use)
type OllamaModelInfo = {
	name: string;
	size: number;
	parameterSize?: string;
	quantizationLevel?: string;
	modifiedAt?: number;
};

type ConnStatus = 'unconnected' | 'loading' | 'connected' | 'error';

const formatSize = (bytes: number): string => {
	if (!bytes || bytes <= 0) return '';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let v = bytes;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
	return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

const formatModelLabel = (m: OllamaModelInfo): string => {
	const parts: string[] = [m.name];
	const meta: string[] = [];
	if (m.parameterSize) meta.push(m.parameterSize);
	if (m.quantizationLevel) meta.push(m.quantizationLevel);
	if (m.size) meta.push(formatSize(m.size));
	if (meta.length) parts.push(`— ${meta.join(' · ')}`);
	return parts.join(' ');
};

const Options = () => {
	const [enabled, setEnabled] = useState<Record<string, boolean>>(BOOL_DEFAULTS);
	const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL);
	const [ollamaModel, setOllamaModel] = useState(DEFAULT_OLLAMA_MODEL);
	const [aiProvider, setAiProvider] = useState<AiProvider>(DEFAULT_AI_PROVIDER);
	const [aiApiKey, setAiApiKey] = useState("");
	const [aiCloudModel, setAiCloudModel] = useState("");
	const providerSettings = useRef<Record<string, any>>({});
	const [translationLanguage, setTranslationLanguage] = useState(DEFAULT_TRANSLATION_LANGUAGE);
	const [obsidianVault, setObsidianVault] = useState("");
	const [obsidianFolder, setObsidianFolder] = useState(DEFAULT_OBSIDIAN_FOLDER);
	const [obsidianPathTemplate, setObsidianPathTemplate] = useState(DEFAULT_OBSIDIAN_PATH_TEMPLATE);
	const [models, setModels] = useState<OllamaModelInfo[]>([]);
	const [connStatus, setConnStatus] = useState<ConnStatus>('unconnected');
	const [connError, setConnError] = useState("");
	const [pullName, setPullName] = useState("");
	const [pullState, setPullState] = useState<{ active: boolean; status: string; completed: number; total: number; error: string }>({
		active: false, status: "", completed: 0, total: 0, error: ""
	});
	const pullAbort = useRef<AbortController | null>(null);
	const [statusMessage, setStatusMessage] = useState("");
	const [loaded, setLoaded] = useState(false);
	const [pro, setPro] = useState<ProStatus>({ state: 'none' });
	const [proKey, setProKey] = useState("");
	const [proMessage, setProMessage] = useState("");
	const [unlocking, setUnlocking] = useState(false);

	useEffect(() => {
		const refresh = () => { proStatus().then(setPro).catch(() => setProMessage("Could not read Pro status.")); };
		const onChanged = (changes, area) => {
			if ((area === 'local' || area === 'sync') && (changes.enhancerProUnlocked || changes.enhancerProKey)) refresh();
		};
		refresh();
		window.addEventListener('focus', refresh);
		chrome.storage.onChanged.addListener(onChanged);
		return () => {
			window.removeEventListener('focus', refresh);
			chrome.storage.onChanged.removeListener(onChanged);
		};
	}, []);

	const unlockPro = async (e: React.FormEvent) => {
		e.preventDefault();
		setUnlocking(true);
		try {
			const result = await tryUnlock(proKey);
			setProMessage(result === 'ok' ? 'Pro unlocked. Keep your key for reinstalls or another computer.' :
				result === 'expired' ? 'That key has expired.' : 'That key did not work. Check it and try again.');
			setPro(await proStatus());
			if (result === 'ok') setProKey("");
		} catch {
			setProMessage('Could not save the key. Please try again.');
		} finally { setUnlocking(false); }
	};

	// Matches NativeMind's testConnection() (ollama.ts:113-128): fetch origin, check "Ollama is running"
	const testConnection = async (baseUrl: string): Promise<boolean> => {
		try {
			const res = await fetch((baseUrl || DEFAULT_OLLAMA_URL).replace(/\/$/, "") + "/");
			if (!res.ok) return false;
			const text = await res.text();
			return /ollama is running/i.test(text);
		} catch {
			return false;
		}
	};

	// Matches NativeMind's updateOllamaModelList (store.ts:26-49)
	const updateModelList = async (baseUrl: string) => {
		setConnStatus('loading');
		setConnError("");
		try {
			const connected = await testConnection(baseUrl);
			if (!connected) {
				throw new Error("Not connected to Ollama");
			}
			const res = await fetch((baseUrl || DEFAULT_OLLAMA_URL).replace(/\/$/, "") + "/api/tags");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			// /api/tags shape: { models: [{ name, size, modified_at, details: { parameter_size, quantization_level } }] }
			const list: OllamaModelInfo[] = (json?.models || []).map((m: any) => ({
				name: m.name,
				size: m.size ?? 0,
				parameterSize: m?.details?.parameter_size,
				quantizationLevel: m?.details?.quantization_level,
				modifiedAt: m?.modified_at ? Date.parse(m.modified_at) : undefined,
			})).filter((m: OllamaModelInfo) => !!m.name);
			// sort most recently modified first
			list.sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0));
			setModels(list);
			setConnStatus('connected');
		} catch (e: any) {
			setModels([]);
			setConnStatus('error');
			setConnError(e?.message || "Failed to reach Ollama");
		}
	};

	useEffect(() => {
		chrome.storage.local.get(
			{
				...BOOL_DEFAULTS,
				ollamaBaseUrl: DEFAULT_OLLAMA_URL,
				ollamaModel: DEFAULT_OLLAMA_MODEL,
				translationLanguage: DEFAULT_TRANSLATION_LANGUAGE,
				obsidianVault: "",
				obsidianFolder: DEFAULT_OBSIDIAN_FOLDER,
				obsidianPathTemplate: "",
				aiProvider: DEFAULT_AI_PROVIDER,
			},
			async (items) => {
				const aiSettings = await readAiSettings();
				providerSettings.current = aiSettings;
				const config = getAiConfig(aiSettings);
				const boolItems: Record<string, boolean> = {};
				for (const c of CAPABILITIES) boolItems[c.key] = !!items[c.key];
				setEnabled(boolItems);
				setOllamaUrl(items.ollamaBaseUrl || DEFAULT_OLLAMA_URL);
				setOllamaModel(items.ollamaModel || DEFAULT_OLLAMA_MODEL);
				const provider = config.provider;
				setAiProvider(provider);
				setAiApiKey(config.apiKey);
				setAiCloudModel(config.model);
				setTranslationLanguage(items.translationLanguage ?? DEFAULT_TRANSLATION_LANGUAGE);
				setObsidianVault(items.obsidianVault || "");
				setObsidianFolder(items.obsidianFolder || DEFAULT_OBSIDIAN_FOLDER);
				setObsidianPathTemplate(items.obsidianPathTemplate || DEFAULT_OBSIDIAN_PATH_TEMPLATE);
				setLoaded(true);
				if (boolItems.aiSummaryEnabled && provider === "ollama") {
					updateModelList(items.ollamaBaseUrl || DEFAULT_OLLAMA_URL);
				}
			}
		);
	}, []);

	const flash = (msg: string) => {
		setStatusMessage(msg);
		setTimeout(() => setStatusMessage(""), 2000);
	};

	const toggle = (key: string, value: boolean) => {
		const next = { ...enabled, [key]: value };
		setEnabled(next);
		chrome.storage.local.set({ [key]: value }, () => flash("Saved"));
		if (key === "aiSummaryEnabled" && value && connStatus === 'unconnected') {
			updateModelList(ollamaUrl);
		}
	};

	const saveUrl = () => {
		const v = ollamaUrl.trim() || DEFAULT_OLLAMA_URL;
		const save = () => {
			chrome.storage.local.set({ ollamaBaseUrl: v }, () => flash("Saved"));
			updateModelList(v);
		};
		// localhost is granted at install; an Ollama on another machine needs its
		// host. Must be requested inside this click handler, before any await.
		const pattern = ollamaPermissionPattern(v);
		if (!pattern) return save();
		chrome.permissions.request({ origins: [pattern] }, (granted) => {
			save();
			if (!granted) flash("Saved, but access to that host was not allowed, so Ollama cannot be reached");
		});
	};

	const selectModel = (name: string) => {
		setOllamaModel(name);
		chrome.storage.local.set({ ollamaModel: name }, () => flash("Saved"));
	};

	const selectAiProvider = (provider: AiProvider) => {
		setAiProvider(provider);
		const config = getAiConfig(providerSettings.current, provider);
		setAiApiKey(config.apiKey);
		setAiCloudModel(config.model);
		chrome.storage.local.set({ aiProvider: provider }, () => flash("Saved"));
		if (provider === "ollama") updateModelList(ollamaUrl);
	};

	const saveAiApiKey = () => {
		if (aiProvider === 'ollama') return;
		const key = aiProvider + 'ApiKey';
		providerSettings.current[key] = aiApiKey.trim();
		chrome.storage.local.set({ [key]: aiApiKey.trim() }, () => flash("Saved"));
	};

	const saveAiCloudModel = () => {
		if (aiProvider === 'ollama') return;
		const v = aiCloudModel.trim() || DEFAULT_MODELS[aiProvider];
		const key = aiProvider + 'Model';
		providerSettings.current[key] = v;
		setAiCloudModel(v);
		chrome.storage.local.set({ [key]: v }, () => flash("Saved"));
	};

	const selectTranslationLanguage = (lang: string) => {
		setTranslationLanguage(lang);
		chrome.storage.local.set({ translationLanguage: lang }, () => flash("Saved"));
	};

	const saveObsidianSettings = () => {
		chrome.storage.local.set({
			obsidianVault: obsidianVault.trim(),
			obsidianFolder: obsidianFolder.trim() || DEFAULT_OBSIDIAN_FOLDER,
			obsidianPathTemplate: obsidianPathTemplate.trim(),
		}, () => flash("Saved"));
	};

	// Matches NativeMind's pullOllamaModel (background-fns.ts:548-589 + OllamaDownloadModal.vue:122-135)
	const pullModel = async () => {
		const name = pullName.trim();
		if (!name) return;
		if (pullAbort.current) pullAbort.current.abort();
		const ac = new AbortController();
		pullAbort.current = ac;
		setPullState({ active: true, status: "starting...", completed: 0, total: 0, error: "" });
		try {
			const res = await fetch((ollamaUrl || DEFAULT_OLLAMA_URL).replace(/\/$/, "") + "/api/pull", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ model: name, stream: true }),
				signal: ac.signal,
			});
			if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
			for await (const line of readStreamLines(res.body)) {
				if (!line.trim()) continue;
				try {
					const p = JSON.parse(line);
					if (p.error) throw new Error(p.error);
					setPullState((prev) => ({
						...prev,
						status: p.status || prev.status,
						completed: p.completed ?? prev.completed,
						total: p.total ?? prev.total,
					}));
				} catch (e: any) {
					if (e instanceof SyntaxError) continue;
					throw e;
				}
			}
			setPullState((prev) => ({ ...prev, active: false, status: "done" }));
			setPullName("");
			updateModelList(ollamaUrl);
		} catch (e: any) {
			if (e?.name === "AbortError") {
				setPullState((prev) => ({ ...prev, active: false, status: "cancelled" }));
				return;
			}
			setPullState((prev) => ({ ...prev, active: false, error: e?.message || "Pull failed" }));
		}
	};

	const cancelPull = () => {
		if (pullAbort.current) pullAbort.current.abort();
	};

	const resetOptions = () => {
		chrome.storage.local.remove(
			[
				...Object.keys(BOOL_DEFAULTS),
				"ollamaBaseUrl",
				"ollamaModel",
				"translationLanguage",
				"obsidianVault",
				"obsidianFolder",
				"obsidianPathTemplate",
				"aiProvider",
				"aiApiKey",
				"aiCloudModel",
				"openaiApiKey", "anthropicApiKey", "openaiModel", "anthropicModel",
			],
			() => {
				setEnabled(BOOL_DEFAULTS);
				setOllamaUrl(DEFAULT_OLLAMA_URL);
				setOllamaModel(DEFAULT_OLLAMA_MODEL);
				providerSettings.current = {};
				setAiProvider(DEFAULT_AI_PROVIDER);
				setAiApiKey("");
				setAiCloudModel("");
				setTranslationLanguage(DEFAULT_TRANSLATION_LANGUAGE);
				setObsidianVault("");
				setObsidianFolder(DEFAULT_OBSIDIAN_FOLDER);
				setObsidianPathTemplate(DEFAULT_OBSIDIAN_PATH_TEMPLATE);
				setModels([]);
				setConnStatus('unconnected');
				flash("Reset");
			}
		);
	};

	if (!loaded) return null;

	const statusLabel =
		connStatus === 'connected' ? 'Connected' :
		connStatus === 'loading' ? 'Checking...' :
		connStatus === 'error' ? 'Not connected' : 'Not checked';

	const pullPct = pullState.total > 0 ? Math.round((pullState.completed / pullState.total) * 100) : 0;
	const version = chrome.runtime.getManifest().version;

	const confirmReset = () => {
		if (window.confirm("Reset all Medium Enhancer settings to their defaults? Your API key will be removed.")) resetOptions();
	};

	return (
		<div className="opt">
			<header className="opt-head">
				<img src={iconUrl} alt="" className="opt-logo" />
				<div>
					<h1>Medium Enhancer</h1>
					<p className="opt-sub">Settings · v{version}</p>
				</div>
			</header>

			<section className="card">
				<h2>Features</h2>
				{CAPABILITIES.map((c) => (
					<label className="row" key={c.key}>
						<div className="row-text">
							<div className="row-title">{c.label}</div>
							<div className="hint">{c.description}</div>
						</div>
						<span className="switch">
							<input type="checkbox" checked={!!enabled[c.key]} onChange={(e) => toggle(c.key, e.target.checked)} />
							<span className="slider" />
						</span>
					</label>
				))}
			</section>

			<section className="card">
				<h2>Pro</h2>
				<p className="hint">Quote cards without the watermark, all card styles and sizes; more Pro features are coming.</p>
				<p role="status">{pro.state === 'active' ? `Pro active, valid until ${pro.validUntil}` :
					pro.state === 'expired' ? `Expired — valid until ${pro.validUntil}` : 'Not unlocked'}</p>
				{pro.key && <p className="hint">Your key: <code>{pro.key}</code>. Keep it for reinstalls or another computer.</p>}
				<form onSubmit={unlockPro}>
					<div className="field">
						<label htmlFor="pro-key">Pro key</label>
						<div className="inline">
							<input id="pro-key" type="text" autoComplete="off" spellCheck={false} value={proKey}
								onChange={(e) => setProKey(e.target.value)} placeholder="Enter your key" />
							<button type="submit" className="btn" disabled={unlocking || !proKey.trim()}>{unlocking ? 'Unlocking…' : 'Unlock'}</button>
						</div>
					</div>
				</form>
				<div className="hint" role="status">{proMessage}</div>
				{canGetProKey() && <a className="btn" href={PRO_GET_KEY_URL} target="_blank" rel="noopener">Get a key</a>}
			</section>

			{enabled.aiSummaryEnabled && (
				<section className="card">
					<h2>AI</h2>
					<p className="hint">Ollama runs on your computer and is free. OpenAI and Anthropic use your own API key; requests go straight to them, never through us.</p>

					<div className="segmented" role="radiogroup" aria-label="AI provider">
						{(["ollama", "openai", "anthropic"] as AiProvider[]).map((p) => (
							<button key={p} type="button" role="radio" aria-checked={aiProvider === p}
								className={aiProvider === p ? "on" : ""} onClick={() => selectAiProvider(p)}>
								{p === "ollama" ? "Ollama (local)" : p === "openai" ? "OpenAI" : "Anthropic"}
							</button>
						))}
					</div>

					{aiProvider !== "ollama" && (
						<>
							<div className="field">
								<label htmlFor="ai-api-key">{aiProvider === "openai" ? "OpenAI" : "Anthropic"} API key</label>
								<input id="ai-api-key" type="password" value={aiApiKey} autoComplete="off"
									onChange={(e) => setAiApiKey(e.target.value)} onBlur={saveAiApiKey}
									placeholder={aiProvider === "openai" ? "sk-..." : "sk-ant-..."} />
								<div className="hint">Stored only in this browser and sent only to {aiProvider === "openai" ? "api.openai.com" : "api.anthropic.com"}.</div>
							</div>
							<div className="field">
								<label htmlFor="ai-cloud-model">Model</label>
								<input id="ai-cloud-model" type="text" value={aiCloudModel}
									onChange={(e) => setAiCloudModel(e.target.value)} onBlur={saveAiCloudModel}
									placeholder={DEFAULT_MODELS[aiProvider]} />
							</div>
						</>
					)}

					{aiProvider === "ollama" && (
						<>
							<div className="field">
								<label htmlFor="ollama-url">
									Ollama address <span className={`pill pill-${connStatus}`} title={connError || statusLabel}>{statusLabel}</span>
								</label>
								<input id="ollama-url" type="text" value={ollamaUrl}
									onChange={(e) => setOllamaUrl(e.target.value)} onBlur={saveUrl} placeholder={DEFAULT_OLLAMA_URL} />
							</div>
							<div className="field">
								<label htmlFor="ollama-model">Model</label>
								<div className="inline">
									<select id="ollama-model" value={ollamaModel} onChange={(e) => selectModel(e.target.value)}
										disabled={connStatus !== 'connected' || models.length === 0}>
										{connStatus === 'loading' && <option value="">Loading...</option>}
										{connStatus === 'error' && <option value="">Not connected to Ollama</option>}
										{connStatus === 'connected' && models.length === 0 && <option value="">No models downloaded</option>}
										{ollamaModel && !models.find((m) => m.name === ollamaModel) && (
											<option value={ollamaModel}>{ollamaModel} (saved)</option>
										)}
										{models.map((m) => (
											<option key={m.name} value={m.name}>{formatModelLabel(m)}</option>
										))}
									</select>
									<button type="button" className="btn" onClick={() => updateModelList(ollamaUrl)}>
										{connStatus === 'loading' ? 'Checking...' : 'Refresh'}
									</button>
								</div>
								{connStatus === 'error' && (
									<div className="hint err">
										Cannot reach Ollama at <code>{ollamaUrl}</code>. Is <code>ollama serve</code> running?
									</div>
								)}
							</div>
							<details className="more">
								<summary>Download a model</summary>
								<div className="inline">
									<input type="text" value={pullName} onChange={(e) => setPullName(e.target.value)}
										placeholder="e.g. llama3.2 or qwen2.5:3b" disabled={pullState.active || connStatus !== 'connected'} />
									{!pullState.active ? (
										<button type="button" className="btn" onClick={pullModel} disabled={!pullName.trim() || connStatus !== 'connected'}>Download</button>
									) : (
										<button type="button" className="btn" onClick={cancelPull}>Cancel</button>
									)}
								</div>
								{(pullState.active || pullState.status || pullState.error) && (
									<div className="hint">
										{pullState.error ? (
											<span className="err">Error: {pullState.error}</span>
										) : (
											<>
												{pullState.status}{pullState.total > 0 && ` · ${formatSize(pullState.completed)} / ${formatSize(pullState.total)} (${pullPct}%)`}
												{pullState.total > 0 && <div className="bar"><div style={{ width: `${pullPct}%` }} /></div>}
											</>
										)}
									</div>
								)}
							</details>
						</>
					)}

					<div className="field">
						<label htmlFor="translation-language">Also translate the result into</label>
						<select id="translation-language" value={translationLanguage} onChange={(e) => selectTranslationLanguage(e.target.value)}>
							{TRANSLATION_LANGUAGES.map((l) => (
								<option key={l.value} value={l.value}>{l.label}</option>
							))}
						</select>
						<div className="hint">Shows a second column with the translation. Off by default.</div>
					</div>

					<div className="hint">
						Right-click a page and choose "Summarize with AI", or press <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>.{" "}
						<a href="#" onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: "chrome://extensions/shortcuts" }); }}>Change shortcut</a>
					</div>
				</section>
			)}

			{enabled.obsidianClipperEnabled && (
				<section className="card">
					<h2>Obsidian</h2>
					<p className="hint">Needs the <code>Advanced Obsidian URI</code> community plugin in Obsidian.</p>
					<div className="field">
						<label htmlFor="obsidian-vault">Vault name</label>
						<input id="obsidian-vault" type="text" value={obsidianVault}
							onChange={(e) => setObsidianVault(e.target.value)} onBlur={saveObsidianSettings} placeholder="Blank = your default vault" />
					</div>
					<div className="field">
						<label htmlFor="obsidian-path-template">Note path</label>
						<input id="obsidian-path-template" type="text" value={obsidianPathTemplate}
							onChange={(e) => setObsidianPathTemplate(e.target.value)} onBlur={saveObsidianSettings} placeholder={DEFAULT_OBSIDIAN_PATH_TEMPLATE} />
						<div className="hint">Variables: <code>{'{title}'}</code> <code>{'{author}'}</code> <code>{'{domain}'}</code> <code>{'{date}'}</code>. Example: <code>Medium/{'{date}'} - {'{title}'}.md</code></div>
					</div>
					<div className="field">
						<label htmlFor="obsidian-folder">Folder (used when Note path is blank)</label>
						<input id="obsidian-folder" type="text" value={obsidianFolder}
							onChange={(e) => setObsidianFolder(e.target.value)} onBlur={saveObsidianSettings} placeholder={DEFAULT_OBSIDIAN_FOLDER} />
					</div>
				</section>
			)}

			<section className="card card-plain">
				<div className="row">
					<div className="row-text">
						<div className="row-title">Reset settings</div>
						<div className="hint">Restore every option to its default and remove your API key.</div>
					</div>
					<button type="button" className="btn btn-danger" onClick={confirmReset}>Reset</button>
				</div>
			</section>

			<footer className="opt-foot">
				Medium Enhancer v{version} ·{" "}
				<a href={ARTICLE_URL} target="_blank" rel="noopener">Feedback</a> ·{" "}
				by <a href="https://wesley-wei.medium.com/" target="_blank" rel="noopener">Wesley Wei</a>
			</footer>

			<div className={`toast ${statusMessage ? "show" : ""}`} role="status">{statusMessage}</div>
		</div>
	);
};

export default Options;
