window.__ModuleLoader__.load({
	id: "dsh-cost-slip",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const { jsx, jsxs } = require("react/jsx-runtime");
		const { useState, useRef, useEffect } = require("react");
		const { createPortal } = require("react-dom");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		// ── 样式 ────────────────────────────────────────────────────────────
		// 胶囊部分与输入框底部现有统计胶囊同字号、同颜色；弹窗部分照搬 DSH 原生
		// stat-dialog 的尺寸、圆角、阴影和栅格，保证和「Token 用量」弹窗一致。
		const css = [
			".dshSessionCost_anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}",
			".dshSessionCost_pill{box-sizing:border-box;max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex;cursor:pointer;border-radius:var(--dsw-radius-sm)}",
			".dshSessionCost_pill:hover,.dshSessionCost_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
			".dshSessionCost_pill svg{flex:none;width:14px;height:14px}",
			".dshSessionCost_label{text-overflow:ellipsis;min-width:0;overflow:hidden}",
			".dshSessionCost_panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1,#f8f9fa);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}",
			".dshSessionCost_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}",
			".dshSessionCost_titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}",
			".dshSessionCost_titleValue{font-variant-numeric:tabular-nums}",
			".dshSessionCost_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}",
			".dshSessionCost_details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}",
			".dshSessionCost_details dt,.dshSessionCost_details dd{min-width:0;margin:0}",
			".dshSessionCost_details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}",
			".dshSessionCost_note{color:var(--dsw-alias-label-tertiary);margin:10px 0 0;font-size:11px;line-height:16px}",
			".dshSessionCost_divider{border-top:.5px solid var(--dsw-alias-border-l2);margin:12px 0 10px}",
			".dshSessionCost_sectionTitle{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin:0 0 6px;font-weight:400}"
		].join("");
		const tagId = "dsh-cost-slip/SessionCostPill.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-cost-slip";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		const styles = {
			anchor: "dshSessionCost_anchor",
			pill: "dshSessionCost_pill",
			label: "dshSessionCost_label",
			panel: "dshSessionCost_panel",
			title: "dshSessionCost_title",
			titleLabel: "dshSessionCost_titleLabel",
			titleValue: "dshSessionCost_titleValue",
			titleRule: "dshSessionCost_titleRule",
			details: "dshSessionCost_details",
			note: "dshSessionCost_note",
			divider: "dshSessionCost_divider",
			sectionTitle: "dshSessionCost_sectionTitle"
		};

		/** 弹窗未定位时的测量样式：不可见但参与布局。 */
		const MEASURE_STYLE = {
			visibility: "hidden",
			left: 0,
			top: 0
		};

		// ── 文案 ────────────────────────────────────────────────────────────
		const zh = {
			"pill.label": "费用 {cost}",
			"pill.aria": "费用 {cost}，查看明细",
			"dialog.title": "费用",
			"dialog.cacheHit": "缓存命中",
			"dialog.cacheMiss": "未缓存输入",
			"dialog.cacheWrite": "缓存写入",
			"dialog.output": "输出",
			"dialog.note": "按各条回复当时的峰谷价估算，以官方账单为准。",
			"balance.title": "账户余额",
			"balance.recharge": "充值余额",
			"balance.bonus": "赠金余额",
			"balance.loading": "读取中…",
			"balance.unavailable": "暂不可用",
			"balance.signedOut": "登录后查看"
		};
		const en = {
			"pill.label": "Cost {cost}",
			"pill.aria": "Cost {cost}, view details",
			"dialog.title": "Cost",
			"dialog.cacheHit": "Cache hit",
			"dialog.cacheMiss": "Uncached input",
			"dialog.cacheWrite": "Cache write",
			"dialog.output": "Output",
			"dialog.note": "Estimated at each reply's peak/off-peak price. Official billing prevails.",
			"balance.title": "Account balance",
			"balance.recharge": "Topped-up balance",
			"balance.bonus": "Granted balance",
			"balance.loading": "Loading…",
			"balance.unavailable": "Unavailable",
			"balance.signedOut": "Sign in to view"
		};

		// ── 格式化 ──────────────────────────────────────────────────────────
		/**
		 * 微元转人民币文本。大于 1 分显示两位，小钱显示四位，再小给下限。
		 * @param {number} micros - 微元（1e-6 元）。
		 * @param {boolean} zeroAsZero - 为 0 时是否显示 ¥0（标题/明细用）。
		 * @returns {string}
		 */
		function formatCost(micros, zeroAsZero = false) {
			const value = Number(micros) / 1e6;
			if (!Number.isFinite(value) || value <= 0) return zeroAsZero ? "¥0" : "¥<0.0001";
			if (value >= 0.01) return "¥" + value.toFixed(2);
			if (value >= 0.0001) return "¥" + value.toFixed(4);
			return "¥<0.0001";
		}

		/**
		 * 明细用的精确金额：至少两位小数，常规四位（再小五位），并去掉多余的 0。
		 * 四位是为了让各行相加与标题合计严格对上，不像两位/三位那样出现「分项加起来多一分」。
		 * @param {number} micros - 微元（1e-6 元）。
		 * @returns {string}
		 */
		function formatCostPrecise(micros) {
			const value = Number(micros) / 1e6;
			if (!Number.isFinite(value) || value <= 0) return "¥0";
			if (value < 0.0001) return "¥<0.0001";
			let text = (value >= 0.001 ? value.toFixed(4) : value.toFixed(5)).replace(/0+$/, "").replace(/\.$/, "");
			const dot = text.indexOf(".");
			if (dot === -1) text += ".00";
			else if (text.length - dot - 1 < 2) text = text.padEnd(dot + 3, "0");
			return "¥" + text;
		}

		/**
		 * 精确 token 数，带千分位：45,321,728。
		 * @param {number} value - token 数。
		 * @returns {string}
		 */
		function formatTokenCount(value) {
			const count = Math.round(Number(value) || 0);
			return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}

		/** 最近一次读到的余额，弹窗重开时先显示旧值再刷新。 */
		let balanceCache = null;

		/**
		 * 单个钱包金额的显示规则，与账号设置页一致：0 显示 ¥0.00，
		 * 不足一分显示 <¥0.01，正数向下取两位并加千分位。
		 * @param {string} amount - 账号接口返回的十进制字符串。
		 * @param {string} currency - CNY / USD 等。
		 * @returns {string}
		 */
		function formatBalanceAmount(amount, currency) {
			const symbol = currency === "CNY" ? "¥" : currency === "USD" ? "$" : String(currency || "CNY") + " ";
			const value = Number(amount);
			if (!Number.isFinite(value)) return symbol + String(amount ?? "");
			const fixed = (number) => {
				const text = (Math.floor(number * 100) / 100).toFixed(2);
				const [integer, fraction] = text.split(".");
				return Number(integer).toLocaleString("en-US") + "." + fraction;
			};
			if (value === 0) return symbol + "0.00";
			if (value < 0) {
				const abs = Math.abs(value);
				return "-" + symbol + (abs < 0.01 ? "0.01" : fixed(abs));
			}
			if (value < 0.01) return "<" + symbol + "0.01";
			return symbol + fixed(value);
		}

		/**
		 * 一组钱包的显示文本；多币种并排，全为 0 时显示 ¥0.00。
		 * @param {Array<{balance: string, currency: string}>} wallets - 余额钱包。
		 * @returns {string}
		 */
		function formatWallets(wallets) {
			const list = (Array.isArray(wallets) ? wallets : []).filter((wallet) => wallet && Number(wallet.balance) > 0);
			if (list.length === 0) {
				const currency = Array.isArray(wallets) && wallets[0] && wallets[0].currency ? wallets[0].currency : "CNY";
				return formatBalanceAmount("0", currency);
			}
			return list.map((wallet) => formatBalanceAmount(wallet.balance, wallet.currency)).join("  ");
		}

		/**
		 * 费用图标：用户设计的收据造型；描边跟随 currentColor，尺寸由调用处决定。
		 * @param {number} size - 渲染边长（像素）。
		 * @returns {object} 收据图标元素。
		 */
		function receiptIcon(size) {
			return jsxs("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": true,
				strokeWidth: 1,
				children: [
					jsx("path", { d: "M5 6H10", stroke: "currentColor" }),
					jsx("path", { d: "M5 9H11", stroke: "currentColor" }),
					jsx("path", {
						d: "M11.5863439,14.1295158 L11.5830868,14.1246301 C11.0425067,13.3137601 9.87388821,13.2513342 9.25,14 C8.59947924,14.7806249 7.40052076,14.7806249 6.75,14 C6.12611179,13.2513342 4.95749329,13.3137601 4.41691324,14.1246301 L4.41365611,14.1295158 C4.04344449,14.6848333 3.2545311,14.7552621 2.79180776,14.2743035 C2.5,13.970996 2.5,13.4910841 2.5,12.5312602 L2.5,5.1 C2.5,3.83988186 2.5,3.20982279 2.74523532,2.72852138 C2.96095041,2.30515667 3.30515667,1.96095041 3.72852138,1.74523532 C4.20982279,1.5 4.83988186,1.5 6.1,1.5 L9.9,1.5 C11.1601181,1.5 11.7901772,1.5 12.2714786,1.74523532 C12.6948433,1.96095041 13.0390496,2.30515667 13.2547647,2.72852138 C13.5,3.20982279 13.5,3.83988186 13.5,5.1 L13.5,12.5312602 C13.5,13.4910841 13.5,13.970996 13.2081922,14.2743035 C12.7454689,14.7552621 11.9565555,14.6848333 11.5863439,14.1295158 Z",
						stroke: "currentColor"
					})
				]
			});
		}

		// ── 组件 ────────────────────────────────────────────────────────────
		/**
		 * 输入框底部统计行里的费用：默认接在缓存命中后面，点击弹出费用明细。
		 * @param {{useProjection: Function, t: Function}} props - 插槽框架注入的钩子与译文。
		 * @returns {object | null} 费用胶囊；没有可计价回复时不渲染。
		 */
		function SessionCostPill({ useProjection, t, readBalance }) {
			const view = useProjection("sessionCost");
			const [open, setOpen] = useState(false);
			const [balance, setBalance] = useState(() => balanceCache);
			const readBalanceRef = useRef(readBalance);
			readBalanceRef.current = readBalance;
			const rootRef = useRef(null);
			const panelRef = useRef(null);
			const pos = primitives.useAnchoredPosition({
				open,
				anchorRef: rootRef,
				panelRef,
				side: "top",
				gap: 8,
				margin: 12
			});
			primitives.useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);
			useEffect(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [open]);
			useEffect(() => {
				if (!open) return;
				let alive = true;
				const load = () => {
					const read = typeof readBalanceRef.current === "function" ? readBalanceRef.current() : null;
					Promise.resolve(read).then((next) => {
						const value = next && typeof next.status === "string" ? next : { status: "unavailable" };
						balanceCache = value;
						if (alive) setBalance(value);
					}).catch(() => {
						if (alive) setBalance({ status: "unavailable" });
					});
				};
				if (balanceCache === null) setBalance({ status: "loading" });
				load();
				const timer = setInterval(load, 10_000);
				return () => {
					alive = false;
					clearInterval(timer);
				};
			}, [open]);

			if (view === void 0 || view === null || view.samples === 0 || view.totalMicros <= 0) return null;

			const total = formatCostPrecise(view.totalMicros);
			const label = t("pill.label", { cost: formatCost(view.totalMicros) });
			const rows = [];
			const pushRow = (key, name, tokens, micros) => {
				if (tokens <= 0) return;
				rows.push(jsx("dt", { children: name }, key + "-dt"));
				rows.push(jsx("dd", {
					children: `${formatTokenCount(tokens)} tok · ${formatCostPrecise(micros)}`
				}, key + "-dd"));
			};
			pushRow("hit", t("dialog.cacheHit"), view.hitTokens, view.hitMicros);
			pushRow("miss", t("dialog.cacheMiss"), view.missTokens, view.missMicros);
			pushRow("write", t("dialog.cacheWrite"), view.writeTokens, view.writeMicros);
			pushRow("out", t("dialog.output"), view.outTokens, view.outMicros);
			const balanceFallback = balance === null || balance.status === "loading"
				? t("balance.loading")
				: balance.status === "signed-out"
					? t("balance.signedOut")
					: balance.status !== "ready"
						? t("balance.unavailable")
						: null;
			const rechargeText = balanceFallback ?? formatWallets(balance.wallets);
			const bonusText = balanceFallback ?? formatWallets(balance.bonusWallets);

			return jsxs("span", {
				ref: rootRef,
				className: styles.anchor,
				"data-composer-stat": "session-cost",
				children: [
					jsxs("button", {
						type: "button",
						className: styles.pill,
						"aria-haspopup": "dialog",
						"aria-expanded": open,
						"aria-label": t("pill.aria", { cost: formatCost(view.totalMicros) }),
						onClick: () => setOpen(!open),
						children: [
							receiptIcon(14),
							jsx("span", { className: styles.label, children: label })
						]
					}),
					open && createPortal(jsxs("div", {
						ref: panelRef,
						className: styles.panel,
						role: "dialog",
						"aria-label": t("dialog.title"),
						style: pos ?? MEASURE_STYLE,
						children: [
							jsxs("div", {
								className: styles.title,
								children: [
									jsx("span", {
										className: styles.titleLabel,
										children: [receiptIcon(16), t("dialog.title")]
									}),
									jsx("span", {
										className: styles.titleValue,
										children: total
									})
								]
							}),
							jsx("div", {
								className: styles.titleRule,
								"aria-hidden": true
							}),
							jsx("dl", {
								className: styles.details,
								children: rows
							}),
							jsx("p", {
								className: styles.note,
								children: t("dialog.note")
							}),
							jsx("div", {
								className: styles.divider,
								"aria-hidden": true
							}),
							jsx("div", {
								className: styles.sectionTitle,
								children: t("balance.title")
							}),
							jsxs("dl", {
								className: styles.details,
								children: [
									jsx("dt", { children: t("balance.recharge") }),
									jsx("dd", { children: rechargeText }),
									jsx("dt", { children: t("balance.bonus") }),
									jsx("dd", { children: bonusText })
								]
							})
						]
					}), document.body)
				]
			});
		}

		// ── 插件入口 ────────────────────────────────────────────────────────
		/** 需要 slots（注册插槽）与 locale（中英文案）。 */
		const inject = ["slots", "locale", "remote", "remote.account"];

		/**
		 * 把费用胶囊注册到输入框底部的统计行，排在 token 用量（usage）后面。
		 * @param {object} ctx - 客户端 Cordis 上下文。
		 */
		function apply(ctx) {
			const namespace = "session-cost";
			ctx.effect(() => ctx.locale.register(namespace, { zh, en }), "session-cost: dictionaries");
			/** 读一次账号余额；失败/未登录都归一成弹窗可显示的状态。 */
			const readBalance = async () => {
				try {
					const version = globalThis.__DSH_BOOT__ && globalThis.__DSH_BOOT__.release && globalThis.__DSH_BOOT__.release.version
						? globalThis.__DSH_BOOT__.release.version
						: "0.2.1-rc.2";
					const account = ctx.remote && ctx.remote.account;
					if (!account || typeof account.getBalance !== "function") return { status: "unavailable" };
					const result = await account.getBalance({
						version,
						locale: ctx.locale.getSnapshot().active,
						timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
					});
					if (!result.ok) return { status: "unavailable" };
					const value = result.value;
					if (value === null) return { status: "signed-out" };
					if (value.status !== "ready") return { status: "unavailable" };
					return {
						status: "ready",
						wallets: Array.isArray(value.value) ? value.value : [],
						bonusWallets: Array.isArray(value.bonusWallets) ? value.bonusWallets : []
					};
				} catch {
					return { status: "unavailable" };
				}
			};
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "session-cost",
				order: 2,
				locale: namespace,
				inject: () => ({ readBalance })
			}, SessionCostPill));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
