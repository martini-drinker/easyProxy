const addHostToListText = `Add this host to list`;
const removeHostFromListText = `Remove this host from list`;
const hostsTxtText = `Text`;
const hostsRowText = `Row`;

const deactiveClassName = `deactive`;
const noneClassName = `none`;
const hiddenClassName = `hidden`;
const activeClassName = `active`;
const addHostToListClassName = `bg-green`;
const removeHostFromListClassName = `bg-red`;

let content = {
	main: {
		button: document.querySelector(`#mainBtn`),
		container: document.querySelector(`#main`)
	},
	list: {
		button: document.querySelector(`#listBtn`),
		container: document.querySelector(`#list`)
	},
	errors: {
		button: document.querySelector(`#errorsBtn`),
		container: document.querySelector(`#errors`)
	},
	about: {
		button: document.querySelector(`#aboutBtn`),
		container: document.querySelector(`#about`)
	}
};

let proxyTabInput = document.querySelector(`#proxyTab input`);
let proxyGlobalInput = document.querySelector(`#proxyGlobal input`);
let proxyListInput = document.querySelector(`#proxyList input`);
let typeSelect = document.querySelector(`#type select`);
let hostInput = document.querySelector(`#host input`);
let portInput = document.querySelector(`#port input`);
let proxyDNSTr = document.querySelector(`#proxyDNS`);
let proxyDNSInput = proxyDNSTr.querySelector(`input`);
let authTr = document.querySelector(`#auth`);
let authInput = authTr.querySelector(`input`);
let usernameTr = document.querySelector(`#username`);
let usernameInput = usernameTr.querySelector(`input`);
let passwordTr = document.querySelector(`#password`);
let passwordInput = passwordTr.querySelector(`input`);
let listTable = document.querySelector(`#list table`);
let listTableTbody = document.querySelector(`#list table tbody`);
let listTextarea = document.querySelector(`#list textarea`);
let errorsTable = document.querySelector(`#errors table`);
let errorsTableTbody = document.querySelector(`#errors table tbody`);
let topButton = document.querySelector(`.top`);
let addListButton = document.querySelector(`#addList`);
let modeListButton = document.querySelector(`#modeList`);

let settings, list, tabId, hostTab, statusTab, errors;

let popupPort = browser.runtime.connect({name: `popup`});

popupPort.onMessage.addListener(msg => {
	if (msg.settings) {
		settings = msg.settings;
		list = Object.keys(settings.list);
		tabId = msg.tabId;
		hostTab = msg.hostTab;
		statusTab = msg.statusTab;
		errors = msg.errors;

		if (hostTab) {
			showTopButton(list.includes(hostTab));
		} else {
			topButton.classList.add(noneClassName);
		}

		addListeners();

		buildMainTable();

		showContent(`main`);
	} else if (typeof msg.errorsLive !== `undefined` && msg.tabId === tabId) {
		if (msg.errorsLive) {
			errors.push(msg.errorsLive);

			if (!content.errors.container.classList.contains(noneClassName)) {
				addErrorsTableTr(msg.errorsLive);
			}
		} else {
			errors = [];

			if (!content.errors.container.classList.contains(noneClassName)) {
				clearContent();
			}
		}
	}
});

function showTopButton(isInList) {
	if (isInList) {
		topButton.textContent = removeHostFromListText;
		topButton.classList.add(removeHostFromListClassName);
		topButton.classList.remove(addHostToListClassName);
	} else {
		topButton.textContent = addHostToListText;
		topButton.classList.remove(removeHostFromListClassName);
		topButton.classList.add(addHostToListClassName);
	}
}

