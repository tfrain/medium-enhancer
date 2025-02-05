import React, { useState, useEffect } from "react";
import './css/chrome_shared.css';

const Options = () => {
	const [autoType, setAutoType] = useState("2");
	const [showTip, setShowTip] = useState(true);
	const [rememberPos, setRememberPos] = useState(true);
	const [statusMessage, setStatusMessage] = useState("");
	const [isFirstLoad, setIsFirstLoad] = useState(true);
	const [isResetLoad, setIsResetLoad] = useState(true);
	const [isModified, setIsModified] = useState(false);

	const [selectorInoreader, setSelectorInoreader] = useState(".article_content");
	const [tempSelectorInoreader, setTempSelectorInoreader] = useState(selectorInoreader);

	useEffect(() => {
		chrome.storage.local.get(
			{
				isShowTip: showTip,
				isRememberPos: rememberPos,
				autoType: autoType,
				selectorInoreader: selectorInoreader,
			},
			(items) => {
				setShowTip(items.isShowTip);
				setRememberPos(items.isRememberPos);
				setAutoType(items.autoType);
				setSelectorInoreader(items.selectorInoreader);
				setTempSelectorInoreader(items.selectorInoreader);

				// 每次设置完毕，展示时都会走到这里逻辑，而下面的设置在第一次打开时不会触发
				setIsFirstLoad(false);
				setIsResetLoad(false);
			}
		);
	}, []);

	// 因为有变量，当变量变化时，会触发这里的逻辑
	useEffect(() => {
		if (!isFirstLoad && isModified) {
			chrome.storage.local.set({
				isShowTip: showTip,
				isRememberPos: rememberPos,
				autoType: autoType,
				selectorInoreader: selectorInoreader,
			}, () => {
				if (!isResetLoad) {
					setStatusMessage("Options saved"); // 设置提示信息
				}
				// setIsFirstLoad(true);
				setIsModified(false);
				setIsResetLoad(false);
				// setTimeout(() => {
				// 	setStatusMessage("");
				// 	setIsFirstLoad(false);
				// }, 3000);
			});
		}
	}, [showTip, rememberPos, autoType, selectorInoreader, isModified]);

	const resetOptions = () => {
		chrome.storage.local.clear(() => {
			setIsResetLoad(true);
			setIsModified(true);

			setShowTip(true);
			setRememberPos(true);
			setAutoType("2");
			setSelectorInoreader(".article_content");
			setTempSelectorInoreader(".article_content");
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

	// const handleKeyDownMedium = (event) => {
	// 	if (event.key === 'Enter') {
	// 		event.preventDefault();
	// 		setIsModified(true);
	// 	}
	// };

	const handleTweetClick = (event) => {
		event.preventDefault();
		const text = encodeURIComponent("发现一个超棒的 #chrome extension(Medium Enhancer)，它能智能展示文章目录，支持 #Inoreader 和 #Medium");
		const via = encodeURIComponent("WesleyWei0316");
		const related = encodeURIComponent("compzets");
		const url = encodeURIComponent("https://github.com/tfrain/medium-enhancer");
		window.open(
			`https://twitter.com/intent/tweet?text=${text}&via=${via}&related=${related}&url=${url}`,
			"_blank"
		);
	};

	return (
		<div className="main-container">
			<header>
				Medium Enhancer Options
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
					<label htmlFor="auto-2">Inoreader and Medium</label>
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

			<h1>Inoreader Support</h1>
			<hr />
			<div> <span style={{ color: 'red' }}> Don't change this unless the web apps change its dom.</span>
			</div>
			<h3>Inoreader article querySelector</h3>
			<input type="text" id="selector-inoreader" value={tempSelectorInoreader} onKeyDown={handleKeyDownInoreader}
				onChange={(e) => {
					setTempSelectorInoreader(e.target.value);
				}} />
			{/* <h3>Medium article querySelector</h3>
			<input type="text" id="selector-medium" value={tempSelectorMedium} onKeyDown={handleKeyDownMedium}
				onChange={(e) => {
					setTempSelectorMedium(e.target.value);
				}} /> */}

			<br />
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
				<a href="emmm" className="twitter-share-button" onClick={handleTweetClick}>Tweet</a>
			</div>
			<br />
			<br />
			Source Code: <a href="https://github.com/tfrain/medium-enhancer" target="_blank">https://github.com/tfrain/medium-enhancer</a>
			<br />
			<p>
				Original &#9829; by <a href="https://github.com/FallenMax/smart-toc" target="_blank">FallenMax</a>
				<br />
				Modified &#9829; by <a href="https://wesley-wei.medium.com/" target="_blank">WesleyWei</a>
			</p>
			<br />
			<br />
			<div id="status">{statusMessage}</div>
		</div >
	)
}

export default Options;