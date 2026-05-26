`use strict`;

const ids = getIds();
const container = getContainer();

let settings, tab;

let popupPort = browser.runtime.connect({name: `popup`});

popupPort.onMessage.addListener(msg => {
	if (msg.mode === `params`) {
		({settings, tab} = msg);

		showContent(`controls`);

		addListeners();
	} else if (msg.host) {
		if (msg.type === `main_frame`) {
			tab.host = msg.host;
			tab.tracker = {};

			buildContent(`tracker`);
		}

		tab.tracker[msg.host] = msg.status;

		if (container.tracker.menu.classList.contains(`active`)) {
			let input = [...ids[`tracker`].querySelectorAll(`input`)].find(input => input.value === msg.host);

			if (input) {
				input.className = msg.status;
			} else {
				ids[`tracker`].prepend(createTrackerRow(msg.host));
			}
		}
	}
});

function getIds() {
	let obj = {};

	for (let e of document.querySelectorAll(`[id]`)) {
		obj[e.id] = e;
	}

	return obj;
}

function getContainer() {
	let menu = document.querySelectorAll(`#menu > [id]`);
	let content = document.querySelectorAll(`#content > [id]`);

	let obj = {};

	for (let i = 0; i < menu.length; ++i) {
		obj[content[i].id] = {
			menu: menu[i],
			content: content[i]
		};
	}

	return obj;
}

function showContent(pick) {
	if (container[pick].menu.classList.contains(`active`)) {
		return;
	}

	buildContent(pick);

	for (let item in container) {
		container[item].menu.classList.toggle(`active`, item === pick);
		container[item].content.classList.toggle(`none`, item !== pick);
	}
}

function buildContent(pick) {
	ids[`top`].classList.toggle(`none`, tab.host === null);
	ids[`host`].textContent = tab.host || ``;
	ids[`top`].classList.toggle(`remove`, settings.list.has(tab.host));
	
	if (pick === `controls`) {
		ids[`controls-tab`].querySelector(`.switch > span`).classList.toggle(`purple`, tab.incognito);
		ids[`controls-tab`].querySelector(`input`).checked = tab.proxy;
		ids[`controls-host-list`].querySelector(`input`).checked = settings.listProxy;
		ids[`controls-regular-tabs`].querySelector(`input`).checked = settings.regularProxy;
		ids[`controls-incognito-tabs`].classList.toggle(`disabled`, !settings.isAllowedIncognitoAccess);
		ids[`controls-incognito-tabs`].querySelector(`input`).checked = settings.incognitoProxy;
		ids[`controls-dns`].classList.toggle(`disabled`, settings.type !== `socks4` && settings.type !== `socks`);
		ids[`controls-dns`].querySelector(`input`).checked = settings.dnsProxy;
	} else if (pick === `settings`) {
		ids[`settings-type`].querySelector(`select`).value = settings.type;
		ids[`settings-host`].querySelector(`input`).value = settings.host;
		ids[`settings-port`].querySelector(`input`).value = settings.port;
		ids[`settings-auth`].classList.toggle(`disabled`, settings.type === `socks4`);
		ids[`settings-auth`].querySelector(`input`).checked = settings.auth;

		let isAuthDisabled = !settings.auth || settings.type === `socks4`;

		ids[`settings-username`].classList.toggle(`disabled`, isAuthDisabled);
		ids[`settings-username`].querySelector(`input`).value = settings.username;
		ids[`settings-password`].classList.toggle(`disabled`, isAuthDisabled);
		ids[`settings-password`].querySelector(`input`).value = settings.password;
	} else if (pick === `list`) {
		if (ids[`list-mode-btn`].classList.contains(`text`)) {
			ids[`list-text-textarea`].value = [...settings.list].sort().join(`\n`);
		} else {
			ids[`list-row`].replaceChildren();

			for (let host of [...settings.list].sort()) {
				ids[`list-row`].append(createListRow(host));
			}
		}
	} else if (pick === `tracker`) {
		ids[`tracker`].replaceChildren();

		for (let host of Object.keys(tab.tracker).sort()) {
			ids[`tracker`].append(createTrackerRow(host));
		}
	}
}