function showContent(type) {
	if (content[type].button.classList.contains(activeClassName)) {
		return;
	}

	clearContent();

	switch (type) {
		case `list`:
			let mode = modeListButton.hasAttribute(`text`) ? `text` : `row`;

			showList(mode);

			if (mode === `row`) {
				buildListTable({sort: true});
			} else {
				buildListText({sort: true});
			}
			
			break;
		case `errors`:
			buildErrorsTable();

			break;
	}

	for (let item in content) {
		if (item === type) {
			content[item].container.classList.remove(noneClassName);
			content[item].button.classList.add(activeClassName);
		} else {
			content[item].container.classList.add(noneClassName);
			content[item].button.classList.remove(activeClassName);
		}
	}
}

function clearContent() {
	listTableTbody.textContent = ``;
	listTextarea.value = ``;
	errorsTableTbody.textContent = ``;
}

function buildMainTable() {
	let eventChange = new Event(`change`);

	if (statusTab) {
		proxyTabInput.checked = true;
	}

	if (settings.status) {
		proxyGlobalInput.checked = true;
	}

	if (settings.proxyList) {
		proxyListInput.checked = true;
	}

	typeSelect.value = settings.proxyInfo.type;

	typeSelect.dispatchEvent(eventChange);

	hostInput.value = settings.proxyInfo.host;
	portInput.value = settings.proxyInfo.port;

	if (!proxyDNSTr.classList.contains(deactiveClassName) && settings.proxyDNS) {
		proxyDNSInput.checked = settings.proxyDNS;
	}

	if (!authTr.classList.contains(deactiveClassName) && settings.auth) {
		authInput.checked = settings.auth;
	}

	authInput.dispatchEvent(eventChange);

	usernameInput.value = settings.authInfo.username;
	passwordInput.value = settings.authInfo.password;
}

function showList(mode) {
	if (mode === `text`) {
		listTextarea.classList.remove(noneClassName);
		listTable.classList.add(noneClassName);
		
		modeListButton.toggleAttribute(`text`, true);
		modeListButton.textContent = hostsRowText;

		addListButton.classList.add(noneClassName);
	} else {
		listTextarea.classList.add(noneClassName);
		listTable.classList.remove(noneClassName);
		
		modeListButton.toggleAttribute(`text`, false);
		modeListButton.textContent = hostsTxtText;

		addListButton.classList.remove(noneClassName);
	}
}

function buildListTable(params) {
	listTableTbody.textContent = ``;

	let arr = params?.list ? params?.list : list;

	if (params?.sort) {
		arr.sort();
	}

	for (let host of arr) {
		addListTableTr(host);
	}
}

function addListTableTr(host, params) {
	let tr = document.createElement(`tr`);
	tr.insertAdjacentHTML(`afterbegin`, `<td><input type="text" value="${host}"></td><td><div class="remove">&#10006;</div></td>`);

	let input = tr.querySelector(`input`);

	input.addEventListener(`change`, e => {
		input.value = hostNormalize(input.value);

		let listObj = {};

		list = [];

		for (let input of listTable.querySelectorAll(`input`)) {
			if (input.value === ``) {
				continue;
			}

			if (input.value === e.target.value && input !== e.target) {
				input.closest(`tr`).remove();

				continue;
			}

			list.push(input.value);

			listObj[input.value] = true;
		}

		if (hostTab) {
			showTopButton(list.includes(hostTab));
		}

		popupPort.postMessage({list: listObj});
	});

	tr.querySelector(`.remove`).addEventListener(`click`, e => {
		let tr = e.target.closest(`tr`);

		let host = tr.querySelector(`input`).value;

		tr.remove();

		listRemove(host);

		if (hostTab) {
			showTopButton(list.includes(hostTab));
		}

		popupPort.postMessage({listAddRemove: false, host: host});
	});

	if (params?.reverse) {
		listTableTbody.prepend(tr);
	} else {
		listTableTbody.append(tr);
	}

	if (params?.focus) {
		input.focus();
	}
}

function hostNormalize(host) {
	return host.replace(/\s+/g, ``).replace(/^[\./]+/, ``).replace(/[\./]+$/, ``).toLowerCase();
}

function listRemove(host) {
	let position = list.indexOf(host);

	if (position !== -1) {
		list.splice(list.indexOf(host), 1);
	}
}

