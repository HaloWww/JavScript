// ==UserScript==
// @name            JavScript
// @namespace       https://greasyfork.org/users/175514
// @version         3.0.0
// @author          blc
// @description     一站式体验, JavBus & JavDB 兼容
// @icon            https://z3.ax1x.com/2021/10/15/53gMFS.png
// @include         *
// @require         https://unpkg.com/masonry-layout@4/dist/masonry.pkgd.min.js
// @require         https://unpkg.com/infinite-scroll@4/dist/infinite-scroll.pkgd.min.js
// @resource        fail https://z3.ax1x.com/2021/10/15/53gcex.png
// @resource        info https://z3.ax1x.com/2021/10/15/53g2TK.png
// @resource        success https://z3.ax1x.com/2021/10/15/53gqTf.png
// @resource        play https://s4.ax1x.com/2022/01/12/7nYuKe.png
// @resource        loading https://s1.ax1x.com/2022/03/21/qnIOqe.gif
// @connect         *
// @run-at          document-start
// @grant           GM_registerMenuCommand
// @grant           GM_getResourceURL
// @grant           GM_xmlhttpRequest
// @grant           GM_setClipboard
// @grant           GM_notification
// @grant           GM_addElement
// @grant           GM_deleteValue
// @grant           GM_listValues
// @grant           GM_openInTab
// @grant           GM_addStyle
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_info
// @license         GPL-3.0
// @compatible      firefox 未测试
// @compatible      chrome
// @compatible      edge
// ==/UserScript==

