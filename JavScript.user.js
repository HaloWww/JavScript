// ==UserScript==
// @name            JavScript
// @namespace       JavScript@blc
// @version         3.0.0
// @author          blc
// @description     一站式体验，JavBus & JavDB 兼容
// @icon            https://s1.ax1x.com/2022/04/01/q5lzYn.png
// @include         *
// @require         https://unpkg.com/masonry-layout@4/dist/masonry.pkgd.min.js
// @require         https://unpkg.com/infinite-scroll@4/dist/infinite-scroll.pkgd.min.js
// @resource        play https://s4.ax1x.com/2022/01/12/7nYuKe.png
// @resource        success https://s1.ax1x.com/2022/04/01/q5l2LD.png
// @resource        info https://s1.ax1x.com/2022/04/01/q5lyz6.png
// @resource        warn https://s1.ax1x.com/2022/04/01/q5lgsO.png
// @resource        error https://s1.ax1x.com/2022/04/01/q5lcQK.png
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
// @license         GPL-3.0-only
// @compatible      firefox 未测试
// @compatible      chrome
// @compatible      edge
// ==/UserScript==

/**
 * TODO:
 * 列表 数据聚合?
 * 其他 发送至 aria2/qBittorrent 下载?
 * 脚本 icon, css, bootstrap(精简) 视觉调整?
 *
 * 详情 磁链字幕额外过滤
 * 列表 标题等高模式 done
 * 115 匹配 & 离线，番号开头0省略兼容 done
 */