function buildListText(params) {
	let arr = params?.list ? params?.list : list;

	if (params?.sort) {
		arr.sort();
	}

	listTextarea.value = arr.join(`\n`);
}

function buildErrorsTable() {
	errorsTableTbody.textContent = ``;

	errors.sort();

	for (let host of errors) {
		addErrorsTableTr(host);
	}
}

function addErrorsTableTr(host) {
	let tr = document.createElement(`tr`);
	tr.insertAdjacentHTML(`afterbegin`, `<td><div class="add">&#10010;</div></td><td><input type="text" disabled value="${host}"></td><td><div class="remove">&#10006;</div></td>`);

	let addButton = tr.querySelector(`.add`);
	let removeButton = tr.querySelector(`.remove`);

	if (list.includes(host)) {
		addButton.classList.add(hiddenClassName);
	} else {
		removeButton.classList.add(hiddenClassName);
	}

	removeButton.addEventListener(`click`, e => {
		let tr = e.target.closest(`tr`);

		let host = tr.querySelector(`input`).value;

		listRemove(host);

		tr.querySelector(`.add`).classList.remove(hiddenClassName);
		tr.querySelector(`.remove`).classList.add(hiddenClassName);

		if (hostTab) {
			showTopButton(list.includes(hostTab));
		}

		popupPort.postMessage({listAddRemove: false, host: host});
	});

	addButton.addEventListener(`click`, e => {
		let tr = e.target.closest(`tr`);

		let host = tr.querySelector(`input`).value;

		listAdd(host);

		tr.querySelector(`.add`).classList.add(hiddenClassName);
		tr.querySelector(`.remove`).classList.remove(hiddenClassName);

		if (hostTab) {
			showTopButton(list.includes(hostTab));
		}

		popupPort.postMessage({listAddRemove: true, host: host});
	});

	errorsTableTbody.append(tr);
}

function listAdd(host, params) {
	if (params?.reverse) {
		list.unshift(host); 
	} else {
		list.push(host);
	}
}

function addListText(host) {
	let arr = listTextarea.value.split(`\n`);

	arr.unshift(host);

	listTextarea.value = arr.join(`\n`);
}

function removeListText(host) {
	listTextarea.value = listTextarea.value.split(`\n`).filter(value => value !== host).join(`\n`);
}

function changeErrorsTr(host, mode) {
	for (let input of errorsTableTbody.querySelectorAll(`input`)) {
		if (input.value === host) {
			let tr = input.closest(`tr`);

			if (mode) {
				tr.querySelector(`.add`).classList.remove(hiddenClassName);
				tr.querySelector(`.remove`).classList.add(hiddenClassName);
			} else {
				tr.querySelector(`.add`).classList.add(hiddenClassName);
				tr.querySelector(`.remove`).classList.remove(hiddenClassName);
			}
		}
	}
}

function removeListTableTr(host) {
	for (let input of listTable.querySelectorAll(`input`)) {
		if (input.value === host) {
			input.closest(`tr`).remove();

			break;
		}
	}
}

function getListFromTextArea() {
	let set = new Set( listTextarea.value.split(`\n`).map(host => hostNormalize(host)).filter(host => host !== ``) );

	return [...set];
}

function getProxyInfo() {
	let proxyInfo = {
		type: typeSelect.value,
		host: hostInput.value,
		port: portInput.value,
		proxyDNS: proxyDNSInput.checked,
		auth: authInput.checked,
		username: usernameInput.value,
		password: passwordInput.value
	};

	return proxyInfo;
}

