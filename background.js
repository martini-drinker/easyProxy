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

let tabs = {};

class Tab {
	constructor(obj) {
		this.id = obj?.id;
		this.host = obj?.host;
		this.status = (typeof obj?.status !== `undefined`) ? obj.status : settings.status;
		this.errors = obj?.errors || new Set(); 
	}
}

let popupPorts = {};

(async () => {
	let storageData = await browser.storage.local.get();

	Object.assign(settings, storageData);

	await browser.storage.local.set(settings);

	addListeners();

	browser.runtime.onConnect.addListener(onConnect);
})();

function addListeners() {
	try {
		browser.windows.onFocusChanged.addListener(iconUpdate);
	} catch (e) {}
	
	browser.tabs.onActivated.addListener(iconUpdate);

	browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
		if (changeInfo.url) {
			onUrlUpdate(tabId, changeInfo.url);
		}
	});

	browser.tabs.onRemoved.addListener(tabId => {
		delete tabs[tabId];
	});

	browser.proxy.onRequest.addListener(requestInfo => {
		if (
			tabs[requestInfo.tabId]?.status
			|| ( settings.proxyList && isUrlInHostList(requestInfo.url) )
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

	browser.webRequest.onBeforeRequest.addListener(details => {
		onUrlUpdate(details.tabId, details.url);
	}, {urls: [`<all_urls>`], types: [`main_frame`]});

	browser.webRequest.onErrorOccurred.addListener(details => {
		addTabErrors(details.url, details.tabId);
	}, {urls: [`<all_urls>`]});

	browser.webRequest.onCompleted.addListener(details => {
		if (details.statusCode >= 400) {
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

function iconUpdate() {
	(async () => {
		let tab = await getTab();

		updateAddonStateForActiveTab(tab.status);
	})();

	return true;
}

function onUrlUpdate(tabId, url) {
	let host = getHostFromUrl(url);

	if (tabs[tabId]) {
		tabs[tabId].host = host;

		tabs[tabId].errors = new Set();
	} else {
		tabs[tabId] = new Tab({
			id: tabId,
			host: host
		});
	}

	if (popupPorts[tabId]) {
		popupPorts[tabId].postMessage({hostLive: host});

		popupPorts[tabId].postMessage({errorsLive: false});
	}
}

function updateAddonStateForActiveTab(tabStatus) {
	if (tabStatus) {
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

function isUrlInHostList(url) {
	let requestHost = getHostFromUrl(url, true);

	let isTrue = Object.keys(settings.list).some(host => {
		if (requestHost === host) {
			return true;
		}

		let subHost = `.${host}`;

		let index = requestHost.lastIndexOf(subHost);

		if (index !== -1 && index === requestHost.length - subHost.length) {
			return true;
		}
	});

	return isTrue;
}

function getHostFromUrl(str, isFull) {
	if (!str) {
		return;
	}

	try {
		let url = new URL(str);

		let host = url?.hostname.replace(/^[\./]+/, ``).replace(/[\./]+$/, ``);

		if (isFull) {
			return host;
		}

		return host.match(/[^\.]+\.[^\.]+$/)[0];
	} catch (e) {
		return;
	}
}

async function addTabErrors(url, tabId) {
	let host = getHostFromUrl(url);

	if (!host || tabId === -1) {
		return;
	}

	let tab = await getTab(tabId);

	if (tab.errors.has(host)) {
		return;
	}

	tab.errors.add(host)

	if (popupPorts[tabId]) {
		popupPorts[tabId].postMessage({errorsLive: host});
	}
}

async function onConnect(port) {
	let tab = await getTab();

	if (tab.id) {
		popupPorts[tab.id] = port;
	}

	let params = Object.assign({settings: settings}, tab);

	params.errors = [...params.errors];

	port.postMessage(params);

	port.onMessage.addListener(msg => {
		onPopupMessage(msg, tab);
	});

	port.onDisconnect.addListener(() => {
       delete popupPorts[tab.id];
    });
}

async function getTab(tabId) {
	let activeTab;

	if (!tabId || (tabId !== -1 && !tabs[tabId])) {
		activeTab = (await browser.tabs.query({currentWindow: true, active: true}))[0];

		if (activeTab?.id && activeTab.id != -1) {
			tabId = activeTab.id;
		}
	}

	if (!tabId || tabId === -1) {
		return new Tab();
	}

	if (!tabs[tabId]) {
		tabs[tabId] = new Tab({
			id: tabId,
			host: getHostFromUrl(activeTab?.url)
		});
	}

	return tabs[tabId];
}

async function onPopupMessage(msg, tab) {
	if (typeof msg.proxyTab !== `undefined`) {
		if (tab.id) {
			tab.status = msg.proxyTab;

			updateAddonStateForActiveTab(tab.status);
		}
	} else if (typeof msg.proxyGlobal !== `undefined`) {
		settings.status = msg.proxyGlobal;

		tab.status = settings.status;

		await browser.storage.local.set({status: settings.status});

		updateAddonStateForActiveTab(tab.status);
	} else if (typeof msg.proxyList !== `undefined`) {
		settings.proxyList = msg.proxyList;

		await browser.storage.local.set({proxyList: settings.proxyList});

		updateAddonStateForActiveTab(tab.status);
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
		let host = msg.host ? msg.host : tab.host;

		if (host) {
			if (msg.listAddRemove) {
				settings.list[host] = true;
			} else {
				delete settings.list[host];
			}

			await browser.storage.local.set({list: settings.list});
		}
	}
}
