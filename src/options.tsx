import React, { useState, useEffect, useRef } from "react";
import './css/chrome_shared.css';
import { DEFAULT_SITE_ALLOWLIST, mergeDefaultSiteAllowlist, parseSiteAllowlist, serializeSiteAllowlist } from "./shared/site-access";

type Capability = {
	key: string;
	label: string;
	description: string;
};

const CAPABILITIES: Capability[] = [
	{
		key: "aiSummaryEnabled",
		label: "AI Summary",
		description: "Summarize pages and explain reader comments with a local Ollama model, or your own OpenAI/Anthropic API key — no local install required.",
	},
	{
		key: "obsidianClipperEnabled",
		label: "Obsidian Clipper",
		description: "Send the current Medium article to Obsidian through the Advanced Obsidian URI plugin.",
	},
];

const BOOL_DEFAULTS: Record<string, boolean> = CAPABILITIES.reduce((acc, c) => {
	acc[c.key] = c.key === "aiSummaryEnabled" || c.key === "obsidianClipperEnabled";
	return acc;
}, {} as Record<string, boolean>);

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3";
type AiProvider = "ollama" | "openai" | "anthropic";
const DEFAULT_AI_PROVIDER: AiProvider = "ollama";
const DEFAULT_CLOUD_MODEL: Record<Exclude<AiProvider, "ollama">, string> = {
	openai: "gpt-4o-mini",
	anthropic: "claude-haiku-4-5",
};
const DEFAULT_TRANSLATION_LANGUAGE = "Simplified Chinese";
const DEFAULT_OBSIDIAN_FOLDER = "clippers";
const DEFAULT_OBSIDIAN_PATH_TEMPLATE = "clippers/{title}.md";
const DEFAULT_SITE_ALLOWLIST_TEXT = serializeSiteAllowlist(DEFAULT_SITE_ALLOWLIST);

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
	const [translationLanguage, setTranslationLanguage] = useState(DEFAULT_TRANSLATION_LANGUAGE);
	const [obsidianVault, setObsidianVault] = useState("");
	const [obsidianFolder, setObsidianFolder] = useState(DEFAULT_OBSIDIAN_FOLDER);
	const [obsidianPathTemplate, setObsidianPathTemplate] = useState(DEFAULT_OBSIDIAN_PATH_TEMPLATE);
	const [siteAllowlistText, setSiteAllowlistText] = useState(DEFAULT_SITE_ALLOWLIST_TEXT);
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
				siteAllowlist: DEFAULT_SITE_ALLOWLIST,
				aiProvider: DEFAULT_AI_PROVIDER,
				aiApiKey: "",
				aiCloudModel: "",
			},
			(items) => {
				const boolItems: Record<string, boolean> = {};
				for (const c of CAPABILITIES) boolItems[c.key] = !!items[c.key];
				setEnabled(boolItems);
				setOllamaUrl(items.ollamaBaseUrl || DEFAULT_OLLAMA_URL);
				setOllamaModel(items.ollamaModel || DEFAULT_OLLAMA_MODEL);
				const provider: AiProvider = items.aiProvider === "openai" || items.aiProvider === "anthropic" ? items.aiProvider : "ollama";
				setAiProvider(provider);
				setAiApiKey(items.aiApiKey || "");
				setAiCloudModel(items.aiCloudModel || (provider !== "ollama" ? DEFAULT_CLOUD_MODEL[provider] : ""));
				setTranslationLanguage(items.translationLanguage ?? DEFAULT_TRANSLATION_LANGUAGE);
				setObsidianVault(items.obsidianVault || "");
				setObsidianFolder(items.obsidianFolder || DEFAULT_OBSIDIAN_FOLDER);
				setObsidianPathTemplate(items.obsidianPathTemplate || DEFAULT_OBSIDIAN_PATH_TEMPLATE);
				const allowlist = mergeDefaultSiteAllowlist(items.siteAllowlist || DEFAULT_SITE_ALLOWLIST);
				setSiteAllowlistText(serializeSiteAllowlist(allowlist));
				if (serializeSiteAllowlist(allowlist) !== serializeSiteAllowlist(parseSiteAllowlist(items.siteAllowlist || DEFAULT_SITE_ALLOWLIST))) {
					chrome.storage.local.set({ siteAllowlist: allowlist });
				}
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
		chrome.storage.local.set({ ollamaBaseUrl: v }, () => flash("Saved"));
		updateModelList(v);
	};

	const selectModel = (name: string) => {
		setOllamaModel(name);
		chrome.storage.local.set({ ollamaModel: name }, () => flash("Saved"));
	};

	const selectAiProvider = (provider: AiProvider) => {
		setAiProvider(provider);
		const nextModel = provider === "ollama" ? aiCloudModel : (aiCloudModel || DEFAULT_CLOUD_MODEL[provider]);
		if (provider !== "ollama" && !aiCloudModel) setAiCloudModel(nextModel);
		chrome.storage.local.set({ aiProvider: provider }, () => flash("Saved"));
		if (provider === "ollama") updateModelList(ollamaUrl);
	};

	const saveAiApiKey = () => {
		chrome.storage.local.set({ aiApiKey: aiApiKey.trim() }, () => flash("Saved"));
	};

	const saveAiCloudModel = () => {
		const v = aiCloudModel.trim() || (aiProvider !== "ollama" ? DEFAULT_CLOUD_MODEL[aiProvider] : "");
		setAiCloudModel(v);
		chrome.storage.local.set({ aiCloudModel: v }, () => flash("Saved"));
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

	const saveSiteAllowlist = () => {
		const next = parseSiteAllowlist(siteAllowlistText);
		const value = next.length ? next : DEFAULT_SITE_ALLOWLIST;
		setSiteAllowlistText(serializeSiteAllowlist(value));
		chrome.storage.local.set({ siteAllowlist: value }, () => flash("Saved"));
	};

	// Matches NativeMind's pullOllamaModel (background-fns.ts:548-589 + OllamaDownloadModal.vue:122-135)
	const pullModel = async () => {
		const name = pullName.trim();
		if (!name) return;
		if (pullAbort.current) pullAbort.current.abort();
		const ac = new AbortController();
		pullAbort.current = ac;
		setPullState({ active: true, status: "starting…", completed: 0, total: 0, error: "" });
		try {
			const res = await fetch((ollamaUrl || DEFAULT_OLLAMA_URL).replace(/\/$/, "") + "/api/pull", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ model: name, stream: true }),
				signal: ac.signal,
			});
			if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				let idx: number;
				while ((idx = buffer.indexOf("\n")) >= 0) {
					const line = buffer.slice(0, idx).trim();
					buffer = buffer.slice(idx + 1);
					if (!line) continue;
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
				"siteAllowlist",
				"aiProvider",
				"aiApiKey",
				"aiCloudModel",
			],
			() => {
				setEnabled(BOOL_DEFAULTS);
				setOllamaUrl(DEFAULT_OLLAMA_URL);
				setOllamaModel(DEFAULT_OLLAMA_MODEL);
				setAiProvider(DEFAULT_AI_PROVIDER);
				setAiApiKey("");
				setAiCloudModel("");
				setTranslationLanguage(DEFAULT_TRANSLATION_LANGUAGE);
				setObsidianVault("");
				setObsidianFolder(DEFAULT_OBSIDIAN_FOLDER);
				setObsidianPathTemplate(DEFAULT_OBSIDIAN_PATH_TEMPLATE);
				setSiteAllowlistText(DEFAULT_SITE_ALLOWLIST_TEXT);
				setModels([]);
				setConnStatus('unconnected');
				flash("Reset");
			}
		);
	};

	const handleTweetClick = (event) => {
		event.preventDefault();
		const text = encodeURIComponent("Found a great #chrome extension(Medium Enhancer) — AI summaries, Markdown export, and an Obsidian clipper for #Medium articles");
		const via = encodeURIComponent("WesleyWei0316");
		const related = encodeURIComponent("compzets");
		const url = encodeURIComponent("https://github.com/tfrain/medium-enhancer");
		window.open(
			`https://x.com/intent/tweet?text=${text}&via=${via}&related=${related}&url=${url}`,
			"_blank"
		);
	};

	if (!loaded) return null;

	const dotColor =
		connStatus === 'connected' ? '#02b875' :
		connStatus === 'loading' ? '#f0a020' :
		connStatus === 'error' ? '#c62828' : '#888';

	const dotTitle =
		connStatus === 'connected' ? 'Connected to Ollama' :
		connStatus === 'loading' ? 'Checking…' :
		connStatus === 'error' ? `Error: ${connError}` : 'Not connected';

	const pullPct = pullState.total > 0 ? Math.round((pullState.completed / pullState.total) * 100) : 0;

	return (
		<div className="main-container">
			<header>Medium Enhancer Options</header>

			<h1>Capabilities</h1>
			<hr />
			{CAPABILITIES.map((c) => (
				<div className="checkbox" key={c.key}>
					<label>
						<input
							type="checkbox"
							checked={!!enabled[c.key]}
							onChange={(e) => toggle(c.key, e.target.checked)}
						/>
						<span></span> {c.label}
					</label>
					<div style={{ marginLeft: 24, fontSize: 12, color: '#888' }}>{c.description}</div>
				</div>
			))}

			<h1>Site Access</h1>
			<hr />
			<div style={{ marginBottom: 10, maxWidth: 620, fontSize: 12, color: '#888' }}>
				Medium Enhancer is injected by Chrome on HTTP/HTTPS pages, but it only mounts the floating AI button on hosts in this allowlist. Use <code>*.example.com</code> for subdomains, or <code>*</code> to allow every site.
			</div>
			<textarea
				value={siteAllowlistText}
				onChange={(e) => setSiteAllowlistText(e.target.value)}
				onBlur={saveSiteAllowlist}
				style={{ width: 420, minHeight: 150, fontFamily: 'monospace', fontSize: 12 }}
			/>
			<div style={{ marginTop: 6, marginBottom: 16 }}>
				<button type="button" onClick={() => {
					setSiteAllowlistText(DEFAULT_SITE_ALLOWLIST_TEXT);
					chrome.storage.local.set({ siteAllowlist: DEFAULT_SITE_ALLOWLIST }, () => flash("Saved"));
				}} style={{ fontSize: 13 }}>
					Restore default sites
				</button>
			</div>

			{enabled.aiSummaryEnabled && (
				<>
					<h1>AI Provider</h1>
					<hr />
					<div style={{ marginBottom: 14, maxWidth: 560, fontSize: 12, color: '#888' }}>
						Ollama runs fully local and costs nothing, but needs a local install. OpenAI/Anthropic use your own API key — nothing is sent through us — and work with zero setup.
					</div>
					<div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
						{(["ollama", "openai", "anthropic"] as AiProvider[]).map((p) => (
							<label key={p} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
								<input type="radio" name="ai-provider" checked={aiProvider === p} onChange={() => selectAiProvider(p)} />
								{p === "ollama" ? "Ollama (local)" : p === "openai" ? "OpenAI (your key)" : "Anthropic (your key)"}
							</label>
						))}
					</div>

					{aiProvider !== "ollama" && (
						<>
							<div style={{ marginBottom: 10 }}>
								<label htmlFor="ai-api-key" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
									{aiProvider === "openai" ? "OpenAI" : "Anthropic"} API Key
								</label>
								<input
									id="ai-api-key"
									type="password"
									value={aiApiKey}
									onChange={(e) => setAiApiKey(e.target.value)}
									onBlur={saveAiApiKey}
									style={{ width: 340 }}
									placeholder={aiProvider === "openai" ? "sk-..." : "sk-ant-..."}
									autoComplete="off"
								/>
								<div style={{ marginTop: 4, fontSize: 12, color: '#888', maxWidth: 480 }}>
									Stored locally in your browser only (<code>chrome.storage.local</code>) — never synced to Google or sent anywhere but {aiProvider === "openai" ? "api.openai.com" : "api.anthropic.com"}.
								</div>
							</div>
							<div style={{ marginBottom: 16 }}>
								<label htmlFor="ai-cloud-model" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
									Model
								</label>
								<input
									id="ai-cloud-model"
									type="text"
									value={aiCloudModel}
									onChange={(e) => setAiCloudModel(e.target.value)}
									onBlur={saveAiCloudModel}
									style={{ width: 340 }}
									placeholder={DEFAULT_CLOUD_MODEL[aiProvider]}
								/>
							</div>
						</>
					)}

					{aiProvider === "ollama" && (
					<>
					<h1>
						Ollama Settings
						<span
							title={dotTitle}
							style={{
								display: 'inline-block',
								width: 10,
								height: 10,
								borderRadius: '50%',
								background: dotColor,
								marginLeft: 10,
								verticalAlign: 'middle',
							}}
						/>
					</h1>
					<hr />
					<div style={{ marginBottom: 10 }}>
						<label htmlFor="ollama-url" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
							Base URL
						</label>
						<input
							id="ollama-url"
							type="text"
							value={ollamaUrl}
							onChange={(e) => setOllamaUrl(e.target.value)}
							onBlur={saveUrl}
							style={{ width: 340 }}
							placeholder={DEFAULT_OLLAMA_URL}
						/>
					</div>

					<div style={{ marginBottom: 10 }}>
						<label htmlFor="ollama-model" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
							Model
						</label>
						<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
							<select
								id="ollama-model"
								value={ollamaModel}
								onChange={(e) => selectModel(e.target.value)}
								disabled={connStatus !== 'connected' || models.length === 0}
								style={{ width: 420, padding: 4 }}
							>
								{connStatus === 'loading' && <option value="">Loading…</option>}
								{connStatus === 'error' && <option value="">⚠ Not connected to Ollama</option>}
								{connStatus === 'connected' && models.length === 0 && <option value="">No models downloaded</option>}
								{ollamaModel && !models.find((m) => m.name === ollamaModel) && (
									<option value={ollamaModel}>{ollamaModel} (saved)</option>
								)}
								{models.map((m) => (
									<option key={m.name} value={m.name}>{formatModelLabel(m)}</option>
								))}
							</select>
							<button type="button" onClick={() => updateModelList(ollamaUrl)} style={{ fontSize: 13 }}>
								{connStatus === 'loading' ? 'Loading…' : 'Refresh'}
							</button>
						</div>
						{connStatus === 'error' && (
							<div style={{ fontSize: 12, color: '#c62828', marginTop: 4 }}>
								Cannot reach Ollama: {connError}. Is <code>ollama serve</code> running at <code>{ollamaUrl}</code>? You may also need <code>OLLAMA_ORIGINS="*"</code>.
							</div>
						)}
						{connStatus === 'connected' && models.length === 0 && (
							<div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
								No models downloaded. Pull one below (e.g. <code>llama3.2</code>, <code>qwen2.5:3b</code>).
							</div>
						)}
					</div>

					<div style={{ marginBottom: 10 }}>
						<label htmlFor="translation-language" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
							Translation language
						</label>
						<select
							id="translation-language"
							value={translationLanguage}
							onChange={(e) => selectTranslationLanguage(e.target.value)}
							style={{ width: 420, padding: 4 }}
						>
							{TRANSLATION_LANGUAGES.map((l) => (
								<option key={l.value} value={l.value}>{l.label}</option>
							))}
						</select>
						<div style={{ fontSize: 12, color: '#888', marginTop: 4, maxWidth: 520 }}>
							The AI panel shows the English response on the left and a translation on the right. Pick "Off" to hide the translation column.
						</div>
					</div>

					<div style={{ marginBottom: 10 }}>
						<label htmlFor="pull-model" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
							Download model
						</label>
						<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
							<input
								id="pull-model"
								type="text"
								value={pullName}
								onChange={(e) => setPullName(e.target.value)}
								placeholder="e.g. llama3.2 or qwen2.5:3b"
								disabled={pullState.active || connStatus !== 'connected'}
								style={{ width: 320 }}
							/>
							{!pullState.active ? (
								<button type="button" onClick={pullModel} disabled={!pullName.trim() || connStatus !== 'connected'} style={{ fontSize: 13 }}>
									Pull
								</button>
							) : (
								<button type="button" onClick={cancelPull} style={{ fontSize: 13 }}>
									Cancel
								</button>
							)}
						</div>
						{(pullState.active || pullState.status || pullState.error) && (
							<div style={{ marginTop: 6, fontSize: 12, color: '#555', maxWidth: 480 }}>
								{pullState.error ? (
									<span style={{ color: '#c62828' }}>Error: {pullState.error}</span>
								) : (
									<>
										<div>{pullState.status}{pullState.total > 0 && ` — ${formatSize(pullState.completed)} / ${formatSize(pullState.total)} (${pullPct}%)`}</div>
										{pullState.total > 0 && (
											<div style={{ height: 6, background: '#eee', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
												<div style={{ height: '100%', width: `${pullPct}%`, background: '#02b875', transition: 'width 0.2s' }} />
											</div>
										)}
									</>
								)}
							</div>
						)}
					</div>

					</>
					)}

					<div style={{ fontSize: 12, color: '#888', maxWidth: 520 }}>
						Trigger the summary from the page: right-click → "Summarize with AI", or press <code>Ctrl/Cmd+Shift+S</code> (customizable at <code>chrome://extensions/shortcuts</code>).
					</div>
				</>
			)}

			{enabled.obsidianClipperEnabled && (
				<>
					<h1>Obsidian Clipper</h1>
					<hr />
					<div style={{ marginBottom: 10, maxWidth: 560, fontSize: 12, color: '#888' }}>
						Requires the Obsidian community plugin <code>Advanced Obsidian URI</code>. Medium Enhancer sends Markdown directly through the URI when short enough; otherwise it copies Markdown to the clipboard and opens Obsidian with <code>clipboard=true</code>.
					</div>
					<div style={{ marginBottom: 10 }}>
						<label htmlFor="obsidian-vault" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
							Vault name
						</label>
						<input
							id="obsidian-vault"
							type="text"
							value={obsidianVault}
							onChange={(e) => setObsidianVault(e.target.value)}
							onBlur={saveObsidianSettings}
							style={{ width: 340 }}
							placeholder="Leave blank for default vault"
						/>
					</div>
					<div style={{ marginBottom: 10 }}>
						<label htmlFor="obsidian-path-template" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
							Note path template
						</label>
						<input
							id="obsidian-path-template"
							type="text"
							value={obsidianPathTemplate}
							onChange={(e) => setObsidianPathTemplate(e.target.value)}
							onBlur={saveObsidianSettings}
							style={{ width: 420 }}
							placeholder={DEFAULT_OBSIDIAN_PATH_TEMPLATE}
						/>
						<div style={{ fontSize: 12, color: '#888', marginTop: 4, maxWidth: 560 }}>
							Overrides Folder when set. Supported variables: <code>{'{title}'}</code>, <code>{'{author}'}</code>, <code>{'{domain}'}</code>, <code>{'{date}'}</code>. Example: <code>Medium/{'{domain}'}/{'{date}'} - {'{title}'}.md</code>.
						</div>
					</div>
					<div style={{ marginBottom: 10 }}>
						<label htmlFor="obsidian-folder" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
							Folder fallback
						</label>
						<input
							id="obsidian-folder"
							type="text"
							value={obsidianFolder}
							onChange={(e) => setObsidianFolder(e.target.value)}
							onBlur={saveObsidianSettings}
							style={{ width: 340 }}
							placeholder={DEFAULT_OBSIDIAN_FOLDER}
						/>
						<div style={{ fontSize: 12, color: '#888', marginTop: 4, maxWidth: 520 }}>
							Used only when Note path template is blank. Fallback path: <code>{obsidianFolder || DEFAULT_OBSIDIAN_FOLDER}/Article Title.md</code>.
						</div>
					</div>
				</>
			)}

			<br />
			<hr />
			<br />
			<button style={{ fontSize: '16px' }} id="btnReset" onClick={resetOptions}>Reset</button>

			<br />
			<br />
			<br />
			<div>If you like this extension, just share to people who need this.</div>
			<br />
			<div className="social-buttons fr">
				<a href="#" className="twitter-share-button" onClick={handleTweetClick}>Tweet</a>
			</div>
			<br />
			<br />
			Source Code: It will be public soon.
			<br />
			<p>
				Made &#9829; by <a href="https://wesley-wei.medium.com/" target="_blank">WesleyWei</a>
				<br />
				Send me feedback  &#9829; via <a href="https://t.me/tfrain_w" target="_blank">My telegram</a>
			</p>
			<br />
			<br />
			<div id="status">{statusMessage}</div>
		</div>
	);
};

export default Options;