(function () {
	// match domain
	const MatchDomains = [
		{ domain: "JavBus", regex: /(jav|bus|dmm|see|cdn|fan){2}\./g },
		{ domain: "JavDB", regex: /javdb\d*\.com/g },
		{ domain: "Disk115", regex: /captchaapi\.115\.com/g },
	];
	const Matched = MatchDomains.find(({ regex }) => regex.test(location.host));
	if (!Matched?.domain) return;

	// document
	const DOC = document;
	DOC.create = (tag, attr = {}, child) => {
		const element = DOC.createElement(tag);
		Object.keys(attr).forEach(name => element.setAttribute(name, attr[name]));
		typeof child === "string" && element.appendChild(DOC.createTextNode(child));
		typeof child === "object" && element.appendChild(child);
		return element;
	};

	// request
	const request = (url, data = {}, method = "GET", params = {}) => {
		if (!url) return;
		method = method ? method.toUpperCase().trim() : "GET";
		if (!["GET", "POST"].includes(method)) return;

		if (Object.prototype.toString.call(data) === "[object Object]") {
			data = Object.keys(data).reduce((pre, cur) => {
				return `${pre ? `${pre}&` : pre}${cur}=${encodeURIComponent(data[cur])}`;
			}, "");
		}

		if (method === "GET") {
			if (data) {
				if (url.includes("?")) {
					url = `${url}${url.charAt(url.length - 1) === "&" ? "" : "&"}${data}`;
				} else {
					url = `${url}?${data}`;
				}
			}
			params.responseType = params.responseType ?? "document";
		}
		if (method === "POST") {
			params.responseType = params.responseType ?? "json";
			const headers = params.headers ?? {};
			params.headers = { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", ...headers };
		}

		return new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				url,
				data,
				method,
				timeout: 20000,
				onabort: () => {
					console.warn(`请求被中止`);
				},
				onerror: () => {
					console.error(`请求错误，检查接口`);
				},
				ontimeout: () => {
					console.warn(`请求超时，检查网络`);
				},
				onload: ({ status, response }) => {
					if (status === 404 || response?.errcode === 911) response = false;
					if (response && ["", "text"].includes(params.responseType ?? "")) {
						const htmlRegex = /<\/?[a-z][\s\S]*>/i;
						const jsonRegex = /^{.*}$/;
						if (htmlRegex.test(response)) {
							response = new DOMParser().parseFromString(response, "text/html");
						} else if (jsonRegex.test(response)) {
							response = JSON.parse(response);
						}
					}
					resolve(response);
				},
				...params,
			});
		});
	};

	// utils
	const getDate = timestamp => {
		const date = timestamp ? new Date(timestamp) : new Date();
		const Y = date.getFullYear();
		const M = `${date.getMonth() + 1}`.padStart(2, "0");
		const D = `${date.getDate()}`.padStart(2, "0");
		return `${Y}-${M}-${D}`;
	};
	const addCopyTarget = (selectors, attr = {}) => {
		const node = DOC.querySelector(selectors);
		const _attr = { "data-copy": node.textContent.trim(), class: "x-ml", href: "javascript:void(0);" };
		const target = DOC.create("a", { ..._attr, ...attr }, "复制");
		target.addEventListener("click", handleCopyTxt);
		node.appendChild(target);
	};
	const handleCopyTxt = e => {
		if (!e?.target?.dataset?.copy) return;
		e.preventDefault();
		e.stopPropagation();
		const { target } = e;
		GM_setClipboard(target.dataset.copy);
		const original = target.textContent ?? "";
		target.textContent = "成功";
		const timer = setTimeout(() => {
			target.textContent = original;
			clearTimeout(timer);
		}, 400);
	};
	const transToByte = sizeStr => {
		const sizer = [
			{ unit: /byte/gi, transform: size => size },
			{ unit: /kb/gi, transform: size => size * Math.pow(1000, 1) },
			{ unit: /mb/gi, transform: size => size * Math.pow(1000, 2) },
			{ unit: /gb/gi, transform: size => size * Math.pow(1000, 3) },
			{ unit: /kib/gi, transform: size => size * Math.pow(1024, 1) },
			{ unit: /mib/gi, transform: size => size * Math.pow(1024, 2) },
			{ unit: /gib/gi, transform: size => size * Math.pow(1024, 3) },
		];
		const size = sizeStr.replace(/[a-zA-Z\s]/g, "");
		if (size <= 0) return 0;
		return (
			sizer
				.find(({ unit }) => unit.test(sizeStr))
				?.transform(size)
				?.toFixed(2) ?? 0
		);
	};

	class Store {
		static init() {
			const date = getDate();
			const cdKey = "CD";
			if (GM_getValue(cdKey, "") === date) return;
			GM_setValue(cdKey, date);
			GM_setValue("DETAILS", {});
			GM_setValue("RESOURCE", []);
		}
		static getDetail(key) {
			const details = GM_getValue("DETAILS", {});
			return details[key] ?? {};
		}
		static upDetail(key, val) {
			const details = GM_getValue("DETAILS", {});
			details[key] = { ...this.getDetail(key), ...val };
			GM_setValue("DETAILS", details);
		}
	}
	class Apis {
		static async getDefaultFile() {
			const res = await request(
				"https://webapi.115.com/files",
				{
					aid: 1,
					cid: 0,
					o: "user_ptime",
					asc: 0,
					offset: 0,
					show_dir: 1,
					limit: 115,
					code: "",
					scid: "",
					snap: "",
					natsort: 1,
					record_open_time: 1,
					source: "",
					format: "json",
				},
				"GET",
				{ responseType: "json" }
			);
			return !res?.data?.length ? "" : res.data.find(({ n, ns }) => [n, ns].includes("云下载"))?.cid;
		}
		static async movieTitle(sentence) {
			const st = encodeURIComponent(sentence.trim());
			const data = {
				async: `translate,sl:auto,tl:zh-CN,st:${st},id:1642125176704,qc:true,ac:false,_id:tw-async-translate,_pms:s,_fmt:pc`,
			};
			const res = await request(
				"https://www.google.com/async/translate?vet=12ahUKEwi03Jv2kLD1AhWRI0QIHe_TDKAQqDh6BAgCECY..i&ei=ZtfgYbSRO5HHkPIP76ezgAo&yv=3",
				data,
				"POST",
				{ responseType: "" }
			);
			return res?.querySelector("#tw-answ-target-text").textContent ?? "";
		}
		static async movieVideo(code, studio) {
			code = code.toLowerCase();

			if (studio) {
				const matchStudios = [
					{
						name: "東京熱",
						match: "https://my.cdn.tokyo-hot.com/media/samples/%s.mp4",
					},
					{
						name: "カリビアンコム",
						match: "https://smovie.caribbeancom.com/sample/movies/%s/1080p.mp4",
					},
					{
						name: "一本道",
						match: "http://smovie.1pondo.tv/sample/movies/%s/1080p.mp4",
					},
					{
						name: "HEYZO",
						trans: code => code.replace(/HEYZO\-/gi, ""),
						match: "https://www.heyzo.com/contents/3000/%s/heyzo_hd_%s_sample.mp4",
					},
				];
				const matched = matchStudios.find(({ name }) => name === studio);
				if (matched) return matched.match.replace(/%s/g, matched.trans ? matched.trans(code) : code);
			}

			let [r18, xrmoo] = await Promise.all([
				request(`https://www.r18.com/common/search/order=match/searchword=${code}`),
				request(`http://dmm.xrmoo.com/sindex.php?searchstr=${code}`),
			]);

			r18 = r18?.querySelector("a.js-view-sample");
			return (
				r18?.getAttribute("data-video-high") ||
				r18?.getAttribute("data-video-med") ||
				r18?.getAttribute("data-video-low") ||
				xrmoo
					?.querySelector(".card .card-footer a.viewVideo")
					?.getAttribute("data-link")
					.replace("_sm_w", "_dmb_w") ||
				""
			);
		}
		static async movieImg(code, date) {
			code = code.toUpperCase();

			const blogJavUrl = `https://blogjav.net/?s=${code}`;
			const [blogJav, javStore] = await Promise.all([
				request(blogJavUrl, {}, "GET", { headers: { referer: blogJavUrl } }),
				request(`https://javstore.net/search/${code}.html`),
			]);

			date = date.split("-");
			let bkRes = `https://img.japanese-bukkake.net/${date[0]}/${date[1]}/${code}_s.jpg`;
			const [bjRes, jsRes, bukkake] = await Promise.all([
				request(blogJav?.querySelector("#main article .entry-title a")?.href),
				request(javStore?.querySelector("#content_news li a")?.href),
				request(bkRes, {}, "GET", { responseType: "" }),
			]);
			if (!bukkake) bkRes = "";

			return (
				bjRes
					?.querySelector("#page .entry-content a img")
					?.getAttribute("data-lazy-src")
					.replace("//t", "//img")
					.replace("thumbs", "images") ||
				jsRes?.querySelector(".news a img[alt*='.th']").src.replace(".th", "") ||
				bkRes ||
				""
			);
		}
		static async movieStar(code) {
			code = code.toUpperCase();
			const site = "https://javdb.com";
			let res = await request(`${site}/search?q=${code}`);
			const href = res?.querySelector("#videos .grid-item a").getAttribute("href");
			if (!href) return;
			res = await request(`${site}${href}`);
			res = res?.querySelectorAll(".panel-block");
			if (!res?.length) return;
			res = res[res.length - 3]?.querySelector(".value").textContent.trim();
			return res
				.split(/\n/)
				.filter(item => item.indexOf("♀") !== -1)
				.map(item => item.replace("♀", "").trim());
		}
	}
	class Common {
		docStart = () => {};
		contentLoaded = () => {};
		load = () => {};

		menus = {
			tabs: [
				{ title: "全站", key: "global", prefix: "G" },
				{ title: "列表页", key: "list", prefix: "L" },
				{ title: "详情页", key: "movie", prefix: "M" },
				{ title: "115 相关", key: "drive", prefix: "D" },
			],
			commands: [
				"G_DARK",
				"G_SEARCH",
				"G_CLICK",
				"L_SCROLL",
				"L_MIT",
				"L_MTL",
				"M_TITLE",
				"M_VIDEO",
				"M_IMG",
				"M_STAR",
				"M_PLAYER",
				"M_SORT",
				"M_MAGNET",
				"D_MATCH",
				"D_OFFLINE",
				"D_VERIFY",
				"D_UPIMG",
				"D_RENAME",
				"D_MOVE",
			],
			details: [
				{
					name: "快捷搜索",
					key: "G_SEARCH",
					type: "switch",
					info: "<kbd>/</kbd> 获取焦点，<kbd>ctrl</kbd> + <kbd>/</kbd> 快速搜索粘贴板第一项",
					defaultVal: true,
					hotkey: "k",
				},
				{
					name: "点击事件",
					key: "G_CLICK",
					type: "switch",
					info: "影片/演员卡片以新窗口打开，左击前台，右击后台",
					defaultVal: true,
					hotkey: "c",
				},
				{
					name: "暗黑模式",
					key: "G_DARK",
					type: "switch",
					info: "常用页面暗黑模式",
					defaultVal: true,
					hotkey: "d",
				},
				{
					name: "滚动加载",
					key: "L_SCROLL",
					type: "switch",
					info: "滚动加载下一页",
					defaultVal: true,
				},
				{
					name: "预览图替换",
					key: "L_MIT",
					type: "switch",
					info: "替换为封面大图",
					defaultVal: true,
				},
				{
					name: "标题最大行",
					key: "L_MTL",
					type: "number",
					info: "影片标题最大显示行数，超出省略。0 不限制 (1)",
					placeholder: "仅支持整数 ≥ 0",
					defaultVal: 1,
				},
				{
					name: "标题机翻",
					key: "M_TITLE",
					type: "switch",
					info: "鼠标悬停标题处查看，翻自 Google",
					defaultVal: true,
				},
				{
					name: "演员匹配",
					key: "M_STAR",
					type: "switch",
					info: "如无，获取自 JavDB",
					defaultVal: true,
				},
				{
					name: "视频截图",
					key: "M_IMG",
					type: "switch",
					info: "获取自 JavStore, jpBukkake",
					defaultVal: true,
				},
				{
					name: "预览视频",
					key: "M_VIDEO",
					type: "switch",
					info: "获取自 R18, xrmoo",
					defaultVal: true,
				},
				{
					name: "在线播放",
					key: "M_PLAYER",
					type: "switch",
					info: "获取自 Netflav, BestJavPorn, JavHHH, Avgle",
					defaultVal: true,
				},
				{
					name: "磁力排序",
					key: "M_SORT",
					type: "switch",
					info: "综合排序，字幕 ＞ 大小 ＞ 日期",
					defaultVal: true,
				},
				{
					name: "磁力搜索",
					key: "M_MAGNET",
					type: "switch",
					info: "获取自 Sukebei, BTGG, BTSOW",
					defaultVal: true,
				},
				{
					name: "资源匹配",
					key: "D_MATCH",
					type: "switch",
					info: "查询网盘是否已有资源",
					defaultVal: true,
				},
				{
					name: "一键离线",
					key: "D_OFFLINE",
					type: "switch",
					info: "开启/关闭功能按钮",
					defaultVal: true,
				},
				{
					name: "离线结果验证",
					key: "D_VERIFY",
					type: "number",
					info: "『一键离线』延迟查询离线结果是否成功，设置延迟秒数 (2.5)",
					placeholder: "支持一位小数 ≥ 1",
					defaultVal: 2.5,
				},
				{
					name: "上传封面",
					key: "D_UPIMG",
					type: "switch",
					info: "『离线结果验证』成功自动上传封面图",
					defaultVal: true,
				},
				{
					name: "离线重命名",
					key: "D_RENAME",
					type: "input",
					info: "『离线结果验证』成功自动修改资源名称，动态参数：<code>${番号}</code>，<code>${标题}</code>",
					placeholder: "不要填写后缀，可能导致资源不可用",
					defaultVal: "${番号} - ${标题}",
				},
				{
					name: "移动目录",
					key: "D_MOVE",
					type: "input",
					info: "『离线结果验证』成功自动移动资源至设置目录",
					placeholder: "对应网盘目录 cid",
					defaultVal: "",
				},
			],
		};

		init() {
			Store.init();
			this.createMenu();
			const tag = Object.keys(this.routes).find(key => this.routes[key].test(location.pathname));
			return { ...this, ...this[tag] };
		}
		createMenu() {
			let { tabs, commands, details } = this.menus;
			const exclude = (this.excludeMenu ?? []).join("|");
			if (exclude) {
				const regex = new RegExp(`^[^(${exclude})]`);
				commands = commands.filter(command => regex.test(command));
			}
			if (!commands.length) return;
			const domain = Matched.domain;

			GM_addStyle(`
            .x-scrollbar-hide ::-webkit-scrollbar {
                display: none;
            }
            .x-mask {
                display: none;
		        position: fixed;
		        z-index: 9999;
		        width: 100vw;
		        height: 100vh;
		        top: 0;
		        left: 0;
                border: none;
                background: transparent;
                backdrop-filter: blur(50px);
                padding: 0;
                margin: 0;
		    }
            .x-show {
                display: block !important;
            }
            `);
			let tabStr = "";
			let panelStr = "";
			for (let index = 0; index < tabs.length; index++) {
				const { title, key, prefix } = tabs[index];
				const curCommands = commands.filter(command => command.startsWith(prefix));
				const curLen = curCommands.length;
				if (!curLen) continue;
				tabStr += `
                    <a
                        class="nav-link${index ? "" : " active"}"
                        id="${key}-tab"
                        data-bs-toggle="pill"
                        href="#${key}"
                        role="tab"
                        aria-controls="${key}"
                        aria-selected="${index ? "false" : "true"}"
                    >
                        ${title}设置
                    </a>`;
				panelStr += `
                    <div
                        class="tab-pane fade${index ? "" : " show active"}"
                        id="${key}"
                        role="tabpanel"
                        aria-labelledby="${key}-tab"
                    >
                    `;
				for (let curIdx = 0; curIdx < curLen; curIdx++) {
					const {
						name,
						key: curKey,
						type,
						defaultVal,
						hotkey = "",
						placeholder = "",
						info,
					} = details.find(item => item.key === curCommands[curIdx]);
					const uniKey = `${domain}_${curKey}`;
					const val = GM_getValue(uniKey, defaultVal);
					this[curKey] = val;
					panelStr += `<div${curIdx + 1 === curLen ? "" : ` class="mb-3"`}>`;
					if (type === "switch") {
						if (curKey.startsWith("G")) {
							GM_registerMenuCommand(
								`${val ? "关闭" : "开启"}${name}`,
								() => {
									GM_setValue(uniKey, !val);
									location.reload();
								},
								hotkey
							);
						}
						panelStr += `
					        <div class="form-check form-switch">
					            <input
					                type="checkbox"
					                class="form-check-input"
					                id="${curKey}"
					                aria-describedby="${curKey}_Help"
                                    ${val ? "checked" : ""}
                                    name="${curKey}"
					            >
					            <label class="form-check-label" for="${curKey}">${name}</label>
					        </div>
					        `;
					} else {
						panelStr += `
					        <label class="form-label" for="${curKey}">${name}</label>
					        <input
                                type="${type}"
                                class="form-control"
                                id="${curKey}"
                                aria-describedby="${curKey}_Help"
                                value="${val ?? ""}"
                                placeholder="${placeholder}"
                                name="${curKey}"
                            >
					        `;
					}
					if (info) panelStr += `<div id="${curKey}_Help" class="form-text">${info}</div>`;
					panelStr += `</div>`;
				}
				panelStr += `</div>`;
			}

			DOC.addEventListener("DOMContentLoaded", () => {
				DOC.body.insertAdjacentHTML(
					"beforeend",
					`<iframe
                        class="x-mask"
                        id="control-panel"
                        name="control-panel"
                        src="about:blank"
                        title="控制面板"
                    ></iframe>`
				);
				const iframe = DOC.querySelector("#control-panel");
				iframe.style.cssText += "backdrop-filter:none";

				const _DOC = iframe.contentWindow.document;
				_DOC.querySelector("head").insertAdjacentHTML(
					"beforeend",
					`<link
                        href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css"
                        rel="stylesheet"
                    >
                    <style>${this.style}</style>`
				);
				const body = _DOC.querySelector("body");
				body.classList.add("bg-transparent");
				GM_addElement(body, "script", {
					src: "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js",
				});
				body.insertAdjacentHTML(
					"afterbegin",
					`
                    <button
                        type="button"
                        class="d-none"
                        id="openModal"
                        class="btn btn-primary"
                        data-bs-toggle="modal"
                        data-bs-target="#controlPanel"
                    >
                        open
                    </button>
                    <div
                        class="modal fade"
                        id="controlPanel"
                        tabindex="-1"
                        aria-labelledby="controlPanelLabel"
                        aria-hidden="true"
                    >
                        <div class="modal-dialog modal-lg modal-fullscreen-lg-down modal-dialog-scrollable">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title" id="controlPanelLabel">
                                        控制面板
                                        -
                                        <a
                                            href="https://sleazyfork.org/zh-CN/scripts/435360-javscript"
                                            class="link-secondary text-decoration-none"
                                            target="_blank"
                                        >
                                            ${GM_info.script.name} v${GM_info.script.version}
                                        </a>
                                    </h5>
                                    <button
                                        type="button"
                                        class="btn-close"
                                        data-bs-dismiss="modal"
                                        aria-label="Close"
                                    >
                                    </button>
                                </div>
                                <div class="modal-body">
                                    <form class="mb-0">
                                        <div class="d-flex align-items-start">
                                            <div
                                                class="nav flex-column nav-pills me-3 sticky-top"
                                                id="v-pills-tab"
                                                role="tablist"
                                                aria-orientation="vertical"
                                            >
                                                ${tabStr}
                                            </div>
                                            <div class="tab-content flex-fill" id="v-pills-tabContent">
                                                ${panelStr}
                                            </div>
                                        </div>
                                    </form>
                                </div>
                                <div class="modal-footer">
                                    <button
                                        type="button"
                                        class="btn btn-secondary"
                                        data-bs-dismiss="modal"
                                        data-action="reset"
                                    >
                                        恢复所有默认
                                    </button>
                                    <button
                                        type="button"
                                        class="btn btn-primary"
                                        data-bs-dismiss="modal"
                                        data-action="save"
                                    >
                                        保存设置
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    `
				);
				body.querySelector(".modal-footer").addEventListener("click", e => {
					const { action } = e.target.dataset;
					if (!action) return;
					e.preventDefault();

					if (action === "save") {
						const data = Object.fromEntries(new FormData(body.querySelector("form")).entries());
						commands.forEach(key => GM_setValue(`${domain}_${key}`, data[key] ?? ""));
					}
					if (action === "reset") {
						GM_listValues().forEach(name => name.startsWith(domain) && GM_deleteValue(name));
					}

					location.reload();
				});

				const toggleIframe = () => {
					DOC.body.parentNode.classList.toggle("x-scrollbar-hide");
					iframe.classList.toggle("x-show");
				};
				const openModal = () => {
					if (iframe.classList.contains("x-show")) return;
					toggleIframe();
					_DOC.getElementById("openModal").click();
				};
				GM_registerMenuCommand("控制面板", openModal, "s");
				_DOC.getElementById("controlPanel").addEventListener("hidden.bs.modal", toggleIframe);
			});
		}
		// styles
		variables = `
        :root {
            --x-bgc: #121212;
            --x-sub-bgc: #202020;
            --x-ftc: #fffffff2;
            --x-sub-ftc: #aaaaaa;
            --x-grey: #313131;
            --x-blue: #0a84ff;
            --x-orange: #ff9f0a;
            --x-green: #30d158;
            --x-red: #ff453a;

            --x-thumb-w: 180px;
            --x-cover-w: 290px;

            --x-thumb-ratio: 334 / 473;
            --x-cover-ratio: 135 / 91;
            --x-avatar-ratio: 1;
            --x-sprite-ratio: 4 / 3;
        }
        `;
		style = `
        ::-webkit-scrollbar {
            width: 8px !important;
            height: 8px !important;
        }
        ::-webkit-scrollbar-thumb {
            border-radius: 4px !important;
            background: #c1c1c1;
        }
        * {
            outline: none !important;
            text-shadow: none !important;
            text-decoration: none !important;
        }
        body {
            overflow-y: overlay;
        }
        footer {
            display: none !important;
        }
        `;
		dmStyle = `
        ::-webkit-scrollbar-thumb, button {
            background: var(--x-grey) !important;
        }
        * {
            box-shadow: none !important;
        }
        *:not(span[class]) {
            border-color: var(--x-grey) !important;
        }
        html, body, input, textarea {
            background: var(--x-bgc) !important;
        }
        body, *::placeholder {
            color: var(--x-sub-ftc) !important;
        }
        nav {
            background: var(--x-sub-bgc) !important;
        }
        a, button, h1, h2, h3, h4, h5, h6, input, p, textarea {
            color: var(--x-ftc) !important;
        }
        img {
            filter: brightness(.9) contrast(.9) !important;
        }
        `;
		customStyle = `
        #x-status {
            margin-bottom: 20px;
            color: var(--x-sub-ftc);
            text-align: center;
        }
        .x-in {
            transition: opacity .25s linear;
            opacity: 1 !important;
        }
        .x-out {
            transition: opacity .25s linear;
            opacity: 0 !important;
        }
        .x-cover {
            width: var(--x-cover-w) !important;
        }
        .x-cover > *:first-child {
            aspect-ratio: var(--x-cover-ratio);
        }
        .x-ellipsis {
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box !important;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
        }
        .x-line {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .x-matched {
            font-weight: bold;
            color: var(--x-blue);
        }
        .x-player,
        .x-loading {
            position: relative;
            overflow: hidden;
            display: block;
        }
        .x-player {
            cursor: pointer;
        }
        .x-loading {
            cursor: default;
        }
        .x-player::after,
        .x-loading::after {
            content: "";
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            transition: all .25s ease-out;
            background-color: rgba(0, 0, 0, .2);
            background-position: center;
            background-repeat: no-repeat;
        }
        .x-player::after {
            opacity: .8;
            background-image: url(${GM_getResourceURL("play")});
            background-size: 40px;
        }
        .x-loading::after {
            opacity: 1;
            background-image: url(${GM_getResourceURL("loading")});
            background-size: 100px;
        }
        .x-player:hover::after,
        .x-loading:hover::after {
            opacity: 1;
        }
        .x-player:hover::after {
            background-color: rgba(0, 0, 0, 0);
        }
        .x-loading:hover::after {
            background-color: rgba(0, 0, 0, .2);
        }
        .x-player img,
        .x-loading img {
            filter: none !important;
        }
        `;
		// G_DARK
		globalDark = (light = "", dark = "") => {
			const css = this.G_DARK ? `${light}${dark}` : light;
			GM_addStyle(css.includes("var(--x-") ? `${this.variables}${css}` : css);
		};
		// G_SEARCH
		globalSearch = (selectors, pathname) => {
			if (!this.G_SEARCH) return;
			DOC.addEventListener("keydown", async e => {
				if (e.ctrlKey && e.keyCode === 191) {
					const text = (await navigator.clipboard.readText()).trim();
					if (!text) return;
					GM_openInTab(`${location.origin}${pathname.replace("%s", text)}`, {
						setParent: true,
						active: true,
					});
				}
			});
			DOC.addEventListener("keyup", e => {
				if (e.keyCode === 191 && !["INPUT", "TEXTAREA"].includes(DOC.activeElement.nodeName)) {
					DOC.querySelector(selectors).focus();
				}
			});
		};
		// G_CLICK
		globalClick = (selectors, node = DOC) => {
			if (!this.G_CLICK) return;
			const getTarget = e => {
				const item = e.target.closest(selectors);
				return !item?.href || !node.contains(item) ? false : item;
			};
			node.addEventListener("click", e => {
				const target = getTarget(e);
				if (!target) return;
				e.preventDefault();
				GM_openInTab(target.href, { setParent: true, active: true });
			});
			let _event;
			node.addEventListener("mousedown", e => {
				if (e.button !== 2) return;
				const target = getTarget(e);
				if (!target) return;
				e.preventDefault();
				target.oncontextmenu = e => e.preventDefault();
				_event = e;
			});
			node.addEventListener("mouseup", e => {
				if (e.button !== 2) return;
				const target = getTarget(e);
				if (!target || !_event) return;
				e.preventDefault();
				const { clientX, clientY } = e;
				const { clientX: _clientX, clientY: _clientY } = _event;
				if (Math.abs(clientX - _clientX) + Math.abs(clientY - _clientY) > 5) return;
				GM_openInTab(target.href, { setParent: true, active: false });
			});
		};
		// L_MTL
		listMovieTitleLine = () => {
			const num = this.L_MTL ?? 0;
			GM_addStyle(`.x-title { -webkit-line-clamp: ${num <= 0 ? "unset" : num}; }`);
		};
		// L_MIT
		listMovieImgType = (node, condition) => {
			const img = node.querySelector("img");
			if (!this.L_MIT || !img) return;
			node.classList.add("x-cover");
			img.setAttribute("loading", "lazy");
			const { src = "" } = img;
			img.src = condition.find(({ regex }) => regex.test(src))?.replace(src);
		};
		// L_SCROLL
		listScroll = (container, itemSelector, path) => {
			const items = container.querySelectorAll(itemSelector);
			const msnry = new Masonry(container, {
				itemSelector,
				columnWidth: items[items.length - 2] ?? items[items.length - 1],
				fitWidth: true,
				visibleStyle: { opacity: 1 },
				hiddenStyle: { opacity: 0 },
			});
			container.classList.add("x-in");

			if (!this.L_SCROLL) return;

			let nextURL;
			const updateNextURL = (node = DOC) => {
				nextURL = node.querySelector(path)?.href;
			};
			updateNextURL();
			const infScroll = new InfiniteScroll(container, {
				path: () => nextURL,
				checkLastPage: path,
				outlayer: msnry,
				history: false,
			});
			infScroll?.on("request", async (_, fetchPromise) => {
				const { body } = await fetchPromise.then();
				if (body) updateNextURL(body);
			});

			const status = DOC.create("div", { id: "x-status" });
			container.insertAdjacentElement("afterend", status);
			let textContent = "加载中...";
			const noMore = "没有更多了";
			try {
				const path = infScroll.getPath() ?? "";
				if (!path) textContent = noMore;
			} catch (err) {
				textContent = noMore;
			}
			status.textContent = textContent;
			infScroll?.once("last", () => {
				status.textContent = noMore;
			});

			return infScroll;
		};
		// M_TITLE
		movieTitle = async ({ code, title }, start) => {
			if (!this.M_TITLE) return;
			start && start();
			let transTitle = Store.getDetail(code)?.transTitle;
			if (!transTitle) {
				transTitle = await Apis.movieTitle(title);
				if (transTitle) Store.upDetail(code, { transTitle });
			}
			return transTitle;
		};
		// M_VIDEO
		movieVideo = async ({ code, studio }, start) => {
			if (!this.M_VIDEO) return;
			start && start();
			let video = Store.getDetail(code)?.video;
			if (!video) {
				video = await Apis.movieVideo(code, studio);
				if (video) Store.upDetail(code, { video });
			}
			return video;
		};
		// M_IMG
		movieImg = async ({ code, date }, start) => {
			if (!this.M_IMG) return;
			start && start();
			let img = Store.getDetail(code)?.img;
			if (!img) {
				img = await Apis.movieImg(code, date);
				if (img) Store.upDetail(code, { img });
			}
			return img;
		};
		// M_STAR
		movieStar = async ({ code, star: hasStar }, start) => {
			if (!this.M_STAR || hasStar) return;
			start && start();
			let star = Store.getDetail(code)?.star;
			if (!star?.length) {
				star = await Apis.movieStar(code);
				if (star?.length) Store.upDetail(code, { star });
			}
			return star;
		};
		// M_PLAYER
		moviePlayer = () => {};
		// M_SORT
		movieSort = magnets => {
			if (!this.M_SORT || magnets.length <= 1) return magnets;
			return magnets.sort((pre, next) => {
				if (pre.zh === next.zh) {
					if (pre.byte === next.byte) return next.date - pre.date;
					return next.byte - pre.byte;
				} else {
					return pre.zh > next.zh ? -1 : 1;
				}
			});
		};
		// M_MAGNET
		movieMagnet = () => {};
		// D_MATCH
		driveMatch = () => {};
		// D_OFFLINE
		driveOffLine = () => {};
		// D_VERIFY
		driveVerify = () => {};
		// D_UPIMG
		driveUpImg = () => {};
		// D_RENAME
		driveRename = () => {};
		// D_MOVE
		driveMove = () => {};
	}
	class JavBus extends Common {
		constructor() {
			super();
			return super.init();
		}
		excludeMenu = ["D"];
		routes = {
			waterfall:
				/^\/((uncensored|uncensored\/)?(page\/\d+)?$)|((uncensored\/)?((search|searchstar|actresses|genre|star|studio|label|series|director|member)+\/)|actresses(\/\d+)?)+/i,
			genre: /^\/(uncensored\/)?genre$/i,
			forum: /^\/forum\//i,
			details: /^\/[\w]+(-|_)?[\d]*.*$/i,
		};
		// styles
		_style = `
        .ad-box {
            display: none !important;
        }
        `;
		_dmStyle = `
        .nav > li > a:hover,
        .nav > li > a:focus,
        .dropdown-menu > li > a:hover,
        .dropdown-menu > li > a:focus {
            background: var(--x-grey) !important;
        }
        .nav > li.active > a,
        .nav > .open > a,
        .nav > .open > a:hover,
        .nav > .open > a:focus,
        .dropdown-menu {
            background: var(--x-bgc) !important;
        }
        .modal-content, .alert {
            background: var(--x-sub-bgc) !important;
        }
        .btn-primary {
            background: var(--x-blue) !important;
            border-color: var(--x-blue) !important;
        }
        .btn-success {
            background: var(--x-green) !important;
            border-color: var(--x-green) !important;
        }
        .btn-warning {
            background: var(--x-orange) !important;
            border-color: var(--x-orange) !important;
        }
        .btn-danger {
            background: var(--x-red) !important;
            border-color: var(--x-red) !important;
        }
        .btn.disabled, .btn[disabled], fieldset[disabled] .btn {
            opacity: .8 !important;
        }
        `;
		boxStyle = `
        .movie-box,
        .avatar-box,
        .sample-box {
            width: var(--x-thumb-w) !important;
            border: none !important;
            margin: 10px !important;
        }
        .movie-box .photo-frame,
        .avatar-box .photo-frame,
        .sample-box .photo-frame {
            height: auto !important;
            margin: 10px !important;
            border: none !important;
        }
        .movie-box .photo-frame {
            aspect-ratio: var(--x-thumb-ratio);
        }
        .avatar-box .photo-frame {
            aspect-ratio: var(--x-avatar-ratio);
        }
        .sample-box .photo-frame {
            aspect-ratio: var(--x-sprite-ratio);
        }
        .movie-box img,
        .avatar-box img,
        .sample-box img {
            min-width: unset !important;
            min-height: unset !important;
            max-width: none !important;
            max-height: none !important;
            margin: 0 !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
        }
        .movie-box > *,
        .avatar-box > *,
        .sample-box > * {
            background: unset !important;
        }
        .movie-box > *:nth-child(2),
        .avatar-box > *:nth-child(2),
        .sample-box > *:nth-child(2) {
            padding: 0 10px 10px !important;
            border: none !important;
            line-height: 22px !important;
            height: auto !important;
        }
        `;
		dmBoxStyle = `
        .movie-box,
        .avatar-box,
        .sample-box {
            background: var(--x-sub-bgc) !important;
        }
        .movie-box > *:nth-child(2),
        .avatar-box > *:nth-child(2),
        .sample-box > *:nth-child(2) {
            color: unset;
        }
        .movie-box date {
            color: var(--x-sub-ftc) !important;
        }
        `;
		// methods
		_globalSearch = () => {
			this.globalSearch("#search-input", "/search/%s");
		};
		_globalClick = () => {
			this.globalClick([".movie-box", ".avatar-box"]);
		};
		modifyMovieBox = (node = DOC) => {
			const items = node.querySelectorAll(".movie-box");
			for (const item of items) {
				const info = item.querySelector(".photo-info span");
				info.innerHTML = info.innerHTML.replace(/<\/?span.*>|<br>/g, "");
				const title = info.firstChild;
				const titleText = title.textContent.trim();
				const _title = DOC.create("div", { title: titleText, class: "x-ellipsis x-title" }, titleText);
				info.replaceChild(_title, title);
			}
		};
		// modules
		waterfall = {
			docStart() {
				const style = `
                #waterfall {
                    display: none;
                    opacity: 0;
                }
                #waterfall .item {
                    float: unset !important;
                }
                .search-header {
				    padding: 0 !important;
				    background: none !important;
				    box-shadow: none !important;
				}
                .search-header .nav-tabs {
                    display: none !important;
                }
				.alert-common {
				    margin: 20px 20px 0 !important;
				}
				.alert-page {
				    margin: 20px !important;
				}
				.text-center.hidden-xs {
                    display: none;
				    line-height: 0;
				}
				ul.pagination {
				    margin-bottom: 40px;
				}
                .movie-box .x-title + div {
                    height: 22px;
                    margin: 4px 0;
                }
                .avatar-box .pb10 {
                    padding: 0 !important;
                }
                .avatar-box .pb10:not(:last-child) {
                    margin-bottom: 4px !important;
                }
                .avatar-box p {
                    margin: 0 0 6px !important;
                }
                .mleft {
                    display: flex !important;
                    align-items: center;
                }
                .mleft .btn-xs {
                    margin: 0 6px 0 0 !important;
                }
                `;
				const dmStyle = `
                .pagination > li > a {
				    background-color: var(--x-sub-bgc) !important;
				    color: var(--x-ftc) !important;
				}
				.pagination > li:not(.active) > a:hover {
				    background-color: var(--x-grey) !important;
				}
				.nav-pills > li.active > a {
				    background-color: var(--x-blue) !important;
				}
                `;
				this.globalDark(
					`${this.style}${this._style}${this.boxStyle}${this.customStyle}${style}`,
					`${this.dmStyle}${this._dmStyle}${this.dmBoxStyle}${dmStyle}`
				);
				this.listMovieTitleLine();
			},
			contentLoaded() {
				const nav = DOC.querySelector(".search-header .nav");
				if (nav) nav.classList.replace("nav-tabs", "nav-pills");
				this._globalSearch();
				this._globalClick();
				this.modifyLayout();
			},
			modifyLayout() {
				const waterfall = DOC.querySelector("#waterfall");
				if (!waterfall) return;

				const _waterfall = waterfall.cloneNode(true);
				_waterfall.removeAttribute("style");
				_waterfall.setAttribute("class", "x-show");
				const items = this.modifyListItem(_waterfall);
				if (items?.length) {
					_waterfall.innerHTML = "";
					items.forEach(item => _waterfall.appendChild(item));
				}
				waterfall.parentElement.replaceChild(_waterfall, waterfall);

				const infScroll = this.listScroll(_waterfall, ".item", "#next");
				if (!infScroll) return DOC.querySelector(".text-center.hidden-xs")?.classList.add("x-show");
				infScroll?.on("request", async (_, fetchPromise) => {
					const { body } = await fetchPromise.then();
					if (!body) return;
					const items = this.modifyListItem(body);
					infScroll.appendItems(items);
					infScroll.options.outlayer.appended(items);
				});
			},
			modifyListItem(container) {
				const items = container.querySelectorAll(".item");
				for (const item of items) {
					item.removeAttribute("style");
					item.setAttribute("class", "item");
					this._listMovieImgType(item);
					this.modifyAvatarBox(item);
					this.modifyMovieBox(item);
				}
				return items;
			},
			_listMovieImgType(node) {
				const item = node.querySelector(".movie-box");
				if (!item) return;
				const condition = [
					{
						regex: /\/thumb(s)?\//gi,
						replace: val => val.replace(/\/thumb(s)?\//gi, "/cover/").replace(/\.jpg/gi, "_b.jpg"),
					},
					{
						regex: /pics\.dmm\.co\.jp/gi,
						replace: val => val.replace("ps.jpg", "pl.jpg"),
					},
				];
				this.listMovieImgType(item, condition);
			},
			modifyAvatarBox(node = DOC) {
				const items = node.querySelectorAll(".avatar-box");
				for (const item of items) {
					const span = item.querySelector("span");
					if (span.classList.contains("mleft")) {
						const title = span.firstChild;
						const titleText = title.textContent.trim();
						const _title = DOC.create("div", { title: titleText, class: "x-line" }, titleText);
						title.parentElement.replaceChild(_title, title);
						span.insertAdjacentElement("afterbegin", span.querySelector("button"));
						continue;
					}
					span.classList.add("x-line");
				}
			},
		};
		genre = {
			docStart() {
				const style = `
                .alert-common {
                    margin: 20px 0 0 !important;
                }
                .container-fluid {
				    padding: 0 20px !important;
				}
                h4 {
				    margin: 20px 0 10px 0 !important;
				}
                .genre-box {
				    padding: 20px !important;
				    margin: 10px 0 20px 0 !important;
				}
                .genre-box a {
				    cursor: pointer !important;
				    user-select: none !important;
				    text-align: left !important;
				}
                .genre-box input {
				    margin: 0 !important;
				    vertical-align: middle !important;
				}
                .x-last-box {
                    margin-bottom: 70px !important;
                }
                button.btn.btn-danger.btn-block.btn-genre {
				    position: fixed !important;
				    bottom: 0 !important;
				    left: 0 !important;
				    margin: 0 !important;
				    border: none !important;
				    border-radius: 0 !important;
				}
                `;
				const dmStyle = `
                .genre-box {
                    background: var(--x-sub-bgc) !important;
                }
                `;
				this.globalDark(`${this.style}${this._style}${style}`, `${this.dmStyle}${this._dmStyle}${dmStyle}`);
			},
			contentLoaded() {
				this._globalSearch();
				if (!DOC.querySelector("button.btn.btn-danger.btn-block.btn-genre")) return;
				const box = DOC.querySelectorAll(".genre-box");
				box[box.length - 1].classList.add("x-last-box");
				DOC.querySelector(".container-fluid.pt10").addEventListener("click", ({ target }) => {
					if (target.nodeName !== "A" || !target.classList.contains("text-center")) return;
					const checkbox = target.querySelector("input");
					checkbox.checked = !checkbox.checked;
				});
			},
		};
		forum = {
			docStart() {
				const style = `
                .bcpic,
                .banner728,
                .banner300,
                .jav-footer {
				    display: none !important;
				}
                #toptb {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    right: 0 !important;
                    z-index: 999 !important;
                    border-color: #e7e7e7;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .15), 0 1px 5px rgba(0, 0, 0, .075);
                }
                #search-input {
                    border-right: none !important;
                }
                .jav-button {
                    margin-top: -3px !important;
                    margin-left: -4px !important;
                }
                #wp {
                    margin-top: 55px !important;
                }
                .biaoqicn_show a {
                    width: 20px !important;
                    height: 20px !important;
                    line-height: 20px !important;
                    opacity: .7;
                }
                #online .bm_h {
                    border-bottom: none !important;
                }
                #online .bm_h .o img {
                    margin-top: 48%;
                }
                #moquu_top {
                    right: 20px;
                    bottom: 20px;
                }
                `;

				// const dmStyle = `
				// /** head **/
				// #toptb,
				// #qmenu_menu,
				// .biaoqi_bk_sj {
				//     background: var(--x-sub-bgc) !important;
				// }
				// #toptb .nav-active a,
				// .menu-body-panel,
				// .menu-body-panel .icon-arrow-t {
				//     background-color: var(--x-bgc) !important;
				// }
				// .jump_bdl li {
				//     background-color: unset !important;
				// }
				// .p_pop a:hover {
				//     background-color: var(--x-grey) !important;
				// }
				// /** left **/
				// #ct .mn > div:first-child,
				// .biaoqicn_show a:not(.on),
				// .dspanonhover,
				// .fl .bm,
				// .fl .bm_h,
				// .frame,
				// .frame-tab,
				// #online,
				// #threadlist,
				// tr[style="background: #fff;"],
				// .p_pop,
				// .p_pof,
				// .sllt {
				//     background: var(--x-sub-bgc) !important;
				// }
				// .new4_list_top,
				// #thread_types,
				// #separatorline tr {
				//     background: var(--x-grey) !important;
				// }
				// .dspanonhover {
				//     height: 41px !important;
				//     line-height: 40px !important;
				//     border-top: none !important;
				// }
				// #filter_special, #filter_time, #filter_orderby, #filter_types, #filter_ctime, .post_two {
				//     background-color: var(--x-sub-bgc) !important;
				// }
				// #threadlist tr:hover {
				//     background: var(--x-grey);
				// }
				// .tps a:hover {
				//     background-color: var(--x-sub-bgc) !important;
				// }
				// .pg a, .pgb a, .pg label {
				//     background: var(--x-sub-bgc);
				// }
				// /** right **/
				// .main-right-p15 {
				//     background: var(--x-sub-bgc) !important;
				// }
				// .main-right-tit span {
				//     color: var(--x-ftc)
				// }
				// .main-right-zuixin .comment-excerpt {
				//     background: var(--x-grey) !important;
				// }
				// .main-right-zuixin .comment-excerpt:before {
				//     border-bottom-color: var(--x-grey) !important;
				// }
				// .biaoqi_forum_ps {
				//     background-color: var(--x-sub-bgc);
				// }
				// /** global **/
				// #moquu_top {
				//     background-color: var(--x-sub-bgc) !important;
				// }
				// #moquu_top:hover {
				//     background-color: var(--x-grey) !important;
				// }
				// `;

				this.globalDark(`${this.style}${style}`);
			},
			contentLoaded() {
				this._globalSearch();
			},
		};
		details = {
			docStart() {
				const style = `
                #mag-submit-show,
                #mag-submit,
                #magnet-table,
				h4[style="position:relative"],
				h4[style="position:relative"] + .row {
				    display: none !important;
				}
                html {
                    padding-right: 0 !important;
                }
                @media (min-width: 1210px) {
				    .container { width: 1210px; }
				}
                .container {
				    margin-bottom: 40px;
				}
                .row.movie {
                    padding: 0 !important;
                }
				.screencap, .info {
				    padding: 10px !important;
				    border: none !important;
				}
                .bigImage {
                    position: relative;
                    overflow: hidden;
                    display: block;
                    aspect-ratio: var(--x-cover-ratio);
                    opacity: 0;
                }
                .star-box img {
				    width: 100% !important;
				    height: auto !important;
				    margin: 0 !important;
				}
                .star-box .star-name {
                    padding: 6px 0 !important;
                    background: unset !important;
                    border: none !important;
                }
                #avatar-waterfall,
				#sample-waterfall,
				#related-waterfall {
				    margin: -10px !important;
				    word-spacing: -20px;
				}
                .avatar-box,
				.sample-box,
				.movie-box {
				    word-spacing: 0 !important;
				    vertical-align: top !important;
				}
                .movie-box > * {
                    text-align: left !important;
                }
                #magneturlpost + .movie {
                    padding: 10px !important;
                    margin-top: 20px !important;
                }
                #magneturlpost + .movie table {
                    margin: 0 !important;
                }
                td, th {
				    vertical-align: middle !important;
				}
                .x-ml {
                    margin-left: 10px;
                }
                .x-mr {
                    margin-right: 10px;
                }
                .x-grass-img {
                    width: auto !important;
                    height: auto !important;
                    min-width: 100%;
                    min-height: 100%;
                }
                .x-grass-mask,
                .x-contain,
                .x-video {
                    position: absolute;
                    width: 100% !important;
                    height: 100% !important;
                    top: 0;
                    left: 0;
                }
                .x-grass-mask {
                    background-color: rgba(0, 0, 0, .2);
                    backdrop-filter: blur(30px);
                }
                .x-contain,
                .x-video {
                    object-fit: contain;
                }
                .x-video {
                    cursor: pointer;
                    opacity: 0;
                }
                .x-name {
				    width: 380px;
				    max-width: 380px;
				}
                `;
				const dmStyle = `
                .movie,
                .star-box-up li,
                .table-striped > tbody > tr:nth-of-type(odd) {
                    background: var(--x-sub-bgc) !important;
                }
                tbody tr:hover,
                .table-striped > tbody > tr:nth-of-type(odd):hover {
                    background: var(--x-grey) !important;
                }
                `;
				this.globalDark(
					`${this.style}${this._style}${this.boxStyle}${this.customStyle}${style}`,
					`${this.dmStyle}${this._dmStyle}${this.dmBoxStyle}${dmStyle}`
				);
			},
			contentLoaded() {
				// global methods
				this._globalSearch();
				this._globalClick();

				// add copy target
				addCopyTarget("h3", { title: "复制标题" });
				addCopyTarget("span[style='color:#CC0000;']", { title: "复制番号" });

				// modify bigImage
				this.modifyBigImage();

				// movie  methods
				const params = this.getParams();
				if (params) {
					this._movieTitle(params);
					this._movieVideo(params);
					this._movieImg(params);
					this._movieStar(params);
					this._moviePlayer(params);
					this._movieMagnet(params);
				}

				// refactor table
				const tableObs = new MutationObserver((_, obs) => {
					obs.disconnect();
					this.refactorTable();
				});
				tableObs.observe(DOC.querySelector("#movie-loading"), { attributes: true, attributeFilter: ["style"] });

				// modify box
				this.modifyMovieBox();
			},
			getParams() {
				const { textContent } = DOC.querySelector(".info");
				return {
					title: DOC.querySelector("h3").firstChild.textContent,
					code: DOC.querySelector("span[style='color:#CC0000;']").firstChild.textContent,
					date: DOC.querySelector(".info p:nth-child(2)").childNodes[1].textContent.trim(),
					studio: textContent.match(/(?<=製作商: ).+/g)?.pop(0),
					star: !/暫無出演者資訊/g.test(textContent),
				};
			},
			modifyBigImage() {
				const node = DOC.querySelector(".bigImage");
				const img = node.querySelector("img");
				img.classList.add("x-grass-img");
				node.insertAdjacentHTML(
					"beforeend",
					`<div class="x-grass-mask"></div><img src="${img.src}" class="x-contain">`
				);
				node.classList.add("x-in");
			},
			refactorTable() {
				const table = DOC.querySelector("#magnet-table");
				const tableParent = table.parentElement;

				let magnets = [];
				for (const tr of table.querySelectorAll("tr")) {
					const [link, size, date] = tr.querySelectorAll("td");

					const _link = link?.querySelector("a");
					const _size = size?.textContent.trim();
					if (!_link || !_size || !date) continue;

					magnets.push({
						name: _link.textContent.trim(),
						link: _link.href.split("&")[0],
						zh: !!link.querySelector("a.btn.btn-mini-new.btn-warning.disabled"),
						size: _size,
						byte: transToByte(_size),
						date: date.textContent.trim(),
					});
				}
				magnets = this.movieSort(magnets);

				tableParent.innerHTML = `
				<table class="table table-striped table-hover table-bordered">
				    <thead>
				        <tr>
				            <th scope="col">磁力名称</th>
				            <th scope="col">档案大小</th>
				            <th scope="col" class="text-center">分享日期</th>
				            <th scope="col" class="text-center">来源</th>
				            <th scope="col" class="text-center">字幕</th>
				            <th scope="col">操作</th>
				        </tr>
				    </thead>
				    <tbody>
                    ${
						this.createMagnetHtml(magnets) ??
						`<tr><th scope="row" colspan="6" class="text-center text-muted">暂无数据</th></tr>`
					}
                    </tbody>
				    <tfoot>
				        <tr>
				            <th scope="row" colspan="5" class="text-right">总数</th>
				            <td>${magnets.length}</td>
				        </tr>
				    </tfoot>
				</table>
				`;
			},
			createMagnetHtml(magnets) {
				if (!magnets.length) return;
				return magnets.reduce(
					(acc, { name, link, size, date, from, zh }) => `
                    ${acc}
                    <tr>
                        <th scope="row" class="x-name x-line" title="${name}">
                            <a href="${link}">${name}</a>
                        </th>
                        <td>${size}</td>
                        <td class="text-center">${date}</td>
                        <td class="text-center"><code>${from ?? Matched.domain}</code></td>
                        <td class="text-center">
                            <span
                                class="glyphicon ${
									zh ? "glyphicon-ok-circle text-success" : "glyphicon-remove-circle text-danger"
								}"
                            >
                            </span>
                        </td>
                        <td>
                            <a
                                href="javascript:void(0);"
                                data-copy="${link}"
                                class="x-mr"
                                title="复制磁力链接"
                            >
                                复制链接
                            </a>
                            <a
                                href="javascript:void(0);"
                                data-magnet="${link}"
                                class="text-success"
                                title="仅添加离线任务"
                            >
                                离线下载
                            </a>
                        </td>
                    </tr>
                    `,
					""
				);
			},
			// methods
			async _movieTitle(params) {
				const transTitle = await this.movieTitle(params);
				if (!transTitle) return;
				DOC.querySelector(".info").insertAdjacentHTML(
					"afterbegin",
					`<p><span class="header">机翻标题: </span>${transTitle}</p>`
				);
			},
			async _movieVideo(params) {
				const start = () => {
					const player = DOC.create("div", { class: "x-player x-loading" }, DOC.querySelector(".bigImage"));
					DOC.querySelector(".screencap").insertAdjacentElement("afterbegin", player);
				};

				const video = await this.movieVideo(params, start);
				const player = DOC.querySelector(".x-player");

				if (!video) {
					if (player) {
						player.removeAttribute("class");
						player.setAttribute("title", "暂无预览视频");
					}
					return;
				}

				player.classList.remove("x-loading");
				player.setAttribute("title", "查看预览视频");

				const videoNode = DOC.create("video", { controls: "controls", src: video, class: "x-video" });
				videoNode.currentTime = 3;
				videoNode.preload = "auto";
				videoNode.muted = true;
				videoNode.addEventListener("click", e => {
					e.preventDefault();
					e.stopPropagation();
					const { target: videoTarget } = e;
					videoTarget.paused ? videoTarget.play() : videoTarget.pause();
				});
				const bigImage = DOC.querySelector(".bigImage");
				bigImage.removeAttribute("href");
				bigImage.insertAdjacentElement("beforeend", videoNode);

				player.addEventListener(
					"click",
					() => {
						player.removeAttribute("class");
						player.removeAttribute("title");
						player.querySelector(".x-contain").classList.add("x-out");
						videoNode.classList.add("x-in");
						videoNode.play();
						videoNode.focus();
					},
					{ once: true }
				);
			},
			async _movieImg(params) {
				const start = () => {
					console.log("movie img start");
				};
				const img = await this.movieImg(params, start);
				if (!img) return;
				console.log(img);
			},
			async _movieStar(params) {
				const start = () => {
					const starShow = DOC.querySelector(".star-show");
					starShow.removeAttribute("class");
					starShow.innerHTML = `<span class="header">演員:</span>`;
					starShow.nextElementSibling.nextSibling.remove();
					starShow.nextElementSibling.remove();
					starShow.insertAdjacentHTML("afterend", `<p class="x-star">查询中...</p>`);
				};

				const star = await this.movieStar(params, start);
				const starNode = DOC.querySelector(".x-star");

				if (!star?.length) {
					if (starNode) starNode.textContent = "暂无演员数据";
					return;
				}

				starNode.innerHTML = star.reduce(
					(acc, cur) => `${acc}<span class="genre"><a href="/search/${cur}">${cur}</a></span>`,
					""
				);
			},
			async _moviePlayer(params) {
				const player = await this.moviePlayer(params);
				if (!player?.length) return;
			},
			async _movieMagnet(params) {
				const magnet = await this.movieMagnet(params);
				if (!magnet?.length) return;
			},
		};
	}

	const Process = eval(`new ${Matched.domain}()`);
	Process.docStart();
	DOC.addEventListener("DOMContentLoaded", () => Process.contentLoaded());
	window.addEventListener("load", () => Process.load());
})();
