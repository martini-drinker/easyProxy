const ICONS = {
	off: `img/off-32.png`,
	on: `img/on-32.png`,
	list: `img/list-32.png`
};

class Tab {
	constructor(obj) {
		this.id = obj?.id;
		this.host = obj?.host;
		this.status = (typeof obj?.status !== `undefined`) ? obj.status : settings.status;
		this.monitor = obj?.monitor || {}; 
	}
}

let settings,
	proxyInfo,
	tabs = {},
	popupPorts = {};

(async () => {
	let storageData = await browser.storage.local.get();

	settings = {
		proxyInfo: {
			type: typeof storageData?.proxyInfo?.type !== `undefined` ? storageData.proxyInfo.type : `socks`,
			host: typeof storageData?.proxyInfo?.host !== `undefined` ? storageData.proxyInfo.host : `127.0.0.1`,
			port: typeof storageData?.proxyInfo?.port !== `undefined` ? storageData.proxyInfo.port : 9050
		},
		proxyDNS: typeof storageData?.proxyDNS !== `undefined` ? storageData.proxyDNS : false,
		auth: typeof storageData?.auth !== `undefined` ? storageData.auth : false,
		authInfo: {
			username: typeof storageData?.authInfo?.username !== `undefined` ? storageData.authInfo.username : ``,
			password: typeof storageData?.authInfo?.password !== `undefined` ? storageData.authInfo.password : ``
		},
		status: typeof storageData?.status !== `undefined` ? storageData.status : false,
		proxyList: typeof storageData?.proxyList !== `undefined` ? storageData.proxyList : false,
		list: typeof storageData?.list !== `undefined` ? storageData.list : {}
	}

	await browser.storage.local.set(settings);

	proxyInfo = getProxyInfo();

	addListeners();

	browser.runtime.onConnect.addListener(onConnect);
})();

function getProxyInfo() {
	let proxyInfo = Object.assign({}, settings.proxyInfo);

	if (settings.auth && settings.proxyInfo.type === `socks`) {
		Object.assign(proxyInfo, settings.authInfo);
	}

	if (settings.proxyDNS) {
		proxyInfo.proxyDNS = settings.proxyDNS;
	}

	return proxyInfo;
}

