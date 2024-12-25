const ICONS = {
	off: `img/off-32.png`,
	on: `img/on-32.png`,
	list: `img/list-32.png`
};

let settings = {
	proxyInfo: {
		type: `socks`,
		host: `127.0.0.1`,
		port: 9050
	},
	proxyDNS: false,
	auth: false,
	authInfo: {
		username: ``,
		password: ``
	},
	status: false,
	listProxy: false,
	list: {}
};

let popupPorts = new Set();

let tabs = {
	on: new Set(),
	off: new Set()
};

let errors = {};

(async () => {
	let storageData = await browser.storage.local.get();

	Object.assign(settings, storageData);

	await browser.storage.local.set(settings);

	addListeners();

	browser.runtime.onConnect.addListener(onConnect);
})();

async function onConnect(port) {
	let currentTab = await getCurrentTab();

	let params = {
		settings: settings,
		tabId: currentTab?.id,
		hostTab: getHostFromUrl(currentTab?.url)
	};

	if (!currentTab?.id) {
		params.statusTab = false;
	} else if (settings.status) {
		params.statusTab = !tabs.off.has(currentTab.id);
	} else {
		params.statusTab = tabs.on.has(currentTab.id);
	}

	params.errors = errors[currentTab?.id] ? [...errors[currentTab.id]] : [];

	port.postMessage(params);

	popupPorts.add(port);

	port.onMessage.addListener(msg => {
		onPopupMessage(msg, currentTab);
	});

	port.onDisconnect.addListener(() => {
       popupPorts.delete(port);
    });
}

async function onPopupMessage(msg, currentTab) {
	if (typeof msg.proxyTab !== `undefined`) {
		if (currentTab) {
			if (msg.proxyTab) {
				if (!settings.status) {
					tabs.on.add(currentTab.id);
				}

				tabs.off.delete(currentTab.id);
			} else {
				if (settings.status) {
					tabs.off.add(currentTab.id);
				}

				tabs.on.delete(currentTab.id);
			}
		}

		updateAddonStateForActiveTab(currentTab);
	} else if (typeof msg.proxyGlobal !== `undefined`) {
		settings.status = msg.proxyGlobal;

		tabs.on.delete(currentTab?.id);
		tabs.off.delete(currentTab?.id);

		await browser.storage.local.set({status: settings.status});

		updateAddonStateForActiveTab(currentTab);
	} else if (typeof msg.proxyList !== `undefined`) {
		settings.proxyList = msg.proxyList;

		await browser.storage.local.set({proxyList: settings.proxyList});

		updateAddonStateForActiveTab(currentTab);
	} else if (typeof msg.type !== `undefined`) {
		settings.proxyInfo.type = msg.type;
		settings.proxyInfo.host = msg.host;
		settings.proxyInfo.port = +msg.port;
		settings.proxyDNS = msg.proxyDNS;
		settings.auth = msg.auth;
		settings.authInfo.username = msg.username;
		settings.authInfo.password = msg.password;

		await browser.storage.local.set(settings);
	} else if (typeof msg.list !== `undefined`) {
		settings.list = msg.list;

		await browser.storage.local.set({list: settings.list});
	} else if (typeof msg.listAddRemove !== `undefined`) {
		let hostTab = msg.host ? msg.host : getHostFromUrl(currentTab.url);

		if (hostTab) {
			if (msg.listAddRemove) {
				settings.list[hostTab] = true;
			} else {
				delete settings.list[hostTab];
			}

			await browser.storage.local.set({list: settings.list});
		}
	}
}

async function getCurrentTab() {
	let tabs = await browser.tabs.query({currentWindow: true, active: true});

	return tabs[0];
}

function getHostFromUrl(str) {
	try {
		let url = new URL(str);

		return url?.host.match(/[^\.]+\.[^\.]+$/)[0];
	} catch (e) {
		return;
	}
}

function updateAddonStateForActiveTab(currentTab) {
	if (
		settings.status && !currentTab
		|| settings.status && !tabs.off.has(currentTab?.id)
		|| !settings.status && tabs.on.has(currentTab?.id)
		) {
		setIcon(`on`);
	} else if (settings.proxyList) {
		setIcon(`list`);
	} else {
		setIcon(`off`);
	}
}

async function setIcon(mode) {
	await browser.browserAction.setIcon({
	    path: {
	        32: ICONS[mode]
	    }
	});
}

function iconChanger() {
	(async () => {
		updateAddonStateForActiveTab(await getCurrentTab());
	})();

	return true;
}

function addTabErrors(url, tabId) {
	let host = getHostFromUrl(url);

	if (!host || tabId === -1) {
		return;
	}

	if (!errors[tabId]) {
		errors[tabId] = new Set();
	}

	if (errors[tabId].has(host)) {
		return;
	}

	errors[tabId].add(host);

	popupPorts.forEach(port => {
		port.postMessage({errorsLive: host, tabId: tabId});
	});
}

function removeTabErrors(tabId) {
	if (tabId !== -1 && errors[tabId]) {
		delete errors[tabId];

		popupPorts.forEach(port => {
			port.postMessage({errorsLive: false, tabId: tabId});
		});
	}
}

function addListeners() {
	browser.windows.onFocusChanged.addListener(iconChanger);

	browser.tabs.onActivated.addListener(iconChanger);

	browser.tabs.onRemoved.addListener(tabId => {
		if (tabId !== -1) {
			tabs.on.delete(tabId);
			tabs.off.delete(tabId);
		}

		removeTabErrors(tabId)
	});

	browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
		if (changeInfo.url) {
			removeTabErrors(tabId);
		}
	});

	browser.proxy.onRequest.addListener(requestInfo => {
		if (
			(settings.status && !tabs.off.has(requestInfo.tabId))
			|| !settings.status && tabs.on.has(requestInfo.tabId)
			|| (settings.list[getHostFromUrl(requestInfo.url)] && settings.proxyList)
			) {

			let proxyInfo = Object.assign({}, settings.proxyInfo);

			if (settings.auth && settings.proxyInfo.type === `socks`) {
				Object.assign(proxyInfo, settings.authInfo);
			}

			if (settings.proxyDNS) {
				proxyInfo.proxyDNS = settings.proxyDNS;
			}

			return proxyInfo;
		}

		return {type: `direct`};
	}, {urls: [`<all_urls>`]});

	browser.proxy.onError.addListener(error => {
		console.error(`Proxy error: ${error.message}`);
	});

	browser.webRequest.onErrorOccurred.addListener(details => {
		if (details.tabId !== -1) {
			addTabErrors(details.url, details.tabId);
		}
	}, {urls: [`<all_urls>`]});

	browser.webRequest.onCompleted.addListener(details => {
		if (details.tabId !== -1 && details.statusCode >= 400) {
			addTabErrors(details.url, details.tabId);
		}
	}, {urls: [`<all_urls>`]});

	browser.webRequest.onAuthRequired.addListener(details => {
		if (
			details.isProxy
			&& settings.auth
			&& (settings.proxyInfo.type === `http` || settings.proxyInfo.type === `https`)
		) {
			return {authCredentials: settings.authInfo};
		}
	}, {urls: [`<all_urls>`]}, [`blocking`]);
}
