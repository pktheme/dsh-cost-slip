/**
 * DeepSeek 官方 API 价目（人民币，元 / 百万 token）。
 *
 * 数据来源与规则（2026-10-18 核对）：
 *   · 官方定价：https://api-docs.deepseek.com/zh-cn/quick_start/pricing
 *   · 2026-08-17 起实行峰谷定价：北京时间周一至周五 9:00–12:00、14:00–18:00 为高峰，
 *     其余时段（含周末、法定节假日全天）为空闲；高峰价 = 空闲价 × 2。
 *   · 2026-09-10 起 Flash 降价：缓存命中 0.05→0.02、未命中 1.5→1、输出 4.5→4。
 *   · V4 Pro 的单价为 Flash 的 3 倍。
 *
 * 要改价格，只改本文件里的 FLASH_TIERS 即可；改完重启 DSH 生效。
 * 法定节假日每 11 月国务院发布次年安排后，记得把下一年的日期补进 HOLIDAY_VALLEYS。
 */

/** 计价单位。 */
export const CURRENCY = "CNY";

/** 高峰时段（北京时间，整点区间，左闭右开）。 */
const PEAK_RANGES = [
	[9, 12],
	[14, 18]
];

/** 峰谷机制生效时刻：北京时间 2026-08-17 00:00。此前全天同价。 */
const PEAK_FROM_MS = Date.UTC(2026, 7, 16, 16, 0, 0);

/** “法定节假日全天谷价”生效时刻：北京时间 2026-09-19 00:00。 */
const HOLIDAY_VALLEY_FROM_MS = Date.UTC(2026, 8, 18, 16, 0, 0);

/**
 * 2026 年放假日期（只列放假的日期；调休上班日都落在周末，本来就按谷价）。
 * 来源：国办发明电〔2025〕7 号。
 */
const HOLIDAY_VALLEYS = new Set([
	"2026-01-01", "2026-01-02", "2026-01-03",
	"2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19",
	"2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
	"2026-04-04", "2026-04-05", "2026-04-06",
	"2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
	"2026-06-19", "2026-06-20", "2026-06-21",
	"2026-09-25", "2026-09-26", "2026-09-27",
	"2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
	"2026-10-05", "2026-10-06", "2026-10-07"
]);

/**
 * Flash 的空闲时段单价（元 / 百万 token）。
 * 数组按时间升序；取第一个早于等于请求时间的档位。
 */
const FLASH_TIERS = [
	{ fromMs: 0, hit: 0.05, miss: 1.5, out: 4.5 },
	{ fromMs: Date.UTC(2026, 8, 9, 16, 0, 0), hit: 0.02, miss: 1, out: 4 }
];

/** V4 Pro 的空闲时段单价（元 / 百万 token），不随 Flash 降价。 */
const PRO_TIERS = [
	{ fromMs: 0, hit: 0.15, miss: 4.5, out: 13.5 }
];

/**
 * 判断某一时刻是否处于高峰时段。
 * @param {number} timeMs - Unix 毫秒时间戳。
 * @returns {boolean} 高峰为 true；周末、法定节假日、峰谷机制生效前均为 false。
 */
export function isPeak(timeMs) {
	if (!Number.isFinite(timeMs) || timeMs < PEAK_FROM_MS) return false;
	// 用 UTC 读“北京时间日历日”：+8h 后直接读 UTC 字段。
	const beijing = new Date(timeMs + 8 * 3600 * 1000);
	const dayOfWeek = beijing.getUTCDay();
	if (dayOfWeek === 0 || dayOfWeek === 6) return false;
	if (timeMs >= HOLIDAY_VALLEY_FROM_MS && HOLIDAY_VALLEYS.has(beijing.toISOString().slice(0, 10))) return false;
	const hour = beijing.getUTCHours();
	return PEAK_RANGES.some(([start, end]) => hour >= start && hour < end);
}

/**
 * 某一时刻、某一模型的生效单价。
 * @param {string} model - 模型 id（如 deepseek-flash、deepseek-v4-pro）。
 * @param {number} timeMs - Unix 毫秒时间戳。
 * @returns {{hit:number, miss:number, out:number, peak:boolean}} 元 / 百万 token。
 */
export function pricesAt(model, timeMs) {
	const tiers = /pro/i.test(String(model ?? "")) ? PRO_TIERS : FLASH_TIERS;
	const tier = tiers.findLast((item) => timeMs >= item.fromMs) ?? tiers[0];
	const factor = isPeak(timeMs) ? 2 : 1;
	return {
		hit: tier.hit * factor,
		miss: tier.miss * factor,
		out: tier.out * factor,
		peak: factor === 2
	};
}
