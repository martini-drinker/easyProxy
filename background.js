`use strict`;

const icons = {
	off: `img/32-off.png`,
	list: `img/32-list.png`,
	regular: `img/32-regular.png`,
	incognito: `img/32-incognito.png`
};

let settings = {
	get proxyInfo() {
		let obj = {
			type: this.type,
			host: this.host,
			port: this.port,
			proxyDNS: this.dnsProxy
		};

		if (this.type === `socks` && this.auth) {
			obj.username = this.username;
			obj.password = this.password;
		}

		return obj;
	},
	get authInfo() {
		return {
			username: this.username,
			password: this.password
		};
	}
};

let tabs = {};

(async () => {
	await setSettings();

	await updateIcon(await getTab());

	addListeners();
})();

async function setSettings() {
	const defaultSettings = {
		listProxy: false,
		regularProxy: false,
		incognitoProxy: false,
		dnsProxy: false,
		type: `socks`,
		host: `127.0.0.1`,
		port: 1080,
		auth: false,
		username: ``,
		password: ``,
		list: []
	};

	let data = await browser.storage.local.get();

	let propsToSave = new Set();

	await updateDataIfNeeded(data, propsToSave);

	for (let key in defaultSettings) {
		if (typeof data[key] !== `undefined`) {
			settings[key] = data[key];
		} else {
			settings[key] = defaultSettings[key];

			propsToSave.add(key);
		}
	}

	settings.isAllowedIncognitoAccess = await browser.extension.isAllowedIncognitoAccess();

	if (settings.incognitoProxy && !settings.isAllowedIncognitoAccess) {
		settings.incognitoProxy = false;

		propsToSave.add(`incognitoProxy`);
	}

	if (settings.type !== `socks4` && settings.type !== `socks` && settings.dnsProxy) {
		settings.dnsProxy = false;

		propsToSave.add(`dnsProxy`);
	}

	if (settings.type === `socks4` && settings.auth) {
		settings.auth = false;

		propsToSave.add(`auth`);
	}

	settings.list = new Set(settings.list);

	await saveSettings(propsToSave);
}

async function updateDataIfNeeded(data, propsToSave) {
	if (!data.proxyInfo) {
		return;
	}

	if (typeof data.proxyList !== `undefined`) {
		data.listProxy = data.proxyList;

		propsToSave.add(`listProxy`);
	}

	if (typeof data.status !== `undefined`) {
		data.regularProxy = data.status;
		data.incognitoProxy = data.status;

		propsToSave.add(`regularProxy`, `incognitoProxy`);
	}

	if (typeof data.proxyDNS !== `undefined`) {
		data.dnsProxy = data.proxyDNS;

		propsToSave.add(`dnsProxy`);
	}

	if (typeof data.proxyInfo?.type !== `undefined`) {
		data.type = data.proxyInfo.type;

		propsToSave.add(`type`);
	}

	if (typeof data.proxyInfo?.host !== `undefined`) {
		data.host = data.proxyInfo.host;

		propsToSave.add(`host`);
	}

	if (typeof data.proxyInfo?.port !== `undefined`) {
		data.port = data.proxyInfo.port;

		propsToSave.add(`port`);
	}

	if (typeof data.authInfo?.username !== `undefined`) {
		data.username = data.authInfo.username;

		propsToSave.add(`username`);
	}

	if (typeof data.authInfo?.password !== `undefined`) {
		data.password = data.authInfo.password;

		propsToSave.add(`password`);
	}

	if (data.list && !Array.isArray(data.list)) {
		data.list = Object.keys(data.list);

		propsToSave.add(`list`);
	}

	await browser.storage.local.remove([`authInfo`, `proxyDNS`, `proxyInfo`, `proxyList`, `status`]);
}

async function updateIcon(tab) {
	if (tab === null) {
		return;
	}

	if (!tab.incognito && tab.proxy) {
		await setIcon(`regular`);
	} else if (tab.proxy) {
		await setIcon(`incognito`);
	} else if (settings.listProxy) {
		await setIcon(`list`);
	} else {
		await setIcon(`off`);
	}

	async function setIcon(mode) {
		await browser.browserAction.setIcon({
		    path: {
		        32: icons[mode]
		    }
		});
	}
}