(function () {
	// match domain
	const MatchDomains = [
		{ domain: "JavBus", regex: /(jav|bus|dmm|see|cdn|fan){2}\./g },
		{ domain: "JavDB", regex: /javdb\d*\.com/g },
		{ domain: "Drive115", regex: /captchaapi\.115\.com/g },
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
			params.responseType = params.responseType ?? "document";
			if (data) {
				if (url.includes("?")) {
					url = `${url}${url.charAt(url.length - 1) === "&" ? "" : "&"}${data}`;
				} else {
					url = `${url}?${data}`;
				}
			}
		}
		if (method === "POST") {
			params.responseType = params.responseType ?? "json";
			const headers = params.headers ?? {};
			params.headers = { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", ...headers };
		}

		return new Promise(resolve => {
			GM_xmlhttpRequest({
				url,
				data,
				method,
				timeout: 20000,
				onload: ({ status, response }) => {
					if (response?.errcode === 911) verify();
					if (status === 404) response = false;
					if (response && ["", "text"].includes(params.responseType)) {
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
	const handleCopyTxt = (e, text) => {
		if (!e?.target?.dataset?.copy?.trim()) return;

		e.preventDefault();
		e.stopPropagation();

		const { target } = e;
		GM_setClipboard(target.dataset.copy.trim());
		const originText = target.textContent ?? "";
		target.textContent = text ?? "成功";

		const timer = setTimeout(() => {
			target.textContent = originText;
			clearTimeout(timer);
		}, 400);

		return 1;
	};
	const transToBytes = sizeStr => {
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
	const unique = (arr, key) => {
		if (!key) return Array.from(new Set(arr));

		arr = arr.map(item => {
			item[key] = item[key]?.toLowerCase();
			return item;
		});
		return Array.from(new Set(arr.map(e => e[key]))).map(e => arr.find(x => x[key] === e));
	};
	const notify = msg => {
		GM_notification({
			highlight: true,
			silent: true,
			timeout: 2000,
			...msg,
			text: msg?.text ?? GM_info.script.name,
			image: GM_getResourceURL(msg?.image ?? "info"),
			onclick: msg?.clickUrl ? () => GM_openInTab(msg.clickUrl, { setParent: true, active: true }) : () => {},
		});
	};
	const verify = () => {
		const h = 667;
		const w = 375;
		const t = (window.screen.availHeight - h) / 2;
		const l = (window.screen.availWidth - w) / 2;

		window.open(
			`https://captchaapi.115.com/?ac=security_code&type=web&cb=Close911_${new Date().getTime()}`,
			"验证账号",
			`height=${h},width=${w},top=${t},left=${l},toolbar=no,menubar=no,scrollbars=no,resizable=no,location=no,status=no`
		);
	};
	const delay = n => new Promise(r => setTimeout(r, n * 1000));
	const codeParse = code => {
		const codes = code
			.split(/-|_/)
			.filter(Boolean)
			.map(item => (item.startsWith("0") ? item.slice(1) : item));

		return {
			prefix: codes[0],
			regex: new RegExp(codes.join(".*"), "i"),
		};
	};

	// store
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

	// apis
	class Apis {
		// movie
		static async movieImg(code) {
			code = code.toUpperCase();

			const [blogJav, javStore] = await Promise.all([
				request(`https://www.google.com/search?q=${code} site:blogjav.net`),
				request(`https://javstore.net/search/${code}.html`),
			]);

			const [bjRes, jsRes] = await Promise.all([
				request(
					`http://webcache.googleusercontent.com/search?q=cache:${
						blogJav?.querySelector("#rso .g .yuRUbf a")?.href
					}`
				),
				request(javStore?.querySelector("#content_news li a")?.href),
			]);

			let bjImg = "";
			if (bjRes) {
				bjImg = bjRes
					?.querySelector("#page .entry-content a img")
					?.getAttribute("data-lazy-src")
					.replace("//t", "//img")
					.replace("thumbs", "images");
			}

			return bjImg || jsRes?.querySelector(".news a img[alt*='.th']").src.replace(".th", "") || "";
		}
		static async movieVideo(code, studio) {
			code = code.toLowerCase();

			if (studio) {
				const matchList = [
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
				const matched = matchList.find(({ name }) => name === studio);
				if (matched) return matched.match.replace(/%s/g, matched.trans ? matched.trans(code) : code);
			}

			let [r18, xrmoo] = await Promise.all([
				request(`https://www.r18.com/common/search/order=match/searchword=${code}/`),
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
		static async moviePlayer(code) {
			code = code.toUpperCase();
			const { regex } = codeParse(code);

			const matchList = [
				{
					site: "Netflav",
					host: "https://netflav.com/",
					search: "search?type=title&keyword=%s",
					selectors: ".grid_root .grid_cell",
					filter: {
						name: e => e?.querySelector(".grid_title").textContent,
					},
				},
				{
					site: "BestJavPorn",
					host: "https://www2.bestjavporn.com/",
					search: "search/%s/",
					selectors: "#main article",
					filter: {
						name: e => e?.querySelector("a").title,
						zh: e => /中文/g.test(e?.querySelector(".hd-video")?.textContent ?? ""),
					},
				},
				{
					site: "JavHHH",
					host: "https://javhhh.com/",
					search: "v/?wd=%s",
					selectors: "#wrapper .typelist .i-container",
					filter: {
						name: e => e?.querySelector("img.img-responsive").title,
					},
				},
				{
					site: "Avgle",
					host: "https://avgle.com/",
					search: "search/videos?search_query=%s&search_type=videos",
					selectors: ".row .well.well-sm",
					filter: {
						name: e => e?.querySelector(".video-title")?.textContent,
					},
				},
			];

			const matched = await Promise.all(
				matchList.map(({ host, search }) => request(`${host}${search.replace(/%s/g, code)}`))
			);

			const players = [];
			for (let index = 0; index < matchList.length; index++) {
				let node = matched[index];
				if (!node) continue;

				const { selectors, site, filter, host } = matchList[index];
				node = node?.querySelectorAll(selectors);
				if (!node?.length) continue;

				for (const item of node) {
					const player = { from: site };
					Object.keys(filter).forEach(key => {
						player[key] = filter[key](item) ?? "";
					});

					const { name } = player;
					let link = item?.querySelector("a")?.getAttribute("href");
					if (!name || !regex.test(name) || !link) continue;

					player.link = !link.includes("//") ? `${host}${link.replace(/^\//, "")}` : link;
					if (!("zh" in player)) player.zh = /中文/g.test(name);

					if (player.zh) {
						players.unshift(player);
						break;
					}
					players.push(player);
				}

				if (players.find(item => item.zh)) break;
			}

			return players.length ? players[0].link : "";
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
		static async movieStar(code) {
			code = code.toUpperCase();
			const site = "https://javdb.com";

			let res = await request(`${site}/search?q=${code}&sb=0`);
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
		static async movieMagnet(code) {
			code = code.toUpperCase();

			const matchList = [
				{
					site: "Sukebei",
					host: "https://sukebei.nyaa.si/",
					search: "?f=0&c=0_0&q=%s",
					selectors: ".table-responsive table tbody tr",
					filter: {
						name: e => e?.querySelector("td:nth-child(2) a").textContent,
						link: e => e?.querySelector("td:nth-child(3) a:last-child").href,
						size: e => e?.querySelector("td:nth-child(4)").textContent,
						date: e => e?.querySelector("td:nth-child(5)").textContent.split(" ")[0],
						href: e => e?.querySelector("td:nth-child(2) a").getAttribute("href"),
					},
				},
				{
					site: "BTSOW",
					host: "https://btsow.rest/",
					search: "search/%s",
					selectors: ".data-list .row:not(.hidden-xs)",
					filter: {
						name: e => e?.querySelector(".file").textContent,
						link: e => `magnet:?xt=urn:btih:${e?.querySelector("a").href.split("/").pop()}`,
						size: e => e?.querySelector(".size").textContent,
						date: e => e?.querySelector(".date").textContent,
						href: e => e?.querySelector("a").getAttribute("href"),
					},
				},
			];

			const matched = await Promise.all(
				matchList.map(({ host, search }) => request(`${host}${search.replace(/%s/g, code)}`))
			);

			const magnets = [];
			for (let index = 0; index < matchList.length; index++) {
				let node = matched[index];
				if (!node) continue;

				const { selectors, site, filter, host } = matchList[index];
				node = node?.querySelectorAll(selectors);
				if (!node?.length) continue;

				for (const item of node) {
					const magnet = { from: site };
					Object.keys(filter).forEach(key => {
						magnet[key] = filter[key](item)?.trim();
					});

					magnet.bytes = transToBytes(magnet.size);
					magnet.zh = /中文/g.test(magnet.name);
					magnet.link = magnet.link.split("&")[0];
					const { href } = magnet;
					if (href && !href.includes("//")) magnet.href = `${host}${href.replace(/^\//, "")}`;

					magnets.push(magnet);
				}
			}

			return magnets;
		}
		// drive
		static async searchVideo(params = { search_value: "" } | "") {
			if (typeof params === "string") params = { search_value: params };
			if (!params.search_value.trim()) return [];

			const res = await request(
				"https://webapi.115.com/files/search",
				{
					offset: 0,
					limit: 10000,
					date: "",
					aid: 1,
					cid: 0,
					pick_code: "",
					type: 4,
					source: "",
					format: "json",
					o: "user_ptime",
					asc: 0,
					star: "",
					suffix: "",
					...params,
				},
				"GET",
				{ responseType: "json" }
			);

			return (res.data ?? []).map(({ cid, fid, n, pc, t }) => {
				return { cid, fid, n, pc, t };
			});
		}
		static async getFile(params = {}) {
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
					snap: 0,
					natsort: 1,
					record_open_time: 1,
					source: "",
					format: "json",
					...params,
				},
				"GET",
				{ responseType: "json" }
			);

			return res?.data ?? [];
		}
		static async getSign() {
			const { state, sign, time } = await request(
				"http://115.com/",
				{ ct: "offline", ac: "space", _: new Date().getTime() },
				"GET",
				{ responseType: "json" }
			);

			if (state) return { sign, time };

			notify({
				title: "请求失败，115未登录",
				text: "点击跳转登录",
				image: "error",
				clickUrl: "http://115.com/?mode=login",
				timeout: 3000,
			});
		}
		static async addTaskUrl({ url, wp_path_id = "", sign, time }) {
			const _sign = sign && time ? { sign, time } : await this.getSign();
			if (!_sign) return;

			return await request(
				"https://115.com/web/lixian/?ct=lixian&ac=add_task_url",
				{ url, wp_path_id, ..._sign },
				"POST"
			);
		}
		static getVideo(cid = "") {
			return this.getFile({ cid, custom_order: 0, star: "", suffix: "", type: 4 });
		}
		static driveRename(res) {
			const data = {};
			for (const { fid, file_name } of res) data[`files_new_name[${fid}]`] = file_name;

			return request("https://webapi.115.com/files/batch_rename", data, "POST");
		}
	}

	// common
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
				"L_MIT",
				"L_MTH",
				"L_MTL",
				"L_SCROLL",
				"M_IMG",
				"M_VIDEO",
				"M_PLAYER",
				"M_TITLE",
				"M_STAR",
				"M_SUB",
				"M_SORT",
				"M_MAGNET",
				"D_MATCH",
				"D_CID",
				"D_VERIFY",
				"D_RENAME",
			],
			details: [
				{
					name: "暗黑模式",
					key: "G_DARK",
					type: "switch",
					info: "常用页面暗黑模式",
					defaultVal: true,
					hotkey: "d",
				},
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
					name: "预览图替换",
					key: "L_MIT",
					type: "switch",
					info: "替换为封面大图",
					defaultVal: true,
				},
				{
					name: "标题等高",
					key: "L_MTH",
					type: "switch",
					info: "影片标题强制等高",
					defaultVal: false,
				},
				{
					name: "标题最大行",
					key: "L_MTL",
					type: "number",
					info: "影片标题最大显示行数，超出省略。0 不限制 (等高模式下最小有效值 1)",
					placeholder: "仅支持整数 ≥ 0",
					defaultVal: 1,
				},
				{
					name: "滚动加载",
					key: "L_SCROLL",
					type: "switch",
					info: "滚动自动加载下一页",
					defaultVal: true,
				},
				{
					name: "预览大图",
					key: "M_IMG",
					type: "switch",
					info: `获取自 <a href="https://blogjav.net/" class="link-primary">BlogJav</a>, <a href="https://javstore.net/" class="link-primary">JavStore</a>`,
					defaultVal: true,
				},
				{
					name: "预览视频",
					key: "M_VIDEO",
					type: "switch",
					info: `获取自 <a href="https://www.r18.com/" class="link-primary">R18</a>, <a href="http://dmm.xrmoo.com/" class="link-primary">闲人吧</a>`,
					defaultVal: true,
				},
				{
					name: "在线播放",
					key: "M_PLAYER",
					type: "switch",
					info: `获取自 <a href="https://netflav.com/" class="link-primary">Netflav</a>, <a href="https://www2.bestjavporn.com/" class="link-primary">BestJavPorn</a>, <a href="https://javhhh.com/" class="link-primary">JavHHH</a>, <a href="https://avgle.com/" class="link-primary">Avgle</a>`,
					defaultVal: true,
				},
				{
					name: "标题机翻",
					key: "M_TITLE",
					type: "switch",
					info: `翻自 <a href="https://google.com/" class="link-primary">Google</a>`,
					defaultVal: true,
				},
				{
					name: "演员匹配",
					key: "M_STAR",
					type: "switch",
					info: `如无，获取自 <a href="https://javdb.com/" class="link-primary">JavDB</a>`,
					defaultVal: true,
				},
				{
					name: "字幕筛选",
					key: "M_SUB",
					type: "switch",
					info: "额外针对名称为 “<code>大写字母</code> + <code>-C</code>” 资源判断",
					defaultVal: false,
				},
				{
					name: "磁力排序",
					key: "M_SORT",
					type: "switch",
					info: "综合排序 <code>字幕</code> ＞ <code>大小</code> ＞ <code>日期</code>",
					defaultVal: true,
				},
				{
					name: "磁力搜索",
					key: "M_MAGNET",
					type: "switch",
					info: `自动去重，获取自 <a href="https://sukebei.nyaa.si/" class="link-primary">Sukebei</a>, <a href="https://btsow.rest/" class="link-primary">BTSOW</a>`,
					defaultVal: true,
				},
				{
					name: "网盘资源",
					key: "D_MATCH",
					type: "switch",
					info: "资源匹配 & 离线开关 (<strong>确保已登录网盘</strong>)",
					defaultVal: true,
				},
				{
					name: "下载目录",
					key: "D_CID",
					type: "input",
					info: "离线下载自定目录 <strong>cid</strong> 或 <strong>动态参数</strong>，建议 <strong>cid</strong> 效率更高<br><strong>动态参数</strong> 支持网盘根目录下文件夹名称<br>默认动态参数 <code>${云下载}</code>",
					placeholder: "cid 或 动态参数",
					defaultVal: "${云下载}",
				},
				{
					name: "文件验证",
					key: "D_VERIFY",
					type: "number",
					info: "『<strong>一键离线</strong>』可用，查询以验证离线下载结果，每次间隔一秒<br>设置次数上限，次数越多验证越精准<br>建议 3 ~ 5，默认 3",
					placeholder: "仅支持整数 ≥ 0",
					defaultVal: 3,
				},
				{
					name: "文件重命名",
					key: "D_RENAME",
					type: "input",
					info: '需要『<strong>文件验证</strong>』&『<strong>一键离线</strong>』可用，支持动态参数如下<br><code>${字幕}</code> "【中文字幕】"，非字幕资源则为空<br><code>${番号}</code> 页面番号，字母自动转大写；番号为必须值，如新命名未包含将自动追加前缀<br><code>${标题}</code> 页面标题，标题可能已包含番号，自行判断',
					placeholder: "勿填写后缀，可能导致资源不可用",
					defaultVal: "${字幕}${番号} - ${标题}",
				},
			],
		};
		route = null;
		pcUrl = "https://v.anxia.com/?pickcode=";

		init() {
			Store.init();
			this.route = Object.keys(this.routes).find(key => this.routes[key].test(location.pathname));
			this.createMenu();
			return { ...this, ...this[this.route] };
		}
		createMenu() {
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
                box-sizing: border-box;
		    }
            iframe.x-mask {
                backdrop-filter: none;
            }
            .x-show {
                display: block !important;
            }
            `);

			let { tabs, commands, details } = this.menus;

			const exclude = this.excludeMenu;
			if (exclude?.length) {
				const regex = new RegExp(`^(?!${exclude.join("|")})`);
				commands = commands.filter(command => regex.test(command));
				tabs = tabs.filter(tab => commands.find(command => command.startsWith(tab.prefix)));
			}
			if (!commands.length) return;

			const domain = Matched.domain;
			const active = tabs.find(tab => tab.key === this.route) ?? tabs[0];

			let tabStr = "";
			let panelStr = "";
			for (let index = 0; index < tabs.length; index++) {
				const { title, key, prefix } = tabs[index];

				const curCommands = commands.filter(command => command.startsWith(prefix));
				const curLen = curCommands.length;
				if (!curLen) continue;

				const isActive = key === active.key;
				tabStr += `
                    <a
                        class="nav-link${isActive ? " active" : ""}"
                        id="${key}-tab"
                        aria-controls="${key}"
                        aria-selected="${isActive}"
                        data-bs-toggle="pill"
                        href="#${key}"
                        role="tab"
                    >
                        ${title}设置
                    </a>`;
				panelStr += `
                    <div
                        class="tab-pane fade${isActive ? " show active" : ""}"
                        id="${key}"
                        aria-labelledby="${key}-tab"
                        role="tabpanel"
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

			if (!tabStr || !panelStr) return;
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
				const _DOC = iframe.contentWindow.document;

				_DOC.querySelector("head").insertAdjacentHTML(
					"beforeend",
					`<link
                        href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css"
                        rel="stylesheet"
                    >
                    <style>${this.style}</style>
                    <base target="_blank">`
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
                                            href="https://sleazyfork.org/scripts/435360"
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
					_DOC.querySelector("#openModal").click();
				};
				GM_registerMenuCommand("控制面板", openModal, "s");
				_DOC.querySelector("#controlPanel").addEventListener("hidden.bs.modal", toggleIframe);
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

            --x-line-h: 22px;

            --x-thumb-w: 190px;
            --x-cover-w: 295px;

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
        .x-title {
            line-height: var(--x-line-h) !important;
        }
        .x-matched {
            font-weight: bold;
            color: var(--x-blue);
        }
        .x-player {
            position: relative;
            overflow: hidden;
            display: block;
            cursor: pointer;
        }
        .x-player::after {
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
            opacity: .85;
            background-image: url(${GM_getResourceURL("play")});
            background-size: 40px;
        }
        .x-player:hover::after {
            background-color: rgba(0, 0, 0, 0);
        }
        .x-player img {
            filter: none !important;
        }
        `;

		// G_DARK
		globalDark = (css = "", dark = "") => {
			if (this.G_DARK) css += dark;
			if (css) GM_addStyle(css.includes("var(--x-") ? `${this.variables}${css}` : css);
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

		// L_MIT
		listMovieImgType = (node, condition) => {
			const img = node.querySelector("img");
			if (!this.L_MIT || !img) return;

			node.classList.add("x-cover");
			img.loading = "lazy";
			const { src = "" } = img;
			img.src = condition.find(({ regex }) => regex.test(src))?.replace(src);
		};
		// L_MTL, L_MTH
		listMovieTitle = () => {
			let num = parseInt(this.L_MTL ?? 0, 10);
			if (this.L_MTH && num < 1) num = 1;

			GM_addStyle(`
			.x-title {
			    -webkit-line-clamp: ${num <= 0 ? "unset" : num};
			    ${this.L_MTH ? `height: calc(var(--x-line-h) * ${num}) !important;` : ""}
			}
			`);
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
				prefill: true,
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

		// M_IMG
		movieImg = async ({ code }, start) => {
			if (!this.M_IMG) return;

			start && start();
			let img = Store.getDetail(code)?.img;
			if (!img) {
				img = await Apis.movieImg(code);
				if (img) Store.upDetail(code, { img });
			}
			return img;
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
		// M_PLAYER
		moviePlayer = async ({ code }, start) => {
			if (!this.M_PLAYER) return;

			start && start();
			let player = Store.getDetail(code)?.player;
			if (!player) {
				player = await Apis.moviePlayer(code);
				if (player) Store.upDetail(code, { player });
			}
			return player;
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
		// M_SUB
		movieSub = (magnets, start) => {
			if (!this.M_SUB) return magnets;

			start && start();
			const regex = /[A-Z]+-\d+-C/;
			return magnets.map(item => {
				item.zh = item.zh && !regex.test(item.name);
				return item;
			});
		};
		// M_SORT
		movieSort = (magnets, start) => {
			if (!this.M_SORT) return magnets;

			start && start();
			return magnets.length <= 1
				? magnets
				: magnets.sort((pre, next) => {
						if (pre.zh === next.zh) {
							if (pre.bytes === next.bytes) return next.date - pre.date;
							return next.bytes - pre.bytes;
						} else {
							return pre.zh > next.zh ? -1 : 1;
						}
				  });
		};
		// M_MAGNET
		movieMagnet = async ({ code }, start) => {
			if (!this.M_MAGNET) return;

			start && start();
			let magnet = Store.getDetail(code)?.magnet;
			if (!magnet?.length) {
				magnet = unique(await Apis.movieMagnet(code), "link");
				if (magnet?.length) Store.upDetail(code, { magnet });
			}
			return magnet;
		};

		// D_MATCH
		driveMatch = async ({ code, res }, start) => {
			if (!this.D_MATCH) return;

			start && start();
			code = code.toUpperCase();
			const { prefix, regex } = codeParse(code);

			if (res === "list") {
				res = Store.getDetail(code)?.res;
				if (!res?.length) {
					const RESOURCE = GM_getValue("RESOURCE", []);
					let item = RESOURCE.find(item => item.prefix === prefix);
					if (!item) {
						item = { prefix, res: await Apis.searchVideo(prefix) };
						RESOURCE.push(item);
						GM_setValue("RESOURCE", RESOURCE);
					}
					res = await this.driveMatch({ ...item, code });
				}
			} else {
				let _res = res ?? (await Apis.searchVideo(prefix));
				if (_res?.length) {
					_res = _res.filter(({ n }) => regex.test(n));
				}
				if (!res) Store.upDetail(code, { res: _res });
				res = _res;
			}

			return res;
		};
		// D_CID
		driveCid = async () => {
			let cid = this.D_CID;
			if (/^\$\{.+\}$/.test(cid)) {
				cid = cid.replace(/\$|\{|\}/g, "").trim();
				const res = await Apis.getFile();
				cid = res.find(({ n }) => n === cid)?.cid ?? "";
			}
			return cid;
		};
		// D_VERIFY
		driveVerify = async ({ code, cid = "" }) => {
			let verify = this.D_VERIFY <= 0;

			for (let idx = 0; idx < this.D_VERIFY; idx++) {
				await delay(1);

				let res = await Apis.getVideo(cid);
				res = await this.driveMatch({ code, res });

				res = res.filter(({ t }) => t.startsWith(getDate()));
				if (!res.length) continue;

				const fids = (Store.getDetail(code)?.res ?? []).map(({ fid }) => fid);
				res = res.filter(({ fid }) => !fids.includes(fid));
				if (!res.length) continue;

				verify = res;
				break;
			}

			return verify;
		};
		// D_RENAME
		driveRename = ({ cid, res, zh, code, title }) => {
			let file_name = this.D_RENAME?.trim();
			if (!file_name) return;

			code = code.toUpperCase();
			file_name = file_name
				.replace(/\$\{字幕\}/g, zh ? "【中文字幕】" : "")
				.replace(/\$\{番号\}/g, code)
				.replace(/\$\{标题\}/g, title);

			if (!codeParse(code).regex.test(file_name)) file_name = `${code} - ${file_name}`;

			res = res
				.filter(item => item.ico)
				.map(item => {
					item.file_name = `${file_name}.${item.ico}`;
					return item;
				});

			unique(res.map(item => item.cid).filter(item => item !== cid)).forEach(fid => res.push({ fid, file_name }));

			return Apis.driveRename(res);
		};
		// offline
		driveOffline = async (e, { magnets, code, title }) => {
			const { target } = e;
			const { magnet: type } = target.dataset;
			if (!type) return;

			e.preventDefault();
			e.stopPropagation();

			const { classList } = target;
			if (classList.contains("active")) return;

			classList.add("active");
			const originText = target.textContent;
			target.textContent = "请求中...";

			const wp_path_id = await this.driveCid();

			if (type === "all") {
				const warnMsg = { title: "一键离线任务失败", image: "warn" };
				const successMsg = { title: "一键离线任务成功", image: "success", timeout: 3000 };

				const magnetLen = magnets.length;

				for (let index = 0; index < magnetLen; index++) {
					const sign = await Apis.getSign();
					if (!sign) break;

					const isLast = index + 1 === magnetLen;
					const { link: url, zh } = magnets[index];

					let res = await Apis.addTaskUrl({ url, wp_path_id, ...sign });
					if (!res?.state) {
						if (res.errcode === 911) {
							notify({ title: "一键离线任务中断", text: res.error_msg, image: "warn", highlight: false });
							break;
						}
						if (!isLast) continue;
						notify(warnMsg);
						break;
					}

					const cid = wp_path_id;

					res = await this.driveVerify({ code, cid });
					if (!res) {
						if (!isLast) continue;
						notify(warnMsg);
						break;
					}

					if (res?.length) {
						successMsg.text = "点击跳转目录";
						successMsg.clickUrl = `https://115.com/?cid=${res[0].cid}&offset=0&mode=wangpan`;
						await this.driveRename({ cid, res, zh, code, title });
					}

					notify(successMsg);
					break;
				}
			} else if (type) {
				const url = type;
				const res = await Apis.addTaskUrl({ url, wp_path_id });
				if (res) {
					notify({
						title: `离线任务添加${res.state ? "成功" : "失败"}`,
						text: res.error_msg ?? "",
						image: res.state ? "info" : "warn",
						highlight: false,
					});
				}
			}

			classList.remove("active");
			target.textContent = originText;
		};
	}

	// javbus
	class JavBus extends Common {
		constructor() {
			super();
			return super.init();
		}

		excludeMenu = [];
		routes = {
			list: /^\/((uncensored|uncensored\/)?(page\/\d+)?$)|((uncensored\/)?((search|searchstar|actresses|genre|star|studio|label|series|director|member)+\/)|actresses(\/\d+)?)+/i,
			genre: /^\/(uncensored\/)?genre$/i,
			forum: /^\/forum\//i,
			movie: /^\/[\w]+(-|_)?[\d]*.*$/i,
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
            line-height: var(--x-line-h) !important;
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
		list = {
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
                    height: var(--x-line-h) !important;
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
				this.listMovieTitle();
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

				const isStarDetail = /^\/(uncensored\/)?star\/\w+/i.test(location.pathname);

				const _waterfall = waterfall.cloneNode(true);
				_waterfall.removeAttribute("style");
				_waterfall.setAttribute("class", "x-show");
				const items = this.modifyItem(_waterfall);

				const itemsLen = items?.length;
				if (itemsLen) {
					_waterfall.innerHTML = "";

					for (let index = 0; index < itemsLen; index++) {
						if (isStarDetail && !index) continue;
						_waterfall.appendChild(items[index]);
					}

					_waterfall.addEventListener("click", e => {
						const { target } = e;
						if (!target.classList.contains("x-player")) return;

						e.preventDefault();
						e.stopPropagation();

						GM_openInTab(`${this.pcUrl}${target.dataset.code}`, { setParent: true, active: true });
					});
				}
				waterfall.parentElement.replaceChild(_waterfall, waterfall);

				const infScroll = this.listScroll(_waterfall, ".item", "#next");
				if (!infScroll) return DOC.querySelector(".text-center.hidden-xs")?.classList.add("x-show");

				infScroll?.on("request", async (_, fetchPromise) => {
					const { body } = await fetchPromise.then();
					if (!body) return;

					let items = this.modifyItem(body);
					if (isStarDetail) [_, ...items] = items;
					infScroll.appendItems(items);
					infScroll.options.outlayer.appended(items);
				});
			},
			modifyItem(container) {
				const items = container.querySelectorAll(".item");
				for (const item of items) {
					item.removeAttribute("style");
					item.setAttribute("class", "item");
					this._listMovieImgType(item);
					this.modifyAvatarBox(item);
					this.modifyMovieBox(item);
				}
				this._driveMatch(container);
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
			async _driveMatch(node = DOC) {
				const items = node.querySelectorAll(".movie-box");
				for (const item of items) {
					const code = item.querySelector("date")?.textContent?.trim();
					if (!code) continue;

					const res = await this.driveMatch({ code, res: "list" });
					if (!res?.length) continue;

					const frame = item.querySelector(".photo-frame");
					frame.classList.add("x-player");
					frame.setAttribute("title", "点击播放");
					frame.setAttribute("data-code", res[0].pc);
					item.querySelector(".x-title").classList.add("x-matched");
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
				this.globalDark(`${this.style}${style}`);
			},
			contentLoaded() {
				this._globalSearch();
			},
		};
		movie = {
			params: {},
			magnets: null,

			docStart() {
				const style = `
                #mag-submit-show,
                #mag-submit,
                #magnet-table,
				h4[style="position:relative"],
				h4[style="position:relative"] + .row,
                .info span.glyphicon-info-sign {
				    display: none !important;
				}
                html {
                    padding-right: 0 !important;
                }
                @media (min-width: 1270px) {
				    .container { width: 1270px; }
				}
                .container {
				    margin-bottom: 40px;
				}
                .row.movie {
                    padding: 0 !important;
                }
                #magneturlpost + .movie {
                    padding: 10px !important;
                    margin-top: 20px !important;
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
                .info p {
                    line-height: var(--x-line-h) !important;
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
                .x-ml {
                    margin-left: 10px;
                }
                .x-mr {
                    margin-right: 10px;
                }
                .x-grass-img {
                    object-fit: cover;
                }
                .x-grass-mask,
                .x-contain {
                    position: absolute;
                    width: 100% !important;
                    height: 100% !important;
                    top: 0;
                    left: 0;
                }
                .x-grass-mask {
                    backdrop-filter: blur(50px);
                }
                .x-contain {
                    opacity: 0;
                    object-fit: contain;
                    z-index: -1;
                }
                .x-contain.x-in {
                    z-index: 9 !important;
                }
                .mfp-img {
                    max-height: unset !important;
                }
                .btn-group button {
                    border-width: .5px !important;
                }
                .x-res * {
                    color: #CC0000 !important;
                }
                .x-table {
                    margin: 0 !important;
                }
                .x-caption {
                    display: flex;
                    align-items: center;
                }
                .x-caption .label {
                    position: unset !important;
                }
                .x-table tr {
                    table-layout: fixed;
                    display: table;
                    width: 100%;
                }
                .x-table tr > * {
                    vertical-align: middle !important;
                    border-left: none !important;
				}
                .x-table tr > *:first-child {
                    width: 50px;
                }
                .x-table tr > *:nth-child(2) {
                    width: 33.3%;
                }
                .x-table tr > *:last-child,
                .x-table tfoot tr > th:not(:nth-child(3)) {
                    border-right: none !important;
                }
                .x-table tbody {
                    display: block;
                    max-height: calc(37px * 10 - 1px);
                    overflow: overlay;
                    table-layout: fixed;
                }
                .x-table tbody tr > * {
                    border-top: none !important;
                }
                .x-table tbody tr:last-child > *,
                .x-table tfoot tr > * {
                    border-bottom: none !important;
                }
                `;
				const dmStyle = `
                .movie,
                .btn-group button[disabled],
                .star-box-up li,
                .table-striped > tbody > tr:nth-of-type(odd) {
                    background: var(--x-sub-bgc) !important;
                }
                .btn-group button.active,
                .x-offline.active {
                    background: var(--x-bgc) !important;
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
				this._globalSearch();
				this._globalClick();

				this.params = this.getParams();

				addCopyTarget("h3", { title: "复制标题" });

				this.initSwitch();
				this.updateSwitch({ key: "img", title: "预览大图" });
				this.updateSwitch({ key: "video", title: "预览视频" });
				this.updateSwitch({ key: "player", title: "在线播放", type: "link" });

				this._movieTitle();
				addCopyTarget("span[style='color:#CC0000;']", { title: "复制番号" });
				this._movieStar();

				this._driveMatch();
				DOC.querySelector(".x-offline")?.addEventListener("click", e => this._driveOffline(e));

				const tableObs = new MutationObserver((_, obs) => {
					obs.disconnect();
					this.refactorTable();
				});
				tableObs.observe(DOC.querySelector("#movie-loading"), { attributes: true, attributeFilter: ["style"] });

				this.modifyMovieBox();
			},
			getParams() {
				const info = DOC.querySelector(".info");
				const { textContent } = info;
				return {
					title: DOC.querySelector("h3").textContent,
					code: info.querySelector("span[style='color:#CC0000;']").textContent,
					date: info.querySelector("p:nth-child(2)").childNodes[1].textContent.trim(),
					studio: textContent.match(/(?<=製作商: ).+/g)?.pop(0),
					star: !/暫無出演者資訊/g.test(textContent),
				};
			},
			initSwitch() {
				const bigImage = DOC.querySelector(".bigImage");

				const img = bigImage.querySelector("img");
				img.classList.add("x-grass-img");

				bigImage.insertAdjacentHTML(
					"beforeend",
					`<div class="x-grass-mask"></div><img src="${img.src}" id="x-switch-cover" class="x-contain x-in">`
				);
				bigImage.classList.add("x-in");

				const info = DOC.querySelector(".info");
				info.insertAdjacentHTML(
					"afterbegin",
					`<div class="btn-group btn-group-justified mb10" hidden id="x-switch" role="group">
                        <div class="btn-group btn-group-sm" role="group">
                            <button type="button" class="btn btn-default active" for="x-switch-cover">封面</button>
                        </div>
                    </div>`
				);

				const switcher = info.querySelector("#x-switch");
				switcher.addEventListener("click", ({ target }) => {
					const id = target.getAttribute("for");
					const { classList } = target;

					if (!id || classList.contains("active")) return;

					switcher.querySelector("button.active").classList.toggle("active");
					classList.toggle("active");

					bigImage.querySelector(".x-contain.x-in").classList.toggle("x-in");
					const targetNode = bigImage.querySelector(`#${id}`);
					targetNode.classList.toggle("x-in");

					bigImage.querySelectorAll("video.x-contain:not(.x-in)").forEach(v => v?.pause());

					const { nodeName, src } = targetNode;
					if (nodeName === "VIDEO") {
						targetNode.focus();
						return targetNode.play();
					}
					bigImage.querySelector(".x-grass-img").src = src;
					bigImage.href = src;
				});
			},
			async updateSwitch({ key, title, type }) {
				const id = `x-switch-${key}`;
				if (!type) type = key;
				const switcher = DOC.querySelector("#x-switch");

				const start = () => {
					if (!switcher.classList.contains("x-show")) switcher.classList.add("x-show");
					switcher.insertAdjacentHTML(
						"beforeend",
						`<div class="btn-group btn-group-sm" role="group" title="查询中...">
				            <button type="button" class="btn btn-default" for="${id}" disabled>${title}</button>
				        </div>`
					);
				};

				const src = await this[`movie${key[0].toUpperCase()}${key.slice(1)}`](this.params, start);
				const node = switcher.querySelector(`button[for="${id}"]`);
				if (!node) return;

				const nodeParent = node.parentNode;
				if (!src) return nodeParent.setAttribute("title", "暂无资源");

				nodeParent.removeAttribute("title");
				node.removeAttribute("disabled");

				if (type === "link") {
					node.setAttribute("title", "跳转链接");
					node.addEventListener("click", e => {
						e.preventDefault();
						e.stopPropagation();
						GM_openInTab(src, { setParent: true, active: true });
					});
				} else {
					const item = DOC.create(type, { src, id, class: "x-contain" });

					if (type === "video") {
						item.controls = true;
						item.currentTime = 3;
						item.muted = true;
						item.preload = "metadata";
						item.addEventListener("click", e => {
							e.preventDefault();
							e.stopPropagation();
							const { target: video } = e;
							video.paused ? video.play() : video.pause();
						});
					}

					DOC.querySelector(".bigImage").insertAdjacentElement("beforeend", item);
				}
			},
			async _movieTitle() {
				const start = () => {
					DOC.querySelector("#x-switch").insertAdjacentHTML(
						"afterend",
						`<p><span class="header">机翻标题: </span><span class="x-transTitle">查询中...</span></p>`
					);
				};

				const transTitle = await this.movieTitle(this.params, start);
				const transTitleNode = DOC.querySelector(".x-transTitle");
				if (transTitleNode) transTitleNode.textContent = transTitle ?? "查询失败";
			},
			async _movieStar() {
				const start = () => {
					const starShow = DOC.querySelector("p.star-show");
					starShow.nextElementSibling.nextSibling.remove();
					starShow.insertAdjacentHTML("afterend", `<p class="x-star">查询中...</p>`);
				};

				const star = await this.movieStar(this.params, start);
				const starNode = DOC.querySelector(".x-star");
				if (!starNode) return;

				starNode.innerHTML = !star?.length
					? "暂无演员数据"
					: star.reduce(
							(acc, cur) =>
								`${acc}<span class="genre"><label><a href="/search/${cur}">${cur}</a></label></span>`,
							""
					  );
			},
			async _driveMatch() {
				const start = () => {
					if (DOC.querySelector(".x-res")) return;

					GM_addStyle(`tbody a[data-magnet] { display: inline !important; }`);
					DOC.querySelector(".info").insertAdjacentHTML(
						"beforeend",
						`<p class="header">网盘资源:</p><p class="x-res">查询中...</p><button type="button" class="btn btn-default btn-sm btn-block x-offline" data-magnet="all">一键离线</button>`
					);
				};

				const res = await this.driveMatch(this.params, start);
				const resNode = DOC.querySelector(".x-res");
				if (!resNode) return;

				resNode.innerHTML = !res?.length
					? "暂无网盘资源"
					: res.reduce(
							(acc, { pc, t, n }) =>
								`${acc}<div class="x-line"><a href="${this.pcUrl}${pc}" target="_blank" title="${t} / ${n}">${n}</a></div>`,
							""
					  );
			},
			refactorTable() {
				const table = DOC.querySelector("#magnet-table");
				table.parentElement.innerHTML = `
				<table class="table table-striped table-hover table-bordered x-table">
                    <caption><div class="x-caption">重构的表格</div></caption>
				    <thead>
				        <tr>
				            <th scope="col">#</th>
				            <th scope="col">磁力名称</th>
				            <th scope="col">档案大小</th>
				            <th scope="col" class="text-center">分享日期</th>
				            <th scope="col" class="text-center">来源</th>
				            <th scope="col" class="text-center">字幕</th>
				            <th scope="col">操作</th>
				        </tr>
				    </thead>
				    <tbody>
                        <tr><th scope="row" colspan="7" class="text-center text-muted">暂无数据</th></tr>
                    </tbody>
				    <tfoot>
				        <tr>
                            <th scope="row"></th>
                            <th></th>
				            <th colspan="4" class="text-right">总数</th>
				            <td>0</td>
				        </tr>
				    </tfoot>
				</table>
				`;

				DOC.querySelector(".x-table tbody").addEventListener("click", e => {
					!handleCopyTxt(e, "复制成功") && this._driveOffline(e);
				});

				const magnets = [];
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
						bytes: transToBytes(_size),
						date: date.textContent.trim(),
					});
				}

				this.refactorTd(magnets);
				this._movieMagnet();
			},
			async _movieMagnet() {
				const start = () => {
					DOC.querySelector(".x-caption").insertAdjacentHTML(
						"beforeend",
						`<span class="label label-success"><span class="glyphicon glyphicon-ok-sign" aria-hidden="true"></span> 磁力搜索</span><span class="label label-success"><span class="glyphicon glyphicon-ok-sign" aria-hidden="true"></span> 自动去重</span>`
					);
				};

				const magnets = await this.movieMagnet(this.params, start);
				if (magnets?.length) this.refactorTd(magnets);
			},
			refactorTd(magnets) {
				const table = DOC.querySelector(".x-table");
				const caption = table.querySelector(".x-caption");

				let subStart = () => {
					caption.insertAdjacentHTML(
						"beforeend",
						`<span class="label label-success"><span class="glyphicon glyphicon-ok-sign" aria-hidden="true"></span> 字幕筛选</span>`
					);
				};
				let sortStart = () => {
					caption.insertAdjacentHTML(
						"beforeend",
						`<span class="label label-success"><span class="glyphicon glyphicon-ok-sign" aria-hidden="true"></span> 磁力排序</span>`
					);
				};

				if (this.magnets) {
					subStart = null;
					sortStart = null;
					magnets = unique([...this.magnets, ...magnets], "link");
				}

				table.querySelector("tfoot td").textContent = magnets.length;

				magnets = this.movieSub(magnets, subStart);
				magnets = this.movieSort(magnets, sortStart);
				this.magnets = magnets;

				magnets = this.createTd(magnets);
				if (!magnets) return;
				table.querySelector("tbody").innerHTML = magnets;

				if (!subStart || !sortStart) return;
				const node = table.querySelector("thead th:last-child");
				node.innerHTML = `<a href="javascript:void(0);" title="复制所有磁力链接">全部复制</a>`;
				node.querySelector("a").addEventListener("click", e => {
					e.preventDefault();
					e.stopPropagation();

					GM_setClipboard(this.magnets.map(({ link }) => link).join("\n"));
					const { target } = e;
					target.textContent = "复制成功";

					const timer = setTimeout(() => {
						target.textContent = "全部复制";
						clearTimeout(timer);
					}, 300);
				});
			},
			createTd(magnets) {
				if (!magnets.length) return;
				return magnets.reduce(
					(acc, { name, link, size, date, from, href, zh }, index) => `
                    ${acc}
                    <tr>
                        <th scope="row">${index + 1}</th>
                        <th class="x-line" title="${name}">
                            <a href="${link}">${name}</a>
                        </th>
                        <td>${size}</td>
                        <td class="text-center">${date}</td>
                        <td class="text-center">
                            <a${href ? ` href="${href}" target="_blank" title="查看详情"` : ""}>
                                <code>${from ?? Matched.domain}</code>
                            </a>
                        </td>
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
                                链接复制
                            </a>
                            <a
                                hidden
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
			async _driveOffline(e) {
				await this.driveOffline(e, { ...this.params, magnets: this.magnets });
				await delay(1);
				this._driveMatch();
			},
		};
	}

	// 115
	class Drive115 {
		contentLoaded() {
			window.focus();
			DOC.querySelector(".bottom button").addEventListener("click", () => {
				const interval = setInterval(() => {
					if (DOC.querySelector(".vcode-hint").getAttribute("style").indexOf("none") !== -1) {
						clearTimer();
						window.open("", "_self");
						window.close();
					}
				}, 300);

				const timeout = setTimeout(() => clearTimer(), 600);

				const clearTimer = () => {
					clearInterval(interval);
					clearTimeout(timeout);
				};
			});
		}
	}

	const Process = eval(`new ${Matched.domain}()`);
	Process.docStart && Process.docStart();
	Process.contentLoaded && DOC.addEventListener("DOMContentLoaded", () => Process.contentLoaded());
	Process.load && window.addEventListener("load", () => Process.load());
})();