function addListeners() {
	content.main.button.addEventListener(`click`, () => {
		showContent(`main`);
	});

	content.list.button.addEventListener(`click`, () => {
		showContent(`list`);
	});

	content.errors.button.addEventListener(`click`, () => {
		showContent(`errors`);
	});

	content.about.button.addEventListener(`click`, () => {
		showContent(`about`);
	});

	topButton.addEventListener(`click`, e => {
		let mode = e.target.classList.contains(addHostToListClassName);

		showTopButton(mode);

		if (mode) {
			listAdd(hostTab);

			if (!content.list.container.classList.contains(noneClassName)) {
				if (listTextarea.classList.contains(noneClassName)) {
					addListTableTr(hostTab, {reverse: true});
				} else {
					addListText(hostTab);
				}
			} else if (!content.errors.container.classList.contains(noneClassName)) {
				changeErrorsTr(hostTab, false);
			}
		} else {
			listRemove(hostTab);

			if (!content.list.container.classList.contains(noneClassName)) {
				if (listTextarea.classList.contains(noneClassName)) {
					removeListTableTr(hostTab);
				} else {
					removeListText(hostTab);
				}
			} else if (!content.errors.container.classList.contains(noneClassName)) {
				changeErrorsTr(hostTab, true);
			}
		}

		popupPort.postMessage({listAddRemove: mode});
	});

	addListButton.addEventListener(`click`, () => {
		addListTableTr(``, {reverse: true, focus: true});
	});

	modeListButton.addEventListener(`click`, e => {
		let mode = modeListButton.hasAttribute(`text`) ? `row` : `text`;

		showList(mode);

		if (mode === `row`) {
			buildListTable({list: listTextarea.value.split(`\n`)});
		} else {
			buildListText({list: [...listTableTbody.querySelectorAll(`input`)].map(input => input.value)});
		}
	});

	listTextarea.addEventListener(`change`, e => {
		list = getListFromTextArea();

		listTextarea.value = list.join(`\n`);

		if (hostTab) {
			showTopButton(list.includes(hostTab))
		}

		let listObj = {};

		for (let host of list) {
			listObj[host] = true;
		}

		popupPort.postMessage({list: listObj});
	})

	typeSelect.addEventListener(`change`, e => {
		if (e.currentTarget.value.indexOf(`socks`) === 0) {
			proxyDNSTr.classList.remove(deactiveClassName);
		} else {
			proxyDNSInput.checked = false;

			proxyDNSTr.classList.add(deactiveClassName);
		}

		if (e.currentTarget.value !== `socks4`) {
			authTr.classList.remove(deactiveClassName);
		} else {
			authInput.checked = false;

			authTr.classList.add(deactiveClassName);
			usernameTr.classList.add(deactiveClassName);
			passwordTr.classList.add(deactiveClassName);
		}

		if (e.isTrusted) {
			popupPort.postMessage(getProxyInfo());
		}
	});

	authInput.addEventListener(`change`, e => {
		if (e.target.checked) {
			usernameTr.classList.remove(deactiveClassName);

			passwordTr.classList.remove(deactiveClassName);
		} else {
			usernameTr.classList.add(deactiveClassName);

			passwordTr.classList.add(deactiveClassName);
		}

		if (e.isTrusted) {
			popupPort.postMessage(getProxyInfo());
		}
	});

	proxyTabInput.addEventListener(`change`, e => {
		popupPort.postMessage({proxyTab: e.target.checked});
	});

	proxyGlobalInput.addEventListener(`change`, e => {
		proxyTabInput.checked = e.target.checked;

		popupPort.postMessage({proxyGlobal: e.target.checked});
	});

	proxyListInput.addEventListener(`change`, e => {
		popupPort.postMessage({proxyList: e.target.checked});
	});

	hostInput.addEventListener(`change`, () => {
		popupPort.postMessage(getProxyInfo());
	});

	portInput.addEventListener(`change`, () => {
		popupPort.postMessage(getProxyInfo());
	});

	proxyDNSInput.addEventListener(`change`, () => {
		popupPort.postMessage(getProxyInfo());
	});

	usernameInput.addEventListener(`change`, () => {
		popupPort.postMessage(getProxyInfo());
	});

	passwordInput.addEventListener(`change`, () => {
		popupPort.postMessage(getProxyInfo());
	});
}