async function getTab(id) {
	if (id === -1) {
		return null;
	}

	let tabParams;

	if (typeof id === `undefined`) {
		tabParams = (await browser.tabs.query({currentWindow: true, active: true}))[0];

		if (!tabParams) {
			tabParams = (await browser.tabs.query({active: true}))[0];
		}

		if (!tabParams || tabParams.id === -1) {
			return null;
		}

		if (tabs[tabParams.id]) {
			return tabs[tabParams.id];
		}
	} else if (!tabs[id]) {
		try {
			tabParams = await browser.tabs.get(id);
		} catch (e) {
			return null;
		}
	} else {
		return tabs[id];
	}

	tabs[tabParams.id] = {
		proxy: !tabParams.incognito && settings.regularProxy || tabParams.incognito && settings.incognitoProxy,
		incognito: tabParams.incognito,
		host: getHostObjFromUrl(tabParams.url)?.host || null,
		popupPort: null,
		tracker: {}
	};

	return tabs[tabParams.id];
}

function addListeners() {
	browser.runtime.onConnect.addListener(async popupPort => {
		let tab = await getTab();

		if (tab === null) {
			return;
		}

		tab.popupPort = popupPort;

		tab.popupPort.postMessage({
			mode: `params`,
			settings: settings,
			tab: {
				proxy: tab.proxy,
				incognito: tab.incognito,
				host: tab.host,
				tracker: tab.tracker
			}
		});

		tab.popupPort.onMessage.addListener(msg => {
			onMessage(msg, tab);
		});

		tab.popupPort.onDisconnect.addListener(() => {
			tab.popupPort = null;
		});
	});

	if (browser.windows?.onFocusChanged?.addListener) {
		browser.windows.onFocusChanged.addListener(async () => {
			await updateIcon(await getTab());
		});
	}

	browser.tabs.onActivated.addListener(async activeInfo => {
		await updateIcon(await getTab(activeInfo.tabId));
	});

	browser.tabs.onRemoved.addListener(tabId => {
		delete tabs[tabId];
	});

	browser.webRequest.onBeforeRequest.addListener(async details => {
		let tab = await getTab(details.tabId);

		if (tab === null) {
			return;
		}

		if (details.type === `main_frame`) {
			tab.host = getHostObjFromUrl(details.url)?.host || null;

			tab.tracker = {};
		}

		addToTracker({tab: tab, host: tab.host, status: `pending`, type: details.type});
	}, {urls: [`<all_urls>`]});

	browser.webRequest.onCompleted.addListener(details => {
		addToTracker({id: details.tabId, url: details.url, status: details.statusCode < 400 ? `ok` : `error`});
	}, {urls: [`<all_urls>`]});

	browser.webRequest.onBeforeRedirect.addListener(details => {
		addToTracker({id: details.tabId, url: details.url, status: `ok`});
	}, {urls: [`<all_urls>`]});

	browser.webRequest.onErrorOccurred.addListener(details => {
		addToTracker({id: details.tabId, url: details.url, status: `error`});
	}, {urls: [`<all_urls>`]});

	browser.webRequest.onAuthRequired.addListener(details => {
		if (
			details.isProxy
			&& settings.auth
			&& (settings.type === `http` || settings.type === `https`)
		) {
			return {authCredentials: settings.authInfo};
		}
	}, {urls: [`<all_urls>`]}, [`blocking`]);

	browser.proxy.onRequest.addListener(async requestInfo => {
		if (settings.listProxy && isUrlInHostList(requestInfo.url)) {
			return settings.proxyInfo;
		}

		let tab = await getTab(requestInfo.tabId);

		if (tab && tab.proxy || !tab && settings.regularProxy && !requestInfo.incognito || !tab && settings.incognitoProxy && requestInfo.incognito) {
			return settings.proxyInfo;
		}

		return {type: `direct`};
	}, {urls: [`<all_urls>`]});

	browser.proxy.onError.addListener(error => {
		console.error(`Proxy error: ${error.message}`);
	});
}

