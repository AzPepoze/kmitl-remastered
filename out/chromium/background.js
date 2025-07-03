function sleep(delay) {
	return new Promise((resolve) => setTimeout(resolve, delay));
}

async function getNowTab() {
	let queryOptions = { active: true, currentWindow: true };

	try {
		let tabsArray = await chrome.tabs.query(queryOptions);

		if (tabsArray && tabsArray.length > 0) {
			return tabsArray[0];
		}

		queryOptions = { active: true };
		tabsArray = await chrome.tabs.query(queryOptions);

		if (tabsArray && tabsArray.length > 0) {
			return tabsArray[0];
		}

		return null;
	} catch (error) {
		console.error("Failed to get the current active tab:", error);
		return null;
	}
}