function addListeners() {
	try {
		browser.windows.onFocusChanged.addListener(() => {
			iconUpdate();
		});
	} catch (e) {}
	
	browser.tabs.onActivated.addListener(activeInfo => {
		iconUpdate(activeInfo.tabId);
	});

	browser.tabs.onRemoved.addListener(tabId => {
		delete tabs[tabId];
	});

	browser.proxy.onRequest.addListener(requestInfo => {
		if (
			(tabs[requestInfo.tabId] ? tabs[requestInfo.tabId].status : settings.status)
			|| settings.proxyList && isUrlInHostList(requestInfo.url)
			) {
			return proxyInfo;
		}

		return {type: `direct`};
	}, {urls: [`<all_urls>`]});

	browser.proxy.onError.addListener(error => {
		console.error(`Proxy error: ${error.message}`);
	});

	browser.webRequest.onBeforeRequest.addListener(details => {
		onBeforeRequest(details);
	}, {urls: [`<all_urls>`]});

	browser.webRequest.onErrorOccurred.addListener(details => {
		addTabMonitor(details.tabId, details.url, false);
	}, {urls: [`<all_urls>`]});

	browser.webRequest.onBeforeRedirect.addListener(details => {
		addTabMonitor(details.tabId, details.url, -1);
	}, {urls: [`<all_urls>`]});

	browser.webRequest.onCompleted.addListener(details => {
		let value = details.statusCode < 400 ? -1 : false;

		addTabMonitor(details.tabId, details.url, value);
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

async function getActiveTab() {
	return (await browser.tabs.query({currentWindow: true, active: true}))[0];
}

function iconUpdate(tabId) {
	(async () => {
		if (typeof tabId === `undefined`) {
			let activeTab = await getActiveTab();

			tabId = activeTab?.id;
		}

		let tab = getTab(tabId);

		updateAddonStateForActiveTab(tab ? tab.status : settings.status);
	})();

	return true;
}

function onBeforeRequest(details) {
	let tab = getTab(details.tabId);

	let host = getHostFromUrl(details.url)?.host;

	if (!tab || !host) {
		return;
	}

	if (details.type === `main_frame`) {
		tab.host = host;
		tab.monitor = {};
		tab.monitor[host] = 1;

		if (popupPorts[tab.id]) {
			popupPorts[tab.id].postMessage({hostLive: host});

			popupPorts[tab.id].postMessage({monitorLive: [host, 1], isUpdate: true});
		}
	} else if (tab.monitor[host] === false) {
		return;
	} else {
		setTabMonitor(tab, host, 1);
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

function setIcon(mode) {
	browser.browserAction.setIcon({
	    path: {
	        32: ICONS[mode]
	    }
	});
}

function isUrlInHostList(url) {
	let requestAddress = getHostFromUrl(url, true);

	if (!requestAddress) {
		return;
	}

	let isTrue = Object.keys(settings.list).some(host => {
		if (requestAddress.host === host) {
			return true;
		}

		if (!requestAddress.isIp) {
			let subHost = `.${host}`;

			let index = requestAddress.host.lastIndexOf(subHost);

			if (index !== -1 && index === requestAddress.host.length - subHost.length) {
				return true;
			}
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

		if (!url.hostname || url.hostname === ``) {
			return;
		}

		let hostname = url.hostname.replace(/^[\.]+/, ``).replace(/[\.]+$/, ``);

		if (isFull) {
			return {host: hostname};
		}

		let hostnameArr = hostname.split(`.`);

		if (hostnameArr.length === 4 && hostnameArr.every(e => e !== `` && Number.isInteger(+e) && e >= 0 && e < 256)) {
			return {host: hostname, isIp: true};
		}

		return {host: hostnameArr.slice(-2).join(`.`)};
	} catch (e) {
		return;
	}
}

function addTabMonitor(tabId, url, value) {
	let tab = getTab(tabId);

	let host = getHostFromUrl(url)?.host;

	if (!tab || !host || tab.monitor[host] === false) {
		return;
	}

	setTabMonitor(tab, host, value);
}

function setTabMonitor(tab, host, value) {
	if (value === false) {
		tab.monitor[host] = false;
	} else {
		if (typeof tab.monitor[host] === `undefined`) {
			tab.monitor[host] = 0;
		}

		tab.monitor[host] += value;
	}

	if (popupPorts[tab.id]) {
		popupPorts[tab.id].postMessage({monitorLive: [host, tab.monitor[host]]});
	}
}

async function onConnect(port) {
	let activeTab = await getActiveTab();

	let tab = getTab(activeTab?.id);

	if (typeof tab.host === `undefined`) {
		tab.host = getHostFromUrl(activeTab?.url)?.host;
	}

	if (!tab) {
		tab = new Tab();
	}

	if (tab.id) {
		popupPorts[tab.id] = port;
	}

	let params = Object.assign({settings: settings}, tab);

	port.postMessage(params);

	port.onMessage.addListener(msg => {
		onPopupMessage(msg, tab);
	});

	port.onDisconnect.addListener(() => {
       delete popupPorts[tab.id];
    });
}

function getTab(tabId) {
	if (typeof tabId === `undefined` || tabId === -1) {
		return;
	}

	if (!tabs[tabId]) {
		tabs[tabId] = new Tab({
			id: tabId
		});
	}

	return tabs[tabId];
}

function onPopupMessage(msg, tab) {
	if (typeof msg.proxyTab !== `undefined`) {
		if (tab.id) {
			tab.status = msg.proxyTab;

			updateAddonStateForActiveTab(tab.status);
		}
	} else if (typeof msg.proxyGlobal !== `undefined`) {
		settings.status = msg.proxyGlobal;

		tab.status = settings.status;

		for (let tab in tabs) {
			tabs[tab].status = settings.status;
		}

		browser.storage.local.set({status: settings.status});

		updateAddonStateForActiveTab(tab.status);
	} else if (typeof msg.proxyList !== `undefined`) {
		settings.proxyList = msg.proxyList;

		browser.storage.local.set({proxyList: settings.proxyList});

		updateAddonStateForActiveTab(tab.status);
	} else if (typeof msg.type !== `undefined`) {
		settings.proxyInfo.type = msg.type;
		settings.proxyInfo.host = msg.host;
		settings.proxyInfo.port = +msg.port;
		settings.proxyDNS = msg.proxyDNS;
		settings.auth = msg.auth;
		settings.authInfo.username = msg.username;
		settings.authInfo.password = msg.password;

		proxyInfo = getProxyInfo();

		browser.storage.local.set(settings);
	} else if (typeof msg.list !== `undefined`) {
		settings.list = msg.list;

		browser.storage.local.set({list: settings.list});
	} else if (typeof msg.listAddRemove !== `undefined`) {
		let host = msg.host ? msg.host : tab.host;

		if (host) {
			if (msg.listAddRemove) {
				settings.list[host] = true;
			} else {
				delete settings.list[host];
			}

			browser.storage.local.set({list: settings.list});
		}
	}
}