async function onMessage(msg, tab) {
	if (typeof msg.tabProxy !== `undefined`) {
		tab.proxy = msg.tabProxy;

		await updateIcon(tab);
	} else if (typeof msg.listProxy !== `undefined`) {
		settings.listProxy = msg.listProxy;

		await saveSettings(`listProxy`);

		await updateIcon(tab);
	} else if (typeof msg.regularProxy !== `undefined`) {
		settings.regularProxy = msg.regularProxy;

		await saveSettings(`regularProxy`);

		for (let id in tabs) {
			if (!tabs[id].incognito) {
				tabs[id].proxy = msg.regularProxy;
			}
		}

		await updateIcon(tab);
	} else if (typeof msg.incognitoProxy !== `undefined`) {
		settings.incognitoProxy = msg.incognitoProxy;

		await saveSettings(`incognitoProxy`);

		for (let id in tabs) {
			if (tabs[id].incognito) {
				tabs[id].proxy = msg.incognitoProxy;
			}
		}

		await updateIcon(tab);
	} else if (typeof msg.dnsProxy !== `undefined`) {
		settings.dnsProxy = msg.dnsProxy;

		await saveSettings(`dnsProxy`);
	} else if (typeof msg.type !== `undefined`) {
		settings.type = msg.type;

		let propsToSave = [`type`];

		if (settings.type === `socks4`) {
			if (settings.auth === true) {
				settings.auth = false;

				propsToSave.push(`auth`);
			}
		} else if (settings.type !== `socks4` && settings.type !== `socks`) {
			if (settings.dnsProxy === true) {
				settings.dnsProxy = false;

				propsToSave.push(`dnsProxy`);
			}
		}

		await saveSettings(propsToSave);
	} else if (typeof msg.host !== `undefined`) {
		settings.host = msg.host;

		await saveSettings(`host`);
	} else if (typeof msg.port !== `undefined`) {
		settings.port = msg.port;

		await saveSettings(`port`);
	} else if (typeof msg.auth !== `undefined`) {
		settings.auth = msg.auth;

		await saveSettings(`auth`);
	} else if (typeof msg.username !== `undefined`) {
		settings.username = msg.username;

		await saveSettings(`username`);
	} else if (typeof msg.password !== `undefined`) {
		settings.password = msg.password;

		await saveSettings(`password`);
	} else if (typeof msg.list !== `undefined`) {
		settings.list = msg.list;

		await saveSettings(`list`);
	}
}

async function saveSettings(keys) {
	let obj = {};

	if (typeof keys === `object`) {
		for (let key of keys) {
			addToObj(key);
		}
	} else {
		addToObj(keys);
	}

	if (Object.keys(obj).length) {
		await browser.storage.local.set(obj);
	}

	function addToObj(key) {
		obj[key] = key === `list` ? [...settings[key]] : settings[key];
	}
}

function getHostObjFromUrl(str, isFull) {
	try {
		let url = new URL(str);

		if (!url.hostname || url.hostname === ``) {
			return;
		}

		let hostname = url.hostname.toLowerCase().replace(/^\.+|\.+$/g, ``);

		if (isFull) {
			return {host: hostname};
		}

		let hostnameArr = hostname.split(`.`);

		if (hostnameArr.length === 4 && hostnameArr.every(e => e !== `` && Number.isInteger(+e) && e >= 0 && e < 256)) {
			return {host: hostname, isIp: true};
		}

		return {host: hostnameArr.slice(-2).join(`.`)};
	} catch (e) {
		return null;
	}
}

async function addToTracker(params) {
	if (!params.tab) {
		params.tab = await getTab(params.id);
	}

	if (params.tab === null) {
		return;
	}

	if (!params.host) {
		params.host = getHostObjFromUrl(params.url)?.host || null;
	}

	if (params.host === null) {
		return;
	}

	if (params.tab.tracker[params.host] !== `ok`) {
		params.tab.tracker[params.host] = params.status;

		if (params.tab.popupPort) {
			let msg = {host: params.host, status: params.status};

			if (params.type) {
				msg.type = params.type;
			}

			params.tab.popupPort.postMessage(msg);
		}
	}
}

function isUrlInHostList(url) {
	let requestAddress = getHostObjFromUrl(url, true);

	if (requestAddress === null) {
		return null;
	}

	for (let host of settings.list) {
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
	}

	return false;
}