function addListeners() {
	for (let item in container) {
		container[item].menu.addEventListener(`click`, () => {
			showContent(item);
		});
	}

	ids[`top`].addEventListener(`click`, () => {
		if (settings.list.has(tab.host)) {
			settings.list.delete(tab.host);

			ids[`top`].classList.remove(`remove`);
		} else {
			settings.list.add(tab.host);

			ids[`top`].classList.add(`remove`);
		}

		if (container.list.menu.classList.contains(`active`)) {
			buildContent(`list`);
		} else if (container.tracker.menu.classList.contains(`active`)) {
			buildContent(`tracker`);
		}
		
		popupPort.postMessage({list: settings.list});
	});

	ids[`controls-tab`].querySelector(`input`).addEventListener(`change`, e => {
		tab.proxy = e.target.checked;

		popupPort.postMessage({tabProxy: e.target.checked});
	});

	ids[`controls-host-list`].querySelector(`input`).addEventListener(`change`, e => {
		settings.listProxy = e.target.checked;

		popupPort.postMessage({listProxy: e.target.checked});
	});

	ids[`controls-regular-tabs`].querySelector(`input`).addEventListener(`change`, e => {
		settings.regularProxy = e.target.checked;

		if (!tab.incognito) {
			tab.proxy = e.target.checked;
		}

		buildContent(`controls`);

		popupPort.postMessage({regularProxy: e.target.checked});
	});

	ids[`controls-incognito-tabs`].querySelector(`input`).addEventListener(`change`, e => {
		settings.incognitoProxy = e.target.checked;

		if (tab.incognito) {
			tab.proxy = e.target.checked;
		}

		buildContent(`controls`);

		popupPort.postMessage({incognitoProxy: e.target.checked});
	});

	ids[`controls-dns`].querySelector(`input`).addEventListener(`change`, e => {
		settings.dnsProxy = e.target.checked;

		popupPort.postMessage({dnsProxy: e.target.checked});
	});

	ids[`settings-type`].querySelector(`select`).addEventListener(`change`, e => {
		settings.type = e.target.value;

		if (settings.type === `socks4`) {
			settings.auth = false;
		} else if (settings.type !== `socks4` && settings.type !== `socks`) {
			settings.dnsProxy = false;
		}

		buildContent(`settings`);

		popupPort.postMessage({type: e.target.value});
	});

	ids[`settings-host`].querySelector(`input`).addEventListener(`change`, e => {
		settings.host = e.target.value;

		popupPort.postMessage({host: e.target.value});
	});

	ids[`settings-port`].querySelector(`input`).addEventListener(`change`, e => {
		let port = +e.target.value;

		if (isNaN(port) || port < 0 || !Number.isInteger(port)) {
			port = 0;
		}

		e.target.value = port;

		settings.port = port;

		popupPort.postMessage({port});
	});

	ids[`settings-auth`].querySelector(`input`).addEventListener(`change`, e => {
		settings.auth = e.target.checked;

		buildContent(`settings`);

		popupPort.postMessage({auth: e.target.checked});
	});

	ids[`settings-username`].querySelector(`input`).addEventListener(`change`, e => {
		settings.username = e.target.value;

		popupPort.postMessage({username: e.target.value});
	});

	ids[`settings-password`].querySelector(`input`).addEventListener(`change`, e => {
		settings.password = e.target.value;

		popupPort.postMessage({password: e.target.value});
	});

	ids[`list-text-textarea`].addEventListener(`change`, () => {
		settings.list = new Set(ids[`list-text-textarea`].value.split(`\n`).map(host => hostNormalize(host)).filter(host => host !== ``));

		buildContent();

		popupPort.postMessage({list: settings.list});
	});

	ids[`list-mode-btn`].addEventListener(`click`, () => {
		let isRow = !ids[`list-mode-btn`].classList.contains(`text`);

		ids[`list-mode-btn`].classList.toggle(`text`, isRow);

		buildContent(`list`);

		ids[`list-row`].classList.toggle(`none`, isRow);
		ids[`list-text`].classList.toggle(`none`, !isRow);
		ids[`list-add-btn`].classList.toggle(`none`, isRow);
	});

	ids[`list-add-btn`].addEventListener(`click`, () => {
		let row = createListRow(``);

		ids[`list-row`].prepend(row);

		row.querySelector(`input`).focus();
	});
}

function hostNormalize(host) {
	return host.replace(/\s+|^[./]+|[./]+$/g, ``).toLowerCase();
}

function createListRow(host) {
	let node = ids[`list-row-template`].content.firstElementChild.cloneNode(true);

	let input = node.querySelector(`input`);

	input.value = host;

	input.addEventListener(`change`, () => {
		input.value = hostNormalize(input.value);

		settings.list = new Set([...ids[`list-row`].querySelectorAll(`input`)].map(e => e.value).filter(host => host !== ``));

		buildContent();

		popupPort.postMessage({list: settings.list});
	});

	node.querySelector(`.remove`).addEventListener(`click`, () => {
		settings.list.delete(input.value);

		node.remove();

		buildContent();

		popupPort.postMessage({list: settings.list});
	});

	return node;
}

function createTrackerRow(host) {
	let node = ids[`tracker-row-template`].content.firstElementChild.cloneNode(true);

	let input = node.querySelector(`input`);

	input.value = host;
	input.classList.add(tab.tracker[host]);

	let isHostInList = settings.list.has(host);
	let addElem = node.querySelector(`.add`);
	let removeElem = node.querySelector(`.remove`);

	addElem.classList.toggle(`hidden`, isHostInList);
	removeElem.classList.toggle(`hidden`, !isHostInList);

	addElem.addEventListener(`click`, () => {
		settings.list.add(host);

		addElem.classList.add(`hidden`);
		removeElem.classList.remove(`hidden`);

		buildContent();

		popupPort.postMessage({list: settings.list});
	});

	removeElem.addEventListener(`click`, () => {
		settings.list.delete(host);

		addElem.classList.remove(`hidden`);
		removeElem.classList.add(`hidden`);

		buildContent();

		popupPort.postMessage({list: settings.list});
	});

	return node;
}
