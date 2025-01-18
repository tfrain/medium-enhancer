import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet";

const Options = () => {
	const [autoType, setAutoType] = useState("0");
	const [showTip, setShowTip] = useState(true);
	const [rememberPos, setRememberPos] = useState(true);
	const [statusMessage, setStatusMessage] = useState("");
	const [isFirstLoad, setIsFirstLoad] = useState(true);
	const [isResetLoad, setIsResetLoad] = useState(true);
	const [isModified, setIsModified] = useState(false);

	const [selectorInoreader, setSelectorInoreader] = useState(".article_content");
	const [selectorFeedly, setSelectorFeedly] = useState(".entryBody");
	const [tempSelectorInoreader, setTempSelectorInoreader] = useState(selectorInoreader);
	const [tempSelectorFeedly, setTempSelectorFeedly] = useState(selectorFeedly);

	useEffect(() => {
		// Restore options from chrome.storage
		chrome.storage.local.get(
			{
				isShowTip: showTip,
				isRememberPos: rememberPos,
				autoType: autoType,
				selectorInoreader: selectorInoreader,
				selectorFeedly: selectorFeedly,
			},
			(items) => {
				setShowTip(items.isShowTip);
				setRememberPos(items.isRememberPos);
				setAutoType(items.autoType);
				setSelectorInoreader(items.selectorInoreader);
				setSelectorFeedly(items.selectorFeedly);

				setTempSelectorInoreader(items.selectorInoreader);
				setTempSelectorFeedly(items.selectorFeedly);

				setIsFirstLoad(false);
				setIsResetLoad(false);
			}
		);
	}, []);

	// 异步监听配置的更新，保存每次最新更新的内容
	useEffect(() => {
		// Save options whenever they change
		if (!isFirstLoad && !isResetLoad && isModified) {
			chrome.storage.local.set({
				isShowTip: showTip,
				isRememberPos: rememberPos,
				autoType: autoType,
				selectorInoreader: selectorInoreader,
				selectorFeedly: selectorFeedly,
			}, () => {
				setStatusMessage("Options saved"); // 设置提示信息
				setIsFirstLoad(true);
				setIsModified(false);
				setTimeout(() => {
					setStatusMessage("");
					setIsFirstLoad(false);
				}, 4000);
			});
		}
	}, [showTip, rememberPos, autoType, selectorInoreader, selectorFeedly, isModified]);

	const resetOptions = () => {
		// Clear storage and restore defaults
		chrome.storage.local.clear(() => {
			setShowTip(true);
			setRememberPos(true);
			setAutoType("0");
			setSelectorInoreader(".article_content");
			setSelectorFeedly(".entryBody");
			setTempSelectorInoreader(".article_content");
			setTempSelectorFeedly(".entryBody");
			setIsResetLoad(true);
			setIsModified(false);
			setStatusMessage("Reset saved");
		});
	};

	const handleKeyDownInoreader = (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			setSelectorInoreader(tempSelectorInoreader);
			setIsModified(true);
		}
	};

	const handleKeyDownFeedly = (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			setSelectorFeedly(tempSelectorFeedly);
			setIsModified(true);
		}
	};

	return (
		<div className="main-container">
			<Helmet>
				<title>Simple Outliner</title>
				<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
				<meta http-equiv="Content-Security-Policy" content="script-src 'self';object-src 'self';script-src-elem 'self' 'unsafe-inline' https://platform.twitter.com https://syndication.twitter.com;" />
				<link rel="stylesheet" href="css/chrome_shared.css" />
				<style>
					{`
						body>.main-container{max-width:800px;margin:50px auto}
						header{margin:0 auto 50px auto;font-size:36px}
						#status{color:green;}
					`}
				</style>
			</Helmet>
			<header>
				Simple Outliner
			</header>

			<h1>Auto Load</h1>
			<hr />
			<div className="radio">
				<div>
					<input id="auto-0" type="radio" name="auto" value="0" checked={autoType === "0"}
						onChange={(e) => {
							setAutoType(e.target.value);
							setIsModified(true);
						}} />
					<label htmlFor="auto-0">Disable</label>
				</div>
			</div>
			<div className="radio">
				<div>
					<input id="auto-1" type="radio" name="auto" value="1" checked={autoType === "1"}
						onChange={(e) => {
							setAutoType(e.target.value);
							setIsModified(true);
						}} />
					<label htmlFor="auto-1">All Page</label>
				</div>
			</div>
			<div className="radio">
				<div>
					<input id="auto-2" type="radio" name="auto" value="2" checked={autoType === "2"}
						onChange={(e) => {
							setAutoType(e.target.value);
							setIsModified(true);
						}} />
					<label htmlFor="auto-2">Inoreader and Feedly Web App</label>
				</div>
			</div>

			<h1>UI</h1>
			<hr />

			<div className="checkbox">
				<label>
					<input type="checkbox" id="show-tip" checked={showTip}
						onChange={(e) => {
							setShowTip(e.target.checked);
							setIsModified(true);
						}} /><span></span> Show Detect Toast
				</label>
			</div>
			<div className="checkbox">
				<label>
					<input type="checkbox" id="remember-pos" checked={rememberPos}
						onChange={(e) => {
							setRememberPos(e.target.checked);
							setIsModified(true);
						}} /><span></span> Remember TOC Position
				</label>
			</div>

			<h1>Inoreader and Feedly Support</h1>
			<hr />
			<div> <span style={{ color: 'red' }}> Don't change this unless the web apps change its dom.</span>
			</div>
			<h3>Inoreader article querySelector</h3>
			<input type="text" id="selector-inoreader" value={tempSelectorInoreader} onKeyDown={handleKeyDownInoreader}
				onChange={(e) => {
					setTempSelectorInoreader(e.target.value);
				}} />
			<h3>Feedly article querySelector</h3>
			<input type="text" id="selector-feedly" value={tempSelectorFeedly} onKeyDown={handleKeyDownFeedly}
				onChange={(e) => {
					setTempSelectorFeedly(e.target.value);
				}} />

			<br />
			<br />
			<hr />
			<br />
			<button style={{ fontSize: '16px' }} id="btnReset" onClick={resetOptions}>Reset</button>

			<br />
			<br />
			<br />
			<div>If you like this extension, no need to buy me a coffee, just share to people who need this.</div>
			<br />
			<div className="social-buttons fr">
				<a href="https://twitter.com/share" className="twitter-share-button" data-via="lcomplete_wild" data-text="发现一个超棒的 #浏览器扩展（Smart TOC / 智能网页大纲），它能智能展示文章目录，支持 #Inoreader 和 #Feedly，而且它还是 #开源 免费的，快来升级你的上网体验吧！" data-related="compzets" data-hashtags="" data-url="https://github.com/lcomplete/smart-toc">Tweet</a>
				<script src="twitter_widgets.js" id="twitter-wjs"></script>
			</div>
			<br />
			<br />
			Source Code: <a href="https://github.com/lcomplete/smart-toc" target="_blank">https://github.com/lcomplete/smart-toc</a>
			<br />
			<p>
				Original &#9829; by <a href="https://github.com/FallenMax/smart-toc" target="_blank">FallenMax</a>
				<br />
				Modified &#9829; by <a href="https://twitter.com/lcomplete_wild" target="_blank">lcomplete</a>
			</p>
			<br />
			<br />
			<div id="status">{statusMessage}</div>
		</div >
	)
}

export default Options;